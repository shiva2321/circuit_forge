import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import {
  Play,
  CheckCheck,
  AlertTriangle,
  Copy,
  Terminal,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  Save,
  X,
  FileCode,
  Cpu,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Info,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  RotateCcw,
  Edit3,
  Clock,
  Settings,
  File,
  PanelLeftClose,
  PanelLeft,
  Bot,
  Eye,
  Columns,
} from 'lucide-react';
import { MarkdownDocViewer } from './MarkdownDocViewer';
import {
  getToolchainStatus,
  getProjectTree,
  readProjectFile,
  writeProjectFile,
  createProjectEntry,
  deleteProjectEntry,
  renameProjectEntry,
  validateCode,
  FileTreeNode,
} from '../services/api';

export function getMonacoLanguage(filePath: string): string {
  const lower = (filePath || '').toLowerCase();
  if (lower.endsWith('.vhd') || lower.endsWith('.vhdl')) return 'vhdl';
  if (lower.endsWith('.v') || lower.endsWith('.sv') || lower.endsWith('.vh')) return 'verilog';
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  if (lower.endsWith('.cpp') || lower.endsWith('.hpp') || lower.endsWith('.cc')) return 'cpp';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.ini') || lower.endsWith('.toml') || lower.endsWith('.cfg')) return 'ini';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.service') || lower.endsWith('.txt') || lower.endsWith('.sdc') || lower.endsWith('.xdc')) return 'plaintext';
  return 'plaintext';
}

export function isDesignRtlFile(filePath: string): boolean {
  const lower = (filePath || '').toLowerCase();
  if (!lower.endsWith('.vhd') && !lower.endsWith('.vhdl') && !lower.endsWith('.v') && !lower.endsWith('.sv')) {
    return false;
  }
  if (
    lower.includes('tb/') ||
    lower.includes('/tb/') ||
    lower.includes('\\tb\\') ||
    lower.includes('_tb.') ||
    lower.includes('_test.') ||
    lower.includes('testbench') ||
    lower.includes('test_')
  ) {
    return false;
  }
  return true;
}

export interface FileItem {
  name: string;
  path: string;
  code: string;
  isDirty?: boolean;
}

export interface CodeEditorProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  onRunLint: (code?: string) => void;
  lintMessages: Array<{ line: number; severity: string; message: string; rule_id: string }>;
  onSynthesizeAndSimulate: (code?: string) => void;
  isLinting?: boolean;
  isSynthesizing?: boolean;
  activeProjectId?: string;
  onSelectProject?: (projectId: string) => void;
  syncStatus?: 'synced' | 'syncing' | 'error';
  isSplitView?: boolean;
  /** Increment this value to force a project tree reload (e.g. after agent materializes new files) */
  reloadVersion?: number;
  targetOpenFilePath?: string;
  topFilePath?: string;
  onTopFileChange?: (path: string) => void;
  isAutosaveEnabled?: boolean;
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'dirty' | 'idle', text?: string) => void;
  onAddToAgentContext?: (item: { type: 'code_range' | 'file'; label: string; data: any }) => void;
}

const DEFAULT_STARTER_FILES: FileItem[] = [
  {
    name: 'full_adder.vhd',
    path: 'src/full_adder.vhd',
    code: `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- 1-Bit Full Adder
entity full_adder is
    port (
        a    : in  std_logic;
        b    : in  std_logic;
        cin  : in  std_logic;
        sum  : out std_logic;
        cout : out std_logic
    );
end full_adder;

architecture gate_level of full_adder is
    signal s1, c1, c2 : std_logic;
begin
    s1   <= a xor b;
    sum  <= s1 xor cin;
    c1   <= a and b;
    c2   <= s1 and cin;
    cout <= c1 or c2;
end gate_level;
`,
  },
  {
    name: 'full_adder_tb.vhd',
    path: 'tb/full_adder_tb.vhd',
    code: `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity full_adder_tb is
end full_adder_tb;

architecture sim of full_adder_tb is
    signal a, b, cin : std_logic := '0';
    signal sum, cout : std_logic;
begin
    dut: entity work.full_adder
        port map (a => a, b => b, cin => cin, sum => sum, cout => cout);

    stim: process
    begin
        a <= '0'; b <= '0'; cin <= '0'; wait for 10 ns;
        a <= '1'; b <= '0'; cin <= '0'; wait for 10 ns;
        a <= '1'; b <= '1'; cin <= '0'; wait for 10 ns;
        a <= '1'; b <= '1'; cin <= '1'; wait for 10 ns;
        wait;
    end process;
end sim;
`,
  },
  {
    name: 'timing.sdc',
    path: 'constraints/timing.sdc',
    code: `# Timing Constraints
create_clock -name clk -period 10.0 [get_ports clk]
set_input_delay 2.0 [all_inputs]
set_output_delay 2.0 [all_outputs]
`,
  },
  {
    name: 'project.json',
    path: 'project.json',
    code: `{\n  "name": "1-Bit Full Adder",\n  "scale": 1,\n  "top_file": "src/full_adder.vhd"\n}\n`,
  },
];

