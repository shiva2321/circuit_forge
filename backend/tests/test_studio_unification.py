import pytest
import os
import json
from fastapi.testclient import TestClient
from backend.app.main import app, tools
from backend.app.engine.project_manager import project_mgr
from backend.app.agent.openrouter import openrouter_client

client = TestClient(app)

@pytest.fixture
def test_project():
    proj_id = "test_unification_proj"
    project_mgr.create_project(proj_id, "Scale 1 Gate Level", "Test project for unification")
    yield proj_id
    # Teardown
    import shutil
    proj_dir = os.path.join(project_mgr.base_dir, proj_id)
    if os.path.exists(proj_dir):
        shutil.rmtree(proj_dir, ignore_errors=True)


def test_validate_python_code():
    valid_py = "def hello():\n    return 42\n"
    res = tools.eda_validate_code(valid_py, language="python")
    assert res["success"] is True
    assert res["is_valid"] is True
    assert res["error_count"] == 0

    invalid_py = "def broken(:\n    pass\n"
    res_bad = tools.eda_validate_code(invalid_py, language="python")
    assert res_bad["is_valid"] is False
    assert res_bad["error_count"] > 0
    assert res_bad["messages"][0]["rule_id"] == "PY_SYNTAX_ERR"


def test_validate_json_code():
    valid_json = '{"name": "esp32", "clock": 240}'
    res = tools.eda_validate_code(valid_json, language="json")
    assert res["is_valid"] is True

    invalid_json = '{"name": "esp32", broken}'
    res_bad = tools.eda_validate_code(invalid_json, language="json")
    assert res_bad["is_valid"] is False
    assert res_bad["messages"][0]["rule_id"] == "JSON_SYNTAX_ERR"


def test_validate_verilog_code():
    valid_v = "module inverter(input a, output y); assign y = ~a; endmodule"
    res = tools.eda_validate_code(valid_v, language="verilog")
    assert res["is_valid"] is True

    bad_v = "module inverter(input a, output y); assign y = ~a;"
    res_bad = tools.eda_validate_code(bad_v, language="verilog")
    assert res_bad["is_valid"] is False
    assert res_bad["messages"][0]["rule_id"] == "VERILOG_UNCLOSED_MODULE"


def test_validate_c_cpp_code():
    valid_c = "#include <stdio.h>\nint main() { return 0; }\n"
    res = tools.eda_validate_code(valid_c, language="c")
    assert res["is_valid"] is True

    unbalanced_c = "int main() { if (1) { return 0; }\n"
    res_bad = tools.eda_validate_code(unbalanced_c, language="c")
    assert res_bad["is_valid"] is False
    assert res_bad["messages"][0]["rule_id"] == "BRACE_MISMATCH"


def test_export_lifecycle_artifacts(test_project):
    # 1. Export BOM
    res_bom = tools.eda_export_lifecycle_artifact(
        project_id=test_project,
        artifact_type="bom",
        circuit_name="scale1_full_adder"
    )
    assert res_bom["success"] is True
    bom_path = os.path.join(project_mgr.base_dir, test_project, "bom.json")
    assert os.path.exists(bom_path)

    # 2. Export C HAL Driver
    res_c = tools.eda_export_lifecycle_artifact(
        project_id=test_project,
        artifact_type="c_hal",
        circuit_name="scale1_full_adder"
    )
    assert res_c["success"] is True
    c_path = os.path.join(project_mgr.base_dir, test_project, "main", "app_main.c")
    assert os.path.exists(c_path)

    # 3. Export Rust PAC
    res_rust = tools.eda_export_lifecycle_artifact(
        project_id=test_project,
        artifact_type="rust_pac",
        circuit_name="scale1_full_adder"
    )
    assert res_rust["success"] is True
    rust_path = os.path.join(project_mgr.base_dir, test_project, "src", "pac.rs")
    assert os.path.exists(rust_path)

    # 4. Export Root of Trust Security Manifest
    res_sec = tools.eda_export_lifecycle_artifact(
        project_id=test_project,
        artifact_type="security_manifest",
        circuit_name="scale1_full_adder"
    )
    assert res_sec["success"] is True
    sec_path = os.path.join(project_mgr.base_dir, test_project, "security", "manifest.json")
    assert os.path.exists(sec_path)


def test_tool_execution_dispatch(test_project):
    # Test eda_validate_code via execute_tool
    val_res = tools.execute_tool("eda_validate_code", {
        "code": "x = 10\nprint(x)",
        "language": "python"
    }, default_project_id=test_project)
    assert val_res["success"] is True
    assert val_res["is_valid"] is True

    # Test eda_export_lifecycle_artifact via execute_tool
    exp_res = tools.execute_tool("eda_export_lifecycle_artifact", {
        "project_id": test_project,
        "artifact_type": "dfm_stackup",
        "circuit_name": "scale1_full_adder"
    }, default_project_id=test_project)
    assert exp_res["success"] is True
    stack_path = os.path.join(project_mgr.base_dir, test_project, "constraints", "stackup.json")
    assert os.path.exists(stack_path)


@pytest.mark.anyio
async def test_openrouter_nlp_export_and_validate(test_project):
    # Test NLP intent for exporting BOM
    res_nlp = await openrouter_client.chat_with_copilot(
        message="export bom to project",
        circuit_context={"circuit_name": "full_adder_gate_level"},
        project_id=test_project,
        tools_instance=tools
    )
    assert res_nlp["success"] is True
    assert "bom" in res_nlp["reply"].lower()
    assert len(res_nlp["tool_history"]) > 0

    # Test NLP intent for code validation
    res_val = await openrouter_client.chat_with_copilot(
        message="check syntax for python ```print('hello')```",
        circuit_context={},
        project_id=test_project,
        tools_instance=tools
    )
    assert res_val["success"] is True
    assert "Diagnostics" in res_val["reply"]


def test_rest_endpoints(test_project):
    # 1. POST /api/code/validate
    r = client.post("/api/code/validate", json={
        "code": "print('hello')",
        "language": "python"
    })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["is_valid"] is True

    # 2. POST /api/lifecycle/export-artifact
    r2 = client.post("/api/lifecycle/export-artifact", json={
        "project_id": test_project,
        "artifact_type": "multiphysics",
        "circuit_name": "scale1_full_adder"
    })
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["success"] is True
    rep_path = os.path.join(project_mgr.base_dir, test_project, "reports", "multiphysics.json")
    assert os.path.exists(rep_path)
