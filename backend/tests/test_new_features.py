import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.engine.ast_parser import VHDLParser

client = TestClient(app)

def test_vhdl_lint_endpoint():
    code = """
    library IEEE;
    use IEEE.STD_LOGIC_1164.ALL;
    entity my_gate is
        port (a, b: in std_logic; y: out std_logic);
    end my_gate;
    architecture rtl of my_gate is
    begin
        y <= a and b;
    end rtl;
    """
    res = client.post("/api/vhdl/lint", json={"vhdl_code": code})
    assert res.status_code == 200
    data = res.json()
    assert data["is_valid"] is True
    assert len(data["entities"]) == 1
    assert data["entities"][0]["name"] == "my_gate"

def test_vhdl_synthesize_endpoint():
    code = """
    library IEEE;
    use IEEE.STD_LOGIC_1164.ALL;
    entity alu_core is
        port (
            a, b: in std_logic_vector(31 downto 0);
            res: out std_logic_vector(31 downto 0)
        );
    end alu_core;
    architecture rtl of alu_core is
    begin
        res <= a and b;
    end rtl;
    """
    res = client.post("/api/vhdl/synthesize", json={"vhdl_code": code, "circuit_name": "alu_core"})
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "alu_core"
    assert len(data["primary_inputs"]) == 2
    assert len(data["primary_outputs"]) == 1
    assert len(data["nodes"]) >= 1

def test_agent_models_and_config():
    models_res = client.get("/api/agent/models")
    assert models_res.status_code == 200
    models_data = models_res.json()
    assert len(models_data["models"]) >= 4

    config_res = client.post("/api/agent/config", json={
        "openrouter_key": "sk-or-v1-fake-test-key-1234567890",
        "default_model": "anthropic/claude-3.5-sonnet"
    })
    assert config_res.status_code == 200
    assert config_res.json()["has_key"] is True

def test_fault_injection_and_persistence():
    # 1. Run baseline simulation
    res_base = client.post("/api/circuits/simulate", json={"circuit_name": "full_adder", "duration_ns": 50})
    assert res_base.status_code == 200

    # 2. Inject stuck-at-0 on net Cout
    fault_res = client.post("/api/agent/intervention", json={
        "action": "fault",
        "net_name": "Cout",
        "fault_value": "0"
    })
    assert fault_res.status_code == 200
    assert fault_res.json()["fault"] == "0"
    assert fault_res.json()["active_faults"]["Cout"] == "0"

    # 3. Re-run simulation: Cout must remain 0 throughout
    res_faulted = client.post("/api/circuits/simulate", json={"circuit_name": "full_adder", "duration_ns": 50})
    assert res_faulted.status_code == 200
    signals = res_faulted.json()["waveform"]["signals"]
    cout_sig = next(s for s in signals if s["name"] == "Cout")
    # Every waveform point for Cout should be '0'
    for pt in cout_sig["transitions"]:
        assert pt["val"] == "0"

    # 4. Clear fault
    clear_res = client.post("/api/agent/intervention", json={
        "action": "fault",
        "net_name": "Cout",
        "fault_value": "clear"
    })
    assert clear_res.status_code == 200
    assert "Cout" not in clear_res.json()["active_faults"]

def test_vhdl_sanitized_design():
    # Design with spaces and leading digits like "1-Bit Full Adder"
    from backend.app.main import tools
    res = tools.design_circuit("1-Bit Full Adder", 1, "Design 1-bit adder")
    assert res["parse_valid"] is True
    assert len(res["lint_messages"]) == 0
    # Entity name must be a clean valid identifier
    assert res["circuit_name"] == "c_1_bit_full_adder"
    assert "entity c_1_bit_full_adder is" in res["vhdl_code"]

def test_goal_aware_circuit_design():
    from backend.app.main import tools

    # 1. Multiplexer
    mux_res = tools.design_circuit("mux4", 1, "Design a 4-to-1 Multiplexer")
    assert "d0" in mux_res["vhdl_code"] and "sel" in mux_res["vhdl_code"]
    assert mux_res["parse_valid"] is True

    # 2. Priority Encoder
    enc_res = tools.design_circuit("p_enc", 1, "Synthesize 4-to-2 Priority Encoder")
    assert "grant" in enc_res["vhdl_code"] and "req" in enc_res["vhdl_code"]
    assert enc_res["parse_valid"] is True

    # 3. Decoder
    dec_res = tools.design_circuit("dec24", 1, "Design a 2-to-4 binary decoder")
    assert "sel" in dec_res["vhdl_code"] and "en" in dec_res["vhdl_code"]
    assert dec_res["parse_valid"] is True

