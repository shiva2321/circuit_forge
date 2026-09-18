import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Check,
  Zap,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Activity,
  Sparkles,
  Wrench,
  Rocket,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  XCircle,
  Brain,
} from 'lucide-react';

interface ChatMessageRendererProps {
  thought: string;
  state?: string;
  details?: any;
  action?: any;
  onApplyDesignToCanvas?: (vhdlCode: string, circuitName: string, filePath?: string) => void;
  onAutoFixAll?: () => void;
  onPermissionDecision?: (approved: boolean, details: any) => void;
  circuitName?: string;
  hasUnresolvedDrc?: boolean;
}

interface ParsedSection {
  id: string;
  title: string;
  content: string;
  category: 'drc' | 'code' | 'physics' | 'telemetry' | 'general';
}

export const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({
  thought,
  details,
  action,
  onApplyDesignToCanvas,
  onAutoFixAll,
  onPermissionDecision,
  circuitName = 'custom_design',
  hasUnresolvedDrc = false,
}) => {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [permissionState, setPermissionState] = useState<'pending' | 'approved' | 'rejected'>(() =>
    details?.approved ? 'approved' : 'pending'
  );

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  };

  // Helper to categorize section for icons & badges
  const categorizeTitle = (title: string): 'drc' | 'code' | 'physics' | 'telemetry' | 'general' => {
    const t = title.toLowerCase();
    if (t.includes('drc') || t.includes('violation') || t.includes('error') || t.includes('hazard') || t.includes('fault')) {
      return 'drc';
    }
    if (t.includes('vhdl') || t.includes('code') || t.includes('rtl') || t.includes('synthesiz') || t.includes('verilog')) {
      return 'code';
    }
    if (t.includes('physics') || t.includes('crowbar') || t.includes('shoot-through') || t.includes('thermal') || t.includes('contention') || t.includes('transistor')) {
      return 'physics';
    }
    if (t.includes('telemetry') || t.includes('probe') || t.includes('voltage') || t.includes('timing') || t.includes('stage')) {
      return 'telemetry';
    }
    return 'general';
  };

  // 1. Check for HTML <details><summary>...</summary>...</details>
  const detailsRegex = /<details[^>]*>[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  const hasDetailsTags = detailsRegex.test(thought);
  detailsRegex.lastIndex = 0;

  // 2. Check for markdown headings ### Section Title
  const hasMarkdownHeadings = (thought.match(/^###\s+/gm) || []).length >= 1;

  // Render individual code block
  const renderCodeBlock = (code: string, lang: string = 'vhdl', id: string) => {
    const lineCount = code.split('\n').length;
    const isSynthesizableVHDL =
      (lang.toLowerCase().includes('vhd') || lang === '' || code.toLowerCase().includes('entity') || code.toLowerCase().includes('architecture')) &&
      code.toLowerCase().includes('port');

    return (
      <div key={id} className="my-2 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shadow-inner">
        <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center space-x-1.5 text-teal-300">
            <Code2 className="w-3.5 h-3.5 text-teal-400" />
            <span className="uppercase font-bold">{lang || 'vhdl'}</span>
            <span className="text-slate-500">• {lineCount} lines</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => handleCopyCode(code, id)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center space-x-1 transition cursor-pointer"
              title="Copy code to clipboard"
            >
              {copiedCodeId === id ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span className="text-[9px]">Copy</span>
                </>
              )}
            </button>
            {isSynthesizableVHDL && onApplyDesignToCanvas && (
              <button
                onClick={() => onApplyDesignToCanvas(code, circuitName, (action && action.file_path) || (details && details.file_path))}
                className="px-2.5 py-0.5 rounded bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-white font-bold flex items-center space-x-1 transition cursor-pointer shadow-md active:scale-95"
                title="Synthesize and apply this code directly to canvas"
              >
                <Zap className="w-3 h-3 text-amber-300" />
                <span className="text-[9.5px]">⚡ Apply to Canvas</span>
              </button>
            )}
          </div>
        </div>
        <pre className="p-3 text-[11px] font-mono text-emerald-300/90 overflow-x-auto leading-relaxed max-h-64 scrollbar-thin">
          <code>{code}</code>
        </pre>
      </div>
    );
  };

  // Helper to format text with inline code blocks
  const renderFormattedText = (rawText: string, sectionPrefix: string = 'txt') => {
    // Split by code fences ```lang ... ```
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let blockIdx = 0;

    while ((match = codeBlockRegex.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: rawText.slice(lastIndex, match.index),
          id: `${sectionPrefix}_p_${blockIdx}`,
        });
      }
      parts.push({
        type: 'code',
        lang: match[1] || 'vhdl',
        code: match[2].trim(),
        id: `${sectionPrefix}_code_${blockIdx}`,
      });
      lastIndex = match.index + match[0].length;
      blockIdx++;
    }

    if (lastIndex < rawText.length) {
      parts.push({
        type: 'text',
        content: rawText.slice(lastIndex),
        id: `${sectionPrefix}_p_end`,
      });
    }

    if (parts.length === 0) {
      parts.push({ type: 'text', content: rawText, id: `${sectionPrefix}_single` });
    }

    return (
      <div className="space-y-1.5 text-[11px] leading-relaxed">
        {parts.map((part) => {
          if (part.type === 'code') {
            return renderCodeBlock(part.code || '', part.lang, part.id);
          }
          // Process markdown bullet points and text
          const lines = (part.content || '').split('\n');
          return (
            <div key={part.id} className="space-y-1">
              {lines.map((line, lIdx) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={lIdx} className="h-1" />;
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                  return (
                    <div key={lIdx} className="flex items-start space-x-1.5 pl-1.5">
                      <span className="text-teal-400 font-bold mt-0.5">•</span>
                      <span className="text-slate-300 font-sans">{trimmed.slice(2)}</span>
                    </div>
                  );
                }
                return (
                  <p key={lIdx} className="text-slate-300 font-sans whitespace-pre-wrap">
                    {line}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Special Card 1: Autonomous Task Briefing ─────────────────────────────
  if (details?.type === 'task_briefing') {
    return (
      <div className="rounded-2xl border border-teal-500/40 bg-gradient-to-br from-teal-950/30 via-slate-900 to-blue-950/30 p-3.5 shadow-xl space-y-3 font-sans text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-teal-800/40">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-teal-600/30 border border-teal-500/50 flex items-center justify-center text-teal-300 flex-shrink-0">
              <Rocket className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-teal-400 font-mono block">
                Autonomous Task Briefing
              </span>
              <h4 className="text-[12.5px] font-bold text-slate-100 leading-tight truncate">
                {details.goal || 'Hardware Engineering Mission'}
              </h4>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border flex-shrink-0 ${
            details.supervisionMode === 'supervised'
              ? 'bg-amber-950/80 border-amber-600/60 text-amber-300'
              : 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
          }`}>
            {details.supervisionMode === 'supervised' ? 'Supervised' : 'Autonomous'}
          </span>
        </div>

        {details.requirements && (
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed">
            <span className="text-[9.5px] font-bold text-slate-400 font-mono block mb-1">SPECIFICATION & CONSTRAINTS:</span>
            {details.requirements}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="text-slate-500 block text-[9px]">STANDARD</span>
            <span className="text-cyan-300 font-bold">{details.standard || 'IEEE 1076-2008'}</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="text-slate-500 block text-[9px]">CONSTRAINTS</span>
            <span className="text-teal-300 font-bold">{details.clockFreq || 100} MHz • {details.resetType === 'sync_active_low' ? 'rst_n' : 'rst'}</span>
          </div>
        </div>

        {details.attachedContext?.length > 0 && (
          <div className="flex items-center flex-wrap gap-1 text-[9.5px] font-mono">
            <span className="text-slate-500 mr-1">Context:</span>
            {details.attachedContext.map((ctx: string, i: number) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                {ctx}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-indigo-900/40 text-[10px] text-slate-400 font-mono">
          <div className="flex items-center space-x-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Agent Active · Human Co-Pilot Observing</span>
          </div>
          <span>Scale {details.scale || 3}/4</span>
        </div>
      </div>
    );
  }

  // ── Special Card 2: Interactive Permission Approval ───────────────────────
  if (details?.type === 'permission_request' || action === 'permission_request') {
    return (
      <div className="rounded-2xl border border-amber-600/70 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-950 p-3.5 shadow-xl space-y-3 font-sans text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-amber-700/40">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-xl bg-amber-600/30 border border-amber-500/50 flex items-center justify-center text-amber-300 flex-shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-400 font-mono block">
                Human Permission Required
              </span>
              <h4 className="text-[12.5px] font-bold text-slate-100 leading-tight">
                {details.title || 'Approve Workspace RTL Update'}
              </h4>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700 text-[9px] font-mono font-bold">
            Supervised Action
          </span>
        </div>

        <p className="text-[11.5px] text-slate-300 leading-relaxed font-sans">
          {thought || details.description || 'The background agent has synthesized synthesizable VHDL. Please confirm to apply changes to active workspace.'}
        </p>

        {details.vhdl_code && renderCodeBlock(details.vhdl_code, 'vhdl', 'perm_code')}

        {permissionState === 'pending' ? (
          <div className="flex items-center space-x-2 pt-1">
            <button
              onClick={() => {
                setPermissionState('approved');
                if (details.vhdl_code && onApplyDesignToCanvas) {
                  onApplyDesignToCanvas(details.vhdl_code, details.circuit_name || circuitName, details.file_path || (action && action.file_path));
                }
                onPermissionDecision?.(true, details);
              }}
              className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-[11px] flex items-center justify-center space-x-1.5 shadow-lg active:scale-95 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve & Apply to Workspace</span>
            </button>
            <button
              onClick={() => {
                setPermissionState('rejected');
                onPermissionDecision?.(false, details);
              }}
              className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-[11px] transition cursor-pointer"
            >
              Reject / Modify
            </button>
          </div>
        ) : permissionState === 'approved' ? (
          <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-[11px] font-mono flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>✓ Approved by Human Co-Pilot · Applied to workspace</span>
          </div>
        ) : (
          <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-600/70 text-rose-300 text-[11px] font-mono flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>✕ Rejected by Human Co-Pilot · Agent will revise approach</span>
          </div>
        )}
      </div>
    );
  }

  // ── Special Card 3: Milestone Progress ────────────────────────────────────
  if (details?.type === 'milestone') {
    const isSuccess = details.status === 'completed' || details.status === 'success';
    const isRunning = details.status === 'running';
    return (
      <div className={`rounded-xl border p-3 shadow-md space-y-2 font-sans text-xs ${
        isSuccess
          ? 'bg-emerald-950/20 border-emerald-800/60'
          : isRunning
          ? 'bg-indigo-950/20 border-indigo-800/60'
          : 'bg-slate-900/80 border-slate-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isSuccess ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : isRunning ? (
              <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
            ) : (
              <Zap className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-[11px] font-bold text-slate-100 font-mono uppercase tracking-wide">
              {details.phaseTitle || 'Engineering Milestone'}
            </span>
          </div>
          <span className={`px-2 py-0.2 rounded-full text-[9px] font-mono font-bold ${
            isSuccess ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-indigo-950 text-indigo-300 border border-indigo-700'
          }`}>
            {details.status || 'Active'}
          </span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{thought}</p>
        {details.metrics && (
          <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[10px] font-mono flex items-center justify-between text-slate-400">
            {Object.entries(details.metrics).map(([k, v]) => (
              <div key={k} className="flex items-center space-x-1">
                <span className="text-slate-500">{k}:</span>
                <span className="text-teal-300 font-bold">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Case A: Message contains HTML <details><summary> tags
  if (hasDetailsTags) {
    const detailsBlocks: ParsedSection[] = [];
    let preamble = '';
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let sIdx = 0;

    detailsRegex.lastIndex = 0;
    while ((m = detailsRegex.exec(thought)) !== null) {
      if (m.index > lastIdx && detailsBlocks.length === 0) {
        preamble = thought.slice(lastIdx, m.index).trim();
      }
      const rawTitle = m[1].replace(/<[^>]*>/g, '').trim();
      const content = m[2].trim();
      detailsBlocks.push({
        id: `details_${sIdx}`,
        title: rawTitle || `Section ${sIdx + 1}`,
        content,
        category: categorizeTitle(rawTitle),
      });
      lastIdx = m.index + m[0].length;
      sIdx++;
    }

    return (
      <div className="space-y-2">
        {preamble && (
          <div className="text-slate-300 text-[11px] font-sans leading-relaxed">
            {renderFormattedText(preamble, 'pre')}
          </div>
        )}

        {/* Render Collapsible Dropdown Cards */}
        <div className="space-y-1.5">
          {detailsBlocks.map((sec) => {
            const isOpen = openSections[sec.id] ?? true;
            const isDrc = sec.category === 'drc';
            const isPhysics = sec.category === 'physics';
            const isCode = sec.category === 'code';

            return (
              <div
                key={sec.id}
                className={`rounded-xl border transition overflow-hidden ${
                  isDrc
                    ? 'bg-rose-950/20 border-rose-800/60 shadow-sm'
                    : isPhysics
                    ? 'bg-amber-950/20 border-amber-800/60 shadow-sm'
                    : isCode
                    ? 'bg-cyan-950/20 border-cyan-700/60 shadow-sm'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  onClick={() => toggleSection(sec.id)}
                  className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition select-none"
                >
                  <div className="flex items-center space-x-2">
                    {isDrc ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    ) : isPhysics ? (
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                    ) : isCode ? (
                      <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    <span className="text-[11px] font-bold text-slate-200">{sec.title}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isDrc && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-700 text-rose-300 text-[9px] font-bold font-mono">
                        DRC HAZARD
                      </span>
                    )}
                    {isPhysics && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 text-[9px] font-bold font-mono">
                        PHYSICAL CONSEQUENCE
                      </span>
                    )}
                    {isCode && (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-700 text-cyan-300 text-[9px] font-bold font-mono">
                        RTL CODE
                      </span>
                    )}
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 space-y-2 text-[11px]">
                    {renderFormattedText(sec.content, sec.id)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Case B: Message has multiple markdown headings (### Section)
  if (hasMarkdownHeadings) {
    const rawSections = thought.split(/(?=^###\s+)/gm);
    const sections: ParsedSection[] = [];
    let preamble = '';

    rawSections.forEach((secStr, idx) => {
      const match = secStr.match(/^###\s+([^\r\n]+)(?:\r?\n([\s\S]*))?$/);
      if (match) {
        const title = match[1].trim();
        const content = (match[2] || '').trim();
        sections.push({
          id: `sec_${idx}`,
          title,
          content,
          category: categorizeTitle(title),
        });
      } else if (idx === 0) {
        preamble = secStr.trim();
      }
    });

    return (
      <div className="space-y-2">
        {preamble && (
          <div className="text-slate-300 text-[11px] font-sans leading-relaxed">
            {renderFormattedText(preamble, 'pre_md')}
          </div>
        )}

        <div className="space-y-1.5">
          {sections.map((sec, idx) => {
            const isOpen = openSections[sec.id] ?? (idx === 0 || sec.category === 'drc' || sec.category === 'code');
            const isDrc = sec.category === 'drc';
            const isPhysics = sec.category === 'physics';
            const isCode = sec.category === 'code';

            return (
              <div
                key={sec.id}
                className={`rounded-xl border transition overflow-hidden ${
                  isDrc
                    ? 'bg-rose-950/20 border-rose-800/60 shadow-sm'
                    : isPhysics
                    ? 'bg-amber-950/20 border-amber-800/60 shadow-sm'
                    : isCode
                    ? 'bg-cyan-950/20 border-cyan-700/60 shadow-sm'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  onClick={() => toggleSection(sec.id)}
                  className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition select-none"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    {isDrc ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                    ) : isPhysics ? (
                      <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    ) : isCode ? (
                      <Code2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    )}
                    <span className="text-[11px] font-bold text-slate-200 truncate">{sec.title}</span>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {isDrc && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-700 text-rose-300 text-[9px] font-bold font-mono">
                        DRC HAZARD
                      </span>
                    )}
                    {isCode && (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-700 text-cyan-300 text-[9px] font-bold font-mono">
                        RTL
                      </span>
                    )}
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 space-y-2 text-[11px]">
                    {renderFormattedText(sec.content, sec.id)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Case C: Standard message with collapsible long-body or code block
  return (
    <div className="space-y-2">
      <div className="text-[11px] leading-relaxed">
        {renderFormattedText(thought, 'main')}
      </div>

      {/* Collapsible Details / Metadata */}
      {details && Object.keys(details).length > 0 && !details.model && (
        <div className="mt-2 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
          <div
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            className="px-3 py-1.5 bg-slate-900/80 flex items-center justify-between cursor-pointer text-[10px] font-mono text-slate-400 hover:text-slate-200 transition"
          >
            <div className="flex items-center space-x-1.5">
              <Terminal className="w-3 h-3 text-cyan-400" />
              <span>Tool Execution Metadata ({Object.keys(details).length} parameters)</span>
            </div>
            {isDetailsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>
          {isDetailsOpen && (
            <pre className="p-2 text-[9.5px] font-mono text-slate-400 overflow-x-auto max-h-40 border-t border-slate-800/80">
              {JSON.stringify(details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
