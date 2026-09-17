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
  LayoutGrid,
  PanelLeft,
  PanelRight
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
  onAgentIntervention: (action: 'pause' | 'resume' | 'step' | 'steer' | 'stop', params?: { guidance?: string }) => void;
  onLaunchTask: (goal: string, scale: number, circuitName: string, openrouterKey?: string, model?: string) => void;
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
  onClearLogs?: () => void;
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
  topFilePath?: string;
  onTopFileChange?: (path: string) => void;
  isAutosaveEnabled?: boolean;
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'dirty' | 'idle', text?: string) => void;
  onAddToAgentContext?: (item: { type: any; label: string; data: any }) => void;
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
  onClearLogs,
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
  topFilePath,
  onTopFileChange,
  isAutosaveEnabled = true,
  onSaveStatusChange,
  onAddToAgentContext,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topZ, setTopZ] = useState<number>(10);

  // Selection-to-context bridge: tracks what user has selected across panels
  const [agentContextSelection, setAgentContextSelection] = useState<{
    type: 'node' | 'wire' | 'code_range' | 'file';
    label: string;
    data: any;
  } | null>(null);

  // Directly queued context item to immediately append to Agent Deck context chips
  const [incomingContextItem, setIncomingContextItem] = useState<{
    type: string;
    label: string;
    data: any;
  } | null>(null);

  const handleAddToAgentContext = useCallback((item: { type: any; label: string; data: any }) => {
    setIncomingContextItem(item);
    setAgentContextSelection(item);
    if (onAddToAgentContext) {
      onAddToAgentContext(item);
    }
    // Ensure agent window is visible
    setWindows(prev => {
      if (!prev.agent.isOpen || prev.agent.isMinimized) {
        return {
          ...prev,
          agent: { ...prev.agent, isOpen: true, isMinimized: false, zIndex: topZ + 1 }
        };
      }
      return prev;
    });
  }, [topZ, onAddToAgentContext]);

  // VHDL history stack for agent revert
  const vhdlHistoryRef = useRef<string[]>([]);
  const handlePushVhdlHistory = useCallback((code: string) => {
    vhdlHistoryRef.current = [...vhdlHistoryRef.current.slice(-9), code];
  }, []);

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

  // Default Window Geometries for Clean, Non-Overlapping Layout
  const getInitialCleanWindows = (): Record<ToolWindowId, ToolWindowState> => ({
    schematic: {
      id: 'schematic',
      title: 'Schematic Netlist Canvas',
      iconName: 'Zap',
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      x: 12,
      y: 12,
      width: 680,
      height: 620,
      zIndex: 1,
    },
    editor: {
      id: 'editor',
      title: 'VHDL-2008 RTL Code Editor',
      iconName: 'FileCode',
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      x: 704,
      y: 12,
      width: 680,
      height: 620,
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
      x: 1396,
      y: 12,
      width: 440,
      height: 620,
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
      y: 90,
      width: 800,
      height: 500,
      zIndex: 5,
    },
  });

  const [windows, setWindows] = useState<Record<ToolWindowId, ToolWindowState>>(() => {
    const defaults = getInitialCleanWindows();
    const saved = localStorage.getItem('circuitforge_window_states_v4');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.schematic && parsed.editor && parsed.agent) {
          // Check if open windows overlap significantly
          const openKeys = (Object.keys(parsed) as ToolWindowId[]).filter(
            (k) => parsed[k] && parsed[k].isOpen && !parsed[k].isMinimized
          );
          let hasSevereOverlap = false;
          for (let i = 0; i < openKeys.length; i++) {
            for (let j = i + 1; j < openKeys.length; j++) {
              const a = parsed[openKeys[i]];
              const b = parsed[openKeys[j]];
              if (!a || !b) continue;
              const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
              const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
              if (xOverlap > 100 && yOverlap > 100) {
                hasSevereOverlap = true;
                break;
              }
            }
            if (hasSevereOverlap) break;
          }
          if (!hasSevereOverlap) {
            return { ...defaults, ...parsed };
          }
        }
      } catch (e) {}
    }
    return defaults;
  });

  // Snap indicator state during window dragging
  const [snapCandidate, setSnapCandidate] = useState<'left' | 'right' | 'maximize' | null>(null);
  const snapCandidateRef = useRef<'left' | 'right' | 'maximize' | null>(null);

  // Persist window states
  useEffect(() => {
    localStorage.setItem('circuitforge_window_states_v4', JSON.stringify(windows));
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

        // Magnetic Snap Detection
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        if (relX < 36) {
          setSnapCandidate('left');
          snapCandidateRef.current = 'left';
        } else if (rect.width - relX < 36) {
          setSnapCandidate('right');
          snapCandidateRef.current = 'right';
        } else if (relY < 24) {
          setSnapCandidate('maximize');
          snapCandidateRef.current = 'maximize';
        } else {
          setSnapCandidate(null);
          snapCandidateRef.current = null;
        }

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
      if (draggingWindowIdRef.current && snapCandidateRef.current) {
        const id = draggingWindowIdRef.current;
        const snap = snapCandidateRef.current;
        if (snap === 'left' || snap === 'right') {
          snapToHalf(id, snap);
        } else if (snap === 'maximize') {
          toggleMaximize(id);
        }
      }
      setSnapCandidate(null);
      snapCandidateRef.current = null;
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

  // Snap Window to Left or Right Half (Float Mode)
  const snapToHalf = useCallback(
    (id: ToolWindowId, side: 'left' | 'right') => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const GAP = 8;
      const PADDING = 8;
      const effectiveW = rect.width - PADDING * 2;
      const effectiveH = rect.height - PADDING * 2;
      const wHalf = Math.floor((effectiveW - GAP) / 2);

      setWindows((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          x: side === 'left' ? PADDING : PADDING + wHalf + GAP,
          y: PADDING,
          width: side === 'left' ? wHalf : effectiveW - wHalf - GAP,
          height: effectiveH,
          isMaximized: false,
          isMinimized: false,
        },
      }));
      bringToFront(id);
    },
    [bringToFront]
  );

  // Automatic Non-Overlapping Tile Engine
  const applyTileLayout = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const GAP = 8;
    const PADDING = 8;
    const availableW = Math.max(600, rect.width - PADDING * 2);
    const availableH = Math.max(400, rect.height - PADDING * 2);

    const toolPriority: Record<ToolWindowId, number> = {
      schematic: 1,
      editor: 2,
      agent: 3,
      waveform: 4,
      kg: 5,
    };

    // Filter open & non-minimized windows sorted by logical hierarchy
    const activeKeys = (Object.keys(windows) as ToolWindowId[])
      .filter((k) => windows[k].isOpen && !windows[k].isMinimized)
      .sort((a, b) => toolPriority[a] - toolPriority[b]);

    if (activeKeys.length === 0) return;

    setWindows((prev) => {
      const updated = { ...prev };

      if (activeKeys.length === 1) {
        updated[activeKeys[0]] = {
          ...updated[activeKeys[0]],
          x: PADDING,
          y: PADDING,
          width: availableW,
          height: availableH,
          isMaximized: false,
        };
      } else if (activeKeys.length === 2) {
        const wHalf = Math.floor((availableW - GAP) / 2);
        updated[activeKeys[0]] = {
          ...updated[activeKeys[0]],
          x: PADDING,
          y: PADDING,
          width: wHalf,
          height: availableH,
          isMaximized: false,
        };
        updated[activeKeys[1]] = {
          ...updated[activeKeys[1]],
          x: PADDING + wHalf + GAP,
          y: PADDING,
          width: availableW - wHalf - GAP,
          height: availableH,
          isMaximized: false,
        };
      } else if (activeKeys.length === 3) {
        if (availableW >= 1350) {
          // 3 vertical columns side by side: Canvas (40%), Editor (36%), Agent (24%)
          const w1 = Math.floor(availableW * 0.40);
          const w2 = Math.floor(availableW * 0.36);
          const w3 = availableW - w1 - w2 - GAP * 2;
          updated[activeKeys[0]] = {
            ...updated[activeKeys[0]],
            x: PADDING,
            y: PADDING,
            width: w1,
            height: availableH,
            isMaximized: false,
          };
          updated[activeKeys[1]] = {
            ...updated[activeKeys[1]],
            x: PADDING + w1 + GAP,
            y: PADDING,
            width: w2,
            height: availableH,
            isMaximized: false,
          };
          updated[activeKeys[2]] = {
            ...updated[activeKeys[2]],
            x: PADDING + w1 + GAP + w2 + GAP,
            y: PADDING,
            width: w3,
            height: availableH,
            isMaximized: false,
          };
        } else {
          // Master on left, 2 stacked on right
          const wLeft = Math.floor(availableW * 0.52);
          const wRight = availableW - wLeft - GAP;
          const hTop = Math.floor((availableH - GAP) * 0.52);
          const hBottom = availableH - hTop - GAP;
          updated[activeKeys[0]] = {
            ...updated[activeKeys[0]],
            x: PADDING,
            y: PADDING,
            width: wLeft,
            height: availableH,
            isMaximized: false,
          };
          updated[activeKeys[1]] = {
            ...updated[activeKeys[1]],
            x: PADDING + wLeft + GAP,
            y: PADDING,
            width: wRight,
            height: hTop,
            isMaximized: false,
          };
          updated[activeKeys[2]] = {
            ...updated[activeKeys[2]],
            x: PADDING + wLeft + GAP,
            y: PADDING + hTop + GAP,
            width: wRight,
            height: hBottom,
            isMaximized: false,
          };
        }
      } else if (activeKeys.length === 4) {
        // 2x2 Clean Grid
        const wHalf = Math.floor((availableW - GAP) / 2);
        const hHalf = Math.floor((availableH - GAP) / 2);
        updated[activeKeys[0]] = {
          ...updated[activeKeys[0]],
          x: PADDING,
          y: PADDING,
          width: wHalf,
          height: hHalf,
          isMaximized: false,
        };
        updated[activeKeys[1]] = {
          ...updated[activeKeys[1]],
          x: PADDING + wHalf + GAP,
          y: PADDING,
          width: availableW - wHalf - GAP,
          height: hHalf,
          isMaximized: false,
        };
        updated[activeKeys[2]] = {
          ...updated[activeKeys[2]],
          x: PADDING,
          y: PADDING + hHalf + GAP,
          width: wHalf,
          height: availableH - hHalf - GAP,
          isMaximized: false,
        };
        updated[activeKeys[3]] = {
          ...updated[activeKeys[3]],
          x: PADDING + wHalf + GAP,
          y: PADDING + hHalf + GAP,
          width: availableW - wHalf - GAP,
          height: availableH - hHalf - GAP,
          isMaximized: false,
        };
      } else {
        // 5 or more: 3 columns
        const wCol = Math.floor((availableW - GAP * 2) / 3);
        const hHalf = Math.floor((availableH - GAP) / 2);
        updated[activeKeys[0]] = { ...updated[activeKeys[0]], x: PADDING, y: PADDING, width: wCol, height: availableH, isMaximized: false };
        updated[activeKeys[1]] = { ...updated[activeKeys[1]], x: PADDING + wCol + GAP, y: PADDING, width: wCol, height: hHalf, isMaximized: false };
        updated[activeKeys[2]] = { ...updated[activeKeys[2]], x: PADDING + wCol + GAP, y: PADDING + hHalf + GAP, width: wCol, height: availableH - hHalf - GAP, isMaximized: false };
        updated[activeKeys[3]] = { ...updated[activeKeys[3]], x: PADDING + (wCol + GAP) * 2, y: PADDING, width: availableW - (wCol + GAP) * 2, height: hHalf, isMaximized: false };
        if (activeKeys[4]) {
          updated[activeKeys[4]] = { ...updated[activeKeys[4]], x: PADDING + (wCol + GAP) * 2, y: PADDING + hHalf + GAP, width: availableW - (wCol + GAP) * 2, height: availableH - hHalf - GAP, isMaximized: false };
        }
      }

      return updated;
    });
  }, [windows]);

  // Sync tiles whenever layout mode changes to 'tile' or container resizes
  useEffect(() => {
    if (layoutMode === 'tile') {
      applyTileLayout();
    }
  }, [layoutMode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (layoutMode === 'tile') {
        applyTileLayout();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [layoutMode, applyTileLayout]);

  // Reset Layout back to pristine clean bounds without overlap
  const resetLayout = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const GAP = 8;
    const PADDING = 8;
    const availableW = Math.max(600, rect.width - PADDING * 2);
    const h = Math.max(400, rect.height - PADDING * 2);

    if (availableW >= 1350) {
      const w1 = Math.floor(availableW * 0.40);
      const w2 = Math.floor(availableW * 0.36);
      const w3 = availableW - w1 - w2 - GAP * 2;
      setWindows({
        schematic: {
          id: 'schematic',
          title: 'Schematic Netlist Canvas',
          iconName: 'Zap',
          isOpen: true,
          isMinimized: false,
          isMaximized: false,
          x: PADDING,
          y: PADDING,
          width: w1,
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
          x: PADDING + w1 + GAP,
          y: PADDING,
          width: w2,
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
          x: PADDING + w1 + GAP + w2 + GAP,
          y: PADDING,
          width: w3,
          height: h,
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
          y: 90,
          width: 800,
          height: 500,
          zIndex: 5,
        },
      });
    } else {
      const wHalf = Math.floor((availableW - GAP) / 2);
      setWindows({
        schematic: {
          id: 'schematic',
          title: 'Schematic Netlist Canvas',
          iconName: 'Zap',
          isOpen: true,
          isMinimized: false,
          isMaximized: false,
          x: PADDING,
          y: PADDING,
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
          x: PADDING + wHalf + GAP,
          y: PADDING,
          width: availableW - wHalf - GAP,
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
          x: PADDING + wHalf + GAP,
          y: PADDING + Math.floor(h / 2) + GAP,
          width: availableW - wHalf - GAP,
          height: Math.floor(h / 2) - GAP,
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
          y: 90,
          width: 800,
          height: 500,
          zIndex: 5,
        },
      });
    }
  }, []);

  // Helper to render tool window icon
  const renderToolIcon = (id: ToolWindowId) => {
    switch (id) {
      case 'schematic':
        return <Zap className="w-3.5 h-3.5 text-teal-400" />;
      case 'editor':
        return <FileCode className="w-3.5 h-3.5 text-blue-400" />;
      case 'waveform':
        return <Activity className="w-3.5 h-3.5 text-emerald-400" />;
      case 'agent':
        return <Bot className="w-3.5 h-3.5 text-cyan-400" />;
      case 'kg':
        return <Network className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  // Helper to render tool window status pill
  const renderToolStatusPill = (id: ToolWindowId) => {
    switch (id) {
      case 'schematic':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950/70 text-teal-300 border border-teal-700/60">
            {netlist?.nodes.length || 0} Gates · {netlist?.wires.length || 0} Nets
          </span>
        );
      case 'editor':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/70 text-blue-300 border border-blue-700/60">
            VHDL-2008 RTL
          </span>
        );
      case 'waveform':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-700/60">
            {waveform?.signals.length || 0} Signals
          </span>
        );
      case 'agent':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-teal-300 border border-teal-600/60">
            {agentState}
          </span>
        );
      case 'kg':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950/70 text-purple-300 border border-purple-800/60">
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
            activeProjectId={activeProjectId}
            isAutosaveEnabled={isAutosaveEnabled}
            onNodeSelect={(node) => {
              if (node) {
                setAgentContextSelection({
                  type: 'node',
                  label: node.label || node.id,
                  data: node,
                });
              } else {
                setAgentContextSelection(null);
              }
            }}
            onWireSelect={(wireId, wireName) => {
              if (wireId) {
                setAgentContextSelection({
                  type: 'wire',
                  label: wireName || wireId,
                  data: { id: wireId, net: wireName },
                });
              } else {
                setAgentContextSelection(null);
              }
            }}
            onAddToAgentContext={handleAddToAgentContext}
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
            topFilePath={topFilePath}
            onTopFileChange={onTopFileChange}
            isAutosaveEnabled={isAutosaveEnabled}
            onSaveStatusChange={onSaveStatusChange}
            onAddToAgentContext={handleAddToAgentContext}
          />
        );
      case 'waveform':
        return (
          <WaveformViewer
            waveform={waveform}
            summary={summary}
            onAddToAgentContext={handleAddToAgentContext}
          />
        );
      case 'agent':
        return (
          <AgentDeck
            logs={agentLogs}
            onClearLogs={onClearLogs}
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
              netlist: netlist,
              active_file: targetOpenFilePath || topFilePath || 'src/full_adder.vhd',
              active_tab: 'design',
              active_tab_label: 'Design & RTL Studio',
              canvas_live_summary: `${netlist?.nodes.length || 0} gates, ${netlist?.wires.length || 0} nets, ${Object.keys(probeValues).length} active probes, ${Object.keys(activeFaults).length} injected faults. Simulation is ${isSimulating ? 'RUNNING' : 'IDLE'}.`,
              drc_issues: lintMessages || [],
              simulation_summary: summary ? {
                status: summary.assertions?.all_passed ? 'PASSED' : (summary.assertions?.failed ? 'FAILED' : 'COMPLETED'),
                duration_ns: summary.total_time_ns || 100,
                clock_period_ns: 10,
                assertions_passed: summary.assertions?.passed || 0,
                assertions_failed: summary.assertions?.failed || 0,
              } : undefined,
              active_selection: agentContextSelection || undefined,
            }}
            currentPhase={currentPhase}
            openrouterKey={openrouterKey}
            selectedModel={selectedModel}
            onUpdateOpenRouterConfig={onUpdateOpenRouterConfig}
            activeProjectId={activeProjectId}
            currentSelection={agentContextSelection}
            incomingContextItem={incomingContextItem}
            onClearIncomingContext={() => setIncomingContextItem(null)}
            onApplyDesignToCanvas={(code) => {
              handlePushVhdlHistory(vhdlCode);
              onChangeCode(code);
              onSynthesizeAndSimulate(code);
            }}
            onStopAgent={() => onAgentIntervention('stop')}
            onRevertAgent={vhdlHistoryRef.current.length > 0 ? () => {
              const prev = vhdlHistoryRef.current.pop();
              if (prev) {
                onChangeCode(prev);
                onSynthesizeAndSimulate(prev);
              }
            } : undefined}
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
    const isFloating = layoutMode === 'float';

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
          isFloating ? 'hover:border-teal-500/70 hover:shadow-[0_0_20px_rgba(20,184,166,0.2)]' : ''
        }`}
      >
        {/* Window Title Bar */}
        <div
          onMouseDown={(e) => (isFloating && !isMax ? handleStartDrag(e, win.id) : undefined)}
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
            {isFloating && !isMax && (
              <>
                <button
                  onClick={() => snapToHalf(win.id, 'left')}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-teal-300 transition cursor-pointer"
                  title="Snap window to Left Half (50%)"
                >
                  <PanelLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => snapToHalf(win.id, 'right')}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-teal-300 transition cursor-pointer"
                  title="Snap window to Right Half (50%)"
                >
                  <PanelRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
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
              className="absolute top-2 right-0 w-2.5 h-[calc(100%-16px)] cursor-ew-resize z-30 hover:bg-teal-500/40 transition-colors"
              title="Drag right edge to resize width"
            />
            {/* Bottom Edge */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 's')}
              className="absolute bottom-0 left-2 w-[calc(100%-16px)] h-2.5 cursor-ns-resize z-30 hover:bg-teal-500/40 transition-colors"
              title="Drag bottom edge to resize height"
            />
            {/* Left Edge */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 'w')}
              className="absolute top-2 left-0 w-2.5 h-[calc(100%-16px)] cursor-ew-resize z-30 hover:bg-teal-500/40 transition-colors"
              title="Drag left edge to resize width"
            />
            {/* Top Edge */}
            <div
              onMouseDown={(e) => handleStartResize(e, win.id, 'n')}
              className="absolute top-0 left-2 w-[calc(100%-16px)] h-2.5 cursor-ns-resize z-30 hover:bg-teal-500/40 transition-colors"
              title="Drag top edge to resize height"
            />
            {/* Bottom-Right Corner Handle with Visible Grip */}
            <div
              data-testid="window-resize-corner"
              onMouseDown={(e) => handleStartResize(e, win.id, 'se')}
              className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-40 flex items-end justify-end p-1 group bg-slate-900/60 rounded-tl hover:bg-teal-900/60 transition-colors"
              title="Drag corner to resize window"
            >
              <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400 group-hover:border-teal-300 transition-colors" />
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
                  ? 'bg-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.6)]'
                  : 'bg-slate-900 hover:bg-teal-500/40 border-l border-r border-slate-800'
              }`}
              title="Drag to resize Canvas vs RTL Editor · Double-click to reset (50/50)"
            >
              <div className="w-0.5 h-7 rounded-full bg-slate-700/80 group-hover:bg-teal-300 transition-colors flex flex-col items-center justify-center space-y-1">
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

        {/* MODE 2: TILE GRID VIEW (Strict Non-Overlapping CSS Grid) */}
        {layoutMode === 'tile' && (() => {
          const toolPriority: Record<ToolWindowId, number> = {
            schematic: 1,
            editor: 2,
            agent: 3,
            waveform: 4,
            kg: 5,
          };
          const activeKeys = (Object.keys(windows) as ToolWindowId[])
            .filter((id) => windows[id].isOpen && !windows[id].isMinimized)
            .sort((a, b) => toolPriority[a] - toolPriority[b]);

          const count = activeKeys.length;

          let gridClass = 'grid-cols-1 grid-rows-1';
          if (count === 2) {
            gridClass = 'grid-cols-1 lg:grid-cols-2';
          } else if (count === 3) {
            gridClass = 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-12';
          } else if (count >= 4) {
            gridClass = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3';
          }

          return (
            <div className={`w-full h-full p-2 gap-2 grid ${gridClass} relative overflow-hidden bg-slate-950`}>
              {activeKeys.map((id, index) => {
                let colSpan = '';
                if (count === 3) {
                  if (index === 0) colSpan = 'lg:col-span-1 xl:col-span-5';
                  else if (index === 1) colSpan = 'lg:col-span-1 xl:col-span-4';
                  else colSpan = 'lg:col-span-2 xl:col-span-3';
                }
                return (
                  <div key={id} className={`h-full min-h-0 min-w-0 overflow-hidden ${colSpan}`}>
                    {renderWindow(windows[id])}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* MODE 3: FLOATING WINDOWS (Free Drag & Resize with Magnetic Snapping) */}
        {layoutMode === 'float' && (
          <div className="w-full h-full relative overflow-hidden bg-slate-950">
            {/* Visual Snap Candidate Ghost Box */}
            {snapCandidate && (
              <div
                className={`absolute rounded-xl border-2 border-dashed border-teal-400 bg-teal-500/10 backdrop-blur-[1px] pointer-events-none z-40 transition-all duration-150 ${
                  snapCandidate === 'left'
                    ? 'left-2 top-2 w-[calc(50%-12px)] h-[calc(100%-16px)]'
                    : snapCandidate === 'right'
                    ? 'right-2 top-2 w-[calc(50%-12px)] h-[calc(100%-16px)]'
                    : 'left-2 top-2 w-[calc(100%-16px)] h-[calc(100%-16px)]'
                }`}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-3 py-1 rounded-full bg-slate-900 border border-teal-500/80 text-teal-200 text-xs font-mono font-bold shadow-lg">
                    {snapCandidate === 'left' ? 'Snap Left (50%)' : snapCandidate === 'right' ? 'Snap Right (50%)' : 'Maximize Window'}
                  </span>
                </div>
              </div>
            )}

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
                    isVisible ? 'bg-teal-400 shadow-[0_0_6px_rgba(20,184,166,0.8)]' : 'bg-slate-600'
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
                  ? 'bg-slate-800/90 text-teal-300 border border-teal-500/60 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Split View: Dual-Pane Schematic on left + RTL Editor on right"
            >
              <Columns className="w-3 h-3 text-teal-400" />
              <span>Split</span>
            </button>

            <button
              onClick={() => {
                onChangeLayoutMode('tile');
                setTimeout(applyTileLayout, 50);
              }}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
                layoutMode === 'tile'
                  ? 'bg-slate-800/90 text-teal-300 border border-teal-500/60 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Tile Grid: Automatically arrange open windows in non-overlapping tiles"
            >
              <Grid3X3 className="w-3 h-3 text-teal-400" />
              <span>Tile Grid</span>
            </button>

            <button
              onClick={() => onChangeLayoutMode('float')}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
                layoutMode === 'float'
                  ? 'bg-slate-800/90 text-teal-300 border border-teal-500/60 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Float Windows: Freely draggable, resizable, arrangeable studio windows"
            >
              <Layers className="w-3 h-3 text-teal-400" />
              <span>Float</span>
            </button>
          </div>

          <button
            onClick={applyTileLayout}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-900/80 hover:bg-teal-950/60 border border-slate-800 hover:border-teal-500/60 text-slate-300 hover:text-teal-200 text-[11px] font-mono transition cursor-pointer"
            title="Auto-Align: Arrange open windows side-by-side without overlap"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Auto-Align</span>
          </button>

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
