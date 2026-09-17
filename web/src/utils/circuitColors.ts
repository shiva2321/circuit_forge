/**
 * CircuitForge File & Module Color Palette Engine
 * Assigns distinct deterministic shades of colors to components and nets based on their source file / module origin.
 * Enables visual hierarchy, multi-file segregation, and inheritance tracking.
 */

export interface FileColorPalette {
  name: string;
  border: string;
  bg: string;
  headerBg: string;
  badgeBg: string;
  badgeBorder: string;
  text: string;
  glow: string;
  accent: string;
}

export const FILE_PALETTES: FileColorPalette[] = [
  {
    name: 'cyan',
    border: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.09)',
    headerBg: '#083344',
    badgeBg: '#155e75',
    badgeBorder: '#0891b2',
    text: '#a5f3fc',
    glow: 'rgba(6, 182, 212, 0.45)',
    accent: '#22d3ee',
  },
  {
    name: 'emerald',
    border: '#10b981',
    bg: 'rgba(16, 185, 129, 0.09)',
    headerBg: '#064e3b',
    badgeBg: '#065f46',
    badgeBorder: '#059669',
    text: '#a7f3d0',
    glow: 'rgba(16, 185, 129, 0.45)',
    accent: '#34d399',
  },
  {
    name: 'amber',
    border: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.09)',
    headerBg: '#451a03',
    badgeBg: '#78350f',
    badgeBorder: '#d97706',
    text: '#fde68a',
    glow: 'rgba(245, 158, 11, 0.45)',
    accent: '#fbbf24',
  },
  {
    name: 'indigo',
    border: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.09)',
    headerBg: '#172554',
    badgeBg: '#1e3a8a',
    badgeBorder: '#2563eb',
    text: '#bfdbfe',
    glow: 'rgba(59, 130, 246, 0.45)',
    accent: '#60a5fa',
  },
  {
    name: 'rose',
    border: '#f43f5e',
    bg: 'rgba(244, 63, 94, 0.09)',
    headerBg: '#4c0519',
    badgeBg: '#881337',
    badgeBorder: '#e11d48',
    text: '#fecdd3',
    glow: 'rgba(244, 63, 94, 0.45)',
    accent: '#fb7185',
  },
  {
    name: 'purple',
    border: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.09)',
    headerBg: '#3b0764',
    badgeBg: '#581c87',
    badgeBorder: '#9333ea',
    text: '#e9d5ff',
    glow: 'rgba(168, 85, 247, 0.45)',
    accent: '#c084fc',
  },
];

/**
 * Standard Hardware Signal & Bus Routing Color Standards (Prism EDA)
 */
export const NET_COLORS = {
  clock: '#10b981',         // High-frequency clock signals (Emerald)
  dataBus: '#06b6d4',       // Wide data buses: 8/16/32/64-bit (Electric Cyan)
  control: '#f59e0b',       // Control words, opcodes, strobes (Solar Amber)
  resetPower: '#3b82f6',    // Active-low reset & power distribution (Cobalt Blue)
  errorConflict: '#f43f5e', // Timing slack violations & DRC hazards (Crimson Rose)
  neuralAccent: '#a855f7',  // AI co-pilot generated nets (Quantum Purple)
};

/**
 * Returns a deterministic, consistent color palette for any given source file name or module identifier.
 */
export function getFilePalette(filenameOrModule?: string): FileColorPalette {
  if (!filenameOrModule) return FILE_PALETTES[0];
  const clean = filenameOrModule.toLowerCase().trim().replace(/^(src\/|vhdl\/|rtl\/)/, '');
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return FILE_PALETTES[hash % FILE_PALETTES.length];
}

/**
 * Formats a clean human-readable file or module label from a path.
 */
export function formatFileLabel(filePathOrModule?: string): string {
  if (!filePathOrModule) return 'top.vhd';
  const parts = filePathOrModule.split(/[/\\]/);
  return parts[parts.length - 1];
}
