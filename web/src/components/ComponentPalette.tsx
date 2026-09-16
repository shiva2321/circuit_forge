import React, { useState } from 'react';
import {
  Cpu,
  Plus,
  Zap,
  ToggleLeft,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Search,
  Hash,
  Activity,
  X,
} from 'lucide-react';
import { NetlistNode, PortDef } from '../types/circuit';

export interface ComponentBlueprint {
  type: string;
  category: 'logic' | 'arithmetic' | 'routing' | 'sequential' | 'io';
  name: string;
  desc: string;
  scale: number;
  width: number;
  height: number;
  inputs: PortDef[];
  outputs: PortDef[];
}

export const COMPONENT_BLUEPRINTS: ComponentBlueprint[] = [
  // 1. Logic Gates
  {
    type: 'AND',
    category: 'logic',
    name: 'AND Gate',
    desc: '2-Input Logic AND (Y = A · B)',
    scale: 1,
    width: 140,
    height: 80,
    inputs: [
      { id: 'in_0', name: 'A', direction: 'in', width: 1 },
      { id: 'in_1', name: 'B', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_0', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'OR',
    category: 'logic',
    name: 'OR Gate',
    desc: '2-Input Logic OR (Y = A + B)',
    scale: 1,
    width: 140,
    height: 80,
    inputs: [
      { id: 'in_0', name: 'A', direction: 'in', width: 1 },
      { id: 'in_1', name: 'B', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_0', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'XOR',
    category: 'logic',
    name: 'XOR Gate',
    desc: '2-Input Exclusive OR (Y = A ⊕ B)',
    scale: 1,
    width: 140,
    height: 80,
    inputs: [
      { id: 'in_0', name: 'A', direction: 'in', width: 1 },
      { id: 'in_1', name: 'B', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_0', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'NOT',
    category: 'logic',
    name: 'NOT Gate',
    desc: 'Logic Inverter (Y = ¬A)',
    scale: 1,
    width: 120,
    height: 60,
    inputs: [{ id: 'in_0', name: 'A', direction: 'in', width: 1 }],
    outputs: [{ id: 'out_0', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'NAND',
    category: 'logic',
    name: 'NAND Gate',
    desc: '2-Input Inverted AND (Y = ¬(A · B))',
    scale: 1,
    width: 140,
    height: 80,
    inputs: [
      { id: 'in_0', name: 'A', direction: 'in', width: 1 },
      { id: 'in_1', name: 'B', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_0', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'NOR',
    category: 'logic',
    name: 'NOR Gate',
    desc: '2-Input Inverted OR (Y = ¬(A + B))',
    scale: 1,
    width: 140,
    height: 80,
    inputs: [
      { id: 'in_0', name: 'A', direction: 'in', width: 1 },
      { id: 'in_1', name: 'B', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_0', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'XNOR',
    category: 'logic',
    name: 'XNOR Gate',
    desc: '2-Input Inverted XOR (Y = ¬(A ⊕ B))',
    scale: 1,
    width: 140,
    height: 80,
    inputs: [
      { id: 'in_0', name: 'A', direction: 'in', width: 1 },
      { id: 'in_1', name: 'B', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_0', name: 'Y', direction: 'out', width: 1 }],
  },

  // 2. Arithmetic & Data Processing
  {
    type: 'ADDER',
    category: 'arithmetic',
    name: '1-Bit Full Adder',
    desc: 'Full Adder cell (Sum = A ⊕ B ⊕ Cin)',
    scale: 1,
    width: 160,
    height: 100,
    inputs: [
      { id: 'in_a', name: 'A', direction: 'in', width: 1 },
      { id: 'in_b', name: 'B', direction: 'in', width: 1 },
      { id: 'in_cin', name: 'Cin', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_sum', name: 'Sum', direction: 'out', width: 1 },
      { id: 'out_cout', name: 'Cout', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'HALF_ADDER',
    category: 'arithmetic',
    name: 'Half Adder',
    desc: 'Half Adder cell (Sum = A ⊕ B, Carry = A · B)',
    scale: 1,
    width: 140,
    height: 80,
    inputs: [
      { id: 'in_a', name: 'A', direction: 'in', width: 1 },
      { id: 'in_b', name: 'B', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_sum', name: 'Sum', direction: 'out', width: 1 },
      { id: 'out_c', name: 'Carry', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'ALU',
    category: 'arithmetic',
    name: '32-Bit ALU Subsystem',
    desc: 'Multi-function ALU (ADD, SUB, AND, OR, SLT, XOR)',
    scale: 3,
    width: 240,
    height: 140,
    inputs: [
      { id: 'in_a', name: 'A', direction: 'in', width: 32 },
      { id: 'in_b', name: 'B', direction: 'in', width: 32 },
      { id: 'in_ctrl', name: 'ALUControl', direction: 'in', width: 4 },
    ],
    outputs: [
      { id: 'out_res', name: 'Result', direction: 'out', width: 32 },
      { id: 'out_zero', name: 'Zero', direction: 'out', width: 1 },
      { id: 'out_ovf', name: 'Overflow', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'COMPARATOR',
    category: 'arithmetic',
    name: '8-Bit Magnitude Comparator',
    desc: 'Compares A and B (EQ, GT, LT)',
    scale: 2,
    width: 180,
    height: 100,
    inputs: [
      { id: 'in_a', name: 'A', direction: 'in', width: 8 },
      { id: 'in_b', name: 'B', direction: 'in', width: 8 },
    ],
    outputs: [
      { id: 'out_eq', name: 'EQ', direction: 'out', width: 1 },
      { id: 'out_gt', name: 'GT', direction: 'out', width: 1 },
      { id: 'out_lt', name: 'LT', direction: 'out', width: 1 },
    ],
  },

  // 3. Routing & Multiplexing
  {
    type: 'MUX',
    category: 'routing',
    name: '2:1 Multiplexer',
    desc: 'Selects between 2 inputs based on Sel',
    scale: 1,
    width: 140,
    height: 90,
    inputs: [
      { id: 'in_0', name: 'D0', direction: 'in', width: 1 },
      { id: 'in_1', name: 'D1', direction: 'in', width: 1 },
      { id: 'in_sel', name: 'Sel', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_y', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'MUX4',
    category: 'routing',
    name: '4:1 Multiplexer',
    desc: 'Selects between 4 inputs via 2-bit Sel',
    scale: 2,
    width: 160,
    height: 120,
    inputs: [
      { id: 'in_0', name: 'D0', direction: 'in', width: 1 },
      { id: 'in_1', name: 'D1', direction: 'in', width: 1 },
      { id: 'in_2', name: 'D2', direction: 'in', width: 1 },
      { id: 'in_3', name: 'D3', direction: 'in', width: 1 },
      { id: 'in_sel', name: 'Sel', direction: 'in', width: 2 },
    ],
    outputs: [{ id: 'out_y', name: 'Y', direction: 'out', width: 1 }],
  },

  // 4. Sequential & Clocks
  {
    type: 'DFF',
    category: 'sequential',
    name: 'D Flip-Flop',
    desc: 'Rising-edge triggered flip-flop with async reset',
    scale: 1,
    width: 140,
    height: 90,
    inputs: [
      { id: 'in_d', name: 'D', direction: 'in', width: 1 },
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_q', name: 'Q', direction: 'out', width: 1 },
      { id: 'out_qn', name: 'Q#', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'COUNTER',
    category: 'sequential',
    name: '8-Bit Synchronous Counter',
    desc: 'Up/down binary counter with terminal count',
    scale: 2,
    width: 180,
    height: 120,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
      { id: 'in_en', name: 'EN', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_cnt', name: 'count', direction: 'out', width: 8 },
      { id: 'out_tc', name: 'tc', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'REGISTER',
    category: 'sequential',
    name: '8-Bit Pipeline Register',
    desc: 'Parallel load register with clock enable',
    scale: 2,
    width: 180,
    height: 110,
    inputs: [
      { id: 'in_d', name: 'D', direction: 'in', width: 8 },
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_en', name: 'EN', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_q', name: 'Q', direction: 'out', width: 8 }],
  },
  {
    type: 'CLOCK',
    category: 'sequential',
    name: 'Clock Generator',
    desc: 'Master clock source (10ns period / 100MHz)',
    scale: 1,
    width: 130,
    height: 60,
    inputs: [],
    outputs: [{ id: 'out_clk', name: 'CLK', direction: 'out', width: 1 }],
  },

  // 5. I/O & Probes
  {
    type: 'INPUT_PIN',
    category: 'io',
    name: 'Digital Input Pin',
    desc: 'Primary circuit input source pin',
    scale: 1,
    width: 120,
    height: 50,
    inputs: [],
    outputs: [{ id: 'out_pin', name: 'IN', direction: 'out', width: 1 }],
  },
  {
    type: 'OUTPUT_PIN',
    category: 'io',
    name: 'Digital Output Pin',
    desc: 'Primary circuit output observation pin',
    scale: 1,
    width: 120,
    height: 50,
    inputs: [{ id: 'in_pin', name: 'OUT', direction: 'in', width: 1 }],
    outputs: [],
  },
  {
    type: 'PROBE',
    category: 'io',
    name: 'Logic LED Probe',
    desc: 'Visual glowing LED probe indicator',
    scale: 1,
    width: 110,
    height: 50,
    inputs: [{ id: 'in_probe', name: 'Probe', direction: 'in', width: 1 }],
    outputs: [],
  },
];

interface ComponentPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAddComponent: (blueprint: ComponentBlueprint) => void;
}

export const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  isOpen,
  onClose,
  onAddComponent,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  if (!isOpen) return null;

  const filtered = COMPONENT_BLUEPRINTS.filter((item) => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.type.toLowerCase().includes(search.toLowerCase()) ||
      item.desc.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'logic', label: 'Logic Gates' },
    { id: 'arithmetic', label: 'Arithmetic' },
    { id: 'routing', label: 'Routing / MUX' },
    { id: 'sequential', label: 'Registers & Clock' },
    { id: 'io', label: 'I/O & Probes' },
  ];

  return (
    <div className="absolute top-12 left-3 z-40 w-80 bg-slate-900/95 border border-purple-600/70 rounded-2xl shadow-2xl backdrop-blur flex flex-col max-h-[calc(100%-4rem)] animate-fade-in text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100">EDA Component Palette</h3>
            <p className="text-[10px] text-slate-400">Click to place primitive onto 20px grid</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Close Palette"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search gates, ALUs, flip-flops..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-slate-200 focus:outline-none w-full font-mono text-[11px]"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="px-2.5 py-1.5 border-b border-slate-800 flex items-center space-x-1 overflow-x-auto text-[10px]">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2 py-0.5 rounded-md whitespace-nowrap transition font-medium ${
              activeCategory === cat.id
                ? 'bg-purple-600 text-white font-semibold'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Components List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-slate-800/50">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No components matched your search.
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.type}
              className="pt-1.5 first:pt-0 flex items-center justify-between p-2 rounded-xl hover:bg-purple-950/30 hover:border-purple-800/50 border border-transparent transition group cursor-pointer"
              onClick={() => {
                onAddComponent(item);
              }}
            >
              <div className="flex items-start space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center font-mono font-bold text-[10px] text-purple-400 flex-shrink-0 group-hover:border-purple-500 transition">
                  {item.type.length > 4 ? item.type.substring(0, 3) : item.type}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-purple-300 transition">
                      {item.name}
                    </span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      S{item.scale}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.desc}</p>
                  <div className="flex items-center space-x-2 text-[9px] text-slate-500 font-mono mt-1">
                    <span>{item.inputs.length} in</span>
                    <span>•</span>
                    <span>{item.outputs.length} out</span>
                  </div>
                </div>
              </div>

              <button
                className="p-1.5 rounded-lg bg-purple-600/20 group-hover:bg-purple-600 text-purple-300 group-hover:text-white transition flex-shrink-0"
                title="Add to Canvas"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
