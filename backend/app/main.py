"""
CircuitForge FastAPI Main Server
Provides REST APIs and WebSocket stream for the Agentic Circuit EDA Studio,
Simulation Engine, and Circuit Knowledge Graph.
"""

import asyncio
import os
import time
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.app.core.bus import global_bus
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.hf_ingester import DatasetIngester
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater
from backend.app.agent.tools import CircuitTools
from backend.app.agent.loop import CircuitAgent
from backend.app.engine.netlist import NetlistCatalog
from backend.app.engine.ast_parser import VHDLParser
from backend.app.agent.openrouter import openrouter_client, AVAILABLE_MODELS
from backend.app.engine.toolchain import toolchain_mgr
from backend.app.engine.project_manager import project_mgr
from backend.app.engine.multiphysics import multiphysics_engine
from backend.app.engine.forging import forging_engine
from backend.app.engine.qa_testing import qa_testing_engine
from backend.app.engine.firmware_security import firmware_security_engine
from backend.app.engine.supply_chain import supply_chain_engine
from backend.app.engine.embedded_platforms import embedded_platforms_engine

app = FastAPI(
    title="CircuitForge EDA & Knowledge Graph Server",
    description="Agentic Circuit Design, Multi-Scale Simulation, and Autonomous Knowledge Graph",
    version="1.0.0"
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize singletons
kg = CircuitKnowledgeGraph()
ingester = DatasetIngester(kg)

def ws_event_emitter(event_type: str, payload: Dict[str, Any]):
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(global_bus.broadcast({
            "type": event_type,
            "data": payload
        }))
    except RuntimeError:
        pass

updater = AutonomousGraphUpdater(kg, event_emitter=ws_event_emitter)
tools = CircuitTools(kg, updater)
agent = CircuitAgent(tools)

# Populate core ontology on startup if empty
if kg.graph.number_of_nodes() == 0:
    ingester.populate_core_ontology()

# Pydantic Request Models
class AgentRunRequest(BaseModel):
    goal: str
    scale: int = 1
    circuit_name: str = "custom_circuit"
    openrouter_key: Optional[str] = None
    model: Optional[str] = None
    project_id: Optional[str] = None

class AgentConfigRequest(BaseModel):
    openrouter_key: Optional[str] = None
    default_model: Optional[str] = None

class AgentInterventionRequest(BaseModel):
    action: str  # "pause", "resume", "step", "steer", "fault"
    guidance: Optional[str] = None
    net_name: Optional[str] = None
    fault_value: Optional[str] = None

class SimulateRequest(BaseModel):
    circuit_name: str
    duration_ns: int = 100

class SynthesizeRequest(BaseModel):
    circuit_name: str

class VHDLLintRequest(BaseModel):
    vhdl_code: str

class VHDLSynthesizeRequest(BaseModel):
    vhdl_code: str
    circuit_name: Optional[str] = "custom_vhdl_circuit"


class VHDLCompileRunRequest(BaseModel):
    vhdl_code: str
    circuit_name: Optional[str] = "circuit_top"
    engine: Optional[str] = "auto"  # "auto", "builtin", "ghdl"
    duration_ns: Optional[int] = 100

class HFIngestRequest(BaseModel):
    dataset_name: str = "shailja/Verilog_Github"
    max_samples: int = 10

class AgentChatRequest(BaseModel):
    """
    Request model for autonomous EDA copilot interactions.
    Supports rich circuit context including live netlist, active VHDL,
    DRC diagnostics, simulation telemetry, user selection, and attached chips.
    """
    message: str
    circuit_context: Optional[Dict[str, Any]] = None
    openrouter_key: Optional[str] = None
    model: Optional[str] = None
    project_id: Optional[str] = None
    chat_history: Optional[List[Dict[str, Any]]] = None

class AgentAutoFixRequest(BaseModel):
    project_id: Optional[str] = None
    target_file: Optional[str] = None
    vhdl_code: Optional[str] = None
    circuit_name: Optional[str] = None
    issues: Optional[List[Any]] = None

class ToolExecuteRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any] = {}
    project_id: Optional[str] = None

class CircuitBenchmarkRequest(BaseModel):
    circuit_name: str = "full_adder_gate_level"
    duration_ns: int = 100
    vhdl_code: Optional[str] = None

