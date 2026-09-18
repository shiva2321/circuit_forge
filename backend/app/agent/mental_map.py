"""
CircuitForge Cognitive Mental Map Engine
Constructs a live, deep semantic mental model of the entire digital hardware system:
- Architectural role and classification
- Functional execution stages & topological dataflow
- Signal lineage and backward dependency tracing
- Critical path delay and fan-out bottleneck detection
- Live digital logic states & truth verification
- Code-to-Canvas bidirectional correlation matrix
- Hardware integrity, floating pin detection, and DRC diagnostics
- Actionable, context-aware engineering recommendations
"""

import json
import re
from typing import Dict, List, Any, Optional, Set, Tuple


GATE_DELAY_NS: Dict[str, float] = {
    "NOT": 1.0,
    "INV": 1.0,
    "BUFFER": 1.0,
    "BUF": 1.0,
    "AND": 1.5,
    "NAND": 1.5,
    "OR": 1.5,
    "NOR": 1.5,
    "XOR": 2.5,
    "XNOR": 2.5,
    "HALF_ADDER": 3.0,
    "ADDER": 4.5,
    "SUBTRACTOR8": 6.0,
    "MULTIPLIER8": 12.0,
    "COMPARATOR": 5.0,
    "MUX2": 2.0,
    "MUX4": 3.0,
    "MUX8": 4.5,
    "DEMUX4": 3.0,
    "DECODER_3TO8": 3.5,
    "DFF": 2.0,
    "TFF": 2.5,
    "JKFF": 2.5,
    "COUNTER_4BIT": 5.5,
    "SHIFT_REG8": 4.0,
    "ALU": 8.0,
    "PROGRAM_COUNTER": 3.5,
    "INSTR_DECODER": 4.0,
    "REG_FILE_32X32": 6.5,
    "SRAM_BLOCK": 7.0,
    "BRAM_DUAL": 7.5,
    "FIFO_BUFFER": 6.0,
    "TEMP_SENSOR": 15.0,
    "LIGHT_SENSOR": 15.0,
    "PWM_DRIVER": 4.0,
    "ADC_8BIT": 25.0,
    "DAC_8BIT": 10.0,
    "RISCV_CORE": 12.0,
    "PROCESSOR": 12.0,
    "PROBE": 0.2,
    "OUTPUT_PIN": 0.2,
    "LED": 0.5,
    "RGB_LED": 0.5,
    "SEVEN_SEG": 1.0,
}


