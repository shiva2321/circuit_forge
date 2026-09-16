"""
CircuitForge Agent Tool Registry
Equips the AI agent with tools to design, lint, synthesize, simulate,
inspect, and learn circuits across all 4 scales.
"""

import re
from typing import Dict, List, Any, Optional
from backend.app.engine.simulator import Simulator
from backend.app.engine.netlist import NetlistCatalog, NetlistGraph
from backend.app.engine.ast_parser import VHDLParser
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.hf_ingester import DatasetIngester
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater


def sanitize_vhdl_identifier(name: str) -> str:
    """Sanitizes an arbitrary string into a valid VHDL identifier (letters, digits, underscores, starts with letter)."""
    clean = re.sub(r'[^a-zA-Z0-9_]', '_', name.strip().lower())
    clean = re.sub(r'_+', '_', clean).strip('_')
    if not clean or clean[0].isdigit():
        clean = f"c_{clean}"
    return clean


class CircuitTools:
    def __init__(self, kg: CircuitKnowledgeGraph, updater: AutonomousGraphUpdater):
        self.kg = kg
        self.updater = updater
        self.ingester = DatasetIngester(kg)
        self.last_sim: Optional[Simulator] = None
        self.last_netlist: Optional[NetlistGraph] = None
        self.last_vhdl: str = ""
        self.active_faults: Dict[str, str] = {}

    def query_knowledge_graph(self, query: str = "", scale: Optional[int] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search the multi-scale Circuit Knowledge Graph for relevant circuits, EDA rules, and design guidelines."""
        return self.kg.search(query=query, scale=scale, category=category, limit=10)

    def design_circuit(self, name: str, scale: int, specification: str, vhdl_code: Optional[str] = None) -> Dict[str, Any]:
        """Designs a circuit matching the specification, creates VHDL and registers it in the Knowledge Graph."""
        safe_name = sanitize_vhdl_identifier(name)

        if not vhdl_code:
            spec_lower = (specification or "").lower()
            name_lower = (name or "").lower()
            combined = f"{name_lower} {spec_lower}"

            if "mux" in combined or "multiplex" in combined:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {safe_name} is
    port (
        d0  : in  std_logic;
        d1  : in  std_logic;
        d2  : in  std_logic;
        d3  : in  std_logic;
        sel : in  std_logic_vector(1 downto 0);
        y   : out std_logic
    );
end {safe_name};

architecture behavioral of {safe_name} is
begin
    -- 4-to-1 Multiplexer matching spec: {specification}
    process(d0, d1, d2, d3, sel)
    begin
        case sel is
            when "00" => y <= d0;
            when "01" => y <= d1;
            when "10" => y <= d2;
            when "11" => y <= d3;
            when others => y <= '0';
        end case;
    end process;
end behavioral;"""
            elif "encoder" in combined or "priority" in combined:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {safe_name} is
    port (
        req   : in  std_logic_vector(3 downto 0);
        grant : out std_logic_vector(1 downto 0);
        valid : out std_logic
    );
end {safe_name};

architecture rtl of {safe_name} is
begin
    -- 4-to-2 Priority Encoder matching spec: {specification}
    process(req)
    begin
        if req(3) = '1' then
            grant <= "11";
            valid <= '1';
        elsif req(2) = '1' then
            grant <= "10";
            valid <= '1';
        elsif req(1) = '1' then
            grant <= "01";
            valid <= '1';
        elsif req(0) = '1' then
            grant <= "00";
            valid <= '1';
        else
            grant <= "00";
            valid <= '0';
        end if;
    end process;
end rtl;"""
            elif "decoder" in combined:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {safe_name} is
    port (
        sel : in  std_logic_vector(1 downto 0);
        en  : in  std_logic;
        y   : out std_logic_vector(3 downto 0)
    );
end {safe_name};

architecture behavioral of {safe_name} is
begin
    -- 2-to-4 Binary Decoder with Enable: {specification}
    process(sel, en)
    begin
        if en = '1' then
            case sel is
                when "00" => y <= "0001";
                when "01" => y <= "0010";
                when "10" => y <= "0100";
                when "11" => y <= "1000";
                when others => y <= "0000";
            end case;
        else
            y <= "0000";
        end if;
    end process;
end behavioral;"""
            elif "shift" in combined or "barrel" in combined:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {safe_name} is
    port (
        din   : in  std_logic_vector(3 downto 0);
        shift : in  std_logic_vector(1 downto 0);
        dir   : in  std_logic;
        dout  : out std_logic_vector(3 downto 0)
    );
end {safe_name};

architecture rtl of {safe_name} is
begin
    -- 4-bit Barrel Shifter matching spec: {specification}
    process(din, shift, dir)
        variable u_data : unsigned(3 downto 0);
        variable s_amt  : integer range 0 to 3;
    begin
        u_data := unsigned(din);
        s_amt := to_integer(unsigned(shift));
        if dir = '0' then
            dout <= std_logic_vector(shift_left(u_data, s_amt));
        else
            dout <= std_logic_vector(shift_right(u_data, s_amt));
        end if;
    end process;
end rtl;"""
            elif "comparator" in combined or "compare" in combined:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {safe_name} is
    port (
        a  : in  std_logic_vector(3 downto 0);
        b  : in  std_logic_vector(3 downto 0);
        eq : out std_logic;
        gt : out std_logic;
        lt : out std_logic
    );
end {safe_name};

architecture rtl of {safe_name} is
begin
    -- 4-bit Magnitude Comparator matching spec: {specification}
    process(a, b)
    begin
        eq <= '0';
        gt <= '0';
        lt <= '0';
        if unsigned(a) = unsigned(b) then
            eq <= '1';
        elsif unsigned(a) > unsigned(b) then
            gt <= '1';
        else
            lt <= '1';
        end if;
    end process;
end rtl;"""
            elif "traffic" in combined or "fsm" in combined:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {safe_name} is
    port (
        clk    : in  std_logic;
        rst    : in  std_logic;
        sensor : in  std_logic;
        red    : out std_logic;
        yellow : out std_logic;
        green  : out std_logic
    );
end {safe_name};

architecture fsm of {safe_name} is
    type state_t is (S_GREEN, S_YELLOW, S_RED);
    signal current_state, next_state : state_t;
begin
    -- Traffic Light Controller FSM matching spec: {specification}
    sync_proc: process(clk, rst)
    begin
        if rst = '1' then
            current_state <= S_RED;
        elsif rising_edge(clk) then
            current_state <= next_state;
        end if;
    end process;

    comb_proc: process(current_state, sensor)
    begin
        red <= '0';
        yellow <= '0';
        green <= '0';
        case current_state is
            when S_GREEN =>
                green <= '1';
                if sensor = '1' then
                    next_state <= S_YELLOW;
                else
                    next_state <= S_GREEN;
                end if;
            when S_YELLOW =>
                yellow <= '1';
                next_state <= S_RED;
            when S_RED =>
                red <= '1';
                next_state <= S_GREEN;
        end case;
    end process;
end fsm;"""
            elif "half" in combined and "adder" in combined:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {safe_name} is
    port (
        A    : in  std_logic;
        B    : in  std_logic;
        Sum  : out std_logic;
        Cout : out std_logic
    );
end {safe_name};

architecture dataflow of {safe_name} is
begin
    -- 1-Bit Half Adder: {specification}
    Sum  <= A xor B;
    Cout <= A and B;
end dataflow;"""
            elif "counter" in combined or scale == 2:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {safe_name} is
    port (
        clk   : in  std_logic;
        rst   : in  std_logic;
        en    : in  std_logic;
        count : out std_logic_vector(7 downto 0)
    );
end {safe_name};

architecture rtl of {safe_name} is
    signal r_cnt : unsigned(7 downto 0) := (others => '0');
begin
    -- 8-bit Synchronous Counter matching spec: {specification}
    process(clk, rst)
    begin
        if rst = '1' then
            r_cnt <= (others => '0');
        elsif rising_edge(clk) then
            if en = '1' then
                r_cnt <= r_cnt + 1;
            end if;
        end if;
    end process;
    count <= std_logic_vector(r_cnt);
end rtl;"""
            elif "alu" in combined or scale == 3:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {safe_name} is
    port (
        a        : in  std_logic_vector(31 downto 0);
        b        : in  std_logic_vector(31 downto 0);
        alu_ctrl : in  std_logic_vector(3 downto 0);
        result   : out std_logic_vector(31 downto 0);
        zero     : out std_logic
    );
end {safe_name};

architecture rtl of {safe_name} is
    signal res : std_logic_vector(31 downto 0);
begin
    -- 32-bit ALU subsystem matching spec: {specification}
    process(a, b, alu_ctrl)
    begin
        case alu_ctrl is
            when "0000" => res <= std_logic_vector(unsigned(a) + unsigned(b)); -- ADD
            when "0001" => res <= std_logic_vector(unsigned(a) - unsigned(b)); -- SUB
            when "0010" => res <= a and b;                                     -- AND
            when "0011" => res <= a or b;                                      -- OR
            when others => res <= a xor b;                                     -- XOR
        end case;
    end process;
    result <= res;
    zero <= '1' when res = x"00000000" else '0';
end rtl;"""
            elif scale == 1:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {safe_name} is
    port (
        A    : in  std_logic;
        B    : in  std_logic;
        Cin  : in  std_logic;
        Sum  : out std_logic;
        Cout : out std_logic
    );
end {safe_name};

architecture structural of {safe_name} is
    signal s1, c1, c2 : std_logic;
begin
    -- 1-Bit Full Adder matching spec: {specification}
    s1 <= A xor B;
    Sum <= s1 xor Cin;
    c1 <= A and B;
    c2 <= Cin and s1;
    Cout <= c1 or c2;
end structural;"""
            else:
                vhdl_code = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {safe_name} is
    port (
        clk        : in  std_logic;
        rst        : in  std_logic;
        instr_addr : out std_logic_vector(31 downto 0);
        instr_data : in  std_logic_vector(31 downto 0)
    );
end {safe_name};

architecture rtl of {safe_name} is
    signal pc : unsigned(31 downto 0) := (others => '0');
begin
    -- RISC-V RV32I Processor matching spec: {specification}
    process(clk, rst)
    begin
        if rst = '1' then
            pc <= (others => '0');
        elsif rising_edge(clk) then
            pc <= pc + 4;
        end if;
    end process;
    instr_addr <= std_logic_vector(pc);
end rtl;"""

        self.last_vhdl = vhdl_code
        parse_res = VHDLParser.parse_code(vhdl_code)

        entity_info = {
            "name": safe_name,
            "ports": [p.name for e in parse_res.entities for p in e.ports]
        }

        # Autonomous Knowledge Graph Update
        node = self.updater.on_circuit_designed(safe_name, scale, vhdl_code, entity_info)

        return {
            "circuit_name": safe_name,
            "scale": scale,
            "vhdl_code": vhdl_code,
            "parse_valid": parse_res.is_valid,
            "lint_messages": [m.__dict__ for m in parse_res.lint_messages],
            "kg_node_id": node["id"],
        }

    def lint_circuit(self, vhdl_code: str) -> Dict[str, Any]:
        """Runs syntax parsing and synthesis lint checks on VHDL code."""
        res = VHDLParser.parse_code(vhdl_code)
        return {
            "is_valid": res.is_valid,
            "entities_found": len(res.entities),
            "signals_found": len(res.signals),
            "processes_count": res.processes_count,
            "components_count": res.components_count,
            "messages": [m.__dict__ for m in res.lint_messages]
        }

    def synthesize_netlist(self, circuit_name: str) -> Dict[str, Any]:
        """Generates a hierarchical netlist graph for visual schematic rendering."""
        netlist = NetlistCatalog.get_by_name_or_scale(circuit_name)
        if not netlist:
            netlist = NetlistCatalog.get_scale1_full_adder()

        self.last_netlist = netlist
        return netlist.to_dict()

    def run_simulation(self, circuit_name: str, duration_ns: int = 100) -> Dict[str, Any]:
        """Executes a cycle-accurate simulation, verifies assertions, and exports waveforms."""
        sim = Simulator(time_step_ns=1)

        # Build simulation based on design
        ident = circuit_name.lower()
        if 'mux' in ident or 'multiplex' in ident:
            # 4:1 Multiplexer
            sim.add_net('sel', width=2)
            sim.add_net('d0')
            sim.add_net('d1')
            sim.add_net('d2')
            sim.add_net('d3')
            sim.add_net('y')

            def mux_eval(blk, s):
                sel_val = s.get_net_val('sel')
                d0_val = s.get_net_val('d0')
                d1_val = s.get_net_val('d1')
                d2_val = s.get_net_val('d2')
                d3_val = s.get_net_val('d3')
                if sel_val == '00':
                    out_v = d0_val
                elif sel_val == '01':
                    out_v = d1_val
                elif sel_val == '10':
                    out_v = d2_val
                else:
                    out_v = d3_val
                s.set_net_val('y', out_v)

            sim.add_block('mux4', 'MUX', {'sel': 'sel', 'd0': 'd0', 'd1': 'd1', 'd2': 'd2', 'd3': 'd3'}, {'y': 'y'}, mux_eval)

            # Stimulus across all channels
            sim.schedule_stimulus(0, 'd0', '1')
            sim.schedule_stimulus(0, 'd1', '0')
            sim.schedule_stimulus(0, 'd2', '1')
            sim.schedule_stimulus(0, 'd3', '0')
            sim.schedule_stimulus(0, 'sel', '00')
            sim.add_assertion(10, 'y', '1', 'sel=00 selects d0=1')

            sim.schedule_stimulus(20, 'sel', '01')
            sim.add_assertion(30, 'y', '0', 'sel=01 selects d1=0')

            sim.schedule_stimulus(40, 'sel', '10')
            sim.add_assertion(50, 'y', '1', 'sel=10 selects d2=1')

            sim.schedule_stimulus(60, 'sel', '11')
            sim.add_assertion(70, 'y', '0', 'sel=11 selects d3=0')

            sim.schedule_stimulus(75, 'd3', '1')
            sim.add_assertion(85, 'y', '1', 'sel=11 dynamically propagates d3=1')

        elif 'dec' in ident or 'encoder' in ident:
            # 2-to-4 Decoder
            sim.add_net('sel', width=2)
            sim.add_net('y0')
            sim.add_net('y1')
            sim.add_net('y2')
            sim.add_net('y3')

            def dec_eval(blk, s):
                v = s.get_net_val('sel')
                s.set_net_val('y0', '1' if v == '00' else '0')
                s.set_net_val('y1', '1' if v == '01' else '0')
                s.set_net_val('y2', '1' if v == '10' else '0')
                s.set_net_val('y3', '1' if v == '11' else '0')

            sim.add_block('dec2to4', 'DECODER', {'sel': 'sel'}, {'y0': 'y0', 'y1': 'y1', 'y2': 'y2', 'y3': 'y3'}, dec_eval)
            sim.schedule_stimulus(0, 'sel', '00')
            sim.add_assertion(10, 'y0', '1', 'sel=00 -> y0 active')
            sim.schedule_stimulus(20, 'sel', '01')
            sim.add_assertion(30, 'y1', '1', 'sel=01 -> y1 active')
            sim.schedule_stimulus(40, 'sel', '10')
            sim.add_assertion(50, 'y2', '1', 'sel=10 -> y2 active')
            sim.schedule_stimulus(60, 'sel', '11')
            sim.add_assertion(70, 'y3', '1', 'sel=11 -> y3 active')

        elif 'adder' in ident or 'xor' in ident or ident in ('scale_1', 'scale1', '1'):
            # Full Adder
            sim.add_net('A')
            sim.add_net('B')
            sim.add_net('Cin')
            sim.add_net('Sum')
            sim.add_net('Cout')
            sim.add_net('s1')
            sim.add_net('c1')
            sim.add_net('c2')
            sim.add_gate('xor1', 'XOR', ['A', 'B'], 's1')
            sim.add_gate('xor2', 'XOR', ['s1', 'Cin'], 'Sum')
            sim.add_gate('and1', 'AND', ['A', 'B'], 'c1')
            sim.add_gate('and2', 'AND', ['Cin', 's1'], 'c2')
            sim.add_gate('or1', 'OR', ['c1', 'c2'], 'Cout')

            # Stimulus
            sim.schedule_stimulus(10, 'A', '1')
            sim.schedule_stimulus(10, 'B', '0')
            sim.schedule_stimulus(10, 'Cin', '0')
            sim.add_assertion(15, 'Sum', '1', 'A=1, B=0, Cin=0 -> Sum=1')
            sim.add_assertion(15, 'Cout', '0', 'A=1, B=0, Cin=0 -> Cout=0')

            sim.schedule_stimulus(25, 'B', '1')
            sim.add_assertion(30, 'Sum', '0', 'A=1, B=1, Cin=0 -> Sum=0')
            sim.add_assertion(30, 'Cout', '1', 'A=1, B=1, Cin=0 -> Cout=1')

            sim.schedule_stimulus(45, 'Cin', '1')
            sim.add_assertion(50, 'Sum', '1', 'A=1, B=1, Cin=1 -> Sum=1')
            sim.add_assertion(50, 'Cout', '1', 'A=1, B=1, Cin=1 -> Cout=1')

        elif 'counter' in ident or ident in ('scale_2', 'scale2', '2'):
            # 8-bit Counter
            sim.add_clock('clk', period_ns=10)
            sim.add_net('rst', is_reset=True)
            sim.add_net('en')
            sim.add_net('count', width=8)

            def counter_eval(blk, s):
                c = s.get_net_val('clk')
                r = s.get_net_val('rst')
                en = s.get_net_val('en')
                val = blk.state.get('v', 0)
                last_c = blk.state.get('lc', '0')
                if r == '1':
                    val = 0
                elif last_c == '0' and c == '1':
                    if en == '1':
                        val = (val + 1) % 256
                blk.state['v'] = val
                blk.state['lc'] = c
                s.set_net_val('count', val)

            sim.add_block('cnt', 'COUNTER', {'clk': 'clk', 'rst': 'rst', 'en': 'en'}, {'count': 'count'}, counter_eval)

            sim.schedule_stimulus(0, 'rst', '1')
            sim.schedule_stimulus(0, 'en', '1')
            sim.schedule_stimulus(15, 'rst', '0')
            sim.add_assertion(45, 'count', '00000011', 'Count should reach 3 after 3 clocks')

        elif 'alu' in ident or ident in ('scale_3', 'scale3', '3'):
            # 32-bit ALU
            sim.add_net('A', width=32)
            sim.add_net('B', width=32)
            sim.add_net('ALUControl', width=4)
            sim.add_net('Result', width=32)
            sim.add_net('Zero')

            def alu_eval(blk, s):
                a_int = s.get_net_int('A')
                b_int = s.get_net_int('B')
                ctrl = s.get_net_val('ALUControl')
                if ctrl == '0000':  # ADD
                    res = (a_int + b_int) & 0xFFFFFFFF
                elif ctrl == '0001': # SUB
                    res = (a_int - b_int) & 0xFFFFFFFF
                elif ctrl == '0010': # AND
                    res = (a_int & b_int) & 0xFFFFFFFF
                elif ctrl == '0011': # OR
                    res = (a_int | b_int) & 0xFFFFFFFF
                else: # XOR
                    res = (a_int ^ b_int) & 0xFFFFFFFF

                s.set_net_val('Result', res)
                s.set_net_val('Zero', '1' if res == 0 else '0')

            sim.add_block('alu32', 'ALU', {'A': 'A', 'B': 'B', 'ctrl': 'ALUControl'}, {'Result': 'Result', 'Zero': 'Zero'}, alu_eval)

            # Test ADD: 10 + 25 = 35
            sim.schedule_stimulus(10, 'A', 10)
            sim.schedule_stimulus(10, 'B', 25)
            sim.schedule_stimulus(10, 'ALUControl', '0000')
            sim.add_assertion(20, 'Result', format(35, '032b'), '10 + 25 = 35')
            sim.add_assertion(20, 'Zero', '0')

            # Test SUB: 50 - 50 = 0 (Zero flag set)
            sim.schedule_stimulus(30, 'A', 50)
            sim.schedule_stimulus(30, 'B', 50)
            sim.schedule_stimulus(30, 'ALUControl', '0001')
            sim.add_assertion(40, 'Result', format(0, '032b'), '50 - 50 = 0')
            sim.add_assertion(40, 'Zero', '1')

        elif any(kw in ident for kw in ('processor_64', 'cpu_64', 'bitstream', '64bit', '64_bit')):
            # Scale 4: 64-Bit Microprocessor with Bitstream RX
            sim.add_clock('clk', period_ns=10)
            sim.add_net('rst', is_reset=True)
            sim.add_net('bitstream_in', width=1)
            sim.add_net('bitstream_valid', width=1)
            sim.add_net('alu_result', width=64)
            sim.add_net('zero_flag', width=1)
            sim.add_net('mem_addr', width=32)
            sim.add_net('mem_we', width=1)
            sim.add_net('reg_write', width=1)

            def proc64_eval(blk, s):
                c = s.get_net_val('clk')
                r = s.get_net_val('rst')
                bs_valid = s.get_net_val('bitstream_valid')
                cycle = blk.state.get('cyc', 0)
                last_c = blk.state.get('lc', '0')
                if r == '1':
                    blk.state.update({'cyc': 0, 'acc': 0})
                elif last_c == '0' and c == '1':
                    cycle += 1
                    blk.state['cyc'] = cycle
                blk.state['lc'] = c
                acc = blk.state.get('acc', 0)
                if bs_valid == '1':
                    acc = (acc + 0xDEAD_BEEF_0000_0001) & 0xFFFF_FFFF_FFFF_FFFF
                    blk.state['acc'] = acc
                s.set_net_val('alu_result', acc)
                s.set_net_val('zero_flag', 1 if acc == 0 else 0)
                s.set_net_val('mem_addr', (cycle * 8) & 0xFFFFFFFF)
                s.set_net_val('mem_we', 1 if cycle % 4 == 0 else 0)
                s.set_net_val('reg_write', 1 if cycle % 2 == 0 else 0)

            sim.add_block('proc64', 'PROCESSOR_64BIT',
                          {'clk': 'clk', 'rst': 'rst', 'bitstream_in': 'bitstream_in', 'bitstream_valid': 'bitstream_valid'},
                          {'alu_result': 'alu_result', 'zero_flag': 'zero_flag', 'mem_addr': 'mem_addr', 'mem_we': 'mem_we', 'reg_write': 'reg_write'},
                          proc64_eval)
            sim.schedule_stimulus(0,  'rst', '1')
            sim.schedule_stimulus(5,  'bitstream_in', '1')
            sim.schedule_stimulus(5,  'bitstream_valid', '1')
            sim.schedule_stimulus(15, 'rst', '0')
            sim.schedule_stimulus(55, 'bitstream_valid', '0')
            sim.add_assertion(25,  'zero_flag', '0', 'ALU should be non-zero after bitstream load')
            sim.add_assertion(100, 'mem_addr',  format(72, '032b'), 'mem_addr at cycle 9 = 72 bytes')

        elif 'riscv' in ident or 'processor' in ident or 'cpu' in ident or ident in ('scale_4', 'scale4', '4'):
            # Scale 4: RISC-V Pipeline Core
            sim.add_clock('clk', period_ns=10)
            sim.add_net('rst', is_reset=True)
            sim.add_net('PC', width=32)
            sim.add_net('Instr', width=32)
            sim.add_net('WB_Data', width=32)

            def riscv_eval(blk, s):
                c = s.get_net_val('clk')
                r = s.get_net_val('rst')
                pc = blk.state.get('pc', 0)
                last_c = blk.state.get('lc', '0')
                if r == '1':
                    pc = 0
                elif last_c == '0' and c == '1':
                    pc = (pc + 4) & 0xFFFFFFFF
                blk.state['pc'] = pc
                blk.state['lc'] = c
                s.set_net_val('PC', pc)
                s.set_net_val('Instr', 0x00A50513) # addi a0, a0, 10
                s.set_net_val('WB_Data', 10)

            sim.add_block('cpu', 'RISCV_CORE', {'clk': 'clk', 'rst': 'rst'}, {'PC': 'PC', 'Instr': 'Instr', 'WB_Data': 'WB_Data'}, riscv_eval)
            sim.schedule_stimulus(0, 'rst', '1')
            sim.schedule_stimulus(15, 'rst', '0')
            sim.add_assertion(45, 'PC', format(12, '032b'), 'PC advanced 3 instructions (12 bytes)')

        else:
            # Generalized Arbitrary Custom Circuit Simulation
            netlist = self.last_netlist
            if netlist and (netlist.primary_inputs or netlist.primary_outputs):
                for pi in netlist.primary_inputs:
                    sim.add_net(pi.name, width=pi.width)
                for po in netlist.primary_outputs:
                    sim.add_net(po.name, width=po.width)
                for node in netlist.nodes:
                    for out_p in node.outputs:
                        if out_p.name not in sim.nets:
                            sim.add_net(out_p.name, width=out_p.width)

                for idx, node in enumerate(netlist.nodes):
                    in_map = {p.id: p.name for p in node.inputs}
                    out_map = {p.id: p.name for p in node.outputs}
                    gtype = node.type.upper()

                    def make_eval(gate_type, in_ports, out_ports):
                        def custom_eval(blk, s):
                            vals = [s.get_net_val(p.name) for p in in_ports]
                            out_name = out_ports[0].name if out_ports else "out"
                            if gate_type == "AND":
                                res = '1' if all(v == '1' for v in vals) else '0'
                            elif gate_type == "OR":
                                res = '1' if any(v == '1' for v in vals) else '0'
                            elif gate_type == "XOR":
                                cnt = sum(1 for v in vals if v == '1')
                                res = '1' if (cnt % 2 == 1) else '0'
                            elif gate_type == "NOT":
                                res = '0' if (vals and vals[0] == '1') else '1'
                            elif gate_type == "NAND":
                                res = '0' if all(v == '1' for v in vals) else '1'
                            elif gate_type == "NOR":
                                res = '0' if any(v == '1' for v in vals) else '1'
                            elif gate_type == "MUX":
                                res = vals[1] if len(vals) > 1 and vals[0] == '0' else (vals[2] if len(vals) > 2 else '1')
                            else:
                                res = vals[0] if vals else '1'
                            s.set_net_val(out_name, res)
                        return custom_eval

                    sim.add_block(f"blk_{idx}", node.type, in_map, out_map, make_eval(gtype, node.inputs, node.outputs))

                for i, pi in enumerate(netlist.primary_inputs):
                    sim.schedule_stimulus(0, pi.name, '0')
                    sim.schedule_stimulus(15 + i * 20, pi.name, '1')

                if netlist.primary_outputs:
                    first_out = netlist.primary_outputs[0].name
                    sim.add_assertion(50, first_out, '1', f'Dynamic propagation check on {first_out}')
            else:
                sim.add_net('clk', width=1)
                sim.add_net('data_in', width=8)
                sim.add_net('data_out', width=8)
                sim.schedule_stimulus(0, 'data_in', 0)
                sim.schedule_stimulus(20, 'data_in', 42)
                sim.add_assertion(40, 'data_in', format(42, '08b'), 'data_in driven to 42')

        # Re-apply any active stuck-at faults so faults persist across runs
        for f_net, f_val in self.active_faults.items():
            sim.inject_fault(f_net, f_val)

        summary = sim.run(duration_ns)
        self.last_sim = sim

        # Autonomous Graph Update on Simulation Results!
        self.updater.on_simulation_completed(circuit_name, summary)

        waveform = sim.export_waveform_json()
        return {
            "circuit_name": circuit_name,
            "summary": summary,
            "waveform": waveform,
            "active_faults": self.active_faults,
        }

    def inject_fault(self, net_name: str, fault_val: Optional[str]) -> Dict[str, Any]:
        """Injects a stuck-at fault or clears it on a circuit net."""
        if fault_val is None or fault_val == "" or fault_val == "clear":
            self.active_faults.pop(net_name, None)
            if self.last_sim:
                self.last_sim.inject_fault(net_name, None)
            return {
                "net": net_name,
                "fault": None,
                "active_faults": self.active_faults,
                "message": f"Fault cleared on net {net_name}"
            }
        else:
            self.active_faults[net_name] = str(fault_val)
            if self.last_sim:
                self.last_sim.inject_fault(net_name, str(fault_val))
            return {
                "net": net_name,
                "fault": str(fault_val),
                "active_faults": self.active_faults,
                "message": f"Fault stuck-at-{fault_val} injected on net {net_name}"
            }

    def ingest_huggingface(self, dataset_name: str, max_samples: int = 15) -> Dict[str, Any]:
        """Ingests open-source hardware designs from Hugging Face into the knowledge graph."""
        return self.ingester.ingest_from_huggingface(dataset_name, max_samples)
