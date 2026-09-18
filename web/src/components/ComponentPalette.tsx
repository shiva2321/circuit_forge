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
  category:
    | 'logic'
    | 'arithmetic'
    | 'routing'
    | 'sequential'
    | 'processors'
    | 'memory'
    | 'sensors'
    | 'io'
    | 'silicon';
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
  {
    type: 'RGB_LED',
    category: 'io',
    name: 'RGB LED Indicator',
    desc: 'Tri-color Red/Green/Blue LED display element',
    scale: 1,
    width: 120,
    height: 80,
    inputs: [
      { id: 'in_r', name: 'R', direction: 'in', width: 1 },
      { id: 'in_g', name: 'G', direction: 'in', width: 1 },
      { id: 'in_b', name: 'B', direction: 'in', width: 1 },
    ],
    outputs: [],
  },
  {
    type: 'SEVEN_SEG',
    category: 'io',
    name: '7-Segment Hex Display',
    desc: 'Illuminated 7-segment hex character display module',
    scale: 1,
    width: 140,
    height: 100,
    inputs: [
      { id: 'in_hex', name: 'HexIn', direction: 'in', width: 4 },
      { id: 'in_dp', name: 'DP', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_seg', name: 'Seg', direction: 'out', width: 7 }],
  },
  {
    type: 'PUSHBUTTON',
    category: 'io',
    name: 'Tactile Pushbutton',
    desc: 'Interactive momentary manual stimulus switch',
    scale: 1,
    width: 120,
    height: 60,
    inputs: [],
    outputs: [{ id: 'out_btn', name: 'BTN', direction: 'out', width: 1 }],
  },
  {
    type: 'DIP_SWITCH_4',
    category: 'io',
    name: '4-Bit DIP Switch Bank',
    desc: 'Manual 4-position binary configuration switches',
    scale: 1,
    width: 140,
    height: 80,
    inputs: [],
    outputs: [{ id: 'out_sw', name: 'SW', direction: 'out', width: 4 }],
  },

  // 6. Processors & Compute Cores
  {
    type: 'RISCV_CORE',
    category: 'processors',
    name: 'RISC-V RV32I Core',
    desc: '32-Bit RISC-V pipelined integer execution core',
    scale: 4,
    width: 260,
    height: 180,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
      { id: 'in_instr', name: 'Instr', direction: 'in', width: 32 },
      { id: 'in_dmem', name: 'DMem_In', direction: 'in', width: 32 },
    ],
    outputs: [
      { id: 'out_pc', name: 'PC', direction: 'out', width: 32 },
      { id: 'out_daddr', name: 'DMem_Addr', direction: 'out', width: 32 },
      { id: 'out_dout', name: 'DMem_Out', direction: 'out', width: 32 },
      { id: 'out_dwe', name: 'DMem_WE', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'REG_FILE_32X32',
    category: 'processors',
    name: '32x32 Register File',
    desc: 'Dual-read single-write 32-bit register file (x0-x31)',
    scale: 3,
    width: 240,
    height: 160,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_we', name: 'WE', direction: 'in', width: 1 },
      { id: 'in_rs1', name: 'RS1_Addr', direction: 'in', width: 5 },
      { id: 'in_rs2', name: 'RS2_Addr', direction: 'in', width: 5 },
      { id: 'in_rd', name: 'RD_Addr', direction: 'in', width: 5 },
      { id: 'in_wdata', name: 'WData', direction: 'in', width: 32 },
    ],
    outputs: [
      { id: 'out_rdata1', name: 'RS1_Data', direction: 'out', width: 32 },
      { id: 'out_rdata2', name: 'RS2_Data', direction: 'out', width: 32 },
    ],
  },
  {
    type: 'PROGRAM_COUNTER',
    category: 'processors',
    name: 'Program Counter Unit',
    desc: '32-Bit Instruction Pointer with branch target adder',
    scale: 2,
    width: 200,
    height: 120,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
      { id: 'in_pc_next', name: 'PC_Next', direction: 'in', width: 32 },
      { id: 'in_stall', name: 'Stall', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_pc', name: 'PC', direction: 'out', width: 32 },
      { id: 'out_pc4', name: 'PC_Plus4', direction: 'out', width: 32 },
    ],
  },
  {
    type: 'INSTR_DECODER',
    category: 'processors',
    name: 'Instruction Decoder',
    desc: 'RV32I opcode, register and immediate field decoder',
    scale: 2,
    width: 200,
    height: 160,
    inputs: [{ id: 'in_instr', name: 'Instr', direction: 'in', width: 32 }],
    outputs: [
      { id: 'out_op', name: 'Opcode', direction: 'out', width: 7 },
      { id: 'out_rd', name: 'RD', direction: 'out', width: 5 },
      { id: 'out_f3', name: 'Funct3', direction: 'out', width: 3 },
      { id: 'out_rs1', name: 'RS1', direction: 'out', width: 5 },
      { id: 'out_rs2', name: 'RS2', direction: 'out', width: 5 },
      { id: 'out_imm', name: 'Imm', direction: 'out', width: 32 },
    ],
  },

  // 7. Memory & Storage Arrays
  {
    type: 'SRAM_BLOCK',
    category: 'memory',
    name: '256x8 SRAM Block',
    desc: 'Synchronous Single-Port Static RAM memory array',
    scale: 2,
    width: 200,
    height: 140,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_cs', name: 'CS', direction: 'in', width: 1 },
      { id: 'in_we', name: 'WE', direction: 'in', width: 1 },
      { id: 'in_addr', name: 'Addr', direction: 'in', width: 8 },
      { id: 'in_din', name: 'DIn', direction: 'in', width: 8 },
    ],
    outputs: [{ id: 'out_dout', name: 'DOut', direction: 'out', width: 8 }],
  },
  {
    type: 'BRAM_DUAL',
    category: 'memory',
    name: '1024x32 Dual-Port BRAM',
    desc: 'True Dual-Port Block RAM for multi-master CPU/DMA',
    scale: 3,
    width: 240,
    height: 180,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_we_a', name: 'WE_A', direction: 'in', width: 1 },
      { id: 'in_addr_a', name: 'Addr_A', direction: 'in', width: 10 },
      { id: 'in_din_a', name: 'DIn_A', direction: 'in', width: 32 },
      { id: 'in_we_b', name: 'WE_B', direction: 'in', width: 1 },
      { id: 'in_addr_b', name: 'Addr_B', direction: 'in', width: 10 },
      { id: 'in_din_b', name: 'DIn_B', direction: 'in', width: 32 },
    ],
    outputs: [
      { id: 'out_dout_a', name: 'DOut_A', direction: 'out', width: 32 },
      { id: 'out_dout_b', name: 'DOut_B', direction: 'out', width: 32 },
    ],
  },
  {
    type: 'ROM_STORE',
    category: 'memory',
    name: '64x32 Boot ROM',
    desc: 'Pre-programmed microcode firmware storage store',
    scale: 2,
    width: 180,
    height: 100,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_addr', name: 'Addr', direction: 'in', width: 6 },
    ],
    outputs: [{ id: 'out_data', name: 'Data', direction: 'out', width: 32 }],
  },
  {
    type: 'FIFO_BUFFER',
    category: 'memory',
    name: '16x8 Synchronous FIFO',
    desc: 'First-in First-out elastic queue with full/empty flags',
    scale: 2,
    width: 200,
    height: 140,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
      { id: 'in_wr', name: 'WR_EN', direction: 'in', width: 1 },
      { id: 'in_rd', name: 'RD_EN', direction: 'in', width: 1 },
      { id: 'in_din', name: 'DIn', direction: 'in', width: 8 },
    ],
    outputs: [
      { id: 'out_dout', name: 'DOut', direction: 'out', width: 8 },
      { id: 'out_full', name: 'Full', direction: 'out', width: 1 },
      { id: 'out_empty', name: 'Empty', direction: 'out', width: 1 },
    ],
  },

  // 8. Sensors & Mixed-Signal / Analog EDA
  {
    type: 'TEMP_SENSOR',
    category: 'sensors',
    name: 'Temperature Sensor',
    desc: 'Digital ambient temperature transducer with 8-bit digital output',
    scale: 2,
    width: 180,
    height: 100,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_sample', name: 'Sample', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_temp', name: 'Temp_C', direction: 'out', width: 8 },
      { id: 'out_rdy', name: 'Ready', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'LIGHT_SENSOR',
    category: 'sensors',
    name: 'Photodiode Sensor',
    desc: 'Light intensity sensor with dark detection alert threshold',
    scale: 2,
    width: 180,
    height: 100,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_en', name: 'EN', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_lux', name: 'Lux', direction: 'out', width: 8 },
      { id: 'out_alert', name: 'DarkAlert', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'PWM_DRIVER',
    category: 'sensors',
    name: 'PWM Motor Driver',
    desc: 'Pulse-Width Modulation power generator with 8-bit duty cycle',
    scale: 2,
    width: 180,
    height: 100,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_duty', name: 'Duty', direction: 'in', width: 8 },
      { id: 'in_en', name: 'EN', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_pwm', name: 'PWM_Out', direction: 'out', width: 1 }],
  },
  {
    type: 'ADC_8BIT',
    category: 'sensors',
    name: '8-Bit ADC Model',
    desc: 'Successive-approximation Analog-to-Digital Converter',
    scale: 2,
    width: 180,
    height: 110,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_soc', name: 'SOC', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_data', name: 'Data', direction: 'out', width: 8 },
      { id: 'out_eoc', name: 'EOC', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'DAC_8BIT',
    category: 'sensors',
    name: '8-Bit DAC Model',
    desc: 'Digital-to-Analog R-2R ladder converter model',
    scale: 2,
    width: 180,
    height: 90,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_din', name: 'DIn', direction: 'in', width: 8 },
    ],
    outputs: [{ id: 'out_aout', name: 'V_Analog', direction: 'out', width: 1 }],
  },

  // 9. Silicon Chip & ASIC Standard Cells
  {
    type: 'IO_PAD',
    category: 'silicon',
    name: 'ASIC I/O Pad Cell',
    desc: 'Bi-directional chip boundary pad with ESD clamp network',
    scale: 2,
    width: 160,
    height: 110,
    inputs: [
      { id: 'in_core', name: 'Core_In', direction: 'in', width: 1 },
      { id: 'in_oe', name: 'OE', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_core', name: 'Core_Out', direction: 'out', width: 1 },
      { id: 'out_pad', name: 'PAD', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'CLK_TREE_BUF',
    category: 'silicon',
    name: 'CTS Clock Buffer',
    desc: 'High-drive symmetrical Clock Tree Synthesis cell',
    scale: 1,
    width: 130,
    height: 60,
    inputs: [{ id: 'in_ck', name: 'CK_In', direction: 'in', width: 1 }],
    outputs: [{ id: 'out_ck', name: 'CK_Out', direction: 'out', width: 1 }],
  },
  {
    type: 'POWER_SWITCH',
    category: 'silicon',
    name: 'MTCMOS Power Switch',
    desc: 'Header power-gating switch for low-leakage silicon sleep',
    scale: 2,
    width: 160,
    height: 90,
    inputs: [{ id: 'in_sleep', name: 'Sleep', direction: 'in', width: 1 }],
    outputs: [
      { id: 'out_ack', name: 'Ack', direction: 'out', width: 1 },
      { id: 'out_pwr_ok', name: 'VDD_OK', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'JTAG_TAP',
    category: 'silicon',
    name: 'IEEE 1149.1 JTAG TAP',
    desc: 'Boundary Scan Test Access Port controller unit',
    scale: 2,
    width: 180,
    height: 140,
    inputs: [
      { id: 'in_tck', name: 'TCK', direction: 'in', width: 1 },
      { id: 'in_tms', name: 'TMS', direction: 'in', width: 1 },
      { id: 'in_tdi', name: 'TDI', direction: 'in', width: 1 },
      { id: 'in_trst', name: 'TRST', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_tdo', name: 'TDO', direction: 'out', width: 1 },
      { id: 'out_shift_dr', name: 'ShiftDR', direction: 'out', width: 1 },
    ],
  },

  // 10. Additional Logic, Arithmetic & Sequential Primitives
  {
    type: 'TRISTATE',
    category: 'logic',
    name: 'Tri-State Buffer',
    desc: 'Active-high output enable bus driver (Y = D when OE=1 else Z)',
    scale: 1,
    width: 130,
    height: 70,
    inputs: [
      { id: 'in_data', name: 'D', direction: 'in', width: 1 },
      { id: 'in_oe', name: 'OE', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_y', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'BUF',
    category: 'logic',
    name: 'Logic Buffer',
    desc: 'Non-inverting digital repeater stage (Y = A)',
    scale: 1,
    width: 120,
    height: 60,
    inputs: [{ id: 'in_a', name: 'A', direction: 'in', width: 1 }],
    outputs: [{ id: 'out_y', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'MULTIPLIER8',
    category: 'arithmetic',
    name: '8-Bit Hardware Multiplier',
    desc: 'Unsigned 8x8-bit array multiplier (Prod = A · B)',
    scale: 2,
    width: 180,
    height: 100,
    inputs: [
      { id: 'in_a', name: 'A', direction: 'in', width: 8 },
      { id: 'in_b', name: 'B', direction: 'in', width: 8 },
    ],
    outputs: [{ id: 'out_prod', name: 'Prod', direction: 'out', width: 16 }],
  },
  {
    type: 'SUBTRACTOR8',
    category: 'arithmetic',
    name: '8-Bit Subtractor',
    desc: 'Binary subtractor with borrow (Diff = A - B)',
    scale: 2,
    width: 180,
    height: 100,
    inputs: [
      { id: 'in_a', name: 'A', direction: 'in', width: 8 },
      { id: 'in_b', name: 'B', direction: 'in', width: 8 },
    ],
    outputs: [
      { id: 'out_diff', name: 'Diff', direction: 'out', width: 8 },
      { id: 'out_borrow', name: 'Borrow', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'MUX8',
    category: 'routing',
    name: '8:1 Multiplexer',
    desc: '8-Channel data selector via 3-bit Sel address',
    scale: 2,
    width: 180,
    height: 220,
    inputs: [
      { id: 'in_0', name: 'D0', direction: 'in', width: 1 },
      { id: 'in_1', name: 'D1', direction: 'in', width: 1 },
      { id: 'in_2', name: 'D2', direction: 'in', width: 1 },
      { id: 'in_3', name: 'D3', direction: 'in', width: 1 },
      { id: 'in_4', name: 'D4', direction: 'in', width: 1 },
      { id: 'in_5', name: 'D5', direction: 'in', width: 1 },
      { id: 'in_6', name: 'D6', direction: 'in', width: 1 },
      { id: 'in_7', name: 'D7', direction: 'in', width: 1 },
      { id: 'in_sel', name: 'Sel', direction: 'in', width: 3 },
    ],
    outputs: [{ id: 'out_y', name: 'Y', direction: 'out', width: 1 }],
  },
  {
    type: 'DEMUX4',
    category: 'routing',
    name: '1:4 Demultiplexer',
    desc: 'Routes single data input D to 1 of 4 outputs',
    scale: 2,
    width: 160,
    height: 140,
    inputs: [
      { id: 'in_d', name: 'D', direction: 'in', width: 1 },
      { id: 'in_sel', name: 'Sel', direction: 'in', width: 2 },
    ],
    outputs: [
      { id: 'out_0', name: 'Y0', direction: 'out', width: 1 },
      { id: 'out_1', name: 'Y1', direction: 'out', width: 1 },
      { id: 'out_2', name: 'Y2', direction: 'out', width: 1 },
      { id: 'out_3', name: 'Y3', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'DECODER_3TO8',
    category: 'routing',
    name: '3-to-8 Binary Decoder',
    desc: 'Active-high 3-bit to 8-line address decoder with enable',
    scale: 2,
    width: 180,
    height: 200,
    inputs: [
      { id: 'in_en', name: 'EN', direction: 'in', width: 1 },
      { id: 'in_sel', name: 'A', direction: 'in', width: 3 },
    ],
    outputs: [{ id: 'out_y', name: 'Y', direction: 'out', width: 8 }],
  },
  {
    type: 'TFF',
    category: 'sequential',
    name: 'Toggle Flip-Flop',
    desc: 'T Flip-Flop: inverts output when T=1 on rising clock',
    scale: 1,
    width: 140,
    height: 90,
    inputs: [
      { id: 'in_t', name: 'T', direction: 'in', width: 1 },
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_q', name: 'Q', direction: 'out', width: 1 }],
  },
  {
    type: 'JKFF',
    category: 'sequential',
    name: 'JK Flip-Flop',
    desc: 'Universal JK Flip-Flop with hold, set, reset, and toggle',
    scale: 1,
    width: 140,
    height: 100,
    inputs: [
      { id: 'in_j', name: 'J', direction: 'in', width: 1 },
      { id: 'in_k', name: 'K', direction: 'in', width: 1 },
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
    ],
    outputs: [{ id: 'out_q', name: 'Q', direction: 'out', width: 1 }],
  },
  {
    type: 'SHIFT_REG8',
    category: 'sequential',
    name: '8-Bit Shift Register',
    desc: 'Universal parallel-load & serial-shift register',
    scale: 2,
    width: 180,
    height: 140,
    inputs: [
      { id: 'in_clk', name: 'CLK', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
      { id: 'in_din', name: 'Sin', direction: 'in', width: 1 },
      { id: 'in_pin', name: 'Din', direction: 'in', width: 8 },
      { id: 'in_load', name: 'Load', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_pout', name: 'Q', direction: 'out', width: 8 },
      { id: 'out_sout', name: 'Sout', direction: 'out', width: 1 },
    ],
  },
  {
    type: 'CLK_DIVIDER',
    category: 'sequential',
    name: 'Clock Prescaler / Divider',
    desc: 'Frequency divider providing synchronous /2, /4, and /8 taps',
    scale: 1,
    width: 150,
    height: 90,
    inputs: [
      { id: 'in_clk', name: 'CLK_IN', direction: 'in', width: 1 },
      { id: 'in_rst', name: 'RST', direction: 'in', width: 1 },
    ],
    outputs: [
      { id: 'out_div2', name: 'DIV2', direction: 'out', width: 1 },
      { id: 'out_div4', name: 'DIV4', direction: 'out', width: 1 },
      { id: 'out_div8', name: 'DIV8', direction: 'out', width: 1 },
    ],
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
    { id: 'processors', label: 'Processors' },
    { id: 'memory', label: 'Memory' },
    { id: 'silicon', label: 'Silicon / ASIC' },
    { id: 'sensors', label: 'Sensors' },
    { id: 'io', label: 'I/O & Displays' },
    { id: 'sequential', label: 'Registers' },
    { id: 'logic', label: 'Logic' },
    { id: 'arithmetic', label: 'Arithmetic' },
    { id: 'routing', label: 'Routing' },
  ];

  return (
    <div className="w-80 h-[520px] max-h-[75vh] bg-slate-900/95 border border-purple-600/70 rounded-2xl shadow-2xl backdrop-blur flex flex-col text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100">EDA Component Palette</h3>
            <p className="text-[10px] text-slate-400">Click or drag primitives directly onto canvas</p>
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
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(item));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="pt-1.5 first:pt-0 flex items-center justify-between p-2 rounded-xl hover:bg-purple-950/30 hover:border-purple-800/50 border border-transparent transition group cursor-grab active:cursor-grabbing select-none"
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
