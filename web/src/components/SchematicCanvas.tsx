import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertCircle,
  Download,
  Grid,
  Zap,
  RotateCcw,
  Sparkles,
  LayoutGrid,
  Magnet,
  Users,
  Bot,
  Pause,
  Move,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Sliders,
  PlusCircle,
  Trash2,
  Cable,
  Check,
  Layers,
  Copy,
  RotateCw,
  Eye,
  Activity,
  FileCode,
  CornerDownRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  ShieldAlert,
  FileText,
  AlertOctagon,
  Crosshair,
} from 'lucide-react';
import { NetlistGraph, NetlistNode, NetlistWire, PortDef, SynthesisDiagnostic } from '../types/circuit';
import { ComponentPalette, ComponentBlueprint, COMPONENT_BLUEPRINTS } from './ComponentPalette';
import { evaluateCircuitLogic, formatLogicValue, toBit } from '../utils/circuitSimulator';
import { getFilePalette, formatFileLabel, FileColorPalette } from '../utils/circuitColors';

export interface SchematicCanvasProps {
  netlist: NetlistGraph | null;
  onInjectFault?: (netName: string, faultVal: string | null) => void;
  activeFaults?: Record<string, string>;
  probeValues?: Record<string, string>;
  onToggleInput?: (inputName: string, currentVal: string) => void;
  onSelectSubcircuit?: (circuitId: string) => void;
  agentState?: string;
  isSimulating?: boolean;
  onAgentIntervention?: (action: 'pause' | 'resume' | 'step' | 'steer', params?: { guidance?: string }) => void;
  onLaunchTask?: (goal: string, scale: number, circuitName: string) => void;
  onAddComponent?: (blueprint: ComponentBlueprint, pos: { x: number; y: number }) => void;
  onDeleteComponent?: (nodeId: string) => void;
  onAddWire?: (wire: NetlistWire) => void;
  onDeleteWire?: (wireId: string) => void;
  activeProjectId?: string;
  isAutosaveEnabled?: boolean;
  onNodeSelect?: (node: NetlistNode | null) => void;
  onWireSelect?: (wireId: string | null, wireName?: string) => void;
  onAddToAgentContext?: (item: { type: 'node' | 'wire' | 'code_range' | 'file' | 'canvas_snapshot' | string; label: string; data: any }) => void;
  onClearCanvas?: () => void;
}

export interface CanvasNotification {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: number;
  actionLabel?: string;
  onAction?: () => void;
}

export interface SafetyModalState {
  open: boolean;
  title: string;
  severity: 'prohibited' | 'risky';
  reason: string;
  details: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'node' | 'wire' | 'input' | 'output' | 'canvas';
  target: any;
}

// Strict EDA Grid Constant (20px standard pitch)
const GRID = 20;

// Port name & ID matcher (handles case variations and bus suffixes like [7:0])
const matchPort = (p: { id: string; name: string }, target: string): boolean => {
  if (!target) return false;
  const pId = (p.id || '').toLowerCase();
  const pName = (p.name || '').toLowerCase();
  const targetRaw = target.toLowerCase();
  const t = targetRaw.replace(/\[.*?\]/, '').trim();
  return (
    pId === targetRaw ||
    pName === targetRaw ||
    pId === t ||
    pName === t ||
    pId.endsWith(`_${t}`) ||
    t.endsWith(`_${pId}`) ||
    pName.endsWith(`_${t}`) ||
    t.endsWith(`_${pName}`)
  );
};

// Node dimensions snapped to 20px grid
const getNodeWidth = (node: NetlistNode): number => {
  const gateType = (node.properties?.gate_type || node.type || '').toUpperCase();
  if (
    gateType.includes('RISCV') ||
    gateType.includes('PROCESSOR') ||
    gateType.includes('REG_FILE') ||
    gateType.includes('BRAM') ||
    gateType.includes('DECODER_3TO8') ||
    gateType.includes('MUX8')
  ) {
    return Math.max(Math.round((node.width || 240) / GRID) * GRID, 220);
  }
  return Math.round((node.width || 140) / GRID) * GRID;
};

const getNodeHeight = (node: NetlistNode): number => {
  const maxPins = Math.max(node.inputs?.length || 0, node.outputs?.length || 0);
  const neededHeight = Math.max(node.height || 80, 40 + maxPins * 20 + 20);
  return Math.round(neededHeight / GRID) * GRID;
};

