import os
import shutil
import pytest
import asyncio
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater
from backend.app.agent.tools import CircuitTools
from backend.app.agent.openrouter import openrouter_client

client = TestClient(app)


@pytest.fixture
def agent_tools():
    kg = CircuitKnowledgeGraph()
    updater = AutonomousGraphUpdater(kg)
    return CircuitTools(kg=kg, updater=updater)


def test_sandboxed_filesystem_tools(agent_tools):
    test_project = "test_sandbox_fs_unit"
    proj_dir = os.path.abspath(os.path.join("projects", test_project))

    try:
        # 1. Write file
        write_res = agent_tools.fs_write_file(
            project_id=test_project,
            path="rtl/counter.vhd",
            content="library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n-- Initial counter\nentity counter is end;\n"
        )
        assert write_res["success"] is True
        assert os.path.exists(os.path.join(proj_dir, "rtl", "counter.vhd"))

        # 2. Read file (full & sliced)
        read_res = agent_tools.fs_read_file(project_id=test_project, path="rtl/counter.vhd")
        assert read_res["success"] is True
        assert "Initial counter" in read_res["content"]
        assert read_res["total_lines"] >= 4

        slice_res = agent_tools.fs_read_file(project_id=test_project, path="rtl/counter.vhd", start_line=3, end_line=3)
        assert slice_res["success"] is True
        assert slice_res["content"].strip() == "-- Initial counter"

        # 3. Surgical edit
        edit_res = agent_tools.fs_edit_file(
            project_id=test_project,
            path="rtl/counter.vhd",
            target_snippet="-- Initial counter",
            replacement_snippet="-- Synthesizable 8-bit Up-Counter"
        )
        assert edit_res["success"] is True
        read_after_edit = agent_tools.fs_read_file(project_id=test_project, path="rtl/counter.vhd")
        assert "Synthesizable 8-bit Up-Counter" in read_after_edit["content"]
        assert "-- Initial counter" not in read_after_edit["content"]

        # 4. Search files
        search_res = agent_tools.fs_search_files(
            project_id=test_project,
            query="Up-Counter"
        )
        assert search_res["success"] is True
        assert search_res["match_count"] >= 1
        assert any("rtl" in m["file"] for m in search_res["matches"])

        # 5. List files
        list_res = agent_tools.fs_list_files(project_id=test_project)
        assert list_res["success"] is True
        assert any("counter.vhd" in f["path"] for f in list_res["files"])

        # 6. Delete file
        del_res = agent_tools.fs_delete_file(project_id=test_project, path="rtl/counter.vhd")
        assert del_res["success"] is True
        assert not os.path.exists(os.path.join(proj_dir, "rtl", "counter.vhd"))

    finally:
        if os.path.exists(proj_dir):
            shutil.rmtree(proj_dir, ignore_errors=True)


def test_security_sandbox_traversal_rejection(agent_tools):
    test_project = "test_security_proj"

    traversal_paths = [
        "../escaped.vhd",
        "..\\escaped.vhd",
        "nested/../../secret.txt",
        "/etc/passwd",
        "C:\\Windows\\System32\\calc.exe"
    ]

    for evil_path in traversal_paths:
        with pytest.raises(PermissionError):
            agent_tools.fs_write_file(project_id=test_project, path=evil_path, content="hacked")

        with pytest.raises(PermissionError):
            agent_tools.fs_read_file(project_id=test_project, path=evil_path)

    disp_res = agent_tools.execute_tool(
        tool_name="fs_write_file",
        arguments={"project_id": test_project, "path": "../hacked.vhd", "content": "bad"}
    )
    assert disp_res["success"] is False
    assert disp_res.get("security_error") is True


def test_circuit_benchmarking(agent_tools):
    bench_res = agent_tools.eda_benchmark_circuit(
        circuit_name="full_adder_gate_level",
        duration_ns=100
    )
    assert bench_res["success"] is True
    assert bench_res["circuit_name"] == "full_adder_gate_level"

    metrics = bench_res["benchmark_results"]
    assert metrics["gate_count"] >= 5
    assert metrics["max_clock_frequency_mhz"] > 0
    assert metrics["est_critical_path_delay_ns"] > 0
    assert metrics["simulation_throughput_m_evals_sec"] > 0
    assert metrics["simulated_cycles"] > 0
    assert metrics["assertions_passed"] >= 4
    assert metrics["assertion_coverage_percent"] == 100.0


def test_tool_definitions_and_dispatcher(agent_tools):
    defs = agent_tools.get_tool_definitions()
    assert isinstance(defs, list)
    assert len(defs) >= 11

    names = set()
    for tool_schema in defs:
        assert tool_schema.get("type") == "function"
        fn = tool_schema.get("function", {})
        assert "name" in fn
        assert "description" in fn
        assert "parameters" in fn
        names.add(fn["name"])

    expected_tools = {
        "fs_list_files", "fs_read_file", "fs_write_file", "fs_edit_file",
        "fs_delete_file", "fs_search_files", "eda_lint_code",
        "eda_synthesize_netlist", "eda_run_simulation",
        "eda_benchmark_circuit", "eda_query_knowledge_graph"
    }
    assert expected_tools.issubset(names)

    lint_res = agent_tools.execute_tool(
        tool_name="eda_lint_code",
        arguments={"vhdl_code": "entity foo is end; architecture rtl of foo is begin end;"}
    )
    assert lint_res["success"] is True
    assert len(lint_res["entities"]) == 1

    bad_res = agent_tools.execute_tool(tool_name="non_existent_tool", arguments={})
    assert bad_res["success"] is False
    assert "Unknown tool" in bad_res["error"]


def test_rest_endpoints_for_tools_and_benchmark():
    # 1. GET /api/agent/tools
    res = client.get("/api/agent/tools")
    assert res.status_code == 200
    data = res.json()
    assert "tools" in data
    assert len(data["tools"]) >= 11

    # 2. POST /api/agent/tools/execute
    exec_res = client.post("/api/agent/tools/execute", json={
        "tool_name": "eda_lint_code",
        "arguments": {"vhdl_code": "entity unit_test is end; architecture behavioral of unit_test is begin end;"},
        "project_id": "scale1_full_adder"
    })
    assert exec_res.status_code == 200
    exec_data = exec_res.json()
    assert exec_data["success"] is True

    # 3. POST /api/agent/benchmark
    bench_res = client.post("/api/agent/benchmark", json={
        "circuit_name": "full_adder_gate_level",
        "duration_ns": 100
    })
    assert bench_res.status_code == 200
    b_data = bench_res.json()
    assert b_data["success"] is True
    assert "benchmark_results" in b_data


def test_chat_with_tools_offline_fallback(agent_tools):
    res = asyncio.run(openrouter_client.chat_with_copilot(
        message="Please benchmark the full_adder_gate_level circuit architecture",
        circuit_context={"circuit_name": "full_adder_gate_level", "gate_count": 5, "wire_count": 8},
        tools_instance=agent_tools,
        project_id="scale1_full_adder"
    ))
    assert res["success"] is True
    assert "Benchmark Results" in res["reply"]
    assert "Gate Count" in res["reply"] or "Max Clock" in res["reply"]

    res_files = asyncio.run(openrouter_client.chat_with_copilot(
        message="List all files in current workspace",
        circuit_context={"circuit_name": "full_adder_gate_level"},
        tools_instance=agent_tools,
        project_id="scale1_full_adder"
    ))
    assert res_files["success"] is True
    assert "Workspace Files" in res_files["reply"] or "files" in res_files["reply"].lower()
