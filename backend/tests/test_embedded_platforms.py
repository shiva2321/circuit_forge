"""
Comprehensive Test Suite for Multi-Platform Hardware Design & Embedded Systems Studio
Validates Raspberry Pi (Pico & SBC Linux), ESP32 (Xtensa & RISC-V), ARM Cortex-M, Verilog RTL,
Multi-language Code Generation (C/C++, Rust, MicroPython, Linux Python, Verilog),
Agent Tools, Project Scaffolding, and FastAPI REST Endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.engine.embedded_platforms import embedded_platforms_engine
from backend.app.engine.project_manager import project_mgr
from backend.app.agent.tools import CircuitTools
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater
from backend.app.agent.openrouter import openrouter_client

client = TestClient(app)


# ==========================================
# 1. Embedded Platforms Catalog Tests
# ==========================================

def test_platforms_catalog():
    cat = embedded_platforms_engine.get_platforms_catalog()
    assert cat["total_platforms"] >= 6
    plat_ids = [p["id"] for p in cat["platforms"]]
    assert "raspberry_pi_pico" in plat_ids
    assert "raspberry_pi_5_sbc" in plat_ids
    assert "esp32_s3" in plat_ids
    assert "esp32_c6_riscv" in plat_ids
    assert "stm32_arm_cortex" in plat_ids
    assert "verilog_systemverilog" in plat_ids

    lang_ids = [l["id"] for l in cat["supported_languages"]]
    assert "c_cpp" in lang_ids
    assert "rust" in lang_ids
    assert "micropython" in lang_ids
    assert "linux_python" in lang_ids
    assert "verilog" in lang_ids


# ==========================================
# 2. Multi-Platform Code Generation Tests
# ==========================================

def test_esp32_s3_c_cpp_generation():
    res = embedded_platforms_engine.generate_platform_firmware_and_config(
        platform_id="esp32_s3",
        target_language="c_cpp",
        project_name="esp32_gateway"
    )
    assert res["success"] is True
    assert "main/app_main.c" in res["source_files"]
    assert "freertos/FreeRTOS.h" in res["source_files"]["main/app_main.c"]
    assert "CMakeLists.txt" in res["manifest_files"]
    assert "platformio.ini" in res["manifest_files"]
    assert "esp32-s3-devkitc-1" in res["manifest_files"]["platformio.ini"]
    assert len(res["pinout_definition"]) > 0


def test_esp32_s3_rust_generation():
    res = embedded_platforms_engine.generate_platform_firmware_and_config(
        platform_id="esp32_s3",
        target_language="rust",
        project_name="esp32_rust_node"
    )
    assert res["success"] is True
    assert "src/main.rs" in res["source_files"]
    assert "#![no_std]" in res["source_files"]["src/main.rs"]
    assert "esp_hal" in res["source_files"]["src/main.rs"]
    assert "Cargo.toml" in res["manifest_files"]


def test_esp32_micropython_generation():
    res = embedded_platforms_engine.generate_platform_firmware_and_config(
        platform_id="esp32_s3",
        target_language="micropython",
        project_name="esp32_mpy"
    )
    assert res["success"] is True
    assert "main.py" in res["source_files"]
    assert "from machine import Pin" in res["source_files"]["main.py"]


def test_raspberry_pi_pico_c_cpp_and_pio():
    res = embedded_platforms_engine.generate_platform_firmware_and_config(
        platform_id="raspberry_pi_pico",
        target_language="c_cpp",
        project_name="pico_dual_core"
    )
    assert res["success"] is True
    assert "main.c" in res["source_files"]
    assert "stepper_pulse.pio" in res["source_files"]
    assert "pico/multicore.h" in res["source_files"]["main.c"]
    assert ".program stepper_pulse" in res["source_files"]["stepper_pulse.pio"]
    assert "CMakeLists.txt" in res["manifest_files"]
    assert "pico_stdlib" in res["manifest_files"]["CMakeLists.txt"]


def test_raspberry_pi_pico_rust():
    res = embedded_platforms_engine.generate_platform_firmware_and_config(
        platform_id="raspberry_pi_pico",
        target_language="rust",
        project_name="pico_rust"
    )
    assert res["success"] is True
    assert "src/main.rs" in res["source_files"]
    assert "rp_pico" in res["source_files"]["src/main.rs"]
    assert "Cargo.toml" in res["manifest_files"]


def test_raspberry_pi_5_linux_sbc():
    res = embedded_platforms_engine.generate_platform_firmware_and_config(
        platform_id="raspberry_pi_5_sbc",
        target_language="linux_python",
        project_name="pi5_edge_app"
    )
    assert res["success"] is True
    assert "edge_controller.py" in res["source_files"]
    assert "from gpiozero import LED" in res["source_files"]["edge_controller.py"]
    assert "hardware_pinout_map.txt" in res["source_files"]
    assert "edge_controller.service" in res["manifest_files"]


def test_verilog_systemverilog_subsystem():
    res = embedded_platforms_engine.generate_platform_firmware_and_config(
        platform_id="verilog_systemverilog",
        target_language="verilog",
        project_name="uart_subsystem"
    )
    assert res["success"] is True
    assert "rtl/uart_controller.v" in res["source_files"]
    assert "tb/uart_controller_tb.sv" in res["source_files"]
    assert "module uart_controller" in res["source_files"]["rtl/uart_controller.v"]
    assert "module uart_controller_tb" in res["source_files"]["tb/uart_controller_tb.sv"]


# ==========================================
# 3. Project Manager Embedded Scaffolding
# ==========================================

def test_project_manager_embedded_scaffolding(tmp_path):
    # Test scaffolding an embedded project via project_mgr
    meta = project_mgr.create_embedded_platform_project(
        platform_id="esp32_s3",
        target_language="c_cpp",
        project_name="Test_ESP32_Scaffold"
    )
    assert meta["id"] == "test_esp32_scaffold"
    assert meta["platform_id"] == "esp32_s3"
    assert meta["file_count"] >= 3

    # Check file contents in project workspace
    tree = project_mgr.get_project_tree("test_esp32_scaffold")
    assert len(tree["tree"]) > 0


def test_default_embedded_templates_present():
    projs = project_mgr.list_projects()
    proj_ids = [p["id"] for p in projs]
    assert "esp32_iot_sensor" in proj_ids
    assert "rpi_pico_motion" in proj_ids
    assert "rpi5_linux_gateway" in proj_ids
    assert "verilog_uart_subsystem" in proj_ids


# ==========================================
# 4. Agent Tool Dispatch Tests
# ==========================================

def test_agent_tool_embedded_platform_designer():
    kg = CircuitKnowledgeGraph()
    updater = AutonomousGraphUpdater(kg)
    tools = CircuitTools(kg, updater)

    # Execute tool directly
    res = tools.eda_embedded_platform_designer(
        platform_id="raspberry_pi_pico",
        target_language="c_cpp",
        project_name="Agent_Pico_Test",
        write_to_workspace=True,
        project_id="test_agent_pico"
    )
    assert res["success"] is True
    assert "main.c" in res["source_files"]
    assert res.get("written_to_project") == "test_agent_pico"

    # Execute via generic execute_tool
    res2 = tools.execute_tool("eda_embedded_platform_designer", {
        "platform_id": "esp32_c6_riscv",
        "target_language": "c_cpp",
        "project_name": "agent_c6_proj"
    })
    assert res2["success"] is True
    assert res2["platform_id"] == "esp32_c6_riscv"


# ==========================================
# 5. OpenRouter Natural Language Intent Tests
# ==========================================

@pytest.mark.anyio
async def test_openrouter_nlp_embedded_intent():
    kg = CircuitKnowledgeGraph()
    updater = AutonomousGraphUpdater(kg)
    tools = CircuitTools(kg, updater)

    # 1. Ask agent for Raspberry Pi Pico in natural language
    res_pico = await openrouter_client.chat_with_copilot(
        message="can you design and program a raspberry pi pico with dual core and stepper motor PIO",
        circuit_context={"circuit_name": "Pico_Robotics"},
        tools_instance=tools,
        project_id="test_nlp_pico"
    )
    assert res_pico["success"] is True
    assert "Pico" in res_pico["reply"] or "Raspberry Pi" in res_pico["reply"]
    assert len(res_pico["tool_history"]) > 0

    # 2. Ask agent for ESP32 in natural language
    res_esp = await openrouter_client.chat_with_copilot(
        message="program an esp32 with wifi and micropython",
        circuit_context={"circuit_name": "ESP32_WiFi_Node"},
        tools_instance=tools,
        project_id="test_nlp_esp32"
    )
    assert res_esp["success"] is True
    assert "ESP32" in res_esp["reply"]


# ==========================================
# 6. FastAPI REST API Endpoint Tests
# ==========================================

def test_rest_api_platforms_catalog():
    resp = client.get("/api/platforms/catalog")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_platforms"] >= 6
    assert len(data["platforms"]) >= 6


def test_rest_api_platforms_generate():
    resp = client.post("/api/platforms/generate", json={
        "platform_id": "esp32_s3",
        "target_language": "c_cpp",
        "project_name": "rest_esp32"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "main/app_main.c" in data["source_files"]


def test_rest_api_platforms_scaffold():
    resp = client.post("/api/platforms/scaffold-project", json={
        "platform_id": "raspberry_pi_5_sbc",
        "target_language": "linux_python",
        "project_name": "REST_RPi5_Gateway",
        "description": "Scaffolded via REST API"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "rest_rpi5_gateway"
    assert data["platform_id"] == "raspberry_pi_5_sbc"
