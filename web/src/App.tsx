import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Header } from './components/Header';
import { SchematicCanvas } from './components/SchematicCanvas';
import { WaveformViewer } from './components/WaveformViewer';
import { KnowledgeGraphVisualizer } from './components/KnowledgeGraphVisualizer';
import { CodeEditor, isDesignRtlFile } from './components/CodeEditor';
import { AgentDeck, AgentPhaseProgress } from './components/AgentDeck';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { StudioWindowManager, StudioLayoutMode } from './components/StudioWindowManager';
import { TurnkeyLifecycleDeck } from './components/TurnkeyLifecycleDeck';
import { EmbeddedPlatformsDeck } from './components/EmbeddedPlatformsDeck';
import { CatalogCircuit, NetlistGraph, NetlistNode, NetlistWire, WaveformData, SimulationSummary, AgentLog } from './types/circuit';
import { ComponentBlueprint } from './components/ComponentPalette';
import {
  getStatus,
  getCircuitsCatalog,
  synthesizeCircuit,
  simulateCircuit,
  runAgent,
  sendAgentIntervention,
  lintVHDL,
  synthesizeVHDL,
  configureAgent,
  writeProjectFile,
  readProjectFile,
  getProject,
  getProjectTree,
} from './services/api';
import { evaluateCircuitLogic } from './utils/circuitSimulator';
import { netlistToVHDL } from './utils/netlistToVHDL';

