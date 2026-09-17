import pytest
import asyncio
from backend.app.agent.openrouter import format_studio_context, openrouter_client

def test_format_studio_context():
    sample_ctx = {
        "circuit_name": "Full Adder (1-bit)",
        "active_file": "src/full_adder.vhd",
        "gate_count": 5,
        "wire_count": 8,
        "probes": {"sum": 1, "cout": 0},
        "faults": {"w_xor1": "sa0"},
        "vhdl_code": "entity full_adder is\n  port(a, b, cin: in bit; sum, cout: out bit);\nend entity;",
        "netlist": {
            "primary_inputs": [{"name": "a"}, {"name": "b"}, {"name": "cin"}],
            "primary_outputs": [{"name": "sum"}, {"name": "cout"}],
            "nodes": [
                {"label": "XOR_1", "type": "xor"},
                {"label": "XOR_2", "type": "xor"},
                {"label": "AND_1", "type": "and"},
                {"label": "AND_2", "type": "and"},
                {"label": "OR_1", "type": "or"}
            ],
            "wires": [
                {"source_node": "XOR_1", "source_port": "out", "target_node": "XOR_2", "target_port": "in1"}
            ]
        }
    }

    formatted = format_studio_context(sample_ctx, "proj_scale1")
    assert "Full Adder (1-bit)" in formatted
    assert "src/full_adder.vhd" in formatted
    assert "XOR_1 [xor]" in formatted
    assert "XOR_1.out ➔ XOR_2.in1" in formatted
    assert "entity full_adder is" in formatted
    assert "Live Logic Probes" in formatted

def test_chat_with_copilot_direct_context_query():
    sample_ctx = {
        "circuit_name": "Full Adder (1-bit)",
        "active_file": "src/full_adder.vhd",
        "gate_count": 5,
        "wire_count": 8,
        "probes": {"sum": 1},
        "faults": {},
        "vhdl_code": "library ieee;\nuse ieee.std_logic_1164.all;",
        "netlist": {
            "nodes": [{"label": "XOR_GATE_1", "type": "xor"}]
        }
    }

    # Test without LLM key (fallback engine)
    res = asyncio.run(openrouter_client.chat_with_copilot(
        message="if i give you the current state of the canvas and the code what would you do with it ..",
        circuit_context=sample_ctx,
        api_key="none",
        project_id="scale1_full_adder"
    ))

    assert res["success"] is True
    reply = res["reply"]
    assert "Full Adder (1-bit)" in reply
    assert "src/full_adder.vhd" in reply
    assert "XOR_GATE_1" in reply
    assert "Cycle-Accurate Simulation" in reply


def test_sanitize_credentials():
    from backend.app.agent.openrouter import sanitize_credentials
    test_str = "Connecting to OpenRouter with sk-or-v1-abcdef1234567890abcdef and Bearer eyJhbGciOiJIUzI1NiJ9"
    sanitized = sanitize_credentials(test_str)
    assert "sk-or-v1-abcdef1234567890abcdef" not in sanitized
    assert "eyJhbGciOiJIUzI1NiJ9" not in sanitized
    assert "••••••••" in sanitized


def test_format_studio_context_enriched_sections():
    from backend.app.agent.openrouter import format_studio_context
    enriched_ctx = {
        "circuit_name": "alu_core",
        "active_file": "src/alu_core.vhd",
        "gate_count": 12,
        "wire_count": 24,
        "active_selection": {"type": "node", "label": "XOR_STAGE_1", "data": {"id": "xor_1"}},
        "attached_chips": [{"type": "wire", "label": "net_carry_out"}],
        "drc_issues": [
            {
                "severity": "error",
                "code": "DRC_FLOATING_INPUT",
                "target": "AND_GATE_3",
                "line": 42,
                "title": "Floating CMOS input pin 'in2'",
                "physicalConsequence": "Crowbar shoot-through current at ~VDD/2",
                "suggestedFix": "Tie pin to GND or active driver"
            }
        ],
        "simulation_summary": {
            "status": "PASSED",
            "duration_ns": 200,
            "clock_period_ns": 10,
            "assertions_passed": 18,
            "assertions_failed": 0,
            "critical_path_delay_ns": 4.8
        },
        "project_files": ["src/alu_core.vhd", "tb/alu_core_tb.vhd", "scripts/synth.tcl"],
        "vhdl_code": "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n\nentity alu_core is\nport(A, B: in std_logic; Y: out std_logic);\nend alu_core;\n\narchitecture rtl of alu_core is\nbegin\nY <= A xor B;\nend rtl;"
    }

    formatted = format_studio_context(enriched_ctx, "proj_alu")

    # Assert semantic section tags
    assert "<user_attached_focus>" in formatted
    assert "XOR_STAGE_1" in formatted
    assert "net_carry_out" in formatted

    assert "<drc_diagnostics count=\"1\">" in formatted
    assert "DRC_FLOATING_INPUT" in formatted
    assert "Crowbar shoot-through current" in formatted
    assert "Tie pin to GND" in formatted

    assert "<simulation_telemetry>" in formatted
    assert "20 clock cycles @ 10ns" in formatted
    assert "Critical Path Delay" in formatted
    assert "4.8 ns" in formatted

    assert "<project_manifest count=\"3\">" in formatted
    assert "tb/alu_core_tb.vhd" in formatted