def test_agent_chat_endpoint():
    res = client.post("/api/agent/chat", json={
        "message": "Explain how a multiplexer works and what it selects",
        "circuit_context": {
            "circuit_name": "full_adder",
            "gate_count": 5,
            "wire_count": 8,
            "probes": {"A": "1", "B": "0", "Cin": "1", "Sum": "0", "Cout": "1"}
        }
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["reply"]) > 20
    assert "Multiplexer" in data["reply"] or "full_adder" in data["reply"]

def test_agent_key_status_endpoint():
    res = client.get("/api/agent/key-status")
    assert res.status_code == 200
    data = res.json()
    assert "is_configured" in data
    assert "source" in data
    assert "masked_key" in data
    # Ensure plaintext key is NOT exposed
    if data["masked_key"]:
        assert "••••" in data["masked_key"]

def test_key_masking_and_env_support(monkeypatch):
    from backend.app.agent.openrouter import mask_key, OpenRouterClient

    assert mask_key("sk-or-v1-abcdef1234567890") == "sk-or-v••••••7890"
    assert mask_key("short") == "••••••••"
    assert mask_key(None) is None

    # Test environment variable fallback
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-env-secret-token-999")
    test_client = OpenRouterClient(api_key=None)
    assert test_client.api_key == "sk-or-v1-env-secret-token-999"
    status = test_client.get_key_status()
    assert status["is_configured"] is True
    assert status["source"] == "env"
    assert "••••" in status["masked_key"]
    assert "secret" not in status["masked_key"]

def test_model_driven_kg_retrieval_planning():
    import asyncio
    from backend.app.agent.openrouter import openrouter_client

    plan = asyncio.run(openrouter_client.plan_knowledge_retrieval(
        goal="Design a 4-to-1 multiplexer with enable",
        scale=1,
        circuit_name="mux4_en"
    ))
    assert "queries" in plan
    assert len(plan["queries"]) >= 1
    assert "hazards_to_prevent" in plan
    assert len(plan["hazards_to_prevent"]) >= 1
    assert "architectural_notes" in plan


def test_synthesis_drc_and_multifile_connections():
    # Structural code with incomplete port map and missing connections
    code_with_faults = """
    library IEEE;
    use IEEE.STD_LOGIC_1164.ALL;

    entity top_adder is
        port (
            A, B : in std_logic;
            Sum, Cout : out std_logic
        );
    end top_adder;

    architecture structural of top_adder is
        signal s1 : std_logic;
    begin
        -- HA1 is missing port map for b and cout!
        HA1: entity work.half_adder
            port map (a => A, sum => s1);

        -- Multiple driver contention: both assign Sum
        Sum <= s1;
        Sum <= A;
    end structural;
    """
    res = client.post("/api/vhdl/synthesize", json={"vhdl_code": code_with_faults, "circuit_name": "top_adder"})
    assert res.status_code == 200
    data = res.json()
    assert "diagnostics" in data
    diags = data["diagnostics"]
    assert len(diags) >= 1

    # Check for incomplete port map error (DRC-E103)
    codes = [d["code"] for d in diags]
    assert "DRC-E103" in codes or "DRC-E101" in codes or "DRC-E102" in codes

    # Verify hardware consequence is explained
    for d in diags:
        assert "hardware_consequence" in d
        assert len(d["hardware_consequence"]) > 20
        assert "suggested_fix" in d

    # Verify nodes have source_file annotations
    for n in data["nodes"]:
        assert "source_file" in n
        assert n["source_file"] is not None

def test_agent_auto_repair_and_synthesize():
    res = client.post("/api/agent/chat", json={
        "message": "Auto-fix all identified DRC errors, repair floating pins, and synthesize clean design",
        "circuit_context": {
            "circuit_name": "full_adder",
            "vhdl_code": "entity full_adder is port(A, B: in bit; S: out bit); end;",
            "gate_count": 5,
            "wire_count": 7
        }
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "Autonomous Circuit Repair & Synthesis Complete" in data["reply"]
    assert "<details" in data["reply"]
    assert data.get("action", {}).get("type") == "apply_code"
    assert data.get("action", {}).get("repaired") is True
    assert len(data.get("action", {}).get("vhdl_code", "")) > 50

