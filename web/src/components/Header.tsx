import React from 'react';
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
  Sparkles
} from 'lucide-react';
import { CatalogCircuit } from '../types/circuit';

export interface HeaderProps {
  circuits: CatalogCircuit[];
  selectedCircuit: string;
  onSelectCircuit: (id: string) => void;
  activeTab: 'design' | 'waveform' | 'kg' | 'schematic' | 'code' | 'lifecycle';
  onSelectTab: (tab: 'design' | 'waveform' | 'kg' | 'lifecycle') => void;
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
}) => {
  const getScaleBadge = (scale: number) => {
    switch (scale) {
      case 1:
        return { label: 'Scale 1: Gate Level', bg: 'bg-purple-950 text-purple-300 border-purple-800' };
      case 2:
        return { label: 'Scale 2: RTL Block', bg: 'bg-blue-950 text-blue-300 border-blue-800' };
      case 3:
        return { label: 'Scale 3: Subsystem', bg: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
      case 4:
        return { label: 'Scale 4: Processor / SoC', bg: 'bg-amber-950 text-amber-300 border-amber-800' };
      default:
        return { label: 'Multi-Scale', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const scaleInfo = getScaleBadge(currentScale);
  const isDesignActive = activeTab === 'design' || activeTab === 'schematic' || activeTab === 'code';

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-4 flex items-center justify-between sticky top-0 z-30">
      {/* Brand & Project Selector */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-lg text-white tracking-tight">
                Circuit<span className="text-purple-400">Forge</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border bg-purple-950/60 border-purple-800/60 text-purple-300 font-mono">
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
            title="Open Project Manager: Browse workspace directories, open recent projects, or create a new design"
          >
            <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
            <span>Projects</span>
          </button>
        )}

        {/* Active Circuit Project Switcher */}
        <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1">
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold font-mono hidden sm:inline">
            Active Design:
          </span>
          <select
            value={selectedCircuit}
            onChange={(e) => onSelectCircuit(e.target.value)}
            className="bg-transparent border-0 text-xs font-medium text-slate-100 focus:outline-none focus:ring-0 cursor-pointer pr-2"
            title="Switch active circuit project in EDA studio"
          >
            {circuits.map((c) => (
              <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">
                {c.name} ({c.scale_label})
              </option>
            ))}
          </select>
        </div>

        {/* Scale Badge */}
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium hidden xl:inline-flex ${scaleInfo.bg}`}>
          {scaleInfo.label}
        </span>
      </div>

      {/* Unified View Switcher Tabs & Workspace Layout Controls */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 space-x-1">
          <button
            onClick={() => onSelectTab('design')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              isDesignActive
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Unified Design & RTL Workspace (Schematic Canvas + VHDL-2008 Editor)"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Design & RTL</span>
          </button>

          <button
            onClick={() => onSelectTab('waveform')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'waveform'
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Timing Waveform Simulation & Signal Analyzer"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Waveform</span>
          </button>

          <button
            onClick={() => onSelectTab('kg')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'kg'
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Multi-Scale Circuit Knowledge Graph & Ontology"
          >
            <Network className="w-3.5 h-3.5" />
            <span>Knowledge Graph</span>
          </button>

          <button
            onClick={() => onSelectTab('lifecycle')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'lifecycle'
                ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Turnkey Hardware Lifecycle Solution (Multiphysics, Forging DFM, QA Inspection, Firmware Security, Supply Chain)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Turnkey Lifecycle</span>
          </button>
        </div>

        {/* Studio Layout Mode Selector (Split, Tile, Float) */}
        {onChangeLayoutMode && (
          <div className="hidden md:flex items-center bg-slate-900/90 border border-purple-900/40 rounded-lg p-1 space-x-1 shadow-inner">
            <button
              onClick={() => onChangeLayoutMode('split')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
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
              onClick={() => onChangeLayoutMode('tile')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
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
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
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
        )}
      </div>

      {/* Action Controls & Agent State Indicator */}
      <div className="flex items-center space-x-2.5">
        {/* Agent Deck Quick Toggle Button */}
        {onToggleAgentPanel && (
          <button
            onClick={onToggleAgentPanel}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
              isAgentPanelOpen
                ? 'bg-purple-950/80 border-purple-600/80 text-purple-200 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Autonomous EDA Agent Deck"
          >
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Agent Copilot</span>
            <span
              className={`w-2 h-2 rounded-full ${
                agentState === 'IDLE'
                  ? 'bg-slate-400'
                  : agentState === 'PAUSED'
                  ? 'bg-amber-400'
                  : agentState === 'COMPLETED'
                  ? 'bg-emerald-400'
                  : 'bg-purple-400 animate-ping'
              }`}
            />
          </button>
        )}

        {/* Quick Simulate Button */}
        <button
          onClick={onRunSimulation}
          disabled={isSimulating}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium shadow-lg shadow-emerald-600/20 transition cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isSimulating ? 'Simulating...' : 'Simulate'}</span>
        </button>
      </div>
    </header>
  );
};
