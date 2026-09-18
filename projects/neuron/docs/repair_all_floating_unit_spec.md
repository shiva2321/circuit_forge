# Architecture Specification: repair_all_floating_unit

- **Goal**: Repair all floating CMOS inputs, tie unconnected pins to safe logic levels ('0'), resolve any bus contention, clear active stuck-at faults, synthesize the netlist, and apply the repaired design to the canvas.
- **Scale**: 1
- **Primary RTL**: `src/repair_all_floating_unit.vhd`
- **Testbench**: `tb/repair_all_floating_unit_tb.vhd`
- **Date**: 2026-09-18 00:08:19