// Recursive File Tree Node Row Component
const FileTreeNodeRow: React.FC<{
  node: FileTreeNode;
  depth: number;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  activeFilePath: string;
  onOpenFile: (node: FileTreeNode) => void;
  onNewEntry: (parentPath: string, isDir: boolean) => void;
  onRename: (node: FileTreeNode) => void;
  onDelete: (node: FileTreeNode) => void;
}> = ({
  node,
  depth,
  expandedFolders,
  toggleFolder,
  activeFilePath,
  onOpenFile,
  onNewEntry,
  onRename,
  onDelete,
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const isActive = activeFilePath === node.path || (activeFilePath.endsWith(node.name) && !node.is_dir);

  const getFileIcon = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.vhd') || lower.endsWith('.vhdl')) {
      return <FileCode className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
    }
    if (lower.endsWith('.sdc') || lower.endsWith('.xdc')) {
      return <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
    }
    if (lower.endsWith('.json')) {
      return <Settings className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />;
    }
    return <File className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
  };

  return (
    <div>
      <div
        className={`group flex items-center justify-between py-1 px-2 rounded-lg cursor-pointer text-xs transition select-none ${
          isActive && !node.is_dir
            ? 'bg-purple-950/80 text-purple-200 font-bold border-l-2 border-purple-500 pl-1.5'
            : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
        }`}
        style={{ paddingLeft: `${Math.max(6, depth * 14 + 6)}px` }}
        onClick={() => {
          if (node.is_dir) {
            toggleFolder(node.path);
          } else {
            onOpenFile(node);
          }
        }}
      >
        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
          {node.is_dir ? (
            <>
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-3 flex-shrink-0" />
              {getFileIcon(node.name)}
            </>
          )}
          <span className="truncate font-mono text-[11.5px]">{node.name}</span>
        </div>

        {/* Hover Action Icons */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 pl-1">
          {node.is_dir && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNewEntry(node.path, false);
                }}
                className="p-0.5 hover:text-purple-300 text-slate-500 rounded transition cursor-pointer"
                title="New File Inside"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNewEntry(node.path, true);
                }}
                className="p-0.5 hover:text-indigo-300 text-slate-500 rounded transition cursor-pointer"
                title="New Folder Inside"
              >
                <FolderPlus className="w-3 h-3" />
              </button>
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename(node);
            }}
            className="p-0.5 hover:text-amber-300 text-slate-500 rounded transition cursor-pointer"
            title="Rename"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          {node.name !== 'project.json' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node);
              }}
              className="p-0.5 hover:text-rose-400 text-slate-500 rounded transition cursor-pointer"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Render Children Recursively */}
      {node.is_dir && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              activeFilePath={activeFilePath}
              onOpenFile={onOpenFile}
              onNewEntry={onNewEntry}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChangeCode,
  onRunLint,
  lintMessages,
  onSynthesizeAndSimulate,
  isLinting = false,
  isSynthesizing = false,
  activeProjectId = 'scale1_full_adder',
  onSelectProject,
  syncStatus = 'synced',
  isSplitView = false,
  reloadVersion,
  targetOpenFilePath,
  topFilePath,
  onTopFileChange,
  isAutosaveEnabled = true,
  onSaveStatusChange,
  onAddToAgentContext,
}) => {
  // Explorer Sidebar State (open by default for direct file access)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [projectTree, setProjectTree] = useState<FileTreeNode[]>([]);
  const [isTreeLoading, setIsTreeLoading] = useState<boolean>(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(['src', 'tb', 'constraints'])
  );

  // Track the designated top design file for the canvas (e.g. 'src/full_adder.vhd')
  const [internalTopFilePath, setInternalTopFilePath] = useState<string>(
    topFilePath || 'src/full_adder.vhd'
  );

  useEffect(() => {
    if (topFilePath) {
      setInternalTopFilePath(topFilePath);
    }
  }, [topFilePath]);

  // Multi-File Project State (Tabs)
  const [files, setFiles] = useState<FileItem[]>(() => {
    const initial = [...DEFAULT_STARTER_FILES];
    if (code && code.trim()) {
      initial[0].code = code;
    }
    return initial;
  });
  const [activeFilePath, setActiveFilePath] = useState<string>(() => {
    if (activeProjectId) {
      const saved = localStorage.getItem('circuitforge_active_file_' + activeProjectId);
      if (saved) return saved;
    }
    return 'src/full_adder.vhd';
  });
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Explorer Modals State
  const [newEntryModal, setNewEntryModal] = useState<{
    open: boolean;
    isDir: boolean;
    parentPath: string;
  } | null>(null);
  const [newEntryName, setNewEntryName] = useState<string>('');

  const [renameModal, setRenameModal] = useState<{
    open: boolean;
    oldPath: string;
    currentName: string;
    isDir: boolean;
  } | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    path: string;
    name: string;
    isDir: boolean;
  } | null>(null);

  // Toolchain Status & Modal
  const [isToolchainModalOpen, setIsToolchainModalOpen] = useState<boolean>(false);
  const [toolchainStatus, setToolchainStatus] = useState<any>(null);

  const [copied, setCopied] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);
  const [mdViewMode, setMdViewMode] = useState<'editor' | 'preview' | 'split'>('split');
  const [internalLintMessages, setInternalLintMessages] = useState<Array<{ line: number; severity: string; message: string; rule_id: string }>>([]);
  const [isValidatingMultiLang, setIsValidatingMultiLang] = useState<boolean>(false);
  const editorRef = useRef<any>(null);
  // Track active project ID to only reset tabs on project switch, not tree refresh
  const loadedProjectIdRef = useRef<string>('');
  // Flag to suppress the Monaco onChange callback during programmatic setValue() calls
  // (prevents canvas→code→synthesize feedback loops and tab switch triggers)
  const isProgrammaticUpdateRef = useRef<boolean>(false);

  // Load Toolchain Status on mount
  useEffect(() => {
    getToolchainStatus().then(setToolchainStatus).catch(() => {});
  }, []);

  // Safe tab switcher that suppresses spurious Monaco onChange events
  const handleSelectTab = useCallback((targetPath: string) => {
    setActiveFilePath((currentActive) => {
      if (currentActive === targetPath) return currentActive;
      isProgrammaticUpdateRef.current = true;
      Promise.resolve().then(() => {
        isProgrammaticUpdateRef.current = false;
      });
      return targetPath;
    });
  }, []);

  // Open file by relative path helper
  const openFileByPath = useCallback(
    async (targetPath: string) => {
      const existing = files.find((f) => f.path === targetPath);
      if (existing) {
        handleSelectTab(existing.path);
        return;
      }
      try {
        const res = await readProjectFile(activeProjectId, targetPath);
        if (res && res.content !== undefined) {
          const name = targetPath.split('/').pop() || targetPath;
          const newFile: FileItem = {
            name,
            path: targetPath,
            code: res.content,
            isDirty: false,
          };
          setFiles((prev) => [...prev, newFile]);
          handleSelectTab(targetPath);
          // Note: Opening a file never auto-pushes code to canvas unless explicitly synthesized!
        }
      } catch (err) {
        console.error('Failed to read file from backend:', err);
      }
    },
    [files, activeProjectId, handleSelectTab]
  );

  useEffect(() => {
    if (targetOpenFilePath) {
      openFileByPath(targetOpenFilePath);
    }
  }, [targetOpenFilePath, openFileByPath]);

  // Fetch Tree & Files from Project Manager
  const loadTree = useCallback(
    async (projId: string) => {
      setIsTreeLoading(true);
      try {
        const res = await getProjectTree(projId);
        if (res && res.tree && Array.isArray(res.tree)) {
          setProjectTree(res.tree);
          // Automatically expand all root directories
          const folders = new Set<string>();
          res.tree.forEach((node) => {
            if (node.is_dir) folders.add(node.path);
          });
          setExpandedFolders(folders);

          // 1. Check if project.json specifies a top_file
          let designatedTop: string | null = null;
          const projMetaNode = res.tree.find((n) => n.name === 'project.json');
          if (projMetaNode) {
            try {
              const metaData = await readProjectFile(projId, 'project.json');
              if (metaData && metaData.content) {
                const parsed = JSON.parse(metaData.content);
                if (parsed.top_file) {
                  designatedTop = parsed.top_file;
                }
              }
            } catch (e) {
              // ignore parse errors
            }
          }

          // 2. Find first design source code file (prioritize src/ and rtl/ directories, exclude testbenches)
          const findFirstFile = (nodes: FileTreeNode[]): FileTreeNode | null => {
            const allFiles: FileTreeNode[] = [];
            const collect = (list: FileTreeNode[]) => {
              for (const item of list) {
                if (item.is_dir && item.children) {
                  collect(item.children);
                } else if (!item.is_dir) {
                  allFiles.push(item);
                }
              }
            };
            collect(nodes);

            // Prefer primary RTL HDL in src/ or rtl/ (non-testbench)
            const primarySource = allFiles.find(
              (f) =>
                (f.path.includes('src/') || f.path.includes('rtl/')) &&
                isDesignRtlFile(f.path)
            );
            if (primarySource) return primarySource;

            // Any design RTL file
            const anySource = allFiles.find((f) => isDesignRtlFile(f.path));
            if (anySource) return anySource;

            // Any non-meta file
            const nonMeta = allFiles.find((f) => !f.name.endsWith('.json') && !f.name.endsWith('.sdc'));
            if (nonMeta) return nonMeta;

            return allFiles[0] || null;
          };

          const isNewProject = loadedProjectIdRef.current !== projId;
          loadedProjectIdRef.current = projId;

          const detectedTop = designatedTop || findFirstFile(res.tree)?.path || null;
          if (detectedTop) {
            setInternalTopFilePath(detectedTop);
            onTopFileChange?.(detectedTop);

            try {
              const fileData = await readProjectFile(projId, detectedTop);
              if (fileData && fileData.content !== undefined) {
                const topName = detectedTop.split('/').pop() || detectedTop;
                let initialCode = fileData.content;
                if (isAutosaveEnabled) {
                  const draft = localStorage.getItem(`circuitforge_draft_${projId}_${detectedTop}`);
                  if (draft !== null) {
                    initialCode = draft;
                  }
                }

                const topItem: FileItem = {
                  name: topName,
                  path: detectedTop,
                  code: initialCode,
                  isDirty: false,
                };

                if (isNewProject) {
                  // Check if there were multiple open tabs saved for this project
                  const savedTabsRaw = isAutosaveEnabled ? localStorage.getItem('circuitforge_open_tabs_' + projId) : null;
                  const savedActiveFile = isAutosaveEnabled ? localStorage.getItem('circuitforge_active_file_' + projId) : null;
                  const restoredFiles: FileItem[] = [topItem];

                  if (savedTabsRaw) {
                    try {
                      const tabPaths: string[] = JSON.parse(savedTabsRaw);
                      const additionalPaths = tabPaths.filter((p) => p !== detectedTop);
                      for (const addPath of additionalPaths) {
                        try {
                          const fileRes = await readProjectFile(projId, addPath);
                          if (fileRes && fileRes.content !== undefined) {
                            const fDraft = isAutosaveEnabled ? localStorage.getItem(`circuitforge_draft_${projId}_${addPath}`) : null;
                            restoredFiles.push({
                              name: addPath.split('/').pop() || addPath,
                              path: addPath,
                              code: fDraft !== null ? fDraft : fileRes.content,
                              isDirty: false,
                            });
                          }
                        } catch (e) {}
                      }
                    } catch (e) {}
                  }

                  setFiles(restoredFiles);
                  const activeToSelect = savedActiveFile && restoredFiles.some((f) => f.path === savedActiveFile)
                    ? savedActiveFile
                    : detectedTop;
                  setActiveFilePath(activeToSelect);
                  // Synchronize design file with canvas on new project load
                  onChangeCode(initialCode);
                } else {
                  setFiles((prev) => {
                    const exists = prev.some((f) => f.path === detectedTop);
                    if (!exists) return [topItem, ...prev];
                    return prev.map((f) =>
                      f.path === detectedTop ? { ...f, code: initialCode } : f
                    );
                  });
                }
              }
            } catch (err) {
              console.warn('Failed to load initial project file content:', err);
            }
          }
        }
      } catch (err) {
        console.warn('Could not load project tree from backend, using starter files', err);
      } finally {
        setIsTreeLoading(false);
      }
    },
    [onChangeCode, onTopFileChange]
  );

  // Reload tree when activeProjectId changes
  useEffect(() => {
    if (activeProjectId) {
      loadTree(activeProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  // External reload trigger — fires when parent bumps reloadVersion (e.g. after agent materializes files)
  useEffect(() => {
    if (reloadVersion !== undefined && reloadVersion > 0 && activeProjectId) {
      loadTree(activeProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadVersion]);

  // Sync external code prop (from canvas→code direction)
  // ONLY updates the designated top design file — NEVER overwrites testbenches, constraints, or other tabs!
  useEffect(() => {
    if (!code || !code.trim()) return;

    const currentTop = topFilePath || internalTopFilePath;

    setFiles((prev) =>
      prev.map((f) => {
        const isTarget = currentTop
          ? f.path === currentTop
          : isDesignRtlFile(f.path) && f.path.includes('src/');
        if (isTarget) {
          return { ...f, code, isDirty: false };
        }
        return f;
      })
    );

    // Only update Monaco editor if the user is currently viewing the top design file!
    const isViewingTop = currentTop
      ? activeFilePath === currentTop
      : isDesignRtlFile(activeFilePath) && activeFilePath.includes('src/');

    if (isViewingTop && editorRef.current && editorRef.current.getValue() !== code) {
      const pos = editorRef.current.getPosition();
      isProgrammaticUpdateRef.current = true;
      editorRef.current.setValue(code);
      Promise.resolve().then(() => {
        isProgrammaticUpdateRef.current = false;
      });
      if (pos) {
        editorRef.current.setPosition(pos);
      }
    }
  }, [code, topFilePath, internalTopFilePath, activeFilePath]);

  // Toggle Folder Expansion
  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  // Open file in editor (from tree click)
  const handleOpenFileFromTree = async (node: FileTreeNode) => {
    if (node.is_dir) return;
    const existing = files.find((f) => f.path === node.path);
    if (existing) {
      handleSelectTab(existing.path);
      return;
    }

    try {
      const res = await readProjectFile(activeProjectId, node.path);
      if (res && res.content !== undefined) {
        const newFile: FileItem = {
          name: node.name,
          path: node.path,
          code: res.content,
          isDirty: false,
        };
        setFiles((prev) => {
          const updated = [...prev.filter((f) => f.path !== newFile.path), newFile];
          return updated;
        });
        handleSelectTab(node.path);
      }
    } catch (err) {
      console.error('Failed to read file from backend:', err);
    }
  };

  // Close file tab
  const handleCloseTab = (filePath: string) => {
    if (files.length <= 1) return;
    const remaining = files.filter((f) => f.path !== filePath);
    setFiles(remaining);
    if (activeFilePath === filePath) {
      handleSelectTab(remaining[0].path);
    }
  };

  // Monaco editor change handler — only forwards user edits to App.tsx, not programmatic updates
  const handleEditorChange = (newCode: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.path === activeFilePath ? { ...f, code: newCode, isDirty: true } : f))
    );
    // Skip onChangeCode if this is a programmatic setValue() or tab switch
    if (isProgrammaticUpdateRef.current) return;

    if (isAutosaveEnabled && activeProjectId && activeFilePath) {
      try {
        localStorage.setItem(`circuitforge_draft_${activeProjectId}_${activeFilePath}`, newCode);
      } catch (e) {}
      onSaveStatusChange?.('dirty', 'Unsaved edits');

      // Debounce automatic save to backend filesystem (1200ms)
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        handleSaveActiveFile();
      }, 1200);
    } else {
      onSaveStatusChange?.('dirty', 'Unsaved edits');
    }

    // ONLY auto-sync with the schematic canvas if the file currently being edited is the top RTL design file!
    const currentTop = topFilePath || internalTopFilePath;
    const isTopDesignFile = currentTop
      ? activeFilePath === currentTop
      : isDesignRtlFile(activeFilePath) && activeFilePath.includes('src/');

    if (isTopDesignFile) {
      onChangeCode(newCode);
    }
  };

  // Save active file
  const handleSaveActiveFile = async () => {
    const cur = files.find((f) => f.path === activeFilePath) || files[0];
    if (!cur) return;

    const currentCode = editorRef.current ? editorRef.current.getValue() : cur.code;
    onSaveStatusChange?.('saving', 'Saving...');

    try {
      await writeProjectFile(activeProjectId, cur.path, currentCode);
      if (activeProjectId && cur.path) {
        try {
          localStorage.removeItem(`circuitforge_draft_${activeProjectId}_${cur.path}`);
        } catch (e) {}
      }
      setFiles((prev) =>
        prev.map((f) => (f.path === cur.path ? { ...f, code: currentCode, isDirty: false } : f))
      );
      const currentTop = topFilePath || internalTopFilePath;
      const isTopDesignFile = currentTop
        ? cur.path === currentTop
        : isDesignRtlFile(cur.path) && cur.path.includes('src/');
      if (isTopDesignFile) {
        onChangeCode(currentCode);
      }
      setSaveStatus(`Saved ${cur.name}`);
      onSaveStatusChange?.('saved', 'All saved');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error('Save failed:', err);
      // Fallback local save in draft
      setFiles((prev) =>
        prev.map((f) => (f.path === cur.path ? { ...f, code: currentCode, isDirty: false } : f))
      );
      setSaveStatus(`Saved (Local)`);
      onSaveStatusChange?.('saved', 'Saved (Local)');
      setTimeout(() => setSaveStatus(null), 2500);
    }
  };

  // Persist open tabs and active file to localStorage
  useEffect(() => {
    if (!isAutosaveEnabled || !activeProjectId) return;
    try {
      localStorage.setItem('circuitforge_active_file_' + activeProjectId, activeFilePath);
      localStorage.setItem(
        'circuitforge_open_tabs_' + activeProjectId,
        JSON.stringify(files.map((f) => f.path))
      );
    } catch (e) {}
  }, [files, activeFilePath, isAutosaveEnabled, activeProjectId]);

  // Window beforeunload safety listener
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const anyDirty = files.some((f) => f.isDirty);
      if (isAutosaveEnabled) {
        // Synchronously save drafts of all dirty open files into localStorage
        files.forEach((f) => {
          if (f.isDirty) {
            try {
              localStorage.setItem(`circuitforge_draft_${activeProjectId}_${f.path}`, f.code);
            } catch (err) {}
          }
        });
      } else if (anyDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [files, activeProjectId, isAutosaveEnabled]);

  // Keyboard shortcut: Ctrl+S or Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveActiveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFilePath, files, activeProjectId]);

  // Create Entry (File or Folder)
  const handleCreateEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntryModal) return;
    let name = newEntryName.trim();
    if (!name) return;

    if (!newEntryModal.isDir && !name.includes('.')) {
      name += '.vhd';
    }

    const fullPath = newEntryModal.parentPath ? `${newEntryModal.parentPath}/${name}` : name;
    const starterContent =
      !newEntryModal.isDir && name.endsWith('.vhd')
        ? `library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n\nentity ${name.replace('.vhd', '')} is\n    port (\n        clk : in std_logic;\n        rst : in std_logic\n    );\nend ${name.replace('.vhd', '')};\n\narchitecture rtl of ${name.replace('.vhd', '')} is\nbegin\nend rtl;\n`
        : '';

    try {
      await createProjectEntry(activeProjectId, fullPath, newEntryModal.isDir, starterContent);
      await loadTree(activeProjectId);
      if (!newEntryModal.isDir) {
        const newFile: FileItem = {
          name,
          path: fullPath,
          code: starterContent,
          isDirty: false,
        };
        setFiles((prev) => [...prev, newFile]);
        setActiveFilePath(fullPath);
      }
    } catch (err) {
      console.error('Failed to create project entry:', err);
    } finally {
      setNewEntryModal(null);
      setNewEntryName('');
    }
  };

  // Rename Entry
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameModal) return;
    const newName = renameInput.trim();
    if (!newName || newName === renameModal.currentName) {
      setRenameModal(null);
      return;
    }

    const parts = renameModal.oldPath.split('/');
    parts.pop();
    parts.push(newName);
    const newPath = parts.join('/');

    try {
      await renameProjectEntry(activeProjectId, renameModal.oldPath, newPath);
      await loadTree(activeProjectId);
      setFiles((prev) =>
        prev.map((f) =>
          f.path === renameModal.oldPath ? { ...f, name: newName, path: newPath } : f
        )
      );
      if (activeFilePath === renameModal.oldPath) {
        setActiveFilePath(newPath);
      }
    } catch (err) {
      console.error('Failed to rename project entry:', err);
    } finally {
      setRenameModal(null);
      setRenameInput('');
    }
  };

  // Delete Entry
  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    try {
      await deleteProjectEntry(activeProjectId, deleteModal.path);
      await loadTree(activeProjectId);
      setFiles((prev) => prev.filter((f) => f.path !== deleteModal.path));
      if (activeFilePath === deleteModal.path) {
        const remaining = files.filter((f) => f.path !== deleteModal.path);
        if (remaining.length > 0) {
          setActiveFilePath(remaining[0].path);
        }
      }
    } catch (err) {
      console.error('Failed to delete project entry:', err);
    } finally {
      setDeleteModal(null);
    }
  };

  const handleCopy = () => {
    const cur = files.find((f) => f.path === activeFilePath) || files[0];
    const currentCode = editorRef.current ? editorRef.current.getValue() : cur.code;
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunLintClick = async () => {
    const cur = files.find((f) => f.path === activeFilePath) || files[0];
    if (!cur) return;
    const currentCode = editorRef.current ? editorRef.current.getValue() : cur.code;
    const lang = getMonacoLanguage(cur.name);

    if (lang === 'vhdl') {
      onChangeCode(currentCode);
      onRunLint(currentCode);
      setInternalLintMessages([]);
    } else {
      setIsValidatingMultiLang(true);
      try {
        const res = await validateCode({ code: currentCode, language: lang, file_path: cur.path });
        setInternalLintMessages(res.messages || []);
      } catch (e) {
        console.error('Validation failed', e);
      } finally {
        setIsValidatingMultiLang(false);
      }
    }
  };

  const handleSynthesizeClick = () => {
    const cur = files.find((f) => f.path === activeFilePath) || files[0];
    const currentCode = editorRef.current ? editorRef.current.getValue() : cur.code;
    if (cur) {
      setInternalTopFilePath(cur.path);
      onTopFileChange?.(cur.path);
    }
    onChangeCode(currentCode);
    onSynthesizeAndSimulate(currentCode);
  };

  // Register VHDL syntax tokens and dark theme in Monaco
  const handleEditorWillMount = (monaco: Monaco) => {
    monaco.languages.register({ id: 'vhdl' });

    monaco.languages.setMonarchTokensProvider('vhdl', {
      ignoreCase: true,
      defaultToken: '',
      tokenPostfix: '.vhdl',

      keywords: [
        'library', 'use', 'all', 'entity', 'is', 'port', 'generic', 'end',
        'architecture', 'of', 'begin', 'process', 'if', 'then', 'elsif', 'else',
        'case', 'when', 'others', 'loop', 'for', 'while', 'to', 'downto',
        'return', 'null', 'component', 'package', 'body', 'generate',
        'assert', 'report', 'severity', 'signal', 'variable', 'constant',
        'type', 'subtype', 'array', 'record', 'map', 'in', 'out', 'inout', 'buffer'
      ],

      types: [
        'std_logic', 'std_logic_vector', 'std_ulogic', 'std_ulogic_vector',
        'boolean', 'bit', 'bit_vector', 'character', 'string', 'integer',
        'natural', 'positive', 'real', 'time', 'unsigned', 'signed', 'line', 'text'
      ],

      libraries: [
        'ieee', 'std_logic_1164', 'numeric_std', 'std_logic_arith',
        'std_logic_unsigned', 'std_logic_signed', 'std', 'work'
      ],

      functions: [
        'rising_edge', 'falling_edge', 'to_integer', 'to_unsigned', 'to_signed',
        'conv_integer', 'conv_std_logic_vector', 'resize', 'now'
      ],

      operators: [
        'and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not',
        'sll', 'srl', 'sla', 'sra', 'rol', 'ror',
        '<=', ':=', '=>', '=', '/=', '<', '<=', '>', '>=', '+', '-', '*', '/', '&'
      ],

      symbols: /[=><!~?:&|+\-*\/\^%]+/,

      tokenizer: {
        root: [
          [/--.*$/, 'comment.line'],
          [/'[a-zA-Z_]\w*/, 'attribute.name'],
          [/'[^']'/, 'string.char'],
          [/[boxBOX]?"[^"]*"/, 'string'],
          [/\d+\.?\d*([eE][\-+]?\d+)?/, 'number'],
          [/16#[0-9a-fA-F_]+#/, 'number.hex'],
          [/[a-zA-Z_]\w*/, {
            cases: {
              '@keywords': 'keyword',
              '@types': 'type',
              '@libraries': 'storage.type.library',
              '@functions': 'support.function',
              '@operators': 'keyword.operator',
              '@default': 'identifier'
            }
          }],
          [/[;,.]/, 'delimiter'],
          [/[()]/, 'delimiter.parenthesis'],
          [/@symbols/, {
            cases: {
              '@operators': 'operator',
              '@default': ''
            }
          }],
        ],
      },
    });

    monaco.editor.defineTheme('circuitforge-vhdl-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'C084FC', fontStyle: 'bold' },
        { token: 'type', foreground: '38BDF8', fontStyle: 'bold' },
        { token: 'storage.type.library', foreground: 'FACC15' },
        { token: 'support.function', foreground: '60A5FA', fontStyle: 'bold' },
        { token: 'comment.line', foreground: '64748B', fontStyle: 'italic' },
        { token: 'string', foreground: '34D399' },
        { token: 'string.char', foreground: 'A7F3D0', fontStyle: 'bold' },
        { token: 'number', foreground: 'FB923C' },
        { token: 'number.hex', foreground: 'F97316' },
        { token: 'operator', foreground: 'F472B6' },
        { token: 'attribute.name', foreground: '93C5FD', fontStyle: 'italic' },
        { token: 'identifier', foreground: 'E2E8F0' },
      ],
      colors: {
        'editor.background': '#020617',
        'editor.foreground': '#E2E8F0',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#C084FC',
        'editor.lineHighlightBackground': '#0F172A40',
        'editorCursor.foreground': '#C084FC',
        'editor.selectionBackground': '#7C3AED40',
        'editorIndentGuide.background': '#1E293B',
        'editorIndentGuide.activeBackground': '#475569',
      },
    });
  };

  const activeFile = files.find((f) => f.path === activeFilePath) || files[0];
  const activeLang = getMonacoLanguage(activeFile?.name || '');
  const isHdl = activeLang === 'vhdl' || activeLang === 'verilog';
  const isMarkdown = activeLang === 'markdown' || (activeFile?.name || '').toLowerCase().endsWith('.md') || (activeFile?.name || '').toLowerCase().endsWith('.markdown');
  const activeDiagnostics = internalLintMessages.length > 0 ? internalLintMessages : lintMessages;
  const errorCount = activeDiagnostics.filter((m) => m.severity === 'error').length;
  const warningCount = activeDiagnostics.filter((m) => m.severity === 'warning').length;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 select-none">
      {/* File Tabs & Project Header Bar */}
      <div className="h-10 border-b border-slate-800 bg-slate-900/90 px-3 flex items-center justify-between z-10 backdrop-blur">
        {/* Toggle Explorer + Scrollable File Tabs + Pinned New File (+) Button */}
        <div className="flex items-center space-x-1 min-w-0 flex-1">
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className={`p-1.5 rounded-lg mr-1.5 transition cursor-pointer flex-shrink-0 ${
              isSidebarOpen
                ? 'bg-purple-900/60 text-purple-300 border border-purple-700/80 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={isSidebarOpen ? 'Collapse Project Explorer' : 'Expand Project Explorer'}
          >
            <FolderTree className="w-4 h-4" />
          </button>

          {/* Scrollable File Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar min-w-0 flex-1 py-0.5">
            {files.map((file) => {
              const isActive = file.path === activeFilePath;
              return (
                <div
                  key={file.path}
                  onClick={() => handleSelectTab(file.path)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t-lg text-xs font-mono cursor-pointer border-t-2 transition flex-shrink-0 ${
                    isActive
                      ? 'bg-slate-950 border-purple-500 text-slate-100 font-bold shadow'
                      : 'bg-slate-900/50 border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span>{file.name}</span>
                  {file.isDirty && (
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" title="Unsaved changes" />
                  )}
                  {files.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTab(file.path);
                      }}
                      className="p-0.5 hover:text-rose-400 opacity-50 hover:opacity-100 transition rounded"
                      title="Close file tab"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pinned New File Button: Stays permanently visible no matter how many tabs are open */}
          <button
            onClick={() => setNewEntryModal({ open: true, isDir: false, parentPath: 'src' })}
            className="p-1.5 hover:bg-purple-950/60 bg-slate-800/80 text-purple-300 hover:text-purple-200 border border-purple-800/50 hover:border-purple-600 rounded-lg transition cursor-pointer flex-shrink-0 shadow-sm ml-1"
            title="Create New File (+)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Toolchain & Safety Architecture Button */}
        <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
          {saveStatus && (
            <span className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1 animate-fade-in">
              <CheckCircle2 className="w-3 h-3" />
              <span>{saveStatus}</span>
            </span>
          )}

          <button
            onClick={() => setIsToolchainModalOpen(true)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-mono transition cursor-pointer"
            title="Inspect VHDL Toolchain Architecture & Safety Engine"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px]">
              Engine: {toolchainStatus?.external_toolchains?.ghdl?.available ? 'GHDL (Native)' : 'Built-in AST'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Editor Action Controls Bar */}
      <div className="h-11 border-b border-slate-800 bg-slate-900/60 px-4 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <span className="text-[11px] font-mono text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">
            {activeFile?.path || activeFile?.name} · VHDL-2008
          </span>

          {/* Quick Diagnostics Badge */}
          {lintMessages.length === 0 ? (
            <span className="text-[10px] font-mono text-emerald-400 flex items-center space-x-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
              <CheckCircle2 className="w-3 h-3" />
              <span>DRC Clean</span>
            </span>
          ) : (
            <span
              className={`text-[10px] font-mono flex items-center space-x-1 px-2 py-0.5 rounded border ${
                errorCount > 0
                  ? 'bg-rose-950/80 border-rose-700 text-rose-300'
                  : 'bg-amber-950/80 border-amber-700 text-amber-300'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>
                {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : ''}
                {errorCount > 0 && warningCount > 0 ? ', ' : ''}
                {warningCount > 0 ? `${warningCount} warning${warningCount > 1 ? 's' : ''}` : ''}
              </span>
            </span>
          )}
          {/* Live Auto-Sync Status Badge: Calm & Non-Flitching */}
          <div
            className={`hidden sm:flex items-center justify-center space-x-1.5 w-24 py-0.5 rounded text-[10px] font-mono border transition-colors flex-shrink-0 ${
              syncStatus === 'synced'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : syncStatus === 'syncing'
                ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}
            title="Live VHDL-to-Schematic Auto-Sync Status"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                syncStatus === 'synced'
                  ? 'bg-emerald-400'
                  : syncStatus === 'syncing'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span className="truncate">
              {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Elaborating' : 'Sync Error'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <button
            onClick={handleSaveActiveFile}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
            title="Save file (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Save</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
            title="Copy Code"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            onClick={handleRunLintClick}
            disabled={isLinting || isValidatingMultiLang}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-purple-900/60 hover:bg-purple-800 border border-purple-700 text-purple-200 text-xs font-medium transition disabled:opacity-50 cursor-pointer"
            title={isHdl ? "Run Design Rule Check Linter" : "Validate Code Syntax & Structure"}
          >
            {isLinting || isValidatingMultiLang ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isLinting || isValidatingMultiLang ? 'Validating...' : isHdl ? 'DRC Lint' : 'Validate'}</span>
          </button>

          {onAddToAgentContext && (
            addedFeedback ? (
              <span className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-500 text-emerald-300 text-xs font-semibold shadow-md animate-pulse">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{addedFeedback}</span>
              </span>
            ) : (
              <button
                onClick={() => {
                  let itemLabel = activeFile?.name || 'Code';
                  if (editorRef.current) {
                    const selection = editorRef.current.getSelection();
                    const model = editorRef.current.getModel();
                    if (selection && !selection.isEmpty() && model) {
                      const selectedText = model.getValueInRange(selection);
                      itemLabel = `${activeFile?.name || 'code'}:${selection.startLineNumber}-${selection.endLineNumber}`;
                      onAddToAgentContext({
                        type: 'code_range',
                        label: itemLabel,
                        data: {
                          filePath: activeFile?.path,
                          startLine: selection.startLineNumber,
                          endLine: selection.endLineNumber,
                          text: selectedText,
                        },
                      });
                      setAddedFeedback(`Added ${itemLabel}!`);
                      setTimeout(() => setAddedFeedback(null), 2200);
                      return;
                    }
                  }
                  if (activeFile) {
                    onAddToAgentContext({
                      type: 'file',
                      label: activeFile.name,
                      data: { path: activeFile.path, code: activeFile.code.slice(0, 2000) },
                    });
                    setAddedFeedback(`Added ${activeFile.name}!`);
                    setTimeout(() => setAddedFeedback(null), 2200);
                  }
                }}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700 hover:border-indigo-500 text-indigo-200 hover:text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                title="Attach highlighted code range (or active file) to EDA Copilot context"
              >
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Add to Agent</span>
              </button>
            )
          )}

          {isHdl && (
            <button
              onClick={handleSynthesizeClick}
              disabled={isSynthesizing}
              className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50 cursor-pointer"
              title="Synthesize RTL into Schematic Canvas"
            >
              {isSynthesizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isSynthesizing ? 'Synthesizing...' : 'Synthesize'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Body: Project Explorer Sidebar + Monaco Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Project File Tree Explorer Sidebar */}
        {isSidebarOpen && (
          <div className="w-60 border-r border-slate-800 bg-slate-900/70 flex flex-col flex-shrink-0 select-none">
            {/* Explorer Header */}
            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-2 min-w-0">
                <FolderTree className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider truncate font-mono">
                  {activeProjectId}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setNewEntryModal({ open: true, isDir: false, parentPath: '' })}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-purple-300 transition cursor-pointer"
                  title="New File in Root"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setNewEntryModal({ open: true, isDir: true, parentPath: '' })}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-300 transition cursor-pointer"
                  title="New Folder in Root"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => loadTree(activeProjectId)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  title="Refresh Explorer"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isTreeLoading ? 'animate-spin text-purple-400' : ''}`} />
                </button>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tree Nodes List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs">
              {isTreeLoading && projectTree.length === 0 ? (
                <div className="py-6 flex flex-col items-center justify-center space-y-1.5 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span className="text-[10px]">Loading files...</span>
                </div>
              ) : projectTree.length > 0 ? (
                projectTree.map((node) => (
                  <FileTreeNodeRow
                    key={node.path}
                    node={node}
                    depth={0}
                    expandedFolders={expandedFolders}
                    toggleFolder={toggleFolder}
                    activeFilePath={activeFilePath}
                    onOpenFile={handleOpenFileFromTree}
                    onNewEntry={(parentPath, isDir) =>
                      setNewEntryModal({ open: true, isDir, parentPath })
                    }
                    onRename={(node) =>
                      setRenameModal({
                        open: true,
                        oldPath: node.path,
                        currentName: node.name,
                        isDir: node.is_dir,
                      })
                    }
                    onDelete={(node) =>
                      setDeleteModal({
                        open: true,
                        path: node.path,
                        name: node.name,
                        isDir: node.is_dir,
                      })
                    }
                  />
                ))
              ) : (
                <div className="p-3 text-center text-slate-500 text-[11px]">
                  No files found in workspace.
                </div>
              )}
            </div>

            {/* Bottom Quick Directory Status */}
            <div className="px-3 py-1.5 border-t border-slate-800 bg-slate-950/80 text-[10px] text-slate-500 font-mono flex items-center justify-between">
              <span>{projectTree.length} root items</span>
              <span className="text-purple-400 font-bold">{activeLang.toUpperCase()}</span>
            </div>
          </div>
        )}

        {/* Right Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Floating Markdown Mode Switcher Bar */}
          {isMarkdown && (
            <div className="absolute top-3 right-6 z-30 flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-2xl space-x-1">
              <button
                onClick={() => setMdViewMode('editor')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer ${
                  mdViewMode === 'editor'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Monaco Code Editor Only"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Editor</span>
              </button>
              <button
                onClick={() => setMdViewMode('preview')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer ${
                  mdViewMode === 'preview'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Full Markdown Preview"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
              <button
                onClick={() => setMdViewMode('split')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer ${
                  mdViewMode === 'split'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Split Editor & Live Preview"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden">
            {isMarkdown && mdViewMode === 'preview' ? (
              <div className="w-full h-full overflow-hidden bg-slate-950">
                <MarkdownDocViewer content={activeFile?.code || ''} className="h-full" />
              </div>
            ) : isMarkdown && mdViewMode === 'split' ? (
              <div className="flex w-full h-full overflow-hidden">
                <div className="w-1/2 h-full border-r border-slate-800">
                  <Editor
                    height="100%"
                    language={activeLang}
                    theme="circuitforge-vhdl-dark"
                    value={activeFile?.code || ''}
                    beforeMount={handleEditorWillMount}
                    onMount={(editor) => {
                      editorRef.current = editor;
                      if (onAddToAgentContext) {
                        editor.addAction({
                          id: 'circuitforge-add-agent-context',
                          label: '📎 Add to Agent Context (EDA Copilot)',
                          contextMenuGroupId: 'navigation',
                          contextMenuOrder: 1.2,
                          run: (ed: any) => {
                            const sel = ed.getSelection();
                            const model = ed.getModel();
                            if (sel && !sel.isEmpty() && model) {
                              const txt = model.getValueInRange(sel);
                              onAddToAgentContext({
                                type: 'code_range',
                                label: `${activeFile?.name || 'code'}:${sel.startLineNumber}-${sel.endLineNumber}`,
                                data: {
                                  filePath: activeFile?.path,
                                  startLine: sel.startLineNumber,
                                  endLine: sel.endLineNumber,
                                  text: txt,
                                },
                              });
                            } else if (activeFile) {
                              onAddToAgentContext({
                                type: 'file',
                                label: activeFile.name,
                                data: { path: activeFile.path, code: activeFile.code.slice(0, 2000) },
                              });
                            }
                          },
                        });
                      }
                    }}
                    onChange={(val) => handleEditorChange(val || '')}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 4,
                      bracketPairColorization: { enabled: true },
                      renderLineHighlight: 'all',
                      fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
                    }}
                  />
                </div>
                <div className="w-1/2 h-full overflow-hidden bg-slate-950">
                  <MarkdownDocViewer content={activeFile?.code || ''} className="h-full" />
                </div>
              </div>
            ) : (
              <Editor
                height="100%"
                language={activeLang}
                theme="circuitforge-vhdl-dark"
                value={activeFile?.code || ''}
                beforeMount={handleEditorWillMount}
                onMount={(editor) => {
                  editorRef.current = editor;
                  if (onAddToAgentContext) {
                    editor.addAction({
                      id: 'circuitforge-add-agent-context',
                      label: '📎 Add to Agent Context (EDA Copilot)',
                      contextMenuGroupId: 'navigation',
                      contextMenuOrder: 1.2,
                      run: (ed: any) => {
                        const sel = ed.getSelection();
                        const model = ed.getModel();
                        if (sel && !sel.isEmpty() && model) {
                          const txt = model.getValueInRange(sel);
                          onAddToAgentContext({
                            type: 'code_range',
                            label: `${activeFile?.name || 'code'}:${sel.startLineNumber}-${sel.endLineNumber}`,
                            data: {
                              filePath: activeFile?.path,
                              startLine: sel.startLineNumber,
                              endLine: sel.endLineNumber,
                              text: txt,
                            },
                          });
                        } else if (activeFile) {
                          onAddToAgentContext({
                            type: 'file',
                            label: activeFile.name,
                            data: { path: activeFile.path, code: activeFile.code.slice(0, 2000) },
                          });
                        }
                      },
                    });
                  }
                }}
                onChange={(val) => handleEditorChange(val || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  bracketPairColorization: { enabled: true },
                  renderLineHighlight: 'all',
                  fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
                }}
              />
            )}
          </div>

          {/* Lint Diagnostics Drawer */}
          {activeDiagnostics.length > 0 && (
            <div className="h-36 border-t border-slate-800 bg-slate-900/95 overflow-y-auto p-3 font-mono text-xs">
              <div className="font-bold text-slate-300 mb-1.5 text-[11px] flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isHdl ? 'Static Analysis & DRC Diagnostics' : `${activeLang.toUpperCase()} Syntax & Code Diagnostics`} ({activeDiagnostics.length})</span>
                </div>
                <button
                  onClick={() => setInternalLintMessages([])}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1.5">
                {activeDiagnostics.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg flex items-start space-x-2 text-[11px] ${
                      msg.severity === 'error'
                        ? 'bg-rose-950/70 text-rose-200 border border-rose-800'
                        : msg.severity === 'warning'
                        ? 'bg-amber-950/70 text-amber-200 border border-amber-800'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    <span className="font-bold uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded bg-slate-950 font-mono">
                      {msg.severity}
                    </span>
                    <span className="font-semibold text-slate-400">Line {msg.line}:</span>
                    <span className="flex-1">{msg.message}</span>
                    <span className="ml-auto text-slate-400 text-[10px] font-mono bg-slate-950/60 px-1.5 py-0.5 rounded">
                      {msg.rule_id}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create New File / Folder */}
      {newEntryModal && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateEntrySubmit}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-bold text-slate-200">
                {newEntryModal.isDir ? (
                  <FolderPlus className="w-4 h-4 text-indigo-400" />
                ) : (
                  <FileCode className="w-4 h-4 text-purple-400" />
                )}
                <span>{newEntryModal.isDir ? 'Create New Folder' : 'Create New VHDL File'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewEntryModal(null);
                  setNewEntryName('');
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-mono">
                {newEntryModal.isDir ? 'Folder Name:' : 'File Name (.vhd):'}
              </label>
              <input
                type="text"
                autoFocus
                placeholder={newEntryModal.isDir ? 'e.g. submodules' : 'e.g. alu_shift.vhd'}
                value={newEntryName}
                onChange={(e) => setNewEntryName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
              />
              {newEntryModal.parentPath && (
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  Destination: <span className="text-slate-300">{newEntryModal.parentPath}/</span>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setNewEntryModal(null);
                  setNewEntryName('');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Rename Entry */}
      {renameModal && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-bold text-slate-200">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <span>Rename {renameModal.isDir ? 'Folder' : 'File'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRenameModal(null);
                  setRenameInput('');
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-mono">New Name:</label>
              <input
                type="text"
                autoFocus
                placeholder={renameModal.currentName}
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRenameModal(null);
                  setRenameInput('');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
              >
                Rename
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {deleteModal && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center space-x-2.5 text-rose-400 font-bold text-sm">
              <Trash2 className="w-5 h-5" />
              <span>Delete {deleteModal.isDir ? 'Folder' : 'File'}?</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-rose-300 font-mono">{deleteModal.path}</strong>?
              {deleteModal.isDir && ' All files and nested folders inside will be permanently deleted.'}
            </p>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteModal(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: VHDL Toolchain Architecture & Safety Manager */}
      {isToolchainModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-purple-950/80 border border-purple-700 text-purple-300">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">VHDL Toolchain & Compilation Engine</h3>
                  <p className="text-[11px] text-slate-400">
                    Dual-Tier execution architecture: Zero-Install Native Simulator + Optional Host GHDL
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsToolchainModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300">
              <div className="font-bold text-purple-300 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>How CircuitForge Runs VHDL Safely (Hassle-Free)</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                CircuitForge includes an integrated <strong>pure-Python AST Parser & Event Simulator</strong> that parses VHDL-2008 entities, ports, signals, and synchronous processes without installing background software or modifying your system registry.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800/80 text-[10px]">
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="font-bold text-slate-200 mb-0.5">Tier 1: Built-in Engine</div>
                  <div className="text-slate-400">100% portable, runs in sandboxed memory, extracts gate netlists, evaluates waveforms.</div>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="font-bold text-slate-200 mb-0.5">Tier 2: Host GHDL (Optional)</div>
                  <div className="text-slate-400">If GHDL is installed, CircuitForge invokes it in an isolated temp folder with strict 6s timeouts.</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Detected System Compilers
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-emerald-800/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-bold text-slate-200">CircuitForge Built-in Simulator</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                    Active · 100% Zero-Install
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        toolchainStatus?.external_toolchains?.ghdl?.available ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="font-bold text-slate-200">GHDL (VHDL-2008 Standard Simulator)</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      toolchainStatus?.external_toolchains?.ghdl?.available
                        ? 'text-emerald-400 bg-emerald-950 border-emerald-800'
                        : 'text-slate-400 bg-slate-900 border-slate-700'
                    }`}
                  >
                    {toolchainStatus?.external_toolchains?.ghdl?.available ? 'Detected' : 'Not Installed (Optional)'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        toolchainStatus?.external_toolchains?.yosys?.available ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="font-bold text-slate-200">Yosys (Open Synthesis Suite)</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      toolchainStatus?.external_toolchains?.yosys?.available
                        ? 'text-emerald-400 bg-emerald-950 border-emerald-800'
                        : 'text-slate-400 bg-slate-900 border-slate-700'
                    }`}
                  >
                    {toolchainStatus?.external_toolchains?.yosys?.available ? 'Detected' : 'Not Installed (Optional)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-900/50 text-[11px] text-slate-300 space-y-1">
              <div className="font-bold text-purple-300 flex items-center space-x-1">
                <Info className="w-3.5 h-3.5 text-purple-400" />
                <span>Optional Host Setup (Only if you desire native GHDL)</span>
              </div>
              <p className="text-slate-400">
                You do not need to install anything for CircuitForge to work. If you wish to enable native GHDL, you can run in your terminal:
              </p>
              <div className="bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[10px] text-purple-300">
                winget install GHDL.GHDL
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsToolchainModalOpen(false)}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
