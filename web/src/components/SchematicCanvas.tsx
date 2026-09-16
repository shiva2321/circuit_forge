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
} from 'lucide-react';
import { NetlistGraph, NetlistNode, NetlistWire, PortDef } from '../types/circuit';
import { ComponentPalette, ComponentBlueprint } from './ComponentPalette';
import { evaluateCircuitLogic } from '../utils/circuitSimulator';

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
  return Math.round((node.width || 140) / GRID) * GRID;
};

const getNodeHeight = (node: NetlistNode): number => {
  return Math.round((node.height || 80) / GRID) * GRID;
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
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [selectedWire, setSelectedWire] = useState<NetlistWire | null>(null);
  const [selectedNode, setSelectedNode] = useState<NetlistNode | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showCoWorkGuide, setShowCoWorkGuide] = useState(false);

  // Palette, Interactive Wiring & Context Menu State
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
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

  // Initialize and snap node and port positions whenever the circuit netlist changes
  useEffect(() => {
    if (!netlist) return;

    const circuitChanged = lastCircuitNameRef.current !== netlist.name;
    lastCircuitNameRef.current = netlist.name;

    setNodePositions((prev) => {
      // If switching to a completely different circuit, start fresh; otherwise preserve existing dragged coordinates
      const nextPositions: Record<string, { x: number; y: number }> = circuitChanged ? {} : { ...prev };

      netlist.nodes.forEach((n) => {
        if (circuitChanged || !nextPositions[n.id]) {
          nextPositions[n.id] = {
            x: Math.round(n.x / GRID) * GRID,
            y: Math.round(n.y / GRID) * GRID,
          };
        }
      });
      netlist.primary_inputs.forEach((p, i) => {
        const defaultX = 40;
        const defaultY = Math.round((80 + i * 70) / GRID) * GRID;
        if (circuitChanged || (!nextPositions[p.id] && !nextPositions[p.name])) {
          nextPositions[p.id] = { x: defaultX, y: defaultY };
          nextPositions[p.name] = { x: defaultX, y: defaultY };
        }
      });
      netlist.primary_outputs.forEach((p, i) => {
        const defaultX = 980;
        const defaultY = Math.round((80 + i * 70) / GRID) * GRID;
        if (circuitChanged || (!nextPositions[p.id] && !nextPositions[p.name])) {
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
  }, [netlist]);

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

  // Global window listeners for drag, pan, keyboard, and click-away dismissal
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      setMouseCanvasPos(pt);

      if (draggingNodeId) {
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
  }, [draggingNodeId, dragOffset, snapToGrid, isPanning, startPan, getCanvasPoint, selectedNode, selectedWire, onDeleteComponent, onDeleteWire, addNotification]);

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
          connectedWires.forEach((w) => onDeleteWire && onDeleteWire(w.id));
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

  // Interactive Pin Click (for Pin-to-Pin wiring mode with EDA Safety Checks)
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
      if (wiringStart.nodeId === nodeId && wiringStart.portName === portName) {
        setWiringStart(null);
        return;
      }

      // Check Prohibited Direction Rules (Output-to-Output or Input-to-Input)
      if (wiringStart.isSource === isSource) {
        if (isSource) {
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
      if (wiringStart.width !== width) {
        setSafetyModal({
          open: true,
          title: 'Prohibited Operation: Bus Width Mismatch',
          severity: 'prohibited',
          reason: `Cannot connect a ${wiringStart.width}-bit bus to a ${width}-bit port directly.`,
          details: 'Under IEEE 1076 VHDL typing standards, interconnect bus widths must match exactly (std_logic to std_logic, or std_logic_vector with identical dimensions). Implicit bus truncation or unaligned bit-width mapping is rejected by synthesis compilers. Use bit-slicing syntax or an adapter block.',
        });
        setWiringStart(null);
        return;
      }

      const src = wiringStart.isSource
        ? wiringStart
        : { nodeId, portName, isSource, x: pinX, y: pinY, width };
      const tgt = wiringStart.isSource
        ? { nodeId, portName, isSource, x: pinX, y: pinY, width }
        : wiringStart;

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
    }
  };

  // Topological Auto-Organize Layout (strictly on grid lines)
  const handleAutoOrganize = () => {
    if (!netlist || netlist.nodes.length === 0) return;

    const nodeLevels: Record<string, number> = {};
    const inputPinIds = new Set(
      netlist.primary_inputs.map((p) => p.name).concat(netlist.primary_inputs.map((p) => p.id))
    );

    netlist.nodes.forEach((node) => {
      const fedByInputs = netlist.wires.some(
        (w) =>
          (w.target_node === node.id || w.target_node === node.label) &&
          inputPinIds.has(w.source_node)
      );
      nodeLevels[node.id] = fedByInputs ? 1 : 2;
    });

    for (let pass = 0; pass < 6; pass++) {
      netlist.wires.forEach((w) => {
        const srcLvl = nodeLevels[w.source_node];
        const tgtLvl = nodeLevels[w.target_node];
        if (srcLvl !== undefined && tgtLvl !== undefined) {
          if (tgtLvl <= srcLvl) {
            nodeLevels[w.target_node] = srcLvl + 1;
          }
        }
      });
    }

    const levels: Record<number, NetlistNode[]> = {};
    netlist.nodes.forEach((node) => {
      const lvl = nodeLevels[node.id] || 1;
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(node);
    });

    const levelKeys = Object.keys(levels)
      .map(Number)
      .sort((a, b) => a - b);
    const totalLevels = levelKeys.length;
    const xSpanStart = 260;
    const xSpanEnd = 980;
    const xStep = totalLevels > 1 ? (xSpanEnd - xSpanStart) / (totalLevels - 1 || 1) : 260;

    const newPositions: Record<string, { x: number; y: number }> = {};
    levelKeys.forEach((lvl, colIdx) => {
      const nodesInLevel = levels[lvl];
      const rawX = totalLevels === 1 ? 520 : xSpanStart + colIdx * xStep;
      const x = Math.round(rawX / GRID) * GRID;
      const count = nodesInLevel.length;
      const spacing = Math.max(120, Math.min(180, 500 / (count + 1)));
      const startY = Math.max(60, (660 - (count - 1) * spacing) / 2);

      nodesInLevel.forEach((node, rowIdx) => {
        const rawY = startY + rowIdx * spacing;
        newPositions[node.id] = {
          x,
          y: Math.round(rawY / GRID) * GRID,
        };
      });
    });

    setNodePositions(newPositions);
    addNotification('info', 'Auto-Organize', 'Components rearranged topographically onto 20px grid.');
  };

  // Reset to default netlist positions
  const handleResetLayout = () => {
    if (!netlist) return;
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

  // Export SVG to file
  const handleExportSVG = () => {
    if (!svgRef.current || !netlist) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${netlist.name}_schematic.svg`;
    link.click();
    URL.revokeObjectURL(url);
    addNotification('success', 'Export Complete', `Saved ${netlist.name}_schematic.svg`);
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
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isForward: boolean;
      xMid: number;
      xLoop1?: number;
      xLoop2?: number;
      yLoop?: number;
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
          x1 = pos.x + 130;
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

      // High-contrast EDA Wire Color & Styling: Inactive wires now stand out crisply with electric ice-cyan/indigo
      let wireColor = '#38bdf8'; // High contrast Ice Sky Blue for single-bit quiescent logic '0'
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
        wireColor = isHigh ? '#c084fc' : '#818cf8'; // Crisp Indigo for inactive bus, Neon Purple for active bus
        wireFilter = isHigh ? 'url(#bus-glow)' : 'none';
        strokeWidth = 3.2;
      } else if (isHigh) {
        wireColor = '#10b981'; // Neon emerald indicating active electrical current/signal flow!
        wireFilter = 'url(#green-glow)';
        strokeWidth = 2.8;
      }

      if (x1 < x2) {
        const rawMid = (x1 + x2) / 2;
        const stagger = ((wireIdx % 3) - 1) * GRID;
        let xMid = Math.round(rawMid / GRID) * GRID + stagger;
        xMid = Math.max(x1 + GRID, Math.min(x2 - GRID, xMid));
        xMid = Math.round(xMid / GRID) * GRID;

        // Collect vertical segment
        vertSegs.push({
          wireId: wire.id,
          wireNet: wire.label || wire.id,
          isVertical: true,
          x1: xMid,
          y1: Math.min(y1, y2),
          x2: xMid,
          y2: Math.max(y1, y2),
        });

        // Badge on the longer horizontal segment
        const span1 = Math.abs(xMid - x1);
        const span2 = Math.abs(x2 - xMid);
        const badgeX = span1 >= span2 ? (x1 + xMid) / 2 : (xMid + x2) / 2;
        const badgeY = span1 >= span2 ? y1 - 10 : y2 - 10;

        routes.push({
          wire,
          x1,
          y1,
          x2,
          y2,
          isForward: true,
          xMid,
          wireColor,
          wireFilter,
          strokeWidth,
          isBus,
          isHigh,
          wireVal,
          badgeX,
          badgeY,
        });
      } else {
        const xLoop1 = Math.round((x1 + GRID) / GRID) * GRID;
        const xLoop2 = Math.round((x2 - GRID) / GRID) * GRID;
        const loopStagger = (wireIdx % 4) * GRID;
        const yHighway =
          y1 > 350 && y2 > 350
            ? Math.max(40, Math.min(y1, y2) - 40 - loopStagger)
            : Math.min(660, Math.max(y1, y2) + 40 + loopStagger);
        const yLoop = Math.round(yHighway / GRID) * GRID;

        vertSegs.push({
          wireId: wire.id,
          wireNet: wire.label || wire.id,
          isVertical: true,
          x1: xLoop1,
          y1: Math.min(y1, yLoop),
          x2: xLoop1,
          y2: Math.max(y1, yLoop),
        });
        vertSegs.push({
          wireId: wire.id,
          wireNet: wire.label || wire.id,
          isVertical: true,
          x1: xLoop2,
          y1: Math.min(y2, yLoop),
          x2: xLoop2,
          y2: Math.max(y2, yLoop),
        });

        routes.push({
          wire,
          x1,
          y1,
          x2,
          y2,
          isForward: false,
          xMid: 0,
          xLoop1,
          xLoop2,
          yLoop,
          wireColor,
          wireFilter,
          strokeWidth,
          isBus,
          isHigh,
          wireVal,
          badgeX: (xLoop1 + xLoop2) / 2,
          badgeY: yLoop - 10,
        });
      }
    });

    // Extract connection junction points (where 2 or more wires connect)
    const junctions: Array<{ x: number; y: number }> = [];
    pinTerminals.forEach((cnt, key) => {
      if (cnt >= 2) {
        const [jx, jy] = key.split(',').map(Number);
        junctions.push({ x: jx, y: jy });
      }
    });

    return { wires: routes, verticalSegments: vertSegs, junctions };
  }, [netlist, nodeMap, nodePositions, probeValues, selectedWire]);

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
      return `L ${xEnd} ${y}`;
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

  // Render Logic Symbols or EDA Blocks
  const renderNodeSymbol = (node: NetlistNode, w: number, h: number) => {
    const isSelected = selectedNode?.id === node.id;
    const gateType = (node.properties?.gate_type || node.type || '').toUpperCase();
    const strokeClass = isSelected
      ? 'stroke-purple-400 stroke-[2.5]'
      : 'stroke-slate-400 stroke-[1.75]';
    const fillClass = isSelected ? 'fill-purple-950/80' : 'fill-slate-900/90';

    if (gateType === 'AND') {
      return (
        <g>
          <path
            d={`M 0 0 L ${w * 0.55} 0 A ${h / 2} ${h / 2} 0 0 1 ${w * 0.55} ${h} L 0 ${h} Z`}
            className={`${fillClass} ${strokeClass}`}
          />
          <text x={w * 0.35} y={h / 2 + 5} textAnchor="middle" className="fill-slate-300 font-mono font-bold text-xs">
            AND
          </text>
        </g>
      );
    }

    if (gateType === 'NAND') {
      return (
        <g>
          <path
            d={`M 0 0 L ${w * 0.5} 0 A ${h / 2} ${h / 2} 0 0 1 ${w * 0.5} ${h} L 0 ${h} Z`}
            className={`${fillClass} ${strokeClass}`}
          />
          <circle cx={w * 0.5 + h / 2 + 5} cy={h / 2} r={4.5} className="fill-slate-900 stroke-slate-300 stroke-[1.5]" />
          <text x={w * 0.32} y={h / 2 + 5} textAnchor="middle" className="fill-slate-300 font-mono font-bold text-xs">
            NAND
          </text>
        </g>
      );
    }

    if (gateType === 'OR') {
      return (
        <g>
          <path
            d={`M 0 0 Q ${w * 0.25} ${h * 0.5} 0 ${h} Q ${w * 0.6} ${h} ${w} ${h * 0.5} Q ${w * 0.6} 0 0 0 Z`}
            className={`${fillClass} ${strokeClass}`}
          />
          <text x={w * 0.45} y={h / 2 + 5} textAnchor="middle" className="fill-slate-300 font-mono font-bold text-xs">
            OR
          </text>
        </g>
      );
    }

    if (gateType === 'NOR') {
      const gw = w - 10;
      return (
        <g>
          <path
            d={`M 0 0 Q ${gw * 0.25} ${h * 0.5} 0 ${h} Q ${gw * 0.6} ${h} ${gw} ${h * 0.5} Q ${gw * 0.6} 0 0 0 Z`}
            className={`${fillClass} ${strokeClass}`}
          />
          <circle cx={gw + 5} cy={h / 2} r={4.5} className="fill-slate-900 stroke-slate-300 stroke-[1.5]" />
          <text x={gw * 0.42} y={h / 2 + 5} textAnchor="middle" className="fill-slate-300 font-mono font-bold text-xs">
            NOR
          </text>
        </g>
      );
    }

    if (gateType === 'XOR') {
      return (
        <g>
          <path d={`M -7 0 Q ${w * 0.25 - 7} ${h * 0.5} -7 ${h}`} fill="none" className={strokeClass} />
          <path
            d={`M 0 0 Q ${w * 0.25} ${h * 0.5} 0 ${h} Q ${w * 0.6} ${h} ${w} ${h * 0.5} Q ${w * 0.6} 0 0 0 Z`}
            className={`${fillClass} ${strokeClass}`}
          />
          <text x={w * 0.45} y={h / 2 + 5} textAnchor="middle" className="fill-slate-300 font-mono font-bold text-xs">
            XOR
          </text>
        </g>
      );
    }

    if (gateType === 'XNOR') {
      const gw = w - 10;
      return (
        <g>
          <path d={`M -7 0 Q ${gw * 0.25 - 7} ${h * 0.5} -7 ${h}`} fill="none" className={strokeClass} />
          <path
            d={`M 0 0 Q ${gw * 0.25} ${h * 0.5} 0 ${h} Q ${gw * 0.6} ${h} ${gw} ${h * 0.5} Q ${gw * 0.6} 0 0 0 Z`}
            className={`${fillClass} ${strokeClass}`}
          />
          <circle cx={gw + 5} cy={h / 2} r={4.5} className="fill-slate-900 stroke-slate-300 stroke-[1.5]" />
          <text x={gw * 0.42} y={h / 2 + 5} textAnchor="middle" className="fill-slate-300 font-mono font-bold text-xs">
            XNOR
          </text>
        </g>
      );
    }

    if (gateType === 'NOT' || gateType === 'INV') {
      const gw = w - 10;
      return (
        <g>
          <polygon points={`0,0 ${gw},${h / 2} 0,${h}`} className={`${fillClass} ${strokeClass}`} />
          <circle cx={gw + 5} cy={h / 2} r={4.5} className="fill-slate-900 stroke-slate-300 stroke-[1.5]" />
          <text x={gw * 0.3} y={h / 2 + 4} textAnchor="middle" className="fill-slate-300 font-mono font-bold text-[10px]">
            NOT
          </text>
        </g>
      );
    }

    // Structured Functional EDA Block
    return (
      <g>
        <rect width={w} height={h} rx={6} className={`${fillClass} ${strokeClass}`} />
        <path
          d={`M 0 6 Q 0 0 6 0 L ${w - 6} 0 Q ${w} 0 ${w} 6 L ${w} 26 L 0 26 Z`}
          className="fill-slate-800/95 stroke-slate-700/80 stroke-[1]"
        />
        <text
          x={w / 2}
          y={17}
          textAnchor="middle"
          className="fill-purple-200 font-mono font-bold text-[11px] tracking-tight"
        >
          {node.label.length > 24 ? node.label.substring(0, 22) + '…' : node.label}
        </text>
        <text x={w / 2} y={h - 8} textAnchor="middle" className="fill-slate-500 font-mono text-[9px]">
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
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas', target: null });
      }}
    >
      {/* Top Controls Bar: Compact, Non-Obstructing EDA Toolbar */}
      <div className="absolute top-3 left-3 z-20 flex items-center space-x-1.5 bg-slate-900/90 border border-slate-700/80 backdrop-blur-md rounded-xl p-1 shadow-2xl max-w-[calc(100%-24px)] overflow-x-auto no-scrollbar">
        <button
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition cursor-pointer"
          title="Reset Zoom & Pan to Center"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-700/80" />

        <button
          onClick={() => setShowGrid((g) => !g)}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            showGrid ? 'bg-purple-600/30 text-purple-300' : 'text-slate-400 hover:bg-slate-800'
          }`}
          title="Toggle 20px Grid"
        >
          <Grid className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSnapToGrid((s) => !s)}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            snapToGrid ? 'bg-purple-600/30 text-purple-300' : 'text-slate-400 hover:bg-slate-800'
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
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-purple-950/80 hover:bg-purple-900 border border-purple-600/50 text-purple-300'
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
          <LayoutGrid className="w-3.5 h-3.5 text-purple-400" />
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
        <span className="text-[11px] text-slate-400 px-1.5 font-mono font-bold">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Top Right: Contextual Status Pill (Wiring Mode or Agent Intervention) */}
      {(wiringStart || isAgentWorking || agentState === 'PAUSED') && (
        <div className="absolute top-3 right-3 z-20 flex items-center space-x-2">
          {wiringStart && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-purple-950/90 border border-purple-500 text-purple-200 backdrop-blur-md shadow-2xl text-xs font-semibold animate-pulse">
              <Cable className="w-3.5 h-3.5 text-purple-400" />
              <span>Click pin to connect</span>
              <button
                onClick={() => setWiringStart(null)}
                className="ml-1 px-1.5 py-0.5 rounded bg-purple-800 hover:bg-purple-700 text-white text-[10px] font-mono transition"
              >
                Cancel
              </button>
            </div>
          )}

          {isAgentWorking && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-purple-950/90 border border-purple-500/80 text-purple-200 backdrop-blur-md shadow-2xl text-xs font-semibold animate-pulse">
              <Bot className="w-3.5 h-3.5 text-purple-400 animate-spin" />
              <span>AI Agent: {agentState}</span>
              {onAgentIntervention && (
                <button
                  onClick={() => onAgentIntervention('pause')}
                  className="ml-1.5 px-2 py-0.5 rounded bg-purple-800 hover:bg-purple-700 text-white text-[10px] font-mono transition"
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

      {/* SVG Canvas Area */}
      <div
        className="flex-1 w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center relative"
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas', target: null });
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
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas', target: null });
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
              const currentVal = probeValues[pin.name] ?? probeValues[pin.id] ?? '0';
              const isHigh =
                currentVal === '1' || (currentVal.length > 1 && parseInt(currentVal, 2) > 0);
              const isHovered = hoveredPin?.nodeId === pin.id || hoveredPin?.nodeId === pin.name;
              const isStartPin = wiringStart?.nodeId === pin.id || wiringStart?.nodeId === pin.name;
              const isDragging = draggingNodeId === pin.id || draggingNodeId === pin.name;

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
                  {/* Modern Terminal Chassis (130x38) */}
                  <rect
                    x="0"
                    y="0"
                    width="130"
                    height="38"
                    rx="6"
                    className={`transition-all duration-150 ${
                      isHigh
                        ? 'fill-slate-900/95 stroke-emerald-500/90 stroke-[1.5] shadow-lg shadow-emerald-500/10'
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
                  <text x="25" y="22.5" textAnchor="middle" className="fill-indigo-300 font-mono text-[9px] font-bold">
                    IN
                  </text>

                  {/* Pin Signal Label */}
                  <text x="42" y="23.5" className="fill-slate-100 font-mono font-bold text-xs">
                    {pin.name.length > 6 ? pin.name.substring(0, 5) + '…' : pin.name}
                    {pin.width > 1 && (
                      <tspan className="fill-purple-400 text-[10px] ml-0.5">[{pin.width - 1}:0]</tspan>
                    )}
                  </text>

                  {/* Interactive Value Toggle Button */}
                  <g
                    transform="translate(90, 8)"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleInput && onToggleInput(pin.name, currentVal);
                    }}
                    className="cursor-pointer hover:scale-105 transition-transform"
                  >
                    <title>{`Click to toggle ${pin.name} (currently ${currentVal})`}</title>
                    <rect
                      width="30"
                      height="22"
                      rx="5"
                      className={`transition-colors ${
                        isHigh
                          ? 'fill-emerald-500/25 stroke-emerald-400 stroke-[1.5]'
                          : 'fill-slate-800 stroke-slate-600 stroke-[1] hover:fill-slate-750'
                      }`}
                    />
                    <text
                      x="15"
                      y="15"
                      textAnchor="middle"
                      className={`font-mono font-bold text-xs ${
                        isHigh ? 'fill-emerald-300' : 'fill-slate-300'
                      }`}
                    >
                      {isHigh ? '1' : '0'}
                    </text>
                  </g>

                  {/* Solder Connection Terminal (Right Edge at x=130, y=19) */}
                  <g
                    onClick={(e) =>
                      handlePinClick(e, pin.name, pin.name, true, pos.x + 130, pos.y + 19, pin.width || 1)
                    }
                    onMouseEnter={() => setHoveredPin({ nodeId: pin.id, portName: pin.name })}
                    onMouseLeave={() => setHoveredPin(null)}
                    className="cursor-crosshair"
                  >
                    <title>{`Wire from ${pin.name}`}</title>
                    <circle
                      cx="130"
                      cy="19"
                      r={isHovered || isStartPin ? 6 : 4.5}
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
              const currentVal = probeValues[pin.name] ?? probeValues[pin.id] ?? '0';
              const isHigh =
                currentVal === '1' || (currentVal.length > 1 && parseInt(currentVal, 2) > 0);
              const isHovered = hoveredPin?.nodeId === pin.id || hoveredPin?.nodeId === pin.name;
              const isStartPin = wiringStart?.nodeId === pin.id || wiringStart?.nodeId === pin.name;
              const isDragging = draggingNodeId === pin.id || draggingNodeId === pin.name;

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
                  {/* Solder Connection Terminal (Left Edge at x=0, y=19) */}
                  <g
                    onClick={(e) =>
                      handlePinClick(e, pin.name, pin.name, false, pos.x, pos.y + 19, pin.width || 1)
                    }
                    onMouseEnter={() => setHoveredPin({ nodeId: pin.id, portName: pin.name })}
                    onMouseLeave={() => setHoveredPin(null)}
                    className="cursor-crosshair"
                  >
                    <title>{`Wire to ${pin.name}`}</title>
                    <circle
                      cx="0"
                      cy="19"
                      r={isHovered || isStartPin ? 6 : 4.5}
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

                  {/* Modern Terminal Chassis (130x38) */}
                  <rect
                    x="0"
                    y="0"
                    width="130"
                    height="38"
                    rx="6"
                    className={`transition-all duration-150 ${
                      isHigh
                        ? 'fill-slate-900/95 stroke-emerald-500 stroke-[1.75] shadow-lg shadow-emerald-500/15'
                        : 'fill-slate-900/95 stroke-slate-700/80 stroke-[1.25] group-hover:stroke-emerald-500/80 shadow-md'
                    }`}
                  />

                  {/* Port Tag Badge [OUT] */}
                  <rect x="10" y="10" width="26" height="18" rx="4" fill="#064e3b" stroke="#10b981" strokeWidth="0.75" />
                  <text x="23" y="22.5" textAnchor="middle" className="fill-emerald-300 font-mono text-[9px] font-bold">
                    OUT
                  </text>

                  {/* Pin Signal Label */}
                  <text x="42" y="23.5" className="fill-slate-100 font-mono font-bold text-xs">
                    {pin.name.length > 5 ? pin.name.substring(0, 4) + '…' : pin.name}
                    {pin.width > 1 && (
                      <tspan className="fill-purple-400 text-[10px] ml-0.5">[{pin.width - 1}:0]</tspan>
                    )}
                  </text>

                  {/* Live Logic State Monitor Pill */}
                  <g transform="translate(86, 8)">
                    <rect
                      width="34"
                      height="22"
                      rx="5"
                      className={`transition-colors ${
                        isHigh
                          ? 'fill-emerald-500/25 stroke-emerald-400 stroke-[1.5]'
                          : 'fill-slate-800 stroke-slate-700 stroke-[1]'
                      }`}
                    />
                    <text
                      x="17"
                      y="15"
                      textAnchor="middle"
                      className={`font-mono font-bold text-xs ${
                        isHigh ? 'fill-emerald-300' : 'fill-sky-300'
                      }`}
                    >
                      {pin.width > 1
                        ? `0x${parseInt(currentVal, 2).toString(16).toUpperCase()}`
                        : currentVal}
                    </text>
                  </g>

                  {/* Drag Grip Dots */}
                  <g className="opacity-40 group-hover:opacity-80 transition-opacity">
                    <circle cx="124" cy="14" r="1.5" fill="#94a3b8" />
                    <circle cx="124" cy="19" r="1.5" fill="#94a3b8" />
                    <circle cx="124" cy="24" r="1.5" fill="#94a3b8" />
                  </g>
                </g>
              );
            })}

            {/* WIRES WITH AUTHENTIC IEEE JUMPER BYPASS ARCS */}
            {computedWireData.wires.map((rw) => {
              const { wire, x1, y1, x2, y2, isForward, xMid, xLoop1, xLoop2, yLoop, wireColor, wireFilter, strokeWidth, isBus, isHigh, wireVal, badgeX, badgeY } = rw;

              let fullPath = `M ${x1} ${y1}`;

              if (isForward) {
                // Segment 1: Horizontal from x1 to xMid (with jumper arcs)
                fullPath += buildHorizontalPathWithJumperArcs(x1, xMid, y1, wire.id, wire.label || wire.id, computedWireData.verticalSegments);
                // Segment 2: Vertical from y1 to y2 at xMid
                fullPath += ` L ${xMid} ${y2}`;
                // Segment 3: Horizontal from xMid to x2 (with jumper arcs)
                fullPath += buildHorizontalPathWithJumperArcs(xMid, x2, y2, wire.id, wire.label || wire.id, computedWireData.verticalSegments);
              } else {
                fullPath += buildHorizontalPathWithJumperArcs(x1, xLoop1!, y1, wire.id, wire.label || wire.id, computedWireData.verticalSegments);
                fullPath += ` L ${xLoop1} ${yLoop}`;
                fullPath += buildHorizontalPathWithJumperArcs(xLoop1!, xLoop2!, yLoop!, wire.id, wire.label || wire.id, computedWireData.verticalSegments);
                fullPath += ` L ${xLoop2} ${y2}`;
                fullPath += buildHorizontalPathWithJumperArcs(xLoop2!, x2, y2, wire.id, wire.label || wire.id, computedWireData.verticalSegments);
              }

              return (
                <g
                  key={wire.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWire(wire);
                    setSelectedNode(null);
                    setContextMenu(null);
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
                  <path
                    d={fullPath}
                    fill="none"
                    stroke={wireColor}
                    strokeWidth={strokeWidth}
                    filter={wireFilter}
                    className={`transition-colors duration-150 group-hover:stroke-white ${isHigh ? (isBus ? 'animate-electric-flow-bus' : 'animate-electric-flow') : ''}`}
                  />

                  {/* Terminal dots */}
                  <circle cx={x1} cy={y1} r={isBus ? 4 : 3.5} fill={wireColor} filter={wireFilter} />
                  <circle cx={x2} cy={y2} r={isBus ? 4 : 3.5} fill={wireColor} filter={wireFilter} />

                  {/* Bus Slash Tag */}
                  {isBus && (
                    <g transform={`translate(${x1 + 18}, ${y1})`}>
                      <line x1="-3" y1="4" x2="3" y2="-4" stroke="#c084fc" strokeWidth="2.5" />
                      <text x="5" y="-3" className="fill-purple-300 font-mono text-[9px] font-bold">
                        [{wire.width}]
                      </text>
                    </g>
                  )}

                  {/* Non-overlapping wire state pill badge */}
                  {(isBus || selectedWire?.id === wire.id) && (
                    <g transform={`translate(${badgeX}, ${badgeY})`} className="pointer-events-none">
                      <rect
                        x="-16"
                        y="-7"
                        width="32"
                        height="14"
                        rx="4"
                        fill="#090d16"
                        stroke={wireColor}
                        strokeWidth="1"
                        className="shadow-md"
                      />
                      <text x="0" y="3" textAnchor="middle" className="fill-slate-100 font-mono text-[8.5px] font-bold">
                        {wireVal.length > 1 ? `0x${parseInt(wireVal, 2).toString(16).toUpperCase()}` : wireVal}
                      </text>
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
                  const xMid = Math.round(((x1 + x2) / 2) / GRID) * GRID;
                  const previewD = `M ${x1} ${y1} L ${xMid} ${y1} L ${xMid} ${y2} L ${x2} ${y2}`;
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
                    </>
                  )}

                  {/* Component Symbol */}
                  {renderNodeSymbol(node, nodeW, nodeH)}

                  {/* Input Terminals */}
                  {node.inputs.map((pin, pi) => {
                    const pinPos = getPinLocalPos(node, true, pi, node.inputs.length);
                    const isHovered = hoveredPin?.nodeId === node.id && hoveredPin?.portName === pin.name;
                    const isStartPin = wiringStart?.nodeId === node.id && wiringStart?.portName === pin.name;

                    return (
                      <g
                        key={pin.id || `in_${pi}`}
                        onClick={(e) =>
                          handlePinClick(e, node.id, pin.name, false, pos.x + pinPos.x, pos.y + pinPos.y, pin.width || 1)
                        }
                        onMouseEnter={() => setHoveredPin({ nodeId: node.id, portName: pin.name })}
                        onMouseLeave={() => setHoveredPin(null)}
                        className="cursor-crosshair"
                      >
                        <circle
                          cx={pinPos.x}
                          cy={pinPos.y}
                          r={isHovered || isStartPin ? 5.5 : 3.5}
                          className={
                            isStartPin
                              ? 'fill-purple-400 stroke-white stroke-2 animate-ping'
                              : isHovered
                              ? 'fill-purple-400 stroke-white stroke-1.5'
                              : 'fill-sky-400 group-hover:fill-purple-400 transition-colors'
                          }
                        />
                        <text
                          x="10"
                          y={pinPos.y + 3.5}
                          textAnchor="start"
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

                    return (
                      <g
                        key={pin.id || `out_${po}`}
                        onClick={(e) =>
                          handlePinClick(e, node.id, pin.name, true, pos.x + pinPos.x, pos.y + pinPos.y, pin.width || 1)
                        }
                        onMouseEnter={() => setHoveredPin({ nodeId: node.id, portName: pin.name })}
                        onMouseLeave={() => setHoveredPin(null)}
                        className="cursor-crosshair"
                      >
                        <circle
                          cx={pinPos.x}
                          cy={pinPos.y}
                          r={isHovered || isStartPin ? 5.5 : 3.5}
                          className={
                            isStartPin
                              ? 'fill-purple-400 stroke-white stroke-2 animate-ping'
                              : isHovered
                              ? 'fill-purple-400 stroke-white stroke-1.5'
                              : 'fill-sky-400 group-hover:fill-emerald-400 transition-colors'
                          }
                        />
                        <text
                          x={pinPos.x - 10}
                          y={pinPos.y + 3.5}
                          textAnchor="end"
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
                    onAddComponent(blueprint, { x: pos.x + 40, y: pos.y + 40 });
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
              <div className="px-2 py-1 text-[11px] text-slate-400">
                Current Logic State:{' '}
                <span className="font-bold text-emerald-400">{probeValues[contextMenu.target.name] || '0'}</span>
              </div>
            </div>
          )}

          {/* Canvas Background Options */}
          {contextMenu.type === 'canvas' && (
            <div className="py-1 space-y-0.5">
              <button
                onClick={() => {
                  setIsPaletteOpen(true);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 flex items-center space-x-2 text-purple-300 hover:text-white transition"
              >
                <PlusCircle className="w-3.5 h-3.5 text-purple-400" />
                <span>Add Component (Palette)</span>
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
            </div>
          )}
        </div>
      )}

      {/* EDA SAFETY & PROHIBITED OPERATIONS MODAL */}
      {safetyModal && safetyModal.open && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
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
    </div>
  );
};