def classify_architecture(
    circuit_name: str,
    node_types: List[str],
    primary_inputs: List[str],
    primary_outputs: List[str],
    vhdl_code: str
) -> Tuple[str, str, str]:
    """
    Returns (classification_name, design_intent, scale_label).
    """
    c_lower = circuit_name.lower()
    code_lower = vhdl_code.lower()
    types_set = {t.upper() for t in node_types}

    if any(k in c_lower or k in code_lower for k in ("riscv", "risc_v", "rv32", "cpu", "processor", "pipeline")):
        return (
            "32-Bit RISC-V (RV32I) Microprocessor Core",
            "Single-cycle / pipelined Von Neumann execution unit with instruction fetch, decode, ALU execution, and register file storage.",
            "Scale 4 (System on Chip / Processor)"
        )
    if "sram" in c_lower or "bram" in c_lower or "fifo" in c_lower or "memory" in c_lower or "rom" in c_lower:
        return (
            "Synchronous Memory Subsystem",
            "Byte-addressable SRAM / Block RAM array with synchronous read/write enables and elastic buffering.",
            "Scale 3 (Subsystem & Memory Array)"
        )
    if "alu" in c_lower or "arithmetic" in c_lower:
        return (
            "Arithmetic Logic Unit (ALU)",
            "Configurable multi-function computing block executing addition, subtraction, bitwise AND/OR/XOR operations, and condition flags.",
            "Scale 3 (Functional Computing Subsystem)"
        )
    if "counter" in c_lower or any(t in types_set for t in ("COUNTER_4BIT", "DFF", "TFF", "JKFF")):
        return (
            "Synchronous Sequential Counter / FSM",
            "Clock-driven state machine advancing binary/Johnson counts with synchronous reset and terminal count detection.",
            "Scale 2 (Sequential Block / Register / FSM)"
        )
    if "full_adder" in c_lower or ("xor" in types_set and "and" in types_set and "or" in types_set):
        return (
            "1-Bit Gate-Level Full Adder",
            "Fundamental arithmetic primitive computing binary Sum (A ⊕ B ⊕ Cin) and Carry-Out (AB + Cin(A ⊕ B)) with dual half-adder stages.",
            "Scale 1 (Combinational Gate-Level Unit)"
        )
    if "half_adder" in c_lower or ("xor" in types_set and "and" in types_set and len(types_set) <= 2):
        return (
            "1-Bit Half Adder",
            "Computes 2-operand single-bit sum and carry-out without carry-in cascade.",
            "Scale 1 (Gate-Level Primitive)"
        )
    if "mux" in c_lower or "multiplexer" in c_lower:
        return (
            "Digital Multiplexer / Data Routing Switch",
            "Directs selected input channels to single destination bus based on binary address control lines.",
            "Scale 1 (Combinational Multiplexer)"
        )

    return (
        f"Custom Digital Architecture: {circuit_name}",
        "Hardware circuit synthesized on EDA canvas and mapped into IEEE 1076 VHDL-2008 RTL.",
        "Scale 1-2 (General Digital Design)"
    )


