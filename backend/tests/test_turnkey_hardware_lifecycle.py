"""
Comprehensive Test Suite for World-Class Turnkey Hardware Lifecycle Solution
Validates Multiphysics Co-Simulation, High-Precision Forging/DFM, QA Inspection/Testing,
Firmware & Hardware Security (PUF/Rust/C), Supply Chain BOM Sourcing, Agent Tools, and REST Endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.engine.multiphysics import multiphysics_engine
from backend.app.engine.forging import forging_engine
from backend.app.engine.qa_testing import qa_testing_engine
from backend.app.engine.firmware_security import firmware_security_engine
from backend.app.engine.supply_chain import supply_chain_engine
from backend.app.agent.tools import CircuitTools
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater

client = TestClient(app)


# ==========================================
# 1. Multiphysics Co-Simulation Engine Tests
# ==========================================

def test_multiphysics_signal_integrity():
    si = multiphysics_engine.simulate_signal_integrity(
        circuit_name="DSP_Core",
        clock_mhz=400.0,
        trace_length_mm=50.0
    )
    assert "characteristic_impedance_ohms" in si
    assert 40.0 <= si["characteristic_impedance_ohms"] <= 60.0
    assert "eye_height_v" in si
    assert si["eye_height_v"] > 0
    assert "eye_width_ps" in si
    assert len(si["eye_traces"]) > 0
    assert "verdict" in si


def test_multiphysics_power_integrity():
    pi = multiphysics_engine.simulate_power_integrity(
        circuit_name="DSP_Core",
        supply_voltage=1.2,
        load_current_a=3.5,
        copper_oz=1.0
    )
    assert "dc_ir_drop_mv" in pi
    assert pi["dc_ir_drop_mv"] > 0
    assert "current_density_a_mm2" in pi
    assert len(pi["impedance_profile"]) > 0
    assert "verdict" in pi


def test_multiphysics_thermal_cfd():
    th = multiphysics_engine.simulate_thermal_cfd(
        circuit_name="DSP_Core",
        ambient_temp_c=25.0,
        airflow_mps=1.5
    )
    assert "peak_junction_temp_c" in th
    assert th["peak_junction_temp_c"] >= 25.0
    assert len(th["thermal_grid"]) > 0
    assert "verdict" in th


def test_multiphysics_mechanical_fea():
    fea = multiphysics_engine.simulate_mechanical_fea(
        circuit_name="DSP_Core",
        board_thickness_mm=1.6,
        drop_height_m=1.5
    )
    assert "warping_displacement_um" in fea
    assert fea["warping_displacement_um"] > 0
    assert "impact_g_force" in fea
    assert fea["impact_g_force"] > 0
    assert "solder_shear_stress_mpa" in fea
    assert "verdict" in fea


def test_multiphysics_co_simulation_pipeline():
    co_sim = multiphysics_engine.run_multiphysics_co_simulation(
        circuit_name="DSP_Core",
        clock_mhz=350.0,
        trace_length_mm=45.0
    )
    assert co_sim["success"] is True
    assert "signal_integrity" in co_sim
    assert "power_integrity" in co_sim
    assert "thermal_cfd" in co_sim
    assert "mechanical_fea" in co_sim
    assert 0 <= co_sim["composite_physics_score"] <= 100


# ==========================================
# 2. Forging & HDI DFM Engine Tests
# ==========================================

def test_forging_layer_stackup_presets():
    stackup = forging_engine.design_layer_stackup(
        layer_count=6,
        substrate_family="Megtron 6",
        total_thickness_mm=1.6
    )
    assert stackup["layer_count"] == 6
    assert len(stackup["layers"]) == 6
    assert 3.5 <= stackup["dielectric_constant_er"] <= 3.8
    assert stackup["calc_single_ended_width_mil"] > 0
    assert stackup["calc_diff_pair_spacing_mil"] > 0


def test_forging_hdi_dfm_audit():
    dfm = forging_engine.run_hdi_dfm_audit(
        trace_width_mil=0.8,
        trace_spacing_mil=0.9,
        min_via_drill_mil=2.0,
        annular_ring_mil=1.5
    )
    assert dfm["total_violations"] > 0
    assert "dfm_yield_score" in dfm
    assert "verdict" in dfm


def test_forging_reflow_profile():
    reflow = forging_engine.simulate_smt_reflow_profile(
        solder_paste_alloy="SAC305_LeadFree",
        smallest_passive="01005_metric_0402",
        bga_min_pitch_mm=0.3,
        use_nitrogen_purge=True
    )
    assert reflow["liquidus_temp_c"] == 217.0
    assert reflow["peak_reflow_temp_c"] == 245.0
    assert reflow["nitrogen_n2_purge"] is True
    assert len(reflow["reflow_zones"]) == 8
    assert "tombstone_risk_percentage" in reflow


def test_forging_manufacturability_audit():
    audit = forging_engine.run_forging_manufacturability_audit(
        circuit_name="Ultra_HDI_Board",
        layer_count=8,
        substrate_family="Rogers_RO4350B"
    )
    assert audit["success"] is True
    assert "stackup" in audit
    assert "dfm_rules" in audit
    assert "smt_assembly" in audit
    assert "overall_forging_score" in audit


# ==========================================
# 3. QA, Virtual Inspection & Testing Engine Tests
# ==========================================

def test_qa_3d_xray_bga_inspection():
    xray = qa_testing_engine.inspect_3d_xray_bga(
        circuit_name="BGA_Module",
        ball_count=64,
        pitch_mm=0.5
    )
    assert xray["total_balls_inspected"] == 64
    assert len(xray["ball_inspection_map"]) == 64
    assert "average_void_percentage" in xray
    assert "verdict" in xray


def test_qa_3d_aoi_inspection():
    aoi = qa_testing_engine.inspect_3d_aoi(
        circuit_name="BGA_Module",
        total_components=120
    )
    assert aoi["total_components_inspected"] == 120
    assert aoi["optical_yield_percentage"] >= 95.0
    assert "verdict" in aoi


def test_qa_ict_flying_probe():
    ict = qa_testing_engine.analyze_ict_flying_probe_coverage(
        circuit_name="BGA_Module",
        total_nets=48,
        total_pins=180
    )
    assert ict["nodal_fault_coverage_percentage"] >= 90.0
    assert ict["estimated_flying_probe_time_sec"] > 0
    assert "verdict" in ict


def test_qa_emc_precompliance():
    emc = qa_testing_engine.simulate_emc_precompliance(
        circuit_name="BGA_Module",
        fundamental_clock_mhz=100.0,
        has_shielding_can=True
    )
    assert "harmonics_spectrum" in emc
    assert len(emc["harmonics_spectrum"]) > 0
    assert "standard_referenced" in emc
    assert "verdict" in emc


def test_qa_environmental_halt_hass():
    halt = qa_testing_engine.simulate_environmental_halt_hass(
        circuit_name="BGA_Module",
        thermal_shock_cycles=500,
        vibration_g_rms=35.0
    )
    assert halt["estimated_mtbf_hours"] > 40000
    assert "projected_operational_life_years" in halt
    assert "verdict" in halt


def test_qa_full_certification():
    cert = qa_testing_engine.run_full_qa_certification(
        circuit_name="Mission_Critical_Module"
    )
    assert cert["success"] is True
    assert "xray_bga" in cert
    assert "optical_aoi" in cert
    assert "flying_probe_ict" in cert
    assert "emc_precompliance" in cert
    assert "environmental_halt" in cert
    assert "certification_status" in cert


# ==========================================
# 4. Firmware & Hardware Security Engine Tests
# ==========================================

def test_firmware_suite_generation():
    fw = firmware_security_engine.generate_firmware_suite(
        circuit_name="Secure_IoT_Node",
        base_address_hex="0x40000000"
    )
    assert "c_hal_driver" in fw
    assert "embedded_rust_pac" in fw
    assert "rtos_task_template" in fw
    assert "Secure_IoT_Node" in fw["c_hal_driver"]
    assert "#![no_std]" in fw["embedded_rust_pac"]
    assert "SecureIotNode" in fw["embedded_rust_pac"]
    assert "xQueueReceive" in fw["rtos_task_template"]


def test_hardware_root_of_trust():
    rot = firmware_security_engine.provision_hardware_root_of_trust(
        circuit_name="Secure_IoT_Node",
        device_serial_id="NODE-SN-8823"
    )
    assert "silicon_puf_fingerprint" in rot
    assert rot["puf_entropy_bits"] == 256
    assert "ecc_device_identity" in rot
    assert "secure_boot_manifest" in rot


def test_hil_test_runner():
    hil = firmware_security_engine.run_hil_test_runner(
        circuit_name="Secure_IoT_Node",
        test_cycles=500
    )
    assert hil["hil_test_cycles_executed"] == 500
    assert hil["hil_pass_rate_percent"] == 100.0
    assert "PASSED" in hil["verdict"]


def test_firmware_and_security_suite():
    suite = firmware_security_engine.run_firmware_and_security_suite(
        circuit_name="Production_Gateway"
    )
    assert suite["success"] is True
    assert "firmware" in suite
    assert "security" in suite
    assert "hil" in suite


# ==========================================
# 5. Supply Chain & Lifecycle Engine Tests
# ==========================================

def test_supply_chain_bom_extraction():
    bom = supply_chain_engine.generate_project_bom(
        circuit_name="Autonomous_Drone_Flight_Computer",
        target_volume=500
    )
    assert bom["circuit_name"] == "Autonomous_Drone_Flight_Computer"
    assert bom["target_production_volume"] == 500
    assert bom["total_unique_line_items"] > 0
    assert bom["estimated_unit_bom_cost_usd"] > 0
    assert bom["total_production_run_cost_usd"] > 0
    assert len(bom["bom_items"]) > 0

    first_item = bom["bom_items"][0]
    assert "mpn" in first_item
    assert "digikey_stock" in first_item
    assert "mouser_stock" in first_item
    assert "arrow_stock" in first_item
    assert "unit_price_usd" in first_item


def test_supply_chain_component_substitution():
    sub = supply_chain_engine.substitute_component(
        original_mpn="XC7A35T-1FTG256C",
        target_alternative_mpn="XC7A50T-1FTG256C"
    )
    assert sub["success"] is True
    assert sub["original_mpn"] == "XC7A35T-1FTG256C"
    assert sub["substitute_mpn"] == "XC7A50T-1FTG256C"
    assert sub["compatibility_type"] == "PIN_COMPATIBLE_DROP_IN"


# ==========================================
# 6. Agent Tools Turnkey Dispatch Tests
# ==========================================

def test_circuit_tools_turnkey_integration():
    kg = CircuitKnowledgeGraph()
    updater = AutonomousGraphUpdater(kg)
    tools = CircuitTools(kg, updater)

    # 1. Multiphysics tool
    res_mp = tools.eda_multiphysics_simulation(circuit_name="test_circ")
    assert res_mp["success"] is True
    assert "signal_integrity" in res_mp

    # 2. DFM tool
    res_dfm = tools.eda_dfm_stackup_audit(circuit_name="test_circ")
    assert res_dfm["success"] is True
    assert "stackup" in res_dfm

    # 3. QA tool
    res_qa = tools.eda_qa_virtual_inspection(circuit_name="test_circ")
    assert res_qa["success"] is True
    assert "xray_bga" in res_qa

    # 4. Firmware tool
    res_fw = tools.eda_generate_firmware_security(circuit_name="test_circ")
    assert res_fw["success"] is True
    assert "firmware" in res_fw

    # 5. Supply Chain tool
    res_sc = tools.eda_bom_supply_chain_sourcing(circuit_name="test_circ", target_volume=250)
    assert res_sc["circuit_name"] == "test_circ"
    assert "bom_items" in res_sc

    # 6. Execute tool dispatch
    res_exec = tools.execute_tool("eda_multiphysics_simulation", {"circuit_name": "test_circ"})
    assert res_exec["success"] is True


# ==========================================
# 7. FastAPI REST API Endpoint Tests
# ==========================================

def test_rest_api_lifecycle_multiphysics():
    resp = client.post("/api/lifecycle/multiphysics", json={
        "circuit_name": "REST_Design",
        "clock_mhz": 350.0,
        "trace_length_mm": 45.0
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "signal_integrity" in data
    assert "thermal_cfd" in data


def test_rest_api_lifecycle_dfm_stackup():
    resp = client.post("/api/lifecycle/dfm-stackup", json={
        "circuit_name": "REST_Design",
        "layer_count": 8,
        "substrate_family": "Rogers_RO4350B"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["stackup"]["layer_count"] == 8


def test_rest_api_lifecycle_qa_inspection():
    resp = client.post("/api/lifecycle/qa-inspection", json={
        "circuit_name": "REST_Design",
        "bga_package": "BGA256_0.5mm_Pitch",
        "ball_count": 64
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "xray_bga" in data


def test_rest_api_lifecycle_firmware_security():
    resp = client.post("/api/lifecycle/firmware-security", json={
        "circuit_name": "REST_Design",
        "base_address_hex": "0x40000000",
        "test_cycles": 100
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "security" in data


def test_rest_api_lifecycle_supply_chain():
    # BOM request
    resp = client.post("/api/lifecycle/supply-chain", json={
        "circuit_name": "REST_BOM_Test",
        "target_volume": 500,
        "action": "bom"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["circuit_name"] == "REST_BOM_Test"
    assert "bom_items" in data

    # Substitute request
    resp_sub = client.post("/api/lifecycle/supply-chain", json={
        "action": "substitute",
        "original_mpn": "XC7A35T-1FTG256C",
        "substitute_mpn": "XC7A50T-1FTG256C"
    })
    assert resp_sub.status_code == 200
    sub_data = resp_sub.json()
    assert sub_data["success"] is True
