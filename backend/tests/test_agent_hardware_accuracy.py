"""
Integration tests for AI Agent hardware synthesis accuracy,
parametric generation, surgical in-place modification, and DRC auto-repair.
"""

import pytest
from backend.app.agent.openrouter import openrouter_client
from backend.app.agent.hardware_generator import (
    generate_hardware_from_prompt,
    modify_existing_hardware,
    generate_gate_primitive,
    generate_multiplexer,
    generate_arithmetic_adder,
    generate_synchronous_counter,
    generate_alu_subsystem,
)
from backend.app.agent.tools import CircuitTools
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater


@pytest.fixture
def tools():
    kg = CircuitKnowledgeGraph()
    updater = AutonomousGraphUpdater(kg)
    return CircuitTools(kg, updater)


def test_parametric_hardware_generator_inverter():
    res = generate_hardware_from_prompt("design a fast CMOS inverter gate")
    assert res["circuit_name"] == "fast_cmos_inverter_gate" or "inverter" in res["circuit_name"]
    assert "entity" in res["vhdl_code"].lower()
    assert "not" in res["vhdl_code"].lower()
    assert res["scale"] == 1


def test_parametric_hardware_generator_mux():
    res = generate_hardware_from_prompt("build a 4-to-1 multiplexer with enable")
    assert "mux" in res["circuit_name"].lower() or "multiplexer" in res["circuit_name"].lower()
    assert "sel" in res["vhdl_code"].lower()
    assert "case" in res["vhdl_code"].lower() or "when" in res["vhdl_code"].lower()
    assert res["scale"] == 2


def test_parametric_hardware_generator_counter():
    res = generate_hardware_from_prompt("create an 8-bit synchronous counter with async reset and load")
    assert "counter" in res["circuit_name"]
    assert "cnt_reg" in res["vhdl_code"] or "count" in res["vhdl_code"].lower()
    assert "rising_edge(clk)" in res["vhdl_code"]
    assert res["scale"] == 2


def test_parametric_hardware_generator_alu():
    res = generate_hardware_from_prompt("synthesize a 32-bit arithmetic logic unit")
    assert "alu" in res["circuit_name"]
    assert "std_logic_vector(31 downto 0)" in res["vhdl_code"].lower()
    assert "zero" in res["vhdl_code"].lower()
    assert res["scale"] == 3


def test_modify_existing_hardware_surgical_led():
    initial_vhdl = """library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity custom_adder is
    Port (
        A    : in  STD_LOGIC;
        B    : in  STD_LOGIC;
        Cin  : in  STD_LOGIC;
        Sum  : out STD_LOGIC;
        Cout : out STD_LOGIC
    );
end custom_adder;

architecture Behavioral of custom_adder is
begin
    Sum <= A xor B xor Cin;
    Cout <= (A and B) or (Cin and (A xor B));
end Behavioral;"""

    mod = modify_existing_hardware(initial_vhdl, "attach an LED to Cout to monitor overflow")
    assert mod["modified"] is True
    assert "LED_" in mod["vhdl_code"] and ("Cout" in mod["vhdl_code"] or "cout" in mod["vhdl_code"])
    assert "LED_" in mod["vhdl_code"]
    # Verify the original entity name was preserved
    assert "entity custom_adder is" in mod["vhdl_code"]


def test_modify_existing_hardware_surgical_inversion():
    initial_vhdl = """library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity my_unit is
    Port (
        clk  : in  STD_LOGIC;
        q    : out STD_LOGIC
    );
end my_unit;

architecture rtl of my_unit is
begin
    q <= '1';
end rtl;"""

    mod = modify_existing_hardware(initial_vhdl, "invert q with a not gate")
    assert mod["modified"] is True
    assert "q_inv : out STD_LOGIC" in mod["vhdl_code"]
    assert "q_inv <= not q;" in mod["vhdl_code"]
    assert "entity my_unit is" in mod["vhdl_code"]


@pytest.mark.anyio
async def test_chat_with_copilot_parametric_synthesis(tools):
    ctx = {
        "circuit_name": "inv_test",
        "vhdl_code": "",
        "project_id": "test_proj",
        "active_file": "src/inv_test.vhd"
    }

    res = await openrouter_client.chat_with_copilot(
        message="build a CMOS inverter gate",
        circuit_context=ctx,
        tools_instance=tools,
        project_id="test_proj"
    )

    assert res["success"] is True
    assert res["action"] is not None
    assert res["action"]["type"] == "apply_code"
    assert "entity" in res["action"]["vhdl_code"].lower()
    assert "not" in res["action"]["vhdl_code"].lower()


@pytest.mark.anyio
async def test_chat_with_copilot_surgical_led_attach(tools):
    initial_vhdl = """library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity special_processor is
    Port (
        clk      : in  STD_LOGIC;
        rst      : in  STD_LOGIC;
        overflow : out STD_LOGIC
    );
end special_processor;

architecture rtl of special_processor is
begin
    overflow <= '0';
end rtl;"""

    ctx = {
        "circuit_name": "special_processor",
        "vhdl_code": initial_vhdl,
        "project_id": "test_proj",
        "active_file": "src/special_processor.vhd"
    }

    res = await openrouter_client.chat_with_copilot(
        message="connect an LED to overflow",
        circuit_context=ctx,
        tools_instance=tools,
        project_id="test_proj"
    )

    assert res["success"] is True
    assert res["action"] is not None
    assert res["action"]["type"] == "apply_code"
    assert "entity special_processor is" in res["action"]["vhdl_code"]
    assert "LED_overflow" in res["action"]["vhdl_code"]


@pytest.mark.anyio
async def test_chat_with_copilot_drc_autofix_with_canvas_context(tools):
    # DRC with floating input pin
    drc_issues = [
        {
            "code": "DRC-E101",
            "severity": "error",
            "title": "Floating CMOS Input Pin",
            "message": "Input pin Cin has no driving net or pull-up/pull-down rail.",
            "target_node": "u_fa",
            "target_port": "Cin",
            "hardware_consequence": "PMOS and NMOS channels turn ON simultaneously."
        }
    ]

    ctx = {
        "circuit_name": "faulty_adder",
        "vhdl_code": "",
        "project_id": "scale1_full_adder",
        "active_file": "src/full_adder.vhd",
        "drc_issues": drc_issues
    }

    res = await openrouter_client.chat_with_copilot(
        message="autofix all drc issues on the canvas",
        circuit_context=ctx,
        tools_instance=tools,
        project_id="scale1_full_adder"
    )

    assert res["success"] is True
    assert res["action"] is not None
    assert res["action"]["type"] == "apply_code"
    assert res["action"].get("repaired") is True
    assert "entity" in res["action"]["vhdl_code"].lower()