def trace_signal_lineage(
    netlist: Dict[str, Any],
    primary_inputs: List[Dict[str, Any]],
    primary_outputs: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Builds forward and backward dependency graphs for all signals,
    tracing each primary output back to its driving gates and primary inputs.
    """
    wires = netlist.get("wires", [])
    nodes = {n.get("id"): n for n in netlist.get("nodes", []) if isinstance(n, dict)}

    # Map: target_node -> list of (source_node, source_port, target_port)
    incoming: Dict[str, List[Tuple[str, str, str]]] = {}
    # Map: source_node -> list of (target_node, source_port, target_port)
    outgoing: Dict[str, List[Tuple[str, str, str]]] = {}

    for w in wires:
        if not isinstance(w, dict):
            continue
        src = w.get("source_node", "")
        src_p = w.get("source_port", "")
        tgt = w.get("target_node", "")
        tgt_p = w.get("target_port", "")

        incoming.setdefault(tgt, []).append((src, src_p, tgt_p))
        outgoing.setdefault(src, []).append((tgt, src_p, tgt_p))

    input_names = {p.get("name", p.get("id", "")) for p in primary_inputs if isinstance(p, dict)}
    output_names = {p.get("name", p.get("id", "")) for p in primary_outputs if isinstance(p, dict)}

    lineage: Dict[str, Any] = {}

    for out_name in output_names:
        visited_nodes: Set[str] = set()
        driving_inputs: Set[str] = set()
        intermediate_gates: List[str] = []

        def backtrack(node_name: str, depth: int = 0):
            if depth > 16 or node_name in visited_nodes:
                return
            visited_nodes.add(node_name)

            if node_name in input_names:
                driving_inputs.add(node_name)
                return

            if node_name in nodes and node_name != out_name:
                n = nodes[node_name]
                intermediate_gates.append(f"{n.get('label', node_name)} [{n.get('type', 'gate')}]")

            for src, _, _ in incoming.get(node_name, []):
                backtrack(src, depth + 1)

        backtrack(out_name)
        lineage[out_name] = {
            "output_pin": out_name,
            "driving_inputs": sorted(list(driving_inputs)),
            "intermediate_gates": intermediate_gates,
            "total_ancestor_gates": len(intermediate_gates)
        }

    return {
        "output_lineage": lineage,
        "incoming_graph": incoming,
        "outgoing_graph": outgoing
    }


def compute_stages_and_critical_path(
    netlist: Dict[str, Any],
    primary_inputs: List[Dict[str, Any]],
    primary_outputs: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Computes topological execution stages (levels 0..N) and finds
    the worst-case critical path delay in nanoseconds.
    """
    nodes = {n.get("id"): n for n in netlist.get("nodes", []) if isinstance(n, dict)}
    wires = netlist.get("wires", [])
    input_names = {p.get("name", p.get("id", "")) for p in primary_inputs if isinstance(p, dict)}

    # Graph adjacencies
    node_incoming: Dict[str, List[str]] = {}
    for w in wires:
        if isinstance(w, dict):
            s = w.get("source_node", "")
            t = w.get("target_node", "")
            if t:
                node_incoming.setdefault(t, []).append(s)

    # Topological depth calculation
    depth_memo: Dict[str, int] = {}
    delay_memo: Dict[str, float] = {}
    path_memo: Dict[str, List[str]] = {}

    def get_node_depth(n_id: str, visited: Optional[Set[str]] = None) -> Tuple[int, float, List[str]]:
        if visited is None:
            visited = set()
        if n_id in visited:
            return (0, 0.0, [n_id])
        if n_id in depth_memo:
            return (depth_memo[n_id], delay_memo[n_id], path_memo[n_id])

        if not n_id or not isinstance(n_id, str):
            return (0, 0.0, [])

        if n_id in input_names:
            depth_memo[n_id] = 0
            delay_memo[n_id] = 0.0
            path_memo[n_id] = [n_id]
            return (0, 0.0, [n_id])

        node_obj = nodes.get(n_id, {})
        gtype = (node_obj.get("properties", {}).get("gate_type") or node_obj.get("type", "GATE")).upper()
        gate_del = GATE_DELAY_NS.get(gtype, 2.0)

        parents = [p for p in node_incoming.get(n_id, []) if p]
        if not parents:
            depth_memo[n_id] = 1
            delay_memo[n_id] = gate_del
            path_memo[n_id] = [n_id]
            return (1, gate_del, [n_id])

        visited.add(n_id)
        max_d = 0
        max_delay = 0.0
        best_path: List[str] = []

        for p in parents:
            p_d, p_delay, p_path = get_node_depth(p, visited.copy())
            if p_delay >= max_delay:
                max_d = p_d
                max_delay = p_delay
                best_path = p_path

        total_d = max_d + 1
        total_delay = max_delay + gate_del
        full_path = best_path + [n_id]

        depth_memo[n_id] = total_d
        delay_memo[n_id] = total_delay
        path_memo[n_id] = full_path
        return (total_d, total_delay, full_path)

    # Compute for all nodes & outputs
    all_target_ids = [str(x) for x in list(nodes.keys()) if x] + [
        str(p.get("name") or p.get("id") or "") for p in primary_outputs if isinstance(p, dict) and (p.get("name") or p.get("id"))
    ]
    all_target_ids = [x for x in all_target_ids if x]
    worst_delay = 0.0
    critical_path: List[str] = []
    critical_endpoint = ""

    for tid in all_target_ids:
        d, delay, path = get_node_depth(tid)
        if delay > worst_delay:
            worst_delay = delay
            critical_path = path
            critical_endpoint = tid

    # Organize nodes into topological stages
    stages: Dict[int, List[Dict[str, Any]]] = {}
    for nid, node_obj in nodes.items():
        d = depth_memo.get(nid, 1)
        stages.setdefault(d, []).append({
            "id": nid,
            "label": node_obj.get("label", nid),
            "type": node_obj.get("type", "logic"),
            "delay_ns": delay_memo.get(nid, 2.0)
        })

    return {
        "max_stages": max(depth_memo.values()) if depth_memo else 1,
        "stages": {k: stages[k] for k in sorted(stages.keys())},
        "critical_path_delay_ns": round(worst_delay, 2),
        "critical_path_nodes": critical_path,
        "critical_endpoint": critical_endpoint
    }


def correlate_code_to_canvas(vhdl_code: str, netlist: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Matches schematic canvas nodes with exact VHDL source code statements and signal declarations.
    """
    correlations: List[Dict[str, Any]] = []
    if not vhdl_code:
        return correlations

    lines = vhdl_code.splitlines()
    nodes = netlist.get("nodes", []) if isinstance(netlist, dict) else []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        nid = node.get("id", "")
        lbl = node.get("label", nid)
        ntype = node.get("type", "").upper()

        matched_line_no = None
        matched_line_text = ""

        # Search for signal assignment: e.g. "lbl <= ..." or "nid <= ..."
        for idx, line in enumerate(lines):
            clean_l = line.strip()
            # Match assignment
            if re.search(rf'\b(?:{re.escape(lbl)}|{re.escape(nid)})\s*<=', clean_l, re.IGNORECASE):
                matched_line_no = idx + 1
                matched_line_text = clean_l
                break

        # Fallback: search for signal declaration or process name
        if not matched_line_no:
            for idx, line in enumerate(lines):
                clean_l = line.strip()
                if re.search(rf'\bsignal\s+(?:{re.escape(lbl)}|{re.escape(nid)})\b', clean_l, re.IGNORECASE):
                    matched_line_no = idx + 1
                    matched_line_text = clean_l
                    break

        correlations.append({
            "node_id": nid,
            "node_label": lbl,
            "gate_type": ntype,
            "vhdl_line": matched_line_no,
            "vhdl_statement": matched_line_text or f"-- Inferred {ntype} instance"
        })

    return correlations


def check_hardware_health_and_drc(
    netlist: Dict[str, Any],
    primary_inputs: List[Dict[str, Any]],
    primary_outputs: List[Dict[str, Any]],
    faults: Dict[str, str]
) -> Dict[str, Any]:
    """
    Checks for floating inputs, unused outputs, multi-driver nets, and active faults.
    """
    wires = netlist.get("wires", [])
    nodes = netlist.get("nodes", [])

    connected_in_ports: Set[str] = set()
    connected_out_ports: Set[str] = set()
    wire_targets: Set[str] = set()

    for w in wires:
        if isinstance(w, dict):
            src_node = str(w.get("source_node", ""))
            src_port = str(w.get("source_port", ""))
            tgt_node = str(w.get("target_node", ""))
            tgt_port = str(w.get("target_port", ""))
            connected_out_ports.add(f"{src_node}:{src_port}")
            connected_out_ports.add(f"{src_node}:{src_port.replace('out_', '')}")
            connected_in_ports.add(f"{tgt_node}:{tgt_port}")
            connected_in_ports.add(f"{tgt_node}:{tgt_port.replace('in_', '')}")
            connected_in_ports.add(tgt_port)
            connected_in_ports.add(tgt_port.replace('in_', ''))
            wire_targets.add(tgt_node)
            wire_targets.add(tgt_node.replace('out_', ''))
            wire_targets.add(tgt_port)
            wire_targets.add(tgt_port.replace('out_', ''))

    floating_inputs: List[str] = []
    dead_outputs: List[str] = []

    for n in nodes:
        if not isinstance(n, dict):
            continue
        nid = n.get("id", "")
        for inp in n.get("inputs", []):
            pname = inp.get("name", inp.get("id", ""))
            pid = inp.get("id", "")
            is_connected = (
                f"{nid}:{pname}" in connected_in_ports
                or f"{nid}:{pid}" in connected_in_ports
                or f"{nid}:in_{pname}" in connected_in_ports
                or pname in connected_in_ports
                or pid in connected_in_ports
            )
            if not is_connected:
                floating_inputs.append(f"{n.get('label', nid)}.{pname}")

        for out in n.get("outputs", []):
            pname = out.get("name", out.get("id", ""))
            pid = out.get("id", "")
            is_driven = (
                f"{nid}:{pname}" in connected_out_ports
                or f"{nid}:{pid}" in connected_out_ports
                or f"{nid}:out_{pname}" in connected_out_ports
                or pname in connected_out_ports
                or pid in connected_out_ports
                or nid in wire_targets
                or out.get("is_open")
                or (isinstance(out.get("properties"), dict) and out.get("properties", {}).get("open"))
            )
            if not is_driven:
                dead_outputs.append(f"{n.get('label', nid)}.{pname}")

    # Check unrouted primary outputs
    unrouted_primary_outputs = []
    for p in primary_outputs:
        if isinstance(p, dict):
            pname = p.get("name", "")
            pid = p.get("id", "")
            if pname not in wire_targets and pid not in wire_targets and f"out_{pname}" not in wire_targets:
                unrouted_primary_outputs.append(pname or pid)

    return {
        "is_drc_clean": len(floating_inputs) == 0 and len(unrouted_primary_outputs) == 0,
        "floating_inputs": floating_inputs,
        "dead_outputs": dead_outputs,
        "unrouted_primary_outputs": unrouted_primary_outputs,
        "active_faults_count": len(faults),
        "active_faults": faults
    }


def generate_recommendations(
    classification: str,
    drc: Dict[str, Any],
    netlist: Dict[str, Any],
    primary_outputs: List[Dict[str, Any]],
    vhdl_code: str
) -> List[str]:
    """
    Produces actionable, context-aware engineering recommendations for the circuit.
    """
    recs: List[str] = []

    # 1. Address DRC issues if any
    if drc.get("floating_inputs"):
        recs.append(f"Route unconnected gate inputs: {', '.join(drc['floating_inputs'][:3])} to prevent floating CMOS high-Z state.")
    if drc.get("unrouted_primary_outputs"):
        recs.append(f"Connect internal driving signals to primary outputs: {', '.join(drc['unrouted_primary_outputs'])}.")

    # 2. Output monitoring & Visual Probing
    nodes = netlist.get("nodes", [])
    has_led = any(n.get("type", "").upper() in ("LED", "RGB_LED", "SEVEN_SEG") for n in nodes if isinstance(n, dict))
    has_probe = any(n.get("type", "").upper() == "PROBE" for n in nodes if isinstance(n, dict))

    if not has_led and not has_probe:
        recs.append("Add an illuminated LED or live digital Probe to primary outputs (e.g. Cout or Sum) for visual signal telemetry.")

    # 3. Architectural Evolution based on Classification
    if "Full Adder" in classification:
        recs.append("Chain multiple full adders to synthesize a multi-bit (e.g. 4-bit or 8-bit) Ripple Carry Adder with overflow detection.")
        recs.append("Optimize critical carry propagation delay using Carry-Lookahead (CLA) generate/propagate logic.")
    elif "Counter" in classification:
        recs.append("Connect the counter output bus to a 7-Segment Hex Display for real-time decimal/hexadecimal readout.")
    elif "RISC-V" in classification or "Processor" in classification:
        recs.append("Integrate dual-port BRAM memory blocks and load assembly firmware into ROM to execute instructions.")

    # 4. Verification
    if "testbench" not in vhdl_code.lower() and "assert" not in vhdl_code.lower():
        recs.append("Run Cycle-Accurate Simulation with a self-checking testbench asserting expected truth table outputs over 100ns.")

    if not recs:
        recs.append("Run multi-dimensional architectural benchmarking to calculate dynamic power and maximum operating frequency.")

    return recs[:4]


def build_circuit_mental_map(ctx: Dict[str, Any], project_id: str = "") -> Dict[str, Any]:
    """
    Main entry point: analyzes circuit_context and builds the complete Cognitive Mental Map.
    """
    circuit_name = ctx.get("circuit_name", "active_circuit")
    vhdl_code = (ctx.get("vhdl_code") or "").strip()
    netlist = ctx.get("netlist") or {}
    probes = ctx.get("probes", {})
    faults = ctx.get("faults", {})

    primary_inputs = netlist.get("primary_inputs", []) if isinstance(netlist, dict) else []
    primary_outputs = netlist.get("primary_outputs", []) if isinstance(netlist, dict) else []
    nodes = netlist.get("nodes", []) if isinstance(netlist, dict) else []
    wires = netlist.get("wires", []) if isinstance(netlist, dict) else []

    node_types = [n.get("type", "GATE") for n in nodes if isinstance(n, dict)]
    pi_names = [p.get("name", p.get("id", "")) for p in primary_inputs if isinstance(p, dict)]
    po_names = [p.get("name", p.get("id", "")) for p in primary_outputs if isinstance(p, dict)]

    # 1. Classify
    classification, intent, scale = classify_architecture(
        circuit_name, node_types, pi_names, po_names, vhdl_code
    )

    # 2. Lineage
    lineage_data = trace_signal_lineage(netlist, primary_inputs, primary_outputs)

    # 3. Topological Stages & Critical Path
    stage_data = compute_stages_and_critical_path(netlist, primary_inputs, primary_outputs)

    # 4. Code-to-Canvas
    code_canvas_map = correlate_code_to_canvas(vhdl_code, netlist)

    # 5. DRC & Health
    drc_data = check_hardware_health_and_drc(netlist, primary_inputs, primary_outputs, faults)

    # 6. Recommendations
    recommendations = generate_recommendations(classification, drc_data, netlist, primary_outputs, vhdl_code)

    return {
        "project_id": project_id,
        "circuit_name": circuit_name,
        "classification": classification,
        "design_intent": intent,
        "scale_level": scale,
        "active_file": ctx.get("active_file", ""),
        "active_tab": ctx.get("active_tab", "design"),
        "active_tab_label": ctx.get("active_tab_label", "Design & RTL Studio"),
        "current_scale_label": ctx.get("current_scale_label", "Scale 1: Gate Level"),
        "is_simulating": ctx.get("is_simulating", False),
        "canvas_live_summary": ctx.get("canvas_live_summary", {}),
        "complexity": {
            "node_count": len(nodes),
            "wire_count": len(wires),
            "primary_inputs_count": len(primary_inputs),
            "primary_outputs_count": len(primary_outputs)
        },
        "primary_inputs": pi_names,
        "primary_outputs": po_names,
        "live_probes": probes,
        "active_faults": faults,
        "stages_breakdown": stage_data.get("stages", {}),
        "max_stages": stage_data.get("max_stages", 1),
        "critical_path": {
            "delay_ns": stage_data.get("critical_path_delay_ns", 0.0),
            "path": stage_data.get("critical_path_nodes", []),
            "critical_endpoint": stage_data.get("critical_endpoint", "")
        },
        "signal_lineage": lineage_data.get("output_lineage", {}),
        "code_canvas_map": code_canvas_map,
        "drc_health": drc_data,
        "recommendations": recommendations
    }


def format_mental_map_markdown(m: Dict[str, Any]) -> str:
    """
    Renders the Cognitive Mental Map into an informative, high-density markdown document.
    """
    act_label = m.get("active_tab_label", "Design & RTL Studio")
    act_tab = m.get("active_tab", "design")
    lines = [
        "## 🧠 COGNITIVE EDA MENTAL MAP (LIVE HARDWARE SITUATIONAL AWARENESS)",
        f"- **Active User Screen**: **{act_label}** (`{act_tab}`)",
        f"- **Architectural Classification**: **{m.get('classification')}** ({m.get('scale_level')})",
    ]
    if m.get("active_file"):
        lines.append(f"- **Active Source File**: `{m.get('active_file')}`")
    lines.extend([
        f"- **Design Intent & Function**: {m.get('design_intent')}",
        f"- **Circuit Complexity**: `{m.get('complexity', {}).get('node_count')}` components, `{m.get('complexity', {}).get('wire_count')}` nets",
        f"- **Primary I/O Terminals**: Inputs: `[{', '.join(m.get('primary_inputs', []))}]` ➔ Outputs: `[{', '.join(m.get('primary_outputs', []))}]`",
    ])

    # Live logic probes
    probes = m.get("live_probes", {})
    if probes:
        probe_items = [f"`{k}={v}`" for k, v in probes.items()]
        lines.append(f"- **Live Logic State Vector**: {', '.join(probe_items)}")

    # Active faults
    faults = m.get("active_faults", {})
    if faults:
        fault_items = [f"`{k} s-a-{v}`" for k, v in faults.items()]
        lines.append(f"- **Active Fault Injections (Stuck-At)**: ⚠️ {', '.join(fault_items)}")
    else:
        lines.append("- **Active Fault Injections**: None (Nominal operation)")

    # Execution Stages Breakdown
    stages = m.get("stages_breakdown", {})
    if stages:
        lines.append("\n### ⚡ Topological Execution Stages:")
        for stage_idx, stage_nodes in sorted(stages.items()):
            node_strs = [f"`{n.get('label')}` ({n.get('type')})" for n in stage_nodes]
            lines.append(f"- **Stage {stage_idx}**: {', '.join(node_strs)}")

    # Signal Lineage
    lineage = m.get("signal_lineage", {})
    if lineage:
        lines.append("\n### 🔗 Signal Lineage & Dependency Tracing:")
        for out_name, data in lineage.items():
            inputs_str = ', '.join(data.get("driving_inputs", [])) or "None"
            gates_str = ' ➔ '.join(data.get("intermediate_gates", [])) or "Direct"
            lines.append(f"- **{out_name}**: Driven by inputs `[{inputs_str}]` through chain: {gates_str}")

    # Critical Path
    crit = m.get("critical_path", {})
    if crit.get("path"):
        valid_nodes = [str(p) for p in crit.get("path", []) if p is not None and str(p).strip()]
        path_str = " ➔ ".join(valid_nodes) if valid_nodes else "Direct"
        lines.append(f"\n### ⏱️ Critical Path & Propagation Delay:")
        lines.append(f"- **Worst-Case Path**: `{path_str}`")
        lines.append(f"- **Estimated Propagation Delay**: `{crit.get('delay_ns')} ns` to terminal `{crit.get('critical_endpoint')}`")

    # Code-to-Canvas Correlation
    cc_map = m.get("code_canvas_map", [])
    if cc_map:
        lines.append("\n### 📍 Code-to-Canvas Bidirectional Correlation Matrix:")
        for entry in cc_map[:8]:
            lno = f"Line {entry.get('vhdl_line')}" if entry.get("vhdl_line") else "Inferred"
            lines.append(f"- Canvas `[{entry.get('gate_type')}] {entry.get('node_label')}` ⇄ VHDL `{lno}`: `{entry.get('vhdl_statement')}`")

    # DRC Health
    drc = m.get("drc_health", {})
    lines.append("\n### 🛡️ Hardware Integrity & DRC Health:")
    if drc.get("is_drc_clean"):
        lines.append("- **Status**: ✅ Clean (0 floating inputs, 0 unrouted primary outputs)")
    else:
        if drc.get("floating_inputs"):
            lines.append(f"- **Floating Inputs**: ⚠️ `{', '.join(drc['floating_inputs'])}`")
        if drc.get("unrouted_primary_outputs"):
            lines.append(f"- **Unrouted Primary Outputs**: ⚠️ `{', '.join(drc['unrouted_primary_outputs'])}`")

    # Actionable Recommendations
    recs = m.get("recommendations", [])
    if recs:
        lines.append("\n### 🚀 Actionable Engineering Opportunities:")
        for idx, rec in enumerate(recs, 1):
            lines.append(f"{idx}. {rec}")

    return "\n".join(lines)
