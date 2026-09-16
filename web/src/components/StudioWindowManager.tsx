import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  FileCode,
  Activity,
  Bot,
  Network,
  Minus,
  Maximize2,
  Minimize2,
  X,
  Columns,
  Grid3X3,
  Layers,
  RotateCcw,
  Sparkles,
  Move,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  LayoutGrid
} from 'lucide-react';
import { NetlistGraph, NetlistWire, WaveformData, SimulationSummary, AgentLog } from '../types/circuit';
import { ComponentBlueprint } from './ComponentPalette';
import { SchematicCanvas } from './SchematicCanvas';
import { CodeEditor } from './CodeEditor';
import { WaveformViewer } from './WaveformViewer';
import { KnowledgeGraphVisualizer } from './KnowledgeGraphVisualizer';
import { AgentDeck, AgentPhaseProgress } from './AgentDeck';

export type ToolWindowId = 'schematic' | 'editor' | 'waveform' | 'agent' | 'kg';
export type StudioLayoutMode = 'split' | 'tile' | 'float';

export interface ToolWindowState {
  id: ToolWindowId;
  title: string;
  iconName: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface StudioWindowManagerProps {
  netlist: NetlistGraph | null;
  probeValues: Record<string, string>;
  activeFaults: Record<string, string>;
  onInjectFault: (net: string, val: string | null) => void;
  onToggleInput: (name: string, val: string) => void;
  onSelectSubcircuit: (id: string) => void;
  agentState: string;
  isSimulating: boolean;
  onAgentIntervention: (action: 'pause' | 'resume' | 'step' | 'steer', params?: { guidance?: string }) => void;
  onLaunchTask: (goal: string, scale: number, circuitName: string) => void;
  onAddComponent: (blueprint: ComponentBlueprint, pos: { x: number; y: number }) => void;
  onDeleteComponent: (id: string) => void;
  onAddWire: (wire: NetlistWire) => void;
  onDeleteWire: (id: string) => void;

  vhdlCode: string;
  onChangeCode: (newCode: string) => void;
  onRunLint: (code?: string) => Promise<any> | void;
  lintMessages: any[];
  onSynthesizeAndSimulate: (code?: string) => Promise<void> | void;
  isLinting: boolean;
  isSynthesizing: boolean;
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  syncStatus: 'synced' | 'syncing' | 'error';

  waveform: WaveformData | null;
  summary: SimulationSummary | null;

  lastUpdatedKGNodeId: string | null;

  agentLogs: AgentLog[];
  currentPhase: AgentPhaseProgress | null;
  openrouterKey: string;
  selectedModel: string;
  onUpdateOpenRouterConfig: (key: string, model: string, pref?: 'session' | 'local') => void;

  selectedCircuit: string;
  onRunSimulation: () => Promise<void>;

  layoutMode: StudioLayoutMode;
  onChangeLayoutMode: (mode: StudioLayoutMode) => void;
  /** Increment to force CodeEditor file tree reload after agent materializes files */
  codeEditorReloadVersion?: number;
  /** Path of file to automatically focus and open in CodeEditor */
  targetOpenFilePath?: string;
}

const MIN_WINDOW_WIDTH = 340;
const MIN_WINDOW_HEIGHT = 260;

export const StudioWindowManager: React.FC<StudioWindowManagerProps> = ({
  netlist,
  probeValues,
  activeFaults,
  onInjectFault,
  onToggleInput,
  onSelectSubcircuit,
  agentState,
  isSimulating,
  onAgentIntervention,
  onLaunchTask,
  onAddComponent,
  onDeleteComponent,
  onAddWire,
  onDeleteWire,

  vhdlCode,
  onChangeCode,
  onRunLint,
  lintMessages,
  onSynthesizeAndSimulate,
  isLinting,
  isSynthesizing,
  activeProjectId,
  onSelectProject,
  syncStatus,

  waveform,
  summary,
  lastUpdatedKGNodeId,

  agentLogs,
  currentPhase,
  openrouterKey,
  selectedModel,
  onUpdateOpenRouterConfig,

  selectedCircuit,
  onRunSimulation,

  layoutMode,
  onChangeLayoutMode,
  codeEditorReloadVersion,
  targetOpenFilePath,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topZ, setTopZ] = useState<number>(10);

  // Split view ratio state (Canvas vs VHDL Editor)
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = localStorage.getItem('circuitforge_split_ratio');
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 20 && parsed <= 80) return parsed;
    }
    return 50;
  });
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<boolean>(false);

  // Dragging & Resizing Window State
  const [draggingWindowId, setDraggingWindowId] = useState<ToolWindowId | null>(null);
  const draggingWindowIdRef = useRef<ToolWindowId | null>(null);
  const [resizingState, setResizingState] = useState<{ id: ToolWindowId; dir: 'e' | 's' | 'w' | 'n' | 'se' | 'sw' | 'ne' | 'nw' } | null>(null);
  const resizingStateRef = useRef<{ id: ToolWindowId; dir: 'e' | 's' | 'w' | 'n' | 'se' | 'sw' | 'ne' | 'nw' } | null>(null);
  const isDraggingSplitterRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number; initialW: number; initialH: number }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0,
    initialW: 0,
    initialH: 0,
  });

  // Default Window Geometries for Floating & Tiling
  const [windows, setWindows] = useState<Record<ToolWindowId, ToolWindowState>>(() => {
    const saved = localStorage.getItem('circuitforge_window_states_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }

    return {
      schematic: {
        id: 'schematic',
        title: 'Schematic Netlist Canvas',
        iconName: 'Zap',
        isOpen: true,
        isMinimized: false,
        isMaximized: false,
        x: 20,
        y: 20,
        width: 680,
        height: 540,
        zIndex: 1,
      },
      editor: {
        id: 'editor',
        title: 'VHDL-2008 RTL Code Editor',
        iconName: 'FileCode',
        isOpen: true,
        isMinimized: false,
        isMaximized: false,
        x: 720,
        y: 20,
        width: 640,
        height: 540,
        zIndex: 2,
      },
      waveform: {
        id: 'waveform',
        title: 'Timing Waveform Analyzer',
        iconName: 'Activity',
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        x: 100,
        y: 120,
        width: 760,
        height: 440,
        zIndex: 3,
      },
      agent: {
        id: 'agent',
        title: 'Autonomous EDA Agent Copilot',
        iconName: 'Bot',
        isOpen: true,
        isMinimized: false,
        isMaximized: false,
        x: 400,
        y: 60,
        width: 480,
        height: 600,
        zIndex: 4,
      },
      kg: {
        id: 'kg',
        title: 'Multi-Scale Knowledge Graph',
        iconName: 'Network',
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        x: 160,
        y: 100,
        width: 780,
        height: 480,
        zIndex: 5,
      },
    };
  });

  // Persist window states
  useEffect(() => {
    localStorage.setItem('circuitforge_window_states_v2', JSON.stringify(windows));
  }, [windows]);

  useEffect(() => {
    localStorage.setItem('circuitforge_split_ratio', String(splitRatio));
  }, [splitRatio]);

  // Bring window to top z-index
  const bringToFront = useCallback((id: ToolWindowId) => {
    setTopZ((prev) => {
      const nextZ = prev + 1;
      setWindows((w) => ({
        ...w,
        [id]: { ...w[id], zIndex: nextZ },
      }));
      return nextZ;
    });
  }, []);

  // Window Controls
  const toggleMinimize = useCallback((id: ToolWindowId) => {
    setWindows((w) => ({
      ...w,
      [id]: { ...w[id], isMinimized: !w[id].isMinimized },
    }));
  }, []);

  const toggleMaximize = useCallback((id: ToolWindowId) => {
    setWindows((w) => ({
      ...w,
      [id]: { ...w[id], isMaximized: !w[id].isMaximized, isMinimized: false },
    }));
    bringToFront(id);
  }, [bringToFront]);

  const closeWindow = useCallback((id: ToolWindowId) => {
    setWindows((w) => ({
      ...w,
      [id]: { ...w[id], isOpen: false },
    }));
  }, []);

  const openWindow = useCallback((id: ToolWindowId) => {
    setWindows((w) => ({
      ...w,
      [id]: { ...w[id], isOpen: true, isMinimized: false },
    }));
    bringToFront(id);
  }, [bringToFront]);

  // Mouse Down Handlers for Window Dragging & Resizing
  const handleStartDrag = (e: React.MouseEvent, id: ToolWindowId) => {
    if (layoutMode === 'split') return;
    if (windows[id].isMaximized) return;
    e.preventDefault();
    bringToFront(id);
    setDraggingWindowId(id);
    draggingWindowIdRef.current = id;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: windows[id].x,
      initialY: windows[id].y,
      initialW: windows[id].width,
      initialH: windows[id].height,
    };
  };

  const handleStartResize = (
    e: React.MouseEvent,
    id: ToolWindowId,
    dir: 'e' | 's' | 'w' | 'n' | 'se' | 'sw' | 'ne' | 'nw' = 'se'
  ) => {
    if (layoutMode === 'split') return;
    if (windows[id].isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    bringToFront(id);
    setResizingState({ id, dir });
    resizingStateRef.current = { id, dir };
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: windows[id].x,
      initialY: windows[id].y,
      initialW: windows[id].width,
      initialH: windows[id].height,
    };
  };

  // Global Mouse Listeners for Window Drag & Resize & Splitter
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSplitterRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const pct = (offsetX / rect.width) * 100;
        setSplitRatio(Math.min(80, Math.max(20, pct)));
        return;
      }

      if (draggingWindowIdRef.current && containerRef.current) {
        const id = draggingWindowIdRef.current;
        const deltaX = e.clientX - dragStartRef.current.mouseX;
        const deltaY = e.clientY - dragStartRef.current.mouseY;
        const rect = containerRef.current.getBoundingClientRect();

        const newX = Math.max(0, Math.min(rect.width - 120, dragStartRef.current.initialX + deltaX));
        const newY = Math.max(0, Math.min(rect.height - 40, dragStartRef.current.initialY + deltaY));

        setWindows((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            x: newX,
            y: newY,
          },
        }));
        return;
      }

      if (resizingStateRef.current && containerRef.current) {
        const { id, dir } = resizingStateRef.current;
        const deltaX = e.clientX - dragStartRef.current.mouseX;
        const deltaY = e.clientY - dragStartRef.current.mouseY;
        const rect = containerRef.current.getBoundingClientRect();
        const { initialX, initialY, initialW, initialH } = dragStartRef.current;

        let newX = initialX;
        let newY = initialY;
        let newW = initialW;
        let newH = initialH;

        if (dir.includes('e')) {
          newW = Math.max(MIN_WINDOW_WIDTH, Math.min(rect.width - initialX - 8, initialW + deltaX));
        }
        if (dir.includes('s')) {
          newH = Math.max(MIN_WINDOW_HEIGHT, Math.min(rect.height - initialY - 8, initialH + deltaY));
        }
        if (dir.includes('w')) {
          const maxLeftMove = initialW - MIN_WINDOW_WIDTH;
          const appliedDeltaX = Math.max(-initialX, Math.min(maxLeftMove, deltaX));
          newW = initialW - appliedDeltaX;
          newX = initialX + appliedDeltaX;
        }
        if (dir.includes('n')) {
          const maxTopMove = initialH - MIN_WINDOW_HEIGHT;
          const appliedDeltaY = Math.max(-initialY, Math.min(maxTopMove, deltaY));
          newH = initialH - appliedDeltaY;
          newY = initialY + appliedDeltaY;
        }

        setWindows((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            x: newX,
            y: newY,
            width: newW,
            height: newH,
          },
        }));
      }
    };

    const handleMouseUp = () => {
      if (draggingWindowIdRef.current || resizingStateRef.current || isDraggingSplitterRef.current) {
        draggingWindowIdRef.current = null;
        resizingStateRef.current = null;
        isDraggingSplitterRef.current = false;
        setDraggingWindowId(null);
        setResizingState(null);
        setIsDraggingSplitter(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Automatic Non-Overlapping Tile Engine
  const applyTileLayout = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const availableW = rect.width - 16;
    const availableH = rect.height - 16;

    // Filter open & non-minimized windows
    const activeKeys = (Object.keys(windows) as ToolWindowId[]).filter(
      (k) => windows[k].isOpen && !windows[k].isMinimized
    );

    if (activeKeys.length === 0) return;

    setWindows((prev) => {
      const updated = { ...prev };

      if (activeKeys.length === 1) {
        const k = activeKeys[0];
        updated[k] = { ...updated[k], x: 8, y: 8, width: availableW, height: availableH, isMaximized: false };
      } else if (activeKeys.length === 2) {
        const wHalf = Math.floor(availableW / 2) - 4;
        updated[activeKeys[0]] = { ...updated[activeKeys[0]], x: 8, y: 8, width: wHalf, height: availableH, isMaximized: false };
        updated[activeKeys[1]] = { ...updated[activeKeys[1]], x: 8 + wHalf + 8, y: 8, width: wHalf, height: availableH, isMaximized: false };
      } else if (activeKeys.length === 3) {
        const wLeft = Math.floor(availableW * 0.55);
        const wRight = availableW - wLeft - 8;
        const hHalf = Math.floor(availableH / 2) - 4;
        updated[activeKeys[0]] = { ...updated[activeKeys[0]], x: 8, y: 8, width: wLeft, height: availableH, isMaximized: false };
        updated[activeKeys[1]] = { ...updated[activeKeys[1]], x: 8 + wLeft + 8, y: 8, width: wRight, height: hHalf, isMaximized: false };
        updated[activeKeys[2]] = { ...updated[activeKeys[2]], x: 8 + wLeft + 8, y: 8 + hHalf + 8, width: wRight, height: hHalf, isMaximized: false };
      } else {
        // 4 or more: 2x2 grid
        const wHalf = Math.floor(availableW / 2) - 4;
        const hHalf = Math.floor(availableH / 2) - 4;
        updated[activeKeys[0]] = { ...updated[activeKeys[0]], x: 8, y: 8, width: wHalf, height: hHalf, isMaximized: false };
        updated[activeKeys[1]] = { ...updated[activeKeys[1]], x: 8 + wHalf + 8, y: 8, width: wHalf, height: hHalf, isMaximized: false };
        updated[activeKeys[2]] = { ...updated[activeKeys[2]], x: 8, y: 8 + hHalf + 8, width: wHalf, height: hHalf, isMaximized: false };
        updated[activeKeys[3]] = { ...updated[activeKeys[3]], x: 8 + wHalf + 8, y: 8 + hHalf + 8, width: wHalf, height: hHalf, isMaximized: false };
      }

      return updated;
    });
  }, [windows]);

  // Reset Layout back to pristine clean bounds
  const resetLayout = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const wHalf = Math.floor((rect.width - 24) / 2);
    const h = rect.height - 16;

    setWindows({
      schematic: {
        id: 'schematic',
        title: 'Schematic Netlist Canvas',
        iconName: 'Zap',
        isOpen: true,
        isMinimized: false,
        isMaximized: false,
        x: 8,
        y: 8,
        width: wHalf,
        height: h,
        zIndex: 1,
      },
      editor: {
        id: 'editor',
        title: 'VHDL-2008 RTL Code Editor',
        iconName: 'FileCode',
        isOpen: true,
        isMinimized: false,
        isMaximized: false,
        x: 8 + wHalf + 8,
        y: 8,
        width: wHalf,
        height: h,
        zIndex: 2,
      },
      waveform: {
        id: 'waveform',
        title: 'Timing Waveform Analyzer',
        iconName: 'Activity',
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        x: 80,
        y: 80,
        width: 780,
        height: 480,
        zIndex: 3,
      },
      agent: {
        id: 'agent',
        title: 'Autonomous EDA Agent Copilot',
        iconName: 'Bot',
        isOpen: true,
        isMinimized: false,
        isMaximized: false,
        x: Math.max(40, rect.width - 440),
        y: 20,
        width: 420,
        height: Math.max(380, rect.height - 40),
        zIndex: 4,
      },
      kg: {
        id: 'kg',
        title: 'Multi-Scale Knowledge Graph',
        iconName: 'Network',
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
        x: 120,
        y: 100,
        width: 800,
        height: 500,
        zIndex: 5,
      },
    });
  }, []);

  // Helper to render tool window icon
  const renderToolIcon = (id: ToolWindowId) => {
    switch (id) {
      case 'schematic':
        return <Zap className="w-3.5 h-3.5 text-purple-400" />;
      case 'editor':
        return <FileCode className="w-3.5 h-3.5 text-indigo-400" />;
      case 'waveform':
        return <Activity className="w-3.5 h-3.5 text-emerald-400" />;
      case 'agent':
        return <Bot className="w-3.5 h-3.5 text-pink-400" />;
      case 'kg':
        return <Network className="w-3.5 h-3.5 text-sky-400" />;
    }
  };

  // Helper to render tool window status pill
  const renderToolStatusPill = (id: ToolWindowId) => {
    switch (id) {
      case 'schematic':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950/70 text-purple-300 border border-purple-800/60">
            {netlist?.nodes.length || 0} Gates · {netlist?.wires.length || 0} Nets
          </span>
        );
      case 'editor':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950/70 text-indigo-300 border border-indigo-800/60">
            VHDL-2008 RTL
          </span>
        );
      case 'waveform':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
            {waveform?.signals.length || 0} Signals
          </span>
        );
      case 'agent':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-950/70 text-pink-300 border border-pink-800/60">
            {agentState}
          </span>
        );
      case 'kg':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-950/70 text-sky-300 border border-sky-800/60">
            Active Ontology
          </span>
        );
    }
  };

  // Render content of a specialized tool
  const renderToolContent = (id: ToolWindowId) => {
    switch (id) {
      case 'schematic':
        return (
          <SchematicCanvas
            netlist={netlist}
            probeValues={probeValues}
            activeFaults={activeFaults}
            onInjectFault={onInjectFault}
            onToggleInput={onToggleInput}
            onSelectSubcircuit={onSelectSubcircuit}
            agentState={agentState}
            isSimulating={isSimulating}
            onAgentIntervention={onAgentIntervention}
            onLaunchTask={onLaunchTask}
            onAddComponent={onAddComponent}
            onDeleteComponent={onDeleteComponent}
            onAddWire={onAddWire}
            onDeleteWire={onDeleteWire}
          />
        );
      case 'editor':
        return (
          <CodeEditor
            code={vhdlCode}
            onChangeCode={onChangeCode}
            onRunLint={onRunLint}
            lintMessages={lintMessages}
            onSynthesizeAndSimulate={onSynthesizeAndSimulate}
            isLinting={isLinting}
            isSynthesizing={isSynthesizing}
            activeProjectId={activeProjectId}
            onSelectProject={onSelectProject}
            syncStatus={syncStatus}
            isSplitView={layoutMode === 'split'}
            reloadVersion={codeEditorReloadVersion}
            targetOpenFilePath={targetOpenFilePath}
          />
        );
      case 'waveform':
        return <WaveformViewer waveform={waveform} summary={summary} />;
      case 'agent':
        return (
          <AgentDeck
            logs={agentLogs}
            agentState={agentState}
            onIntervention={onAgentIntervention}
            onLaunchTask={onLaunchTask}
            onRunSimulation={onRunSimulation}
            circuitContext={{
              circuit_name: selectedCircuit,
              vhdl_code: vhdlCode,
              gate_count: netlist?.nodes.length || 0,
              wire_count: netlist?.wires.length || 0,
              probes: probeValues,
              faults: activeFaults,
            }}
            currentPhase={currentPhase}
            openrouterKey={openrouterKey}
            selectedModel={selectedModel}
            onUpdateOpenRouterConfig={onUpdateOpenRouterConfig}
            activeProjectId={activeProjectId}
            onApplyDesignToCanvas={(code) => {
              onChangeCode(code);
              onSynthesizeAndSimulate(code);
            }}
          />
        );
      case 'kg':
        return <KnowledgeGraphVisualizer lastUpdatedNodeId={lastUpdatedKGNodeId} />;
    }
  };

  // Render a Single Window Container
  const renderWindow = (win: ToolWindowState) => {
    if (!win.isOpen || win.isMinimized) return null;

    const isMax = win.isMaximized;
    const isFloating = layoutMode === 'float' || layoutMode === 'tile';

    const style: React.CSSProperties = isMax
      ? {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
        }
      : isFloating
      ? {
          position: 'absolute',
          left: `${win.x}px`,
          top: `${win.y}px`,
          width: `${win.width}px`,
          height: `${win.height}px`,
          zIndex: win.zIndex,
        }
      : {
          width: '100%',
          height: '100%',
          position: 'relative',
        };

    return (
      <div
        key={win.id}
        style={style}
        onMouseDown={() => isFloating && bringToFront(win.id)}
        className={`flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl transition-shadow ${
          isFloating ? 'hover:border-purple-600/70 hover:shadow-purple-950/40' : ''
        }`}
      >
        {/* Window Title Bar */}
        <div
          onMouseDown={(e) => handleStartDrag(e, win.id)}
          onDoubleClick={() => toggleMaximize(win.id)}
          className={`h-9 px-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between select-none flex-shrink-0 backdrop-blur ${
            isFloating && !isMax ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          {/* Title & Status */}
          <div className="flex items-center space-x-2 min-w-0">
            {renderToolIcon(win.id)}
            <span className="text-xs font-semibold text-slate-200 truncate font-mono">{win.title}</span>
            <div className="hidden sm:inline-block">{renderToolStatusPill(win.id)}</div>
          </div>

          {/* Window Control Buttons */}
          <div className="flex items-center space-x-1 flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => toggleMinimize(win.id)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              title="Minimize window to Workbench Dock"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => toggleMaximize(win.id)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              title={isMax ? 'Restore Window' : 'Maximize Window'}
            >
              {isMax ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => closeWindow(win.id)}
              className="p-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 transition cursor-pointer"
              title="Close window"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Window Body */}
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
          {renderToolContent(win.id)}
        </div>

        {/* Multi-Directional Edge & Corner Resize Handles (Float & Tile Modes) */}
        {isFloating && !isMax && (
          <>
            {/* Right Edge */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 'e')}
              className="absolute top-2 right-0 w-2.5 h-[calc(100%-16px)] cursor-ew-resize z-30 hover:bg-purple-500/40 transition-colors"
              title="Drag right edge to resize width"
            />
            {/* Bottom Edge */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 's')}
              className="absolute bottom-0 left-2 w-[calc(100%-16px)] h-2.5 cursor-ns-resize z-30 hover:bg-purple-500/40 transition-colors"
              title="Drag bottom edge to resize height"
            />
            {/* Left Edge */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 'w')}
              className="absolute top-2 left-0 w-2.5 h-[calc(100%-16px)] cursor-ew-resize z-30 hover:bg-purple-500/40 transition-colors"
              title="Drag left edge to resize width"
            />
            {/* Top Edge */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 'n')}
              className="absolute top-0 left-2 w-[calc(100%-16px)] h-2.5 cursor-ns-resize z-30 hover:bg-purple-500/40 transition-colors"
              title="Drag top edge to resize height"
            />
            {/* Bottom-Right Corner Handle with Visible Grip */}
            <div
              data-testid="window-resize-corner"
              onMouseDown={(e) => handleStartResize(e, win.id, 'se')}
              className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-40 flex items-end justify-end p-1 group bg-slate-900/60 rounded-tl hover:bg-purple-900/60 transition-colors"
              title="Drag corner to resize window"
            >
              <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400 group-hover:border-purple-300 transition-colors" />
            </div>
            {/* Bottom-Left Corner */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 'sw')}
              className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-40"
              title="Drag corner to resize"
            />
            {/* Top-Right Corner */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 'ne')}
              className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize z-40"
              title="Drag corner to resize"
            />
            {/* Top-Left Corner */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 'nw')}
              className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-40"
              title="Drag corner to resize"
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-950 select-none">
      {/* Invisible Global Event Shield: Prevents Monaco, SVG & Canvas from swallowing mouse drag events */}
      {(draggingWindowId || resizingState || isDraggingSplitter) && (
        <div
          className={`fixed inset-0 z-[99999] select-none ${
            isDraggingSplitter
              ? 'cursor-col-resize'
              : draggingWindowId
              ? 'cursor-grabbing'
              : resizingState?.dir === 'e' || resizingState?.dir === 'w'
              ? 'cursor-ew-resize'
              : resizingState?.dir === 's' || resizingState?.dir === 'n'
              ? 'cursor-ns-resize'
              : resizingState?.dir === 'se' || resizingState?.dir === 'nw'
              ? 'cursor-nwse-resize'
              : 'cursor-nesw-resize'
          }`}
        />
      )}

      {/* Workspace Canvas Area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden min-h-0">
        {/* MODE 1: SPLIT VIEW (Classic Dual-Pane Canvas + VHDL Editor) */}
        {layoutMode === 'split' && (
          <div className="w-full h-full flex overflow-hidden">
            {/* Left Pane: Schematic Canvas */}
            <div
              style={{ width: `${splitRatio}%` }}
              className="h-full flex flex-col min-w-0 overflow-hidden border-r border-slate-800"
            >
              {renderWindow({
                ...windows.schematic,
                isMinimized: false,
                isMaximized: false,
              })}
            </div>

            {/* Draggable Vertical Splitter Bar */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingSplitter(true);
                isDraggingSplitterRef.current = true;
              }}
              onDoubleClick={() => setSplitRatio(50)}
              className={`relative w-2 group cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors select-none z-20 ${
                isDraggingSplitter
                  ? 'bg-purple-600 shadow-[0_0_12px_rgba(168,85,247,0.8)]'
                  : 'bg-slate-900 hover:bg-purple-500/40 border-l border-r border-slate-800'
              }`}
              title="Drag to resize Canvas vs RTL Editor · Double-click to reset (50/50)"
            >
              <div className="w-0.5 h-7 rounded-full bg-slate-700/80 group-hover:bg-purple-300 transition-colors flex flex-col items-center justify-center space-y-1">
                <span className="w-0.5 h-0.5 rounded-full bg-slate-400 group-hover:bg-white" />
                <span className="w-0.5 h-0.5 rounded-full bg-slate-400 group-hover:bg-white" />
              </div>
            </div>

            {/* Right Pane: VHDL Editor */}
            <div
              style={{ width: `${100 - splitRatio}%` }}
              className="h-full flex flex-col min-w-0 overflow-hidden"
            >
              {renderWindow({
                ...windows.editor,
                isMinimized: false,
                isMaximized: false,
              })}
            </div>
          </div>
        )}

        {/* MODE 2 & 3: TILE GRID VIEW & FLOATING SPECIALIZED ARRANGEABLE WINDOWS */}
        {(layoutMode === 'float' || layoutMode === 'tile') && (
          <div className="w-full h-full relative overflow-hidden bg-slate-950">
            {(Object.keys(windows) as ToolWindowId[]).map((id) => renderWindow(windows[id]))}
          </div>
        )}
      </div>

      {/* Bottom Workbench Dock / Taskbar */}
      <div className="h-10 border-t border-slate-800 bg-slate-950/95 backdrop-blur px-3 flex items-center justify-between select-none z-30 flex-shrink-0">
        {/* Left: Specialized Tool Launcher & Status Buttons */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold hidden xl:inline mr-1">
            EDA Workbench:
          </span>

          {(Object.keys(windows) as ToolWindowId[]).map((id) => {
            const win = windows[id];
            const isVisible = win.isOpen && !win.isMinimized;

            return (
              <button
                key={id}
                onClick={() => {
                  if (!win.isOpen) {
                    openWindow(id);
                  } else if (win.isMinimized) {
                    toggleMinimize(id);
                    bringToFront(id);
                  } else {
                    bringToFront(id);
                  }
                }}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
                  isVisible
                    ? 'bg-slate-800/90 text-slate-200 border border-slate-700 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-300 hover:bg-slate-800/40 border border-slate-800/80'
                }`}
                title={`Click to open/focus ${win.title}`}
              >
                {renderToolIcon(id)}
                <span>{id === 'schematic' ? 'Schematic' : id === 'editor' ? 'VHDL Editor' : id === 'waveform' ? 'Waveforms' : id === 'agent' ? 'Agent Deck' : 'Knowledge Graph'}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isVisible ? 'bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.8)]' : 'bg-slate-600'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Right: Studio Layout Engine Switcher & Arrange Controls */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 space-x-1">
            <button
              onClick={() => onChangeLayoutMode('split')}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
                layoutMode === 'split'
                  ? 'bg-purple-900/80 text-purple-200 border border-purple-600 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Split View: Dual-Pane Schematic on left + RTL Editor on right"
            >
              <Columns className="w-3 h-3 text-purple-400" />
              <span>Split</span>
            </button>

            <button
              onClick={() => {
                onChangeLayoutMode('tile');
                setTimeout(applyTileLayout, 50);
              }}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
                layoutMode === 'tile'
                  ? 'bg-purple-900/80 text-purple-200 border border-purple-600 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Tile Grid: Automatically arrange open windows in non-overlapping tiles"
            >
              <Grid3X3 className="w-3 h-3 text-purple-400" />
              <span>Tile Grid</span>
            </button>

            <button
              onClick={() => onChangeLayoutMode('float')}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
                layoutMode === 'float'
                  ? 'bg-purple-900/80 text-purple-200 border border-purple-600 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Float Windows: Freely draggable, resizable, arrangeable studio windows"
            >
              <Layers className="w-3 h-3 text-purple-400" />
              <span>Float</span>
            </button>
          </div>

          <button
            onClick={resetLayout}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
            title="Reset Studio Windows to default positions"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
