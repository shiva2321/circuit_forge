import pytest
from backend.app.main import app, tools
from backend.app.agent.hardware_generator import generate_32_neuron_suite, materialize_design_into_project
from backend.app.agent.openrouter import openrouter_client
from backend.app.engine.ast_parser import VHDLParser
from fastapi.testclient import TestClient

client = TestClient(app)

def test_generate_32_neuron_suite_files():
    suite = generate_32_neuron_suite("neural_processor_top")
    assert suite["circuit_name"] == "neural_processor_top"
    assert suite["scale"] == 3
    assert len(suite["files"]) >= 6
    assert "src/neuron_core.vhd" in suite["files"]
    assert "src/neuron_layer_32.vhd" in suite["files"]
    assert "src/display_4x7seg.vhd" in suite["files"]
    assert "src/neural_processor_top.vhd" in suite["files"]
    assert "tb/neural_processor_tb.vhd" in suite["files"]
    assert "docs/neural_architecture_plan.md" in suite["files"]

    # Verify each VHDL file parses cleanly
    for rel_path in ("src/neuron_core.vhd", "src/neuron_layer_32.vhd", "src/display_4x7seg.vhd", "src/neural_processor_top.vhd"):
        code = suite["files"][rel_path]
        res = VHDLParser.parse_code(code)
        assert res.is_valid is True, f"Failed to parse {rel_path}: {res.errors}"

def test_synthesize_neural_processor_netlist():
    suite = generate_32_neuron_suite("neural_processor_top")
    top_code = suite["files"]["src/neural_processor_top.vhd"]
    synth_res = tools.eda_synthesize_netlist(vhdl_code=top_code, circuit_name="neural_processor_top")
    assert synth_res["success"] is True
    nl = synth_res["netlist"]
    assert len(nl["nodes"]) > 0
    assert len(nl["wires"]) > 0

@pytest.mark.anyio
async def test_user_prompt_neural_processor_chat():
    user_prompt = (
        "lets design a complete working 32 neuron using gates and other components as needed which will also; "
        "somwhow provision when we connect much of them in some way and impose some electric signal that will "
        "output something on 4 digital disply we have plan and desing and syntehsize on canvas and in code as well ."
    )
    res = await openrouter_client.chat_with_copilot(
        message=user_prompt,
        tools_instance=tools,
        circuit_context={"circuit_name": "processor_32_bit", "vhdl_code": "-- stub"},
        project_id="test_neural_proj"
    )

    assert res["success"] is True
    assert res["action"] is not None
    assert res["action"]["type"] == "apply_code"
    assert res["action"]["circuit_name"] == "neural_processor_top"
    assert "32-Neuron Hardware Array with 4-Digit 7-Segment Display Synthesized" in res["reply"]
    assert "src/neuron_core.vhd" in res["reply"]
    assert "src/neuron_layer_32.vhd" in res["reply"]
    assert "src/display_4x7seg.vhd" in res["reply"]
    assert "src/neural_processor_top.vhd" in res["reply"]
    assert "docs/neural_architecture_plan.md" in res["reply"]
