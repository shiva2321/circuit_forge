import React from 'react';
import { X, Cpu, GitBranch, FileCode, MessageSquare, ShieldAlert, Code2, Monitor, Layers, Layout, Zap, Activity } from 'lucide-react';

export type ContextChipType = 'node' | 'wire' | 'file' | 'code_range' | 'chat_history' | 'drc_issue' | 'canvas_snapshot' | 'window' | 'tab' | 'screen' | 'custom';

export interface ContextChipItem {
  id: string;
  type: ContextChipType;
  label: string;
  data: any;
}

interface ContextChipProps {
  chip: ContextChipItem;
  onRemove: (id: string) => void;
}

const typeConfig: Record<ContextChipType, { icon: React.ReactNode; color: string }> = {
  node: { icon: <Cpu className="w-2.5 h-2.5 text-emerald-400" />, color: 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200' },
  wire: { icon: <GitBranch className="w-2.5 h-2.5 text-teal-400" />, color: 'bg-teal-950/60 border-teal-500/50 text-teal-200' },
  file: { icon: <FileCode className="w-2.5 h-2.5 text-blue-400" />, color: 'bg-blue-950/60 border-blue-500/50 text-blue-200' },
  code_range: { icon: <Code2 className="w-2.5 h-2.5 text-amber-400" />, color: 'bg-amber-950/60 border-amber-500/50 text-amber-200' },
  chat_history: { icon: <MessageSquare className="w-2.5 h-2.5 text-purple-400" />, color: 'bg-purple-950/60 border-purple-500/50 text-purple-200' },
  drc_issue: { icon: <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />, color: 'bg-rose-950/60 border-rose-500/50 text-rose-200' },
  canvas_snapshot: { icon: <Cpu className="w-2.5 h-2.5 text-teal-400" />, color: 'bg-slate-900 border-teal-500/50 text-teal-200' },
  window: { icon: <Monitor className="w-2.5 h-2.5 text-blue-400" />, color: 'bg-slate-900 border-blue-500/50 text-blue-200' },
  tab: { icon: <Layers className="w-2.5 h-2.5 text-cyan-400" />, color: 'bg-slate-900 border-cyan-500/50 text-cyan-200' },
  screen: { icon: <Layout className="w-2.5 h-2.5 text-purple-400" />, color: 'bg-slate-900 border-purple-500/50 text-purple-200' },
  custom: { icon: <Code2 className="w-2.5 h-2.5 text-slate-400" />, color: 'bg-slate-900 border-slate-700 text-slate-200' },
};

export const ContextChip: React.FC<ContextChipProps> = ({ chip, onRemove }) => {
  const cfg = typeConfig[chip.type] || typeConfig.custom;
  return (
    <span
      className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md border text-[9.5px] font-mono font-medium flex-shrink-0 ${cfg.color}`}
      title={`Context: ${chip.type} — ${chip.label}`}
    >
      {cfg.icon}
      <span className="max-w-[80px] truncate">{chip.label}</span>
      <button
        type="button"
        onClick={() => onRemove(chip.id)}
        className="opacity-60 hover:opacity-100 transition ml-0.5 hover:text-white"
        title="Remove from context"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
};