// Check if node is a primitive logic gate
const isPrimitiveGate = (node: NetlistNode): boolean => {
  const gateType = (node.properties?.gate_type || node.type || '').toUpperCase();
  return ['AND', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR', 'NOT', 'INV'].includes(gateType);
};

// Standardized pin Y position on node (strictly a multiple of 20px)
const getNodePinY = (node: NetlistNode, isInput: boolean, pinIndex: number, totalPins: number): number => {
  if (isPrimitiveGate(node)) {
    if (totalPins === 1) return 40;
    if (totalPins === 2) return pinIndex === 0 ? 20 : 60;
    return 20 + pinIndex * 20;
  }
  return 40 + pinIndex * 20;
};

// Exact relative pin position on node (guaranteed to match wire endpoints)
const getPinLocalPos = (node: NetlistNode, isInput: boolean, pinIndex: number, totalPins: number) => {
  const w = getNodeWidth(node);
  const x = isInput ? 0 : w;
  const y = getNodePinY(node, isInput, pinIndex, totalPins);
  return { x, y };
};

// Dynamic layout helpers for primary inputs and outputs ensuring zero spillover and exact wire terminal alignment
export const getPrimaryInputLayout = (pin: { name: string; width?: number }, value?: string) => {
  const displayVal = formatLogicValue(value || '0', pin.width || 1);
  const nameLen = pin.name.length;
  const isBus = (pin.width || 1) > 1;
  const labelWidth = Math.max(32, nameLen * 7.5 + (isBus ? 32 : 0));
  const buttonX = 42 + labelWidth + 8;
  const pillWidth = Math.max(36, displayVal.length * 8.5 + 16);
  const chassisWidth = buttonX + pillWidth + 16;
  return { displayVal, labelWidth, buttonX, pillWidth, chassisWidth, isBus };
};

export const getPrimaryOutputLayout = (pin: { name: string; width?: number }, value?: string) => {
  const displayVal = formatLogicValue(value || '0', pin.width || 1);
  const nameLen = pin.name.length;
  const isBus = (pin.width || 1) > 1;
  const labelWidth = Math.max(32, nameLen * 7.5 + (isBus ? 32 : 0));
  const buttonX = 42 + labelWidth + 8;
  const pillWidth = Math.max(36, displayVal.length * 8.5 + 16);
  const chassisWidth = buttonX + pillWidth + 14;
  return { displayVal, labelWidth, buttonX, pillWidth, chassisWidth, isBus };
};

interface WiringStartPin {
  nodeId: string;
  portName: string;
  isSource: boolean; // true = output or primary input, false = input or primary output
  x: number;
  y: number;
  width: number;
}

interface WireSegment {
  wireId: string;
  wireNet: string;
  isVertical: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  netlist,
  onInjectFault,
  activeFaults = {},
  probeValues = {},
  onToggleInput,
  onSelectSubcircuit,
  agentState = 'IDLE',
  isSimulating = false,
  onAgentIntervention,
  onLaunchTask,
  onAddComponent,
  onDeleteComponent,
  onAddWire,
  onDeleteWire,
  activeProjectId = 'scale1_full_adder',
  isAutosaveEnabled = true,
  onNodeSelect,
  onWireSelect,
  onAddToAgentContext,
  onClearCanvas,
}) => {
  const [zoom, setZoom] = useState<number>(() => {
    if (activeProjectId) {
      try {
        const saved = localStorage.getItem('circuitforge_canvas_view_' + activeProjectId);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed.zoom === 'number') return parsed.zoom;
        }
      } catch (e) {}
    }
    return 1;
  });
  const [pan, setPan] = useState<{ x: number; y: number }>(() => {
    if (activeProjectId) {
      try {
        const saved = localStorage.getItem('circuitforge_canvas_view_' + activeProjectId);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.pan) return parsed.pan;
        }
      } catch (e) {}
    }
    return { x: 0, y: 0 };
  });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [selectedWire, setSelectedWire] = useState<NetlistWire | null>(null);
  const [selectedNode, setSelectedNode] = useState<NetlistNode | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showCoWorkGuide, setShowCoWorkGuide] = useState(false);

  // Palette, Interactive Wiring & Context Menu State
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [pendingPlacePos, setPendingPlacePos] = useState<{ x: number; y: number } | null>(null);
  const [wiringStart, setWiringStart] = useState<WiringStartPin | null>(null);
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredPin, setHoveredPin] = useState<{ nodeId: string; portName: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [safetyModal, setSafetyModal] = useState<SafetyModalState | null>(null);

  // Notifications & Dialogue System
  const [notifications, setNotifications] = useState<CanvasNotification[]>([]);

  const addNotification = useCallback((type: 'error' | 'warning' | 'info' | 'success', title: string, message: string, actionLabel?: string, onAction?: () => void) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setNotifications((prev) => [
      { id, type, title, message, timestamp: Date.now(), actionLabel, onAction },
      ...prev.slice(0, 2), // keep maximum 3 visible
    ]);
    // Auto-dismiss / fade away after 3.5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3500);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Dynamic node positions (grid-snapped)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Custom User Wire Bending, Dragging & Shaping State
  const [wireCustomBends, setWireCustomBends] = useState<Record<string, [number, number][]>>(() => {
    if (activeProjectId) {
      try {
        const saved = localStorage.getItem('circuitforge_wire_bends_' + activeProjectId);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });
  const [draggingWireBend, setDraggingWireBend] = useState<{
    wireId: string;
    type: 'vertical-segment' | 'horizontal-segment' | 'waypoint';
    index: number;
    startPt: { x: number; y: number };
    initialWaypoints: [number, number][];
  } | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  // Multi-File Hierarchy, Inheritance & DRC Health Inspector States
  const [isFileLegendOpen, setIsFileLegendOpen] = useState<boolean>(false);
  const [isDrcDrawerOpen, setIsDrcDrawerOpen] = useState<boolean>(false);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<SynthesisDiagnostic | null>(null);
  const [drcSeverityFilter, setDrcSeverityFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [highlightedDrcNodeId, setHighlightedDrcNodeId] = useState<string | null>(null);
  const [showModuleEnclosures, setShowModuleEnclosures] = useState<boolean>(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const contentGroupRef = useRef<SVGGElement>(null);

  // Unified Node Map for rock-solid wire routing without detachment
  const nodeMap = useMemo(() => {
    if (!netlist) return new Map<string, NetlistNode>();
    const map = new Map<string, NetlistNode>();
    netlist.nodes.forEach((n) => {
      map.set(n.id, n);
      map.set(n.id.toLowerCase(), n);
      map.set(n.label, n);
      map.set(n.label.toLowerCase(), n);
    });
    return map;
  }, [netlist]);

  const lastCircuitNameRef = useRef<string | null>(null);
  const prevCircuitNodeIdsRef = useRef<Set<string>>(new Set());

  // Initialize and snap node and port positions whenever the circuit netlist changes
  useEffect(() => {
    if (!netlist) return;

    const circuitChanged = lastCircuitNameRef.current !== netlist.name;
    lastCircuitNameRef.current = netlist.name;

    // If a single new component was added to the existing circuit, automatically select and focus it
    if (!circuitChanged && prevCircuitNodeIdsRef.current.size > 0) {
      const newlyAdded = netlist.nodes.find((n) => !prevCircuitNodeIdsRef.current.has(n.id));
      if (newlyAdded) {
        setSelectedNode(newlyAdded);
      }
    }
    prevCircuitNodeIdsRef.current = new Set(netlist.nodes.map((n) => n.id));

    setNodePositions((prev) => {
      let savedPositions: Record<string, { x: number; y: number }> = {};
      if (activeProjectId) {
        try {
          const raw = localStorage.getItem('circuitforge_canvas_pos_' + activeProjectId);
          if (raw) savedPositions = JSON.parse(raw);
        } catch (e) {}
      }

      // If switching to a completely different circuit, start fresh from saved or empty; otherwise preserve existing dragged coordinates
      const nextPositions: Record<string, { x: number; y: number }> = circuitChanged
        ? { ...savedPositions }
        : { ...prev, ...savedPositions };

      netlist.nodes.forEach((n) => {
        if (!nextPositions[n.id]) {
          nextPositions[n.id] = {
            x: Math.round(n.x / GRID) * GRID,
            y: Math.round(n.y / GRID) * GRID,
          };
        }
      });
      netlist.primary_inputs.forEach((p, i) => {
        const defaultX = 40;
        const defaultY = Math.round((80 + i * 70) / GRID) * GRID;
        if (!nextPositions[p.id] && !nextPositions[p.name]) {
          nextPositions[p.id] = { x: defaultX, y: defaultY };
          nextPositions[p.name] = { x: defaultX, y: defaultY };
        }
      });
      netlist.primary_outputs.forEach((p, i) => {
        const defaultX = 980;
        const defaultY = Math.round((80 + i * 70) / GRID) * GRID;
        if (!nextPositions[p.id] && !nextPositions[p.name]) {
          nextPositions[p.id] = { x: defaultX, y: defaultY };
          nextPositions[p.name] = { x: defaultX, y: defaultY };
        }
      });
      return nextPositions;
    });

    if (circuitChanged) {
      setSelectedNode(null);
      setSelectedWire(null);
      setWiringStart(null);
      setContextMenu(null);
    }
  }, [netlist, activeProjectId]);

  // Debounced Autosave for Canvas Viewport (Zoom & Pan)
  useEffect(() => {
    if (!isAutosaveEnabled || !activeProjectId) return;
    const timer = setTimeout(() => {
      localStorage.setItem('circuitforge_canvas_view_' + activeProjectId, JSON.stringify({ zoom, pan }));
    }, 400);
    return () => clearTimeout(timer);
  }, [zoom, pan, isAutosaveEnabled, activeProjectId]);

  // Debounced Autosave for Node Positions
  useEffect(() => {
    if (!isAutosaveEnabled || !activeProjectId) return;
    if (Object.keys(nodePositions).length === 0) return;
    const timer = setTimeout(() => {
      localStorage.setItem('circuitforge_canvas_pos_' + activeProjectId, JSON.stringify(nodePositions));
    }, 400);
    return () => clearTimeout(timer);
  }, [nodePositions, isAutosaveEnabled, activeProjectId]);

  // Multi-File Origin Stats
  const fileOriginsList = useMemo(() => {
    if (!netlist) return [];
    const fileMap: Record<string, { file: string; count: number; module: string; palette: FileColorPalette }> = {};
    netlist.nodes.forEach((n) => {
      const f = n.source_file || 'top.vhd';
      if (!fileMap[f]) {
        fileMap[f] = {
          file: f,
          count: 0,
          module: n.source_module || f.replace(/\.[^/.]+$/, ''),
          palette: getFilePalette(f),
        };
      }
      fileMap[f].count++;
    });
    return Object.values(fileMap);
  }, [netlist]);

  // Submodule Hierarchy Enclosures
  const moduleEnclosures = useMemo(() => {
    if (!netlist || !showModuleEnclosures) return [];
    const groups: Record<string, { file: string; module: string; nodes: NetlistNode[]; palette: FileColorPalette }> = {};

    netlist.nodes.forEach((n) => {
      const groupKey = n.parent_instance || (n.source_file && n.source_file !== 'top.vhd' ? n.source_file : null);
      if (!groupKey) return;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          file: n.source_file || groupKey,
          module: n.source_module || n.parent_instance || groupKey.replace(/\.[^/.]+$/, ''),
          nodes: [],
          palette: getFilePalette(n.source_file || groupKey),
        };
      }
      groups[groupKey].nodes.push(n);
    });

    return Object.entries(groups)
      .filter(([_, g]) => {
        // Enclosure should only be drawn if it represents a distinct SUBMODULE, not the entire top-level netlist!
        if (g.nodes.length >= netlist.nodes.length) return false;
        // If all nodes come from a single file and no parent_instance exists, suppress full-canvas enclosure
        if (fileOriginsList.length <= 1 && !g.nodes.some((n) => n.parent_instance)) return false;
        return g.nodes.length >= 2;
      })
      .map(([key, g]) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        g.nodes.forEach((n) => {
          const pos = nodePositions[n.id] || { x: n.x, y: n.y };
          const w = getNodeWidth(n);
          const h = getNodeHeight(n);
          if (pos.x < minX) minX = pos.x;
          if (pos.y < minY) minY = pos.y;
          if (pos.x + w > maxX) maxX = pos.x + w;
          if (pos.y + h > maxY) maxY = pos.y + h;
        });
        return {
          id: key,
          module: g.module,
          file: g.file,
          palette: g.palette,
          nodeCount: g.nodes.length,
          x: minX - 25,
          y: minY - 35,
          width: maxX - minX + 50,
          height: maxY - minY + 55,
        };
      });
  }, [netlist, nodePositions, showModuleEnclosures]);

  // Comprehensive Synthesis & Schematic DRC Diagnostics
  const allDrcDiagnostics = useMemo(() => {
    if (!netlist) return [];
    const list: SynthesisDiagnostic[] = [...(netlist.diagnostics || [])];

    // Node diagnostics
    netlist.nodes.forEach((n) => {
      if (n.diagnostics && n.diagnostics.length > 0) {
        n.diagnostics.forEach((d) => {
          if (!list.some((existing) => existing.code === d.code && existing.target_node === d.target_node && existing.target_port === d.target_port)) {
            list.push(d);
          }
        });
      }
    });

    // Wire conflict diagnostics
    netlist.wires.forEach((w) => {
      if (w.has_conflict) {
        if (!list.some((existing) => existing.target_signal === w.id || (existing.target_node === w.target_node && existing.target_port === w.target_port))) {
          list.push({
            code: 'DRC-E102',
            severity: 'error',
            title: 'Bus Contention Short-Circuit',
            message: `Multiple active push-pull drivers contending on net "${w.label || w.id}" targeting ${w.target_node}.${w.target_port}.`,
            hardware_consequence: 'Short circuit between conflicting CMOS output driver stages (VDD to GND direct path), causing extreme thermal dissipation (~100mA+), logic voltage indeterminacy, and permanent silicon burnout.',
            target_signal: w.id,
            target_node: w.target_node,
            target_port: w.target_port,
            suggested_fix: 'Insert a 2-to-1 multiplexer or tri-state buffer with high-impedance (Z) control before driving this net.',
          });
        }
      }
    });

    // Live floating input pins
    netlist.nodes.forEach((n) => {
      n.inputs.forEach((pin) => {
        const pName = (pin.name || '').toLowerCase();
        if (pName === 'clk' || pName === 'clock' || pName === 'gnd' || pName === 'vcc') return;

        const isDriven = netlist.wires.some((w) => {
          return (
            (w.target_node === n.id || w.target_node.toLowerCase() === n.id.toLowerCase()) &&
            (matchPort(pin, w.target_port) || w.target_port.toLowerCase() === pName)
          );
        });

        if (!isDriven) {
          const alreadyLogged = list.some(
            (d) => (d.target_node === n.id || d.target_node === n.label) && (d.target_port === pin.name || d.target_port?.toLowerCase() === pName)
          );
          if (!alreadyLogged) {
            list.push({
              code: 'DRC-E101',
              severity: 'error',
              title: `Floating Input Pin: ${n.label || n.id}.${pin.name}`,
              message: `Input pin "${pin.name}" of component "${n.label || n.id}" is left unconnected and floating.`,
              hardware_consequence: 'CMOS gate floating inputs have infinite impedance (~10^12 Ω) and collect ambient static charge. The gate voltage drifts into the intermediate transition region (~VDD/2), conducting both PMOS and NMOS channels simultaneously (crowbar short-circuit current ~mA, causing localized overheating and erratic oscillation).',
              target_node: n.id,
              target_port: pin.name,
              source_file: n.source_file || 'top.vhd',
              suggested_fix: `Connect pin "${pin.name}" to a driving output net, or tie it to a stable pull-up ('1') or pull-down ('0') rail.`,
            });
          }
        }
      });
    });

    return list;
  }, [netlist]);

  // Check whether an input pin is floating / undriven
  const isInputPinUndriven = useCallback(
    (node: NetlistNode, pin: PortDef): boolean => {
      if (!netlist) return false;
      const pName = (pin.name || '').toLowerCase();
      if (pName === 'clk' || pName === 'clock' || pName === 'gnd' || pName === 'vcc') return false;

      const isDriven = netlist.wires.some(
        (w) =>
          (w.target_node === node.id || w.target_node.toLowerCase() === node.id.toLowerCase()) &&
          (matchPort(pin, w.target_port) || w.target_port.toLowerCase() === pName)
      );
      return !isDriven;
    },
    [netlist]
  );

  // Exact Canvas coordinate mapping via SVG CTM
  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    if (!contentGroupRef.current || !svgRef.current) return { x: 0, y: 0 };
    const ctm = contentGroupRef.current.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);

  // Dynamically calculate bounding box and auto-frame circuit to fit container
  const handleFitToView = useCallback(() => {
    if (!netlist) return;
    const allX: number[] = [];
    const allY: number[] = [];

    (netlist.primary_inputs || []).forEach((pi, i) => {
      const pos = nodePositions[pi.id] || nodePositions[pi.name] || { x: 40, y: 80 + i * 70 };
      allX.push(pos.x, pos.x + 80);
      allY.push(pos.y, pos.y + 40);
    });

    (netlist.primary_outputs || []).forEach((po, i) => {
      const pos = nodePositions[po.id] || nodePositions[po.name] || { x: 980, y: 80 + i * 70 };
      allX.push(pos.x, pos.x + 80);
      allY.push(pos.y, pos.y + 40);
    });

    (netlist.nodes || []).forEach((n) => {
      const pos = nodePositions[n.id] || { x: n.x || 200, y: n.y || 100 };
      const w = n.width || 140;
      const h = n.height || 100;
      allX.push(pos.x, pos.x + w);
      allY.push(pos.y, pos.y + h);
    });

    if (allX.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    const circuitW = maxX - minX + 100;
    const circuitH = maxY - minY + 100;
    const circuitCenterX = (minX + maxX) / 2;
    const circuitCenterY = (minY + maxY) / 2;

    const svgRect = svgRef.current ? svgRef.current.getBoundingClientRect() : { width: 700, height: 600 };
    const containerW = svgRect.width > 100 ? svgRect.width : 700;
    const containerH = svgRect.height > 100 ? svgRect.height : 600;

    const targetZoom = Math.min(1.4, Math.max(0.4, Math.min((containerW - 60) / circuitW, (containerH - 60) / circuitH)));
    const targetPanX = containerW / 2 - circuitCenterX * targetZoom;
    const targetPanY = containerH / 2 - circuitCenterY * targetZoom;

    setZoom(Number(targetZoom.toFixed(2)));
    setPan({ x: Math.round(targetPanX), y: Math.round(targetPanY) });
    addNotification('info', 'Circuit Auto-Framed', `View centered at ${Math.round(targetZoom * 100)}% scale`);
  }, [netlist, nodePositions, addNotification]);

  // Keep track of recent additions to prevent batch collision before state update settles
  const recentPlacementsRef = useRef<Array<{ x: number; y: number; w: number; h: number; timestamp: number }>>([]);

  // Smart Collision Detection & Empty Canvas Slot Finder
  const findEmptyCanvasSlot = useCallback(
    (
      desiredPos: { x: number; y: number },
      compWidth = 140,
      compHeight = 80
    ): { position: { x: number; y: number }; requiresZoomOut: boolean } => {
      const padX = 35;
      const padY = 25;

      // Clean up recent placements older than 6 seconds
      const now = Date.now();
      recentPlacementsRef.current = recentPlacementsRef.current.filter((p) => now - p.timestamp < 6000);

      // Gather all occupied obstacles
      const obstacles: Array<{ x: number; y: number; w: number; h: number }> = [];

      // 1. Existing circuit nodes
      (netlist?.nodes || []).forEach((n) => {
        const pos = nodePositions[n.id] || { x: n.x, y: n.y };
        obstacles.push({
          x: pos.x,
          y: pos.y,
          w: n.width || 140,
          h: n.height || 80,
        });
      });

      // 2. Fresh recent placements (immune to React state update batching)
      recentPlacementsRef.current.forEach((p) => {
        obstacles.push({
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
        });
      });

      // 3. Primary inputs (left side)
      (netlist?.primary_inputs || []).forEach((pi, idx) => {
        const pos = nodePositions[pi.id] || nodePositions[pi.name] || { x: 40, y: 80 + idx * 70 };
        obstacles.push({
          x: pos.x,
          y: pos.y,
          w: 140,
          h: 46,
        });
      });

      // 4. Primary outputs (right side)
      (netlist?.primary_outputs || []).forEach((po, idx) => {
        const pos = nodePositions[po.id] || nodePositions[po.name] || { x: 980, y: 80 + idx * 70 };
        obstacles.push({
          x: pos.x,
          y: pos.y,
          w: 140,
          h: 46,
        });
      });

      const collidesWithAny = (x: number, y: number) => {
        // Must stay to the right of inputs (x >= 220)
        if (x < 210) return true;
        return obstacles.some((obs) => {
          return (
            x < obs.x + obs.w + padX &&
            x + compWidth + padX > obs.x &&
            y < obs.y + obs.h + padY &&
            y + compHeight + padY > obs.y
          );
        });
      };

      // Check if desired initial position is free
      const initX = Math.max(220, Math.round(desiredPos.x / GRID) * GRID);
      const initY = Math.max(80, Math.round(desiredPos.y / GRID) * GRID);

      if (!collidesWithAny(initX, initY)) {
        const chosen = { x: initX, y: initY };
        recentPlacementsRef.current.push({ ...chosen, w: compWidth, h: compHeight, timestamp: now });
        return {
          position: chosen,
          requiresZoomOut: initX > 1360 || initY > 700,
        };
      }

      // Systematic search across standard schematic channels
      // Standard visible canvas work area is x from 260 to 1320, y from 80 to 680
      const candidateCols = [260, 480, 700, 920, 1140, 1320];
      const candidateRows = [80, 180, 280, 380, 480, 580, 680];

      const candidates: Array<{ x: number; y: number; dist: number; isExpanded: boolean }> = [];

      for (const colX of candidateCols) {
        for (const rowY of candidateRows) {
          if (!collidesWithAny(colX, rowY)) {
            const dx = colX - desiredPos.x;
            const dy = rowY - desiredPos.y;
            // Only considered expanded if outside standard visible schematic zone
            const isExpanded = colX > 1360 || rowY > 700;
            candidates.push({
              x: colX,
              y: rowY,
              dist: Math.hypot(dx, dy),
              isExpanded,
            });
          }
        }
      }

      if (candidates.length > 0) {
        // Prefer unexpanded area first; within tier, pick closest to requested location
        candidates.sort((a, b) => {
          if (a.isExpanded !== b.isExpanded) {
            return a.isExpanded ? 1 : -1;
          }
          return a.dist - b.dist;
        });

        const best = candidates[0];
        const chosen = { x: best.x, y: best.y };
        recentPlacementsRef.current.push({ ...chosen, w: compWidth, h: compHeight, timestamp: now });
        // Only zoom out if no slots were available in the standard canvas area
        const requiresZoomOut = best.isExpanded;
        return {
          position: chosen,
          requiresZoomOut,
        };
      }

      // Fallback below lowest obstacle
      let maxObsY = 80;
      obstacles.forEach((obs) => {
        if (obs.y + obs.h > maxObsY) maxObsY = obs.y + obs.h;
      });
      const fallbackPos = {
        x: 360,
        y: Math.round((maxObsY + 60) / GRID) * GRID,
      };
      recentPlacementsRef.current.push({ ...fallbackPos, w: compWidth, h: compHeight, timestamp: now });
      return {
        position: fallbackPos,
        requiresZoomOut: true,
      };
    },
    [netlist, nodePositions]
  );

  // Auto zoom-out and smooth pan adjustment only when canvas space is genuinely exhausted
  const applyAutoZoomPan = useCallback(
    (placePos: { x: number; y: number }) => {
      setZoom((z) => {
        if (z <= 0.6) return z;
        const nextZoom = Math.max(0.5, Number((z * 0.9).toFixed(2)));
        const svgRect = svgRef.current ? svgRef.current.getBoundingClientRect() : null;
        if (svgRect && svgRect.width > 50 && svgRect.height > 50) {
          const containerW = svgRect.width;
          const containerH = svgRect.height;
          setPan((prevPan) => {
            let nx = prevPan.x;
            let ny = prevPan.y;
            const nodeScreenX = placePos.x * nextZoom + prevPan.x;
            const nodeScreenY = placePos.y * nextZoom + prevPan.y;
            if (nodeScreenX > containerW - 160) {
              nx = containerW - 160 - placePos.x * nextZoom;
            }
            if (nodeScreenY > containerH - 120) {
              ny = containerH - 120 - placePos.y * nextZoom;
            }
            return { x: Math.round(nx), y: Math.round(ny) };
          });
        }
        return nextZoom;
      });
      addNotification('info', 'Canvas Zoomed Out', 'Canvas auto-expanded to fit component outside standard area.');
    },
    [addNotification]
  );

  // Global window listeners for drag, pan, keyboard, and click-away dismissal
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      setMouseCanvasPos(pt);

      if (draggingWireBend) {
        let targetX = pt.x;
        let targetY = pt.y;
        if (snapToGrid) {
          targetX = Math.round(targetX / GRID) * GRID;
          targetY = Math.round(targetY / GRID) * GRID;
        }

        setWireCustomBends((prev) => {
          const init = draggingWireBend.initialWaypoints;
          let newWaypoints: [number, number][];

          if (draggingWireBend.type === 'vertical-segment') {
            const i = draggingWireBend.index;
            newWaypoints = init.map((p) => [...p] as [number, number]);
            if (newWaypoints[i] && newWaypoints[i + 1]) {
              newWaypoints[i][0] = targetX;
              newWaypoints[i + 1][0] = targetX;
            }
          } else if (draggingWireBend.type === 'horizontal-segment') {
            const i = draggingWireBend.index;
            if (init && init.length === 4 && init[0] && init[1] && init[2] && init[3] && (i === 0 || i === 2)) {
              const p0 = init[0];
              const xM = init[1][0];
              const p3 = init[3];
              if (i === 0) {
                const splitX = Math.round((p0[0] + xM) / 2 / GRID) * GRID;
                newWaypoints = [
                  [p0[0], p0[1]],
                  [splitX, p0[1]],
                  [splitX, targetY],
                  [xM, targetY],
                  [xM, init[2][1]],
                  [p3[0], p3[1]],
                ];
              } else {
                const splitX = Math.round((xM + p3[0]) / 2 / GRID) * GRID;
                newWaypoints = [
                  [p0[0], p0[1]],
                  [xM, init[1][1]],
                  [xM, targetY],
                  [splitX, targetY],
                  [splitX, p3[1]],
                  [p3[0], p3[1]],
                ];
              }
            } else {
              newWaypoints = (init || []).map((p) => [...p] as [number, number]);
              if (newWaypoints[i] && newWaypoints[i + 1]) {
                newWaypoints[i][1] = targetY;
                newWaypoints[i + 1][1] = targetY;
              }
            }
          } else {
            // waypoint corner drag
            const i = draggingWireBend.index;
            newWaypoints = init.map((p) => [...p] as [number, number]);
            if (newWaypoints[i]) {
              newWaypoints[i] = [targetX, targetY];
              if (i > 0 && newWaypoints[i - 1]) {
                if (Math.abs(init[i - 1][0] - init[i][0]) < 2) {
                  newWaypoints[i - 1][0] = targetX;
                } else {
                  newWaypoints[i - 1][1] = targetY;
                }
              }
              if (i < newWaypoints.length - 1 && newWaypoints[i + 1]) {
                if (Math.abs(init[i + 1][0] - init[i][0]) < 2) {
                  newWaypoints[i + 1][0] = targetX;
                } else {
                  newWaypoints[i + 1][1] = targetY;
                }
              }
            }
          }

          return {
            ...prev,
            [draggingWireBend.wireId]: newWaypoints,
          };
        });
      } else if (draggingNodeId) {
        let newX = pt.x - dragOffset.x;
        let newY = pt.y - dragOffset.y;

        if (snapToGrid) {
          newX = Math.round(newX / GRID) * GRID;
          newY = Math.round(newY / GRID) * GRID;
        }

        setNodePositions((prev) => {
          const updated = {
            ...prev,
            [draggingNodeId]: { x: newX, y: newY },
          };
          if (netlist) {
            const inPin = netlist.primary_inputs.find((p) => p.id === draggingNodeId || p.name === draggingNodeId);
            if (inPin) {
              updated[inPin.id] = { x: newX, y: newY };
              updated[inPin.name] = { x: newX, y: newY };
            }
            const outPin = netlist.primary_outputs.find((p) => p.id === draggingNodeId || p.name === draggingNodeId);
            if (outPin) {
              updated[outPin.id] = { x: newX, y: newY };
              updated[outPin.name] = { x: newX, y: newY };
            }
          }
          return updated;
        });
      } else if (isPanning) {
        setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      }
    };

    const handleGlobalMouseUp = () => {
      setDraggingNodeId(null);
      setDraggingWireBend(null);
      setIsPanning(false);
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode && onDeleteComponent) {
          addNotification('info', 'Component Deleted', `Removed component ${selectedNode.label} from circuit.`);
          onDeleteComponent(selectedNode.id);
          setSelectedNode(null);
        } else if (selectedWire && onDeleteWire) {
          addNotification('info', 'Wire Deleted', `Removed connection ${selectedWire.label || selectedWire.id}.`);
          onDeleteWire(selectedWire.id);
          setSelectedWire(null);
        }
      } else if (e.key === 'Escape') {
        setWiringStart(null);
        setSelectedNode(null);
        setSelectedWire(null);
        setIsPaletteOpen(false);
        setContextMenu(null);
      }
    };

    const handleGlobalClick = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only dismiss on primary left click
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest('#eda-context-menu')) {
        return;
      }
      setContextMenu(null);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('click', handleGlobalClick);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [draggingNodeId, draggingWireBend, dragOffset, snapToGrid, isPanning, startPan, getCanvasPoint, selectedNode, selectedWire, onDeleteComponent, onDeleteWire, addNotification]);

  // Safe Component Deletion with Impact Warning
  const handleDeleteComponentSafe = useCallback((node: NetlistNode) => {
    const connectedWires = netlist?.wires.filter(
      (w) =>
        w.source_node === node.id ||
        w.target_node === node.id ||
        w.source_node === node.label ||
        w.target_node === node.label
    ) || [];

    if (connectedWires.length > 0) {
      setSafetyModal({
        open: true,
        title: 'Risky Operation: Deleting Connected Component',
        severity: 'risky',
        reason: `Removing gate/block "${node.label}" (${node.id}) will sever ${connectedWires.length} active interconnect net${connectedWires.length > 1 ? 's' : ''}.`,
        details: `Connected nets: ${connectedWires.map((w) => w.label || w.id).join(', ')}. Severing these routes leaves downstream logic gates with floating inputs and breaks the circuit dataflow path.`,
        confirmLabel: 'Confirm & Sever Nets',
        onConfirm: () => {
          onDeleteComponent && onDeleteComponent(node.id);
          addNotification('info', 'Component Removed', `Deleted ${node.label} and severed ${connectedWires.length} connected net(s).`);
          setSelectedNode(null);
          setSafetyModal(null);
        },
      });
    } else {
      onDeleteComponent && onDeleteComponent(node.id);
      addNotification('info', 'Component Removed', `Deleted ${node.label}.`);
      setSelectedNode(null);
    }
  }, [netlist, onDeleteComponent, onDeleteWire, addNotification]);

  // Safe Fault Injection with Clock/Reset Warning
  const handleInjectFaultSafe = useCallback((netName: string, faultVal: string | null) => {
    const isClock = netName.toLowerCase().includes('clk');
    const isReset = netName.toLowerCase().includes('rst') || netName.toLowerCase().includes('reset');

    if (faultVal !== null && (isClock || isReset)) {
      setSafetyModal({
        open: true,
        title: `Risky Operation: ${isClock ? 'Clock Tree' : 'Global Reset'} Fault Injection`,
        severity: 'risky',
        reason: `Forcing Stuck-at-${faultVal} (SA${faultVal}) on critical synchronization net "${netName}".`,
        details: isClock
          ? 'The clock distribution net orchestrates synchronous flip-flop state transitions. A stuck-at fault halts the clock distribution network, permanently freezing all downstream registers and halting sequential execution.'
          : 'The reset line controls state machine initialization. Forcing this net will lock the entire design in indefinite reset or prevent registers from achieving a deterministic power-up state.',
        confirmLabel: 'Force Fault Anyway',
        onConfirm: () => {
          onInjectFault && onInjectFault(netName, faultVal);
          addNotification('warning', 'Fault Injected', `Forced SA${faultVal} on critical net ${netName}`);
          setSafetyModal(null);
        },
      });
    } else {
      onInjectFault && onInjectFault(netName, faultVal);
      if (faultVal !== null) {
        addNotification('warning', 'Fault Injected', `Forced SA${faultVal} on ${netName}`);
      } else {
        addNotification('success', 'Fault Cleared', `Fault cleared on ${netName}`);
      }
    }
  }, [onInjectFault, addNotification]);

  // Node & Port Drag Handlers
  const handleNodeMouseDown = (e: React.MouseEvent, node: NetlistNode) => {
    if (e.button !== 0) return;
    if (wiringStart) return;
    e.stopPropagation();
    setSelectedNode(node);
    setSelectedWire(null);
    setContextMenu(null);
    onNodeSelect?.(node);
    const pt = getCanvasPoint(e.clientX, e.clientY);
    const currentPos = nodePositions[node.id] || {
      x: Math.round(node.x / GRID) * GRID,
      y: Math.round(node.y / GRID) * GRID,
    };
    setDraggingNodeId(node.id);
    setDragOffset({ x: pt.x - currentPos.x, y: pt.y - currentPos.y });
  };

  const handlePortMouseDown = (e: React.MouseEvent, portId: string, defaultPos: { x: number; y: number }) => {
    if (e.button !== 0) return;
    if (wiringStart) return;
    e.stopPropagation();
    setSelectedNode(null);
    setSelectedWire(null);
    setContextMenu(null);
    const pt = getCanvasPoint(e.clientX, e.clientY);
    const currentPos = nodePositions[portId] || defaultPos;
    setDraggingNodeId(portId);
    setDragOffset({ x: pt.x - currentPos.x, y: pt.y - currentPos.y });
  };

  // Canvas Pan & Zoom Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as Element;
    const isBg =
      target === (svgRef.current as any) ||
      target.id === 'canvas-bg-rect' ||
      target.tagName?.toLowerCase() === 'svg' ||
      (target.tagName?.toLowerCase() === 'rect' && target.getAttribute('fill')?.includes('schematic-grid'));

    // Left click on background (0) or Middle click anywhere (1)
    if (e.button === 1 || (e.button === 0 && isBg)) {
      if (wiringStart) {
        setWiringStart(null);
        return;
      }
      setContextMenu(null);
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.max(0.15, Math.min(3.5, Number((prev * zoomFactor).toFixed(3)))));
  };

  // Shared Wiring Completion Handler (supports both click-to-click and drag-to-connect)
  const completeWiring = (pinA: WiringStartPin, pinB: WiringStartPin) => {
    if (pinA.nodeId === pinB.nodeId && pinA.portName === pinB.portName) {
      setWiringStart(null);
      return;
    }

    // Check Prohibited Direction Rules (Output-to-Output or Input-to-Input)
    if (pinA.isSource === pinB.isSource) {
      if (pinA.isSource) {
        setSafetyModal({
          open: true,
          title: 'Prohibited Operation: Output-to-Output Driver Contention',
          severity: 'prohibited',
          reason: 'Direct electrical connection of two active output driver terminals is strictly prohibited.',
          details: 'In CMOS digital logic, connecting two totem-pole output stages directly creates a low-impedance bus contention fault whenever one output drives V_DD (logic 1) while the other drives GND (logic 0). This causes excessive short-circuit current, destructive thermal heating, and creates an indeterminate logic state ("X"). To combine outputs, insert a multiplexer, an OR/AND logic gate, or a tri-state buffer.',
        });
      } else {
        setSafetyModal({
          open: true,
          title: 'Prohibited Operation: Floating Input-to-Input Net',
          severity: 'prohibited',
          reason: 'Connecting two input pins together without a driving output leaves the net floating in high impedance (Z).',
          details: 'Digital logic inputs are high-impedance capacitive MOSFET gates that draw negligible static current and cannot source electrical potential. A net formed exclusively between inputs lacks a driver, resulting in a floating high-impedance state (Hi-Z) that picks up EMI noise and capacitive crosstalk, leading to unpredictable oscillations. Connect an active output pin or primary input to drive this net.',
        });
      }
      setWiringStart(null);
      return;
    }

    // Check Bus Width Mismatch
    if (pinA.width !== pinB.width) {
      setSafetyModal({
        open: true,
        title: 'Prohibited Operation: Bus Width Mismatch',
        severity: 'prohibited',
        reason: `Cannot connect a ${pinA.width}-bit bus to a ${pinB.width}-bit port directly.`,
        details: 'Under IEEE 1076 VHDL typing standards, interconnect bus widths must match exactly (std_logic to std_logic, or std_logic_vector with identical dimensions). Implicit bus truncation or unaligned bit-width mapping is rejected by synthesis compilers. Use bit-slicing syntax or an adapter block.',
      });
      setWiringStart(null);
      return;
    }

    const src = pinA.isSource ? pinA : pinB;
    const tgt = pinA.isSource ? pinB : pinA;

    const newWire: NetlistWire = {
      id: `wire_${Date.now().toString().slice(-6)}`,
      label: `${src.portName}_to_${tgt.portName}`,
      source_node: src.nodeId,
      source_port: src.portName,
      target_node: tgt.nodeId,
      target_port: tgt.portName,
      width: Math.max(src.width, tgt.width),
    };

    if (onAddWire) {
      onAddWire(newWire);
      addNotification('success', 'Net Routed', `Connected ${src.nodeId}:${src.portName} → ${tgt.nodeId}:${tgt.portName}`);
    }
    setWiringStart(null);
  };

  // Interactive Pin Click (for Pin-to-Pin click routing)
  const handlePinClick = (
    e: React.MouseEvent,
    nodeId: string,
    portName: string,
    isSource: boolean,
    pinX: number,
    pinY: number,
    width: number = 1
  ) => {
    e.stopPropagation();

    if (!wiringStart) {
      setWiringStart({
        nodeId,
        portName,
        isSource,
        x: pinX,
        y: pinY,
        width,
      });
    } else {
      completeWiring(wiringStart, { nodeId, portName, isSource, x: pinX, y: pinY, width });
    }
  };

  // Topological Auto-Organize Layout (strictly on 20px grid lines, no clumping)
  const handleAutoOrganize = () => {
    if (!netlist || netlist.nodes.length === 0) return;

    // Canonical ID/Label resolver
    const resolveNode = (key: string): NetlistNode | undefined => {
      if (!key) return undefined;
      return nodeMap.get(key) || nodeMap.get(key.toLowerCase());
    };

    const inputPinIds = new Set(
      netlist.primary_inputs.map((p) => p.name.toLowerCase()).concat(netlist.primary_inputs.map((p) => p.id.toLowerCase()))
    );

    // 1. Separate connected nodes vs unconnected/free nodes
    const connectedNodeIds = new Set<string>();
    netlist.wires.forEach((w) => {
      const srcNode = resolveNode(w.source_node);
      const tgtNode = resolveNode(w.target_node);
      if (srcNode) connectedNodeIds.add(srcNode.id);
      if (tgtNode) connectedNodeIds.add(tgtNode.id);
    });

    const connectedNodes = netlist.nodes.filter((n) => connectedNodeIds.has(n.id));
    const floatingNodes = netlist.nodes.filter((n) => !connectedNodeIds.has(n.id));

    // 2. Assign topological depth levels to connected nodes
    const nodeLevels: Record<string, number> = {};

    connectedNodes.forEach((node) => {
      // Fed directly by primary inputs?
      const fedByPrimaryInput = netlist.wires.some((w) => {
        const tgt = resolveNode(w.target_node);
        return tgt?.id === node.id && inputPinIds.has(w.source_node.toLowerCase());
      });
      // Fed by any other logic gate?
      const fedByOtherGate = netlist.wires.some((w) => {
        const tgt = resolveNode(w.target_node);
        const src = resolveNode(w.source_node);
        return tgt?.id === node.id && src !== undefined && src.id !== node.id;
      });

      if (fedByPrimaryInput && !fedByOtherGate) {
        nodeLevels[node.id] = 1;
      } else {
        nodeLevels[node.id] = fedByPrimaryInput ? 1 : 2;
      }
    });

    // Propagate topological levels through wire dataflow
    for (let pass = 0; pass < 8; pass++) {
      netlist.wires.forEach((w) => {
        const srcNode = resolveNode(w.source_node);
        const tgtNode = resolveNode(w.target_node);
        if (srcNode && tgtNode && srcNode.id !== tgtNode.id) {
          const srcLvl = nodeLevels[srcNode.id] || 1;
          const tgtLvl = nodeLevels[tgtNode.id] || 1;
          if (tgtLvl <= srcLvl) {
            nodeLevels[tgtNode.id] = srcLvl + 1;
          }
        }
      });
    }

    // Group connected nodes by level
    const levels: Record<number, NetlistNode[]> = {};
    connectedNodes.forEach((node) => {
      const lvl = nodeLevels[node.id] || 1;
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(node);
    });

    const levelKeys = Object.keys(levels)
      .map(Number)
      .sort((a, b) => a - b);
    const totalLevels = Math.max(1, levelKeys.length);

    const xStart = 260;
    const xStep = Math.max(260, Math.min(340, Math.floor(660 / Math.max(1, totalLevels))));

    const newPositions: Record<string, { x: number; y: number }> = {};
    let maxUsedX = xStart;

    // Place connected nodes level by level
    levelKeys.forEach((lvl, colIdx) => {
      const nodesInLevel = levels[lvl];
      const baseColX = xStart + colIdx * xStep;

      // Wrap if more than 3 nodes per column to avoid excessive vertical stacking
      const maxPerCol = 3;
      nodesInLevel.forEach((node, idx) => {
        const subCol = Math.floor(idx / maxPerCol);
        const rowInSubCol = idx % maxPerCol;
        const colCount = Math.min(nodesInLevel.length - subCol * maxPerCol, maxPerCol);

        const x = Math.round((baseColX + subCol * 180) / GRID) * GRID;
        if (x > maxUsedX) maxUsedX = x;

        const rowSpacing = 160;
        const totalH = (colCount - 1) * rowSpacing;
        const startY = Math.max(80, Math.round((360 - totalH / 2) / GRID) * GRID);
        const y = Math.round((startY + rowInSubCol * rowSpacing) / GRID) * GRID;

        newPositions[node.id] = { x, y };
      });
    });

    // Place floating/unconnected nodes in a neat staging bench grid to the right
    if (floatingNodes.length > 0) {
      const stageBaseX = Math.round((Math.max(maxUsedX + 220, 840)) / GRID) * GRID;
      floatingNodes.forEach((node, fIdx) => {
        const fCol = Math.floor(fIdx / 4);
        const fRow = fIdx % 4;
        const x = stageBaseX + fCol * 180;
        const y = 80 + fRow * 140;
        newPositions[node.id] = { x, y };
      });
    }

    setNodePositions(newPositions);
    if (activeProjectId && isAutosaveEnabled) {
      localStorage.setItem('circuitforge_canvas_pos_' + activeProjectId, JSON.stringify(newPositions));
    }
    addNotification('info', 'Auto-Organize', 'Components arranged in clear dataflow stages on 20px grid.');
  };

  // Reset to default netlist positions
  const handleResetLayout = () => {
    if (!netlist) return;
    if (activeProjectId) {
      localStorage.removeItem('circuitforge_canvas_pos_' + activeProjectId);
      localStorage.removeItem('circuitforge_canvas_view_' + activeProjectId);
    }
    const defaults: Record<string, { x: number; y: number }> = {};
    netlist.nodes.forEach((n) => {
      defaults[n.id] = {
        x: Math.round(n.x / GRID) * GRID,
        y: Math.round(n.y / GRID) * GRID,
      };
    });
    setNodePositions(defaults);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    addNotification('info', 'Reset View', 'Layout restored to initial circuit state.');
  };

  // Clear all components and connections from the schematic canvas
  const handleClearCanvas = useCallback(() => {
    setSelectedNode(null);
    setSelectedWire(null);
    setNodePositions({});
    if (activeProjectId) {
      try {
        localStorage.removeItem('circuitforge_canvas_pos_' + activeProjectId);
      } catch (e) {}
    }
    if (onClearCanvas) {
      onClearCanvas();
    }
    addNotification('info', 'Canvas Cleared', 'All schematic components, connections, and DRC markers removed.');
  }, [activeProjectId, onClearCanvas, addNotification]);

  // Nudge selected node by grid units
  const handleNudgeNode = (dx: number, dy: number) => {
    if (!selectedNode) return;
    const cur = nodePositions[selectedNode.id] || {
      x: Math.round(selectedNode.x / GRID) * GRID,
      y: Math.round(selectedNode.y / GRID) * GRID,
    };
    const nextX = Math.round(Math.max(200, Math.min(1160, cur.x + dx)) / GRID) * GRID;
    const nextY = Math.round(Math.max(40, Math.min(640, cur.y + dy)) / GRID) * GRID;
    setNodePositions((prev) => ({
      ...prev,
      [selectedNode.id]: { x: nextX, y: nextY },
    }));
  };

  // Export standalone CAD-grade SVG schematic
  const handleExportSVG = () => {
    if (!svgRef.current || !netlist) return;

    try {
      // 1. Clone the SVG element so live canvas state remains undisturbed
      const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;

      // 2. Remove transient / interactive UI elements that shouldn't appear in export
      svgClone.querySelectorAll('title').forEach((el) => el.remove());
      svgClone.querySelectorAll('.animate-pulse, .animate-ping, .animate-spin').forEach((el) => el.remove());
      svgClone.querySelectorAll('[class*="group/nodedel"], [class*="group/del"]').forEach((el) => el.remove());
      // Strip node coordinate tags (X: ... Y: ...)
      svgClone.querySelectorAll('text').forEach((t) => {
        if (t.textContent && /^X:\s*\d+\s*Y:\s*\d+/.test(t.textContent.trim())) {
          t.parentElement?.remove();
        }
      });

      // 3. Calculate true tight circuit bounding box across all nodes, inputs, and outputs
      const allX: number[] = [];
      const allY: number[] = [];

      (netlist.primary_inputs || []).forEach((pi, i) => {
        const pos = nodePositions[pi.id] || nodePositions[pi.name] || { x: 40, y: 80 + i * 70 };
        allX.push(pos.x, pos.x + 140);
        allY.push(pos.y, pos.y + 44);
      });

      (netlist.primary_outputs || []).forEach((po, i) => {
        const pos = nodePositions[po.id] || nodePositions[po.name] || { x: 980, y: 80 + i * 70 };
        allX.push(pos.x, pos.x + 140);
        allY.push(pos.y, pos.y + 44);
      });

      (netlist.nodes || []).forEach((n) => {
        const pos = nodePositions[n.id] || { x: n.x, y: n.y };
        allX.push(pos.x, pos.x + (n.width || 140));
        allY.push(pos.y, pos.y + (n.height || 80));
      });

      const pad = 50;
      const minX = Math.max(0, Math.min(...(allX.length ? allX : [40])) - pad);
      const minY = Math.max(0, Math.min(...(allY.length ? allY : [60])) - pad);
      const maxX = Math.max(1180, Math.max(...(allX.length ? allX : [1000])) + pad + 60);
      const maxY = Math.max(620, Math.max(...(allY.length ? allY : [500])) + pad + 80);
      const exportW = maxX - minX;
      const exportH = maxY - minY;

      // 4. Reset viewBox and dimensions to tightly frame the circuit without pan/zoom skew
      svgClone.setAttribute('viewBox', `${minX} ${minY} ${exportW} ${exportH}`);
      svgClone.setAttribute('width', `${exportW}`);
      svgClone.setAttribute('height', `${exportH}`);
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgClone.setAttribute('version', '1.1');

      // Remove live pan and zoom transform from the content group
      const contentGroup = svgClone.querySelector('g[style*="transformOrigin"]') || svgClone.querySelector('g[transform*="translate"]');
      if (contentGroup) {
        contentGroup.removeAttribute('transform');
        contentGroup.removeAttribute('style');
      }

      // 5. Prepend dark EDA board background rect
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', `${minX}`);
      bgRect.setAttribute('y', `${minY}`);
      bgRect.setAttribute('width', `${exportW}`);
      bgRect.setAttribute('height', `${exportH}`);
      bgRect.setAttribute('fill', '#070b14');
      svgClone.insertBefore(bgRect, svgClone.firstChild);

      // Prepend subtle EDA grid background
      const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      gridRect.setAttribute('x', `${minX}`);
      gridRect.setAttribute('y', `${minY}`);
      gridRect.setAttribute('width', `${exportW}`);
      gridRect.setAttribute('height', `${exportH}`);
      gridRect.setAttribute('fill', 'url(#schematic-grid)');
      gridRect.setAttribute('opacity', '0.55');
      svgClone.insertBefore(gridRect, bgRect.nextSibling);

      // 6. Embed comprehensive standalone CSS styles in <defs>
      const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.textContent = `
        text {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          user-select: none;
          fill: #e2e8f0;
        }
        path, rect, circle, polygon {
          shape-rendering: geometricPrecision;
        }
        .fill-slate-100 { fill: #f8fafc !important; }
        .fill-slate-200 { fill: #e2e8f0 !important; }
        .fill-slate-300 { fill: #cbd5e1 !important; }
        .fill-slate-400 { fill: #94a3b8 !important; }
        .fill-slate-500 { fill: #64748b !important; }
        .fill-purple-200 { fill: #e9d5ff !important; }
        .fill-purple-300 { fill: #d8b4fe !important; }
        .fill-purple-400 { fill: #c084fc !important; }
        .fill-emerald-300 { fill: #6ee7b7 !important; }
        .fill-emerald-400 { fill: #34d399 !important; }
        .fill-sky-300 { fill: #7dd3fc !important; }
        .fill-sky-400 { fill: #38bdf8 !important; }
        .fill-indigo-300 { fill: #a5b4fc !important; }
      `;
      let defs = svgClone.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svgClone.insertBefore(defs, svgClone.firstChild);
      }
      defs.appendChild(styleEl);

      // 7. Professional Engineering Title Block (Bottom-Right, IEEE/ASME EDA standard)
      const titleBlockG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const tbW = 280;
      const tbH = 70;
      const tbX = maxX - tbW - 24;
      const tbY = maxY - tbH - 20;
      titleBlockG.setAttribute('transform', `translate(${tbX}, ${tbY})`);
      titleBlockG.innerHTML = `
        <rect width="${tbW}" height="${tbH}" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
        <line x1="0" y1="24" x2="${tbW}" y2="24" stroke="#1e293b" stroke-width="1" />
        <text x="12" y="17" fill="#c084fc" font-size="11" font-weight="bold" font-family="monospace">CIRCUITFORGE EDA</text>
        <text x="${tbW - 12}" y="17" text-anchor="end" fill="#64748b" font-size="9" font-family="monospace">REV 1.0</text>
        <text x="12" y="42" fill="#e2e8f0" font-size="12" font-weight="bold" font-family="monospace">${netlist.name.toUpperCase()}</text>
        <text x="12" y="58" fill="#94a3b8" font-size="9" font-family="monospace">Gates: ${netlist.nodes.length} | Nets: ${netlist.wires.length} | VHDL-2008</text>
      `;
      svgClone.appendChild(titleBlockG);

      // 8. Serialize and trigger download
      const svgData = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svgClone);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${netlist.name}_schematic.svg`;
      link.click();
      URL.revokeObjectURL(url);
      addNotification('success', 'Export Complete', `Saved ${netlist.name}_schematic.svg`);
    } catch (err) {
      console.error('Failed to export schematic as SVG:', err);
      addNotification('error', 'Export Failed', 'Could not generate SVG export.');
    }
  };

  // =========================================================================
  // WIRE ROUTING: ORTHOGONAL GEOMETRY, JUMPER ARCS & SOLDER DOT JUNCTIONS
  // =========================================================================

  // Universal Topological Logic Simulation state for canvas
  const simResult = useMemo(() => {
    return evaluateCircuitLogic(netlist, probeValues, activeFaults);
  }, [netlist, probeValues, activeFaults]);

  // Precompute wire endpoints and orthogonal segments
  const computedWireData = useMemo(() => {
    if (!netlist) return { wires: [], verticalSegments: [], junctions: [] };

    interface WireRoute {
      wire: NetlistWire;
      waypoints: [number, number][];
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isForward: boolean;
      wireColor: string;
      wireFilter: string;
      strokeWidth: number;
      isBus: boolean;
      isHigh: boolean;
      wireVal: string;
      badgeX: number;
      badgeY: number;
    }

    const routes: WireRoute[] = [];
    const vertSegs: WireSegment[] = [];
    const pinTerminals = new Map<string, number>(); // "x,y" -> count
    const junctions: Array<{ x: number; y: number }> = [];

    // Component bounding boxes to avoid (keep-out corridors)
    const componentKeepOuts: Array<{ xMin: number; xMax: number; yMin: number; yMax: number }> = [];
    netlist.nodes.forEach((n) => {
      const pos = nodePositions[n.id] || { x: n.x, y: n.y };
      componentKeepOuts.push({
        xMin: pos.x - 14,
        xMax: pos.x + (n.width || 120) + 14,
        yMin: pos.y - 12,
        yMax: pos.y + (n.height || 60) + 12,
      });
    });
    netlist.primary_outputs.forEach((p, idx) => {
      const pos = nodePositions[p.id] || nodePositions[p.name] || { x: 980, y: 80 + idx * 70 };
      componentKeepOuts.push({
        xMin: pos.x - 30, // keepout buffer in front of output terminals
        xMax: pos.x + 130 + 12,
        yMin: pos.y - 8,
        yMax: pos.y + 38 + 8,
      });
    });

    // Step 1: Pre-resolve endpoints and metadata for all wires
    interface ResolvedWire {
      wire: NetlistWire;
      wireIdx: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isForward: boolean;
      wireColor: string;
      wireFilter: string;
      strokeWidth: number;
      isBus: boolean;
      isHigh: boolean;
      wireVal: string;
    }

    const resolvedWires: ResolvedWire[] = [];

    netlist.wires.forEach((wire, wireIdx) => {
      const srcNode = nodeMap.get(wire.source_node) || nodeMap.get(wire.source_node.toLowerCase());
      const tgtNode = nodeMap.get(wire.target_node) || nodeMap.get(wire.target_node.toLowerCase());

      const srcPos = srcNode
        ? nodePositions[srcNode.id] || {
            x: Math.round(srcNode.x / GRID) * GRID,
            y: Math.round(srcNode.y / GRID) * GRID,
          }
        : null;
      const tgtPos = tgtNode
        ? nodePositions[tgtNode.id] || {
            x: Math.round(tgtNode.x / GRID) * GRID,
            y: Math.round(tgtNode.y / GRID) * GRID,
          }
        : null;

      let x1 = 200, y1 = 80;
      let x2 = 1200, y2 = 80;

      if (srcNode && srcPos) {
        const outIdx = srcNode.outputs.findIndex((p) => matchPort(p, wire.source_port));
        const idx = outIdx !== -1 ? outIdx : 0;
        const pinRel = getPinLocalPos(srcNode, false, idx, srcNode.outputs.length);
        x1 = srcPos.x + pinRel.x;
        y1 = srcPos.y + pinRel.y;
      } else {
        const inPin = netlist.primary_inputs.find(
          (p) =>
            p.id === wire.source_node ||
            p.name === wire.source_node ||
            p.name.toLowerCase() === wire.source_node.toLowerCase()
        );
        if (inPin) {
          const inIdx = netlist.primary_inputs.indexOf(inPin);
          const defaultPos = { x: 40, y: 80 + inIdx * 70 };
          const pos = nodePositions[inPin.id] || nodePositions[inPin.name] || defaultPos;
          const rawVal = probeValues[inPin.name] ?? probeValues[inPin.id] ?? '0';
          const { chassisWidth } = getPrimaryInputLayout(inPin, rawVal);
          x1 = pos.x + chassisWidth;
          y1 = pos.y + 19;
        }
      }

      if (tgtNode && tgtPos) {
        const inIdx = tgtNode.inputs.findIndex((p) => matchPort(p, wire.target_port));
        const idx = inIdx !== -1 ? inIdx : 0;
        const pinRel = getPinLocalPos(tgtNode, true, idx, tgtNode.inputs.length);
        x2 = tgtPos.x + pinRel.x;
        y2 = tgtPos.y + pinRel.y;
      } else {
        const outPin = netlist.primary_outputs.find(
          (p) =>
            p.id === wire.target_node ||
            p.name === wire.target_node ||
            p.name.toLowerCase() === wire.target_node.toLowerCase()
        );
        if (outPin) {
          const outIdx = netlist.primary_outputs.indexOf(outPin);
          const defaultPos = { x: 980, y: 80 + outIdx * 70 };
          const pos = nodePositions[outPin.id] || nodePositions[outPin.name] || defaultPos;
          x2 = pos.x;
          y2 = pos.y + 19;
        }
      }

      // Track terminal counts for solder junctions
      const p1Key = `${x1},${y1}`;
      const p2Key = `${x2},${y2}`;
      pinTerminals.set(p1Key, (pinTerminals.get(p1Key) || 0) + 1);
      pinTerminals.set(p2Key, (pinTerminals.get(p2Key) || 0) + 1);

      // Color coding & styling dynamically driven by topological simulator
      const wireVal = simResult.wireValues[wire.id] || probeValues[wire.label || ''] || '0';
      const isHigh = wireVal === '1' || (wireVal.length > 1 && parseInt(wireVal, 2) > 0);
      const isSelected = selectedWire?.id === wire.id;
      const isBus = wire.width > 1;

      const wireLabelLower = (wire.label || '').toLowerCase();
      const isClock = wireLabelLower.includes('clk');
      const isReset = wireLabelLower.includes('rst') || wireLabelLower.includes('reset');
      const isFault = activeFaults[wire.label || ''] !== undefined || activeFaults[wire.id] !== undefined;

      let wireColor = '#38bdf8';
      let wireFilter = 'url(#inactive-wire-glow)';
      let strokeWidth = 2.2;

      if (isSelected) {
        wireColor = '#fbbf24';
        wireFilter = 'url(#amber-glow)';
        strokeWidth = 3.5;
      } else if (isFault) {
        wireColor = '#f43f5e';
        wireFilter = 'url(#rose-glow)';
        strokeWidth = 3.0;
      } else if (isClock) {
        wireColor = '#f59e0b';
        wireFilter = 'url(#amber-glow)';
        strokeWidth = 2.4;
      } else if (isReset) {
        wireColor = isHigh ? '#f43f5e' : '#94a3b8';
        wireFilter = isHigh ? 'url(#rose-glow)' : 'none';
        strokeWidth = 2.4;
      } else if (isBus) {
        wireColor = isHigh ? '#c084fc' : '#818cf8';
        wireFilter = isHigh ? 'url(#bus-glow)' : 'none';
        strokeWidth = 3.2;
      } else if (isHigh) {
        wireColor = '#10b981';
        wireFilter = 'url(#green-glow)';
        strokeWidth = 2.8;
      }

      resolvedWires.push({
        wire,
        wireIdx,
        x1,
        y1,
        x2,
        y2,
        isForward: x1 < x2,
        wireColor,
        wireFilter,
        strokeWidth,
        isBus,
        isHigh,
        wireVal,
      });
    });

    // Track occupied vertical channels
    const isVerticalOccupied = (candX: number, yMin: number, yMax: number) => {
      for (const vs of vertSegs) {
        if (Math.abs(vs.x1 - candX) < 10) {
          // If Y ranges overlap with a 6px clearance
          if (!(yMax < vs.y1 - 6 || yMin > vs.y2 + 6)) {
            return true;
          }
        }
      }
      for (const box of componentKeepOuts) {
        if (candX >= box.xMin && candX <= box.xMax) {
          if (!(yMax < box.yMin || yMin > box.yMax)) {
            return true;
          }
        }
      }
      return false;
    };

    // Step 2: Route custom wires first (highest priority, user-explicit)
    const pendingAutoWires: ResolvedWire[] = [];
    resolvedWires.forEach((rw) => {
      const custom = wireCustomBends[rw.wire.id] || rw.wire.points;
      if (
        Array.isArray(custom) &&
        custom.length >= 2 &&
        custom.every((pt) => Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number')
      ) {
        const waypoints: [number, number][] = [
          [rw.x1, rw.y1],
          ...custom.slice(1, -1),
          [rw.x2, rw.y2],
        ];
        // Register vertical segments from custom waypoints
        for (let i = 0; i < waypoints.length - 1; i++) {
          const ptA = waypoints[i];
          const ptB = waypoints[i + 1];
          if (!ptA || !ptB) continue;
          if (Math.abs(ptA[0] - ptB[0]) < 2) {
            vertSegs.push({
              wireId: rw.wire.id,
              wireNet: rw.wire.label || rw.wire.id,
              isVertical: true,
              x1: ptA[0],
              y1: Math.min(ptA[1], ptB[1]),
              x2: ptA[0],
              y2: Math.max(ptA[1], ptB[1]),
            });
          }
        }
        routes.push({
          ...rw,
          waypoints,
          badgeX: (waypoints[0][0] + waypoints[waypoints.length - 1][0]) / 2,
          badgeY: (waypoints[0][1] + waypoints[waypoints.length - 1][1]) / 2 - 10,
        });
      } else {
        pendingAutoWires.push(rw);
      }
    });

    // Step 3: Collision-Free Auto-Routing for remaining wires
    const forwardWires = pendingAutoWires.filter((w) => w.isForward);
    const backwardWires = pendingAutoWires.filter((w) => !w.isForward);

    // Group fan-out wires leaving the same source terminal
    const fanoutGroups = new Map<string, ResolvedWire[]>();
    forwardWires.forEach((w) => {
      const k = `${w.x1},${w.y1}`;
      if (!fanoutGroups.has(k)) fanoutGroups.set(k, []);
      fanoutGroups.get(k)!.push(w);
    });

    // Add solder dots for fan-out source pins
    fanoutGroups.forEach((group) => {
      if (group.length >= 2) {
        junctions.push({ x: group[0].x1, y: group[0].y1 });
      }
    });

    forwardWires.forEach((rw) => {
      const { wire, x1, y1, x2, y2, wireColor, wireFilter, strokeWidth, isBus, isHigh, wireVal } = rw;
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);

      // Desired corridor midpoint
      const rawMid = (x1 + x2) / 2;
      const idealX = Math.round(rawMid / GRID) * GRID;

      // Safe boundaries for vertical drop:
      // Minimum lead-out from source: 16px
      // Minimum lead-in to destination: 44px for long spans (e.g. into outputs/right blocks), 16px for short inter-stage hops
      const leadInBuffer = (x2 - x1 >= 200) ? 44 : 16;
      const leadOutBuffer = 16;
      const minX = x1 + leadOutBuffer;
      const maxX = x2 - leadInBuffer;

      let chosenX = Math.max(minX, Math.min(maxX, idealX));
      if (chosenX < minX || chosenX > maxX || isVerticalOccupied(chosenX, yMin, yMax)) {
        let found = false;
        // 1. Search on 20px grid within corridor
        for (let step = GRID; step <= 400; step += GRID) {
          const xLeft = idealX - step;
          if (xLeft >= minX && xLeft <= maxX && !isVerticalOccupied(xLeft, yMin, yMax)) {
            chosenX = xLeft;
            found = true;
            break;
          }
          const xRight = idealX + step;
          if (xRight >= minX && xRight <= maxX && !isVerticalOccupied(xRight, yMin, yMax)) {
            chosenX = xRight;
            found = true;
            break;
          }
        }
        // 2. Search on 10px sub-lanes within corridor
        if (!found) {
          for (let step = 10; step <= 400; step += 10) {
            const xLeft = idealX - step;
            if (xLeft >= minX && xLeft <= maxX && !isVerticalOccupied(xLeft, yMin, yMax)) {
              chosenX = xLeft;
              found = true;
              break;
            }
            const xRight = idealX + step;
            if (xRight >= minX && xRight <= maxX && !isVerticalOccupied(xRight, yMin, yMax)) {
              chosenX = xRight;
              found = true;
              break;
            }
          }
        }
        // 3. If corridor is completely packed, expand safe window outward to allocate a clean lane
        if (!found) {
          for (let step = 10; step <= 500; step += 10) {
            const xLeft = minX - step;
            if (xLeft > x1 + 8 && !isVerticalOccupied(xLeft, yMin, yMax)) {
              chosenX = xLeft;
              found = true;
              break;
            }
            const xRight = maxX + step;
            if (xRight < x2 - 8 && !isVerticalOccupied(xRight, yMin, yMax)) {
              chosenX = xRight;
              found = true;
              break;
            }
          }
        }
      }

      vertSegs.push({
        wireId: wire.id,
        wireNet: wire.label || wire.id,
        isVertical: true,
        x1: chosenX,
        y1: yMin,
        x2: chosenX,
        y2: yMax,
      });

      const waypoints: [number, number][] = [
        [x1, y1],
        [chosenX, y1],
        [chosenX, y2],
        [x2, y2],
      ];

      const span1 = Math.abs(chosenX - x1);
      const span2 = Math.abs(x2 - chosenX);
      const badgeX = span1 >= span2 ? (x1 + chosenX) / 2 : (chosenX + x2) / 2;
      const badgeY = span1 >= span2 ? y1 - 10 : y2 - 10;

      routes.push({
        ...rw,
        waypoints,
        badgeX,
        badgeY,
      });
    });

    // Backward wires (wrap around perimeter with collision-free channel allocation)
    backwardWires.forEach((rw, idx) => {
      const { wire, x1, y1, x2, y2 } = rw;
      const loopStagger = (idx % 4) * GRID;
      const yHighway =
        y1 > 350 && y2 > 350
          ? Math.max(40, Math.min(y1, y2) - 40 - loopStagger)
          : Math.min(660, Math.max(y1, y2) + 40 + loopStagger);
      const yLoop = Math.round(yHighway / GRID) * GRID;

      // Find collision-free xLoop1
      let xLoop1 = Math.round((x1 + 30) / GRID) * GRID + (idx % 3) * GRID;
      const yMin1 = Math.min(y1, yLoop);
      const yMax1 = Math.max(y1, yLoop);
      while (isVerticalOccupied(xLoop1, yMin1, yMax1)) {
        xLoop1 += GRID;
      }

      // Find collision-free xLoop2
      let xLoop2 = Math.round((x2 - 30) / GRID) * GRID - (idx % 3) * GRID;
      const yMin2 = Math.min(y2, yLoop);
      const yMax2 = Math.max(y2, yLoop);
      while (isVerticalOccupied(xLoop2, yMin2, yMax2)) {
        xLoop2 -= GRID;
      }

      vertSegs.push({
        wireId: wire.id,
        wireNet: wire.label || wire.id,
        isVertical: true,
        x1: xLoop1,
        y1: yMin1,
        x2: xLoop1,
        y2: yMax1,
      });
      vertSegs.push({
        wireId: wire.id,
        wireNet: wire.label || wire.id,
        isVertical: true,
        x1: xLoop2,
        y1: yMin2,
        x2: xLoop2,
        y2: yMax2,
      });

      const waypoints: [number, number][] = [
        [x1, y1],
        [xLoop1, y1],
        [xLoop1, yLoop],
        [xLoop2, yLoop],
        [xLoop2, y2],
        [x2, y2],
      ];

      routes.push({
        ...rw,
        waypoints,
        badgeX: (xLoop1 + xLoop2) / 2,
        badgeY: yLoop - 10,
      });
    });

    // Add solder dots for pins connected to multiple wires
    pinTerminals.forEach((cnt, key) => {
      if (cnt >= 2) {
        const [jx, jy] = key.split(',').map(Number);
        junctions.push({ x: jx, y: jy });
      }
    });

    return { wires: routes, verticalSegments: vertSegs, junctions };
  }, [netlist, nodeMap, nodePositions, probeValues, selectedWire, wireCustomBends]);

  // Helper to build a horizontal segment path with standard IEEE Jumper Arcs
  const buildHorizontalPathWithJumperArcs = (
    xStart: number,
    xEnd: number,
    y: number,
    currentWireId: string,
    currentNet: string,
    verticalSegments: WireSegment[]
  ): string => {
    if (xStart === xEnd) return '';
    const isGoingRight = xStart < xEnd;
    const minX = Math.min(xStart, xEnd);
    const maxX = Math.max(xStart, xEnd);

    // Find all perpendicular vertical segments from DIFFERENT wires crossing strictly inside this span
    const crossingXs: number[] = [];
    verticalSegments.forEach((vs) => {
      if (vs.wireId === currentWireId || vs.wireNet === currentNet) return;
      if (vs.x1 > minX + 8 && vs.x1 < maxX - 8) {
        // Must cross vertical span
        if (y > vs.y1 + 4 && y < vs.y2 - 4) {
          crossingXs.push(vs.x1);
        }
      }
    });

    if (crossingXs.length === 0) {
      return ` L ${xEnd} ${y}`;
    }

    // Sort crossing X coordinates in the travel direction
    crossingXs.sort((a, b) => (isGoingRight ? a - b : b - a));

    let path = '';
    const ARC_R = 6;

    crossingXs.forEach((crossX) => {
      const xApproach = isGoingRight ? crossX - ARC_R : crossX + ARC_R;
      const xDepart = isGoingRight ? crossX + ARC_R : crossX - ARC_R;

      // Line to arc start, then upward bypass arc over the vertical wire
      path += ` L ${xApproach} ${y}`;
      path += ` A ${ARC_R} ${ARC_R} 0 0 1 ${xDepart} ${y}`;
    });

    path += ` L ${xEnd} ${y}`;
    return path;
  };

  // Helper to build the full SVG path for any wire from its orthogonal waypoints with smooth rounded turns (no sharp corners)
  const buildWireSvgPath = (
    rawWaypoints: [number, number][],
    wireId: string,
    wireNet: string,
    verticalSegments: WireSegment[]
  ): string => {
    if (!rawWaypoints || rawWaypoints.length === 0) return '';
    if (rawWaypoints.length === 1) return `M ${rawWaypoints[0][0]} ${rawWaypoints[0][1]}`;

    // Clean waypoints: remove sequential duplicates or micro-steps
    const waypoints: [number, number][] = [];
    rawWaypoints.forEach((pt) => {
      if (waypoints.length === 0) {
        waypoints.push(pt);
      } else {
        const last = waypoints[waypoints.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.5) {
          waypoints.push(pt);
        }
      }
    });

    if (waypoints.length === 0) return '';
    if (waypoints.length === 1) return `M ${waypoints[0][0]} ${waypoints[0][1]}`;
    if (waypoints.length === 2) {
      // 2 points: straight horizontal or vertical
      const p1 = waypoints[0];
      const p2 = waypoints[1];
      if (!p1 || !p2) return '';
      if (Math.abs(p1[1] - p2[1]) < 0.01) {
        return `M ${p1[0]} ${p1[1]}${buildHorizontalPathWithJumperArcs(p1[0], p2[0], p1[1], wireId, wireNet, verticalSegments)}`;
      }
      return `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`;
    }

    const CORNER_RADIUS = 8;
    const n = waypoints.length;

    // Precalculate corner approach (A) and departure (B) points
    interface CornerInfo {
      radius: number;
      approach: [number, number];
      departure: [number, number];
      control: [number, number];
    }
    const corners: Map<number, CornerInfo> = new Map();

    for (let k = 1; k < n - 1; k++) {
      const pPrev = waypoints[k - 1];
      const pCurr = waypoints[k];
      const pNext = waypoints[k + 1];
      if (!pPrev || !pCurr || !pNext) continue;

      const dx1 = pCurr[0] - pPrev[0];
      const dy1 = pCurr[1] - pPrev[1];
      const dx2 = pNext[0] - pCurr[0];
      const dy2 = pNext[1] - pCurr[1];

      const len1 = Math.hypot(dx1, dy1);
      const len2 = Math.hypot(dx2, dy2);

      // Turn cross product to check if collinear
      const cross = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(cross) < 0.01 || len1 < 2 || len2 < 2) {
        continue; // Collinear, no bend
      }

      const r = Math.min(CORNER_RADIUS, len1 / 2, len2 / 2);
      const approach: [number, number] = [
        pCurr[0] - (dx1 / len1) * r,
        pCurr[1] - (dy1 / len1) * r,
      ];
      const departure: [number, number] = [
        pCurr[0] + (dx2 / len2) * r,
        pCurr[1] + (dy2 / len2) * r,
      ];

      corners.set(k, {
        radius: r,
        approach,
        departure,
        control: pCurr,
      });
    }

    // Build the SVG path by connecting segments with rounded Bézier corners
    let path = `M ${waypoints[0][0]} ${waypoints[0][1]}`;
    let currentPt: [number, number] = waypoints[0];

    for (let s = 0; s < n - 1; s++) {
      const nextCornerIdx = s + 1;
      const corner = corners.get(nextCornerIdx);

      // Endpoint of this straight segment
      const segEnd: [number, number] = corner ? corner.approach : waypoints[s + 1];
      if (!currentPt || !segEnd) continue;

      // Draw segment from currentPt to segEnd
      if (Math.abs(currentPt[1] - segEnd[1]) < 0.01) {
        path += buildHorizontalPathWithJumperArcs(
          currentPt[0],
          segEnd[0],
          currentPt[1],
          wireId,
          wireNet,
          verticalSegments
        );
      } else {
        path += ` L ${segEnd[0]} ${segEnd[1]}`;
      }

      // If there is a rounded corner at nextCornerIdx, add the smooth curve
      if (corner) {
        // Quadratic Bézier curve with control point at the corner vertex
        path += ` Q ${corner.control[0]} ${corner.control[1]} ${corner.departure[0]} ${corner.departure[1]}`;
        currentPt = corner.departure;
      } else {
        currentPt = segEnd;
      }
    }

    return path;
  };

  // Render Logic Symbols or EDA Blocks
  const renderNodeSymbol = (node: NetlistNode, w: number, h: number) => {
    const isSelected = selectedNode?.id === node.id;
    const gateType = (node.properties?.gate_type || node.type || '').toUpperCase();
    const fillVal = isSelected ? '#083344' : '#0f172a';
    const strokeVal = isSelected ? '#22d3ee' : '#94a3b8';
    const strokeWidthVal = isSelected ? 2.5 : 1.75;
    const strokeClass = isSelected
      ? 'stroke-cyan-400 stroke-[2.5]'
      : 'stroke-slate-400 stroke-[1.75]';
    const fillClass = isSelected ? 'fill-cyan-950/80' : 'fill-slate-900/90';

    if (gateType === 'AND') {
      const straightLen = Math.max(20, w - h / 2);
      return (
        <g>
          <path
            d={`M 0 0 L ${straightLen} 0 A ${h / 2} ${h / 2} 0 0 1 ${straightLen} ${h} L 0 ${h} Z`}
            fill={fillVal}
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} ${strokeClass}`}
          />
          <text
            x={w * 0.35}
            y={h / 2 + 5}
            textAnchor="middle"
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="12"
            className="fill-slate-300 font-mono font-bold text-xs"
          >
            AND
          </text>
        </g>
      );
    }

    if (gateType === 'NAND') {
      const gw = w - 10;
      const straightLen = Math.max(20, gw - h / 2);
      return (
        <g>
          <path
            d={`M 0 0 L ${straightLen} 0 A ${h / 2} ${h / 2} 0 0 1 ${straightLen} ${h} L 0 ${h} Z`}
            fill={fillVal}
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} ${strokeClass}`}
          />
          <circle
            cx={gw + 5}
            cy={h / 2}
            r={4.5}
            fill="#0f172a"
            stroke={strokeVal}
            strokeWidth={1.5}
            className="fill-slate-900 stroke-slate-300 stroke-[1.5]"
          />
          <text
            x={w * 0.32}
            y={h / 2 + 5}
            textAnchor="middle"
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="12"
            className="fill-slate-300 font-mono font-bold text-xs"
          >
            NAND
          </text>
        </g>
      );
    }

    if (gateType === 'OR') {
      return (
        <g>
          {/* Input lead extension stubs ensuring zero gap between x=0 input pins and curved back */}
          <line x1="0" y1="20" x2="14" y2="20" stroke={strokeVal} strokeWidth={strokeWidthVal} />
          <line x1="0" y1="60" x2="14" y2="60" stroke={strokeVal} strokeWidth={strokeWidthVal} />
          <path
            d={`M 0 0 Q ${w * 0.25} ${h * 0.5} 0 ${h} Q ${w * 0.6} ${h} ${w} ${h * 0.5} Q ${w * 0.6} 0 0 0 Z`}
            fill={fillVal}
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} ${strokeClass}`}
          />
          <text
            x={w * 0.45}
            y={h / 2 + 5}
            textAnchor="middle"
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="12"
            className="fill-slate-300 font-mono font-bold text-xs"
          >
            OR
          </text>
        </g>
      );
    }

    if (gateType === 'NOR') {
      const gw = w - 10;
      return (
        <g>
          <line x1="0" y1="20" x2="14" y2="20" stroke={strokeVal} strokeWidth={strokeWidthVal} />
          <line x1="0" y1="60" x2="14" y2="60" stroke={strokeVal} strokeWidth={strokeWidthVal} />
          <path
            d={`M 0 0 Q ${gw * 0.25} ${h * 0.5} 0 ${h} Q ${gw * 0.6} ${h} ${gw} ${h * 0.5} Q ${gw * 0.6} 0 0 0 Z`}
            fill={fillVal}
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} ${strokeClass}`}
          />
          <circle
            cx={gw + 5}
            cy={h / 2}
            r={4.5}
            fill="#0f172a"
            stroke={strokeVal}
            strokeWidth={1.5}
            className="fill-slate-900 stroke-slate-300 stroke-[1.5]"
          />
          <text
            x={gw * 0.42}
            y={h / 2 + 5}
            textAnchor="middle"
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="12"
            className="fill-slate-300 font-mono font-bold text-xs"
          >
            NOR
          </text>
        </g>
      );
    }

    if (gateType === 'XOR') {
      return (
        <g>
          {/* Input lead extension stubs ensuring zero gap from input pins through curved input arc */}
          <line x1="-7" y1="20" x2="14" y2="20" stroke={strokeVal} strokeWidth={strokeWidthVal} />
          <line x1="-7" y1="60" x2="14" y2="60" stroke={strokeVal} strokeWidth={strokeWidthVal} />
          <path
            d={`M -7 0 Q ${w * 0.25 - 7} ${h * 0.5} -7 ${h}`}
            fill="none"
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={strokeClass}
          />
          <path
            d={`M 0 0 Q ${w * 0.25} ${h * 0.5} 0 ${h} Q ${w * 0.6} ${h} ${w} ${h * 0.5} Q ${w * 0.6} 0 0 0 Z`}
            fill={fillVal}
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} ${strokeClass}`}
          />
          <text
            x={w * 0.45}
            y={h / 2 + 5}
            textAnchor="middle"
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="12"
            className="fill-slate-300 font-mono font-bold text-xs"
          >
            XOR
          </text>
        </g>
      );
    }

    if (gateType === 'XNOR') {
      const gw = w - 10;
      return (
        <g>
          <line x1="-7" y1="20" x2="14" y2="20" stroke={strokeVal} strokeWidth={strokeWidthVal} />
          <line x1="-7" y1="60" x2="14" y2="60" stroke={strokeVal} strokeWidth={strokeWidthVal} />
          <path
            d={`M -7 0 Q ${gw * 0.25 - 7} ${h * 0.5} -7 ${h}`}
            fill="none"
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={strokeClass}
          />
          <path
            d={`M 0 0 Q ${gw * 0.25} ${h * 0.5} 0 ${h} Q ${gw * 0.6} ${h} ${gw} ${h * 0.5} Q ${gw * 0.6} 0 0 0 Z`}
            fill={fillVal}
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} ${strokeClass}`}
          />
          <circle
            cx={gw + 5}
            cy={h / 2}
            r={4.5}
            fill="#0f172a"
            stroke={strokeVal}
            strokeWidth={1.5}
            className="fill-slate-900 stroke-slate-300 stroke-[1.5]"
          />
          <text
            x={gw * 0.42}
            y={h / 2 + 5}
            textAnchor="middle"
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="12"
            className="fill-slate-300 font-mono font-bold text-xs"
          >
            XNOR
          </text>
        </g>
      );
    }

    if (gateType === 'NOT' || gateType === 'INV') {
      const gw = w - 10;
      return (
        <g>
          <polygon
            points={`0,0 ${gw},${h / 2} 0,${h}`}
            fill={fillVal}
            stroke={strokeVal}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} ${strokeClass}`}
          />
          <circle
            cx={gw + 5}
            cy={h / 2}
            r={4.5}
            fill="#0f172a"
            stroke={strokeVal}
            strokeWidth={1.5}
            className="fill-slate-900 stroke-slate-300 stroke-[1.5]"
          />
          <text
            x={gw * 0.3}
            y={h / 2 + 4}
            textAnchor="middle"
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="10"
            className="fill-slate-300 font-mono font-bold text-[10px]"
          >
            NOT
          </text>
        </g>
      );
    }

    if (gateType === 'PROBE' || gateType.includes('LED')) {
      const probeVal =
        simResult.probeValues[node.label] ??
        simResult.probeValues[node.id] ??
        probeValues[node.label] ??
        probeValues[node.id] ??
        '0';
      const isHigh = probeVal === '1' || (probeVal.length > 1 && parseInt(probeVal, 2) > 0);
      const ledColor = isHigh ? '#10b981' : '#1e293b';
      const ledBorder = isHigh ? '#34d399' : '#475569';

      return (
        <g>
          {/* Outer Chassis */}
          <rect
            width={w}
            height={h}
            rx={8}
            fill={fillVal}
            stroke={isSelected ? strokeVal : isHigh ? '#10b981' : '#475569'}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} transition-colors`}
          />
          {/* LED Bezel Ring */}
          <circle
            cx={w - 28}
            cy={h / 2}
            r={15}
            fill="#090d16"
            stroke={isHigh ? '#059669' : '#334155'}
            strokeWidth={1.5}
          />
          {/* Glowing LED Bulb Core */}
          <circle
            cx={w - 28}
            cy={h / 2}
            r={10.5}
            fill={ledColor}
            stroke={ledBorder}
            strokeWidth={1.5}
            filter={isHigh ? 'url(#green-glow)' : undefined}
            className={isHigh ? 'animate-pulse' : ''}
          />
          {/* Specular Glare Reflection on Lens */}
          <circle
            cx={w - 32}
            cy={h / 2 - 3}
            r={3}
            fill="white"
            fillOpacity={isHigh ? 0.75 : 0.25}
          />
          {/* Label */}
          <text
            x={12}
            y={h / 2 - 3}
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="10"
            className="fill-slate-100 font-mono font-bold text-[10px]"
          >
            {node.label.length > 10 ? node.label.substring(0, 9) + '…' : node.label}
          </text>
          {/* Logic State Badge */}
          <text
            x={12}
            y={h / 2 + 11}
            fill={isHigh ? '#6ee7b7' : '#94a3b8'}
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="9"
            className="font-mono text-[9px]"
          >
            {isHigh ? 'HIGH [1]' : 'LOW [0]'}
          </text>
        </g>
      );
    }

    if (gateType === 'OUTPUT_PIN') {
      const pinVal =
        simResult.probeValues[node.label] ??
        simResult.probeValues[node.id] ??
        probeValues[node.label] ??
        probeValues[node.id] ??
        '0';
      const isHigh = pinVal === '1' || (pinVal.length > 1 && parseInt(pinVal, 2) > 0);

      return (
        <g>
          <rect
            width={w}
            height={h}
            rx={6}
            fill={fillVal}
            stroke={isSelected ? strokeVal : isHigh ? '#10b981' : '#475569'}
            strokeWidth={strokeWidthVal}
            className={`${fillClass} transition-colors`}
          />
          {/* Output Tag */}
          <rect x="6" y="8" width="22" height="18" rx="4" fill="#1e1b4b" stroke="#6366f1" strokeWidth="0.75" />
          <text x="17" y="20.5" textAnchor="middle" fill="#a5b4fc" fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="bold">
            OUT
          </text>
          <text
            x={34}
            y={h / 2 + 4}
            fill="#f1f5f9"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="11"
            className="fill-slate-100 font-mono font-bold text-xs"
          >
            {node.label.length > 10 ? node.label.substring(0, 8) + '…' : node.label}
          </text>
        </g>
      );
    }

    if (gateType.includes('RISCV') || gateType.includes('PROCESSOR')) {
      return (
        <g>
          {/* Silicon Microprocessor Die Chassis */}
          <rect
            width={w}
            height={h}
            rx={8}
            fill={fillVal}
            stroke={isSelected ? '#c084fc' : '#38bdf8'}
            strokeWidth={isSelected ? 2.5 : 1.75}
            className={`${fillClass} transition-colors`}
          />
          {/* Top Die Bevel / Header */}
          <path
            d={`M 0 8 Q 0 0 8 0 L ${w - 8} 0 Q ${w} 0 ${w} 8 L ${w} 28 L 0 28 Z`}
            fill="#0c192e"
            stroke="#1e3a5f"
            strokeWidth={1}
          />
          {/* Gold Pin 1 Orientation Notch */}
          <circle cx="10" cy="10" r="3.5" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1" />
          <text
            x={w / 2}
            y={18}
            textAnchor="middle"
            fill="#38bdf8"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="11"
            className="font-mono font-bold text-[11px] tracking-wider"
          >
            RV32I RISC-V CORE
          </text>
          {/* Silicon Core Grid Accents */}
          <rect
            x={w / 2 - 40}
            y={h / 2 - 20}
            width="80"
            height="40"
            rx="4"
            fill="#091424"
            stroke="#1d4ed8"
            strokeWidth="1"
          />
          <text
            x={w / 2}
            y={h / 2 - 4}
            textAnchor="middle"
            fill="#93c5fd"
            fontFamily="ui-monospace, monospace"
            fontWeight="bold"
            fontSize="10"
          >
            32-BIT CPU
          </text>
          <text
            x={w / 2}
            y={h / 2 + 10}
            textAnchor="middle"
            fill="#38bdf8"
            fontFamily="ui-monospace, monospace"
            fontSize="9"
          >
            RV32I ISA
          </text>
        </g>
      );
    }

    if (gateType === 'SEVEN_SEG') {
      const hexVal = simResult.probeValues[`${node.id}:in_hex`] ?? simResult.probeValues[node.label] ?? '0';
      const intVal = parseInt(hexVal, 16) || parseInt(hexVal, 2) || 0;
      const patterns = [
        0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71,
      ];
      const mask = patterns[intVal % 16] ?? 0x3f;
      const segA = (mask & 0x01) !== 0;
      const segB = (mask & 0x02) !== 0;
      const segC = (mask & 0x04) !== 0;
      const segD = (mask & 0x08) !== 0;
      const segE = (mask & 0x10) !== 0;
      const segF = (mask & 0x20) !== 0;
      const segG = (mask & 0x40) !== 0;

      const onColor = '#ef4444';
      const offColor = '#271212';
      const onFilter = 'url(#green-glow)';

      const sx = w / 2 - 12;
      const sy = 28;

      return (
        <g>
          <rect
            width={w}
            height={h}
            rx={8}
            fill="#0a0505"
            stroke={isSelected ? strokeVal : '#591616'}
            strokeWidth={strokeWidthVal}
          />
          {/* Bezel Window */}
          <rect x={w / 2 - 28} y={18} width="56" height="64" rx="4" fill="#140707" stroke="#450a0a" strokeWidth="1" />
          {/* Segments A-G */}
          {/* A (top) */}
          <rect x={sx + 3} y={sy} width="18" height="4" rx="1.5" fill={segA ? onColor : offColor} filter={segA ? onFilter : undefined} />
          {/* B (top right) */}
          <rect x={sx + 21} y={sy + 4} width="4" height="16" rx="1.5" fill={segB ? onColor : offColor} filter={segB ? onFilter : undefined} />
          {/* C (bottom right) */}
          <rect x={sx + 21} y={sy + 22} width="4" height="16" rx="1.5" fill={segC ? onColor : offColor} filter={segC ? onFilter : undefined} />
          {/* D (bottom) */}
          <rect x={sx + 3} y={sy + 38} width="18" height="4" rx="1.5" fill={segD ? onColor : offColor} filter={segD ? onFilter : undefined} />
          {/* E (bottom left) */}
          <rect x={sx - 1} y={sy + 22} width="4" height="16" rx="1.5" fill={segE ? onColor : offColor} filter={segE ? onFilter : undefined} />
          {/* F (top left) */}
          <rect x={sx - 1} y={sy + 4} width="4" height="16" rx="1.5" fill={segF ? onColor : offColor} filter={segF ? onFilter : undefined} />
          {/* G (middle) */}
          <rect x={sx + 3} y={sy + 19} width="18" height="4" rx="1.5" fill={segG ? onColor : offColor} filter={segG ? onFilter : undefined} />
          {/* Decimal Point */}
          <circle cx={sx + 29} cy={sy + 40} r="2.5" fill={onColor} opacity={0.8} />
          <text x={w / 2} y={h - 6} textAnchor="middle" fill="#991b1b" fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="bold">
            7-SEG [HEX: {(intVal % 16).toString(16).toUpperCase()}]
          </text>
        </g>
      );
    }

    if (gateType === 'RGB_LED') {
      const r = simResult.probeValues[`${node.id}:in_r`] === '1' || simResult.probeValues[`${node.label}:R`] === '1';
      const g = simResult.probeValues[`${node.id}:in_g`] === '1' || simResult.probeValues[`${node.label}:G`] === '1';
      const b = simResult.probeValues[`${node.id}:in_b`] === '1' || simResult.probeValues[`${node.label}:B`] === '1';
      const rVal = r ? 255 : 30;
      const gVal = g ? 255 : 30;
      const bVal = b ? 255 : 30;
      const composite = `rgb(${rVal}, ${gVal}, ${bVal})`;

      return (
        <g>
          <rect width={w} height={h} rx={8} fill={fillVal} stroke={strokeVal} strokeWidth={strokeWidthVal} className={fillClass} />
          <circle cx={w - 32} cy={h / 2} r={18} fill="#0b0f19" stroke="#334155" strokeWidth={2} />
          <circle cx={w - 32} cy={h / 2} r={13} fill={composite} className={r || g || b ? 'animate-pulse' : ''} />
          <circle cx={w - 36} cy={h / 2 - 4} r={3.5} fill="white" opacity={0.6} />
          <text x={12} y={h / 2 - 4} fill="#f1f5f9" fontFamily="ui-monospace, monospace" fontWeight="bold" fontSize="11">
            RGB LED
          </text>
          <text x={12} y={h / 2 + 10} fill="#a855f7" fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="bold">
            R:{r ? '1' : '0'} G:{g ? '1' : '0'} B:{b ? '1' : '0'}
          </text>
        </g>
      );
    }

    if (gateType.includes('SRAM') || gateType.includes('BRAM') || gateType.includes('ROM') || gateType.includes('FIFO') || gateType.includes('REG_FILE')) {
      const memTag = gateType.includes('ROM')
        ? 'ROM'
        : gateType.includes('FIFO')
        ? 'FIFO'
        : gateType.includes('BRAM')
        ? 'BRAM'
        : gateType.includes('REG_FILE')
        ? 'REGFILE'
        : 'SRAM';
      return (
        <g>
          <rect width={w} height={h} rx={6} fill={fillVal} stroke={isSelected ? '#c084fc' : '#6366f1'} strokeWidth={strokeWidthVal} className={fillClass} />
          <path d={`M 0 6 Q 0 0 6 0 L ${w - 6} 0 Q ${w} 0 ${w} 6 L ${w} 24 L 0 24 Z`} fill="#1e1b4b" stroke="#3730a3" strokeWidth={1} />
          <text x={w / 2} y={16} textAnchor="middle" fill="#c7d2fe" fontFamily="ui-monospace, monospace" fontWeight="bold" fontSize="11">
            {node.label.length > 20 ? node.label.substring(0, 18) + '…' : node.label}
          </text>
          {/* Memory Matrix Grid Lines */}
          <g opacity="0.3" stroke="#818cf8" strokeWidth="0.75">
            <line x1={w / 2 - 30} y1={h / 2 - 10} x2={w / 2 + 30} y2={h / 2 - 10} />
            <line x1={w / 2 - 30} y1={h / 2} x2={w / 2 + 30} y2={h / 2} />
            <line x1={w / 2 - 30} y1={h / 2 + 10} x2={w / 2 + 30} y2={h / 2 + 10} />
            <line x1={w / 2 - 10} y1={h / 2 - 16} x2={w / 2 - 10} y2={h / 2 + 16} />
            <line x1={w / 2 + 10} y1={h / 2 - 16} x2={w / 2 + 10} y2={h / 2 + 16} />
          </g>
          <text x={w / 2} y={h - 6} textAnchor="middle" fill="#818cf8" fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="bold">
            [{memTag} ARRAY]
          </text>
        </g>
      );
    }

    if (gateType.includes('SENSOR') || gateType.includes('ADC') || gateType.includes('DAC') || gateType.includes('PWM')) {
      const sensTag = gateType.includes('TEMP')
        ? 'TEMP'
        : gateType.includes('LIGHT')
        ? 'LUX'
        : gateType.includes('PWM')
        ? 'PWM'
        : gateType.includes('ADC')
        ? 'ADC'
        : 'DAC';
      return (
        <g>
          <rect width={w} height={h} rx={6} fill={fillVal} stroke={isSelected ? strokeVal : '#059669'} strokeWidth={strokeWidthVal} className={fillClass} />
          <path d={`M 0 6 Q 0 0 6 0 L ${w - 6} 0 Q ${w} 0 ${w} 6 L ${w} 24 L 0 24 Z`} fill="#064e3b" stroke="#047857" strokeWidth={1} />
          <text x={w / 2} y={16} textAnchor="middle" fill="#6ee7b7" fontFamily="ui-monospace, monospace" fontWeight="bold" fontSize="11">
            {node.label.length > 20 ? node.label.substring(0, 18) + '…' : node.label}
          </text>
          <circle cx={w / 2} cy={h / 2 + 6} r={12} fill="#022c22" stroke="#10b981" strokeWidth={1.5} />
          <text x={w / 2} y={h / 2 + 10} textAnchor="middle" fill="#34d399" fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="bold">
            {sensTag}
          </text>
        </g>
      );
    }

    if (gateType.includes('PAD') || gateType.includes('CLK_TREE') || gateType.includes('POWER_SWITCH') || gateType.includes('JTAG')) {
      const asicTag = gateType.includes('PAD') ? 'I/O PAD' : gateType.includes('CTS') || gateType.includes('CLK_TREE') ? 'CTS BUF' : gateType.includes('JTAG') ? 'JTAG TAP' : 'MTCMOS';
      return (
        <g>
          <rect width={w} height={h} rx={4} fill={fillVal} stroke={isSelected ? '#c084fc' : '#d97706'} strokeWidth={strokeWidthVal} className={fillClass} />
          <path d={`M 0 4 L 4 0 L ${w - 4} 0 L ${w} 4 L ${w} 22 L 0 22 Z`} fill="#451a03" stroke="#b45309" strokeWidth={1} />
          <text x={w / 2} y={15} textAnchor="middle" fill="#fde68a" fontFamily="ui-monospace, monospace" fontWeight="bold" fontSize="10">
            {node.label.length > 18 ? node.label.substring(0, 16) + '…' : node.label}
          </text>
          <text x={w / 2} y={h / 2 + 10} textAnchor="middle" fill="#f59e0b" fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="bold">
            [{asicTag}]
          </text>
        </g>
      );
    }

    if (gateType === 'PUSHBUTTON' || gateType.includes('SWITCH')) {
      return (
        <g>
          <rect width={w} height={h} rx={6} fill={fillVal} stroke={strokeVal} strokeWidth={strokeWidthVal} className={fillClass} />
          <circle cx={w / 2} cy={h / 2} r={14} fill="#dc2626" stroke="#991b1b" strokeWidth={2} />
          <circle cx={w / 2} cy={h / 2} r={10} fill="#ef4444" />
          <text x={w / 2} y={h - 6} textAnchor="middle" fill="#f87171" fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="bold">
            {gateType === 'PUSHBUTTON' ? 'PUSH' : 'SWITCH'}
          </text>
        </g>
      );
    }

    // Structured Functional EDA Block
    return (
      <g>
        <rect
          width={w}
          height={h}
          rx={6}
          fill={fillVal}
          stroke={strokeVal}
          strokeWidth={strokeWidthVal}
          className={`${fillClass} ${strokeClass}`}
        />
        <path
          d={`M 0 6 Q 0 0 6 0 L ${w - 6} 0 Q ${w} 0 ${w} 6 L ${w} 26 L 0 26 Z`}
          fill="#1e293b"
          stroke="#334155"
          strokeWidth={1}
          className="fill-slate-800/95 stroke-slate-700/80 stroke-[1]"
        />
        <text
          x={w / 2}
          y={17}
          textAnchor="middle"
          fill="#e9d5ff"
          fontFamily="ui-monospace, monospace"
          fontWeight="bold"
          fontSize="11"
          className="fill-purple-200 font-mono font-bold text-[11px] tracking-tight"
        >
          {node.label.length > 24 ? node.label.substring(0, 22) + '…' : node.label}
        </text>
        <text
          x={w / 2}
          y={h - 8}
          textAnchor="middle"
          fill="#64748b"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          className="fill-slate-500 font-mono text-[9px]"
        >
          [{node.type}]
        </text>
      </g>
    );
  };

  const isAgentWorking =
    agentState === 'PLANNING' ||
    agentState === 'DESIGNING' ||
    agentState === 'SYNTHESIZING' ||
    agentState === 'SIMULATING' ||
    agentState === 'LEARNING';
  if (!netlist) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 bg-slate-950">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-400" />
          <p>No circuit netlist loaded. Synthesize or select a circuit above.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full bg-slate-950 overflow-hidden flex flex-col select-none"
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        const pt = getCanvasPoint(e.clientX, e.clientY);
        const gridPos = { x: Math.round(pt.x / GRID) * GRID, y: Math.round(pt.y / GRID) * GRID };
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas', target: gridPos });
      }}
    >
      {/* Top Controls Bar: Compact, Non-Obstructing EDA Toolbar */}
      <div className="absolute top-3 left-3 z-20 flex items-center space-x-1.5 bg-slate-900/90 border border-slate-700/80 backdrop-blur-md rounded-xl p-1 shadow-2xl overflow-visible pointer-events-auto select-none">
        <button
          onClick={() => setShowGrid((g) => !g)}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            showGrid ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:bg-slate-800'
          }`}
          title="Toggle 20px Grid"
        >
          <Grid className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSnapToGrid((s) => !s)}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            snapToGrid ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:bg-slate-800'
          }`}
          title="Snap to 20px Grid"
        >
          <Magnet className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-700/80" />

        {/* Add Component Button */}
        <button
          onClick={() => setIsPaletteOpen(!isPaletteOpen)}
          className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition cursor-pointer ${
            isPaletteOpen
              ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-600 text-white shadow-lg shadow-teal-500/20'
              : 'bg-teal-950/80 hover:bg-teal-900 border border-teal-500/50 text-teal-300'
          }`}
          title="Open Component Library Palette"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add Component</span>
        </button>

        <button
          onClick={handleAutoOrganize}
          className="px-2 py-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
          title="Auto-Organize Components Topologically on Grid"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden md:inline">Auto-Organize</span>
        </button>

        <button
          onClick={handleResetLayout}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
          title="Reset Components to Default Layout"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleClearCanvas}
          className="p-1.5 hover:bg-rose-950/80 rounded-lg text-slate-400 hover:text-rose-300 transition cursor-pointer"
          title="Clear Canvas (Wipe components & connections)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleExportSVG}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
          title="Export Schematic as SVG"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setShowCoWorkGuide(true)}
          className="p-1.5 hover:bg-indigo-900/80 text-indigo-400 hover:text-indigo-200 rounded-lg transition cursor-pointer"
          title="Open EDA Workflow & Co-Work Guide"
        >
          <Users className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-700/80" />

        {/* File Origins Filter Pill / Legend Toggle */}
        <div className="relative">
          <button
            onClick={() => setIsFileLegendOpen(!isFileLegendOpen)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
              isFileLegendOpen
                ? 'bg-slate-800 text-teal-200 border border-teal-500 shadow-md'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title="Toggle Multi-File Component Shading Legend & Module Hierarchy"
          >
            <Layers className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden lg:inline">File Origins</span>
            <span className="px-1.5 py-0.2 rounded-full bg-teal-950 border border-teal-800 text-[10px] text-teal-300 font-mono">
              {fileOriginsList.length}
            </span>
          </button>

          {/* File Origins Dropdown Menu */}
          {isFileLegendOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsFileLegendOpen(false)} />
              <div className="absolute top-10 left-0 z-50 w-72 p-2.5 rounded-xl bg-slate-900/95 border border-teal-500/50 shadow-2xl backdrop-blur-md space-y-2 text-xs animate-fade-in">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                <div className="flex items-center space-x-1.5 font-bold text-slate-200">
                  <FileText className="w-3.5 h-3.5 text-teal-400" />
                  <span>Multi-File Module Shading</span>
                </div>
                <button
                  onClick={() => setIsFileLegendOpen(false)}
                  className="text-slate-400 hover:text-slate-200 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[11px] text-slate-400 leading-snug">
                Components on canvas are automatically shaded according to their source file & module inheritance.
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {fileOriginsList.map((item) => (
                  <div
                    key={item.file}
                    className="p-1.5 rounded-lg border flex items-center justify-between font-mono text-[11px]"
                    style={{
                      backgroundColor: item.palette.bg,
                      borderColor: item.palette.border,
                    }}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: item.palette.border }}
                      />
                      <span className="font-semibold truncate" style={{ color: item.palette.text }}>
                        {formatFileLabel(item.file)}
                      </span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded bg-slate-950/80 border border-slate-700 text-slate-300 text-[10px] font-bold">
                      {item.count} {item.count === 1 ? 'gate' : 'gates'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Module Enclosures:</span>
                <button
                  onClick={() => setShowModuleEnclosures(!showModuleEnclosures)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                    showModuleEnclosures
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {showModuleEnclosures ? 'VISIBLE' : 'HIDDEN'}
                </button>
              </div>
            </div>
          </>
        )}
        </div>

        {/* DRC Health & Physical Consequence Inspector Button */}
        <button
          onClick={() => setIsDrcDrawerOpen(!isDrcDrawerOpen)}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-sm ${
            allDrcDiagnostics.length === 0
              ? 'bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-600/70 text-emerald-300'
              : 'bg-rose-950/80 hover:bg-rose-900 border border-rose-600 text-rose-200 animate-pulse'
          }`}
          title="Open Circuit Design Rule Check (DRC) & Physical Hardware Consequence Inspector"
        >
          {allDrcDiagnostics.length === 0 ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">DRC Health:</span>
              <span className="font-mono text-[10px] font-bold text-emerald-300">Clean (0)</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden md:inline">DRC Issues:</span>
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold">
                {allDrcDiagnostics.length}
              </span>
            </>
          )}
        </button>

        <div className="h-4 w-px bg-slate-700/80" />

        {/* Zoom & Fit Controls */}
        <button
          onClick={() => setZoom((z) => Math.max(0.15, Number((z * 0.85).toFixed(2))))}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <span className="text-[11px] text-slate-300 px-1 font-mono font-bold">{Math.round(zoom * 100)}%</span>

        <button
          onClick={() => setZoom((z) => Math.min(3.5, Number((z * 1.15).toFixed(2))))}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleFitToView}
          className="p-1.5 hover:bg-purple-900/60 text-purple-300 hover:text-white rounded-lg transition cursor-pointer"
          title="Fit to View / Auto-Center"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Component Library Palette Dropdown */}
      {isPaletteOpen && (
        <div className="absolute top-14 left-4 z-40 shadow-2xl animate-fade-in max-h-[75vh] flex flex-col">
          <ComponentPalette
            isOpen={isPaletteOpen}
            onAddComponent={(blueprint) => {
              const rawPos = pendingPlacePos ?? {
                x: Math.round((-pan.x + 360) / (zoom * GRID)) * GRID,
                y: Math.round((-pan.y + 240) / (zoom * GRID)) * GRID,
              };

              const { position: placePos, requiresZoomOut } = findEmptyCanvasSlot(
                rawPos,
                blueprint.width || 140,
                blueprint.height || 80
              );

              if (onAddComponent) {
                onAddComponent(blueprint, placePos);
              }

              if (requiresZoomOut) {
                applyAutoZoomPan(placePos);
              }

              addNotification('success', 'Component Added', `Placed ${blueprint.name} at (${placePos.x}, ${placePos.y}).`);
              setIsPaletteOpen(false);
              setPendingPlacePos(null);
            }}
            onClose={() => {
              setIsPaletteOpen(false);
              setPendingPlacePos(null);
            }}
          />
        </div>
      )}

      {/* Top Right: Contextual Status Pill (Wiring Mode or Agent Intervention) */}
      {(wiringStart || isAgentWorking || agentState === 'PAUSED') && (
        <div className="absolute top-3 right-3 z-20 flex items-center space-x-2">
          {wiringStart && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-950/95 to-blue-950/95 border border-teal-500 text-teal-200 backdrop-blur-md shadow-2xl text-xs font-semibold animate-pulse">
              <Cable className="w-3.5 h-3.5 text-teal-400" />
              <span>Click pin to connect</span>
              <button
                onClick={() => setWiringStart(null)}
                className="ml-1 px-1.5 py-0.5 rounded bg-teal-800 hover:bg-teal-700 text-white text-[10px] font-mono transition"
              >
                Cancel
              </button>
            </div>
          )}

          {isAgentWorking && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-950/95 to-purple-950/95 border border-teal-500/80 text-cyan-200 backdrop-blur-md shadow-2xl text-xs font-semibold animate-pulse">
              <Bot className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>AI Agent: {agentState}</span>
              {onAgentIntervention && (
                <button
                  onClick={() => onAgentIntervention('pause')}
                  className="ml-1.5 px-2 py-0.5 rounded bg-blue-800 hover:bg-blue-700 text-white text-[10px] font-mono transition"
                >
                  Pause
                </button>
              )}
            </div>
          )}

          {agentState === 'PAUSED' && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-amber-950/90 border border-amber-500/80 text-amber-200 backdrop-blur-md shadow-2xl text-xs font-semibold">
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              <span>Agent Paused</span>
              {onAgentIntervention && (
                <>
                  <button
                    onClick={() => onAgentIntervention('step')}
                    className="px-2 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-mono transition"
                  >
                    Step
                  </button>
                  <button
                    onClick={() => onAgentIntervention('resume')}
                    className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-mono transition"
                  >
                    Resume
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Canvas Dialogue / Toast Station (Bottom Right, Non-Obtrusive) */}
      <div className="absolute bottom-4 right-4 z-40 flex flex-col-reverse space-y-reverse space-y-2 max-w-sm pointer-events-none">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`pointer-events-auto p-3 rounded-2xl shadow-2xl backdrop-blur-md border text-xs flex items-start space-x-2.5 animate-slide-in transition-all ${
              notif.type === 'error'
                ? 'bg-rose-950/95 border-rose-600/80 text-rose-200'
                : notif.type === 'warning'
                ? 'bg-amber-950/95 border-amber-600/80 text-amber-200'
                : notif.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-600/80 text-emerald-200'
                : 'bg-slate-900/95 border-slate-700 text-slate-200'
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {notif.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
              {notif.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
              {notif.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {notif.type === 'info' && <Info className="w-4 h-4 text-sky-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xs tracking-tight">{notif.title}</div>
              <p className="text-[11px] opacity-90 leading-snug mt-0.5 font-sans">{notif.message}</p>
              {notif.actionLabel && notif.onAction && (
                <button
                  onClick={() => {
                    notif.onAction?.();
                    dismissNotification(notif.id);
                  }}
                  className="mt-1.5 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-[10px] font-semibold transition"
                >
                  {notif.actionLabel}
                </button>
              )}
            </div>
            <button
              onClick={() => dismissNotification(notif.id)}
              className="p-1 rounded-lg hover:bg-black/20 opacity-60 hover:opacity-100 transition"
              title="Dismiss Alert"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Wiring Mode Active Banner (shown when user is routing a wire) */}
      {wiringStart && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-3 px-4 py-2 rounded-2xl bg-gradient-to-r from-teal-950/95 to-blue-950/95 border border-teal-500 text-teal-200 text-xs font-semibold backdrop-blur-md shadow-2xl shadow-teal-500/20 animate-pulse pointer-events-none">
          <Cable className="w-4 h-4 text-teal-400 flex-shrink-0" />
          <span>
            Routing from <span className="text-white font-bold font-mono">{wiringStart.nodeId}:{wiringStart.portName}</span>
            {' '}— Click a {wiringStart.isSource ? 'target input' : 'source output'} pin to connect
          </span>
          <button
            className="pointer-events-auto px-2 py-0.5 rounded bg-teal-800/80 hover:bg-teal-700 text-teal-200 text-[10px] font-mono transition ml-2 cursor-pointer"
            onClick={() => setWiringStart(null)}
          >
            Esc
          </button>
        </div>
      )}

      {/* SVG Canvas Area */}
      <div
        className="flex-1 w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center relative"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const rawData = e.dataTransfer.getData('application/json');
          if (!rawData) return;
          try {
            const blueprint: ComponentBlueprint = JSON.parse(rawData);
            if (blueprint && blueprint.type && onAddComponent) {
              const pt = getCanvasPoint(e.clientX, e.clientY);
              const { position: dropPos, requiresZoomOut } = findEmptyCanvasSlot(
                pt,
                blueprint.width || 140,
                blueprint.height || 80
              );
              onAddComponent(blueprint, dropPos);
              if (requiresZoomOut) {
                applyAutoZoomPan(dropPos);
              }
              addNotification('success', 'Component Placed', `Placed ${blueprint.name} at (${dropPos.x}, ${dropPos.y})`);
              setIsPaletteOpen(false);
              setPendingPlacePos(null);
            }
          } catch (err) {
            console.error('Failed to drop component:', err);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const pt = getCanvasPoint(e.clientX, e.clientY);
          const gridPos = { x: Math.round(pt.x / GRID) * GRID, y: Math.round(pt.y / GRID) * GRID };
          setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas', target: gridPos });
        }}
      >
        <svg
          ref={svgRef}
          className="w-full h-full"
          viewBox="0 0 1400 700"
          preserveAspectRatio="xMidYMid meet"
          onMouseDown={handleCanvasMouseDown}
          onWheel={handleWheel}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const pt = getCanvasPoint(e.clientX, e.clientY);
            const gridPos = { x: Math.round(pt.x / GRID) * GRID, y: Math.round(pt.y / GRID) * GRID };
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas', target: gridPos });
          }}
        >
          <defs>
            <pattern
              id="schematic-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
            >
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.85" />
              <circle cx="0" cy="0" r="0.8" fill="#334155" />
            </pattern>

            <filter id="green-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#22c55e" floodOpacity="0.75" />
            </filter>
            <filter id="bus-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#c084fc" floodOpacity="0.65" />
            </filter>
            <filter id="cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#38bdf8" floodOpacity="0.5" />
            </filter>
            <filter id="inactive-wire-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#38bdf8" floodOpacity="0.35" />
            </filter>
            <filter id="amber-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#f59e0b" floodOpacity="0.75" />
            </filter>
            <filter id="rose-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#f43f5e" floodOpacity="0.75" />
            </filter>
          </defs>

          {showGrid && (
            <rect
              id="canvas-bg-rect"
              x="-50000"
              y="-50000"
              width="100000"
              height="100000"
              fill="url(#schematic-grid)"
            />
          )}

          <g
            ref={contentGroupRef}
            transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
            style={{ transformOrigin: '700px 350px' }}
          >
            {/* PRIMARY INPUT PINS: Sleek, Movable High-Precision EDA Terminal Block */}
            {netlist.primary_inputs.map((pin, i) => {
              const defaultPos = { x: 40, y: 80 + i * 70 };
              const pos = nodePositions[pin.id] || nodePositions[pin.name] || defaultPos;
              const rawVal = probeValues[pin.name] ?? probeValues[pin.id] ?? '0';
              const { displayVal, buttonX, pillWidth, chassisWidth, isBus } = getPrimaryInputLayout(pin, rawVal);
              const isHigh = toBit(displayVal) === 1;
              const isHovered = hoveredPin?.nodeId === pin.id || hoveredPin?.nodeId === pin.name;
              const isStartPin = wiringStart?.nodeId === pin.id || wiringStart?.nodeId === pin.name;
              const isDragging = draggingNodeId === pin.id || draggingNodeId === pin.name;
              const clipId = `pill-clip-in-${pin.id}`;

              return (
                <g
                  key={pin.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onMouseDown={(e) => handlePortMouseDown(e, pin.id, defaultPos)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'input', target: pin });
                  }}
                  className={`group select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                  <defs>
                    <clipPath id={clipId}>
                      <rect x="0" y="0" width={pillWidth} height="22" rx="5" />
                    </clipPath>
                  </defs>

                  {/* Modern Terminal Chassis */}
                  <rect
                    x="0"
                    y="0"
                    width={chassisWidth}
                    height="38"
                    rx="6"
                    fill="#0f172a"
                    stroke={isHigh ? '#10b981' : isBus ? '#38bdf8' : '#334155'}
                    strokeWidth={isHigh ? 1.5 : 1.25}
                    className={`transition-all duration-150 ${
                      isHigh
                        ? 'fill-slate-900/95 stroke-emerald-500/90 stroke-[1.5] shadow-lg shadow-emerald-500/10'
                        : isBus
                        ? 'fill-slate-900/95 stroke-cyan-500/90 stroke-[1.5] shadow-lg shadow-cyan-500/10'
                        : 'fill-slate-900/95 stroke-slate-700/80 stroke-[1.25] group-hover:stroke-indigo-500/80 shadow-md'
                    }`}
                  />

                  {/* Drag Grip Dots */}
                  <g className="opacity-40 group-hover:opacity-80 transition-opacity">
                    <circle cx="7" cy="14" r="1.5" fill="#94a3b8" />
                    <circle cx="7" cy="19" r="1.5" fill="#94a3b8" />
                    <circle cx="7" cy="24" r="1.5" fill="#94a3b8" />
                  </g>

                  {/* Port Tag Badge [IN] */}
                  <rect x="14" y="10" width="22" height="18" rx="4" fill="#1e1b4b" stroke="#6366f1" strokeWidth="0.75" />
                  <text x="25" y="22.5" textAnchor="middle" fill="#a5b4fc" fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="bold" className="fill-indigo-300 font-mono text-[9px] font-bold">
                    IN
                  </text>

                  {/* Pin Signal Label */}
                  <text x="42" y="23.5" fill="#f1f5f9" fontFamily="ui-monospace, monospace" fontSize="12" fontWeight="bold" className="fill-slate-100 font-mono font-bold text-xs">
                    {pin.name}
                    {pin.width > 1 && (
                      <tspan fill="#c084fc" className="fill-purple-400 text-[10px] ml-0.5">[{pin.width - 1}:0]</tspan>
                    )}
                  </text>

                  {/* Interactive Value Toggle Button with Solid Semantic Color Fill */}
                  <g
                    transform={`translate(${buttonX}, 8)`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleInput && onToggleInput(pin.name, rawVal);
                    }}
                    className="cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                  >
                    <title>{`Click to toggle ${pin.name} (currently ${displayVal})`}</title>
                    <rect
                      width={pillWidth}
                      height="22"
                      rx="5"
                      fill={isHigh ? '#059669' : isBus ? '#0e7490' : '#334155'}
                      stroke={isHigh ? '#34d399' : isBus ? '#22d3ee' : '#64748b'}
                      strokeWidth="1.5"
                      className="shadow-md"
                    />
                    <text
                      x={pillWidth / 2}
                      y="15.5"
                      textAnchor="middle"
                      className="font-mono font-bold text-xs fill-white select-none pointer-events-none"
                    >
                      {displayVal}
                    </text>
                  </g>

                  {/* Solder Connection Terminal (Right Edge at x=chassisWidth, y=19) */}
                  <g
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) =>
                      handlePinClick(e, pin.name, pin.name, true, pos.x + chassisWidth, pos.y + 19, pin.width || 1)
                    }
                    onMouseEnter={() => setHoveredPin({ nodeId: pin.id, portName: pin.name })}
                    onMouseLeave={() => setHoveredPin(null)}
                    className="cursor-crosshair"
                  >
                    <title>{`Wire from ${pin.name} (Click to route)`}</title>
                    {/* Generous invisible click target (radius 20px = 40px diameter) */}
                    <circle cx={chassisWidth} cy="19" r="20" fill="transparent" pointerEvents="all" />

                    {/* Clean pulsing target ring when user is wiring towards a primary input terminal */}
                    {wiringStart && !wiringStart.isSource && wiringStart.nodeId !== pin.name && (
                      <circle cx={chassisWidth} cy="19" r="11" fill="#34d399" fillOpacity="0.18" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 2" className="animate-pulse" />
                    )}

                    <circle
                      cx={chassisWidth}
                      cy="19"
                      r={isHovered || isStartPin ? 7 : 5}
                      className={
                        isStartPin
                          ? 'fill-purple-400 stroke-white stroke-2 animate-ping'
                          : isHovered
                          ? 'fill-purple-400 stroke-white stroke-1.5'
                          : isHigh
                          ? 'fill-emerald-400 stroke-slate-900 stroke-1'
                          : 'fill-sky-400 stroke-slate-900 stroke-1'
                      }
                      filter={isHigh ? 'url(#green-glow)' : 'url(#cyan-glow)'}
                    />
                  </g>
                </g>
              );
            })}

            {/* PRIMARY OUTPUT PINS: Sleek, Movable High-Precision EDA Terminal Block */}
            {netlist.primary_outputs.map((pin, i) => {
              const defaultPos = { x: 980, y: 80 + i * 70 };
              const pos = nodePositions[pin.id] || nodePositions[pin.name] || defaultPos;
              const rawVal = probeValues[pin.name] ?? probeValues[pin.id] ?? '0';
              const { displayVal, buttonX, pillWidth, chassisWidth, isBus } = getPrimaryOutputLayout(pin, rawVal);
              const isHigh = toBit(displayVal) === 1;
              const isHovered = hoveredPin?.nodeId === pin.id || hoveredPin?.nodeId === pin.name;
              const isStartPin = wiringStart?.nodeId === pin.id || wiringStart?.nodeId === pin.name;
              const isDragging = draggingNodeId === pin.id || draggingNodeId === pin.name;
              const clipId = `pill-clip-out-${pin.id}`;

              return (
                <g
                  key={pin.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onMouseDown={(e) => handlePortMouseDown(e, pin.id, defaultPos)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'output', target: pin });
                  }}
                  className={`group select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                  <defs>
                    <clipPath id={clipId}>
                      <rect x="0" y="0" width={pillWidth} height="22" rx="5" />
                    </clipPath>
                  </defs>

                  {/* Solder Connection Terminal (Left Edge at x=0, y=19) */}
                  <g
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) =>
                      handlePinClick(e, pin.name, pin.name, false, pos.x, pos.y + 19, pin.width || 1)
                    }
                    onMouseEnter={() => setHoveredPin({ nodeId: pin.id, portName: pin.name })}
                    onMouseLeave={() => setHoveredPin(null)}
                    className="cursor-crosshair"
                  >
                    <title>{`Wire to ${pin.name} (Click to connect)`}</title>
                    {/* Generous invisible click target (radius 20px = 40px diameter) */}
                    <circle cx="0" cy="19" r="20" fill="transparent" pointerEvents="all" />

                    {/* Clean pulsing target ring when user is wiring from an output towards a primary output terminal */}
                    {wiringStart && wiringStart.isSource && wiringStart.nodeId !== pin.name && (
                      <circle cx="0" cy="19" r="11" fill="#34d399" fillOpacity="0.18" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 2" className="animate-pulse" />
                    )}

                    <circle
                      cx="0"
                      cy="19"
                      r={isHovered || isStartPin ? 7 : 5}
                      className={
                        isStartPin
                          ? 'fill-purple-400 stroke-white stroke-2 animate-ping'
                          : isHovered
                          ? 'fill-purple-400 stroke-white stroke-1.5'
                          : isHigh
                          ? 'fill-emerald-400 stroke-slate-900 stroke-1'
                          : 'fill-sky-400 stroke-slate-900 stroke-1'
                      }
                      filter={isHigh ? 'url(#green-glow)' : 'url(#cyan-glow)'}
                    />
                  </g>

                  {/* Modern Terminal Chassis */}
                  <rect
                    x="0"
                    y="0"
                    width={chassisWidth}
                    height="38"
                    rx="6"
                    fill="#0f172a"
                    stroke={isHigh ? '#10b981' : isBus ? '#38bdf8' : '#334155'}
                    strokeWidth={isHigh ? 1.75 : 1.25}
                    className={`transition-all duration-150 ${
                      isHigh
                        ? 'fill-slate-900/95 stroke-emerald-500 stroke-[1.75] shadow-lg shadow-emerald-500/15'
                        : isBus
                        ? 'fill-slate-900/95 stroke-cyan-500 stroke-[1.75] shadow-lg shadow-cyan-500/15'
                        : 'fill-slate-900/95 stroke-slate-700/80 stroke-[1.25] group-hover:stroke-emerald-500/80 shadow-md'
                    }`}
                  />

                  {/* Port Tag Badge [OUT] */}
                  <rect x="10" y="10" width="26" height="18" rx="4" fill="#064e3b" stroke="#10b981" strokeWidth="0.75" />
                  <text x="23" y="22.5" textAnchor="middle" fill="#6ee7b7" fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="bold" className="fill-emerald-300 font-mono text-[9px] font-bold">
                    OUT
                  </text>

                  {/* Pin Signal Label */}
                  <text x="42" y="23.5" fill="#f1f5f9" fontFamily="ui-monospace, monospace" fontSize="12" fontWeight="bold" className="fill-slate-100 font-mono font-bold text-xs">
                    {pin.name}
                    {pin.width > 1 && (
                      <tspan fill="#c084fc" className="fill-purple-400 text-[10px] ml-0.5">[{pin.width - 1}:0]</tspan>
                    )}
                  </text>

                  {/* Live Logic State Monitor Pill with Solid Semantic Color Fill */}
                  <g transform={`translate(${buttonX}, 8)`}>
                    <rect
                      width={pillWidth}
                      height="22"
                      rx="5"
                      fill={isHigh ? '#059669' : isBus ? '#0e7490' : '#334155'}
                      stroke={isHigh ? '#34d399' : isBus ? '#22d3ee' : '#64748b'}
                      strokeWidth="1.5"
                      className="shadow-md"
                    />
                    <text
                      x={pillWidth / 2}
                      y="15.5"
                      textAnchor="middle"
                      className="font-mono font-bold text-xs fill-white select-none pointer-events-none"
                    >
                      {displayVal}
                    </text>
                  </g>

                  {/* Drag Grip Dots */}
                  <g className="opacity-40 group-hover:opacity-80 transition-opacity">
                    <circle cx={chassisWidth - 6} cy="14" r="1.5" fill="#94a3b8" />
                    <circle cx={chassisWidth - 6} cy="19" r="1.5" fill="#94a3b8" />
                    <circle cx={chassisWidth - 6} cy="24" r="1.5" fill="#94a3b8" />
                  </g>
                </g>
              );
            })}

            {/* WIRES WITH AUTHENTIC IEEE JUMPER BYPASS ARCS */}
            {computedWireData.wires.map((rw) => {
              const { wire, x1, y1, x2, y2, wireColor, wireFilter, strokeWidth, isBus, isHigh, wireVal, badgeX, badgeY, waypoints } = rw;

              const fullPath = buildWireSvgPath(waypoints, wire.id, wire.label || wire.id, computedWireData.verticalSegments);
              const isSelected = selectedWire?.id === wire.id;
              const isHovered = hoveredWireId === wire.id;

              return (
                <g
                  key={wire.id}
                  onMouseEnter={() => setHoveredWireId(wire.id)}
                  onMouseLeave={() => setHoveredWireId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWire(wire);
                    setSelectedNode(null);
                    setContextMenu(null);
                    onWireSelect?.(wire.id, wire.label || wire.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedWire(wire);
                    setSelectedNode(null);
                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'wire', target: wire });
                  }}
                  className="cursor-pointer group"
                >
                  {/* Generous invisible hit path for effortless 1-click selection and right-click (20px wide) */}
                  <path
                    d={fullPath}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="20"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="stroke"
                    className="cursor-pointer"
                  />

                  {/* Selection Pulsing Aura */}
                  {isSelected && (
                    <path
                      d={fullPath}
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth={strokeWidth + 5}
                      strokeOpacity="0.5"
                      strokeDasharray="6 3"
                      className="animate-pulse pointer-events-none"
                    />
                  )}

                  {(() => {
                    const hasConflict = !!wire.has_conflict;
                    const isInherited = !!wire.is_inherited;
                    const finalStroke = hasConflict ? '#ef4444' : isInherited ? '#818cf8' : wireColor;
                    const finalWidth = hasConflict ? strokeWidth + 1.5 : isInherited ? strokeWidth + 0.5 : strokeWidth;
                    const finalFilter = hasConflict ? 'url(#rose-glow)' : isInherited ? 'url(#purple-glow)' : wireFilter;

                    return (
                      <>
                        <path
                          d={fullPath}
                          fill="none"
                          stroke={finalStroke}
                          strokeWidth={finalWidth}
                          filter={finalFilter}
                          strokeDasharray={isInherited ? '6 3' : undefined}
                          className={`transition-colors duration-150 group-hover:stroke-white ${hasConflict ? 'animate-pulse' : isHigh ? (isBus ? 'animate-electric-flow-bus' : 'animate-electric-flow') : ''}`}
                        />

                        {/* Terminal dots */}
                        <circle cx={x1} cy={y1} r={isBus ? 4 : 3.5} fill={finalStroke} filter={finalFilter} />
                        <circle cx={x2} cy={y2} r={isBus ? 4 : 3.5} fill={finalStroke} filter={finalFilter} />
                      </>
                    );
                  })()}

                  {/* Bus Slash Tag */}
                  {isBus && (
                    <g transform={`translate(${x1 + 18}, ${y1})`}>
                      <line x1="-3" y1="4" x2="3" y2="-4" stroke="#c084fc" strokeWidth="2.5" />
                      <text x="5" y="-3" className="fill-purple-300 font-mono text-[9px] font-bold">
                        [{wire.width}]
                      </text>
                    </g>
                  )}

                  {/* Interactive Wire Bend & Segment Drag Handles */}
                  {(isSelected || isHovered) && (
                    <g className="wire-bend-handles">
                      {/* Segment Drag Handles */}
                      {waypoints.map((pA, idx) => {
                        if (idx >= waypoints.length - 1) return null;
                        const pB = waypoints[idx + 1];
                        if (!pA || !pB) return null;
                        const isVert = Math.abs(pA[0] - pB[0]) < 2;
                        const segLen = isVert ? Math.abs(pA[1] - pB[1]) : Math.abs(pA[0] - pB[0]);
                        if (segLen < 14) return null;

                        const midX = (pA[0] + pB[0]) / 2;
                        const midY = (pA[1] + pB[1]) / 2;

                        if (isVert) {
                          return (
                            <g
                              key={`vseg_${wire.id}_${idx}`}
                              transform={`translate(${midX}, ${midY})`}
                              className="cursor-col-resize group/vseg"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setSelectedWire(wire);
                                setDraggingWireBend({
                                  wireId: wire.id,
                                  type: 'vertical-segment',
                                  index: idx,
                                  startPt: { x: e.clientX, y: e.clientY },
                                  initialWaypoints: waypoints,
                                });
                              }}
                            >
                              <title>Drag to move vertical channel (X)</title>
                              <rect
                                x="-5"
                                y="-12"
                                width="10"
                                height="24"
                                rx="3"
                                className="fill-sky-500/90 stroke-white stroke-[1.5] shadow-lg group-hover/vseg:fill-amber-400 group-hover/vseg:scale-125 transition-all"
                              />
                              <line x1="0" y1="-7" x2="0" y2="7" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
                            </g>
                          );
                        } else {
                          return (
                            <g
                              key={`hseg_${wire.id}_${idx}`}
                              transform={`translate(${midX}, ${midY})`}
                              className="cursor-row-resize group/hseg"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setSelectedWire(wire);
                                setDraggingWireBend({
                                  wireId: wire.id,
                                  type: 'horizontal-segment',
                                  index: idx,
                                  startPt: { x: e.clientX, y: e.clientY },
                                  initialWaypoints: waypoints,
                                });
                              }}
                            >
                              <title>Drag to bend / move horizontal channel (Y)</title>
                              <rect
                                x="-12"
                                y="-5"
                                width="24"
                                height="10"
                                rx="3"
                                className="fill-sky-500/90 stroke-white stroke-[1.5] shadow-lg group-hover/hseg:fill-amber-400 group-hover/hseg:scale-125 transition-all"
                              />
                              <line x1="-7" y1="0" x2="7" y2="0" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
                            </g>
                          );
                        }
                      })}

                      {/* Intermediate Waypoint Corner Drag Handles */}
                      {waypoints.map((wp, wpIdx) => {
                        if (wpIdx === 0 || wpIdx === waypoints.length - 1) return null;
                        if (!wp) return null;
                        return (
                          <g
                            key={`wp_${wire.id}_${wpIdx}`}
                            transform={`translate(${wp[0]}, ${wp[1]})`}
                            className="cursor-move group/wp"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setSelectedWire(wire);
                              setDraggingWireBend({
                                wireId: wire.id,
                                type: 'waypoint',
                                index: wpIdx,
                                startPt: { x: e.clientX, y: e.clientY },
                                initialWaypoints: waypoints,
                              });
                            }}
                          >
                            <title>Drag corner waypoint freely</title>
                            <circle
                              cx="0"
                              cy="0"
                              r="6"
                              className="fill-amber-400 stroke-slate-900 stroke-2 group-hover/wp:fill-white group-hover/wp:r-7 transition-all shadow-md"
                            />
                            <circle cx="0" cy="0" r="2" fill="#0f172a" />
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {/* Conflict Short-Circuit Alert Badge */}
                  {wire.has_conflict && (
                    <g transform={`translate(${badgeX}, ${badgeY - 15})`}>
                      <rect
                        x="-75"
                        y="-8"
                        width="150"
                        height="16"
                        rx="4"
                        fill="#450a0a"
                        stroke="#ef4444"
                        strokeWidth="1.2"
                        className="shadow-lg animate-pulse"
                      />
                      <text x="0" y="3.5" textAnchor="middle" fill="#fecdd3" fontFamily="ui-monospace, monospace" fontSize="8" fontWeight="bold">
                        ⚠️ SHORT-CIRCUIT CONFLICT
                      </text>
                    </g>
                  )}

                  {/* Inheritance Port Mapping Wire Badge - Show only on selection or hover */}
                  {wire.is_inherited && (isSelected || hoveredWireId === wire.id) && (
                    <g transform={`translate(${badgeX}, ${badgeY + 15})`}>
                      <rect
                        x="-65"
                        y="-7"
                        width="130"
                        height="15"
                        rx="3"
                        fill="#1e1b4b"
                        stroke="#818cf8"
                        strokeWidth="1"
                        className="shadow-sm"
                      />
                      <text x="0" y="3.5" textAnchor="middle" fill="#c7d2fe" fontFamily="ui-monospace, monospace" fontSize="8" fontWeight="bold">
                        ↳ Port Map: {wire.parent_port || 'P'} ➔ {wire.child_port || 'C'}
                      </text>
                    </g>
                  )}

                  {/* Non-overlapping wire state pill badge */}
                  {(isBus || isSelected) && (
                    <g transform={`translate(${badgeX}, ${badgeY})`}>
                      <rect
                        x="-16"
                        y="-7"
                        width="32"
                        height="14"
                        rx="4"
                        fill="#090d16"
                        stroke={isSelected ? '#c084fc' : wireColor}
                        strokeWidth={isSelected ? '1.5' : '1'}
                        className="shadow-md"
                      />
                      <text x="0" y="3" textAnchor="middle" className="fill-slate-100 font-mono text-[8.5px] font-bold pointer-events-none">
                        {wireVal.length > 1 ? `0x${parseInt(wireVal, 2).toString(16).toUpperCase()}` : wireVal}
                      </text>

                      {/* Quick Reset Bends Button if customized */}
                      {wireCustomBends[wire.id] && (
                        <g
                          transform="translate(-24, 0)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWireCustomBends((prev) => {
                              const next = { ...prev };
                              delete next[wire.id];
                              return next;
                            });
                            addNotification('info', 'Bends Reset', `Reset wire bends to auto-route.`);
                          }}
                          className="cursor-pointer group/reset"
                        >
                          <title>Reset Wire Bends to Auto-Route</title>
                          <rect
                            x="-9"
                            y="-9"
                            width="18"
                            height="18"
                            rx="5"
                            className="fill-purple-950/95 stroke-purple-500 stroke-1 group-hover/reset:fill-purple-600 transition-colors shadow-lg"
                          />
                          <path
                            d="M -3 0 A 3 3 0 1 1 0 3 M 0 3 L -2 1 M 0 3 L 2 1"
                            stroke="white"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      )}

                      {/* Quick 1-Click Delete Button when wire is selected */}
                      {isSelected && onDeleteWire && (
                        <g
                          transform="translate(24, 0)"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteWire(wire.id);
                            setSelectedWire(null);
                            addNotification('info', 'Wire Deleted', `Removed connection on net ${wire.label || wire.id}.`);
                          }}
                          className="cursor-pointer group/del"
                        >
                          <title>Delete Wire Net (Del)</title>
                          <rect
                            x="-9"
                            y="-9"
                            width="18"
                            height="18"
                            rx="5"
                            className="fill-rose-950/95 stroke-rose-500 stroke-1 group-hover/del:fill-rose-600 transition-colors shadow-lg"
                          />
                          <path
                            d="M -3 -3 L 3 3 M 3 -3 L -3 3"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </g>
                      )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* SOLDER JUNCTION DOTS (Where connecting wires meet) */}
            {computedWireData.junctions.map((junc, jidx) => (
              <circle
                key={`junc_${jidx}`}
                cx={junc.x}
                cy={junc.y}
                r={4}
                className="fill-emerald-400 stroke-slate-900 stroke-[1]"
                filter="url(#green-glow)"
              />
            ))}

            {/* LIVE WIRING PREVIEW LINE (Orthogonal) */}
            {wiringStart && (
              <g className="pointer-events-none">
                {(() => {
                  const x1 = wiringStart.x;
                  const y1 = wiringStart.y;
                  const x2 = Math.round(mouseCanvasPos.x / GRID) * GRID;
                  const y2 = Math.round(mouseCanvasPos.y / GRID) * GRID;
                  const dist = Math.hypot(x2 - x1, y2 - y1);
                  if (dist < 4) {
                    return (
                      <circle cx={x1} cy={y1} r="7" fill="#c084fc" className="animate-ping opacity-80" />
                    );
                  }
                  const xMid = Math.round(((x1 + x2) / 2) / GRID) * GRID;
                  const previewD = buildWireSvgPath(
                    [
                      [x1, y1],
                      [xMid, y1],
                      [xMid, y2],
                      [x2, y2],
                    ],
                    'preview',
                    'preview',
                    computedWireData.verticalSegments
                  );
                  return (
                    <>
                      <path
                        d={previewD}
                        fill="none"
                        stroke="#c084fc"
                        strokeWidth="2.5"
                        strokeDasharray="6 3"
                        className="animate-pulse"
                      />
                      <circle cx={x2} cy={y2} r="5" fill="#a855f7" />
                    </>
                  );
                })()}
              </g>
            )}

            {/* SUBMODULE HIERARCHY ENCLOSURES */}
            {moduleEnclosures.map((enc) => (
              <g key={`enc_${enc.id}`} className="module-enclosure pointer-events-none select-none">
                <rect
                  x={enc.x}
                  y={enc.y}
                  width={enc.width}
                  height={enc.height}
                  rx="12"
                  fill={enc.palette.bg}
                  stroke={enc.palette.border}
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  strokeOpacity="0.8"
                />
                {(() => {
                  const rawMod = enc.module || '';
                  const cleanMod = rawMod
                    .replace(/\.[^/.]+$/, '')
                    .replace(/^task_/i, '')
                    .replace(/_[a-z0-9]{6,}$/i, '')
                    .replace(/_/g, ' ')
                    .trim();
                  const titleText = cleanMod.length > 0
                    ? cleanMod.replace(/\b\w/g, (l) => l.toUpperCase())
                    : 'Submodule';
                  const fileText = formatFileLabel(enc.file)
                    .replace(/^task_/i, '')
                    .replace(/_[a-z0-9]{6,}\.vhd$/i, '.vhd');
                  const labelStr = `📦 ${titleText} (${fileText}) • ${enc.nodeCount} gates`;
                  const headerW = Math.max(130, labelStr.length * 6.5 + 20);
                  return (
                    <g transform={`translate(${enc.x + 12}, ${enc.y - 12})`}>
                      <rect
                        x="0"
                        y="0"
                        width={headerW}
                        height="20"
                        rx="5"
                        fill={enc.palette.headerBg}
                        stroke={enc.palette.border}
                        strokeWidth="1"
                        className="shadow-md"
                      />
                      <text
                        x="8"
                        y="14"
                        fill={enc.palette.text}
                        fontSize="10"
                        fontFamily="ui-monospace, monospace"
                        fontWeight="bold"
                      >
                        {labelStr}
                      </text>
                    </g>
                  );
                })()}
              </g>
            ))}

            {/* CIRCUIT COMPONENTS (NODES) */}
            {netlist.nodes.map((node) => {
              const nodeW = getNodeWidth(node);
              const nodeH = getNodeHeight(node);
              const pos = nodePositions[node.id] || {
                x: Math.round(node.x / GRID) * GRID,
                y: Math.round(node.y / GRID) * GRID,
              };
              const isSelected = selectedNode?.id === node.id;

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedNode(node);
                    setSelectedWire(null);
                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'node', target: node });
                  }}
                  className="cursor-move group"
                >
                  {/* Selection Indicator */}
                  {isSelected && (
                    <>
                      <rect
                        x={-5}
                        y={-5}
                        width={nodeW + 10}
                        height={nodeH + 10}
                        rx={8}
                        fill="none"
                        stroke="#c084fc"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                        className="animate-pulse"
                      />
                      <g transform={`translate(${nodeW / 2}, -14)`}>
                        <rect x="-38" y="-9" width="76" height="18" rx="4" fill="#0f172a" stroke="#a855f7" strokeWidth="1" />
                        <text x="0" y="3" textAnchor="middle" className="fill-purple-300 font-mono text-[9px] font-bold">
                          X:{pos.x} Y:{pos.y}
                        </text>
                      </g>
                      {onDeleteComponent && (
                        <g
                          transform={`translate(${nodeW + 8}, -10)`}
                          className="cursor-pointer group/nodedel"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleDeleteComponentSafe(node);
                          }}
                        >
                          <circle r={10} fill="#450a0a" stroke="#f43f5e" strokeWidth={1.5} className="group-hover/nodedel:fill-rose-600 transition" />
                          <text textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={11} fontWeight="bold">✕</text>
                        </g>
                      )}
                    </>
                  )}

                  {/* DRC Target Spotlight */}
                  {highlightedDrcNodeId === node.id && (
                    <g className="animate-pulse pointer-events-none">
                      <rect
                        x="-10"
                        y="-10"
                        width={nodeW + 20}
                        height={nodeH + 20}
                        rx="12"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="3"
                        strokeDasharray="6 3"
                      />
                      <g transform={`translate(${nodeW / 2}, -26)`}>
                        <rect x="-50" y="-10" width="100" height="20" rx="5" fill="#450a0a" stroke="#ef4444" strokeWidth="1.5" />
                        <text x="0" y="4" textAnchor="middle" fill="#fecdd3" fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="bold">
                          ⚠️ DRC TARGET
                        </text>
                      </g>
                    </g>
                  )}

                  {/* Multi-File Origin Badge & Inheritance Tracking */}
                  {(fileOriginsList.length > 1 || isFileLegendOpen) && node.source_file && (
                    <g transform={`translate(2, -16)`} className="pointer-events-none select-none">
                      {(() => {
                        const filePal = getFilePalette(node.source_file);
                        let fileLabel = formatFileLabel(node.source_file);
                        fileLabel = fileLabel.replace(/^task_/i, '').replace(/_[a-z0-9]{6,}\.vhd$/i, '.vhd');
                        const badgeWidth = Math.max(45, fileLabel.length * 6 + 18);

                        const rawParent = node.parent_instance || '';
                        const parentClean = rawParent.replace(/^task_/i, '').replace(/_[a-z0-9]{6,}$/i, '');
                        const showParent = parentClean.length > 0 && parentClean !== fileLabel.replace(/\.[^/.]+$/, '');
                        const parentWidth = showParent ? parentClean.length * 6 + 14 : 0;

                        return (
                          <g>
                            <rect
                              x="0"
                              y="0"
                              width={badgeWidth}
                              height="14"
                              rx="3"
                              fill={filePal.badgeBg}
                              stroke={filePal.border}
                              strokeWidth="0.75"
                              className="shadow-sm"
                            />
                            <text
                              x={badgeWidth / 2}
                              y="10.5"
                              textAnchor="middle"
                              fill={filePal.text}
                              fontSize="8"
                              fontFamily="ui-monospace, monospace"
                              fontWeight="bold"
                            >
                              📄 {fileLabel}
                            </text>
                            {showParent && (
                              <g transform={`translate(${badgeWidth + 4}, 0)`}>
                                <rect
                                  x="0"
                                  y="0"
                                  width={parentWidth}
                                  height="14"
                                  rx="3"
                                  fill="#1e1b4b"
                                  stroke="#6366f1"
                                  strokeWidth="0.75"
                                />
                                <text
                                  x={parentWidth / 2}
                                  y="10.5"
                                  textAnchor="middle"
                                  fill="#c7d2fe"
                                  fontSize="8"
                                  fontFamily="ui-monospace, monospace"
                                >
                                  ↳ {parentClean}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })()}
                    </g>
                  )}

                  {/* Component Symbol */}
                  {renderNodeSymbol(node, nodeW, nodeH)}

                  {/* Input Terminals */}
                  {node.inputs.map((pin, pi) => {
                    const pinPos = getPinLocalPos(node, true, pi, node.inputs.length);
                    const isHovered = hoveredPin?.nodeId === node.id && hoveredPin?.portName === pin.name;
                    const isStartPin = wiringStart?.nodeId === node.id && wiringStart?.portName === pin.name;
                    const isCompatibleTarget = wiringStart && wiringStart.isSource && wiringStart.nodeId !== node.id;
                    const isUndriven = isInputPinUndriven(node, pin);

                    return (
                      <g
                        key={pin.id || `in_${pi}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) =>
                          handlePinClick(e, node.id, pin.name, false, pos.x + pinPos.x, pos.y + pinPos.y, pin.width || 1)
                        }
                        onMouseEnter={() => setHoveredPin({ nodeId: node.id, portName: pin.name })}
                        onMouseLeave={() => setHoveredPin(null)}
                        className="cursor-crosshair"
                      >
                        <title>
                          {isUndriven
                            ? `⚠️ DRC-E101: Floating CMOS Input "${pin.name}". CMOS inputs have infinite gate impedance (~10^12 Ω). Floating gate collects electrostatic charge, biasing MOSFETs into mid-rail conduction (shoot-through crowbar current ~mA, causing localized thermal burnout and erratic oscillation).`
                            : `Connect wire to ${node.label} (${pin.name})`}
                        </title>
                        {/* Generous invisible click target (radius 18px) */}
                        <circle cx={pinPos.x} cy={pinPos.y} r="18" fill="transparent" pointerEvents="all" />

                        {/* Floating / Undriven Input Hazard Indicator - Stable pulsing red ring precisely centered with clear visibility */}
                        {isUndriven && !isCompatibleTarget && !isStartPin && (
                          <g className="pointer-events-none">
                            <circle
                              cx={pinPos.x}
                              cy={pinPos.y}
                              r="11.5"
                              fill="#ef4444"
                              fillOpacity="0.22"
                              stroke="#f43f5e"
                              strokeWidth="2"
                              strokeDasharray="4 2.5"
                              className="animate-pulse"
                            />
                            <circle
                              cx={pinPos.x}
                              cy={pinPos.y}
                              r="7.5"
                              fill="none"
                              stroke="#fb7185"
                              strokeWidth="1"
                              strokeOpacity="0.75"
                            />
                          </g>
                        )}

                        {/* Green pulse ring when a compatible source is wiring towards this input */}
                        {isCompatibleTarget && (
                          <circle cx={pinPos.x} cy={pinPos.y} r="11" fill="#34d399" fillOpacity="0.2" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 2" className="animate-pulse" />
                        )}

                        <circle
                          cx={pinPos.x}
                          cy={pinPos.y}
                          r={isHovered || isStartPin ? 7 : 5}
                          className={
                            isStartPin
                              ? 'fill-purple-400 stroke-white stroke-2 animate-ping'
                              : isHovered
                              ? 'fill-purple-400 stroke-white stroke-1.5'
                              : isCompatibleTarget
                              ? 'fill-emerald-400 stroke-white stroke-1'
                              : isUndriven
                              ? 'fill-sky-400 stroke-rose-400 stroke-[1.75]'
                              : 'fill-sky-400 group-hover:fill-purple-400 transition-colors'
                          }
                        />
                        <text
                          x="10"
                          y={pinPos.y + 3.5}
                          textAnchor="start"
                          fill="#cbd5e1"
                          fontFamily="ui-monospace, monospace"
                          className="fill-slate-200 text-[10px] font-mono select-none font-medium pointer-events-none"
                        >
                          {pin.name}
                        </text>
                      </g>
                    );
                  })}

                  {/* Output Terminals */}
                  {node.outputs.map((pin, po) => {
                    const pinPos = getPinLocalPos(node, false, po, node.outputs.length);
                    const isHovered = hoveredPin?.nodeId === node.id && hoveredPin?.portName === pin.name;
                    const isStartPin = wiringStart?.nodeId === node.id && wiringStart?.portName === pin.name;
                    const isCompatibleSource = wiringStart && !wiringStart.isSource && wiringStart.nodeId !== node.id;

                    return (
                      <g
                        key={pin.id || `out_${po}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) =>
                          handlePinClick(e, node.id, pin.name, true, pos.x + pinPos.x, pos.y + pinPos.y, pin.width || 1)
                        }
                        onMouseEnter={() => setHoveredPin({ nodeId: node.id, portName: pin.name })}
                        onMouseLeave={() => setHoveredPin(null)}
                        className="cursor-crosshair"
                      >
                        <title>{`Route wire from ${node.label} (${pin.name})`}</title>
                        {/* Generous invisible click target (radius 18px) */}
                        <circle cx={pinPos.x} cy={pinPos.y} r="18" fill="transparent" pointerEvents="all" />

                        {/* Green pulse highlight when wiring from an input needs a source */}
                        {isCompatibleSource && (
                          <circle cx={pinPos.x} cy={pinPos.y} r="11" fill="#34d399" fillOpacity="0.2" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 2" className="animate-pulse" />
                        )}

                        <circle
                          cx={pinPos.x}
                          cy={pinPos.y}
                          r={isHovered || isStartPin ? 7 : 5}
                          className={
                            isStartPin
                              ? 'fill-purple-400 stroke-white stroke-2 animate-ping'
                              : isHovered
                              ? 'fill-purple-400 stroke-white stroke-1.5'
                              : isCompatibleSource
                              ? 'fill-emerald-400 stroke-white stroke-1'
                              : 'fill-sky-400 group-hover:fill-emerald-400 transition-colors'
                          }
                        />
                        <text
                          x={pinPos.x - 10}
                          y={pinPos.y + 3.5}
                          textAnchor="end"
                          fill="#cbd5e1"
                          fontFamily="ui-monospace, monospace"
                          className="fill-slate-200 text-[10px] font-mono select-none font-medium pointer-events-none"
                        >
                          {pin.name}
                        </text>
                      </g>
                    );
                  })}

                  {/* Subgraph Drill Down Badge */}
                  {node.has_subgraph && (
                    <g transform={`translate(${nodeW - 18}, 6)`}>
                      <circle cx="6" cy="6" r="6" className="fill-purple-900/80 stroke-purple-500 stroke-1" />
                      <text x="6" y="9" textAnchor="middle" className="fill-purple-200 text-[8px] font-bold">
                        +
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Selected Node Inspector Bottom Toolbar */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 z-30 bg-slate-900/95 border border-slate-700 backdrop-blur rounded-2xl p-3 shadow-2xl flex items-center space-x-4 max-w-2xl animate-fade-in">
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <Sliders className="w-4 h-4" />
          </div>

          <div>
            <div className="text-xs font-bold text-slate-200 flex items-center space-x-2">
              <span>{selectedNode.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 font-mono">
                {selectedNode.type}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                X: {nodePositions[selectedNode.id]?.x ?? selectedNode.x}, Y:{' '}
                {nodePositions[selectedNode.id]?.y ?? selectedNode.y}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
              <span>Inputs: {selectedNode.inputs.map((p) => p.name).join(', ')}</span>
              <span>•</span>
              <span>Outputs: {selectedNode.outputs.map((p) => p.name).join(', ')}</span>
            </div>
          </div>

          <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
            <button
              onClick={() => handleNudgeNode(-20, 0)}
              className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
              title="Move Left 20px"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex flex-col space-y-0.5">
              <button
                onClick={() => handleNudgeNode(0, -20)}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
                title="Move Up 20px"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleNudgeNode(0, 20)}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
                title="Move Down 20px"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => handleNudgeNode(20, 0)}
              className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white"
              title="Move Right 20px"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {onDeleteComponent && (
            <button
              onClick={() => {
                onDeleteComponent(selectedNode.id);
                addNotification('info', 'Component Deleted', `Removed ${selectedNode.label}.`);
                setSelectedNode(null);
              }}
              className="p-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 rounded-lg text-rose-300 hover:text-white transition"
              title="Delete Component (Del)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {selectedNode.has_subgraph && onSelectSubcircuit && (
            <button
              onClick={() => onSelectSubcircuit(selectedNode.subgraph_ref || 'full_adder_gate_level')}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow transition"
            >
              Drill Down Subcircuit
            </button>
          )}

          <button
            onClick={() => setSelectedNode(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selected Wire Inspector & Fault Injection Station */}
      {selectedWire && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-slate-950/95 border-t border-slate-800 backdrop-blur px-6 py-3 flex items-center justify-between shadow-2xl animate-fade-in">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-purple-300">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200 flex items-center space-x-2 font-mono">
                <span>Net: {selectedWire.label || selectedWire.id}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/90 border border-purple-800 text-purple-300 font-mono">
                  {selectedWire.width > 1 ? `${selectedWire.width}-bit bus` : '1-bit net'}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-800 text-emerald-300 font-mono font-bold">
                  State: {probeValues[selectedWire.label || ''] ?? probeValues[selectedWire.id] ?? '0'}
                </span>
                {activeFaults && activeFaults[selectedWire.label || selectedWire.id] && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 border border-rose-600 text-rose-300 font-mono font-bold animate-pulse">
                    FAULT: SA{activeFaults[selectedWire.label || selectedWire.id]}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                Route: {selectedWire.source_node} ({selectedWire.source_port}) → {selectedWire.target_node} ({selectedWire.target_port})
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onDeleteWire && (
              <button
                onClick={() => {
                  onDeleteWire(selectedWire.id);
                  addNotification('info', 'Wire Deleted', `Removed connection on net ${selectedWire.label || selectedWire.id}.`);
                  setSelectedWire(null);
                }}
                className="px-2.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
                title="Delete Wire Connection (Del)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Wire</span>
              </button>
            )}

            <button
              onClick={() => {
                onInjectFault && onInjectFault(selectedWire.label || selectedWire.id, '0');
                addNotification('warning', 'Fault Injected', `Forced Stuck-At-0 on net ${selectedWire.label || selectedWire.id}.`);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition ${
                activeFaults && activeFaults[selectedWire.label || selectedWire.id] === '0'
                  ? 'bg-rose-500 ring-2 ring-white text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              Force SA0
            </button>
            <button
              onClick={() => {
                onInjectFault && onInjectFault(selectedWire.label || selectedWire.id, '1');
                addNotification('warning', 'Fault Injected', `Forced Stuck-At-1 on net ${selectedWire.label || selectedWire.id}.`);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition ${
                activeFaults && activeFaults[selectedWire.label || selectedWire.id] === '1'
                  ? 'bg-amber-500 ring-2 ring-white text-white'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              Force SA1
            </button>
            <button
              onClick={() => {
                onInjectFault && onInjectFault(selectedWire.label || selectedWire.id, null);
                addNotification('success', 'Fault Cleared', `Cleared faults on net ${selectedWire.label || selectedWire.id}.`);
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              Clear Fault
            </button>
            <button
              onClick={() => setSelectedWire(null)}
              className="px-2.5 py-1.5 text-slate-400 hover:text-slate-200 text-xs flex items-center space-x-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>
        </div>
      )}

      {/* RIGHT-CLICK CONTEXT MENU MODAL */}
      {contextMenu && (
        <div
          id="eda-context-menu"
          className="fixed z-50 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl p-1.5 min-w-[210px] text-xs text-slate-200 backdrop-blur animate-fade-in divide-y divide-slate-800"
          style={{
            left: Math.min(window.innerWidth - 230, Math.max(10, contextMenu.x)),
            top: Math.min(window.innerHeight - 300, Math.max(10, contextMenu.y)),
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Menu Title Header */}
          <div className="px-2 py-1 text-[10px] font-mono text-purple-300 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>
              {contextMenu.type === 'node'
                ? `Gate: ${contextMenu.target.label}`
                : contextMenu.type === 'wire'
                ? `Net: ${contextMenu.target.label || contextMenu.target.id}`
                : contextMenu.type === 'input'
                ? `Input: ${contextMenu.target.name}`
                : contextMenu.type === 'output'
                ? `Output: ${contextMenu.target.name}`
                : 'Schematic Canvas'}
            </span>
            <button onClick={() => setContextMenu(null)} className="text-slate-500 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Node Options */}
          {contextMenu.type === 'node' && (
            <div className="py-1 space-y-0.5">
              <button
                onClick={() => {
                  setSelectedNode(contextMenu.target);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-slate-300 hover:text-white transition"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <span>Inspect Properties</span>
              </button>

              {onAddToAgentContext && (
                <button
                  onClick={() => {
                    const node = contextMenu.target;
                    onAddToAgentContext({
                      type: 'node',
                      label: node.label || node.id,
                      data: node,
                    });
                    addNotification('info', 'Attached to Context', `Added ${node.label} to EDA Copilot context.`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-purple-950/70 border border-purple-900/40 flex items-center space-x-2 text-purple-300 hover:text-purple-100 transition"
                >
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-semibold">Add to Agent Context</span>
                </button>
              )}

              {onAddComponent && (
                <button
                  onClick={() => {
                    const node = contextMenu.target;
                    const pos = nodePositions[node.id] || { x: node.x, y: node.y };
                    const blueprint: ComponentBlueprint = {
                      name: `${node.label} (Copy)`,
                      type: node.type || 'GATE',
                      category: 'logic',
                      desc: `Duplicate of ${node.label}`,
                      scale: 1,
                      width: node.width || 140,
                      height: node.height || 80,
                      inputs: node.inputs.map((p: any, idx: number) => ({ id: p.id || `in_${idx}`, name: p.name, direction: 'in', width: p.width || 1 })),
                      outputs: node.outputs.map((p: any, idx: number) => ({ id: p.id || `out_${idx}`, name: p.name, direction: 'out', width: p.width || 1 })),
                    };
                    const { position: clonePos, requiresZoomOut } = findEmptyCanvasSlot(
                      { x: pos.x + 60, y: pos.y + 60 },
                      node.width || 140,
                      node.height || 80
                    );
                    onAddComponent(blueprint, clonePos);
                    if (requiresZoomOut) {
                      applyAutoZoomPan(clonePos);
                    }
                    addNotification('success', 'Component Cloned', `Created duplicate of ${node.label}`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-indigo-300 hover:text-white transition"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Duplicate Component</span>
                </button>
              )}

              <button
                onClick={() => {
                  if (contextMenu.target.outputs.length > 0) {
                    const out = contextMenu.target.outputs[0];
                    const pos = nodePositions[contextMenu.target.id] || { x: contextMenu.target.x, y: contextMenu.target.y };
                    const pinRel = getPinLocalPos(contextMenu.target, false, 0, contextMenu.target.outputs.length);
                    setWiringStart({
                      nodeId: contextMenu.target.id,
                      portName: out.name,
                      isSource: true,
                      x: pos.x + pinRel.x,
                      y: pos.y + pinRel.y,
                      width: out.width || 1,
                    });
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-slate-300 hover:text-white transition"
              >
                <Cable className="w-3.5 h-3.5 text-cyan-400" />
                <span>Start Wire from Output</span>
              </button>

              {contextMenu.target.has_subgraph && onSelectSubcircuit && (
                <button
                  onClick={() => {
                    onSelectSubcircuit(contextMenu.target.subgraph_ref || 'full_adder_gate_level');
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-purple-300 hover:text-white transition"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Drill Down Subcircuit</span>
                </button>
              )}

              {onDeleteComponent && (
                <button
                  onClick={() => {
                    const targetNode = contextMenu.target;
                    setContextMenu(null);
                    handleDeleteComponentSafe(targetNode);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-rose-950/80 text-rose-400 hover:text-rose-200 flex items-center space-x-2 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Component</span>
                </button>
              )}
            </div>
          )}

          {/* Wire Options */}
          {contextMenu.type === 'wire' && (
            <div className="py-1 space-y-0.5">
              {onAddToAgentContext && (
                <button
                  onClick={() => {
                    const wire = contextMenu.target;
                    onAddToAgentContext({
                      type: 'wire',
                      label: wire.label || wire.id,
                      data: wire,
                    });
                    addNotification('info', 'Attached to Context', `Added net '${wire.label || wire.id}' to EDA Copilot context.`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-cyan-950/70 border border-cyan-900/40 flex items-center space-x-2 text-cyan-300 hover:text-cyan-100 transition"
                >
                  <Bot className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-semibold">Add Net to Agent Context</span>
                </button>
              )}
              <button
                onClick={() => {
                  const netId = contextMenu.target.label || contextMenu.target.id;
                  setContextMenu(null);
                  handleInjectFaultSafe(netId, '0');
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-rose-950/80 text-rose-300 flex items-center space-x-2 transition"
              >
                <Zap className="w-3.5 h-3.5 text-rose-400" />
                <span>Inject Stuck-at-0 (SA0)</span>
              </button>
              <button
                onClick={() => {
                  const netId = contextMenu.target.label || contextMenu.target.id;
                  setContextMenu(null);
                  handleInjectFaultSafe(netId, '1');
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-amber-950/80 text-amber-300 flex items-center space-x-2 transition"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Inject Stuck-at-1 (SA1)</span>
              </button>
              <button
                onClick={() => {
                  const netId = contextMenu.target.label || contextMenu.target.id;
                  setContextMenu(null);
                  handleInjectFaultSafe(netId, null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-slate-300 flex items-center space-x-2 transition"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Clear Fault</span>
              </button>
              {wireCustomBends[contextMenu.target.id] && (
                <button
                  onClick={() => {
                    const wireId = contextMenu.target.id;
                    setWireCustomBends((prev) => {
                      const next = { ...prev };
                      delete next[wireId];
                      return next;
                    });
                    if (activeProjectId) {
                      try {
                        const saved = localStorage.getItem('circuitforge_wire_bends_' + activeProjectId);
                        if (saved) {
                          const parsed = JSON.parse(saved);
                          delete parsed[wireId];
                          localStorage.setItem('circuitforge_wire_bends_' + activeProjectId, JSON.stringify(parsed));
                        }
                      } catch (e) {}
                    }
                    addNotification('info', 'Bends Reset', `Reset wire bends to auto-route.`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-purple-950/80 text-purple-300 flex items-center space-x-2 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                  <span>Reset Bends to Auto-Route</span>
                </button>
              )}
              {onDeleteWire && (
                <button
                  onClick={() => {
                    onDeleteWire(contextMenu.target.id);
                    addNotification('info', 'Deleted Wire', `Removed net ${contextMenu.target.label || contextMenu.target.id}`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-rose-950/80 text-rose-400 hover:text-rose-200 flex items-center space-x-2 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Wire</span>
                </button>
              )}
            </div>
          )}

          {/* Primary Input Options */}
          {contextMenu.type === 'input' && (
            <div className="py-1 space-y-0.5">
              {onAddToAgentContext && (
                <button
                  onClick={() => {
                    const inPin = contextMenu.target;
                    onAddToAgentContext({
                      type: 'node',
                      label: `Input: ${inPin.name}`,
                      data: { id: inPin.id || inPin.name, name: inPin.name, type: 'primary_input', width: inPin.width || 1 },
                    });
                    addNotification('info', 'Attached to Context', `Added input '${inPin.name}' to EDA Copilot context.`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-emerald-950/70 border border-emerald-900/40 flex items-center space-x-2 text-emerald-300 hover:text-emerald-100 transition"
                >
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold">Add Port to Agent Context</span>
                </button>
              )}
              <button
                onClick={() => {
                  const currentVal = probeValues[contextMenu.target.name] || '0';
                  onToggleInput && onToggleInput(contextMenu.target.name, currentVal);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-slate-300 hover:text-white transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Toggle Signal (0 ↔ 1)</span>
              </button>
              <button
                onClick={() => {
                  const inPin = contextMenu.target;
                  const inIdx = netlist.primary_inputs.findIndex((p) => p.name === inPin.name);
                  const defaultPos = { x: 40, y: 80 + inIdx * 70 };
                  const pos = nodePositions[inPin.id] || nodePositions[inPin.name] || defaultPos;
                  setWiringStart({
                    nodeId: inPin.name,
                    portName: inPin.name,
                    isSource: true,
                    x: pos.x + 130,
                    y: pos.y + 19,
                    width: inPin.width || 1,
                  });
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-slate-300 hover:text-white transition"
              >
                <Cable className="w-3.5 h-3.5 text-purple-400" />
                <span>Wire into Circuit</span>
              </button>
            </div>
          )}

          {/* Primary Output Options */}
          {contextMenu.type === 'output' && (
            <div className="py-1 space-y-0.5">
              {onAddToAgentContext && (
                <button
                  onClick={() => {
                    const outPin = contextMenu.target;
                    onAddToAgentContext({
                      type: 'node',
                      label: `Output: ${outPin.name}`,
                      data: { id: outPin.id || outPin.name, name: outPin.name, type: 'primary_output', width: outPin.width || 1 },
                    });
                    addNotification('info', 'Attached to Context', `Added output '${outPin.name}' to EDA Copilot context.`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-cyan-950/70 border border-cyan-900/40 flex items-center space-x-2 text-cyan-300 hover:text-cyan-100 transition"
                >
                  <Bot className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-semibold">Add Port to Agent Context</span>
                </button>
              )}
              <div className="px-2 py-1 text-[11px] text-slate-400">
                Current Logic State:{' '}
                <span className="font-bold text-emerald-400">{probeValues[contextMenu.target.name] || '0'}</span>
              </div>
            </div>
          )}

          {/* Canvas Background Options */}
          {contextMenu.type === 'canvas' && (
            <div className="py-1 space-y-1 min-w-[220px]">
              {onAddToAgentContext && (
                <button
                  onClick={() => {
                    const nodeCount = netlist?.nodes?.length || 0;
                    const wireCount = netlist?.wires?.length || 0;
                    const inCount = netlist?.primary_inputs?.length || 0;
                    const outCount = netlist?.primary_outputs?.length || 0;
                    const cName = netlist?.name || 'Active Schematic';
                    onAddToAgentContext({
                      type: 'canvas_snapshot',
                      label: `${cName} (${nodeCount}g, ${wireCount}w)`,
                      data: {
                        circuitName: cName,
                        gates: nodeCount,
                        wires: wireCount,
                        inputs: netlist?.primary_inputs?.map((p) => p.name) || [],
                        outputs: netlist?.primary_outputs?.map((p) => p.name) || [],
                        nodes: netlist?.nodes?.map((n) => ({ id: n.id, label: n.label, type: n.type })) || [],
                        summary: `${cName}: ${nodeCount} gates, ${wireCount} wires, ${inCount} primary inputs, ${outCount} primary outputs`,
                      },
                    });
                    addNotification('success', 'Attached to Agent', `Added schematic "${cName}" to EDA Copilot context.`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-teal-950/70 hover:bg-teal-900/90 border border-teal-700/60 flex items-center space-x-2 text-teal-300 hover:text-white transition font-medium cursor-pointer shadow-sm group"
                >
                  <Bot className="w-3.5 h-3.5 text-teal-400 group-hover:scale-110 transition-transform" />
                  <span className="font-semibold">Add to Agent Context</span>
                </button>
              )}

              <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400 border-b border-slate-800">
                Quick Insert at Cursor
              </div>

              {['AND', 'OR', 'XOR', 'NOT', 'NAND', 'NOR'].map((gType) => {
                const bp = COMPONENT_BLUEPRINTS.find((b) => b.type === gType);
                if (!bp) return null;
                return (
                  <button
                    key={gType}
                    onClick={() => {
                      if (onAddComponent) {
                        const rawTarget = contextMenu.target || { x: 360, y: 240 };
                        const { position: targetPos } = findEmptyCanvasSlot(
                          rawTarget,
                          bp.width || 140,
                          bp.height || 80
                        );
                        onAddComponent(bp, targetPos);
                        addNotification('success', 'Gate Placed', `Placed ${bp.name} at (${targetPos.x}, ${targetPos.y})`);
                      }
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-purple-300 hover:text-white transition"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-purple-400" />
                    <span>Insert {bp.name}</span>
                  </button>
                );
              })}

              <div className="h-px bg-slate-800 my-1" />

              <button
                onClick={() => {
                  if (contextMenu.target) {
                    const rawTarget = contextMenu.target;
                    const { position: targetPos } = findEmptyCanvasSlot(
                      rawTarget,
                      140,
                      80
                    );
                    setPendingPlacePos(targetPos);
                  }
                  setIsPaletteOpen(true);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-indigo-300 hover:text-white transition font-medium"
              >
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>Open Component Palette...</span>
              </button>
              <button
                onClick={() => {
                  handleAutoOrganize();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-slate-300 hover:text-white transition"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-purple-400" />
                <span>Auto-Organize Layout</span>
              </button>
              <button
                onClick={() => {
                  handleResetLayout();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-slate-300 hover:text-white transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset View (Zoom 100%)</span>
              </button>
              <button
                onClick={() => {
                  handleExportSVG();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-slate-300 hover:text-white transition"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export SVG Schematic</span>
              </button>
              <button
                onClick={() => {
                  setShowGrid((prev) => !prev);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-slate-300 hover:text-white transition"
              >
                <Grid className="w-3.5 h-3.5 text-sky-400" />
                <span>Toggle Grid (20px Pitch)</span>
              </button>
              <div className="h-px bg-slate-800 my-1" />
              <button
                onClick={() => {
                  handleClearCanvas();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-rose-950/80 flex items-center space-x-2 text-rose-400 hover:text-rose-200 transition font-medium cursor-pointer"
                title="Clear all components and connections from canvas"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Clear Canvas</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* EDA SAFETY & PROHIBITED OPERATIONS MODAL */}
      {safetyModal && safetyModal.open && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  safetyModal.severity === 'prohibited'
                    ? 'bg-rose-950/80 border-rose-600/80 text-rose-400'
                    : 'bg-amber-950/80 border-amber-600/80 text-amber-400'
                }`}
              >
                {safetyModal.severity === 'prohibited' ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                      safetyModal.severity === 'prohibited'
                        ? 'bg-rose-950 text-rose-300 border-rose-700'
                        : 'bg-amber-950 text-amber-300 border-amber-700'
                    }`}
                  >
                    {safetyModal.severity === 'prohibited' ? 'Prohibited EDA Rule' : 'High Risk EDA Operation'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-1">{safetyModal.title}</h3>
              </div>
              <button
                onClick={() => setSafetyModal(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Rule Violation Summary */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Violation / Hazard:</div>
              {safetyModal.reason}
            </div>

            {/* Electrical & VHDL Engineering Explanation */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1.5">
              <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                <Info className="w-3.5 h-3.5 text-purple-400" />
                <span>Why is this {safetyModal.severity === 'prohibited' ? 'Prohibited' : 'Risky'}?</span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-slate-400">{safetyModal.details}</p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-800">
              {safetyModal.severity === 'prohibited' ? (
                <button
                  onClick={() => setSafetyModal(null)}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow transition"
                >
                  Understood
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setSafetyModal(null)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition"
                  >
                    Cancel / Abort
                  </button>
                  <button
                    onClick={() => {
                      safetyModal.onConfirm?.();
                    }}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-rose-600/20 transition"
                  >
                    {safetyModal.confirmLabel || 'Proceed Anyway'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Human + AI Co-Working Guide Modal */}
      {showCoWorkGuide && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Human + AI Pair Engineering Guide</h3>
                  <p className="text-[11px] text-slate-400">How you and the autonomous agent observe and co-design</p>
                </div>
              </div>
              <button
                onClick={() => setShowCoWorkGuide(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="font-bold text-purple-400 flex items-center space-x-1.5 mb-1">
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>1. EDA Component Palette & Library</span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Click <strong>Add Component</strong> to open the full digital library (IEEE logic gates, ALUs, MUXes, Flip-Flops, Registers). Click any item to snap it onto the 20px Manhattan grid.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="font-bold text-indigo-400 flex items-center space-x-1.5 mb-1">
                  <Cable className="w-3.5 h-3.5" />
                  <span>2. Jumper Arcs, Solder Dots & Wiring</span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  When non-connecting wires cross, an authentic EDA semicircle jumper arc jumps over the perpendicular wire. Where wires connect, a solid solder dot appears. Click any pin to initiate interactive routing.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="font-bold text-emerald-400 flex items-center space-x-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5" />
                  <span>3. Right-Click Context Menus</span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Right-click any gate, wire, input port, or empty canvas space to open a rich engineering context menu with actions: inspect, duplicate, inject fault, or delete.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="font-bold text-amber-400 flex items-center space-x-1.5 mb-1">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>4. Interactive Chat & Human Steering</span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Use the Co-Pilot Chat in the right panel to instruct the agent, ask questions, or design custom circuits with any frontier LLM model from OpenRouter.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-800">
              <button
                onClick={() => setShowCoWorkGuide(false)}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                Got It, Let's Build!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRC Health & Hardware Consequence Inspector Drawer */}
      {isDrcDrawerOpen && (
        <div
          data-testid="drc-inspector-drawer"
          className="absolute bottom-3 left-3 right-3 z-40 max-h-72 bg-slate-900/95 border border-rose-700/60 rounded-xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden animate-slide-up"
        >
          {/* Drawer Header */}
          <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-2">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <span className="font-bold text-slate-100 text-xs font-mono">
                Circuit DRC & Hardware Diagnostics Inspector
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950 border border-rose-800 text-rose-300 font-bold font-mono">
                {allDrcDiagnostics.length} {allDrcDiagnostics.length === 1 ? 'Condition Detected' : 'Conditions Detected'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 space-x-1 text-[10px]">
                <button
                  onClick={() => setDrcSeverityFilter('all')}
                  className={`px-2 py-0.5 rounded transition ${
                    drcSeverityFilter === 'all'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({allDrcDiagnostics.length})
                </button>
                <button
                  onClick={() => setDrcSeverityFilter('error')}
                  className={`px-2 py-0.5 rounded transition ${
                    drcSeverityFilter === 'error'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Errors ({allDrcDiagnostics.filter((d) => d.severity === 'error').length})
                </button>
                <button
                  onClick={() => setDrcSeverityFilter('warning')}
                  className={`px-2 py-0.5 rounded transition ${
                    drcSeverityFilter === 'warning'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Warnings ({allDrcDiagnostics.filter((d) => d.severity === 'warning').length})
                </button>
              </div>

              {allDrcDiagnostics.length > 0 && onAgentIntervention && (
                <button
                  onClick={() => onAgentIntervention('steer', { guidance: 'Auto-fix all identified DRC errors and synthesize the clean circuit' })}
                  className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-[10px] flex items-center space-x-1.5 transition cursor-pointer shadow active:scale-95 flex-shrink-0"
                  title="Dispatch autonomous agent to repair floating pins, contention, and synthesize"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>⚡ Auto-Fix All via Agent</span>
                </button>
              )}

              <button
                onClick={() => setIsDrcDrawerOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Close DRC Inspector Drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Diagnostics List */}
          <div className="p-3 overflow-y-auto space-y-2 font-mono text-xs">
            {allDrcDiagnostics.length === 0 ? (
              <div className="p-4 text-center text-slate-400 font-sans">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                <div className="font-bold text-emerald-300">Design Rule Checks 100% Passed</div>
                <div className="text-[11px] text-slate-500">
                  No floating inputs, bus contention short-circuits, or missing port maps detected.
                </div>
              </div>
            ) : (
              allDrcDiagnostics
                .filter((d) => drcSeverityFilter === 'all' || d.severity === drcSeverityFilter)
                .map((diag, i) => (
                  <div
                    key={`${diag.code}_${i}`}
                    className={`p-2.5 rounded-lg border transition ${
                      diag.severity === 'error'
                        ? 'bg-rose-950/40 border-rose-800/80 text-rose-100 hover:border-rose-600'
                        : 'bg-amber-950/40 border-amber-800/80 text-amber-100 hover:border-amber-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-1.5 py-0.2 rounded font-bold text-[9px] uppercase ${
                              diag.severity === 'error'
                                ? 'bg-rose-900 border border-rose-700 text-rose-200'
                                : 'bg-amber-900 border border-amber-700 text-amber-200'
                            }`}
                          >
                            {diag.code}
                          </span>
                          <span className="font-bold text-slate-200 text-xs font-sans truncate">
                            {diag.title}
                          </span>
                          {diag.target_node && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[9px]">
                              Target: {diag.target_node}{diag.target_port ? `.${diag.target_port}` : ''}
                            </span>
                          )}
                          {diag.source_file && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-950 border border-purple-800 text-purple-300 text-[9px]">
                              📄 {formatFileLabel(diag.source_file)}
                            </span>
                          )}
                        </div>

                        <p className="font-sans text-[11px] text-slate-300 leading-snug">
                          {diag.message}
                        </p>

                        {/* Physical Hardware Consequence */}
                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800 space-y-0.5">
                          <div className="text-[9.5px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                            ⚡ Physical Hardware Consequence:
                          </div>
                          <div className="text-[10.5px] font-sans text-slate-300 leading-relaxed">
                            {diag.hardware_consequence}
                          </div>
                        </div>

                        {diag.suggested_fix && (
                          <div className="text-[10px] font-mono text-emerald-400">
                            💡 Suggested Fix: {diag.suggested_fix}
                          </div>
                        )}
                      </div>

                      {/* Inspect Target Action Button */}
                      {diag.target_node && (
                        <button
                          onClick={() => {
                            const node = netlist?.nodes.find((n) => n.id === diag.target_node || n.label === diag.target_node);
                            if (node) {
                              setSelectedNode(node);
                              setHighlightedDrcNodeId(node.id);
                              const pos = nodePositions[node.id] || { x: node.x, y: node.y };
                              setPan({
                                x: 450 - pos.x * zoom,
                                y: 300 - pos.y * zoom,
                              });
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-purple-900/80 hover:bg-purple-800 border border-purple-600 text-purple-200 text-[10px] font-bold flex items-center space-x-1 flex-shrink-0 transition cursor-pointer shadow"
                          title="Center and spotlight this component on the canvas"
                        >
                          <Crosshair className="w-3.5 h-3.5" />
                          <span>Inspect on Canvas</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
