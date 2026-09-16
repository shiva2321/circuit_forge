"""
CircuitForge Knowledge Base
Multi-scale digital circuit knowledge spanning Gate-Level, RTL, Subsystems, and SoC/Processor Architectures.
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional

@dataclass
class KnowledgeEntry:
    id: str
    title: str
    scale: int  # 1 to 4
    category: str
    summary: str
    vhdl_snippet: str
    design_rules: List[str]
    keywords: List[str]

KNOWLEDGE_ENTRIES: List[KnowledgeEntry] = [
    # Scale 1: Gate Level
    KnowledgeEntry(
        id='gate_nand_universal',
        title='Universal NAND Gate Logic',
        scale=1,
        category='Primitives',
        summary='NAND gates form a functionally complete logic set. Any combinational circuit (NOT, AND, OR, XOR) can be constructed entirely from NAND gates.',
        vhdl_snippet='''library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity nand2_gate is
    port (
        a : in  std_logic;
        b : in  std_logic;
        y : out std_logic
    );
end nand2_gate;

architecture rtl of nand2_gate is
begin
    y <= not (a and b);
end rtl;''',
        design_rules=[
            'De Morgan: not(A and B) = (not A) or (not B)',
            'Inverter: NOT(A) = A NAND A',
            'AND: A AND B = (A NAND B) NAND (A NAND B)',
            'OR: A OR B = (A NAND A) NAND (B NAND B)',
            'CMOS transistor count: 2 PMOS in parallel, 2 NMOS in series (4 transistors)'
        ],
        keywords=['nand', 'universal', 'gate', 'cmos', 'boolean', 'primitive']
    ),
    KnowledgeEntry(
        id='gate_dff_async_reset',
        title='Edge-Triggered D Flip-Flop with Asynchronous Reset',
        scale=1,
        category='Sequential Primitives',
        summary='Standard bistable memory element storing 1 bit of state. Transfers input D to output Q on the positive clock edge, with immediate asynchronous reset capability.',
        vhdl_snippet='''library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity dff_async_rst is
    port (
        clk : in  std_logic;
        rst : in  std_logic;
        d   : in  std_logic;
        q   : out std_logic
    );
end dff_async_rst;

architecture rtl of dff_async_rst is
begin
    process(clk, rst)
    begin
        if rst = '1' then
            q <= '0';
        elsif rising_edge(clk) then
            q <= d;
        end if;
    end process;
end rtl;''',
        design_rules=[
            'Always put both clk and rst in the process sensitivity list for asynchronous reset.',
            'Asynchronous reset must be tested BEFORE the rising_edge(clk) condition.',
            'Never place combinational assignments inside the reset branch except initial state.',
            'Observe Setup Time (Tsu) and Hold Time (Th) to prevent metastability.'
        ],
        keywords=['dff', 'flip-flop', 'register', 'sequential', 'reset', 'clock', 'metastability']
    ),

    # Scale 2: RTL Blocks
    KnowledgeEntry(
        id='rtl_full_adder',
        title='1-Bit Full Adder with Carry Propagate and Generate',
        scale=2,
        category='Arithmetic',
        summary='Computes the sum of 3 binary inputs (A, B, Cin) producing Sum and Cout. Fundamental building block for Ripple Carry and Carry Lookahead Adders.',
        vhdl_snippet='''library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity full_adder is
    port (
        a    : in  std_logic;
        b    : in  std_logic;
        cin  : in  std_logic;
        sum  : out std_logic;
        cout : out std_logic
    );
end full_adder;

architecture dataflow of full_adder is
    signal p, g : std_logic;
begin
    p <= a xor b;       -- Propagate
    g <= a and b;       -- Generate
    sum  <= p xor cin;
    cout <= g or (p and cin);
end dataflow;''',
        design_rules=[
            'Sum = A xor B xor Cin',
            'Cout = (A and B) or (Cin and (A xor B))',
            'Gate depth to Sum: 2 XOR levels.',
            'Gate depth to Cout: 1 XOR, 1 AND, 1 OR (3 levels).'
        ],
        keywords=['adder', 'full adder', 'arithmetic', 'cla', 'carry', 'sum']
    ),
    KnowledgeEntry(
        id='rtl_sync_counter',
        title='8-Bit Synchronous Up/Down Counter with Load',
        scale=2,
        category='Sequential Blocks',
        summary='Synchronous counter counting up or down on clock edges with synchronous clear, parallel load, and terminal count output.',
        vhdl_snippet='''library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter_8bit is
    port (
        clk     : in  std_logic;
        rst     : in  std_logic;
        en      : in  std_logic;
        up_down : in  std_logic;
        load    : in  std_logic;
        d_in    : in  std_logic_vector(7 downto 0);
        count   : out std_logic_vector(7 downto 0);
        tc      : out std_logic
    );
end counter_8bit;

architecture rtl of counter_8bit is
    signal r_count : unsigned(7 downto 0);
begin
    process(clk, rst)
    begin
        if rst = '1' then
            r_count <= (others => '0');
        elsif rising_edge(clk) then
            if load = '1' then
                r_count <= unsigned(d_in);
            elsif en = '1' then
                if up_down = '1' then
                    r_count <= r_count + 1;
                else
                    r_count <= r_count - 1;
                end if;
            end if;
        end if;
    end process;

    count <= std_logic_vector(r_count);
    tc <= '1' when (up_down = '1' and r_count = 255) or (up_down = '0' and r_count = 0) else '0';
end rtl;''',
        design_rules=[
            'Synchronous counters update all flip-flops on the same clock edge, eliminating ripple glitches.',
            'Use unsigned type from numeric_std for arithmetic operations instead of std_logic_arith.',
            'Terminal count (TC) should be registered if used on high-frequency clock trees.'
        ],
        keywords=['counter', 'updown', 'sequential', 'unsigned', 'load', 'terminal count']
    ),

    # Scale 3: Subsystems & Cores
    KnowledgeEntry(
        id='subsystem_alu_32bit',
        title='32-Bit Multi-Function ALU with Status Flags',
        scale=3,
        category='Micro-Architecture',
        summary='Central execution unit of a 32-bit processor supporting ADD, SUB, AND, OR, XOR, SLL, SRL, SRA, SLT with zero, negative, carry, and overflow flags.',
        vhdl_snippet='''library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity alu_32bit is
    port (
        a           : in  std_logic_vector(31 downto 0);
        b           : in  std_logic_vector(31 downto 0);
        alu_ctrl    : in  std_logic_vector(3 downto 0);
        result      : out std_logic_vector(31 downto 0);
        zero        : out std_logic;
        negative    : out std_logic;
        carry_out   : out std_logic;
        overflow    : out std_logic
    );
end alu_32bit;

architecture rtl of alu_32bit is
    signal s_a, s_b     : signed(31 downto 0);
    signal add_sub_res  : signed(32 downto 0);
    signal res_internal : std_logic_vector(31 downto 0);
    signal is_sub       : std_logic;
begin
    s_a <= signed(a);
    s_b <= signed(b);
    is_sub <= '1' when alu_ctrl = "0001" or alu_ctrl = "1010" else '0';

    process(s_a, s_b, is_sub)
    begin
        if is_sub = '1' then
            add_sub_res <= resize(s_a, 33) - resize(s_b, 33);
        else
            add_sub_res <= resize(s_a, 33) + resize(s_b, 33);
        end if;
    end process;

    process(alu_ctrl, a, b, add_sub_res)
        variable shamt : integer;
    begin
        shamt := to_integer(unsigned(b(4 downto 0)));
        case alu_ctrl is
            when "0000" => res_internal <= std_logic_vector(add_sub_res(31 downto 0)); -- ADD
            when "0001" => res_internal <= std_logic_vector(add_sub_res(31 downto 0)); -- SUB
            when "0010" => res_internal <= a and b;                                    -- AND
            when "0011" => res_internal <= a or b;                                     -- OR
            when "0100" => res_internal <= a xor b;                                    -- XOR
            when "0101" => res_internal <= std_logic_vector(shift_left(unsigned(a), shamt));  -- SLL
            when "0110" => res_internal <= std_logic_vector(shift_right(unsigned(a), shamt)); -- SRL
            when "0111" => res_internal <= std_logic_vector(shift_right(signed(a), shamt));   -- SRA
            when "1000" => -- SLT (Set Less Than)
                if add_sub_res(31) = '1' then
                    res_internal <= (0 => '1', others => '0');
                else
                    res_internal <= (others => '0');
                end if;
            when others => res_internal <= (others => '0');
        end case;
    end process;

    result <= res_internal;
    zero <= '1' when res_internal = x"00000000" else '0';
    negative <= res_internal(31);
    carry_out <= add_sub_res(32);
    overflow <= (a(31) xor add_sub_res(31)) and not (a(31) xor b(31) xor is_sub);
end rtl;''',
        design_rules=[
            'Signed overflow occurs when two numbers of the same sign produce a result of the opposite sign.',
            'Overflow flag formula: V = (A[31] and B[31] and not S[31]) or (not A[31] and not B[31] and S[31]) for addition.',
            'Zero flag must test all 32 bits using NOR reduction.',
            'Barrel shifting uses log2(N) multiplexer stages (5 stages for 32-bit).'
        ],
        keywords=['alu', 'arithmetic logic unit', '32-bit', 'risc-v', 'overflow', 'flags', 'subsystem']
    ),

    # Scale 4: Processor Core / SoC
    KnowledgeEntry(
        id='soc_riscv_rv32i',
        title='RISC-V RV32I 5-Stage Pipelined Processor Core',
        scale=4,
        category='Computer Architecture',
        summary='Standard 32-bit RISC-V Harvard architecture pipeline comprising Instruction Fetch (IF), Decode (ID), Execute (EX), Memory (MEM), and Writeback (WB) with data bypassing.',
        vhdl_snippet='''library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- Top-level entity outline for RV32I Core
entity rv32i_core is
    port (
        clk             : in  std_logic;
        rst             : in  std_logic;
        instr_addr      : out std_logic_vector(31 downto 0);
        instr_data      : in  std_logic_vector(31 downto 0);
        data_addr       : out std_logic_vector(31 downto 0);
        data_wdata      : out std_logic_vector(31 downto 0);
        data_rdata      : in  std_logic_vector(31 downto 0);
        data_wen        : out std_logic
    );
end rv32i_core;
''',
        design_rules=[
            'Pipeline registers isolate critical paths between instruction memory, regfile, ALU, and data cache.',
            'Forwarding unit resolves RAW (Read After Write) hazards without stalling when EX or MEM stages produce data.',
            'Load-use hazard requires 1 stall bubble when an instruction immediately depends on a preceding LW.',
            'Branch misprediction flushes IF/ID and ID/EX registers to prevent executing invalid speculative instructions.'
        ],
        keywords=['riscv', 'rv32i', 'processor', 'pipeline', 'cpu', 'soc', 'hazard', 'forwarding']
    )
]

def search_knowledge(query: str = '', scale: Optional[int] = None) -> List[Dict[str, Any]]:
    query_lower = query.lower().strip()
    results = []

    for entry in KNOWLEDGE_ENTRIES:
        if scale is not None and entry.scale != scale:
            continue

        score = 0
        if not query_lower:
            score = 1
        else:
            if query_lower in entry.title.lower():
                score += 5
            if query_lower in entry.summary.lower():
                score += 3
            if any(query_lower in kw for kw in entry.keywords):
                score += 4
            if query_lower in entry.category.lower():
                score += 2

        if score > 0:
            results.append({
                'id': entry.id,
                'title': entry.title,
                'scale': entry.scale,
                'category': entry.category,
                'summary': entry.summary,
                'vhdl_snippet': entry.vhdl_snippet,
                'design_rules': entry.design_rules,
                'keywords': entry.keywords,
                'score': score
            })

    results.sort(key=lambda x: x['score'], reverse=True)
    return results
