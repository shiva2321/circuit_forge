import React, { useState } from 'react';
import { Copy, Check, FileText, ExternalLink } from 'lucide-react';

interface MarkdownDocViewerProps {
  content: string;
  className?: string;
}

export const MarkdownDocViewer: React.FC<MarkdownDocViewerProps> = ({ content, className = '' }) => {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  const handleCopy = (codeText: string, idx: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCodeIndex(idx);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  const renderInline = (text: string) => {
    // Process code, bold, italic, links
    const parts = [];
    let remaining = text;
    let key = 0;

    // Match inline code `code`, bold **text**, italic *text*, links [text](url)
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    let match: RegExpExecArray | null;
    let lastIdx = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(<span key={key++}>{text.slice(lastIdx, match.index)}</span>);
      }
      const token = match[0];
      if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code key={key++} className="px-1.5 py-0.5 rounded bg-slate-800 text-teal-300 font-mono text-[11px] border border-slate-700/80">
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(<strong key={key++} className="font-bold text-slate-100">{token.slice(2, -2)}</strong>);
      } else if (token.startsWith('*') && token.endsWith('*')) {
        parts.push(<em key={key++} className="italic text-slate-300">{token.slice(1, -1)}</em>);
      } else if (token.startsWith('[') && token.includes('](')) {
        const titleMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (titleMatch) {
          parts.push(
            <a key={key++} href={titleMatch[2]} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline inline-flex items-center space-x-0.5">
              <span>{titleMatch[1]}</span>
              <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
            </a>
          );
        }
      }
      lastIdx = regex.lastIndex;
    }

    if (lastIdx < text.length) {
      parts.push(<span key={key++}>{text.slice(lastIdx)}</span>);
    }

    return parts.length > 0 ? parts : text;
  };

  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let i = 0;
  let codeBlockCounter = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced Code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const codeText = codeLines.join('\n');
      const curIndex = codeBlockCounter++;
      elements.push(
        <div key={`code-${i}`} className="my-3 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-md">
          <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="font-semibold text-teal-400 uppercase tracking-wider">{lang || 'text'}</span>
            <button
              onClick={() => handleCopy(codeText, curIndex)}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              {copiedCodeIndex === curIndex ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400 text-[10px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span className="text-[10px]">Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-3.5 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
            <code>{codeText}</code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith('|') && line.includes('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0].split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
        const dataRows = tableLines.slice(2).map(row =>
          row.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1)
        );

        elements.push(
          <div key={`table-${i}`} className="my-3 overflow-x-auto rounded-lg border border-slate-700/80 shadow-md">
            <table className="w-full text-left text-xs border-collapse bg-slate-900/60">
              <thead className="bg-slate-900 border-b border-slate-700 text-slate-200 font-mono font-bold">
                <tr>
                  {headerRow.map((h, colIdx) => (
                    <th key={colIdx} className="px-3 py-2 text-teal-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {dataRows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-800/40 transition">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-3 py-2 text-slate-300 font-sans">{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-xl font-black text-white tracking-tight mt-5 mb-2 pb-1.5 border-b border-slate-800 flex items-center space-x-2">
          <FileText className="w-5 h-5 text-teal-400 flex-shrink-0" />
          <span>{line.slice(2)}</span>
        </h1>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-base font-bold text-slate-100 tracking-tight mt-4 mb-2 pb-1 border-b border-slate-800/80">
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-sm font-semibold text-cyan-300 tracking-tight mt-3 mb-1.5">
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={i} className="text-xs font-semibold text-slate-300 uppercase tracking-wider mt-2.5 mb-1 font-mono">
          {line.slice(5)}
        </h4>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="my-2 pl-3.5 py-1 border-l-3 border-teal-500 bg-slate-900/40 text-slate-300 italic text-xs rounded-r-lg">
          {renderInline(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      elements.push(<hr key={i} className="my-4 border-slate-800" />);
      i++;
      continue;
    }

    // Checkbox task items: - [ ] or - [x]
    if (line.trim().match(/^-\s*\[([ xX])\]\s*(.*)$/)) {
      const taskMatch = line.trim().match(/^-\s*\[([ xX])\]\s*(.*)$/)!;
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      elements.push(
        <div key={i} className="flex items-start space-x-2 my-1 text-xs">
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            className="mt-0.5 rounded border-slate-700 accent-teal-500"
          />
          <span className={isChecked ? 'line-through text-slate-500 font-sans' : 'text-slate-200 font-sans'}>
            {renderInline(taskMatch[2])}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // Bullet List Item
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-xs text-slate-200 leading-relaxed font-sans my-0.5 marker:text-teal-400">
          {renderInline(line.trim().slice(2))}
        </li>
      );
      i++;
      continue;
    }

    // Numbered List Item
    if (line.trim().match(/^\d+\.\s+(.*)$/)) {
      const match = line.trim().match(/^\d+\.\s+(.*)$/)!;
      elements.push(
        <div key={i} className="ml-2 flex items-start space-x-2 text-xs text-slate-200 leading-relaxed font-sans my-0.5">
          <span className="font-mono text-cyan-400 font-bold">{line.trim().split('.')[0]}.</span>
          <span>{renderInline(match[1])}</span>
        </div>
      );
      i++;
      continue;
    }

    // Blank line
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-xs text-slate-300 leading-relaxed font-sans my-1">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return (
    <div className={`markdown-preview p-5 max-w-4xl mx-auto select-text font-sans ${className}`}>
      {elements}
    </div>
  );
};
