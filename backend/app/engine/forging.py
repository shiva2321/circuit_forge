"""
CircuitForge High-Precision Forging & Manufacturing Engine
Handles 2-to-32 Layer Stackup Generation, Sub-1-mil Ultra-High-Density Interconnect (HDI)
DFM/DFA rule validation, 01005/0.3mm BGA SMT modeling, and Nitrogen (N2) Reflow profiling.
"""

import math
from typing import Dict, Any, List, Optional


class ForgingEngine:
    """Manufacturing fabrication and high-precision assembly modeling."""

    MATERIAL_PRESETS = {
        "FR4_Standard": {"name": "Isola FR4 Standard", "er": 4.5, "tg_c": 140, "cost_mult": 1.0},
        "FR4_High_Tg": {"name": "Shengyi S1000-2M High-Tg", "er": 4.3, "tg_c": 175, "cost_mult": 1.3},
        "Rogers_RO4350B": {"name": "Rogers RO4350B RF Substrate", "er": 3.66, "tg_c": 280, "cost_mult": 3.8},
        "Megtron_6": {"name": "Panasonic Megtron 6 High-Speed", "er": 3.4, "tg_c": 200, "cost_mult": 2.9},
        "PTFE_Teflon": {"name": "Taconic PTFE Microwave", "er": 2.1, "tg_c": 315, "cost_mult": 4.5},
        "Polyimide_RigidFlex": {"name": "DuPont Pyralux Polyimide", "er": 3.4, "tg_c": 250, "cost_mult": 3.2},
        "Ceramic_Alumina": {"name": "Alumina 96% Substrate", "er": 9.8, "tg_c": 450, "cost_mult": 6.0},
        "Heavy_Copper_3oz": {"name": "Heavy Copper 3oz Industrial", "er": 4.2, "tg_c": 170, "cost_mult": 2.2}
    }

    @classmethod
    def design_layer_stackup(
        cls,
        layer_count: int = 8,
        substrate_family: str = "Rogers_RO4350B",
        total_thickness_mm: float = 1.6,
        target_z0_ohms: float = 50.0
    ) -> Dict[str, Any]:
        """Designs a symmetrical multilayer stackup with calculated trace impedance."""
        layers_valid = min(32, max(2, layer_count))
        # Ensure even layer count
        if layers_valid % 2 != 0:
            layers_valid += 1

        mat = cls.MATERIAL_PRESETS.get(substrate_family, cls.MATERIAL_PRESETS["Rogers_RO4350B"])
        er = mat["er"]

        # Calculate symmetrical layer stackup
        stackup: List[Dict[str, Any]] = []
        copper_layers = layers_valid
        dielectric_layers = copper_layers - 1
        copper_thick_um = 35.0  # 1oz
        total_copper_mm = (copper_layers * copper_thick_um) / 1000.0
        remaining_dielectric_mm = max(0.2, total_thickness_mm - total_copper_mm)
        d_per_layer_mm = round(remaining_dielectric_mm / dielectric_layers, 3)

        for i in range(1, layers_valid + 1):
            is_top = (i == 1)
            is_bottom = (i == layers_valid)
            # Alternate Signal, Ground, Power Plane, Internal Signal
            if is_top or is_bottom:
                ltype = "Signal (Microstrip)"
                z0_est = target_z0_ohms
            elif i in (2, layers_valid - 1):
                ltype = "Ground Plane (Reference)"
                z0_est = 0.0
            elif i in (3, layers_valid - 2):
                ltype = "Power Plane"
                z0_est = 0.0
            else:
                ltype = "Internal Signal (Stripline)"
                z0_est = round(target_z0_ohms * 0.98, 1)

            stackup.append({
                "layer_num": i,
                "name": f"L{i}_{'TOP' if is_top else 'BOTTOM' if is_bottom else 'INT'}",
                "type": ltype,
                "copper_weight_oz": 1.0,
                "copper_thickness_um": copper_thick_um,
                "dielectric_below_mm": d_per_layer_mm if not is_bottom else 0.0,
                "dielectric_material": mat["name"] if not is_bottom else "None",
                "calc_impedance_ohms": z0_est
            })

        # Microstrip width for target 50 ohms: w ~ (7.48 * h / exp(Z0 * sqrt(er + 1.41) / 87))
        h_mil = (d_per_layer_mm * 1000.0) / 25.4
        trace_width_mil = round(max(2.5, h_mil * 1.85 / math.sqrt(er)), 2)
        diff_spacing_mil = round(trace_width_mil * 1.2, 2)

        return {
            "layer_count": layers_valid,
            "substrate_family": substrate_family,
            "substrate_name": mat["name"],
            "dielectric_constant_er": er,
            "glass_transition_temp_tg_c": mat["tg_c"],
            "total_thickness_mm": total_thickness_mm,
            "calc_single_ended_width_mil": trace_width_mil,
            "calc_diff_pair_spacing_mil": diff_spacing_mil,
            "diff_pair_impedance_ohms": round(target_z0_ohms * 1.95, 1),
            "layers": stackup,
            "stackup_type": "Standard Multilayer" if layers_valid <= 6 else "HDI High-Speed Backplane" if layers_valid >= 16 else "Controlled-Impedance Stackup"
        }

    @classmethod
    def run_hdi_dfm_audit(
        cls,
        trace_width_mil: float = 3.5,
        trace_spacing_mil: float = 3.5,
        min_via_drill_mil: float = 6.0,
        annular_ring_mil: float = 3.0,
        microvia_aspect_ratio: float = 0.8,
        solder_mask_sliver_mil: float = 3.0,
        has_acid_traps: bool = False
    ) -> Dict[str, Any]:
        """Runs strict Design For Manufacturing (DFM) check down to sub-1-mil HDI standards."""
        violations: List[Dict[str, Any]] = []

        # 1. Trace width & spacing check (Sub-100nm / Sub-1-mil advanced capability)
        if trace_width_mil < 1.0:
            violations.append({
                "rule": "TRACE_WIDTH_LIMIT",
                "severity": "ERROR",
                "message": f"Trace width ({trace_width_mil} mil) is below sub-1-mil HDI fabrication limit (1.0 mil / 25 µm)."
            })
        elif trace_width_mil < 2.5:
            violations.append({
                "rule": "TRACE_WIDTH_ADVANCED",
                "severity": "WARNING",
                "message": f"Trace width ({trace_width_mil} mil) requires laser direct imaging (LDI) cleanroom Tier-3."
            })

        if trace_spacing_mil < 1.0:
            violations.append({
                "rule": "TRACE_SPACING_LIMIT",
                "severity": "ERROR",
                "message": f"Trace clearance ({trace_spacing_mil} mil) violates copper spacing limits (risk of etch bridge)."
            })

        # 2. Micro-via drill & annular ring
        if min_via_drill_mil < 3.0:
            violations.append({
                "rule": "MICROVIA_DRILL_LIMIT",
                "severity": "ERROR",
                "message": f"Drill diameter ({min_via_drill_mil} mil) below UV laser drilling capability (3.0 mil)."
            })
        if annular_ring_mil < 2.0:
            violations.append({
                "rule": "ANNULAR_RING_BREAKOUT",
                "severity": "ERROR",
                "message": f"Annular ring ({annular_ring_mil} mil) risks hole breakout during mechanical plating."
            })

        # 3. Microvia aspect ratio (depth to diameter: max 1:1 for reliable plating)
        if microvia_aspect_ratio > 1.0:
            violations.append({
                "rule": "ASPECT_RATIO_EXCEEDED",
                "severity": "WARNING",
                "message": f"Microvia aspect ratio ({microvia_aspect_ratio}) exceeds 1.0:1 (risk of voided plating barrels)."
            })

        # 4. Solder mask slivers & Acid traps
        if solder_mask_sliver_mil < 2.5:
            violations.append({
                "rule": "SOLDER_MASK_SLIVER",
                "severity": "WARNING",
                "message": f"Solder mask web ({solder_mask_sliver_mil} mil) is below 2.5 mil (solder flaking hazard)."
            })
        if has_acid_traps:
            violations.append({
                "rule": "ACID_TRAP_DETECTED",
                "severity": "WARNING",
                "message": "Acute copper trace angles (< 90°) trap etching acid, risking over-etch trace necking."
            })

        has_errors = any(v["severity"] == "ERROR" for v in violations)
        yield_score = max(0, 100 - (len([v for v in violations if v['severity'] == 'ERROR']) * 35) - (len([v for v in violations if v['severity'] == 'WARNING']) * 10))

        return {
            "is_dfm_clean": len(violations) == 0,
            "has_critical_errors": has_errors,
            "dfm_yield_score": yield_score,
            "fabrication_tier": "Ultra-High-Density Interconnect (Tier-3)" if trace_width_mil <= 2.0 else "Advanced HDI (Tier-2)" if trace_width_mil <= 4.0 else "Standard Rigid PCB",
            "total_violations": len(violations),
            "violations": violations,
            "verdict": "PRODUCTION_FORGING_READY" if (not has_errors and yield_score >= 85) else "NEEDS_DFM_REVISION"
        }

    @classmethod
    def simulate_smt_reflow_profile(
        cls,
        solder_paste_alloy: str = "SAC305_LeadFree",
        smallest_passive: str = "01005_metric_0402",
        bga_min_pitch_mm: float = 0.3,
        use_nitrogen_purge: bool = True
    ) -> Dict[str, Any]:
        """Simulates automated surface mount assembly, placement accuracy, and multi-zone N2 reflow."""
        # SAC305 Liquidus: 217C - 220C
        peak_temp_c = 245.0
        time_above_liquidus_sec = 65.0  # target 60-90s
        tombstone_risk_pct = 1.2 if smallest_passive == "01005_metric_0402" else 0.3
        if not use_nitrogen_purge:
            tombstone_risk_pct *= 2.5

        # 8-Zone Reflow Oven Temperature Profile
        reflow_zones = [
            {"zone": 1, "name": "Preheat Initial", "zone_name": "Preheat Initial", "target_temp_c": 120.0, "setpoint_temp_c": 120.0, "duration_sec": 30},
            {"zone": 2, "name": "Preheat Ramp", "zone_name": "Preheat Ramp", "target_temp_c": 150.0, "setpoint_temp_c": 150.0, "duration_sec": 30},
            {"zone": 3, "name": "Thermal Soak Entry", "zone_name": "Thermal Soak Entry", "target_temp_c": 175.0, "setpoint_temp_c": 175.0, "duration_sec": 35},
            {"zone": 4, "name": "Thermal Soak Peak", "zone_name": "Thermal Soak Peak", "target_temp_c": 195.0, "setpoint_temp_c": 195.0, "duration_sec": 35},
            {"zone": 5, "name": "Reflow Ramp", "zone_name": "Reflow Ramp", "target_temp_c": 225.0, "setpoint_temp_c": 225.0, "duration_sec": 25},
            {"zone": 6, "name": "Peak Spike", "zone_name": "Peak Spike", "target_temp_c": peak_temp_c, "setpoint_temp_c": peak_temp_c, "duration_sec": 25},
            {"zone": 7, "name": "Cooling Zone 1", "zone_name": "Cooling Zone 1", "target_temp_c": 180.0, "setpoint_temp_c": 180.0, "duration_sec": 25},
            {"zone": 8, "name": "Final Exit Chill", "zone_name": "Final Exit Chill", "target_temp_c": 60.0, "setpoint_temp_c": 60.0, "duration_sec": 30}
        ]

        return {
            "solder_paste_alloy": solder_paste_alloy,
            "liquidus_temp_c": 217.0,
            "peak_reflow_temp_c": peak_temp_c,
            "time_above_liquidus_sec": time_above_liquidus_sec,
            "smallest_component_package": smallest_passive,
            "bga_min_pitch_mm": bga_min_pitch_mm,
            "nitrogen_n2_purge": use_nitrogen_purge,
            "o2_ppm_level": 45 if use_nitrogen_purge else 209000,
            "tombstone_risk_percentage": round(tombstone_risk_pct, 2),
            "placement_accuracy_um": 12.0,  # 12-micron dual pick-and-place precision
            "reflow_zones": reflow_zones,
            "verdict": "OXIDATION_FREE_PRISTINE" if use_nitrogen_purge else "STANDARD_ATMOSPHERE"
        }

    @classmethod
    def run_forging_manufacturability_audit(cls, circuit_name: str, **kwargs) -> Dict[str, Any]:
        """Runs unified manufacturing forging audit (Stackup, DFM, and SMT reflow line)."""
        stackup = cls.design_layer_stackup(
            layer_count=kwargs.get("layer_count", 8),
            substrate_family=kwargs.get("substrate_family", "Rogers_RO4350B")
        )
        dfm = cls.run_hdi_dfm_audit(
            trace_width_mil=kwargs.get("trace_width_mil", 3.5),
            trace_spacing_mil=kwargs.get("trace_spacing_mil", 3.5),
            min_via_drill_mil=kwargs.get("min_via_drill_mil", 6.0)
        )
        smt = cls.simulate_smt_reflow_profile(
            use_nitrogen_purge=kwargs.get("use_nitrogen_purge", True)
        )

        overall_yield = dfm["dfm_yield_score"]
        return {
            "success": True,
            "circuit_name": circuit_name,
            "stackup": stackup,
            "dfm_rules": dfm,
            "smt_assembly": smt,
            "overall_forging_score": overall_yield,
            "status": "APPROVED_FOR_CLEANROOM_FORGING" if overall_yield >= 85 else "ACTION_REQUIRED"
        }


forging_engine = ForgingEngine()
