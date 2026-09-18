import os
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.agent.tools import CircuitTools
from backend.app.engine.ast_parser import VHDLParser
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater

client = TestClient(app)

@pytest.fixture
def agent_tools():
    kg = CircuitKnowledgeGraph()
    updater = AutonomousGraphUpdater(kg)
    return CircuitTools(kg=kg, updater=updater)

SAMPLE_UNCONNECTED_VHDL = """library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity sub_mod is
    port (
        clk     : in  std_logic;
        rst_n   : in  std_logic;
        data_in : in  std_logic;
        data_out: out std_logic
    );
end entity sub_mod;

architecture rtl of sub_mod is
begin
    process(clk, rst_n)
    begin
        if rst_n = '0' then
            data_out <= '0';
        elsif rising_edge(clk) then
            data_out <= data_in;
        end if;
    end process;
end architecture rtl;

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top_mod is
    port (
        sys_clk  : in  std_logic;
        sys_out  : out std_logic
    );
end entity top_mod;

architecture struct of top_mod is
    signal floating_sig : std_logic;
    component sub_mod is
        port (
            clk     : in  std_logic;
            rst_n   : in  std_logic;
            data_in : in  std_logic;
            data_out: out std_logic
        );
    end component;
begin
    u1: sub_mod port map (
        clk => sys_clk,
        rst_n => sys_clk,
        data_in => floating_sig,
        data_out => sys_out
    );
end architecture struct;
"""

def test_ast_parser_drc_detects_floating_pins():
    netlist = VHDLParser.synthesize_from_vhdl(SAMPLE_UNCONNECTED_VHDL, "top_mod")
    undriven_errors = [e for e in netlist.diagnostics if e.get("code") == "DRC-E101"]
    # rst_n and data_in are undriven in top_mod
    assert len(undriven_errors) >= 1
    assert any("data_in" in e.get("message", "") or "rst_n" in e.get("message", "") for e in undriven_errors)

def test_auto_fix_drc_tool(agent_tools):
    res = agent_tools.auto_fix_drc(
        project_id="test_autofix_proj",
        target_file="src/top_mod.vhd",
        vhdl_code=SAMPLE_UNCONNECTED_VHDL,
        circuit_name="top_mod"
    )
    assert res["success"] is True
    repaired_code = res["repaired_code"]
    # Check that ties were inserted
    assert "<= '0'" in repaired_code or "<= (others => '0')" in repaired_code or "=> '0'" in repaired_code or "=> '1'" in repaired_code
    assert res["netlist"] is not None
    # DRC error count on repaired code should be 0 undriven
    new_netlist = VHDLParser.synthesize_from_vhdl(repaired_code, "top_mod")
    new_undriven = [e for e in new_netlist.diagnostics if e.get("code") == "DRC-E101"]
    assert len(new_undriven) == 0

def test_rest_api_agent_autofix():
    resp = client.post("/api/agent/auto-fix", json={
        "project_id": "test_api_autofix",
        "target_file": "src/top_mod.vhd",
        "vhdl_code": SAMPLE_UNCONNECTED_VHDL,
        "circuit_name": "top_mod"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "repaired_code" in data
    assert "netlist" in data
    assert data["repaired_issues_count"] >= 1

def test_chat_history_continuity():
    # Test POST /api/agent/chat with chat_history
    resp = client.post("/api/agent/chat", json={
        "message": "What did I ask previously?",
        "context": {"circuit_name": "top_mod"},
        "chat_history": [
            {"isAgent": False, "text": "I am designing an ALU."},
            {"isAgent": True, "text": "Understood, you are designing a 32-bit ALU with arithmetic operations."}
        ]
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
