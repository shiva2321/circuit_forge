import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Network,
  Search,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Sparkles,
  Info,
  X,
  Code,
  FileText,
  Activity,
  Cpu,
  Play,
  Pause,
  Shuffle,
  Eye,
  CheckCircle2,
  Sliders,
  Loader2,
} from 'lucide-react';
import { KGExport, KGNode } from '../types/circuit';
import { exportKG, getKGNode, ingestHFDataset, searchHFDatasets } from '../services/api';

interface KnowledgeGraphVisualizerProps {
  lastUpdatedNodeId?: string | null;
}

interface NodePos {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  fixed?: boolean;
}

export const KnowledgeGraphVisualizer: React.FC<KnowledgeGraphVisualizerProps> = ({ lastUpdatedNodeId }) => {
  const [graphData, setGraphData] = useState<KGExport | null>(null);
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [filterScale, setFilterScale] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [hfDatasetInput, setHfDatasetInput] = useState('shailja/Verilog_Github');
  const [hfSearchResults, setHfSearchResults] = useState<Array<{ id: string; name: string; description: string; likes: number; downloads: number; tags: string[] }>>([]);
  const [isHfDropdownOpen, setIsHfDropdownOpen] = useState(false);
  const [isSearchingHf, setIsSearchingHf] = useState(false);

  // Search HF datasets with debounce
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setIsSearchingHf(true);
      try {
        const res = await searchHFDatasets(hfDatasetInput);
        if (active) setHfSearchResults(res || []);
      } catch (e) {
        if (active) setHfSearchResults([]);
      } finally {
        if (active) setIsSearchingHf(false);
      }
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [hfDatasetInput]);

  // Physics Control: Freeze physics or allow layout settling
  const [isPhysicsFrozen, setIsPhysicsFrozen] = useState<boolean>(false);
  const [showAllLabels, setShowAllLabels] = useState<boolean>(false);
  const alphaRef = useRef<number>(1.0);

  // Pan & Zoom
  const [pan, setPan] = useState({ x: 100, y: 50 });
  const [zoom, setZoom] = useState(0.95);

  // Interaction State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesPosRef = useRef<Map<string, NodePos>>(new Map());
  const isDraggingNodeRef = useRef<string | null>(null);
  const isPanningRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mouseMovedRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);

  const loadGraph = useCallback(async () => {
    try {
      const data = await exportKG(200);
      setGraphData(data);
      initializePositions(data.nodes);
      alphaRef.current = 1.0;
    } catch (e) {
      console.error('Failed to load knowledge graph', e);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // When agent updates a node, refresh and inspect it
  useEffect(() => {
    if (lastUpdatedNodeId) {
      loadGraph();
      getKGNode(lastUpdatedNodeId).then((node) => {
        if (node) setSelectedNode(node);
      });
    }
  }, [lastUpdatedNodeId, loadGraph]);

  const initializePositions = (nodes: KGNode[]) => {
    const width = 1400;
    const height = 800;
    const map = new Map<string, NodePos>();

    nodes.forEach((node, i) => {
      // Preserve existing position if already plotted to avoid jarring physics jumps
      const existing = nodesPosRef.current.get(node.id);
      if (existing) {
        map.set(node.id, existing);
        return;
      }

      const angle = (i / nodes.length) * 2 * Math.PI;
      const baseRadius = 120 + (node.scale || 2) * 110;
      const jitter = (Math.random() - 0.5) * 40;
      const x = width / 2 + Math.cos(angle) * (baseRadius + jitter);
      const y = height / 2 + Math.sin(angle) * (baseRadius + jitter);

      map.set(node.id, {
        x,
        y,
        vx: 0,
        vy: 0,
        radius: node.scale === 4 ? 24 : node.scale === 3 ? 19 : node.scale === 2 ? 15 : 12,
        fixed: false,
      });
    });

    nodesPosRef.current = map;
    alphaRef.current = 1.0;
  };

  // Screen to Graph coordinate helper with exact canvas scale-factor normalization
  const screenToGraph = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / (rect.width || 1);
      const scaleY = canvasRef.current.height / (rect.height || 1);
      const sx = (clientX - rect.left) * scaleX;
      const sy = (clientY - rect.top) * scaleY;
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // Force simulation + Canvas Render Loop
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let active = true;

    const render = () => {
      if (!active) return;

      const positions = nodesPosRef.current;
      const links = graphData.links;
      const nodes = graphData.nodes;
      const draggedId = isDraggingNodeRef.current;

      // Stable physics step with alpha decay (settles quickly and halts slow drifting)
      if (!isPhysicsFrozen && alphaRef.current > 0.003 && positions.size > 0) {
        const alpha = alphaRef.current;
        const nodeList = Array.from(positions.entries());
        // Absolute stable center independent of camera pan
        const center = { x: canvas.width / 2, y: canvas.height / 2 };

        // 1. Repulsion between all nodes
        for (let i = 0; i < nodeList.length; i++) {
          const [id1, p1] = nodeList[i];
          for (let j = i + 1; j < nodeList.length; j++) {
            const [id2, p2] = nodeList[j];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < 220) {
              const force = ((220 - dist) / (dist * 16)) * alpha;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              if (id1 !== draggedId && !p1.fixed) {
                p1.vx -= fx;
                p1.vy -= fy;
              }
              if (id2 !== draggedId && !p2.fixed) {
                p2.vx += fx;
                p2.vy += fy;
              }
            }
          }

          // Stable center gravity
          if (id1 !== draggedId && !p1.fixed) {
            p1.vx += (center.x - p1.x) * 0.00025 * alpha;
            p1.vy += (center.y - p1.y) * 0.00025 * alpha;
          }
        }

        // 2. Spring attraction along links
        links.forEach((link) => {
          const srcId = typeof link.source === 'string' ? link.source : (link.source as any).id;
          const tgtId = typeof link.target === 'string' ? link.target : (link.target as any).id;
          const p1 = positions.get(srcId);
          const p2 = positions.get(tgtId);
          if (p1 && p2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy) || 1;
            const targetDist = 125;
            const force = (dist - targetDist) * 0.007 * alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (srcId !== draggedId && !p1.fixed) {
              p1.vx += fx;
              p1.vy += fy;
            }
            if (tgtId !== draggedId && !p2.fixed) {
              p2.vx -= fx;
              p2.vy -= fy;
            }
          }
        });

        // 3. Integrate & damp velocity
        nodeList.forEach(([id, p]) => {
          if (id !== draggedId && !p.fixed) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.82;
            p.vy *= 0.82;
          }
        });

        // Decay alpha so graph reaches a stable rest
        alphaRef.current *= 0.985;
      }

      // Clear Canvas
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background Grid
      ctx.save();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.6;
      const gridSize = 40 * zoom;
      const startX = pan.x % gridSize;
      const startY = pan.y % gridSize;
      for (let x = startX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = startY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.restore();

      // Apply Pan and Zoom Transform
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Set of neighbor IDs connected to selected or hovered node
      const neighborIds = new Set<string>();
      const activeFocusId = selectedNode?.id || hoveredNodeId;
      if (activeFocusId) {
        links.forEach((link) => {
          const srcId = typeof link.source === 'string' ? link.source : (link.source as any).id;
          const tgtId = typeof link.target === 'string' ? link.target : (link.target as any).id;
          if (srcId === activeFocusId) neighborIds.add(tgtId);
          if (tgtId === activeFocusId) neighborIds.add(srcId);
        });
      }

      // Draw Edges
      links.forEach((link) => {
        const srcId = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const tgtId = typeof link.target === 'string' ? link.target : (link.target as any).id;
        const p1 = positions.get(srcId);
        const p2 = positions.get(tgtId);

        if (p1 && p2) {
          const isConnected = selectedNode && (selectedNode.id === srcId || selectedNode.id === tgtId);
          const isHoverConnected = hoveredNodeId && (hoveredNodeId === srcId || hoveredNodeId === tgtId);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = isConnected ? '#c084fc' : isHoverConnected ? '#38bdf8' : '#334155';
          ctx.lineWidth = isConnected ? 2.8 : isHoverConnected ? 2 : 1;
          ctx.globalAlpha = isConnected ? 0.95 : isHoverConnected ? 0.8 : 0.35;
          ctx.stroke();

          // Relation label on link if connected
          if ((isConnected || isHoverConnected) && link.relation) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = '#a855f7';
            ctx.textAlign = 'center';
            ctx.fillText(link.relation, midX, midY - 3);
          }
        }
      });

      // Draw Nodes
      nodes.forEach((node) => {
        const p = positions.get(node.id);
        if (!p) return;

        const isFilteredOut = filterScale !== null && node.scale !== filterScale;
        const isSearchMatch = !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase());
        const isUpdated = node.id === lastUpdatedNodeId;
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNodeId === node.id;
        const isNeighbor = neighborIds.has(node.id);
        const isDragging = isDraggingNodeRef.current === node.id;

        const isHF = Boolean(node.id.startsWith('hf:') || (node.source && node.source.includes('huggingface')));

        // Scale color palette
        let color = '#a855f7'; // Scale 1 (purple)
        if (node.scale === 2) color = '#38bdf8'; // Scale 2 (sky)
        if (node.scale === 3) color = '#34d399'; // Scale 3 (emerald)
        if (node.scale === 4) color = '#f59e0b'; // Scale 4 (amber)
        if (node.scale === 0) color = '#f43f5e'; // Failure/Rule (rose)
        if (isHF) color = '#ec4899'; // HF (vibrant pink)

        ctx.save();
        ctx.globalAlpha = isFilteredOut || !isSearchMatch ? 0.15 : 1.0;

        // Glow ring for hovered / selected / updated / neighbor / HF
        if (isSelected || isHovered || isUpdated || isDragging || isNeighbor || isHF) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius + 8, 0, 2 * Math.PI);
          ctx.fillStyle = isSelected
            ? 'rgba(168, 85, 247, 0.45)'
            : isHovered
            ? 'rgba(56, 189, 248, 0.35)'
            : isHF
            ? 'rgba(236, 72, 153, 0.25)'
            : 'rgba(148, 163, 184, 0.2)';
          ctx.fill();
        }

        // Distinct outer ring for Hugging Face nodes
        if (isHF) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius + 3.5, 0, 2 * Math.PI);
          ctx.strokeStyle = '#f472b6';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([3, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + (isSelected ? 3 : 0), 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // Node border
        ctx.lineWidth = isSelected ? 3.5 : isHovered ? 2.5 : 1.5;
        ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#f8fafc' : '#0f172a';
        ctx.stroke();

        // Node Scale Text inside circle
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = isHF ? '#ffffff' : '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isHF ? 'HF' : node.scale ? `S${node.scale}` : '·', p.x, p.y);


        // Smart Label LOD: Avoid cluttering screen with 50 overlapping boxes
        // Draw label if:
        // 1. Show all labels is active, OR
        // 2. Node is Selected, Hovered, Connected Neighbor, or matches Search, OR
        // 3. Zoom is high enough (>= 1.0) and node is Scale 3 or 4
        const shouldDrawLabel =
          showAllLabels ||
          isSelected ||
          isHovered ||
          isNeighbor ||
          (searchQuery && isSearchMatch) ||
          (zoom >= 1.0 && (node.scale === 3 || node.scale === 4));

        if (shouldDrawLabel && isSearchMatch && !isFilteredOut) {
          ctx.font = isSelected ? 'bold 11px monospace' : '10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          const labelText = node.name.length > 24 ? node.name.substring(0, 22) + '…' : node.name;

          const textMetrics = ctx.measureText(labelText);
          const bgWidth = textMetrics.width + 10;
          const bgHeight = 15;
          const labelY = p.y + p.radius + 16;

          // Label Pill Background
          ctx.fillStyle = isSelected
            ? 'rgba(88, 28, 135, 0.95)'
            : isHovered
            ? 'rgba(15, 23, 42, 0.95)'
            : 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = isSelected ? '#c084fc' : isHovered ? '#38bdf8' : '#334155';
          ctx.lineWidth = 1;

          // Rounded rect path for label
          const rx = p.x - bgWidth / 2;
          const ry = labelY - 11;
          ctx.beginPath();
          ctx.roundRect(rx, ry, bgWidth, bgHeight, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isSelected ? '#ffffff' : isHovered ? '#38bdf8' : '#e2e8f0';
          ctx.fillText(labelText, p.x, labelY);
        }

        ctx.restore();
      });

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [graphData, pan, zoom, selectedNode, hoveredNodeId, filterScale, searchQuery, lastUpdatedNodeId, isPhysicsFrozen, showAllLabels]);

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !graphData) return;
    const { x: gx, y: gy } = screenToGraph(e.clientX, e.clientY);
    mouseMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    // Check if clicked precisely on a node
    let hitNode: KGNode | null = null;
    const positions = nodesPosRef.current;

    for (const node of graphData.nodes) {
      const p = positions.get(node.id);
      if (p) {
        const dist = Math.hypot(p.x - gx, p.y - gy);
        if (dist <= p.radius + 8) {
          hitNode = node;
          break;
        }
      }
    }

    if (hitNode) {
      isDraggingNodeRef.current = hitNode.id;
      const p = positions.get(hitNode.id);
      if (p) {
        p.fixed = true;
        p.vx = 0;
        p.vy = 0;
      }
    } else {
      isPanningRef.current = true;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: gx, y: gy } = screenToGraph(e.clientX, e.clientY);
    const distMoved = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
    if (distMoved > 4) {
      mouseMovedRef.current = true;
    }

    // 1. Dragging Node (Stays exactly with cursor)
    if (isDraggingNodeRef.current) {
      const nodeId = isDraggingNodeRef.current;
      const p = nodesPosRef.current.get(nodeId);
      if (p) {
        p.x = gx;
        p.y = gy;
        p.vx = 0;
        p.vy = 0;
        p.fixed = true;
      }
      return;
    }

    // 2. Panning Canvas
    if (isPanningRef.current) {
      setPan((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
      return;
    }

    // 3. Hover Detection
    if (graphData) {
      let foundHover: string | null = null;
      for (const node of graphData.nodes) {
        const p = nodesPosRef.current.get(node.id);
        if (p) {
          const dist = Math.hypot(p.x - gx, p.y - gy);
          if (dist <= p.radius + 8) {
            foundHover = node.id;
            break;
          }
        }
      }
      setHoveredNodeId(foundHover);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If was dragging a node
    if (isDraggingNodeRef.current) {
      const draggedId = isDraggingNodeRef.current;
      const p = nodesPosRef.current.get(draggedId);
      if (p) {
        // Keep node pinned right where the user dropped it!
        p.fixed = true;
        p.vx = 0;
        p.vy = 0;
      }

      // If clicked without dragging, select and open inspect drawer
      if (!mouseMovedRef.current) {
        getKGNode(draggedId).then((fullNode) => {
          if (fullNode) setSelectedNode(fullNode);
        });
      }
      isDraggingNodeRef.current = null;
    }

    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / (rect.width || 1);
    const scaleY = canvasRef.current.height / (rect.height || 1);
    const cursorX = (e.clientX - rect.left) * scaleX;
    const cursorY = (e.clientY - rect.top) * scaleY;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const newZoom = Math.min(3.5, Math.max(0.25, zoom * zoomFactor));

    setPan((prev) => ({
      x: cursorX - (cursorX - prev.x) * (newZoom / zoom),
      y: cursorY - (cursorY - prev.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  };

  const handleResetView = () => {
    setPan({ x: 100, y: 50 });
    setZoom(0.95);
  };

  const handleReorganize = () => {
    if (!graphData) return;
    // Unfix nodes and trigger layout relaxation
    nodesPosRef.current.forEach((p) => {
      p.fixed = false;
    });
    alphaRef.current = 1.0;
    setIsPhysicsFrozen(false);
  };

  const handleTriggerIngest = async () => {
    if (!hfDatasetInput.trim()) return;
    setIsIngesting(true);
    setIngestStatus(`Ingesting dataset '${hfDatasetInput}'...`);
    try {
      const res = await ingestHFDataset(hfDatasetInput, 6);
      setIngestStatus(`Ingested ${res.nodes_ingested} modules from '${hfDatasetInput}'!`);
      await loadGraph();
      if (res.node_ids && res.node_ids.length > 0) {
        const firstId = res.node_ids[0];
        try {
          const node = await getKGNode(firstId);
          if (node) setSelectedNode(node);
        } catch (err) {}
      }
    } catch (e) {
      setIngestStatus('Error ingesting dataset. Loaded offline benchmark nodes.');
    } finally {
      setIsIngesting(false);
      setTimeout(() => setIngestStatus(null), 5000);
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-slate-950 text-slate-100 select-none overflow-hidden relative">
      {/* Top Controls Bar */}
      <div className="h-12 border-b border-slate-800 bg-slate-900/80 px-4 flex items-center justify-between z-10 backdrop-blur">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-200">
            <Network className="w-4 h-4 text-purple-400" />
            <span>Multi-Scale Knowledge Graph</span>
            {graphData && (
              <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                {graphData.total_nodes} nodes · {graphData.total_edges} relations
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search concepts, rules, VHDL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none w-44 font-mono text-[11px]"
            />
          </div>

          {/* Scale Filter Buttons */}
          <div className="flex items-center space-x-1 bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setFilterScale(null)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                filterScale === null ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterScale(1)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                filterScale === 1 ? 'bg-purple-700 text-white' : 'text-purple-400 hover:text-purple-300'
              }`}
            >
              Scale 1
            </button>
            <button
              onClick={() => setFilterScale(2)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                filterScale === 2 ? 'bg-sky-700 text-white' : 'text-sky-400 hover:text-sky-300'
              }`}
            >
              Scale 2
            </button>
            <button
              onClick={() => setFilterScale(3)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                filterScale === 3 ? 'bg-emerald-700 text-white' : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              Scale 3
            </button>
            <button
              onClick={() => setFilterScale(4)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                filterScale === 4 ? 'bg-amber-700 text-white' : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              Scale 4
            </button>
          </div>
        </div>

        {/* View & Physics Controls */}
        <div className="flex items-center space-x-2">
          {/* Physics Freeze / Settle Controls */}
          <div className="flex items-center space-x-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => {
                if (isPhysicsFrozen) {
                  setIsPhysicsFrozen(false);
                  alphaRef.current = 0.5;
                } else {
                  setIsPhysicsFrozen(true);
                }
              }}
              className={`px-2 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition ${
                isPhysicsFrozen
                  ? 'bg-amber-950 border border-amber-600 text-amber-300'
                  : 'bg-emerald-950 border border-emerald-600 text-emerald-300'
              }`}
              title={isPhysicsFrozen ? 'Resume physics simulation' : 'Freeze physics in place'}
            >
              {isPhysicsFrozen ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span className="text-[10px]">{isPhysicsFrozen ? 'Physics: FROZEN' : 'Physics: ACTIVE'}</span>
            </button>

            <button
              onClick={handleReorganize}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition"
              title="Re-organize & Settle Layout"
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setShowAllLabels((s) => !s)}
              className={`p-1 rounded text-xs transition ${
                showAllLabels ? 'bg-purple-600 text-white' : 'hover:bg-slate-700 text-slate-300 hover:text-white'
              }`}
              title={showAllLabels ? 'Show Smart LOD Labels' : 'Show All Labels Always'}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Zoom Controls */}
          <div className="flex items-center space-x-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setZoom((z) => Math.min(3.5, z * 1.2))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.25, z / 1.2))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetView}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 px-1">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Searchable Hugging Face Ingestion Hub */}
          <div className="relative">
            <div className="flex items-center space-x-1.5">
              <div className="relative">
                <input
                  type="text"
                  value={hfDatasetInput}
                  onChange={(e) => {
                    setHfDatasetInput(e.target.value);
                    setIsHfDropdownOpen(true);
                  }}
                  onFocus={() => setIsHfDropdownOpen(true)}
                  className="bg-slate-950 border border-slate-700 hover:border-purple-500/60 focus:border-purple-500 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none w-52 font-mono text-[11px] transition shadow-inner"
                  placeholder="Search HuggingFace dataset..."
                />
                {isSearchingHf && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-3 h-3 text-pink-400 animate-spin" />
                  </div>
                )}
              </div>

              <button
                onClick={handleTriggerIngest}
                disabled={isIngesting}
                className="flex items-center space-x-1.5 px-3 py-1 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-semibold rounded-lg shadow-md transition disabled:opacity-50 active:scale-95 cursor-pointer"
                title="Download and ingest hardware dataset into Knowledge Graph"
              >
                {isIngesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isIngesting ? 'Ingesting...' : 'Ingest HF'}</span>
              </button>
            </div>

            {/* Hugging Face Datasets Search Results Dropdown */}
            {isHfDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsHfDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-80 max-h-64 overflow-y-auto bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md z-50 divide-y divide-slate-800 text-xs p-1 animate-fade-in">
                  <div className="px-2.5 py-1.5 text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                    <span>Hugging Face Hardware Datasets</span>
                    <span className="text-pink-400 font-mono">{hfSearchResults.length} found</span>
                  </div>

                  {hfSearchResults.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 text-xs">
                      {isSearchingHf ? 'Searching Hugging Face Hub...' : 'No hardware datasets found.'}
                    </div>
                  ) : (
                    hfSearchResults.map((ds) => (
                      <div
                        key={ds.id}
                        onClick={() => {
                          setHfDatasetInput(ds.id);
                          setIsHfDropdownOpen(false);
                        }}
                        className={`p-2 hover:bg-slate-800/80 rounded-lg cursor-pointer transition ${
                          hfDatasetInput === ds.id ? 'bg-purple-950/50 border border-purple-800/60' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200 text-[11px] truncate max-w-[190px]">
                            {ds.name || ds.id}
                          </span>
                          <span className="text-[10px] text-pink-400 font-mono flex items-center space-x-1">
                            <span>★ {ds.likes || 0}</span>
                            <span>· {ds.downloads || 0} dl</span>
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                          {ds.id}
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 font-sans">
                          {ds.description}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ingestion Status Toast */}
      {ingestStatus && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-purple-900/90 border border-purple-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-xl backdrop-blur flex items-center space-x-1.5 animate-bounce">
          <Sparkles className="w-3.5 h-3.5 text-pink-300" />
          <span>{ingestStatus}</span>
        </div>
      )}

      {/* Interactive 2D Canvas Area */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1600}
          height={900}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`w-full h-full ${
            isDraggingNodeRef.current ? 'cursor-grabbing' : hoveredNodeId ? 'cursor-pointer' : 'cursor-default'
          }`}
        />

        {/* Floating Instruction Badge */}
        <div className="absolute top-4 left-4 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] text-slate-400 backdrop-blur font-mono flex items-center space-x-3 pointer-events-none shadow-md">
          <span>• Click node to inspect details</span>
          <span>• Drag node to lock in position</span>
          <span>• Scroll to zoom</span>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-[10px] space-y-1.5 backdrop-blur shadow-xl">
          <div className="font-bold text-slate-300 mb-1 flex items-center space-x-1">
            <Layers className="w-3 h-3 text-purple-400" />
            <span>Scale Hierarchy</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm" />
            <span className="text-slate-300 font-medium">Scale 1: Gate Level</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-sm" />
            <span className="text-slate-300 font-medium">Scale 2: RTL & Arithmetic</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm" />
            <span className="text-slate-300 font-medium">Scale 3: Subsystems & ALUs</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm" />
            <span className="text-slate-300 font-medium">Scale 4: Processors & Pipelines</span>
          </div>
        </div>

        {/* Node Detail & VHDL Inspection Drawer */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bottom-4 w-96 bg-slate-900/95 border border-purple-600/70 rounded-2xl shadow-2xl backdrop-blur flex flex-col z-30 animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-start justify-between bg-slate-950/60">
              <div>
                <div className="flex items-center space-x-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor:
                        selectedNode.scale === 4
                          ? '#f59e0b'
                          : selectedNode.scale === 3
                          ? '#34d399'
                          : selectedNode.scale === 2
                          ? '#38bdf8'
                          : '#a855f7',
                    }}
                  />
                  <h3 className="text-sm font-bold text-slate-100">{selectedNode.name}</h3>
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center space-x-2">
                  <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                    Scale {selectedNode.scale || 'N/A'}
                  </span>
                  <span>{selectedNode.category || 'Circuit Element'}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
              {/* Description */}
              {selectedNode.description && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-1 flex items-center space-x-1">
                    <FileText className="w-3 h-3 text-purple-400" />
                    <span>Description & Specifications</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans text-[11px]">{selectedNode.description}</p>
                </div>
              )}

              {/* VHDL Source Preview */}
              {selectedNode.vhdl_code && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-1.5 flex items-center justify-between">
                    <div className="flex items-center space-x-1">
                      <Code className="w-3 h-3 text-emerald-400" />
                      <span>VHDL RTL Entity</span>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(selectedNode.vhdl_code || '')}
                      className="text-[9px] text-purple-400 hover:text-purple-300 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800"
                    >
                      Copy VHDL
                    </button>
                  </div>
                  <pre className="text-[10px] text-emerald-300 font-mono overflow-x-auto max-h-48 p-2 bg-slate-900 rounded border border-slate-800 leading-tight">
                    {selectedNode.vhdl_code}
                  </pre>
                </div>
              )}

              {/* Design Properties */}
              {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-2 flex items-center space-x-1">
                    <Activity className="w-3 h-3 text-sky-400" />
                    <span>Synthesis & Verification Metrics</span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    {Object.entries(selectedNode.properties).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between py-0.5 border-b border-slate-900">
                        <span className="text-slate-400">{k}:</span>
                        <span className="text-slate-200 font-bold">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Concepts / Rules */}
              {graphData && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-2 flex items-center space-x-1">
                    <Network className="w-3 h-3 text-pink-400" />
                    <span>Connected Relations</span>
                  </div>
                  <div className="space-y-1.5">
                    {graphData.links
                      .filter((l) => {
                        const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
                        const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
                        return s === selectedNode.id || t === selectedNode.id;
                      })
                      .map((l, idx) => {
                        const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
                        const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
                        const otherId = s === selectedNode.id ? t : s;
                        const otherNode = graphData.nodes.find((n) => n.id === otherId);
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              if (otherNode) {
                                getKGNode(otherNode.id).then((n) => {
                                  if (n) setSelectedNode(n);
                                });
                              }
                            }}
                            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-purple-600 cursor-pointer transition flex items-center justify-between"
                          >
                            <span className="text-slate-200 text-[11px] truncate">
                              {otherNode?.name || otherId}
                            </span>
                            <span className="text-[9px] text-purple-400 font-bold px-1 rounded bg-purple-950">
                              {l.relation || 'related_to'}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