export function App() {
  const [circuits, setCircuits] = useState<CatalogCircuit[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<string>('full_adder_gate_level');
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return localStorage.getItem('circuitforge_active_project') || 'scale1_full_adder';
  });
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState<boolean>(() => {
    return localStorage.getItem('circuitforge_project_initialized') !== 'true';
  });
  const [activeTab, setActiveTab] = useState<'design' | 'waveform' | 'kg' | 'schematic' | 'code' | 'lifecycle' | 'embedded'>(() => {
    const saved = localStorage.getItem('circuitforge_active_tab');
    if (saved === 'waveform' || saved === 'kg' || saved === 'lifecycle' || saved === 'embedded') return saved;
    return 'design';
  });
  const [workspaceMode, setWorkspaceMode] = useState<'split' | 'schematic' | 'code'>(() => {
    return (localStorage.getItem('circuitforge_workspace_mode') as any) || 'split';
  });
  const [studioLayoutMode, setStudioLayoutMode] = useState<StudioLayoutMode>(() => {
    const saved = localStorage.getItem('circuitforge_studio_layout_mode');
    if (saved === 'tile' || saved === 'float' || saved === 'split') return saved;
    return 'split';
  });
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = localStorage.getItem('circuitforge_workspace_split_ratio');
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 20 && parsed <= 80) return parsed;
    }
    return 50; // default 50%
  });
  const [isDraggingWorkspaceSplitter, setIsDraggingWorkspaceSplitter] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceContainerRef = useRef<HTMLDivElement | null>(null);

  const [netlist, setNetlist] = useState<NetlistGraph | null>(null);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isLinting, setIsLinting] = useState<boolean>(false);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [agentState, setAgentState] = useState<string>('IDLE');
  const [currentPhase, setCurrentPhase] = useState<AgentPhaseProgress | null>(null);

  // OpenRouter LLM Settings
  const [openrouterKey, setOpenrouterKey] = useState<string>(() => {
    return sessionStorage.getItem('circuitforge_openrouter_key') || localStorage.getItem('circuitforge_openrouter_key') || '';
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('circuitforge_model') || 'anthropic/claude-3.5-sonnet';
  });

  // Global Autosave Configuration & Persistence
  const [isAutosaveEnabled, setIsAutosaveEnabled] = useState<boolean>(() => {
    return localStorage.getItem('circuitforge_autosave_enabled') !== 'false';
  });
  const [globalSaveState, setGlobalSaveState] = useState<'saved' | 'saving' | 'dirty' | 'idle'>('saved');
  const [globalSaveText, setGlobalSaveText] = useState<string>('All saved');

  const handleToggleAutosave = () => {
    setIsAutosaveEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('circuitforge_autosave_enabled', String(next));
      return next;
    });
  };

  const [vhdlCode, setVhdlCode] = useState<string>('');
  const [lintMessages, setLintMessages] = useState<any[]>([]);
  const [lastUpdatedKGNodeId, setLastUpdatedKGNodeId] = useState<string | null>(null);
  const [probeValues, setProbeValues] = useState<Record<string, string>>(() => {
    try {
      const isAuto = localStorage.getItem('circuitforge_autosave_enabled') !== 'false';
      const proj = localStorage.getItem('circuitforge_active_project') || 'scale1_full_adder';
      if (isAuto) {
        const saved = localStorage.getItem(`circuitforge_probes_${proj}`);
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return {};
  });
  const [activeFaults, setActiveFaults] = useState<Record<string, string>>(() => {
    try {
      const isAuto = localStorage.getItem('circuitforge_autosave_enabled') !== 'false';
      const proj = localStorage.getItem('circuitforge_active_project') || 'scale1_full_adder';
      if (isAuto) {
        const saved = localStorage.getItem(`circuitforge_faults_${proj}`);
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return {};
  });
  const [codeEditorReloadVersion, setCodeEditorReloadVersion] = useState<number>(0);
  const [targetOpenFilePath, setTargetOpenFilePath] = useState<string | undefined>(undefined);
  const [currentActiveEditorFile, setCurrentActiveEditorFile] = useState<string | undefined>(undefined);
  const [topFilePath, setTopFilePath] = useState<string>('src/full_adder.vhd');

  const handleClearCanvas = useCallback(() => {
    setNetlist({
      nodes: [],
      wires: [],
      inputs: [],
      outputs: [],
      primary_inputs: [],
      primary_outputs: [],
    } as any);
    setActiveFaults({});
    setProbeValues({});
  }, []);

  const handleConsumeTargetOpenFilePath = useCallback(() => {
    setTargetOpenFilePath(undefined);
  }, []);
  const [incomingContextItem, setIncomingContextItem] = useState<{
    type: string;
    label: string;
    data: any;
  } | null>(null);

  const handleAddToAgentContext = useCallback((item: { type: any; label: string; data: any }) => {
    setIncomingContextItem(item);
    setIsSidebarCollapsed(false);
  }, []);

  useEffect(() => {
    if (!isAutosaveEnabled || !activeProjectId) return;
    try {
      localStorage.setItem(`circuitforge_probes_${activeProjectId}`, JSON.stringify(probeValues));
    } catch {}
  }, [probeValues, isAutosaveEnabled, activeProjectId]);

  useEffect(() => {
    if (!isAutosaveEnabled || !activeProjectId) return;
    try {
      localStorage.setItem(`circuitforge_faults_${activeProjectId}`, JSON.stringify(activeFaults));
    } catch {}
  }, [activeFaults, isAutosaveEnabled, activeProjectId]);

  const handleOpenFileInEditor = (projectId: string, filePath: string) => {
    setActiveProjectId(projectId);
    setTargetOpenFilePath(filePath);
    setActiveTab('design');
    if (workspaceMode === 'schematic') {
      setWorkspaceMode('split');
    }
  };

  // Resizable Sidebar State & Persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('circuitforge_sidebar_width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 260 && parsed <= 900) return parsed;
    }
    return 384; // default 384px (w-96)
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('circuitforge_sidebar_collapsed') === 'true';
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('circuitforge_sidebar_width', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('circuitforge_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('circuitforge_workspace_mode', workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    localStorage.setItem('circuitforge_workspace_split_ratio', String(splitRatio));
  }, [splitRatio]);

  useEffect(() => {
    localStorage.setItem('circuitforge_studio_layout_mode', studioLayoutMode);
  }, [studioLayoutMode]);

  useEffect(() => {
    localStorage.setItem('circuitforge_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('circuitforge_active_project', activeProjectId);
  }, [activeProjectId]);

  const circuitToProjectMap: Record<string, string> = {
    full_adder_gate_level: 'scale1_full_adder',
    counter_8bit_updown: 'scale2_counter',
    alu_32bit_subsystem: 'scale3_alu',
    riscv_rv32i_core: 'scale4_riscv',
    scale1_full_adder: 'scale1_full_adder',
    scale2_counter: 'scale2_counter',
    scale3_alu: 'scale3_alu',
    scale4_riscv: 'scale4_riscv',
  };

  const projectToCircuitMap: Record<string, string> = {
    scale1_full_adder: 'full_adder_gate_level',
    scale2_counter: 'counter_8bit_updown',
    scale3_alu: 'alu_32bit_subsystem',
    scale4_riscv: 'riscv_rv32i_core',
  };

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    activeProjectIdRef.current = projectId;
    localStorage.setItem('circuitforge_project_initialized', 'true');
    localStorage.setItem('circuitforge_active_project', projectId);

    let targetTop = 'src/full_adder.vhd';
    let projectName = projectId;

    try {
      // 1. Query project metadata from backend
      const meta = await getProject(projectId);
      if (meta) {
        if (meta.name) projectName = meta.name;
        if (meta.top_file) targetTop = meta.top_file;
      }
    } catch {
      const mapping: Record<string, string> = {
        scale1_full_adder: 'src/full_adder.vhd',
        scale2_counter: 'src/counter_8bit.vhd',
        scale3_alu: 'src/alu_32bit.vhd',
        scale4_riscv: 'src/riscv_rv32i.vhd',
      };
      targetTop = mapping[projectId] || 'src/full_adder.vhd';
    }

    // 2. If targetTop still default and project is custom, discover from file tree
    if (targetTop === 'src/full_adder.vhd' && projectId !== 'scale1_full_adder') {
      try {
        const treeRes = await getProjectTree(projectId);
        if (treeRes && treeRes.tree) {
          const findFirstRtl = (nodes: any[]): string | null => {
            for (const n of nodes) {
              if (n.is_dir && n.children) {
                const found = findFirstRtl(n.children);
                if (found) return found;
              } else if (!n.is_dir && n.path) {
                const p = n.path.toLowerCase();
                if ((p.endsWith('.vhd') || p.endsWith('.vhdl') || p.endsWith('.v') || p.endsWith('.sv')) && !p.includes('tb')) {
                  return n.path;
                }
              }
            }
            return null;
          };
          const found = findFirstRtl(treeRes.tree);
          if (found) targetTop = found;
        }
      } catch {}
    }

    setTopFilePath(targetTop);
    topFilePathRef.current = targetTop;
    setTargetOpenFilePath(targetTop);

    const targetCircuit = projectToCircuitMap[projectId] || projectName || projectId;
    setSelectedCircuit(targetCircuit);
    selectedCircuitRef.current = targetCircuit;

    if (isAutosaveEnabled) {
      try {
        const savedProbes = localStorage.getItem(`circuitforge_probes_${projectId}`);
        setProbeValues(savedProbes ? JSON.parse(savedProbes) : {});
        const savedFaults = localStorage.getItem(`circuitforge_faults_${projectId}`);
        setActiveFaults(savedFaults ? JSON.parse(savedFaults) : {});
      } catch {
        setProbeValues({});
        setActiveFaults({});
      }
    } else {
      setProbeValues({});
      setActiveFaults({});
    }

    // 3. Load active file content and synthesize schematic netlist
    try {
      const fileData = await readProjectFile(projectId, targetTop);
      if (fileData && fileData.content && fileData.content.trim()) {
        setVhdlCode(fileData.content);
        const net = await synthesizeVHDL(fileData.content, targetCircuit);
        if (net && net.nodes && net.nodes.length > 0) {
          setNetlist(net);
        }
      } else {
        await loadCircuit(targetCircuit, false);
      }
    } catch {
      await loadCircuit(targetCircuit, false);
    }

    // 4. Force CodeEditor and tree to synchronize
    setCodeEditorReloadVersion((v) => v + 1);
  };

  // Global mousemove and mouseup listeners for smooth dragging across canvas & Monaco
  useEffect(() => {
    if (!isDraggingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const calculatedWidth = window.innerWidth - e.clientX;
      const minWidth = 260;
      const maxWidth = Math.max(300, Math.min(950, window.innerWidth - 320));

      if (calculatedWidth < 180) {
        setIsSidebarCollapsed(true);
      } else {
        setIsSidebarCollapsed(false);
        setSidebarWidth(Math.max(minWidth, Math.min(maxWidth, calculatedWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  // Global mouse listeners for workspace divider (Canvas vs VHDL Code)
  useEffect(() => {
    if (!isDraggingWorkspaceSplitter) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!workspaceContainerRef.current) return;
      const rect = workspaceContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      const clamped = Math.max(20, Math.min(80, percentage));
      setSplitRatio(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingWorkspaceSplitter(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingWorkspaceSplitter]);

  const handleMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
  };

  const handleDoubleClickResizer = () => {
    setSidebarWidth(384);
    setIsSidebarCollapsed(false);
  };

  const wsRef = useRef<WebSocket | null>(null);
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const topFilePathRef = useRef(topFilePath);
  topFilePathRef.current = topFilePath;
  const selectedCircuitRef = useRef(selectedCircuit);
  selectedCircuitRef.current = selectedCircuit;
  const agentStateRef = useRef(agentState);
  agentStateRef.current = agentState;

  // Initialize catalog and restore active project or synthesize initial circuit
  useEffect(() => {
    const init = async () => {
      try {
        const cat = await getCircuitsCatalog();
        setCircuits(cat);

        const savedProj = localStorage.getItem('circuitforge_active_project');
        if (savedProj) {
          await handleSelectProject(savedProj);
        } else if (cat.length > 0) {
          const initial = cat[0].id;
          setSelectedCircuit(initial);
          await loadCircuit(initial);
        }
      } catch (e) {
        console.error('Failed to initialize circuits catalog', e);
      }
    };
    init();
  }, []);

  // WebSocket for real-time telemetry with auto-reconnect and state reconciliation
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isDisposed = false;

    const syncAgentStatus = async () => {
      try {
        const st = await getStatus();
        if (st && st.agent_state) {
          setAgentState(st.agent_state);
          if (st.current_phase) {
            const rawIdx =
              st.current_phase.step_index !== undefined
                ? st.current_phase.step_index
                : st.current_phase.step
                ? st.current_phase.step - 1
                : 0;
            const safeIdx = typeof rawIdx === 'number' && !isNaN(rawIdx) ? rawIdx : 0;
            setCurrentPhase({ ...st.current_phase, step_index: safeIdx });
          } else if (st.agent_state === 'COMPLETED') {
            setCurrentPhase({
              step: 6,
              step_index: 5,
              total_steps: 6,
              step_name: 'Knowledge & Reflection',
              state: 'COMPLETED',
              thought: 'Autonomous design, synthesis, simulation, and verification complete.'
            });
          }
        }
      } catch (e) {
        // silent fail during server restart
      }
    };

    const connect = () => {
      if (isDisposed) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/live`;
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          syncAgentStatus();
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.state) setAgentState(msg.state);

            if (msg.type === 'agent_step_progress') {
              const rawIdx =
                msg.data.step_index !== undefined
                  ? msg.data.step_index
                  : msg.data.step
                  ? msg.data.step - 1
                  : 0;
              const safeIdx = typeof rawIdx === 'number' && !isNaN(rawIdx) ? rawIdx : 0;
              const normalized = { ...msg.data, step_index: safeIdx };
              setCurrentPhase(normalized);
              setAgentLogs((prev) => [
                ...prev,
                {
                  time: Date.now(),
                  state: `PHASE ${safeIdx + 1}`,
                  action: msg.data.step_name || `Phase ${safeIdx + 1}`,
                  thought: msg.data.thought || 'Executing phase...',
                },
              ]);
            } else if (msg.type === 'agent_thought') {
              setAgentLogs((prev) => [...prev, msg.data]);
            } else if (msg.type === 'agent_state_change') {
              setAgentState(msg.data.state);
              if (msg.data.state === 'COMPLETED') {
                setCurrentPhase((prev) =>
                  prev
                    ? { ...prev, state: 'COMPLETED', status: 'COMPLETED', step_index: 5 }
                    : {
                        step: 6,
                        step_index: 5,
                        total_steps: 6,
                        step_name: 'Knowledge & Reflection',
                        state: 'COMPLETED',
                        status: 'COMPLETED',
                        thought: 'Autonomous design, synthesis, simulation, and verification complete.',
                      }
                );
              }
            } else if (msg.type === 'circuit_designed') {
              setVhdlCode(msg.data.vhdl_code);
              setLintMessages(msg.data.lint_messages || []);
            } else if (msg.type === 'netlist_synthesized') {
              setNetlist(msg.data);
            } else if (msg.type === 'simulation_finished') {
              setSummary(msg.data.summary);
              setWaveform(msg.data.waveform);
              const probes: Record<string, string> = {};
              msg.data.waveform?.signals?.forEach((s: any) => {
                if (s.transitions && s.transitions.length > 0) {
                  probes[s.name] = s.transitions[s.transitions.length - 1].val;
                }
              });
              setProbeValues(probes);
            } else if (msg.type === 'fault_injected' && msg.data) {
              if (msg.data.fault !== null && msg.data.fault !== undefined && msg.data.net) {
                setActiveFaults((prev) => ({ ...prev, [msg.data.net]: String(msg.data.fault) }));
              } else if (msg.data.net) {
                setActiveFaults((prev) => {
                  const next = { ...prev };
                  delete next[msg.data.net];
                  return next;
                });
              }
            } else if (msg.type === 'kg_node_added' || msg.type === 'kg_node_updated') {
              setLastUpdatedKGNodeId(msg.data.node?.id || msg.data.node_id);
            } else if (msg.type === 'project_files_updated') {
              const d = msg.data as {
                project_id?: string;
                files?: string[];
                top_file?: string | null;
                modules?: string[];
                circuit_name?: string;
                path?: string;
                action?: string;
              };
              const currProj = activeProjectIdRef.current;
              const targetProj = d.project_id || currProj;
              if (targetProj === currProj || !currProj) {
                setCodeEditorReloadVersion((v) => v + 1);
                const currTop = topFilePathRef.current;
                const topPath = d.top_file || (d.path && isDesignRtlFile(d.path) && d.path === currTop ? d.path : null);
                if (topPath) {
                  readProjectFile(targetProj, topPath).then((resp: { path: string; content: string }) => {
                    if (resp?.content) {
                      setVhdlCode(resp.content);
                      synthesizeVHDL(resp.content, d.circuit_name || selectedCircuitRef.current).then((nl: any) => {
                        if (nl) setNetlist(nl);
                      }).catch(() => {});
                    }
                  }).catch(() => {});
                }

                const fileCount = d.files?.length ?? (d.path ? 1 : 0);
                const displayFile = d.path || d.top_file || (d.files && d.files[0]) || 'file';
                setAgentLogs((prev) => [
                  ...prev,
                  {
                    time: Date.now(),
                    state: 'AGENT_SYNC',
                    action: d.action || 'files_synced',
                    thought: `Studio synced: ${fileCount} file(s) updated in project '${targetProj}' (${displayFile}).`,
                    details: { ...d, project_id: targetProj },
                  },
                ]);
              }
            }
          } catch (e) {
            console.error('WS parse error', e);
          }
        };

        ws.onclose = () => {
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connect, 1500);
          }
        };

        ws.onerror = () => {
          try {
            ws?.close();
          } catch {}
        };
      } catch (err) {
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      }
    };

    connect();

    // Polling reconciliation guard: checks /api/status if agent appears stuck or running
    const pollInterval = setInterval(() => {
      if (agentStateRef.current === 'RUNNING') {
        syncAgentStatus();
      }
    }, 2000);

    return () => {
      isDisposed = true;
      clearInterval(pollInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  const loadCircuit = async (circuitId: string, updateProject: boolean = true) => {
    setSelectedCircuit(circuitId);
    let currentProj = activeProjectId;
    if (updateProject) {
      const mappedProj = circuitToProjectMap[circuitId];
      if (mappedProj && mappedProj !== activeProjectId) {
        setActiveProjectId(mappedProj);
        currentProj = mappedProj;
      }
    }

    const mapping: Record<string, string> = {
      scale1_full_adder: 'src/full_adder.vhd',
      scale2_counter: 'src/counter_8bit.vhd',
      scale3_alu: 'src/alu_32bit.vhd',
      scale4_riscv: 'src/riscv_rv32i.vhd',
    };
    const targetTop = mapping[currentProj] || topFilePath || 'src/full_adder.vhd';
    setTopFilePath(targetTop);

    let loadedFromDisk = false;
    if (currentProj && targetTop) {
      try {
        const fileData = await readProjectFile(currentProj, targetTop);
        if (fileData && fileData.content && fileData.content.trim()) {
          setVhdlCode(fileData.content);
          loadedFromDisk = true;
          const net = await synthesizeVHDL(fileData.content, circuitId);
          if (net && net.nodes && net.nodes.length > 0) {
            setNetlist(net);
          }
        }
      } catch (err) {
        // Fallback to synthesizing circuit by template below
      }
    }

    if (!loadedFromDisk) {
      try {
        const net = await synthesizeCircuit(circuitId);
        setNetlist(net);

        // Default sample VHDL for the circuit
        if (circuitId.includes('adder')) {
          setVhdlCode(`library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity full_adder is
    port (
        A    : in  std_logic;
        B    : in  std_logic;
        Cin  : in  std_logic;
        Sum  : out std_logic;
        Cout : out std_logic
    );
end full_adder;

architecture structural of full_adder is
    signal s1, c1, c2 : std_logic;
begin
    s1 <= A xor B;
    Sum <= s1 xor Cin;
    c1 <= A and B;
    c2 <= Cin and s1;
    Cout <= c1 or c2;
end structural;`);
        } else if (circuitId.includes('counter')) {
          setVhdlCode(`library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter_8bit is
    port (
        clk     : in  std_logic;
        rst     : in  std_logic;
        en      : in  std_logic;
        count   : out std_logic_vector(7 downto 0)
    );
end counter_8bit;

architecture rtl of counter_8bit is
    signal r_cnt : unsigned(7 downto 0);
begin
    process(clk, rst)
    begin
        if rst = '1' then
            r_cnt <= (others => '0');
        elsif rising_edge(clk) then
            if en = '1' then
                r_cnt <= r_cnt + 1;
            end if;
        end if;
    end process;
    count <= std_logic_vector(r_cnt);
end rtl;`);
        } else if (circuitId.includes('alu')) {
          setVhdlCode(`library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity alu_32bit is
    port (
        A          : in  std_logic_vector(31 downto 0);
        B          : in  std_logic_vector(31 downto 0);
        ALUControl : in  std_logic_vector(3 downto 0);
        Result     : out std_logic_vector(31 downto 0);
        Zero       : out std_logic
    );
end alu_32bit;

architecture rtl of alu_32bit is
begin
    process(A, B, ALUControl)
    begin
        case ALUControl is
            when "0000" => Result <= std_logic_vector(unsigned(A) + unsigned(B));
            when "0001" => Result <= std_logic_vector(unsigned(A) - unsigned(B));
            when "0010" => Result <= A and B;
            when "0011" => Result <= A or B;
            when "0100" => Result <= A xor B;
            when "0101" => Result <= std_logic_vector(shift_left(unsigned(A), 1));
            when "0110" => Result <= std_logic_vector(shift_right(unsigned(A), 1));
            when others => Result <= (others => '0');
        end case;
        if A = B then
            Zero <= '1';
        else
            Zero <= '0';
        end if;
    end process;
end rtl;`);
        }
      } catch (e) {
        console.error('Circuit synthesis failed', e);
      }
    }

    // Automatically simulate to populate waveforms
    try {
      const sim = await simulateCircuit(circuitId, 100);
      setSummary(sim.summary);
      setWaveform(sim.waveform);

      const probes: Record<string, string> = {};
      sim.waveform.signals.forEach((s) => {
        if (s.transitions && s.transitions.length > 0) {
          probes[s.name] = s.transitions[s.transitions.length - 1].val;
        }
      });
      setProbeValues(probes);
    } catch (e) {
      console.error('Failed to simulate circuit after load', e);
    }
  };

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await simulateCircuit(selectedCircuit, 100);
      setSummary(res.summary);
      setWaveform(res.waveform);

      const probes: Record<string, string> = {};
      res.waveform.signals.forEach((s) => {
        if (s.transitions && s.transitions.length > 0) {
          probes[s.name] = s.transitions[s.transitions.length - 1].val;
        }
      });
      setProbeValues(probes);
    } catch (e) {
      console.error('Simulation failed', e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRunLint = async (customCode?: string) => {
    setIsLinting(true);
    const codeToLint = typeof customCode === 'string' ? customCode : vhdlCode;
    try {
      const res = await lintVHDL(codeToLint);
      setLintMessages(res.messages || []);
    } catch (e) {
      console.error('Linting failed', e);
    } finally {
      setIsLinting(false);
    }
  };

  // Debounced live VHDL -> Schematic netlist auto-synchronization
  const handleVhdlCodeChange = (newCode: string) => {
    setVhdlCode(newCode);
    setSyncStatus('syncing');

    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setTimeout(async () => {
      try {
        const net = await synthesizeVHDL(newCode, selectedCircuit);
        if (net && net.nodes && net.nodes.length > 0) {
          setNetlist(net);
          setSyncStatus('synced');
          // Re-evaluate logic with new netlist
          const simState = evaluateCircuitLogic(net, probeValues, activeFaults);
          setProbeValues(simState.probeValues);
        } else {
          setSyncStatus('error');
        }
      } catch (e) {
        setSyncStatus('error');
      }
    }, 750);
  };

  const handleSynthesizeVHDL = async (customCode?: string) => {
    setIsSynthesizing(true);
    const codeToSyn = typeof customCode === 'string' ? customCode : vhdlCode;
    try {
      const net = await synthesizeVHDL(codeToSyn, selectedCircuit);
      setNetlist(net);
      setSyncStatus('synced');
      // If user was on full code view, switch to split view so they see both code and schematic!
      if (workspaceMode === 'code') {
        setWorkspaceMode('split');
      }
      setActiveTab('design');
      // Also run simulation to refresh waveforms
      await handleRunSimulation();
    } catch (e) {
      console.error('Synthesis failed', e);
      setSyncStatus('error');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSaveOpenRouterConfig = (key: string, model: string, storagePref: 'session' | 'local' = 'local') => {
    setOpenrouterKey(key);
    setSelectedModel(model);
    if (storagePref === 'session') {
      sessionStorage.setItem('circuitforge_openrouter_key', key);
      localStorage.removeItem('circuitforge_openrouter_key');
    } else {
      localStorage.setItem('circuitforge_openrouter_key', key);
      sessionStorage.removeItem('circuitforge_openrouter_key');
    }
    localStorage.setItem('circuitforge_model', model);
    configureAgent(key, model).catch(() => {});
  };

  const handleAgentIntervention = async (action: 'pause' | 'resume' | 'step' | 'steer' | 'stop', params?: { guidance?: string }) => {
    if (action === 'pause') setAgentState('PAUSED');
    if (action === 'resume') setAgentState('RUNNING');
    if (action === 'step') setAgentState('RUNNING');
    if (action === 'stop') { setAgentState('IDLE'); setCurrentPhase(null); }
    try {
      await sendAgentIntervention(action as any, params);
    } catch (e) {
      console.error('Agent intervention failed', e);
    }
  };

  const handleLaunchTask = (
    goal: string,
    scale: number,
    circuitName: string,
    key?: string,
    model?: string
  ) => {
    setAgentState('RUNNING');
    const activeKey = key !== undefined ? key : openrouterKey;
    const activeModel = model !== undefined ? model : selectedModel;
    runAgent(goal, scale, circuitName, activeKey, activeModel, activeProjectId || undefined);
  };

  const handleInjectFault = async (netName: string, faultVal: string | null) => {
    try {
      const nextFaults = { ...activeFaults };
      if (faultVal !== null) {
        nextFaults[netName] = faultVal;
      } else {
        delete nextFaults[netName];
      }
      setActiveFaults(nextFaults);

      // Re-evaluate logic across entire netlist with updated faults
      const simState = evaluateCircuitLogic(netlist, probeValues, nextFaults);
      setProbeValues(simState.probeValues);

      await sendAgentIntervention('fault', {
        net_name: netName,
        fault_value: faultVal !== null ? faultVal : 'clear',
      });
      await handleRunSimulation();
    } catch (e) {
      console.error('Failed to inject fault', e);
    }
  };

  const handleToggleInput = (pinName: string, currentVal: string) => {
    const newVal = currentVal === '1' ? '0' : '1';
    const updatedInputs = { ...probeValues, [pinName]: newVal };

    // Universal topological logic simulation for any circuit, custom gate, or interconnect
    const simState = evaluateCircuitLogic(netlist, updatedInputs, activeFaults);
    setProbeValues(simState.probeValues);
  };

  const syncNetlistToCode = (updatedNetlist: NetlistGraph) => {
    try {
      // Only perform automatic canvas-to-VHDL overwrite for canonical gate-level starter files
      const mapping: Record<string, string> = {
        scale1_full_adder: 'src/full_adder.vhd',
        scale2_counter: 'src/counter_8bit.vhd',
        scale3_alu: 'src/alu_32bit.vhd',
        scale4_riscv: 'src/riscv_rv32i.vhd',
      };
      const canonicalTop = mapping[activeProjectId];
      if (!canonicalTop || (topFilePath && topFilePath !== canonicalTop)) {
        // Do not overwrite secondary or structural subsystem files with gate-level serializer
        return;
      }

      const generated = netlistToVHDL(updatedNetlist);
      if (generated) {
        setVhdlCode(generated);
        setSyncStatus('synced');
        writeProjectFile(activeProjectId, canonicalTop, generated).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to serialize netlist to VHDL', err);
    }
  };

  const handleAddComponent = (blueprint: ComponentBlueprint, pos: { x: number; y: number }) => {
    setNetlist((currentNetlist) => {
      if (!currentNetlist) return currentNetlist;
      const count = currentNetlist.nodes.filter((n) => n.type === blueprint.type).length + 1;
      const newId = `${blueprint.type.toLowerCase()}_${Date.now().toString().slice(-4)}`;
      const newNode: NetlistNode = {
        id: newId,
        label: `${blueprint.name} ${count}`,
        type: blueprint.type,
        scale: blueprint.scale || 1,
        x: pos.x,
        y: pos.y,
        width: blueprint.width,
        height: blueprint.height,
        inputs: blueprint.inputs.map((p) => ({
          id: `${newId}_${p.name}`,
          name: p.name,
          direction: 'in',
          width: p.width || 1,
        })),
        outputs: blueprint.outputs.map((p) => ({
          id: `${newId}_${p.name}`,
          name: p.name,
          direction: 'out',
          width: p.width || 1,
        })),
        properties: { gate_type: blueprint.type, scale: blueprint.scale },
      };
      const updatedNetlist = {
        ...currentNetlist,
        nodes: [...currentNetlist.nodes, newNode],
      };
      const simState = evaluateCircuitLogic(updatedNetlist, probeValues, activeFaults);
      setProbeValues(simState.probeValues);
      syncNetlistToCode(updatedNetlist);
      return updatedNetlist;
    });
  };

  const handleDeleteComponent = (nodeId: string) => {
    setNetlist((currentNetlist) => {
      if (!currentNetlist) return currentNetlist;
      const targetNode = currentNetlist.nodes.find((n) => n.id === nodeId || n.label === nodeId);
      const targetIds = new Set([nodeId, targetNode?.id, targetNode?.label].filter(Boolean) as string[]);
      const updatedNetlist = {
        ...currentNetlist,
        nodes: currentNetlist.nodes.filter((n) => !targetIds.has(n.id) && !targetIds.has(n.label)),
        wires: currentNetlist.wires.filter((w) => !targetIds.has(w.source_node) && !targetIds.has(w.target_node)),
      };
      const simState = evaluateCircuitLogic(updatedNetlist, probeValues, activeFaults);
      setProbeValues(simState.probeValues);
      syncNetlistToCode(updatedNetlist);
      return updatedNetlist;
    });
  };

  const handleAddWire = (newWire: NetlistWire) => {
    setNetlist((currentNetlist) => {
      if (!currentNetlist) return currentNetlist;
      const normPort = (p: string = '') => p.toLowerCase().replace(/^(in_|out_|sig_|s_)/, '').trim();
      const normNode = (n: string = '') => n.toLowerCase().trim();

      // Filter out any existing wire driving the same target input port
      const filteredWires = currentNetlist.wires.filter(
        (w) =>
          !(
            (w.target_node === newWire.target_node || normNode(w.target_node) === normNode(newWire.target_node)) &&
            (w.target_port === newWire.target_port || normPort(w.target_port) === normPort(newWire.target_port))
          )
      );
      const updatedNetlist = {
        ...currentNetlist,
        wires: [...filteredWires, newWire],
      };
      const simState = evaluateCircuitLogic(updatedNetlist, probeValues, activeFaults);
      setProbeValues(simState.probeValues);
      syncNetlistToCode(updatedNetlist);
      return updatedNetlist;
    });
  };

  const handleDeleteWire = (wireId: string) => {
    setNetlist((currentNetlist) => {
      if (!currentNetlist) return currentNetlist;
      const updatedNetlist = {
        ...currentNetlist,
        wires: currentNetlist.wires.filter((w) => w.id !== wireId),
      };
      const simState = evaluateCircuitLogic(updatedNetlist, probeValues, activeFaults);
      setProbeValues(simState.probeValues);
      syncNetlistToCode(updatedNetlist);
      return updatedNetlist;
    });
  };

  const currentScale = netlist ? netlist.scale : 1;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Studio Header */}
      <Header
        circuits={circuits}
        selectedCircuit={selectedCircuit}
        onSelectCircuit={loadCircuit}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        workspaceMode={workspaceMode}
        onChangeWorkspaceMode={setWorkspaceMode}
        layoutMode={studioLayoutMode}
        onChangeLayoutMode={setStudioLayoutMode}
        syncStatus={syncStatus}
        agentState={agentState}
        isSimulating={isSimulating}
        onRunSimulation={handleRunSimulation}
        currentScale={currentScale}
        onOpenProjectManager={() => setIsProjectManagerOpen(true)}
        onToggleAgentPanel={() => setIsSidebarCollapsed((c) => !c)}
        isAgentPanelOpen={!isSidebarCollapsed}
        isAutosaveEnabled={isAutosaveEnabled}
        onToggleAutosave={handleToggleAutosave}
        saveStatusText={globalSaveText}
        saveStatusState={globalSaveState}
        activeProjectName={activeProjectId}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Fullscreen transparent drag shield preventing Monaco or SVG from capturing mouse during resize */}
        {(isDraggingSidebar || isDraggingWorkspaceSplitter) && (
          <div className="fixed inset-0 z-50 cursor-col-resize pointer-events-auto select-none" />
        )}

        {/* Main Central Studio Workspace */}
        <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
          {/* Unified Multi-Window Studio Manager (Split, Tile, Float) */}
          {(activeTab === 'design' || activeTab === 'schematic' || activeTab === 'code') && (
            <StudioWindowManager
              netlist={netlist}
              probeValues={probeValues}
              activeFaults={activeFaults}
              onInjectFault={handleInjectFault}
              onToggleInput={handleToggleInput}
              onSelectSubcircuit={loadCircuit}
              agentState={agentState}
              isSimulating={isSimulating}
              onAgentIntervention={handleAgentIntervention}
              onLaunchTask={handleLaunchTask}
              onAddComponent={handleAddComponent}
              onDeleteComponent={handleDeleteComponent}
              onAddWire={handleAddWire}
              onDeleteWire={handleDeleteWire}

              vhdlCode={vhdlCode}
              onChangeCode={handleVhdlCodeChange}
              onRunLint={handleRunLint}
              lintMessages={lintMessages}
              onSynthesizeAndSimulate={handleSynthesizeVHDL}
              isLinting={isLinting}
              isSynthesizing={isSynthesizing}
              activeProjectId={activeProjectId}
              onSelectProject={handleSelectProject}
              syncStatus={syncStatus}

              waveform={waveform}
              summary={summary}
              lastUpdatedKGNodeId={lastUpdatedKGNodeId}

              agentLogs={agentLogs}
              onClearLogs={() => setAgentLogs([])}
              currentPhase={currentPhase}
              openrouterKey={openrouterKey}
              selectedModel={selectedModel}
              onUpdateOpenRouterConfig={handleSaveOpenRouterConfig}

              selectedCircuit={selectedCircuit}
              onRunSimulation={handleRunSimulation}

              layoutMode={studioLayoutMode}
              onChangeLayoutMode={setStudioLayoutMode}
              codeEditorReloadVersion={codeEditorReloadVersion}
              targetOpenFilePath={targetOpenFilePath}
              topFilePath={topFilePath}
              onTopFileChange={setTopFilePath}
              isAutosaveEnabled={isAutosaveEnabled}
              onSaveStatusChange={(st, txt) => {
                setGlobalSaveState(st);
                if (txt) setGlobalSaveText(txt);
              }}
              onAddToAgentContext={handleAddToAgentContext}
              onClearCanvas={handleClearCanvas}
              onActiveFileChange={setCurrentActiveEditorFile}
              onConsumeTargetOpenFilePath={handleConsumeTargetOpenFilePath}
            />
          )}

          {activeTab === 'waveform' && (
            <WaveformViewer waveform={waveform} summary={summary} />
          )}

          {activeTab === 'kg' && (
            <KnowledgeGraphVisualizer lastUpdatedNodeId={lastUpdatedKGNodeId} />
          )}

          {activeTab === 'lifecycle' && (
            <TurnkeyLifecycleDeck
              circuitName={selectedCircuit}
              projectId={activeProjectId}
              onOpenFileInEditor={handleOpenFileInEditor}
              onSelectProject={handleSelectProject}
            />
          )}

          {activeTab === 'embedded' && (
            <EmbeddedPlatformsDeck
              onSelectProject={handleSelectProject}
              onOpenFileInEditor={handleOpenFileInEditor}
            />
          )}
        </div>

        {/* Interactive Resizer Splitter Bar (Docked Sidebar on all tabs or split mode) */}
        {!isSidebarCollapsed && (activeTab !== 'design' || studioLayoutMode === 'split') && (
          <div
            onMouseDown={handleMouseDownResizer}
            onDoubleClick={handleDoubleClickResizer}
            className={`relative w-2.5 group cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors select-none z-20 ${
              isDraggingSidebar
                ? 'bg-purple-600 shadow-[0_0_12px_rgba(168,85,247,0.7)]'
                : 'bg-slate-900 hover:bg-purple-500/40 border-l border-r border-slate-800'
            }`}
            title="Drag to resize panel · Double-click to reset (384px)"
          >
            {/* Grip handle indicator */}
            <div className="w-1 h-8 rounded-full bg-slate-700/80 group-hover:bg-purple-300 transition-colors flex flex-col items-center justify-center space-y-1">
              <span className="w-0.5 h-0.5 rounded-full bg-slate-400 group-hover:bg-white" />
              <span className="w-0.5 h-0.5 rounded-full bg-slate-400 group-hover:bg-white" />
              <span className="w-0.5 h-0.5 rounded-full bg-slate-400 group-hover:bg-white" />
            </div>

            {/* Quick Collapse Button on Divider */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsSidebarCollapsed(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute -left-3 top-10 z-30 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:bg-purple-950 hover:border-purple-500 shadow-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer"
              title="Collapse Agent Deck"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right Pane: Autonomous Agent Observer Deck & Intervention Station (Accessible on Every Tab) */}
        {(activeTab !== 'design' || studioLayoutMode === 'split') && (
          <div
            style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
            className={`h-full flex flex-col flex-shrink-0 overflow-hidden ${
              isDraggingSidebar ? '' : 'transition-[width] duration-150 ease-out'
            } ${isSidebarCollapsed ? 'w-0 border-0 pointer-events-none' : 'border-l border-slate-800'}`}
          >
            <AgentDeck
              logs={agentLogs}
              onClearLogs={() => setAgentLogs([])}
              agentState={agentState}
              onIntervention={handleAgentIntervention}
              onLaunchTask={handleLaunchTask}
              onRunSimulation={handleRunSimulation}
              circuitContext={{
                project_id: activeProjectId,
                active_project_id: activeProjectId,
                circuit_name: selectedCircuit,
                vhdl_code: vhdlCode,
                gate_count: netlist?.nodes.length || 0,
                wire_count: netlist?.wires.length || 0,
                probes: probeValues,
                faults: activeFaults,
                netlist: netlist,
                active_file: currentActiveEditorFile || targetOpenFilePath || topFilePath || 'src/full_adder.vhd',
                active_tab: activeTab,
                active_tab_label:
                  activeTab === 'design'
                    ? 'Design & RTL Studio'
                    : activeTab === 'waveform'
                    ? 'Timing Waveforms'
                    : activeTab === 'kg'
                    ? 'Knowledge Graph'
                    : activeTab === 'lifecycle'
                    ? 'Hardware Lifecycle & DFM'
                    : activeTab === 'embedded'
                    ? 'Embedded Platforms & MCUs'
                    : 'EDA Studio',
                canvas_live_summary: `${netlist?.nodes.length || 0} gates, ${netlist?.wires.length || 0} nets, ${Object.keys(probeValues).length} active probes, ${Object.keys(activeFaults).length} injected faults. Simulation is ${isSimulating ? 'RUNNING' : 'IDLE'}.`,
                drc_issues: lintMessages || [],
                simulation_summary: summary ? {
                  status: summary.assertions?.all_passed ? 'PASSED' : (summary.assertions?.failed ? 'FAILED' : 'COMPLETED'),
                  duration_ns: summary.total_time_ns || 100,
                  clock_period_ns: 10,
                  assertions_passed: summary.assertions?.passed || 0,
                  assertions_failed: summary.assertions?.failed || 0,
                } : undefined,
              }}
              currentPhase={currentPhase}
              openrouterKey={openrouterKey}
              selectedModel={selectedModel}
              onUpdateOpenRouterConfig={handleSaveOpenRouterConfig}
              activeProjectId={activeProjectId}
              incomingContextItem={incomingContextItem}
              onClearIncomingContext={() => setIncomingContextItem(null)}
              onApplyDesignToCanvas={(code) => {
                setVhdlCode(code);
                handleSynthesizeVHDL(code);
                if (activeProjectId && topFilePath) {
                  writeProjectFile(activeProjectId, topFilePath, code)
                    .then(() => setCodeEditorReloadVersion((v) => v + 1))
                    .catch(() => {});
                }
              }}
            />
          </div>
        )}

        {/* Floating Expand Tab when collapsed (Accessible on every tab) */}
        {isSidebarCollapsed && (activeTab !== 'design' || studioLayoutMode === 'split') && (
          <button
            onClick={() => setIsSidebarCollapsed(false)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-40 bg-slate-900/95 hover:bg-purple-950 border-l border-t border-b border-purple-800/80 hover:border-purple-500 rounded-l-xl py-3 px-2 shadow-2xl flex flex-col items-center gap-2.5 group transition-all backdrop-blur cursor-pointer"
            title="Expand Agent Deck (Click to open)"
          >
            <ChevronLeft className="w-4 h-4 text-purple-400 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold tracking-wider [writing-mode:vertical-lr] rotate-180 text-slate-300 group-hover:text-purple-300 font-mono">
              AGENT DECK
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                agentState === 'RUNNING' || agentState === 'THINKING'
                  ? 'bg-amber-400 animate-pulse'
                  : agentState === 'ERROR'
                  ? 'bg-rose-400'
                  : 'bg-emerald-400'
              }`}
              title={`Agent: ${agentState}`}
            />
          </button>
        )}
      </div>

      {/* Project Hub & Workspace Manager Modal */}
      <ProjectManagerModal
        isOpen={isProjectManagerOpen}
        onClose={() => setIsProjectManagerOpen(false)}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onProjectCreated={(newProj) => {
          setActiveProjectId(newProj.id);
        }}
      />
    </div>
  );
}

export default App;
