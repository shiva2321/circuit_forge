"""
CircuitForge Hierarchical Netlist & Visual Schematic Model
Supports multi-scale visualization from gate-level primitives (Scale 1),
to RTL building blocks (Scale 2), subsystem architectures (Scale 3),
and full system / RISC-V processor architectures (Scale 4).
"""

from dataclasses import dataclass, field, asdict
from enum import IntEnum
from typing import Dict, List, Any, Optional

class CircuitScale(IntEnum):
    GATE_LEVEL = 1        # Primitive Gates (NAND, NOR, XOR), CMOS, Transistors, D-FF
    RTL_BLOCK = 2         # Adders, MUXes, Registers, Counters, FSMs, FIFOs
    SUBSYSTEM = 3         # 32-bit ALU, Register Files, UART, SPI, Memory
    SYSTEM_SOC = 4        # RISC-V Processor Core, Pipelined Datapath, SoC

@dataclass
class PortDef:
    id: str
    name: str
    direction: str       # 'in', 'out', 'inout'
    width: int = 1
    type_name: str = 'std_logic'

@dataclass
class NetlistNode:
    id: str
    label: str
    type: str            # 'GATE', 'DFF', 'MUX', 'ADDER', 'REG', 'ALU', 'FSM', 'CUSTOM'
    scale: int = 1
    x: float = 0.0
    y: float = 0.0
    width: float = 120.0
    height: float = 80.0
    inputs: List[PortDef] = field(default_factory=list)
    outputs: List[PortDef] = field(default_factory=list)
    properties: Dict[str, Any] = field(default_factory=dict)
    has_subgraph: bool = False
    subgraph_ref: Optional[str] = None

@dataclass
class NetlistWire:
    id: str
    source_node: str
    source_port: str
    target_node: str
    target_port: str
    width: int = 1
    label: Optional[str] = None
    points: List[List[float]] = field(default_factory=list)

@dataclass
class NetlistGraph:
    name: str
    scale: int
    description: str
    primary_inputs: List[PortDef] = field(default_factory=list)
    primary_outputs: List[PortDef] = field(default_factory=list)
    nodes: List[NetlistNode] = field(default_factory=list)
    wires: List[NetlistWire] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'scale': self.scale,
            'description': self.description,
            'primary_inputs': [asdict(p) for p in self.primary_inputs],
            'primary_outputs': [asdict(p) for p in self.primary_outputs],
            'nodes': [asdict(n) for n in self.nodes],
            'wires': [asdict(w) for w in self.wires],
            'metadata': self.metadata,
        }

