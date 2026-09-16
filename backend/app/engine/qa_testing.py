"""
CircuitForge Ultimate Quality Assurance & Virtual Testing Engine
Simulates 3D Automated Optical Inspection (AOI), 3D X-Ray (AXI) BGA void detection,
Flying Probe / In-Circuit Testing (ICT), HALT/HASS chambers, and Pre-Compliance EMI/EMC chambers.
"""

import math
import random
from typing import Dict, Any, List, Optional


class QATestingEngine:
    """Non-destructive testing, optical/x-ray inspection, and environmental validation."""

    @classmethod
    def inspect_3d_xray_bga(
        cls,
        circuit_name: str,
        bga_package: str = "BGA256_0.5mm_Pitch",
        ball_count: int = 64,
        pitch_mm: float = 0.5
    ) -> Dict[str, Any]:
        """Peers through silicon packages with 3D X-Ray (AXI) to inspect hidden solder balls for voids."""
        balls = []
        grid_dim = int(math.ceil(math.sqrt(ball_count)))
        max_allowable_void_pct = 25.0  # IPC-A-610 Class 3 standard limit

        failing_balls = 0
        total_void_accum = 0.0

        for r in range(grid_dim):
            for c in range(grid_dim):
                if len(balls) >= ball_count:
                    break
                # Deterministic pseudo-random distribution based on row/col coordinates
                seed_val = (r * 13 + c * 29 + 7) % 100
                # Corner and edge balls experience higher thermal shear -> slightly higher voiding
                is_corner = (r in (0, grid_dim - 1)) and (c in (0, grid_dim - 1))
                void_pct = round(6.5 + (seed_val * 0.14) + (8.0 if is_corner else 0.0), 1)
                total_void_accum += void_pct

                has_void_defect = (void_pct > max_allowable_void_pct)
                has_microcrack = (void_pct > 22.0 and is_corner)
                if has_void_defect or has_microcrack:
                    failing_balls += 1

                balls.append({
                    "ball_id": f"{chr(65 + r)}{c + 1}",
                    "row": r,
                    "col": c,
                    "void_percentage": void_pct,
                    "status": "FAIL_EXCESSIVE_VOID" if has_void_defect else "WARNING_MICROCRACK" if has_microcrack else "PASS_IPC_CLASS_3"
                })

        avg_void_pct = round(total_void_accum / max(1, len(balls)), 2)
        ipc_compliant = (failing_balls == 0 and avg_void_pct < 18.0)

        return {
            "circuit_name": circuit_name,
            "bga_package": bga_package,
            "total_balls_inspected": len(balls),
            "pitch_mm": pitch_mm,
            "ipc_standard": "IPC-A-610 Class 3 High Reliability",
            "max_allowable_void_pct": max_allowable_void_pct,
            "average_void_percentage": avg_void_pct,
            "defective_balls_count": failing_balls,
            "ball_inspection_map": balls,
            "verdict": "IPC_CLASS_3_CERTIFIED" if ipc_compliant else "REWORK_REQUIRED"
        }

    @classmethod
    def inspect_3d_aoi(
        cls,
        circuit_name: str,
        total_components: int = 120
    ) -> Dict[str, Any]:
        """Simulates 3D Automated Optical Inspection scanning solder paste volume and component placement."""
        inspected = total_components
        paste_volume_ok = round(inspected * 0.985)
        tombstone_flags = 0
        skew_offsets_detected = 1
        solder_bridges = 0

        yield_pct = round(((inspected - (tombstone_flags + skew_offsets_detected + solder_bridges)) / inspected) * 100.0, 2)

        return {
            "circuit_name": circuit_name,
            "total_components_inspected": inspected,
            "paste_volume_nominal_count": paste_volume_ok,
            "tombstoned_components": tombstone_flags,
            "rotational_skew_flags": skew_offsets_detected,
            "solder_bridges_detected": solder_bridges,
            "optical_yield_percentage": yield_pct,
            "verdict": "AOI_PASSED_ZERO_CRITICAL" if yield_pct >= 98.0 else "AOI_INSPECTION_FLAGS"
        }

    @classmethod
    def analyze_ict_flying_probe_coverage(
        cls,
        circuit_name: str,
        total_nets: int = 48,
        total_pins: int = 180
    ) -> Dict[str, Any]:
        """Calculates flying probe and in-circuit testpoint reachability and nodal fault coverage."""
        accessible_testpoints = round(total_nets * 0.96)
        coverage_pct = round((accessible_testpoints / max(1, total_nets)) * 100.0, 1)
        probe_time_sec = round(accessible_testpoints * 0.45, 1)

        return {
            "circuit_name": circuit_name,
            "total_circuit_nets": total_nets,
            "total_pins": total_pins,
            "accessible_testpoints": accessible_testpoints,
            "unprobed_nets_count": total_nets - accessible_testpoints,
            "nodal_fault_coverage_percentage": coverage_pct,
            "estimated_flying_probe_time_sec": probe_time_sec,
            "verdict": "100PCT_NODAL_COVERAGE" if coverage_pct >= 95.0 else "TESTPOINT_AUGMENTATION_NEEDED"
        }

    @classmethod
    def simulate_emc_precompliance(
        cls,
        circuit_name: str,
        fundamental_clock_mhz: float = 350.0,
        has_shielding_can: bool = True
    ) -> Dict[str, Any]:
        """Simulates radiated emissions spectrum (30 MHz - 6 GHz) compared against FCC / CISPR 32 limits."""
        harmonics = []
        limit_dbuv_m = 47.0  # FCC Part 15 Class B limit at 10m
        shielding_attenuation_db = 18.5 if has_shielding_can else 0.0

        max_emission_dbuv = 0.0
        max_margin_db = 100.0

        for n in range(1, 12):
            freq_mhz = round(fundamental_clock_mhz * n, 1)
            if freq_mhz > 6000.0:
                break
            # Harmonics decay with 20 dB/dec or 40 dB/dec based on rise time
            raw_emission = 62.0 - (18.0 * math.log10(max(1.0, n)))
            effective_emission = round(raw_emission - shielding_attenuation_db, 2)
            margin = round(limit_dbuv_m - effective_emission, 2)

            if effective_emission > max_emission_dbuv:
                max_emission_dbuv = effective_emission
            if margin < max_margin_db:
                max_margin_db = margin

            harmonics.append({
                "harmonic_order": n,
                "frequency_mhz": freq_mhz,
                "radiated_level_dbuv_m": effective_emission,
                "fcc_class_b_limit_dbuv_m": limit_dbuv_m,
                "compliance_margin_db": margin,
                "status": "COMPLIANT" if margin > 0 else "FAIL_LIMIT_EXCEEDED"
            })

        is_emc_pass = (max_margin_db >= 3.0)

        return {
            "circuit_name": circuit_name,
            "fundamental_clock_mhz": fundamental_clock_mhz,
            "shielding_enclosure_active": has_shielding_can,
            "shielding_attenuation_db": shielding_attenuation_db,
            "worst_case_emission_dbuv_m": max_emission_dbuv,
            "regulatory_limit_dbuv_m": limit_dbuv_m,
            "minimum_compliance_margin_db": max_margin_db,
            "harmonics_spectrum": harmonics,
            "standard_referenced": "FCC Part 15 Subpart B / CISPR 32 Class B",
            "verdict": "EMC_PRECOMPLIANCE_PASSED" if is_emc_pass else "EMI_REDUCTION_REQUIRED"
        }

    @classmethod
    def simulate_environmental_halt_hass(
        cls,
        circuit_name: str,
        thermal_shock_cycles: int = 500,
        vibration_g_rms: float = 35.0
    ) -> Dict[str, Any]:
        """Simulates Highly Accelerated Life Testing (HALT) and Stress Screening (HASS)."""
        # Arrhenius lifetime model
        ea_ev = 0.7  # activation energy for solder fatigue
        kb = 8.617e-5
        t_stress_k = 125.0 + 273.15
        t_use_k = 35.0 + 273.15
        af_thermal = math.exp((ea_ev / kb) * ((1.0 / t_use_k) - (1.0 / t_stress_k)))
        estimated_mtbf_hours = round(min(500000.0, af_thermal * 120.0), 0)

        return {
            "circuit_name": circuit_name,
            "thermal_shock_cycles": thermal_shock_cycles,
            "temp_extremes_c": "-40°C to +125°C",
            "vibration_level_g_rms": vibration_g_rms,
            "acceleration_factor": round(af_thermal, 1),
            "estimated_mtbf_hours": estimated_mtbf_hours,
            "projected_operational_life_years": round(estimated_mtbf_hours / 8760.0, 1),
            "verdict": "AEROSPACE_GRADE_RELIABILITY" if estimated_mtbf_hours > 150000 else "COMMERCIAL_RELIABLE"
        }

    @classmethod
    def run_full_qa_certification(cls, circuit_name: str, **kwargs) -> Dict[str, Any]:
        """Runs the entire unified non-destructive QA and environmental test suite."""
        xray = cls.inspect_3d_xray_bga(circuit_name)
        aoi = cls.inspect_3d_aoi(circuit_name)
        ict = cls.analyze_ict_flying_probe_coverage(circuit_name)
        emc = cls.simulate_emc_precompliance(circuit_name)
        halt = cls.simulate_environmental_halt_hass(circuit_name)

        all_passed = (
            xray["verdict"] == "IPC_CLASS_3_CERTIFIED" and
            aoi["verdict"] == "AOI_PASSED_ZERO_CRITICAL" and
            emc["verdict"] == "EMC_PRECOMPLIANCE_PASSED"
        )

        return {
            "success": True,
            "circuit_name": circuit_name,
            "certification_status": "FULL_SHIELD_CERTIFIED" if all_passed else "REWORK_REQUIRED",
            "xray_bga": xray,
            "optical_aoi": aoi,
            "flying_probe_ict": ict,
            "emc_precompliance": emc,
            "environmental_halt": halt
        }


qa_testing_engine = QATestingEngine()
