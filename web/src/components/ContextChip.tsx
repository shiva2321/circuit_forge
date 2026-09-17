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
  node: { icon: <Cpu className="w-2.5 h-2.5" />, color: 'bg-indigo-950/80 border-indigo-700 text-indigo-200' },
  wire: { icon: <GitBranch className="w-2.5 h-2.5" />, color: 'bg-cyan-950/80 border-cyan-700 text-cyan-200' },
  file: { icon: <FileCode className="w-2.5 h-2.5" />, color: 'bg-blue-950/80 border-blue-600 text-blue-200' },
  code_range: { icon: <Code2 className="w-2.5 h-2.5" />, color: 'bg-amber-950/80 border-amber-700 text-amber-200' },
  chat_history: { icon: <MessageSquare className="w-2.5 h-2.5" />, color: 'bg-purple-950/80 border-purple-700 text-purple-200' },
  drc_issue: { icon: <ShieldAlert className="w-2.5 h-2.5" />, color: 'bg-rose-950/80 border-rose-700 text-rose-200' },
  canvas_snapshot: { icon: <Cpu className="w-2.5 h-2.5" />, color: 'bg-emerald-950/80 border-emerald-700 text-emerald-200' },
  window: { icon: <Monitor className="w-2.5 h-2.5" />, color: 'bg-indigo-950/80 border-indigo-500 text-indigo-200' },
  tab: { icon: <Layers className="w-2.5 h-2.5" />, color: 'bg-cyan-950/80 border-cyan-600 text-cyan-200' },
  screen: { icon: <Layout className="w-2.5 h-2.5" />, color: 'bg-purple-950/80 border-purple-600 text-purple-200' },
  custom: { icon: <Code2 className="w-2.5 h-2.5" />, color: 'bg-slate-800 border-slate-600 text-slate-200' },
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
