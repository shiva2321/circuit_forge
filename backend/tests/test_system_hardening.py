import pytest
from backend.app.engine.ast_parser import VHDLParser
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater
from backend.app.agent.tools import CircuitTools

def test_ast_parser_mux_consolidation():
    mux_vhdl = """
    library IEEE;
    use IEEE.STD_LOGIC_1164.ALL;

    entity mux_4to1 is
        Port (
            sel : in STD_LOGIC_VECTOR(1 downto 0);
            d0  : in STD_LOGIC;
            d1  : in STD_LOGIC;
            d2  : in STD_LOGIC;
            d3  : in STD_LOGIC;
            y   : out STD_LOGIC
        );
    end mux_4to1;

    architecture Behavioral of mux_4to1 is
    begin
        process(sel, d0, d1, d2, d3)
        begin
            case sel is
                when "00" => y <= d0;
                when "01" => y <= d1;
                when "10" => y <= d2;
                when "11" => y <= d3;
                when others => y <= '0';
            end case;
        end process;
    end Behavioral;
    """

    netlist = VHDLParser.synthesize_from_vhdl(mux_vhdl, "mux_4to1")

    # Assert exactly 1 consolidated MUX node is generated (NOT 5 duplicate nodes)
    assert len(netlist.nodes) == 1, f"Expected 1 consolidated node, got {len(netlist.nodes)}"
    mux_node = netlist.nodes[0]
    assert mux_node.type == "MUX"
    assert "MUX" in mux_node.label

    # Verify input ports include sel and data lines
    input_names = [p.name for p in mux_node.inputs]
    assert "sel" in input_names
    for d in ["d0", "d1", "d2", "d3"]:
        assert d in input_names

    # Verify output port is y
    output_names = [p.name for p in mux_node.outputs]
    assert "y" in output_names

    # Verify wires connect all primary inputs to the node and the node to primary output
    assert len(netlist.wires) >= 5
    out_wire = next((w for w in netlist.wires if w.target_node == "out_y"), None)
    assert out_wire is not None
    assert out_wire.source_node == mux_node.id

def test_ast_parser_combinational_adder():
    adder_vhdl = """
    library IEEE;
    use IEEE.STD_LOGIC_1164.ALL;

    entity full_adder is
        Port (
            a, b, cin : in STD_LOGIC;
            sum, cout : out STD_LOGIC
        );
    end full_adder;

    architecture Dataflow of full_adder is
    begin
        sum <= a xor b xor cin;
        cout <= (a and b) or (cin and (a xor b));
    end Dataflow;
    """
    netlist = VHDLParser.synthesize_from_vhdl(adder_vhdl, "full_adder")
    assert len(netlist.nodes) == 2
    labels = [n.label for n in netlist.nodes]
    assert any("sum" in l.lower() for l in labels)
    assert any("cout" in l.lower() for l in labels)

def test_mux_cycle_simulation():
    kg = CircuitKnowledgeGraph()
    updater = AutonomousGraphUpdater(kg)
    tools = CircuitTools(kg, updater)

    sim_res = tools.run_simulation("mux_4to1", duration_ns=100)
    assert sim_res["circuit_name"] == "mux_4to1"
    summary = sim_res["summary"]
    assert summary["assertions"]["total"] >= 5
    assert summary["assertions"]["passed"] == summary["assertions"]["total"], "All MUX assertions must pass"
    waveform = sim_res["waveform"]
    sig_names = [s["name"] for s in waveform.get("signals", [])]
    assert "sel" in sig_names
    assert "y" in sig_names
    assert "d0" in sig_names

def test_decoder_cycle_simulation():
    kg = CircuitKnowledgeGraph()
    updater = AutonomousGraphUpdater(kg)
    tools = CircuitTools(kg, updater)

    sim_res = tools.run_simulation("dec_2to4", duration_ns=100)
    assert sim_res["circuit_name"] == "dec_2to4"
    summary = sim_res["summary"]
    assert summary["assertions"]["total"] >= 4
    assert summary["assertions"]["passed"] == summary["assertions"]["total"], "All Decoder assertions must pass"
    waveform = sim_res["waveform"]
    sig_names = [s["name"] for s in waveform.get("signals", [])]
    assert "sel" in sig_names
    assert "y0" in sig_names
    assert "y3" in sig_names

def test_agent_self_healing_reflection():
    import asyncio
    from backend.app.agent.openrouter import openrouter_client

    async def _inner():
        # Test openrouter repair fallback directly on faulty VHDL missing IEEE library
        faulty_vhdl = """
        entity broken_gate is
            Port ( a : in STD_LOGIC; y : out STD_LOGIC );
        end broken_gate;
        architecture Beh of broken_gate is
        begin
            y <= not a;
        end Beh;
        """
        res = await openrouter_client.repair_circuit_design(
            vhdl_code=faulty_vhdl,
            errors=["Missing standard IEEE library: library IEEE; use IEEE.STD_LOGIC_1164.ALL;"],
            goal="Inverter gate",
            circuit_name="broken_gate"
        )
        assert res["repaired"] is True
        repaired_code = res["vhdl_code"]
        assert "ieee.std_logic_1164" in repaired_code.lower()

    asyncio.run(_inner())

def test_openrouter_boundary_extraction():
    import re
    # Simulates an LLM response with conversational prefix and suffix
    raw_llm_response = """
    Here is your synthesis-ready 4:1 multiplexer circuit design:

    library IEEE;
    use IEEE.STD_LOGIC_1164.ALL;

    entity mux4 is
        Port ( sel : in STD_LOGIC_VECTOR(1 downto 0); y : out STD_LOGIC );
    end mux4;

    architecture Arch of mux4 is
    begin
        y <= '1';
    end Arch;

    Hope this helps! Let me know if you need any adjustments.
    """
    start_match = re.search(r'\b(?:library\s+ieee|entity\s+[a-zA-Z0-9_]+)\b', raw_llm_response, re.IGNORECASE)
    end_matches = list(re.finditer(r'(?:end\s+[a-zA-Z0-9_\-]+|end)\s*;', raw_llm_response, re.IGNORECASE))
    assert start_match is not None
    assert len(end_matches) >= 2
    extracted = raw_llm_response[start_match.start():end_matches[-1].end()].strip()
    assert extracted.startswith("library IEEE;")
    assert extracted.endswith("end Arch;")
    assert "Hope this helps" not in extracted
