import os
import shutil
import asyncio
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app, project_mgr, agent, tools
from backend.app.agent.openrouter import openrouter_client

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_projects():
    test_pids = ["test_dyn_proj_routing", "test_dyn_neuron_proj", "test_dynamic_project_routing"]
    for pid in test_pids:
        pdir = os.path.join(project_mgr.base_dir, pid)
        if os.path.exists(pdir):
            shutil.rmtree(pdir, ignore_errors=True)
    yield
    for pid in test_pids:
        pdir = os.path.join(project_mgr.base_dir, pid)
        if os.path.exists(pdir):
            shutil.rmtree(pdir, ignore_errors=True)

def test_project_manager_get_project_and_top_file():
    p = project_mgr.get_project("scale1_full_adder")
    assert p is not None
    assert p["id"] == "scale1_full_adder"
    assert p["top_file"] == "src/full_adder.vhd"

    top = project_mgr.get_top_file("scale1_full_adder")
    assert top == "src/full_adder.vhd"

def test_get_project_endpoint():
    res = client.get("/api/projects/scale1_full_adder")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "scale1_full_adder"
    assert data["top_file"] == "src/full_adder.vhd"

def test_new_project_creation_and_top_file():
    pid = "test_dynamic_project_routing"
    res = client.post("/api/projects/create", json={
        "name": "Test Dynamic Project Routing",
        "scale": 2,
        "template_type": "rtl",
        "description": "Verification project for active project routing"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == pid
    assert data["top_file"] == f"src/{pid}.vhd"

    p = project_mgr.get_project(pid)
    assert p is not None
    assert p["top_file"] == f"src/{pid}.vhd"

    res_api = client.get(f"/api/projects/{pid}")
    assert res_api.status_code == 200
    assert res_api.json()["top_file"] == f"src/{pid}.vhd"

def test_agent_pipeline_materializes_into_new_project():
    pid = "test_dynamic_project_routing"
    circuit_name = "test_counter_core"

    async def _run():
        await agent.run_circuit_pipeline(
            goal="Design a 16-bit up-down counter module with clock enable",
            scale=2,
            circuit_name=circuit_name,
            project_id=pid
        )

    asyncio.run(_run())

    proj_dir = os.path.join(project_mgr.base_dir, pid)
    src_file = os.path.join(proj_dir, "src", f"{circuit_name}.vhd")
    tb_file = os.path.join(proj_dir, "tb", f"{circuit_name}_tb.vhd")
    spec_file = os.path.join(proj_dir, "docs", f"{circuit_name}_spec.md")

    assert os.path.exists(src_file), f"Expected {src_file} to exist in new project"
    assert os.path.exists(tb_file), f"Expected {tb_file} to exist in new project"
    assert os.path.exists(spec_file), f"Expected {spec_file} to exist in new project"

    with open(src_file, "r", encoding="utf-8") as f:
        content = f.read()
        assert f"entity {circuit_name} is" in content

def test_agent_chat_neural_intent_materializes_into_selected_project():
    pid = "test_dyn_neuron_proj"
    project_mgr.create_project(name="Test Dyn Neuron Proj", scale=3)

    async def _chat():
        return await openrouter_client.chat_with_copilot(
            message="Build me a 32 neuron array with 4 digit 7 segment display",
            circuit_context={"project_id": pid},
            tools_instance=tools,
            project_id=pid
        )

    res = asyncio.run(_chat())

    assert res["success"] is True
    assert res["action"] is not None
    assert res["action"]["circuit_name"] == "neural_processor_top"

    proj_dir = os.path.join(project_mgr.base_dir, pid)
    expected_files = [
        os.path.join(proj_dir, "src", "neuron_core.vhd"),
        os.path.join(proj_dir, "src", "neuron_layer_32.vhd"),
        os.path.join(proj_dir, "src", "display_4x7seg.vhd"),
        os.path.join(proj_dir, "src", "neural_processor_top.vhd"),
        os.path.join(proj_dir, "tb", "neural_processor_tb.vhd"),
        os.path.join(proj_dir, "docs", "neural_architecture_plan.md"),
    ]
    for ef in expected_files:
        assert os.path.exists(ef), f"Expected {ef} to exist in {pid}"

def test_api_chat_apply_code_writes_to_active_project():
    pid = "test_dynamic_project_routing"
    res = client.post("/api/agent/chat", json={
        "message": "Design a fast multiply accumulator pipeline",
        "project_id": pid,
        "circuit_context": {
            "circuit_name": "dsp_mac_pipeline",
            "project_id": pid
        }
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True

    mac_file = os.path.join(project_mgr.base_dir, pid, "src", "dsp_mac_pipeline.vhd")
    assert os.path.exists(mac_file)