class ProjectCreateRequest(BaseModel):
    name: str
    scale: int = 1
    template_type: str = "rtl"
    description: Optional[str] = ""

class FileWriteRequest(BaseModel):
    path: str
    content: str

class FileCreateRequest(BaseModel):
    path: str
    is_dir: bool = False
    content: Optional[str] = ""

class FileRenameRequest(BaseModel):
    old_path: str
    new_path: str

# API Endpoints
@app.get("/api/projects")
def list_projects():
    return project_mgr.list_projects()

@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    p = project_mgr.get_project(project_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return p

@app.post("/api/projects/create")
def create_project(req: ProjectCreateRequest):
    return project_mgr.create_project(
        name=req.name,
        scale=req.scale,
        template_type=req.template_type,
        description=req.description or ""
    )

@app.get("/api/projects/{project_id}/tree")
def get_project_tree(project_id: str):
    return project_mgr.get_project_tree(project_id)

@app.get("/api/projects/{project_id}/file")
def read_project_file(project_id: str, path: str = Query(..., description="Relative file path")):
    content = project_mgr.read_file(project_id, path)
    return {"path": path, "content": content}

@app.post("/api/projects/{project_id}/file")
def write_project_file(project_id: str, req: FileWriteRequest):
    success = project_mgr.write_file(project_id, req.path, req.content)
    return {"success": success, "path": req.path}

@app.post("/api/projects/{project_id}/entry/create")
def create_project_entry(project_id: str, req: FileCreateRequest):
    success = project_mgr.create_entry(project_id, req.path, req.is_dir, req.content or "")
    return {"success": success, "path": req.path}

@app.delete("/api/projects/{project_id}/entry")
def delete_project_entry(project_id: str, path: str = Query(..., description="Relative entry path")):
    success = project_mgr.delete_entry(project_id, path)
    return {"success": success, "path": path}

@app.post("/api/projects/{project_id}/entry/rename")
def rename_project_entry(project_id: str, req: FileRenameRequest):
    success = project_mgr.rename_entry(project_id, req.old_path, req.new_path)
    return {"success": success, "old_path": req.old_path, "new_path": req.new_path}
@app.get("/api/status")
def get_status():
    return {
        "status": "online",
        "agent_state": agent.state.value,
        "current_phase": agent.current_phase,
        "kg_nodes": kg.graph.number_of_nodes(),
        "kg_edges": kg.graph.number_of_edges(),
    }

@app.get("/api/knowledge-graph/nodes")
def search_kg(
    query: str = Query("", description="Keyword search query"),
    scale: Optional[int] = Query(None, description="Filter by scale (1 to 4)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(30, description="Max results")
):
    return kg.search(query=query, scale=scale, category=category, limit=limit)

@app.get("/api/knowledge-graph/node/{node_id:path}")
def get_kg_node(node_id: str):
    node = kg.get_node(node_id)
    if not node:
        return {"error": f"Node {node_id} not found"}
    return node

@app.get("/api/knowledge-graph/export")
def export_kg(max_nodes: int = Query(350, description="Max nodes to export")):
    return kg.export_graph_json(max_nodes=max_nodes)

@app.post("/api/knowledge-graph/populate")
def populate_kg():
    count = ingester.populate_core_ontology()
    return {"message": f"Populated core ontology with {count} concepts."}


@app.get("/api/knowledge-graph/hf/search")
def search_hf_datasets(query: str = Query("", description="Search term for Hugging Face datasets")):
    return ingester.search_hf_datasets(query)

@app.get("/api/agent/models/search")
async def search_agent_models(query: str = Query("", description="Search term for OpenRouter models")):
    models = await openrouter_client.search_models(query)
    return {"query": query, "models": models}

@app.get("/api/vhdl/toolchain/status")
def get_toolchain_status():
    return toolchain_mgr.get_status()

@app.post("/api/vhdl/toolchain/run")
def compile_and_run_vhdl(req: VHDLCompileRunRequest):
    return toolchain_mgr.compile_and_simulate(
        vhdl_code=req.vhdl_code,
        circuit_name=req.circuit_name or "circuit_top",
        engine=req.engine or "auto",
        duration_ns=req.duration_ns or 100
    )

@app.post("/api/knowledge-graph/ingest-hf")
def ingest_hf(req: HFIngestRequest):
    res = tools.ingest_huggingface(req.dataset_name, req.max_samples)
    return res

@app.get("/api/circuits/catalog")
def get_circuits_catalog():
    return [
        {
            "id": "full_adder_gate_level",
            "name": "1-Bit Full Adder",
            "scale": 1,
            "scale_label": "Scale 1: Gate Level",
            "description": "Constructed from 2 XOR, 2 AND, and 1 OR gate.",
        },
        {
            "id": "counter_8bit_updown",
            "name": "8-Bit Synchronous Up/Down Counter",
            "scale": 2,
            "scale_label": "Scale 2: RTL Module",
            "description": "Registered counter with load, enable, and terminal count.",
        },
        {
            "id": "alu_32bit_subsystem",
            "name": "32-Bit Multi-Function ALU",
            "scale": 3,
            "scale_label": "Scale 3: Subsystem",
            "description": "Arithmetic, logical, and shift unit with Z, N, C, V flags.",
        },
        {
            "id": "riscv_rv32i_core",
            "name": "RISC-V RV32I 5-Stage Pipeline",
            "scale": 4,
            "scale_label": "Scale 4: Processor Core",
            "description": "Complete 32-bit pipelined CPU with hazard forwarding.",
        },
    ]

@app.post("/api/circuits/synthesize")
def synthesize_circuit(req: SynthesizeRequest):
    netlist = tools.synthesize_netlist(req.circuit_name)
    return netlist

@app.post("/api/circuits/simulate")
def simulate_circuit(req: SimulateRequest):
    sim_res = tools.run_simulation(req.circuit_name, req.duration_ns)
    return sim_res

@app.post("/api/vhdl/lint")
def lint_vhdl(req: VHDLLintRequest):
    res = VHDLParser.parse_code(req.vhdl_code)
    return {
        "is_valid": res.is_valid,
        "entities": [{"name": e.name, "ports": [p.__dict__ for p in e.ports]} for e in res.entities],
        "messages": [m.__dict__ for m in res.lint_messages],
        "signals_count": len(res.signals),
        "processes_count": res.processes_count
    }

@app.post("/api/vhdl/synthesize")
def synthesize_custom_vhdl(req: VHDLSynthesizeRequest):
    netlist = VHDLParser.synthesize_from_vhdl(req.vhdl_code, req.circuit_name)
    return netlist.to_dict()

@app.get("/api/agent/key-status")
def get_agent_key_status():
    """Returns credential status with zero plaintext exposure."""
    return openrouter_client.get_key_status()

@app.get("/api/agent/models")
def get_available_models():
    key_status = openrouter_client.get_key_status()
    return {
        "models": AVAILABLE_MODELS,
        "current_model": openrouter_client.default_model,
        "is_configured": key_status["is_configured"],
        "key_status": key_status,
    }

@app.post("/api/agent/config")
def configure_agent(req: AgentConfigRequest):
    if req.openrouter_key is not None:
        openrouter_client.api_key = req.openrouter_key
    if req.default_model:
        openrouter_client.default_model = req.default_model
    return {
        "status": "configured",
        "has_key": openrouter_client.is_configured(),
        "key_status": openrouter_client.get_key_status(),
        "model": openrouter_client.default_model,
        "available_models": AVAILABLE_MODELS
    }

@app.post("/api/agent/test-connection")
async def test_agent_connection(req: AgentConfigRequest):
    if not req.openrouter_key and not openrouter_client.api_key:
        return {"success": False, "error": "No API key provided"}
    key = req.openrouter_key or openrouter_client.api_key
    return await openrouter_client.test_connection(key, req.default_model or openrouter_client.default_model)

@app.post("/api/agent/run")
async def run_agent(req: AgentRunRequest):
    asyncio.create_task(agent.run_circuit_pipeline(
        req.goal,
        req.scale,
        req.circuit_name,
        openrouter_key=req.openrouter_key,
        model=req.model,
        project_id=req.project_id,
    ))
    return {"message": f"Agent started for {req.circuit_name} at scale {req.scale}"}

class MaterializeRequest(BaseModel):
    project_id: str
    circuit_name: str = "processor_top"
    scale: int = 4

@app.post("/api/agent/materialize")
async def materialize_design(req: MaterializeRequest):
    """Directly materialize a multi-file VHDL hardware suite into an active project."""
    from backend.app.agent.hardware_generator import generate_64bit_microprocessor_suite, materialize_design_into_project
    try:
        suite = generate_64bit_microprocessor_suite(req.circuit_name)
        result = materialize_design_into_project(req.project_id, suite)
        file_list = [f["path"] for f in result.get("files_written", [])]
        await global_bus.broadcast({
            "type": "project_files_updated",
            "data": {
                "project_id": req.project_id,
                "files": file_list,
                "top_file": result.get("top_file", ""),
                "modules": result.get("modules", []),
                "circuit_name": req.circuit_name,
                "scale": req.scale,
            }
        })
        return {"success": True, "project_id": req.project_id, "files": file_list, "modules": result.get("modules", [])}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/agent/chat")
async def chat_with_agent(req: AgentChatRequest):
    from backend.app.agent.openrouter import sanitize_credentials
    key = req.openrouter_key or openrouter_client.api_key
    model = req.model or openrouter_client.default_model

    clean_user_message = sanitize_credentials(req.message)

    # Broadcast user chat message to WebSocket safely
    ms_now = int(time.time() * 1000)
    await global_bus.broadcast({
        "type": "agent_thought",
        "timestamp": ms_now,
        "data": {
            "time": ms_now,
            "state": "CO-PILOT",
            "action": "user_chat",
            "thought": f"Human Co-Pilot: '{clean_user_message}'"
        }
    })

    res = await openrouter_client.chat_with_copilot(
        message=req.message,
        circuit_context=req.circuit_context,
        api_key=key,
        model=model,
        tools_instance=tools,
        project_id=req.project_id,
        chat_history=req.chat_history
    )

    clean_reply = sanitize_credentials(res.get("reply", ""))

    # Broadcast agent response to WebSocket safely
    await global_bus.broadcast({
        "type": "agent_thought",
        "timestamp": time.time(),
        "data": {
            "time": time.time(),
            "state": "CO-PILOT",
            "action": "agent_reply",
            "thought": clean_reply,
            "details": {
                "model": res.get("model"),
                "action": res.get("action"),
                "tool_history": res.get("tool_history", []),
                "is_llm": res.get("is_llm")
            }
        }
    })

    # If action is simulation, trigger simulation
    action = res.get("action")
    if action and action.get("type") == "simulate":
        c_name = (req.circuit_context or {}).get("circuit_name", "active_circuit")
        sim_res = tools.run_simulation(c_name, 100)
        await global_bus.broadcast({
            "type": "simulation_finished",
            "timestamp": time.time(),
            "data": sim_res
        })

    # If action is apply_code, automatically write to active project on disk and broadcast live updates
    if action and action.get("type") in ("apply_code", "synthesize") and action.get("vhdl_code"):
        c_code = action["vhdl_code"]
        c_name = action.get("circuit_name") or (req.circuit_context or {}).get("circuit_name", "circuit_top")
        target_pid = req.project_id or (req.circuit_context or {}).get("project_id") or "scale1_full_adder"
        target_path = action.get("file_path") or f"src/{c_name}.vhd"
        try:
            project_mgr.write_file(target_pid, target_path, c_code)

            # Synthesize netlist so schematic canvas updates immediately
            try:
                synth_nl = VHDLParser.synthesize_from_vhdl(c_code)
                await global_bus.broadcast({
                    "type": "netlist_synthesized",
                    "timestamp": time.time(),
                    "data": synth_nl
                })
            except Exception:
                pass

            await global_bus.broadcast({
                "type": "circuit_designed",
                "timestamp": time.time(),
                "data": {
                    "vhdl_code": c_code,
                    "circuit_name": c_name,
                    "file_path": target_path
                }
            })

            await global_bus.broadcast({
                "type": "project_files_updated",
                "timestamp": time.time(),
                "data": {
                    "project_id": target_pid,
                    "action": "chat_apply_code",
                    "path": target_path,
                    "files": [target_path],
                    "top_file": target_path,
                    "circuit_name": c_name
                }
            })
        except Exception:
            pass

    return res

@app.get("/api/agent/tools")
def get_agent_tools():
    """Returns the OpenAI/OpenRouter compatible tool schema definitions for autonomous execution."""
    return {"tools": tools.get_tool_definitions()}

@app.post("/api/agent/tools/execute")
def execute_agent_tool(req: ToolExecuteRequest):
    """Directly executes a tool by name within the sandboxed project environment."""
    return tools.execute_tool(req.tool_name, req.arguments, default_project_id=req.project_id)

@app.post("/api/agent/benchmark")
def benchmark_circuit(req: CircuitBenchmarkRequest):
    """Executes multi-dimensional architectural benchmarking on a circuit."""
    return tools.eda_benchmark_circuit(req.circuit_name, req.duration_ns, req.vhdl_code)

@app.post("/api/agent/intervention")
async def agent_intervention(req: AgentInterventionRequest):
    action = req.action.lower().strip()
    if action == "pause":
        agent.pause()
        await global_bus.broadcast({
            "type": "agent_state_change",
            "timestamp": time.time(),
            "state": "PAUSED",
            "data": {"state": "PAUSED"}
        })
        return {"status": "Agent paused"}
    elif action == "resume":
        agent.resume()
        await global_bus.broadcast({
            "type": "agent_state_change",
            "timestamp": time.time(),
            "state": agent.state.value,
            "data": {"state": agent.state.value}
        })
        return {"status": "Agent resumed"}
    elif action == "step":
        agent.step()
        await global_bus.broadcast({
            "type": "agent_state_change",
            "timestamp": time.time(),
            "state": "RUNNING",
            "data": {"state": "RUNNING", "stepping": True}
        })
        return {"status": "Agent stepped 1 action"}
    elif action == "steer":
        if req.guidance:
            agent.steer(req.guidance)
            if any(kw in req.guidance.lower() for kw in ("auto-fix", "autofix", "repair all", "fix all", "floating cmos")):
                fix_res = tools.auto_fix_drc()
                if fix_res.get("success") and fix_res.get("netlist"):
                    await global_bus.broadcast({
                        "type": "netlist_synthesized",
                        "data": fix_res["netlist"]
                    })
                    return {"status": "Auto-fix applied", "guidance": req.guidance, "result": fix_res}
        return {"status": "Guidance applied", "guidance": req.guidance}
    elif action in ("autofix", "auto_fix", "repair"):
        fix_res = tools.auto_fix_drc()
        if fix_res.get("success"):
            if fix_res.get("netlist"):
                await global_bus.broadcast({
                    "type": "netlist_synthesized",
                    "data": fix_res["netlist"]
                })
            if fix_res.get("vhdl_code"):
                await global_bus.broadcast({
                    "type": "circuit_designed",
                    "data": {
                        "vhdl_code": fix_res["vhdl_code"],
                        "circuit_name": fix_res.get("circuit_name", "repaired_circuit")
                    }
                })
        return {"status": "Auto-fix completed", "result": fix_res}
    elif action == "fault":
        if req.net_name:
            res = tools.inject_fault(req.net_name, req.fault_value)
            await global_bus.broadcast({
                "type": "fault_injected",
                "timestamp": time.time(),
                "data": res
            })
            return res
        return {"error": "Missing net_name"}
    return {"error": f"Unknown action {action}"}

@app.post("/api/agent/auto-fix")
async def auto_fix_circuit(req: AgentAutoFixRequest):
    """
    Direct 1-Click DRC Auto-Repair:
    Ties floating CMOS input pins to safe logic rails ('0' or '1'),
    resolves bus contention, clears injected faults, updates project files,
    and returns a clean, synthesized netlist.
    """
    res = tools.auto_fix_drc(
        project_id=req.project_id,
        target_file=req.target_file,
        vhdl_code=req.vhdl_code,
        circuit_name=req.circuit_name,
        issues=req.issues
    )
    if res.get("success"):
        if res.get("netlist"):
            await global_bus.broadcast({
                "type": "netlist_synthesized",
                "data": res["netlist"]
            })
        if res.get("vhdl_code"):
            await global_bus.broadcast({
                "type": "circuit_designed",
                "data": {
                    "vhdl_code": res["vhdl_code"],
                    "circuit_name": res.get("circuit_name", "repaired_circuit")
                }
            })
        await global_bus.broadcast({
            "type": "agent_thought",
            "data": {
                "time": int(time.time() * 1000),
                "state": "AUTO_FIX",
                "action": "drc_repaired",
                "thought": f"⚡ Auto-Fix Complete: {len(res.get('repairs_applied', []))} DRC corrections applied. Netlist clean.",
                "details": res
            }
        })
    return res


# ==========================================
# Turnkey Hardware Lifecycle REST Endpoints
# ==========================================

class MultiphysicsRequest(BaseModel):
    circuit_name: Optional[str] = "CircuitForge_Design"
    clock_mhz: Optional[float] = 350.0
    trace_length_mm: Optional[float] = 45.0
    supply_voltage: Optional[float] = 1.0
    load_current_a: Optional[float] = 3.5
    ambient_temp_c: Optional[float] = 25.0
    airflow_mps: Optional[float] = 1.5
    board_thickness_mm: Optional[float] = 1.6
    drop_height_m: Optional[float] = 1.5

class DfmStackupRequest(BaseModel):
    circuit_name: Optional[str] = "CircuitForge_Design"
    layer_count: Optional[int] = 8
    substrate_family: Optional[str] = "Rogers_RO4350B"
    trace_width_mil: Optional[float] = 3.5
    trace_spacing_mil: Optional[float] = 3.5
    min_via_drill_mil: Optional[float] = 6.0
    use_nitrogen_purge: Optional[bool] = True

class QaInspectionRequest(BaseModel):
    circuit_name: Optional[str] = "CircuitForge_Design"
    bga_package: Optional[str] = "BGA256_0.5mm_Pitch"
    ball_count: Optional[int] = 64
    pitch_mm: Optional[float] = 0.5
    total_nets: Optional[int] = 48
    fundamental_clock_mhz: Optional[float] = 350.0

class FirmwareSecurityRequest(BaseModel):
    circuit_name: Optional[str] = "CircuitForge_Design"
    base_address_hex: Optional[str] = "0x40000000"
    device_serial_id: Optional[str] = None
    test_cycles: Optional[int] = 1000

class SupplyChainRequest(BaseModel):
    circuit_name: Optional[str] = "CircuitForge_Main_System"
    target_volume: Optional[int] = 1000
    action: Optional[str] = "bom"
    original_mpn: Optional[str] = None
    substitute_mpn: Optional[str] = None

@app.post("/api/lifecycle/multiphysics")
async def run_multiphysics_simulation_endpoint(req: MultiphysicsRequest):
    return multiphysics_engine.run_multiphysics_co_simulation(
        circuit_name=req.circuit_name or "CircuitForge_Design",
        clock_mhz=req.clock_mhz or 350.0,
        trace_length_mm=req.trace_length_mm or 45.0,
        supply_voltage=req.supply_voltage or 1.0,
        load_current_a=req.load_current_a or 3.5,
        ambient_temp_c=req.ambient_temp_c or 25.0,
        airflow_mps=req.airflow_mps or 1.5,
        board_thickness_mm=req.board_thickness_mm or 1.6,
        drop_height_m=req.drop_height_m or 1.5
    )

@app.post("/api/lifecycle/dfm-stackup")
async def run_dfm_stackup_endpoint(req: DfmStackupRequest):
    return forging_engine.run_forging_manufacturability_audit(
        circuit_name=req.circuit_name or "CircuitForge_Design",
        layer_count=req.layer_count or 8,
        substrate_family=req.substrate_family or "Rogers_RO4350B",
        trace_width_mil=req.trace_width_mil or 3.5,
        trace_spacing_mil=req.trace_spacing_mil or 3.5,
        min_via_drill_mil=req.min_via_drill_mil or 6.0,
        use_nitrogen_purge=req.use_nitrogen_purge if req.use_nitrogen_purge is not None else True
    )

@app.post("/api/lifecycle/qa-inspection")
async def run_qa_inspection_endpoint(req: QaInspectionRequest):
    return qa_testing_engine.run_full_qa_certification(
        circuit_name=req.circuit_name or "CircuitForge_Design",
        bga_package=req.bga_package or "BGA256_0.5mm_Pitch",
        ball_count=req.ball_count or 64,
        pitch_mm=req.pitch_mm or 0.5,
        total_nets=req.total_nets or 48,
        fundamental_clock_mhz=req.fundamental_clock_mhz or 350.0
    )

@app.post("/api/lifecycle/firmware-security")
async def run_firmware_security_endpoint(req: FirmwareSecurityRequest):
    return firmware_security_engine.run_firmware_and_security_suite(
        circuit_name=req.circuit_name or "CircuitForge_Design",
        base_address_hex=req.base_address_hex or "0x40000000",
        device_serial_id=req.device_serial_id,
        test_cycles=req.test_cycles or 1000
    )

@app.post("/api/lifecycle/supply-chain")
async def run_supply_chain_endpoint(req: SupplyChainRequest):
    if req.action == "substitute" and req.original_mpn and req.substitute_mpn:
        return supply_chain_engine.substitute_component(
            original_mpn=req.original_mpn,
            target_alternative_mpn=req.substitute_mpn
        )
    return supply_chain_engine.generate_project_bom(
        circuit_name=req.circuit_name or "CircuitForge_Main_System",
        target_volume=req.target_volume or 1000
    )


# ========================================================
# Embedded Platforms & Microprocessor Endpoints
# ========================================================

class PlatformGenerateRequest(BaseModel):
    platform_id: str = "esp32_s3"
    target_language: str = "c_cpp"
    project_name: str = "iot_edge_controller"
    peripherals: Optional[List[str]] = None

class PlatformScaffoldRequest(BaseModel):
    platform_id: str = "esp32_s3"
    target_language: str = "c_cpp"
    project_name: str = "iot_edge_controller"
    description: Optional[str] = None

@app.get("/api/platforms/catalog")
def get_platforms_catalog_endpoint():
    return embedded_platforms_engine.get_platforms_catalog()

@app.post("/api/platforms/generate")
def generate_platform_firmware_endpoint(req: PlatformGenerateRequest):
    return embedded_platforms_engine.generate_platform_firmware_and_config(
        platform_id=req.platform_id,
        target_language=req.target_language,
        project_name=req.project_name,
        peripherals=req.peripherals
    )

@app.post("/api/platforms/scaffold-project")
def scaffold_platform_project_endpoint(req: PlatformScaffoldRequest):
    return project_mgr.create_embedded_platform_project(
        platform_id=req.platform_id,
        target_language=req.target_language,
        project_name=req.project_name,
        description=req.description
    )


class CodeValidateRequest(BaseModel):
    code: str
    language: str = "vhdl"
    file_path: Optional[str] = None

class LifecycleExportRequest(BaseModel):
    project_id: str = "scale1_full_adder"
    artifact_type: str = "bom"
    circuit_name: str = "CircuitForge_System"
    payload: Optional[Any] = None

@app.post("/api/code/validate")
def validate_code_endpoint(req: CodeValidateRequest):
    return tools.eda_validate_code(
        code=req.code,
        language=req.language,
        file_path=req.file_path
    )

@app.post("/api/lifecycle/export-artifact")
async def export_lifecycle_artifact_endpoint(req: LifecycleExportRequest):
    res = tools.eda_export_lifecycle_artifact(
        project_id=req.project_id,
        artifact_type=req.artifact_type,
        circuit_name=req.circuit_name,
        payload=req.payload
    )
    if res.get("success"):
        await global_bus.broadcast({
            "type": "project_files_updated",
            "timestamp": time.time(),
            "data": {"project_id": req.project_id, "action": "export_lifecycle_artifact", "artifact_type": req.artifact_type}
        })
    return res


@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await global_bus.connect(websocket)
    try:
        # Send initial snapshot
        await websocket.send_json({
            "type": "connection_established",
            "agent_state": agent.state.value,
            "kg_nodes": kg.graph.number_of_nodes(),
            "kg_edges": kg.graph.number_of_edges(),
        })
        while True:
            # Handle client messages if any
            data = await websocket.receive_json()
            cmd = data.get("command")
            if cmd == "pause":
                agent.pause()
            elif cmd == "resume":
                agent.resume()
            elif cmd == "step":
                agent.step()
    except WebSocketDisconnect:
        global_bus.disconnect(websocket)
    except Exception:
        global_bus.disconnect(websocket)

# Serve production Vite web frontend if built
if os.path.exists("web/dist"):
    app.mount("/", StaticFiles(directory="web/dist", html=True), name="static")

