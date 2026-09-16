"""
CircuitForge FastAPI Main Server
Provides REST APIs and WebSocket stream for the Agentic Circuit EDA Studio,
Simulation Engine, and Circuit Knowledge Graph.
"""

import asyncio
import os
import time
from typing import Dict, Any, Optional
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
    message: str
    circuit_context: Optional[Dict[str, Any]] = None
    openrouter_key: Optional[str] = None
    model: Optional[str] = None
    project_id: Optional[str] = None

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
    key = req.openrouter_key or openrouter_client.api_key
    model = req.model or openrouter_client.default_model

    # Broadcast user chat message to WebSocket
    await global_bus.broadcast({
        "type": "agent_thought",
        "timestamp": time.time(),
        "data": {
            "time": time.time(),
            "state": "CO-PILOT",
            "action": "user_chat",
            "thought": f"Human Co-Pilot: '{req.message}'"
        }
    })

    res = await openrouter_client.chat_with_copilot(
        message=req.message,
        circuit_context=req.circuit_context,
        api_key=key,
        model=model,
        tools_instance=tools,
        project_id=req.project_id
    )

    # Broadcast agent response to WebSocket
    await global_bus.broadcast({
        "type": "agent_thought",
        "timestamp": time.time(),
        "data": {
            "time": time.time(),
            "state": "CO-PILOT",
            "action": "agent_reply",
            "thought": res.get("reply", ""),
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
        return {"status": "Guidance applied", "guidance": req.guidance}
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

