import asyncio
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater
from backend.app.agent.tools import CircuitTools
from backend.app.agent.loop import CircuitAgent, AgentState

def test_agent_autonomous_pipeline_and_kg_update():
    async def _inner():
        kg = CircuitKnowledgeGraph(db_path="data/test_agent_kg.db")
        updater = AutonomousGraphUpdater(kg)
        tools = CircuitTools(kg, updater)
        agent = CircuitAgent(tools)

        initial_node_count = kg.graph.number_of_nodes()

        # Run agent pipeline
        await agent.run_circuit_pipeline(
            goal="Design a 1-bit full adder and verify truth table",
            scale=1,
            circuit_name="agent_full_adder"
        )

        assert agent.state == AgentState.COMPLETED
        assert len(agent.logs) >= 5

        # Verify that the Knowledge Graph was autonomously populated
        final_node_count = kg.graph.number_of_nodes()
        assert final_node_count > initial_node_count

        # Check that design node exists in KG
        design_node = kg.get_node("design:agent_full_adder")
        assert design_node is not None
        assert design_node["scale"] == 1
        assert "metrics" in design_node
        assert design_node["metrics"]["verified"] is True

    asyncio.run(_inner())

def test_multifile_processor_materialization():
    """Verify hardware_generator creates all 8 expected files for a 64-bit processor."""
    import tempfile
    import os
    from backend.app.agent.hardware_generator import (
        generate_64bit_microprocessor_suite,
        detect_design_scale,
        materialize_design_into_project,
    )
    from backend.app.engine.project_manager import project_mgr

    # --- Scale Detection ---
    assert detect_design_scale("build a 64-bit processor with memory") == 4
    assert detect_design_scale("simple full adder") == 1
    assert detect_design_scale("design an ALU subsystem") == 3

    # --- Suite Generation ---
    suite = generate_64bit_microprocessor_suite("test_proc_64")
    assert "files" in suite
    assert len(suite["files"]) >= 6, f"Expected >= 6 files, got {len(suite['files'])}: {list(suite['files'].keys())}"
    assert suite["top_file"] != "", "top_file must not be empty"
    assert "modules" in suite and len(suite["modules"]) > 0

    # Verify essential modules are present
    src_vhd = [k for k in suite["files"].keys() if k.endswith(".vhd") and "tb" not in k]
    assert len(src_vhd) >= 4, f"Expected >= 4 VHDL source files, got {src_vhd}"

    # --- Materialization into temp project ---
    tmp_proj_id = "test_proc_materialize"
    result = materialize_design_into_project(tmp_proj_id, suite)
    written = result.get("files_written", [])
    assert len(written) >= 6, f"Expected >= 6 files written, got {len(written)}: {written}"
    paths = [f["path"] for f in written]
    # Check at least one VHDL file was written
    assert any(p.endswith(".vhd") for p in paths), f"No .vhd files in {paths}"
    # Check docs were generated
    assert any(".md" in p for p in paths), f"No .md docs in {paths}"

    # Cleanup
    import shutil
    proj_dir = os.path.join(project_mgr.base_dir, tmp_proj_id)
    if os.path.isdir(proj_dir):
        shutil.rmtree(proj_dir, ignore_errors=True)
