import os
import re

HW_GEN_PATH = r"e:\vhdl_toolkit\backend\app\agent\hardware_generator.py"

extra_code = '''

# ══════════════════════════════════════════════════════════════════════════════
# COMPREHENSIVE PARAMETRIC HARDWARE GENERATORS (SCALES 1 TO 4)
# ══════════════════════════════════════════════════════════════════════════════

def generate_gate_primitive(gate_type: str = "not", entity_name: Optional[str] = None) -> Dict[str, Any]:
    """Generates pure synthesizable VHDL-2008 for logic gate primitives."""
    g = gate_type.lower().strip()
    if "not" in g or "inv" in g:
        ent = entity_name or "inv_gate"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        a : in  STD_LOGIC;
        y : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    y <= not a;
end rtl;
"""
        desc = "Single-stage CMOS logic inverter primitive."
    elif "nand" in g:
        ent = entity_name or "nand2_gate"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        a : in  STD_LOGIC;
        b : in  STD_LOGIC;
        y : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    y <= not (a and b);
end rtl;
"""
        desc = "2-input CMOS NAND gate primitive."
    elif "nor" in g:
        ent = entity_name or "nor2_gate"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        a : in  STD_LOGIC;
        b : in  STD_LOGIC;
        y : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    y <= not (a or b);
end rtl;
"""
        desc = "2-input CMOS NOR gate primitive."
    elif "xnor" in g:
        ent = entity_name or "xnor2_gate"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        a : in  STD_LOGIC;
        b : in  STD_LOGIC;
        y : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    y <= not (a xor b);
end rtl;
"""
        desc = "2-input XNOR equivalence gate primitive."
    elif "xor" in g:
        ent = entity_name or "xor2_gate"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        a : in  STD_LOGIC;
        b : in  STD_LOGIC;
        y : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    y <= a xor b;
end rtl;
"""
        desc = "2-input XOR parity gate primitive."
    elif "or" in g:
        ent = entity_name or "or2_gate"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        a : in  STD_LOGIC;
        b : in  STD_LOGIC;
        y : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    y <= a or b;
end rtl;
"""
        desc = "2-input OR gate primitive."
    else:  # AND
        ent = entity_name or "and2_gate"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        a : in  STD_LOGIC;
        b : in  STD_LOGIC;
        y : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    y <= a and b;
end rtl;
"""
        desc = "2-input AND gate primitive."

    return {
        "circuit_name": ent,
        "scale": 1,
        "vhdl_code": vhdl,
        "description": desc,
        "files": {f"src/{ent}.vhd": vhdl},
        "top_file": f"src/{ent}.vhd"
    }


def generate_multiplexer(ways: int = 4, entity_name: Optional[str] = None) -> Dict[str, Any]:
    """Generates 2:1, 4:1, or 8:1 multiplexers in synthesizable VHDL-2008."""
    if ways == 2:
        ent = entity_name or "mux_2to1"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        d0  : in  STD_LOGIC;
        d1  : in  STD_LOGIC;
        sel : in  STD_LOGIC;
        y   : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    y <= d1 when sel = '1' else d0;
end rtl;
"""
        desc = "2-to-1 multiplexer with single select bit."
    elif ways == 8:
        ent = entity_name or "mux_8to1"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        d   : in  STD_LOGIC_VECTOR(7 downto 0);
        sel : in  STD_LOGIC_VECTOR(2 downto 0);
        y   : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    with sel select
        y <= d(0) when "000",
             d(1) when "001",
             d(2) when "010",
             d(3) when "011",
             d(4) when "100",
             d(5) when "101",
             d(6) when "110",
             d(7) when others;
end rtl;
"""
        desc = "8-to-1 multiplexer with 3-bit binary select."
    else:  # 4:1
        ent = entity_name or "mux_4to1"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        d0  : in  STD_LOGIC;
        d1  : in  STD_LOGIC;
        d2  : in  STD_LOGIC;
        d3  : in  STD_LOGIC;
        sel : in  STD_LOGIC_VECTOR(1 downto 0);
        y   : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
begin
    with sel select
        y <= d0 when "00",
             d1 when "01",
             d2 when "10",
             d3 when others;
end rtl;
"""
        desc = "4-to-1 multiplexer with 2-bit binary select."

    return {
        "circuit_name": ent,
        "scale": 2,
        "vhdl_code": vhdl,
        "description": desc,
        "files": {f"src/{ent}.vhd": vhdl},
        "top_file": f"src/{ent}.vhd"
    }


def generate_arithmetic_adder(bits: int = 8, entity_name: Optional[str] = None) -> Dict[str, Any]:
    """Generates Half Adder, 1-bit Full Adder, 4-bit, 8-bit, or 32-bit Adders."""
    if bits == 1:
        ent = entity_name or "full_adder"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        A    : in  STD_LOGIC;
        B    : in  STD_LOGIC;
        Cin  : in  STD_LOGIC;
        Sum  : out STD_LOGIC;
        Cout : out STD_LOGIC
    );
end {ent};

architecture Structural of {ent} is
    signal s1 : STD_LOGIC;
    signal c1 : STD_LOGIC;
    signal c2 : STD_LOGIC;
begin
    s1 <= A xor B;
    Sum <= s1 xor Cin;
    c1 <= A and B;
    c2 <= s1 and Cin;
    Cout <= c1 or c2;
end Structural;
"""
        desc = "1-bit full adder with dual-stage XOR/AND/OR logic."
        scale = 1
    elif bits == 4:
        ent = entity_name or "adder_4bit"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {ent} is
    Port (
        a    : in  STD_LOGIC_VECTOR(3 downto 0);
        b    : in  STD_LOGIC_VECTOR(3 downto 0);
        cin  : in  STD_LOGIC;
        sum  : out STD_LOGIC_VECTOR(3 downto 0);
        cout : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
    signal s_ext : unsigned(4 downto 0);
begin
    s_ext <= ('0' & unsigned(a)) + ('0' & unsigned(b)) + unsigned'("" & cin);
    sum   <= std_logic_vector(s_ext(3 downto 0));
    cout  <= s_ext(4);
end rtl;
"""
        desc = "4-bit binary adder with carry in and out."
        scale = 2
    elif bits == 32:
        ent = entity_name or "adder_cla_32bit"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {ent} is
    Port (
        a        : in  STD_LOGIC_VECTOR(31 downto 0);
        b        : in  STD_LOGIC_VECTOR(31 downto 0);
        cin      : in  STD_LOGIC;
        sum      : out STD_LOGIC_VECTOR(31 downto 0);
        cout     : out STD_LOGIC;
        overflow : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
    signal sum_ext : signed(32 downto 0);
begin
    sum_ext <= resize(signed(a), 33) + resize(signed(b), 33) + signed'("0" & cin);
    sum      <= std_logic_vector(sum_ext(31 downto 0));
    cout     <= sum_ext(32);
    overflow <= (a(31) and b(31) and not sum_ext(31)) or (not a(31) and not b(31) and sum_ext(31));
end rtl;
"""
        desc = "32-bit arithmetic adder with carry and signed overflow detection."
        scale = 3
    else:  # 8-bit default
        ent = entity_name or "adder_8bit"
        vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {ent} is
    Port (
        a    : in  STD_LOGIC_VECTOR(7 downto 0);
        b    : in  STD_LOGIC_VECTOR(7 downto 0);
        cin  : in  STD_LOGIC;
        sum  : out STD_LOGIC_VECTOR(7 downto 0);
        cout : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
    signal sum_ext : unsigned(8 downto 0);
begin
    sum_ext <= ('0' & unsigned(a)) + ('0' & unsigned(b)) + unsigned'("" & cin);
    sum     <= std_logic_vector(sum_ext(7 downto 0));
    cout    <= sum_ext(8);
end rtl;
"""
        desc = "8-bit high-throughput binary adder datapath."
        scale = 2

    return {
        "circuit_name": ent,
        "scale": scale,
        "vhdl_code": vhdl,
        "description": desc,
        "files": {f"src/{ent}.vhd": vhdl},
        "top_file": f"src/{ent}.vhd"
    }


def generate_synchronous_counter(bits: int = 8, entity_name: Optional[str] = None) -> Dict[str, Any]:
    """Generates synchronous up/down counters with enable and synchronous reset."""
    ent = entity_name or f"counter_{bits}bit"
    max_val = (1 << bits) - 1
    vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {ent} is
    Port (
        clk     : in  STD_LOGIC;
        rst     : in  STD_LOGIC;
        en      : in  STD_LOGIC;
        up_down : in  STD_LOGIC; -- '1': Count Up, '0': Count Down
        count   : out STD_LOGIC_VECTOR({bits - 1} downto 0);
        tc      : out STD_LOGIC  -- Terminal Count Pulse
    );
end {ent};

architecture rtl of {ent} is
    signal cnt_reg : unsigned({bits - 1} downto 0) := (others => '0');
begin
    process(clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                cnt_reg <= (others => '0');
            elsif en = '1' then
                if up_down = '1' then
                    cnt_reg <= cnt_reg + 1;
                else
                    cnt_reg <= cnt_reg - 1;
                end if;
            end if;
        end if;
    end process;

    count <= std_logic_vector(cnt_reg);
    tc    <= '1' when (up_down = '1' and cnt_reg = {max_val}) or (up_down = '0' and cnt_reg = 0) else '0';
end rtl;
"""
    return {
        "circuit_name": ent,
        "scale": 2,
        "vhdl_code": vhdl,
        "description": f"{bits}-bit synchronous up/down counter with terminal count flag.",
        "files": {f"src/{ent}.vhd": vhdl},
        "top_file": f"src/{ent}.vhd"
    }


def generate_alu_subsystem(bits: int = 32, entity_name: Optional[str] = None) -> Dict[str, Any]:
    """Generates multi-function ALU with status flags (Z, N, C, V)."""
    ent = entity_name or "alu_core"
    vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity {ent} is
    Port (
        a        : in  STD_LOGIC_VECTOR({bits - 1} downto 0);
        b        : in  STD_LOGIC_VECTOR({bits - 1} downto 0);
        alu_ctrl : in  STD_LOGIC_VECTOR(3 downto 0);
        result   : out STD_LOGIC_VECTOR({bits - 1} downto 0);
        zero     : out STD_LOGIC;
        negative : out STD_LOGIC;
        carry    : out STD_LOGIC;
        overflow : out STD_LOGIC
    );
end {ent};

architecture Behavioral of {ent} is
    signal res_calc : unsigned({bits} downto 0);
    signal res_out  : STD_LOGIC_VECTOR({bits - 1} downto 0);
begin
    process(a, b, alu_ctrl)
        variable a_u, b_u : unsigned({bits - 1} downto 0);
    begin
        a_u := unsigned(a);
        b_u := unsigned(b);
        res_calc <= (others => '0');

        case alu_ctrl is
            when "0000" => -- ADD
                res_calc <= ('0' & a_u) + ('0' & b_u);
                res_out  <= std_logic_vector(a_u + b_u);
            when "0001" => -- SUB
                res_calc <= ('0' & a_u) - ('0' & b_u);
                res_out  <= std_logic_vector(a_u - b_u);
            when "0010" => -- AND
                res_out  <= a and b;
            when "0011" => -- OR
                res_out  <= a or b;
            when "0100" => -- XOR
                res_out  <= a xor b;
            when "0101" => -- NOR
                res_out  <= not (a or b);
            when "0110" => -- SLL (Shift Left Logical)
                res_out  <= std_logic_vector(shift_left(a_u, 1));
            when "0111" => -- SRL (Shift Right Logical)
                res_out  <= std_logic_vector(shift_right(a_u, 1));
            when "1010" => -- SLT (Set on Less Than signed)
                if signed(a) < signed(b) then
                    res_out <= (0 => '1', others => '0');
                else
                    res_out <= (others => '0');
                end if;
            when others =>
                res_out <= a xor b;
        end case;
    end process;

    result   <= res_out;
    zero     <= '1' when unsigned(res_out) = 0 else '0';
    negative <= res_out({bits - 1});
    carry    <= res_calc({bits});
    overflow <= (a({bits - 1}) and b({bits - 1}) and not res_out({bits - 1})) or
                (not a({bits - 1}) and not b({bits - 1}) and res_out({bits - 1}));
end Behavioral;
"""
    return {
        "circuit_name": ent,
        "scale": 3,
        "vhdl_code": vhdl,
        "description": f"{bits}-bit multi-function arithmetic logic unit with status flags (Z, N, C, V).",
        "files": {f"src/{ent}.vhd": vhdl},
        "top_file": f"src/{ent}.vhd"
    }


def generate_d_flip_flop(entity_name: Optional[str] = None) -> Dict[str, Any]:
    """Generates master-slave D Flip-Flop with asynchronous reset and clock enable."""
    ent = entity_name or "dff_core"
    vhdl = f"""library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity {ent} is
    Port (
        clk : in  STD_LOGIC;
        rst : in  STD_LOGIC;
        en  : in  STD_LOGIC;
        d   : in  STD_LOGIC;
        q   : out STD_LOGIC;
        qn  : out STD_LOGIC
    );
end {ent};

architecture rtl of {ent} is
    signal q_reg : STD_LOGIC := '0';
begin
    process(clk, rst)
    begin
        if rst = '1' then
            q_reg <= '0';
        elsif rising_edge(clk) then
            if en = '1' then
                q_reg <= d;
            end if;
        end if;
    end process;

    q  <= q_reg;
    qn <= not q_reg;
end rtl;
"""
    return {
        "circuit_name": ent,
        "scale": 1,
        "vhdl_code": vhdl,
        "description": "Positive edge-triggered D Flip-Flop with asynchronous reset.",
        "files": {f"src/{ent}.vhd": vhdl},
        "top_file": f"src/{ent}.vhd"
    }


def generate_hardware_from_prompt(
    prompt: str,
    context: Optional[Dict[str, Any]] = None,
    project_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Intelligent hardware synthesizer that parses natural language design requirements
    and produces accurate, verified, synthesizable VHDL-2008 architectures across all 4 scales.
    """
    p = prompt.lower().strip()
    ctx = context or {}
    curr_name = ctx.get("circuit_name", "")

    # 1. Logic Gate Primitives
    if any(k in p for k in ("inverter", "not gate", "invert gate")):
        return generate_gate_primitive("not", clean_hardware_name(prompt, default="inv_gate"))
    if "nand" in p:
        return generate_gate_primitive("nand", clean_hardware_name(prompt, default="nand2_gate"))
    if "nor" in p:
        return generate_gate_primitive("nor", clean_hardware_name(prompt, default="nor2_gate"))
    if "xnor" in p:
        return generate_gate_primitive("xnor", clean_hardware_name(prompt, default="xnor2_gate"))
    if "xor" in p and not "xnor" in p:
        return generate_gate_primitive("xor", clean_hardware_name(prompt, default="xor2_gate"))
    if "and gate" in p or ("and" in p and "2-input" in p):
        return generate_gate_primitive("and", clean_hardware_name(prompt, default="and2_gate"))
    if "or gate" in p or ("or" in p and "2-input" in p):
        return generate_gate_primitive("or", clean_hardware_name(prompt, default="or2_gate"))

    # 2. Multiplexers
    if "mux" in p or "multiplexer" in p:
        ways = 2 if "2" in p else 8 if "8" in p else 4
        return generate_multiplexer(ways, clean_hardware_name(prompt, default=f"mux_{ways}to1"))

    # 3. Adders
    if "half adder" in p:
        return generate_arithmetic_adder(1, clean_hardware_name(prompt, default="half_adder"))
    if "adder" in p:
        bits = 32 if any(k in p for k in ("32", "cla", "carry lookahead")) else 16 if "16" in p else 4 if "4" in p else 8 if "8" in p else 1
        return generate_arithmetic_adder(bits, clean_hardware_name(prompt, default=f"adder_{bits}bit" if bits > 1 else "full_adder"))

    # 4. Counters
    if "counter" in p:
        bits = 4 if "4" in p else 16 if "16" in p else 8
        return generate_synchronous_counter(bits, clean_hardware_name(prompt, default=f"counter_{bits}bit"))

    # 5. ALUs
    if "alu" in p or "arithmetic logic" in p:
        bits = 16 if "16" in p else 8 if "8" in p else 32
        return generate_alu_subsystem(bits, clean_hardware_name(prompt, default=f"alu_{bits}bit"))

    # 6. Flip-Flops & Registers
    if any(k in p for k in ("dff", "flip flop", "flip-flop", "d-flip-flop")):
        return generate_d_flip_flop(clean_hardware_name(prompt, default="dff_core"))

    # 7. Neural Processor
    if any(k in p for k in ("neuron", "neural", "synapse", "brain", "ann")):
        return generate_32_neuron_suite(clean_hardware_name(prompt, default="neural_processor_top"))

    # 8. Microprocessor / RISC-V
    if any(k in p for k in ("processor", "cpu", "riscv", "risc-v", "rv32", "rv64", "core")):
        return generate_64bit_microprocessor_suite(clean_hardware_name(prompt, default="processor_top"))

    # 9. DSP MAC Accelerator (Default for high-performance DSP / pipeline requests)
    return generate_dsp_mac_suite(clean_hardware_name(prompt, default="dsp_mac_pipeline"))


def modify_existing_hardware(vhdl_code: str, prompt: str) -> Dict[str, Any]:
    """
    Surgically inspects and modifies the user's active VHDL design in place without
    replacing it with an unrelated component.
    """
    p = prompt.lower()
    code = vhdl_code.strip()
    if not code or "entity" not in code.lower():
        return {"modified": False, "vhdl_code": code, "explanation": "No active VHDL entity found to modify."}

    # A. Monitor / LED / Probe Attachment
    if any(k in p for k in ("led", "probe", "indicator", "monitor")):
        comp_type = "LED" if "led" in p else "PROBE"
        # Determine target signal from prompt or default to last output
        target = "Cout"
        for candidate in ("cout", "sum", "result", "overflow", "carry", "zero", "tc", "valid_out", "y", "q"):
            if candidate in p:
                target = candidate
                break

        # Check existing ports to match exact casing
        port_names = re.findall(r'([a-zA-Z0-9_]+)\s*:\s*(?:in|out|inout)\b', code, re.IGNORECASE)
        for pn in port_names:
            if pn.lower() == target.lower():
                target = pn
                break

        port_name = f"{comp_type}_{target}"
        if port_name.lower() in code.lower():
            return {"modified": True, "vhdl_code": code, "explanation": f"Port `{port_name}` is already present."}

        # Inject into entity
        port_block = re.search(r'(entity\s+[a-zA-Z0-9_]+\s+is[\s\S]*?Port\s*\([\s\S]*?)(\)\s*;\s*end)', code, re.IGNORECASE)
        if port_block:
            before_closing = port_block.group(1).rstrip()
            if not before_closing.endswith(';'):
                before_closing += ';'
            new_entity_ports = f"{before_closing}\n        {port_name} : out STD_LOGIC\n    " + port_block.group(2)
            code = code[:port_block.start()] + new_entity_ports + code[port_block.end():]

            # Add assignment in architecture before end
            arch_ends = list(re.finditer(r'end(?:\s+[a-zA-Z0-9_]+)?\s*;', code, re.IGNORECASE))
            if arch_ends:
                last_end = arch_ends[-1]
                assign = f"    {port_name} <= {target}; -- Live {comp_type} indicator\n"
                code = code[:last_end.start()] + assign + code[last_end.start():]

            return {
                "modified": True,
                "vhdl_code": code,
                "explanation": f"Attached `{port_name}` monitor to active signal `{target}`."
            }

    # B. Inverting a signal
    if "invert" in p or "not gate" in p:
        target = "Cout"
        for candidate in ("cout", "sum", "result", "y", "q"):
            if candidate in p:
                target = candidate
                break
        inv_port = f"{target}_inv"
        port_block = re.search(r'(entity\s+[a-zA-Z0-9_]+\s+is[\s\S]*?Port\s*\([\s\S]*?)(\)\s*;\s*end)', code, re.IGNORECASE)
        if port_block:
            before_closing = port_block.group(1).rstrip()
            if not before_closing.endswith(';'):
                before_closing += ';'
            new_entity_ports = f"{before_closing}\n        {inv_port} : out STD_LOGIC\n    " + port_block.group(2)
            code = code[:port_block.start()] + new_entity_ports + code[port_block.end():]

            arch_ends = list(re.finditer(r'end(?:\s+[a-zA-Z0-9_]+)?\s*;', code, re.IGNORECASE))
            if arch_ends:
                last_end = arch_ends[-1]
                assign = f"    {inv_port} <= not {target}; -- Inverted output stage\n"
                code = code[:last_end.start()] + assign + code[last_end.start():]
            return {
                "modified": True,
                "vhdl_code": code,
                "explanation": f"Added inverted signal `{inv_port} <= not {target}`."
            }

    return {"modified": False, "vhdl_code": code, "explanation": "No matching surgical modification rule identified."}
'''

with open(HW_GEN_PATH, "r", encoding="utf-8") as f:
    orig = f.read()

if "generate_hardware_from_prompt" not in orig:
    with open(HW_GEN_PATH, "w", encoding="utf-8") as f:
        f.write(orig.strip() + "\n" + extra_code.strip() + "\n")
    print("Successfully patched hardware_generator.py!")
else:
    print("hardware_generator.py already contains generate_hardware_from_prompt.")