class NetlistCatalog:
    """Provides hierarchical netlist generators across all 4 scales."""

    @staticmethod
    def get_scale1_full_adder() -> NetlistGraph:
        g = NetlistGraph(
            name='full_adder_gate_level',
            scale=1,
            description='1-bit Full Adder built from 2 XOR gates, 2 AND gates, and 1 OR gate',
            primary_inputs=[
                PortDef('in_A', 'A', 'in', 1),
                PortDef('in_B', 'B', 'in', 1),
                PortDef('in_Cin', 'Cin', 'in', 1),
            ],
            primary_outputs=[
                PortDef('out_Sum', 'Sum', 'out', 1),
                PortDef('out_Cout', 'Cout', 'out', 1),
            ],
            nodes=[
                NetlistNode(
                    id='xor1', label='XOR1', type='GATE', scale=1, x=220, y=80, width=100, height=80,
                    inputs=[PortDef('in_0', 'A', 'in'), PortDef('in_1', 'B', 'in')],
                    outputs=[PortDef('out', 'S1', 'out')],
                    properties={'gate_type': 'XOR'}
                ),
                NetlistNode(
                    id='xor2', label='XOR2 (Sum)', type='GATE', scale=1, x=460, y=80, width=100, height=80,
                    inputs=[PortDef('in_0', 'S1', 'in'), PortDef('in_1', 'Cin', 'in')],
                    outputs=[PortDef('out', 'Sum', 'out')],
                    properties={'gate_type': 'XOR'}
                ),
                NetlistNode(
                    id='and1', label='AND1', type='GATE', scale=1, x=220, y=220, width=100, height=80,
                    inputs=[PortDef('in_0', 'A', 'in'), PortDef('in_1', 'B', 'in')],
                    outputs=[PortDef('out', 'C1', 'out')],
                    properties={'gate_type': 'AND'}
                ),
                NetlistNode(
                    id='and2', label='AND2', type='GATE', scale=1, x=460, y=220, width=100, height=80,
                    inputs=[PortDef('in_0', 'Cin', 'in'), PortDef('in_1', 'S1', 'in')],
                    outputs=[PortDef('out', 'C2', 'out')],
                    properties={'gate_type': 'AND'}
                ),
                NetlistNode(
                    id='or1', label='OR1 (Cout)', type='GATE', scale=1, x=700, y=220, width=100, height=80,
                    inputs=[PortDef('in_0', 'C1', 'in'), PortDef('in_1', 'C2', 'in')],
                    outputs=[PortDef('out', 'Cout', 'out')],
                    properties={'gate_type': 'OR'}
                ),
            ],
            wires=[
                NetlistWire('w1', 'in_A', 'A', 'xor1', 'in_0', label='A'),
                NetlistWire('w2', 'in_B', 'B', 'xor1', 'in_1', label='B'),
                NetlistWire('w3', 'xor1', 'out', 'xor2', 'in_0', label='S1'),
                NetlistWire('w4', 'in_Cin', 'Cin', 'xor2', 'in_1', label='Cin'),
                NetlistWire('w5', 'xor2', 'out', 'out_Sum', 'Sum', label='Sum'),
                NetlistWire('w6', 'in_A', 'A', 'and1', 'in_0', label='A'),
                NetlistWire('w7', 'in_B', 'B', 'and1', 'in_1', label='B'),
                NetlistWire('w8', 'in_Cin', 'Cin', 'and2', 'in_0', label='Cin'),
                NetlistWire('w9', 'xor1', 'out', 'and2', 'in_1', label='S1'),
                NetlistWire('w10', 'and1', 'out', 'or1', 'in_0', label='C1'),
                NetlistWire('w11', 'and2', 'out', 'or1', 'in_1', label='C2'),
                NetlistWire('w12', 'or1', 'out', 'out_Cout', 'Cout', label='Cout'),
            ],
            metadata={'transistor_count': 28, 'critical_path_gates': 3}
        )
        return g

    @staticmethod
    def get_scale2_counter() -> NetlistGraph:
        g = NetlistGraph(
            name='counter_8bit_updown',
            scale=2,
            description='8-bit Synchronous Up/Down Counter with Load, Enable, and Terminal Count',
            primary_inputs=[
                PortDef('in_clk', 'clk', 'in', 1),
                PortDef('in_rst', 'rst', 'in', 1),
                PortDef('in_load', 'load', 'in', 1),
                PortDef('in_up_down', 'up_down', 'in', 1),
                PortDef('in_d_in', 'd_in', 'in', 8),
            ],
            primary_outputs=[
                PortDef('out_q', 'q', 'out', 8),
                PortDef('out_tc', 'tc', 'out', 1),
            ],
            nodes=[
                NetlistNode(
                    id='mux_next', label='Next State MUX', type='MUX', scale=2, x=220, y=80, width=180, height=140,
                    inputs=[
                        PortDef('in_hold', 'hold', 'in', 8),
                        PortDef('in_inc', 'inc', 'in', 8),
                        PortDef('in_dec', 'dec', 'in', 8),
                        PortDef('in_load_val', 'load_val', 'in', 8),
                        PortDef('sel', 'ctrl', 'in', 2),
                    ],
                    outputs=[PortDef('out_next', 'd_next', 'out', 8)],
                ),
                NetlistNode(
                    id='reg_state', label='8-bit State Register', type='REG', scale=2, x=480, y=80, width=180, height=120,
                    inputs=[
                        PortDef('d', 'd', 'in', 8),
                        PortDef('clk', 'clk', 'in', 1),
                        PortDef('rst', 'rst', 'in', 1),
                    ],
                    outputs=[PortDef('q', 'q_out', 'out', 8)],
                    has_subgraph=True,
                    subgraph_ref='scale1_reg8'
                ),
                NetlistNode(
                    id='inc_block', label='+1 Adder', type='ADDER', scale=2, x=220, y=260, width=180, height=80,
                    inputs=[PortDef('a', 'q', 'in', 8)],
                    outputs=[PortDef('out', 'q_plus_1', 'out', 8)],
                    has_subgraph=True,
                    subgraph_ref='full_adder_gate_level'
                ),
                NetlistNode(
                    id='dec_block', label='-1 Subtractor', type='ADDER', scale=2, x=220, y=380, width=180, height=80,
                    inputs=[PortDef('a', 'q', 'in', 8)],
                    outputs=[PortDef('out', 'q_minus_1', 'out', 8)],
                ),
                NetlistNode(
                    id='tc_detect', label='Terminal Count Detector', type='GATE', scale=2, x=740, y=80, width=220, height=100,
                    inputs=[PortDef('q', 'q_val', 'in', 8), PortDef('up_down', 'dir', 'in', 1)],
                    outputs=[PortDef('tc', 'tc', 'out', 1)],
                ),
            ],
            wires=[
                NetlistWire('w1', 'in_d_in', 'd_in', 'mux_next', 'in_load_val', width=8, label='d_in[7:0]'),
                NetlistWire('w2', 'in_load', 'load', 'mux_next', 'sel', width=1, label='load'),
                NetlistWire('w3', 'reg_state', 'q', 'mux_next', 'in_hold', width=8, label='hold[7:0]'),
                NetlistWire('w4', 'mux_next', 'out_next', 'reg_state', 'd', width=8, label='next_q[7:0]'),
                NetlistWire('w5', 'in_clk', 'clk', 'reg_state', 'clk', width=1, label='clk'),
                NetlistWire('w6', 'in_rst', 'rst', 'reg_state', 'rst', width=1, label='rst'),
                NetlistWire('w7', 'reg_state', 'q', 'out_q', 'q', width=8, label='q[7:0]'),
                NetlistWire('w8', 'reg_state', 'q', 'inc_block', 'a', width=8, label='q[7:0]'),
                NetlistWire('w9', 'reg_state', 'q', 'dec_block', 'a', width=8, label='q[7:0]'),
                NetlistWire('w10', 'inc_block', 'out', 'mux_next', 'in_inc', width=8, label='q+1'),
                NetlistWire('w11', 'dec_block', 'out', 'mux_next', 'in_dec', width=8, label='q-1'),
                NetlistWire('w12', 'reg_state', 'q', 'tc_detect', 'q', width=8, label='q[7:0]'),
                NetlistWire('w13', 'in_up_down', 'up_down', 'tc_detect', 'up_down', width=1, label='dir'),
                NetlistWire('w14', 'tc_detect', 'tc', 'out_tc', 'tc', width=1, label='tc'),
            ],
            metadata={'flip_flop_count': 8, 'gate_count': 94}
        )
        return g

    @staticmethod
    def get_scale3_alu_subsystem() -> NetlistGraph:
        g = NetlistGraph(
            name='alu_32bit_subsystem',
            scale=3,
            description='32-bit Multi-Function ALU with Arithmetic, Logical, Shift operations and Status Flags (Z, N, C, V)',
            primary_inputs=[
                PortDef('in_A', 'A', 'in', 32),
                PortDef('in_B', 'B', 'in', 32),
                PortDef('in_ALUControl', 'ALUControl', 'in', 4),
            ],
            primary_outputs=[
                PortDef('out_Result', 'Result', 'out', 32),
                PortDef('out_Zero', 'Zero', 'out', 1),
                PortDef('out_Negative', 'Negative', 'out', 1),
                PortDef('out_CarryOut', 'CarryOut', 'out', 1),
                PortDef('out_Overflow', 'Overflow', 'out', 1),
            ],
            nodes=[
                NetlistNode(
                    id='adder_sub_32', label='32-bit Adder/Subtractor', type='ADDER', scale=2, x=220, y=60, width=240, height=100,
                    inputs=[PortDef('a', 'A', 'in', 32), PortDef('b', 'B', 'in', 32), PortDef('sub', 'sub_en', 'in', 1)],
                    outputs=[PortDef('sum', 'Sum', 'out', 32), PortDef('cout', 'Cout', 'out', 1), PortDef('ovf', 'Ovf', 'out', 1)],
                    has_subgraph=True,
                    subgraph_ref='scale2_cla_adder32'
                ),
                NetlistNode(
                    id='logic_unit_32', label='Bitwise Logic Unit (AND/OR/XOR/NOR)', type='CUSTOM', scale=2, x=220, y=180, width=260, height=100,
                    inputs=[PortDef('a', 'A', 'in', 32), PortDef('b', 'B', 'in', 32), PortDef('sel', 'logic_sel', 'in', 2)],
                    outputs=[PortDef('logic_out', 'L_Out', 'out', 32)],
                ),
                NetlistNode(
                    id='barrel_shifter', label='32-bit Barrel Shifter (SLL/SRL/SRA)', type='CUSTOM', scale=2, x=220, y=300, width=260, height=100,
                    inputs=[PortDef('d', 'A', 'in', 32), PortDef('shamt', 'B[4:0]', 'in', 5), PortDef('dir', 'mode', 'in', 2)],
                    outputs=[PortDef('shift_out', 'S_Out', 'out', 32)],
                ),
                NetlistNode(
                    id='slt_unit', label='Set Less Than (SLT / SLTU)', type='CUSTOM', scale=2, x=220, y=420, width=240, height=100,
                    inputs=[PortDef('sum_sign', 'Sum[31]', 'in', 1), PortDef('ovf', 'Ovf', 'in', 1), PortDef('cout', 'Cout', 'in', 1)],
                    outputs=[PortDef('slt_out', 'SLT', 'out', 32)],
                ),
                NetlistNode(
                    id='mux_result', label='Result Multiplexer (8-to-1)', type='MUX', scale=2, x=540, y=180, width=180, height=160,
                    inputs=[
                        PortDef('in_add', 'AddSub', 'in', 32),
                        PortDef('in_logic', 'Logic', 'in', 32),
                        PortDef('in_shift', 'Shift', 'in', 32),
                        PortDef('in_slt', 'SLT', 'in', 32),
                        PortDef('ctrl', 'ALUControl', 'in', 4),
                    ],
                    outputs=[PortDef('res', 'Result', 'out', 32)],
                ),
                NetlistNode(
                    id='flags_detector', label='Status Flags Unit (Z, N, C, V)', type='CUSTOM', scale=2, x=780, y=80, width=240, height=140,
                    inputs=[PortDef('res', 'Result', 'in', 32), PortDef('cout', 'Cout', 'in', 1), PortDef('ovf', 'Ovf', 'in', 1)],
                    outputs=[
                        PortDef('z', 'Zero', 'out', 1),
                        PortDef('n', 'Negative', 'out', 1),
                        PortDef('c', 'Carry', 'out', 1),
                        PortDef('v', 'Overflow', 'out', 1),
                    ],
                ),
            ],
            wires=[
                NetlistWire('w1', 'in_A', 'A', 'adder_sub_32', 'a', width=32, label='A[31:0]'),
                NetlistWire('w2', 'in_B', 'B', 'adder_sub_32', 'b', width=32, label='B[31:0]'),
                NetlistWire('w3', 'in_ALUControl', 'ALUControl', 'adder_sub_32', 'sub', width=1, label='sub_en'),
                NetlistWire('w4', 'in_A', 'A', 'logic_unit_32', 'a', width=32, label='A[31:0]'),
                NetlistWire('w5', 'in_B', 'B', 'logic_unit_32', 'b', width=32, label='B[31:0]'),
                NetlistWire('w6', 'in_ALUControl', 'ALUControl', 'logic_unit_32', 'sel', width=2, label='logic_sel'),
                NetlistWire('w7', 'in_A', 'A', 'barrel_shifter', 'd', width=32, label='A[31:0]'),
                NetlistWire('w8', 'in_B', 'B', 'barrel_shifter', 'shamt', width=5, label='B[4:0]'),
                NetlistWire('w9', 'in_ALUControl', 'ALUControl', 'barrel_shifter', 'dir', width=2, label='shift_mode'),
                NetlistWire('w10', 'adder_sub_32', 'sum', 'slt_unit', 'sum_sign', width=1, label='Sum[31]'),
                NetlistWire('w11', 'adder_sub_32', 'ovf', 'slt_unit', 'ovf', width=1, label='Ovf'),
                NetlistWire('w12', 'adder_sub_32', 'cout', 'slt_unit', 'cout', width=1, label='Cout'),
                NetlistWire('w13', 'adder_sub_32', 'sum', 'mux_result', 'in_add', width=32, label='AddSub[31:0]'),
                NetlistWire('w14', 'logic_unit_32', 'logic_out', 'mux_result', 'in_logic', width=32, label='Logic[31:0]'),
                NetlistWire('w15', 'barrel_shifter', 'shift_out', 'mux_result', 'in_shift', width=32, label='Shift[31:0]'),
                NetlistWire('w16', 'slt_unit', 'slt_out', 'mux_result', 'in_slt', width=32, label='SLT[31:0]'),
                NetlistWire('w17', 'in_ALUControl', 'ALUControl', 'mux_result', 'ctrl', width=4, label='ALUCtrl[3:0]'),
                NetlistWire('w18', 'mux_result', 'res', 'out_Result', 'Result', width=32, label='Result[31:0]'),
                NetlistWire('w19', 'mux_result', 'res', 'flags_detector', 'res', width=32, label='Result[31:0]'),
                NetlistWire('w20', 'adder_sub_32', 'cout', 'flags_detector', 'cout', width=1, label='Cout'),
                NetlistWire('w21', 'adder_sub_32', 'ovf', 'flags_detector', 'ovf', width=1, label='Ovf'),
                NetlistWire('w22', 'flags_detector', 'z', 'out_Zero', 'Zero', width=1, label='Zero'),
                NetlistWire('w23', 'flags_detector', 'n', 'out_Negative', 'Negative', width=1, label='Neg'),
                NetlistWire('w24', 'flags_detector', 'c', 'out_CarryOut', 'CarryOut', width=1, label='Carry'),
                NetlistWire('w25', 'flags_detector', 'v', 'out_Overflow', 'Overflow', width=1, label='Ovf'),
            ],
            metadata={'total_gate_equivalent': 820, 'supported_ops': ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'NOR', 'SLL', 'SRL', 'SRA', 'SLT', 'SLTU']}
        )
        return g

    @staticmethod
    def get_scale4_riscv_pipeline() -> NetlistGraph:
        g = NetlistGraph(
            name='riscv_rv32i_core',
            scale=4,
            description='Complete 32-bit RISC-V RV32I Processor Core with 5-Stage Pipeline (IF, ID, EX, MEM, WB)',
            primary_inputs=[
                PortDef('in_clk', 'clk', 'in', 1),
                PortDef('in_rst', 'rst', 'in', 1),
                PortDef('in_instr_rdata', 'instr_rdata', 'in', 32),
                PortDef('in_data_rdata', 'data_rdata', 'in', 32),
            ],
            primary_outputs=[
                PortDef('out_pc', 'pc', 'out', 32),
                PortDef('out_data_addr', 'data_addr', 'out', 32),
                PortDef('out_data_wdata', 'data_wdata', 'out', 32),
                PortDef('out_data_wen', 'data_wen', 'out', 1),
            ],
            nodes=[
                NetlistNode(
                    id='stage_if', label='IF: Program Counter & Fetch', type='CUSTOM', scale=3, x=220, y=80, width=140, height=120,
                    inputs=[PortDef('clk', 'clk', 'in', 1), PortDef('rst', 'rst', 'in', 1), PortDef('pc_next', 'next_pc', 'in', 32)],
                    outputs=[PortDef('pc', 'pc', 'out', 32), PortDef('pc_plus_4', 'pc+4', 'out', 32)],
                ),
                NetlistNode(
                    id='pipe_if_id', label='IF/ID Register', type='REG', scale=2, x=380, y=80, width=40, height=120,
                    inputs=[PortDef('in_pc', 'pc', 'in', 32), PortDef('in_instr', 'instr', 'in', 32)],
                    outputs=[PortDef('out_pc', 'pc', 'out', 32), PortDef('out_instr', 'instr', 'out', 32)],
                ),
                NetlistNode(
                    id='stage_id', label='ID: Decode & 32x32 RegFile', type='CUSTOM', scale=3, x=440, y=80, width=160, height=160,
                    inputs=[
                        PortDef('clk', 'clk', 'in', 1),
                        PortDef('instr', 'instr', 'in', 32),
                        PortDef('wb_addr', 'wb_rd', 'in', 5),
                        PortDef('wb_data', 'wb_data', 'in', 32),
                        PortDef('wb_en', 'wb_en', 'in', 1),
                    ],
                    outputs=[
                        PortDef('rs1_data', 'rs1_data', 'out', 32),
                        PortDef('rs2_data', 'rs2_data', 'out', 32),
                        PortDef('imm', 'imm_ext', 'out', 32),
                        PortDef('alu_op', 'alu_op', 'out', 4),
                    ],
                    has_subgraph=True,
                    subgraph_ref='scale3_regfile32'
                ),
                NetlistNode(
                    id='pipe_id_ex', label='ID/EX Register', type='REG', scale=2, x=620, y=80, width=40, height=160,
                    inputs=[PortDef('rs1', 'rs1', 'in', 32), PortDef('rs2', 'rs2', 'in', 32), PortDef('imm', 'imm', 'in', 32)],
                    outputs=[PortDef('rs1_ex', 'rs1', 'out', 32), PortDef('rs2_ex', 'rs2', 'out', 32), PortDef('imm_ex', 'imm', 'out', 32)],
                ),
                NetlistNode(
                    id='stage_ex_alu', label='EX: 32-bit ALU & Branch Unit', type='ALU', scale=3, x=680, y=80, width=160, height=160,
                    inputs=[
                        PortDef('op_a', 'SrcA', 'in', 32),
                        PortDef('op_b', 'SrcB', 'in', 32),
                        PortDef('alu_ctrl', 'ALUCtrl', 'in', 4),
                    ],
                    outputs=[PortDef('alu_res', 'ALUResult', 'out', 32), PortDef('zero', 'Zero', 'out', 1), PortDef('branch_target', 'target', 'out', 32)],
                    has_subgraph=True,
                    subgraph_ref='alu_32bit_subsystem'
                ),
                NetlistNode(
                    id='pipe_ex_mem', label='EX/MEM Register', type='REG', scale=2, x=860, y=80, width=40, height=160,
                    inputs=[PortDef('res', 'res', 'in', 32), PortDef('wdata', 'wdata', 'in', 32)],
                    outputs=[PortDef('res_mem', 'res', 'out', 32), PortDef('wdata_mem', 'wdata', 'out', 32)],
                ),
                NetlistNode(
                    id='stage_mem', label='MEM: Data Memory Interface', type='CUSTOM', scale=3, x=920, y=80, width=140, height=140,
                    inputs=[PortDef('addr', 'addr', 'in', 32), PortDef('wdata', 'wdata', 'in', 32), PortDef('mem_read', 'r_en', 'in', 1)],
                    outputs=[PortDef('rdata', 'ReadData', 'out', 32), PortDef('bypass', 'ALUOut', 'out', 32), PortDef('mem_wen', 'w_en', 'out', 1)],
                ),
                NetlistNode(
                    id='pipe_mem_wb', label='MEM/WB Register', type='REG', scale=2, x=1080, y=80, width=40, height=140,
                    inputs=[PortDef('rdata', 'rdata', 'in', 32), PortDef('alu_res', 'alu_res', 'in', 32)],
                    outputs=[PortDef('rdata_wb', 'rdata', 'out', 32), PortDef('alu_wb', 'alu_res', 'out', 32)],
                ),
                NetlistNode(
                    id='stage_wb_mux', label='WB: Result Selection MUX', type='MUX', scale=2, x=920, y=280, width=140, height=100,
                    inputs=[PortDef('mem_val', 'ReadData', 'in', 32), PortDef('alu_val', 'ALUResult', 'in', 32), PortDef('sel', 'MemToReg', 'in', 1)],
                    outputs=[PortDef('wb_data', 'WriteBackData', 'out', 32)],
                ),
                NetlistNode(
                    id='hazard_unit', label='Hazard & Forwarding Unit', type='CUSTOM', scale=3, x=440, y=300, width=280, height=100,
                    inputs=[PortDef('rs1_id', 'rs1', 'in', 5), PortDef('rs2_id', 'rs2', 'in', 5), PortDef('rd_ex', 'rd_ex', 'in', 5), PortDef('rd_mem', 'rd_mem', 'in', 5)],
                    outputs=[PortDef('forward_a', 'FwdA', 'out', 2), PortDef('forward_b', 'FwdB', 'out', 2), PortDef('stall', 'Stall', 'out', 1)],
                ),
            ],
            wires=[
                NetlistWire('w_clk_if', 'in_clk', 'clk', 'stage_if', 'clk', width=1, label='clk'),
                NetlistWire('w_clk_id', 'in_clk', 'clk', 'stage_id', 'clk', width=1, label='clk'),
                NetlistWire('w_rst_if', 'in_rst', 'rst', 'stage_if', 'rst', width=1, label='rst'),
                NetlistWire('w_instr_in', 'in_instr_rdata', 'instr_rdata', 'pipe_if_id', 'in_instr', width=32, label='Instr[31:0]'),
                NetlistWire('w_pc_out', 'stage_if', 'pc', 'out_pc', 'pc', width=32, label='PC[31:0]'),
                NetlistWire('w_if_pipe', 'stage_if', 'pc', 'pipe_if_id', 'in_pc', width=32, label='PC'),
                NetlistWire('w_pipe_id', 'pipe_if_id', 'out_instr', 'stage_id', 'instr', width=32, label='Instr[31:0]'),
                NetlistWire('w_id_rs1', 'stage_id', 'rs1_data', 'pipe_id_ex', 'rs1', width=32, label='rs1[31:0]'),
                NetlistWire('w_id_rs2', 'stage_id', 'rs2_data', 'pipe_id_ex', 'rs2', width=32, label='rs2[31:0]'),
                NetlistWire('w_id_imm', 'stage_id', 'imm', 'pipe_id_ex', 'imm', width=32, label='imm[31:0]'),
                NetlistWire('w_id_aluop', 'stage_id', 'alu_op', 'stage_ex_alu', 'alu_ctrl', width=4, label='alu_ctrl'),
                NetlistWire('w_ex_srca', 'pipe_id_ex', 'rs1_ex', 'stage_ex_alu', 'op_a', width=32, label='SrcA[31:0]'),
                NetlistWire('w_ex_srcb', 'pipe_id_ex', 'rs2_ex', 'stage_ex_alu', 'op_b', width=32, label='SrcB[31:0]'),
                NetlistWire('w_alu_res', 'stage_ex_alu', 'alu_res', 'pipe_ex_mem', 'res', width=32, label='ALUOut[31:0]'),
                NetlistWire('w_alu_br_target', 'stage_ex_alu', 'branch_target', 'stage_if', 'pc_next', width=32, label='BranchTarget'),
                NetlistWire('w_ex_wdata', 'pipe_id_ex', 'rs2_ex', 'pipe_ex_mem', 'wdata', width=32, label='wdata[31:0]'),
                NetlistWire('w_mem_addr', 'pipe_ex_mem', 'res_mem', 'stage_mem', 'addr', width=32, label='Addr[31:0]'),
                NetlistWire('w_mem_wdata', 'pipe_ex_mem', 'wdata_mem', 'stage_mem', 'wdata', width=32, label='Data[31:0]'),
                NetlistWire('w_data_addr_out', 'pipe_ex_mem', 'res_mem', 'out_data_addr', 'data_addr', width=32, label='data_addr[31:0]'),
                NetlistWire('w_data_wdata_out', 'pipe_ex_mem', 'wdata_mem', 'out_data_wdata', 'data_wdata', width=32, label='data_wdata[31:0]'),
                NetlistWire('w_mem_wen_out', 'stage_mem', 'mem_wen', 'out_data_wen', 'data_wen', width=1, label='data_wen'),
                NetlistWire('w_data_rdata_in', 'in_data_rdata', 'data_rdata', 'stage_mem', 'rdata', width=32, label='data_rdata[31:0]'),
                NetlistWire('w_mem_pipe', 'stage_mem', 'rdata', 'pipe_mem_wb', 'rdata', width=32, label='MemData[31:0]'),
                NetlistWire('w_bypass_pipe', 'stage_mem', 'bypass', 'pipe_mem_wb', 'alu_res', width=32, label='ALUOut[31:0]'),
                NetlistWire('w_wb_mem', 'pipe_mem_wb', 'rdata_wb', 'stage_wb_mux', 'mem_val', width=32, label='MemVal[31:0]'),
                NetlistWire('w_wb_alu', 'pipe_mem_wb', 'alu_wb', 'stage_wb_mux', 'alu_val', width=32, label='ALUVal[31:0]'),
                NetlistWire('w_wb_data', 'stage_wb_mux', 'wb_data', 'stage_id', 'wb_data', width=32, label='WB_Data[31:0]'),
                NetlistWire('w_fwd_a', 'hazard_unit', 'forward_a', 'stage_ex_alu', 'op_a', width=2, label='FwdA'),
                NetlistWire('w_fwd_b', 'hazard_unit', 'forward_b', 'stage_ex_alu', 'op_b', width=2, label='FwdB'),
                NetlistWire('w_stall', 'hazard_unit', 'stall', 'stage_if', 'pc_next', width=1, label='Stall'),
            ],
            metadata={'isa': 'RV32I', 'pipeline_stages': 5, 'branch_penalty': 2, 'bypassing': True}
        )
        return g

    @staticmethod
    def get_by_name_or_scale(identifier: str) -> Optional[NetlistGraph]:
        ident = identifier.strip().lower()
        if 'riscv' in ident or 'pipeline' in ident or 'processor' in ident or 'soc' in ident or ident == '4':
            return NetlistCatalog.get_scale4_riscv_pipeline()
        elif 'alu' in ident or 'subsystem' in ident or ident == '3':
            return NetlistCatalog.get_scale3_alu_subsystem()
        elif 'counter' in ident or 'rtl' in ident or ident == '2':
            return NetlistCatalog.get_scale2_counter()
        elif 'adder' in ident or 'gate' in ident or ident == '1':
            return NetlistCatalog.get_scale1_full_adder()
        return NetlistCatalog.get_scale1_full_adder()
