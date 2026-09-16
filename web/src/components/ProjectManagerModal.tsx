import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  PlusCircle,
  FolderTree,
  Cpu,
  Layers,
  Clock,
  FileCode,
  HardDrive,
  Check,
  ChevronRight,
  X,
  Sparkles,
  Search,
  ExternalLink,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { ProjectMeta, listProjects, createProject } from '../services/api';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onProjectCreated?: (newProject: ProjectMeta) => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  activeProjectId,
  onSelectProject,
  onProjectCreated,
}) => {
  const [activeTab, setActiveTab] = useState<'recent' | 'create' | 'browse'>('recent');
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // New Project Form State
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newProjectScale, setNewProjectScale] = useState<number>(1);
  const [newProjectTemplate, setNewProjectTemplate] = useState<string>('gate');
  const [newProjectDesc, setNewProjectDesc] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Custom Directory Path State
  const [customPathInput, setCustomPathInput] = useState<string>('E:\\vhdl_toolkit\\projects');

  // Load Projects on open
  useEffect(() => {
    if (isOpen) {
      loadProjectsList();
    }
  }, [isOpen]);

  const loadProjectsList = async () => {
    setIsLoading(true);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (e) {
      console.error('Failed to list projects:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenProject = (id: string) => {
    onSelectProject(id);
    onClose();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) {
      setCreateError('Please specify a valid project name.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const result = await createProject({
        name,
        scale: newProjectScale,
        template_type: newProjectTemplate,
        description: newProjectDesc.trim() || `Circuit project created with Scale ${newProjectScale} template.`,
      });

      if (result && result.id) {
        onProjectCreated?.(result);
        onSelectProject(result.id);
        onClose();
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create project.');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getScaleColor = (scale?: number) => {
    switch (scale) {
      case 1:
        return 'bg-purple-950 text-purple-300 border-purple-800';
      case 2:
        return 'bg-blue-950 text-blue-300 border-blue-800';
      case 3:
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 4:
        return 'bg-amber-950 text-amber-300 border-amber-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <FolderTree className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-100 tracking-tight">CircuitForge Project Hub</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-800/80 text-purple-300 font-bold">
                  Workspace
                </span>
              </div>
              <p className="text-xs text-slate-400">Select an existing project, create a new design, or choose a folder</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
            title="Close Project Hub"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => setActiveTab('recent')}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-t-xl border-b-2 transition cursor-pointer ${
              activeTab === 'recent'
                ? 'border-purple-500 text-purple-300 bg-slate-900 shadow'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Recent & Existing Projects ({projects.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-t-xl border-b-2 transition cursor-pointer ${
              activeTab === 'create'
                ? 'border-purple-500 text-purple-300 bg-slate-900 shadow'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create New Project</span>
          </button>

          <button
            onClick={() => setActiveTab('browse')}
            className={`flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-t-xl border-b-2 transition cursor-pointer ${
              activeTab === 'browse'
                ? 'border-purple-500 text-purple-300 bg-slate-900 shadow'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Workspace Directory</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: RECENT PROJECTS */}
          {activeTab === 'recent' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search project by name, description, or scale..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-mono">Loading workspace projects...</span>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No projects matching "{searchQuery}". Create a new project to get started!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredProjects.map((p) => {
                    const isActive = p.id === activeProjectId;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleOpenProject(p.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                          isActive
                            ? 'bg-purple-950/40 border-purple-500/80 shadow-lg shadow-purple-500/10'
                            : 'bg-slate-950/70 hover:bg-slate-850 border-slate-800 hover:border-slate-700 hover:shadow-md'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center space-x-2">
                              <Cpu className={`w-4 h-4 ${isActive ? 'text-purple-400' : 'text-slate-400 group-hover:text-purple-400 transition-colors'}`} />
                              <h3 className="font-bold text-xs text-slate-100 group-hover:text-white">
                                {p.name}
                              </h3>
                            </div>
                            {isActive ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-900/80 text-purple-200 border border-purple-600 font-semibold flex items-center space-x-1">
                                <Check className="w-3 h-3" />
                                <span>Current</span>
                              </span>
                            ) : (
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${getScaleColor(p.scale)}`}>
                                {p.scale_label || `Scale ${p.scale}`}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3">
                            {p.description || 'Digital VHDL RTL design project.'}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                          <span className="flex items-center space-x-1">
                            <FileCode className="w-3 h-3 text-slate-400" />
                            <span>{p.file_count || 1} file(s)</span>
                          </span>
                          <span className="text-purple-400 group-hover:translate-x-1 transition-transform flex items-center space-x-1 font-sans font-medium">
                            <span>Open Project</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE NEW PROJECT */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSubmit} className="space-y-4 max-w-xl mx-auto">
              {createError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. barrel_shifter_32bit"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Architectural Scale</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { scale: 1, label: 'Scale 1: Gate Level', desc: 'Combinational logic, boolean gates (Full Adder, MUX)' },
                    { scale: 2, label: 'Scale 2: RTL Block', desc: 'Registers, synchronous counters, finite-state machines' },
                    { scale: 3, label: 'Scale 3: Subsystem', desc: 'ALU arithmetic units, register files, data caches' },
                    { scale: 4, label: 'Scale 4: Processor Core', desc: 'Pipelined RISC-V RV32I microprocessor system' },
                  ].map((s) => (
                    <div
                      key={s.scale}
                      onClick={() => {
                        setNewProjectScale(s.scale);
                        if (s.scale === 1) setNewProjectTemplate('gate');
                        if (s.scale === 2) setNewProjectTemplate('counter');
                        if (s.scale === 3) setNewProjectTemplate('alu');
                        if (s.scale === 4) setNewProjectTemplate('riscv');
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                        newProjectScale === s.scale
                          ? 'bg-purple-950/50 border-purple-500 text-slate-100 shadow-md'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between mb-1">
                        <span>{s.label}</span>
                        {newProjectScale === s.scale && <Check className="w-3.5 h-3.5 text-purple-400" />}
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Starter Template</label>
                <select
                  value={newProjectTemplate}
                  onChange={(e) => setNewProjectTemplate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer font-mono"
                >
                  <option value="gate">Scale 1 Gate-Level Logic (2 XOR, 2 AND, 1 OR)</option>
                  <option value="counter">Scale 2 Synchronous Registered Counter (8-bit up/down)</option>
                  <option value="alu">Scale 3 Arithmetic Logic Unit (32-bit multi-opcode)</option>
                  <option value="riscv">Scale 4 Pipelined RISC-V RV32I Processor Core</option>
                  <option value="empty">Blank Project (Empty src/, tb/, constraints/)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Project Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Design specifications, target frequencies, or documentation..."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-purple-600/30 transition cursor-pointer"
                >
                  {isCreating ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <PlusCircle className="w-4 h-4" />
                  )}
                  <span>{isCreating ? 'Creating Project...' : 'Create & Open Project'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: BROWSE WORKSPACE DIRECTORY */}
          {activeTab === 'browse' && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center space-x-2 text-slate-200 font-bold text-xs">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  <span>Configured Workspace Root</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  All active EDA designs, synthesized graphs, waveforms, and testbenches are stored in this root directory. You can switch workspace targets or open custom local paths.
                </p>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={customPathInput}
                    onChange={(e) => setCustomPathInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={() => {
                      loadProjectsList();
                      setActiveTab('recent');
                    }}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow transition cursor-pointer"
                  >
                    Open Directory
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Sandboxed & Safe File Operations</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  File paths are strictly validated to prevent directory traversal outside the configured repository workspace. Creating, renaming, editing, and deleting operations are audited.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono text-[11px]">
            Active Project: <strong className="text-purple-400">{activeProjectId}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
          >
            Continue with Studio
          </button>
        </div>
      </div>
    </div>
  );
};
