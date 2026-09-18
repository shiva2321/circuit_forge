import React, { useState, useRef, useEffect } from 'react';
import {
  Cpu,
  Play,
  Zap,
  Activity,
  Network,
  Code,
  Layers,
  FolderTree,
  Columns,
  Square,
  FileCode,
  RefreshCw,
  Grid3X3,
  Bot,
  Sparkles,
  Save,
  Check,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { CatalogCircuit } from '../types/circuit';

export interface HeaderProps {
  circuits: CatalogCircuit[];
  selectedCircuit: string;
  onSelectCircuit: (id: string) => void;
  activeTab: 'design' | 'waveform' | 'kg' | 'schematic' | 'code' | 'lifecycle' | 'embedded';
  onSelectTab: (tab: 'design' | 'waveform' | 'kg' | 'lifecycle' | 'embedded') => void;
  workspaceMode?: 'split' | 'schematic' | 'code';
  onChangeWorkspaceMode?: (mode: 'split' | 'schematic' | 'code') => void;
  layoutMode?: 'split' | 'tile' | 'float';
  onChangeLayoutMode?: (mode: 'split' | 'tile' | 'float') => void;
  syncStatus?: 'synced' | 'syncing' | 'error';
  agentState: string;
  isSimulating: boolean;
  onRunSimulation: () => void;
  currentScale: number;
  onOpenProjectManager?: () => void;
  activeProjectName?: string;
  onToggleAgentPanel?: () => void;
  isAgentPanelOpen?: boolean;
  isAutosaveEnabled?: boolean;
  onToggleAutosave?: () => void;
  saveStatusText?: string;
  saveStatusState?: 'saved' | 'saving' | 'dirty' | 'idle';
}

export const Header: React.FC<HeaderProps> = ({
  circuits,
  selectedCircuit,
  onSelectCircuit,
  activeTab,
  onSelectTab,
  workspaceMode = 'split',
  onChangeWorkspaceMode,
  layoutMode = 'split',
  onChangeLayoutMode,
  syncStatus = 'synced',
  agentState,
  isSimulating,
  onRunSimulation,
  currentScale,
  onOpenProjectManager,
  activeProjectName,
  onToggleAgentPanel,
  isAgentPanelOpen = true,
  isAutosaveEnabled = true,
  onToggleAutosave,
  saveStatusText,
  saveStatusState = 'saved',
}) => {
  const [isCircuitMenuOpen, setIsCircuitMenuOpen] = useState(false);
  const circuitMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (circuitMenuRef.current && !circuitMenuRef.current.contains(e.target as Node)) {
        setIsCircuitMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCircuitMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const getScaleBadge = (scale: number) => {
    switch (scale) {
      case 1:
        return { label: 'Scale 1: Gate Level', bg: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
      case 2:
        return { label: 'Scale 2: RTL Block', bg: 'bg-cyan-950 text-cyan-300 border-cyan-800' };
      case 3:
        return { label: 'Scale 3: Subsystem', bg: 'bg-blue-950 text-blue-300 border-blue-800' };
      case 4:
        return { label: 'Scale 4: Processor / SoC', bg: 'bg-amber-950 text-amber-300 border-amber-800' };
      default:
        return { label: 'Multi-Scale', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const scaleInfo = getScaleBadge(currentScale);
  const isDesignActive = activeTab === 'design' || activeTab === 'schematic' || activeTab === 'code';
  const activeCircuitObj = circuits.find((c) => c.id === selectedCircuit) || circuits[0];

  return (
    <header className="h-16 border-b border-slate-800 bg-[#070b12]/90 backdrop-blur px-4 flex items-center justify-between sticky top-0 z-30 overflow-x-auto">
      {/* Brand & Project Selector */}
      <div className="flex items-center space-x-3 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-emerald-400 via-teal-400 via-blue-500 to-purple-600 p-[1.5px] shadow-lg shadow-teal-500/20">
            <div className="w-full h-full bg-[#080d16] rounded-[7px] flex items-center justify-center">
              <Cpu className="w-5 h-5 text-teal-300" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-lg text-white tracking-tight">
                Circuit<span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-cyan-300 to-blue-400">Forge</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border bg-teal-950/60 border-teal-500/40 text-teal-300 font-mono">
                EDA Studio
              </span>
            </div>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-800 hidden md:block" />

        {/* Projects Workspace Hub Launcher Button */}
        {onOpenProjectManager && (
          <button
            onClick={onOpenProjectManager}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 hover:border-indigo-500 text-indigo-300 hover:text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            title={`Active Workspace: ${activeProjectName || 'Default'}. Click to browse projects or create a new design.`}
          >
            <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
            <span>Projects</span>
            {activeProjectName && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-900/80 border border-indigo-700 text-indigo-200 max-w-[120px] truncate hidden sm:inline">
                {activeProjectName}
              </span>
            )}
          </button>
        )}

        {/* Custom Active Circuit Project Switcher Dropdown */}
        <div ref={circuitMenuRef} className="relative">
          <button
            onClick={() => setIsCircuitMenuOpen((prev) => !prev)}
            className="flex items-center space-x-2 bg-slate-900/95 hover:bg-slate-800/90 border border-slate-700/80 hover:border-teal-500/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-100 shadow-sm transition cursor-pointer"
            title="Switch active circuit design in EDA studio"
          >
            <Layers className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold font-mono hidden sm:inline">
              Active:
            </span>
            <span className="font-semibold text-white max-w-[140px] truncate">
              {activeCircuitObj?.name || selectedCircuit}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-teal-300 font-mono border border-slate-700 hidden md:inline">
              {activeCircuitObj?.scale_label || `Scale ${currentScale}`}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCircuitMenuOpen ? 'rotate-180 text-teal-300' : ''}`} />
          </button>

          {isCircuitMenuOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-2.5 py-1.5 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between font-mono">
                <span>Select Active Circuit</span>
                <span className="text-teal-400">{circuits.length} designs</span>
              </div>
              <div className="py-1 max-h-64 overflow-y-auto space-y-0.5 no-scrollbar">
                {circuits.map((c) => {
                  const isSelected = c.id === selectedCircuit;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSelectCircuit(c.id);
                        setIsCircuitMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-teal-950/70 border border-teal-600/50 text-white font-bold'
                          : 'hover:bg-slate-800/80 text-slate-300 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? 'bg-teal-400 shadow-sm shadow-teal-400' : 'bg-slate-500'}`} />
                        <span className="text-xs truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-400 font-mono border border-slate-800">
                          {c.scale_label}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-teal-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              {onOpenProjectManager && (
                <div className="pt-1.5 border-t border-slate-800 mt-1">
                  <button
                    onClick={() => {
                      setIsCircuitMenuOpen(false);
                      onOpenProjectManager();
                    }}
                    className="w-full text-center py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/50 rounded-lg transition font-semibold cursor-pointer"
                  >
                    Browse Full Projects Workspace →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scale Badge */}
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium hidden xl:inline-flex ${scaleInfo.bg}`}>
          {scaleInfo.label}
        </span>
      </div>

      {/* Unified View Switcher Tabs & Workspace Layout Controls */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-1 space-x-1">
          <button
            onClick={() => onSelectTab('design')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              isDesignActive
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
            title="Unified Design & RTL Workspace (Schematic Canvas + VHDL-2008 Editor)"
          >
            <Zap className={`w-3.5 h-3.5 ${isDesignActive ? 'text-teal-300' : 'text-teal-400'}`} />
            <span>Design & RTL Studio</span>
          </button>

          <button
            onClick={() => onSelectTab('waveform')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'waveform'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
            title="Timing Waveform Simulation & Signal Analyzer"
          >
            <Activity className={`w-3.5 h-3.5 ${activeTab === 'waveform' ? 'text-cyan-300' : 'text-cyan-400'}`} />
            <span>Timing Waveforms</span>
          </button>

          <button
            onClick={() => onSelectTab('kg')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'kg'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
            title="Multi-Scale Circuit Knowledge Graph & Ontology"
          >
            <Network className={`w-3.5 h-3.5 ${activeTab === 'kg' ? 'text-purple-300' : 'text-purple-400'}`} />
            <span>Knowledge Graph</span>
          </button>

          <button
            onClick={() => onSelectTab('lifecycle')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'lifecycle'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
            title="Turnkey Hardware Lifecycle Solution (Multiphysics, Forging DFM, QA Inspection, Firmware Security, Supply Chain)"
          >
            <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'lifecycle' ? 'text-amber-300' : 'text-amber-400'}`} />
            <span>Hardware Lifecycle & DFM</span>
          </button>

          <button
            onClick={() => onSelectTab('embedded')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'embedded'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
            title="Multi-Platform Embedded & MCU Studio (Raspberry Pi Pico/SBC, ESP32-S3/C6, STM32 ARM Cortex, RISC-V, Verilog)"
          >
            <Cpu className={`w-3.5 h-3.5 ${activeTab === 'embedded' ? 'text-emerald-300' : 'text-emerald-400'}`} />
            <span>Embedded Platforms & MCUs</span>
          </button>
        </div>

        {/* Studio Layout Mode Selector (Split, Tile, Float) - visible on ultrawide; bottom dock handles other screens */}
        {onChangeLayoutMode && (
          <div className="hidden 2xl:flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-1 space-x-1 shadow-inner">
            <button
              onClick={() => onChangeLayoutMode('split')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
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
              onClick={() => onChangeLayoutMode('tile')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
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
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
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
        )}
      </div>

      {/* Action Controls & Agent State Indicator */}
      <div className="flex items-center space-x-2.5 flex-shrink-0">
        {/* Autosave Global Toggle & Status Pill */}
        <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-1 space-x-1.5 shadow-sm">
          <button
            onClick={onToggleAutosave}
            className={`flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
              isAutosaveEnabled
                ? 'bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 hover:bg-emerald-900/80 shadow-sm'
                : 'bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={`Autosave is ${isAutosaveEnabled ? 'ENABLED (Changes save automatically to disk & cache)' : 'DISABLED (Manual save required)'}. Click to toggle.`}
          >
            <Save className={`w-3 h-3 ${isAutosaveEnabled ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span>Autosave:</span>
            <span
              className={`text-[9px] font-bold px-1 py-0.2 rounded ${
                isAutosaveEnabled ? 'bg-emerald-800/60 text-emerald-200' : 'bg-slate-700 text-slate-400'
              }`}
            >
              {isAutosaveEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Status Indicator Pill */}
          <div className="flex items-center space-x-1 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
            {saveStatusState === 'saving' ? (
              <>
                <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-amber-300 hidden xl:inline">Saving...</span>
              </>
            ) : saveStatusState === 'dirty' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-amber-400 hidden xl:inline">Unsaved</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-slate-400 hidden xl:inline">{saveStatusText || 'Saved'}</span>
              </>
            )}
          </div>
        </div>

        {/* Agent Deck Quick Toggle Button */}
        {onToggleAgentPanel && (
          <button
            onClick={onToggleAgentPanel}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition cursor-pointer ${
              isAgentPanelOpen
                ? 'bg-gradient-to-r from-blue-950/90 to-purple-950/90 border-teal-500/80 text-teal-200 shadow-[0_0_12px_rgba(20,184,166,0.35)] ring-1 ring-teal-500/50'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white hover:border-teal-500/70 hover:bg-slate-800/80'
            }`}
            title="Toggle Autonomous EDA Agent Deck (Accessible on every tab with real-time background context)"
          >
            <Bot className={`w-3.5 h-3.5 ${isAgentPanelOpen ? 'text-teal-300 animate-pulse' : 'text-teal-400'}`} />
            <span className="hidden sm:inline">Agent Copilot</span>
            <span
              className={`w-2 h-2 rounded-full ${
                agentState === 'IDLE'
                  ? 'bg-emerald-400'
                  : agentState === 'PAUSED'
                  ? 'bg-amber-400'
                  : agentState === 'COMPLETED'
                  ? 'bg-emerald-400'
                  : 'bg-cyan-400 animate-ping'
              }`}
            />
          </button>
        )}

        {/* Quick Simulate Button */}
        <button
          onClick={onRunSimulation}
          disabled={isSimulating}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isSimulating ? 'Simulating...' : 'Simulate'}</span>
        </button>
      </div>
    </header>
  );
};
