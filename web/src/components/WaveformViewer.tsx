import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Sliders,
  Eye,
  Crosshair,
  Hash,
  Sparkles,
} from 'lucide-react';
import { WaveformData, SimulationSummary, WaveformSignal } from '../types/circuit';

interface WaveformViewerProps {
  waveform: WaveformData | null;
  summary: SimulationSummary | null;
}

export const WaveformViewer: React.FC<WaveformViewerProps> = ({ waveform, summary }) => {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [cursorA, setCursorA] = useState<number | null>(10);
  const [cursorB, setCursorB] = useState<number | null>(35);
  const [filterText, setFilterText] = useState('');
  const [timeScale, setTimeScale] = useState(16); // pixels per ns
  const [radix, setRadix] = useState<'hex' | 'dec' | 'bin'>('hex');
  const [expandedBuses, setExpandedBuses] = useState<Record<string, boolean>>({});
  const [showValuesOnWave, setShowValuesOnWave] = useState(true);

  // Resizable Signal Column State
  const [signalColWidth, setSignalColWidth] = useState<number>(() => {
    const saved = localStorage.getItem('circuitforge_waveform_col_width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 140 && parsed <= 500) return parsed;
    }
    return 210;
  });
  const [isDraggingSignalCol, setIsDraggingSignalCol] = useState(false);

  useEffect(() => {
    localStorage.setItem('circuitforge_waveform_col_width', String(signalColWidth));
  }, [signalColWidth]);

  useEffect(() => {
    if (!isDraggingSignalCol) return;

    const onMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - rect.left;
        setSignalColWidth(Math.max(140, Math.min(500, newWidth)));
      }
    };
    const onMouseUp = () => setIsDraggingSignalCol(false);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingSignalCol]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Detect clock period (default 10ns if not found) - Must precede conditional early returns
  const clockPeriod = useMemo(() => {
    if (!waveform || !waveform.signals) return 10;
    const clkSignal = waveform.signals.find((s) => s.is_clock);
    if (clkSignal && clkSignal.transitions.length >= 3) {
      return clkSignal.transitions[2].time - clkSignal.transitions[0].time;
    }
    return 10;
  }, [waveform]);

  if (!waveform || waveform.signals.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 bg-slate-950">
        <div className="text-center">
          <Activity className="w-9 h-9 mx-auto mb-2 opacity-40 text-purple-400" />
          <p className="text-sm font-medium text-slate-400">No waveform data available.</p>
          <p className="text-xs text-slate-600 mt-1">Click "Simulate" to execute the testbench and generate digital waves.</p>
        </div>
      </div>
    );
  }

  const [minTime, maxTime] = waveform.time_range;
  const totalDuration = Math.max(maxTime, 50);
  const canvasWidth = totalDuration * timeScale + 240;

  const toggleExpandBus = (signalName: string) => {
    setExpandedBuses((prev) => ({
      ...prev,
      [signalName]: !prev[signalName],
    }));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 210 + containerRef.current.scrollLeft;
    if (x >= 0 && x <= totalDuration * timeScale) {
      setHoverTime(Math.round(x / timeScale));
    } else {
      setHoverTime(null);
    }
  };

  const handleClickTimeline = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 210 + containerRef.current.scrollLeft;
    if (x >= 0 && x <= totalDuration * timeScale) {
      const clickedTime = Math.round(x / timeScale);
      if (e.shiftKey) {
        setCursorB(clickedTime);
      } else {
        setCursorA(clickedTime);
      }
    }
  };

  const formatBusValue = (binaryStr: string): string => {
    try {
      const num = parseInt(binaryStr, 2);
      if (isNaN(num)) return binaryStr;
      if (radix === 'hex') return `0x${num.toString(16).toUpperCase()}`;
      if (radix === 'dec') return String(num);
      return binaryStr;
    } catch {
      return binaryStr;
    }
  };

  const getSignalValueAtTime = (signal: WaveformSignal, time: number): string => {
    let val = '0';
    for (const tr of signal.transitions) {
      if (tr.time <= time) {
        val = tr.val;
      } else {
        break;
      }
    }
    return val;
  };

  const deltaT = cursorA !== null && cursorB !== null ? Math.abs(cursorB - cursorA) : null;
  const freqMHz = deltaT && deltaT > 0 ? (1000 / deltaT).toFixed(1) : null;

  const filteredSignals = waveform.signals.filter((s) =>
    s.name.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 select-none overflow-hidden">
      {/* Waveform Controls Header */}
      <div className="h-13 border-b border-slate-800 bg-slate-900/80 px-4 py-2 flex items-center justify-between z-10 backdrop-blur">
        <div className="flex items-center space-x-3">
          {/* Signal Search */}
          <div className="flex items-center space-x-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter nets..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none w-28"
            />
          </div>

          {/* Radix Switcher */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
            <span className="text-[10px] text-slate-400 px-2 font-mono flex items-center space-x-1">
              <Hash className="w-3 h-3" />
              <span>Radix:</span>
            </span>
            <button
              onClick={() => setRadix('hex')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition ${
                radix === 'hex' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              HEX
            </button>
            <button
              onClick={() => setRadix('dec')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition ${
                radix === 'dec' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DEC
            </button>
            <button
              onClick={() => setRadix('bin')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition ${
                radix === 'bin' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              BIN
            </button>
          </div>

          {/* Zoom In/Out */}
          <div className="flex items-center space-x-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setTimeScale((s) => Math.min(32, s + 3))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition"
              title="Zoom In (Time)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTimeScale((s) => Math.max(6, s - 3))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition"
              title="Zoom Out (Time)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 px-1">{timeScale}px/ns</span>
          </div>

          {/* Toggle Values On Wave */}
          <button
            onClick={() => setShowValuesOnWave(!showValuesOnWave)}
            className={`flex items-center space-x-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition ${
              showValuesOnWave
                ? 'bg-purple-950/60 border-purple-600 text-purple-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Toggle logic state labels on waves"
          >
            <Eye className="w-3 h-3" />
            <span>Labels {showValuesOnWave ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Delta Time Measurement Cursor Readout */}
        <div className="flex items-center space-x-3">
          {deltaT !== null && (
            <div className="flex items-center space-x-2 bg-slate-900 border border-purple-800/80 rounded-lg px-2.5 py-1 text-xs font-mono">
              <span className="text-purple-400 font-bold">ΔT = {deltaT} ns</span>
              {freqMHz && <span className="text-slate-400 font-semibold">({freqMHz} MHz)</span>}
              <span className="text-[10px] text-slate-500">[Click=A, Shift+Click=B]</span>
            </div>
          )}

          {summary && summary.assertions.total > 0 && (
            <div className="flex items-center space-x-2">
              {summary.assertions.all_passed ? (
                <div className="flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2.5 py-1 rounded-lg font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{summary.assertions.passed}/{summary.assertions.total} Assertions Passed</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/80 border border-rose-800 px-2.5 py-1 rounded-lg font-medium">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{summary.assertions.failed} Failed</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Hover Probe HUD Ribbon */}
      <div className="h-8 border-b border-slate-800 bg-slate-900/90 px-4 flex items-center space-x-3 text-xs overflow-x-auto">
        <div className="flex items-center space-x-1.5 text-purple-400 font-mono font-bold min-w-max">
          <Crosshair className="w-3.5 h-3.5" />
          <span>PROBE:</span>
          {hoverTime !== null ? (
            <span className="text-white bg-purple-900/60 px-1.5 py-0.5 rounded border border-purple-700">
              T = {hoverTime} ns (Cycle {Math.floor(hoverTime / clockPeriod)})
            </span>
          ) : (
            <span className="text-slate-500 font-normal">Hover timeline to inspect</span>
          )}
        </div>

        {hoverTime !== null && (
          <div className="flex items-center space-x-2 overflow-x-auto py-0.5">
            {filteredSignals.slice(0, 8).map((sig) => {
              const rawVal = getSignalValueAtTime(sig, hoverTime);
              const formattedVal = sig.width > 1 ? formatBusValue(rawVal) : rawVal;
              return (
                <div
                  key={sig.name}
                  className="flex items-center space-x-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[10px] font-mono min-w-max"
                >
                  <span className="text-slate-400">{sig.name}:</span>
                  <span
                    className={`font-bold ${
                      sig.width === 1
                        ? rawVal === '1'
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                        : 'text-purple-300'
                    }`}
                  >
                    {formattedVal}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Waveform Grid & Timing Tracks */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverTime(null)}
        onClick={handleClickTimeline}
        className="flex-1 overflow-auto relative"
      >
        {/* Time Scale & Clock Cycle Header */}
        <div className="sticky top-0 z-20 flex bg-slate-900 border-b border-slate-800 h-9 shadow-md">
          <div
            style={{ width: `${signalColWidth}px` }}
            className="border-r border-slate-800 bg-slate-900 px-3 flex items-center justify-between text-xs font-mono text-slate-300 font-bold sticky left-0 z-30 relative group select-none flex-shrink-0"
          >
            <span>SIGNAL NET</span>
            <span className="text-[10px] text-slate-500 font-normal mr-1">TYPE</span>

            {/* Draggable divider handle on right edge of header */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingSignalCol(true);
              }}
              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-purple-500/60 transition-colors z-40 flex items-center justify-center"
              title="Drag to resize signal column"
            />
          </div>
          <div className="relative flex-1 h-full" style={{ width: `${canvasWidth}px` }}>
            {/* 10ns Major Tick Markers & Clock Cycle Labels */}
            {Array.from({ length: Math.ceil(totalDuration / 10) + 1 }).map((_, idx) => {
              const t = idx * 10;
              const x = t * timeScale;
              const cycleIndex = Math.floor(t / clockPeriod);
              return (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 border-l border-slate-700/80 flex flex-col justify-center pl-1 text-[10px] font-mono text-slate-300 pointer-events-none"
                  style={{ left: `${x}px` }}
                >
                  <span className="text-slate-300 font-bold">{t}ns</span>
                  <span className="text-[9px] text-purple-400 font-semibold">[C{cycleIndex}]</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Signal Wave Tracks */}
        {filteredSignals.map((signal) => {
          const isExpanded = expandedBuses[signal.name];
          const currentVal = hoverTime !== null ? getSignalValueAtTime(signal, hoverTime) : null;
          const rowHeight = 44;

          return (
            <React.Fragment key={signal.name}>
              {/* Main Signal Row */}
              <div className="flex border-b border-slate-900 hover:bg-slate-900/30 transition">
                {/* Left Label Column */}
                <div
                  style={{ width: `${signalColWidth}px` }}
                  className="border-r border-slate-800 bg-slate-950/95 px-3 py-2 flex items-center justify-between sticky left-0 z-10 backdrop-blur flex-shrink-0"
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    {signal.width > 1 && (
                      <button
                        onClick={() => toggleExpandBus(signal.name)}
                        className="text-slate-400 hover:text-slate-200 transition"
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <div className="truncate">
                      <div className="text-xs font-mono font-bold text-slate-200 truncate flex items-center space-x-1">
                        {signal.is_clock && <Clock className="w-3 h-3 text-sky-400" />}
                        <span>{signal.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {signal.is_clock ? 'CLOCK' : signal.width > 1 ? `BUS [${signal.width - 1}:0]` : 'WIRE'}
                      </div>
                    </div>
                  </div>
                  {currentVal !== null && (
                    <span
                      className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
                        signal.width === 1
                          ? currentVal === '1'
                            ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                          : 'bg-purple-950/80 border-purple-700 text-purple-300'
                      }`}
                    >
                      {signal.width > 1 ? formatBusValue(currentVal) : currentVal}
                    </span>
                  )}
                </div>

                {/* Wave Canvas Track */}
                <div className="relative flex-1" style={{ height: `${rowHeight}px`, width: `${canvasWidth}px` }}>
                  {/* Vertical Cycle Grid Lines */}
                  {Array.from({ length: Math.ceil(totalDuration / 10) + 1 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="absolute top-0 bottom-0 border-l border-slate-900/80 pointer-events-none"
                      style={{ left: `${idx * 10 * timeScale}px` }}
                    />
                  ))}

                  <svg className="w-full h-full" height={rowHeight}>
                    {signal.width === 1 ? (
                      /* Single Bit Wire or Clock */
                      signal.transitions.map((tr, idx) => {
                        const nextTr = signal.transitions[idx + 1];
                        const tStart = tr.time * timeScale;
                        const tEnd = (nextTr ? nextTr.time : totalDuration) * timeScale;
                        const segWidth = tEnd - tStart;
                        const y = tr.val === '1' ? 9 : 33;
                        const nextY = nextTr ? (nextTr.val === '1' ? 9 : 33) : y;
                        const isHigh = tr.val === '1';

                        return (
                          <g key={idx}>
                            {/* Horizontal segment */}
                            <line
                              x1={tStart}
                              y1={y}
                              x2={tEnd}
                              y2={y}
                              stroke={signal.is_clock ? '#38bdf8' : isHigh ? '#22c55e' : '#64748b'}
                              strokeWidth={2.4}
                            />
                            {/* Vertical transition edge */}
                            {nextTr && (
                              <line
                                x1={tEnd}
                                y1={y}
                                x2={tEnd}
                                y2={nextY}
                                stroke={signal.is_clock ? '#7dd3fc' : '#94a3b8'}
                                strokeWidth={1.8}
                              />
                            )}

                            {/* Value Label on the wave segment */}
                            {showValuesOnWave && segWidth > 14 && (
                              <text
                                x={tStart + segWidth / 2}
                                y={isHigh ? 7 : 31}
                                textAnchor="middle"
                                className={`text-[9px] font-mono font-bold select-none pointer-events-none ${
                                  isHigh ? 'fill-emerald-400' : 'fill-slate-500'
                                }`}
                              >
                                {tr.val}
                              </text>
                            )}
                          </g>
                        );
                      })
                    ) : (
                      /* Multi-bit Bus */
                      signal.transitions.map((tr, idx) => {
                        const nextTr = signal.transitions[idx + 1];
                        const tStart = tr.time * timeScale;
                        const tEnd = (nextTr ? nextTr.time : totalDuration) * timeScale;
                        const width = tEnd - tStart;
                        const displayVal = formatBusValue(tr.val);

                        return (
                          <g key={idx}>
                            <polygon
                              points={`
                                ${tStart + 4},9 
                                ${tEnd - 4},9 
                                ${tEnd},21 
                                ${tEnd - 4},33 
                                ${tStart + 4},33 
                                ${tStart},21
                              `}
                              className="fill-purple-950/70 stroke-purple-500 stroke-1 hover:fill-purple-900/80 transition"
                            />
                            {/* Formatted Bus Label inside segment */}
                            {width > 16 && (
                              <text
                                x={tStart + width / 2}
                                y={25}
                                textAnchor="middle"
                                className="fill-purple-200 text-[10px] font-mono font-bold select-none pointer-events-none"
                              >
                                {width < 32 && displayVal.length > 4 ? '..' : displayVal}
                              </text>
                            )}
                          </g>
                        );
                      })
                    )}
                  </svg>
                </div>
              </div>

              {/* Expanded Individual Bits for Multi-Bit Buses */}
              {isExpanded &&
                Array.from({ length: Math.min(signal.width, 8) }).map((_, bitIdx) => {
                  return (
                    <div key={`${signal.name}_bit_${bitIdx}`} className="flex border-b border-slate-900/60 bg-slate-950/50">
                      <div
                        style={{ width: `${signalColWidth}px` }}
                        className="border-r border-slate-800/80 bg-slate-950/95 pl-8 pr-3 py-1 flex items-center justify-between sticky left-0 z-10 flex-shrink-0"
                      >
                        <span className="text-[11px] font-mono text-slate-400 font-medium">
                          {signal.name}[{bitIdx}]
                        </span>
                        {currentVal !== null && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {currentVal.length > bitIdx ? currentVal[currentVal.length - 1 - bitIdx] : '0'}
                          </span>
                        )}
                      </div>
                      <div className="relative flex-1" style={{ height: '30px', width: `${canvasWidth}px` }}>
                        <svg className="w-full h-full" height={30}>
                          {signal.transitions.map((tr, idx) => {
                            const nextTr = signal.transitions[idx + 1];
                            const tStart = tr.time * timeScale;
                            const tEnd = (nextTr ? nextTr.time : totalDuration) * timeScale;
                            const segWidth = tEnd - tStart;
                            const bitVal = tr.val.length > bitIdx ? tr.val[tr.val.length - 1 - bitIdx] : '0';
                            const nextBitVal =
                              nextTr && nextTr.val.length > bitIdx
                                ? nextTr.val[nextTr.val.length - 1 - bitIdx]
                                : bitVal;
                            const y = bitVal === '1' ? 7 : 23;
                            const nextY = nextBitVal === '1' ? 7 : 23;
                            const isHigh = bitVal === '1';

                            return (
                              <g key={idx}>
                                <line
                                  x1={tStart}
                                  y1={y}
                                  x2={tEnd}
                                  y2={y}
                                  stroke={isHigh ? '#22c55e' : '#64748b'}
                                  strokeWidth={2}
                                />
                                {nextTr && (
                                  <line x1={tEnd} y1={y} x2={tEnd} y2={nextY} stroke="#94a3b8" strokeWidth={1.4} />
                                )}
                                {showValuesOnWave && segWidth > 14 && (
                                  <text
                                    x={tStart + segWidth / 2}
                                    y={isHigh ? 6 : 22}
                                    textAnchor="middle"
                                    className={`text-[8px] font-mono select-none pointer-events-none ${
                                      isHigh ? 'fill-emerald-400' : 'fill-slate-500'
                                    }`}
                                  >
                                    {bitVal}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>
                  );
                })}
            </React.Fragment>
          );
        })}

        {/* Cursor A (Green Marker) */}
        {cursorA !== null && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none border-l-2 border-emerald-400 z-30 shadow-lg shadow-emerald-500/40"
            style={{ left: `${208 + cursorA * timeScale}px` }}
          >
            <div className="bg-emerald-500 text-black text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-b shadow">
              Cursor A: {cursorA}ns
            </div>
          </div>
        )}

        {/* Cursor B (Amber Marker) */}
        {cursorB !== null && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none border-l-2 border-amber-400 z-30 shadow-lg shadow-amber-500/40"
            style={{ left: `${208 + cursorB * timeScale}px` }}
          >
            <div className="bg-amber-500 text-black text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-b shadow">
              Cursor B: {cursorB}ns
            </div>
          </div>
        )}

        {/* Hover Time Cursor (Purple Glowing Line) */}
        {hoverTime !== null && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none border-l-2 border-purple-400 z-20 shadow-md shadow-purple-500/50"
            style={{ left: `${208 + hoverTime * timeScale}px` }}
          >
            <div className="bg-purple-600 text-white text-[9px] font-mono font-bold px-1 rounded-b">
              {hoverTime}ns
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
