"""
CircuitForge VHDL AST Parser & Linting Engine
Parses VHDL entities, architectures, ports, signals, and processes.
Provides real-time linting, syntax analysis, and latch inference warnings.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional

@dataclass
class ParsedPort:
    name: str
    direction: str  # in, out, inout, buffer
    type_name: str  # std_logic, std_logic_vector, integer, etc.
    width: int = 1
    range_str: Optional[str] = None

@dataclass
class ParsedSignal:
    name: str
    type_name: str
    width: int = 1

@dataclass
class ParsedEntity:
    name: str
    generics: Dict[str, str] = field(default_factory=dict)
    ports: List[ParsedPort] = field(default_factory=list)

@dataclass
class LintMessage:
    line: int
    severity: str  # 'error', 'warning', 'info'
    message: str
    rule_id: str

@dataclass
class ParseResult:
    entities: List[ParsedEntity] = field(default_factory=list)
    signals: List[ParsedSignal] = field(default_factory=list)
    processes_count: int = 0
    components_count: int = 0
    lint_messages: List[LintMessage] = field(default_factory=list)
    is_valid: bool = True

class VHDLParser:
    """Lightweight robust VHDL parser and linter."""

    @staticmethod
    def parse_code(vhdl_text: str) -> ParseResult:
        result = ParseResult()
        if not vhdl_text or not vhdl_text.strip():
            result.is_valid = False
            result.lint_messages.append(LintMessage(
                line=1,
                severity='error',
                message='VHDL source code is empty. Please enter or select a VHDL circuit design.',
                rule_id='LINT_EMPTY_SOURCE'
            ))
            return result

        lines = vhdl_text.splitlines()

        # Strip comments for AST search while keeping line numbers
        clean_lines = []
        for line in lines:
            if '--' in line:
                clean_lines.append(line[:line.index('--')])
            else:
                clean_lines.append(line)

        clean_text = '\n'.join(clean_lines)

        # 1. Match Entities Robustly (supports any naming, end entity, end <name>, end;)
        ent_matches = list(re.finditer(r'\bentity\s+([a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+)*?)\s+is\b', clean_text, re.IGNORECASE))
        for em in ent_matches:
            ent_name = em.group(1).strip()
            ent_start = em.end()
            after_ent = clean_text[ent_start:]
            end_match = re.search(r'\bend(?:\s+entity)?(?:\s+[a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+)*)?\s*;', after_ent, re.IGNORECASE)
            ent_body = after_ent[:end_match.start()] if end_match else after_ent

            # Extract port block using robust nested parenthesis tracking
            raw_port = VHDLParser._extract_parenthesized_block(ent_body, r'\bport\s*\(')
            ports = VHDLParser._parse_port_block(raw_port) if raw_port is not None else []
            result.entities.append(ParsedEntity(name=ent_name, ports=ports))

        # 2. Match Signals in Architecture
        signal_regex = re.compile(
            r'signal\s+([a-zA-Z0-9_,\s]+)\s*:\s*([a-zA-Z0-9_]+)(?:\s*\((.*?)\))?\s*;',
            re.IGNORECASE
        )
        for match in signal_regex.finditer(clean_text):
            names_str = match.group(1)
            type_name = match.group(2)
            range_str = match.group(3)
            width = VHDLParser._extract_width(type_name, range_str)
            for name in names_str.split(','):
                name = name.strip()
                if name:
                    result.signals.append(ParsedSignal(name=name, type_name=type_name, width=width))

        # 3. Match Processes
        process_regex = re.compile(r'process\s*(?:\((.*?)\))?\s*begin', re.IGNORECASE)
        processes = list(process_regex.finditer(clean_text))
        result.processes_count = len(processes)

        # 4. Component Instantiations
        comp_regex = re.compile(r'([a-zA-Z0-9_]+)\s*:\s*(?:entity\s+)?([a-zA-Z0-9_.]+)\s+port\s+map', re.IGNORECASE)
        components = list(comp_regex.finditer(clean_text))
        result.components_count = len(components)

        # 5. Run Lint Rules
        VHDLParser._run_lint_rules(lines, clean_text, result)

        if any(msg.severity == 'error' for msg in result.lint_messages):
            result.is_valid = False

        return result

    @staticmethod
    def _extract_parenthesized_block(text: str, prefix_regex: str) -> Optional[str]:
        match = re.search(prefix_regex, text, re.IGNORECASE)
        if not match:
            return None
        start = match.end()
        depth = 1
        i = start
        while i < len(text):
            ch = text[i]
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return text[start:i]
            i += 1
        return text[start:]

    @staticmethod
    def _parse_port_block(port_block: str) -> List[ParsedPort]:
        ports: List[ParsedPort] = []
        if not port_block.strip():
            return ports

        port_declarations = port_block.split(';')
        for decl in port_declarations:
            decl = decl.strip()
            if not decl or ':' not in decl:
                continue

            parts = decl.split(':', 1)
            names_str = parts[0].strip()
            type_part = parts[1].strip()

            dir_match = re.match(r'^(in|out|inout|buffer)\s+(.*)', type_part, re.IGNORECASE)
            if dir_match:
                direction = dir_match.group(1).lower()
                rem = dir_match.group(2).strip()
            else:
                direction = 'in'
                rem = type_part

            # Parse type and width
            width = 1
            range_str = None
            if '(' in rem and ')' in rem:
                type_name = rem[:rem.index('(')].strip()
                range_str = rem[rem.index('(')+1 : rem.rindex(')')].strip()
                width = VHDLParser._extract_width(type_name, range_str)
            else:
                type_name = rem.strip()

            for name in names_str.split(','):
                name = name.strip()
                if name:
                    ports.append(ParsedPort(
                        name=name,
                        direction=direction,
                        type_name=type_name,
                        width=width,
                        range_str=range_str
                    ))
        return ports

    @staticmethod
    def _extract_width(type_name: str, range_str: Optional[str]) -> int:
        if not range_str:
            return 1
        downto_match = re.search(r'(\d+)\s+downto\s+(\d+)', range_str, re.IGNORECASE)
        if downto_match:
            high = int(downto_match.group(1))
            low = int(downto_match.group(2))
            return abs(high - low) + 1
        to_match = re.search(r'(\d+)\s+to\s+(\d+)', range_str, re.IGNORECASE)
        if to_match:
            low = int(to_match.group(1))
            high = int(to_match.group(2))
            return abs(high - low) + 1
        return 1

    @staticmethod
    def _parse_port_map_bindings(text: str) -> List[Any]:
        """Parses port map associations into (formal_port, actual_signal) pairs with balanced parenthesis tracking."""
        bindings = []
        parts = []
        depth = 0
        cur = []
        for ch in text:
            if ch == '(':
                depth += 1
                cur.append(ch)
            elif ch == ')':
                depth -= 1
                cur.append(ch)
            elif ch == ',' and depth == 0:
                parts.append(''.join(cur).strip())
                cur = []
            else:
                cur.append(ch)
        if cur:
            parts.append(''.join(cur).strip())

        for p in parts:
            if '=>' in p:
                f, a = p.split('=>', 1)
                bindings.append((f.strip(), a.strip()))
        return bindings

    @staticmethod
    def _run_lint_rules(lines: List[str], clean_text: str, result: ParseResult):
        # Rule 1: Missing IEEE library imports
        if 'ieee.std_logic_1164' not in clean_text.lower():
            result.lint_messages.append(LintMessage(
                line=1,
                severity='warning',
                message='Missing standard IEEE library: "library IEEE; use IEEE.STD_LOGIC_1164.ALL;" is recommended.',
                rule_id='LINT_MISSING_IEEE'
            ))

        # Rule 2: Check entity declaration
        if not result.entities:
            result.lint_messages.append(LintMessage(
                line=1,
                severity='error',
                message='No valid VHDL entity found in the source code.',
                rule_id='LINT_NO_ENTITY'
            ))

        # Rule 3: Check clocked processes for async/sync reset and rising_edge
        for i, line in enumerate(lines, 1):
            if 'rising_edge' in line.lower() or "clk'event and clk" in line.lower():
                block_window = '\n'.join(lines[max(0, i-5):min(len(lines), i+15)]).lower()
                if 'rst' not in block_window and 'reset' not in block_window:
                    result.lint_messages.append(LintMessage(
                        line=i,
                        severity='info',
                        message='Clocked register has no visible reset condition. Ensure reset is deliberate.',
                        rule_id='LINT_NO_RESET'
                    ))

        # Rule 4: Inferred latch warning (if without else in combinational process)
        comb_process_regex = re.compile(r'process\s*\([^clk\)]+\)\s*begin(.*?)end\s+process', re.IGNORECASE | re.DOTALL)
        for match in comb_process_regex.finditer(clean_text):
            body = match.group(1)
            if re.search(r'\bif\b', body, re.IGNORECASE) and not re.search(r'\belse\b', body, re.IGNORECASE):
                result.lint_messages.append(LintMessage(
                    line=1,
                    severity='warning',
                    message='Combinational process contains "if" without default "else": may infer an unwanted transparent latch.',
                    rule_id='LINT_INFERRED_LATCH'
                ))

    @staticmethod
    def synthesize_from_vhdl(vhdl_text: str, circuit_name: Optional[str] = None) -> Any:
        """Synthesizes a custom VHDL string into an interactive NetlistGraph with nodes, ports, and wires strictly snapped to the 20px grid."""
        from backend.app.engine.netlist import NetlistGraph, NetlistNode, NetlistWire, PortDef

        parse_res = VHDLParser.parse_code(vhdl_text)
        if not parse_res.entities:
            entity_name = circuit_name or "custom_circuit"
            primary_inputs = [PortDef("in_a", "A", "in", 1), PortDef("in_b", "B", "in", 1)]
            primary_outputs = [PortDef("out_y", "Y", "out", 1)]
        else:
            entity = parse_res.entities[0]
            entity_name = entity.name
            primary_inputs = [
                PortDef(f"in_{p.name}", p.name, "in", p.width, p.type_name)
                for p in entity.ports if p.direction.lower() in ("in", "inout")
            ]
            primary_outputs = [
                PortDef(f"out_{p.name}", p.name, "out", p.width, p.type_name)
                for p in entity.ports if p.direction.lower() in ("out", "buffer")
            ]

        # Extract architecture body
        clean_text = re.sub(r'--.*', '', vhdl_text)
        arch_match = re.search(
            r'architecture\s+([a-zA-Z0-9_\-]+)\s+of\s+([a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+)*)\s+is\s*(.*?)\s*begin\s*(.*?)\s*end',
            clean_text,
            re.DOTALL | re.IGNORECASE
        )

        nodes: List[NetlistNode] = []
        wires: List[NetlistWire] = []

        if arch_match:
            arch_body = arch_match.group(4)

            # Strip assertions and report statements (including severity clauses)
            clean_arch_body = re.sub(r'\breport\b\s*.*?(?:severity\s+[a-zA-Z0-9_]+)?\s*;', '', arch_body, flags=re.IGNORECASE | re.DOTALL)
            clean_arch_body = re.sub(r'\bassert\b\s*.*?(?:severity\s+[a-zA-Z0-9_]+)?\s*;', '', clean_arch_body, flags=re.IGNORECASE | re.DOTALL)
            # Strip double-quoted string literals and logic quotes
            clean_arch_body = re.sub(r'"[^"]*"', '', clean_arch_body)

            # Find continuous and sequential assignments: signal <= expr;
            raw_assigns = re.findall(r'([a-zA-Z0-9_]+)\s*<=\s*([^;]+);', clean_arch_body)

            # Group assignments by LHS target signal to consolidate multi-branch processes/cases/muxes
            grouped_assigns: Dict[str, List[str]] = {}
            for raw_lhs, raw_expr in raw_assigns:
                target_lhs = raw_lhs.strip()
                if target_lhs not in grouped_assigns:
                    grouped_assigns[target_lhs] = []
                grouped_assigns[target_lhs].append(raw_expr.strip())

            # Detect case selectors and process sensitivity lists
            case_selectors = re.findall(r'case\s+([a-zA-Z0-9_]+)\s+is', clean_arch_body, re.IGNORECASE)
            process_sens: List[str] = []
            for sens in re.findall(r'process\s*\((.*?)\)', clean_arch_body, re.IGNORECASE):
                for s in sens.split(','):
                    s_clean = s.strip()
                    if s_clean and s_clean not in process_sens:
                        process_sens.append(s_clean)

            reserved_keywords = {
                "xor", "and", "or", "nand", "nor", "xnor", "not", "when", "else",
                "others", "to", "downto", "is", "begin", "end", "case", "null",
                "rising_edge", "falling_edge", "event", "clk", "clock",
                "std_logic", "std_logic_vector", "signed", "unsigned", "boolean", "integer",
                "natural", "positive", "report", "severity", "error", "warning", "note",
                "failure", "assert", "variable", "constant", "signal", "type", "subtype",
                "process", "port", "map", "generic", "if", "then", "elsif", "loop", "generate",
                "after", "ns", "ps", "us", "ms", "sec", "true", "false"
            }

            # ── Structural Architecture: Component Instantiation Synthesis ─────────────
            # Detects "inst_label : [entity work.]component_name port map (...);"
            # and creates one NetlistNode per instantiation for multi-block schematic view.
            COMPONENT_LABELS: Dict[str, str] = {
                "alu_64bit":             "64-Bit ALU",
                "alu_32bit":             "32-Bit ALU",
                "register_file_64bit":   "Register File 32×64",
                "register_file_32bit":   "Register File 32×32",
                "control_unit":          "Control Unit",
                "memory_controller":     "Memory Controller",
                "bitstream_rx":          "Bitstream RX",
                "instruction_decoder":   "Instruction Decoder",
                "pipeline_stage":        "Pipeline Stage",
                "forwarding_unit":       "Forwarding Unit",
                "hazard_unit":           "Hazard Detection Unit",
                "branch_predictor":      "Branch Predictor",
                "cache_controller":      "Cache Controller",
                "mmu":                   "Memory Mgmt Unit",
            }
            comp_pattern = re.compile(
                r'([a-zA-Z0-9_]+)\s*:\s*(?:entity\s+(?:work\.)?)?([a-zA-Z0-9_]+)\s+port\s+map\s*\((.*?)\)\s*;',
                re.DOTALL | re.IGNORECASE
            )
            comp_matches = comp_pattern.findall(clean_arch_body)
            comp_nodes: List[NetlistNode] = []
            cols = 3  # pack into grid columns
            _comp_scale = 4 if len(comp_matches) >= 4 else 3
            for ci, (inst_label, comp_type, port_map_text) in enumerate(comp_matches):
                inst_label = inst_label.strip()
                comp_type  = comp_type.strip().lower()
                disp_label = COMPONENT_LABELS.get(comp_type, comp_type.replace("_", " ").title())
                node_id_c  = f"node_{inst_label.lower()}_{ci+1}"
                bindings   = VHDLParser._parse_port_map_bindings(port_map_text)
                in_ports_c: List[PortDef] = []
                out_ports_c: List[PortDef] = []
                for formal, actual in bindings:
                    formal_l = formal.lower()
                    is_out = any(kw in formal_l for kw in ("result", "out", "data_out", "q", "addr", "we", "rd_data", "zero", "carry", "overflow", "mem_", "alu_"))
                    if is_out:
                        out_ports_c.append(PortDef(f"out_{formal}", formal, "out", 64))
                    else:
                        in_ports_c.append(PortDef(f"in_{formal}", formal, "in", 64))
                if not in_ports_c:
                    in_ports_c = [PortDef("in_clk", "clk", "in", 1), PortDef("in_rst", "rst", "in", 1)]
                if not out_ports_c:
                    out_ports_c = [PortDef("out_result", "result", "out", 64)]
                col_idx = ci % cols
                row_idx = ci // cols
                node_x  = 300 + col_idx * 300
                node_y  = 60  + row_idx * 260
                block_h = max(140, max(len(in_ports_c), len(out_ports_c)) * 32)
                comp_nodes.append(NetlistNode(
                    id=node_id_c,
                    label=f"{disp_label}\n({inst_label})",
                    type="SUBSYSTEM",
                    scale=_comp_scale,
                    x=node_x,
                    y=node_y,
                    width=240,
                    height=block_h,
                    inputs=in_ports_c,
                    outputs=out_ports_c,
                    properties={"component": comp_type, "instance": inst_label}
                ))

            if comp_nodes:
                nodes.extend(comp_nodes)
                # Wire shared signals between component nodes
                sig_producers: Dict[str, tuple] = {}  # formal_name → (node_id, port_id)
                for cn in comp_nodes:
                    for op in cn.outputs:
                        sig_producers[op.name.lower()] = (cn.id, op.id)
                wire_id_ctr = 0
                for cn in comp_nodes:
                    for ip in cn.inputs:
                        key = ip.name.lower()
                        if key in sig_producers:
                            src_node, src_port = sig_producers[key]
                            if src_node != cn.id:
                                wires.append(NetlistWire(
                                    id=f"w_comp_{wire_id_ctr}",
                                    source_node=src_node,
                                    source_port=src_port,
                                    target_node=cn.id,
                                    target_port=ip.id,
                                    width=64,
                                    label=ip.name
                                ))
                                wire_id_ctr += 1
                        else:
                            # Connect from primary input stub
                            in_match = next((p for p in primary_inputs if p.name.lower() == key), None)
                            if in_match:
                                wires.append(NetlistWire(
                                    id=f"w_pi_{wire_id_ctr}",
                                    source_node=in_match.id,
                                    source_port=in_match.name,
                                    target_node=cn.id,
                                    target_port=ip.id,
                                    width=in_match.width,
                                    label=ip.name
                                ))
                                wire_id_ctr += 1

            elif grouped_assigns:
                total_nodes = len(grouped_assigns)
                node_idx = 1
                for lhs, expr_list in grouped_assigns.items():
                    # Determine functional gate/block type
                    gate_type = "CUSTOM"
                    combined_exprs = " ".join(expr_list).lower()
                    is_mux = (
                        len(expr_list) > 1 or
                        bool(case_selectors) or
                        ("when " in combined_exprs and "else" in combined_exprs) or
                        "mux" in entity_name.lower() or
                        "multiplex" in entity_name.lower()
                    )

                    if is_mux:
                        gate_type = "MUX"
                        branch_count = max(len(expr_list), 2)
                        label = f"MUX {branch_count}:1 ({lhs})" if len(expr_list) > 1 else f"{lhs} (MUX)"
                    elif " xor " in combined_exprs:
                        gate_type = "XOR"
                        label = f"{lhs} (XOR)"
                    elif " and " in combined_exprs:
                        gate_type = "AND"
                        label = f"{lhs} (AND)"
                    elif " or " in combined_exprs:
                        gate_type = "OR"
                        label = f"{lhs} (OR)"
                    elif " nand " in combined_exprs:
                        gate_type = "NAND"
                        label = f"{lhs} (NAND)"
                    elif " nor " in combined_exprs:
                        gate_type = "NOR"
                        label = f"{lhs} (NOR)"
                    elif "not " in combined_exprs or combined_exprs.startswith("not"):
                        gate_type = "NOT"
                        label = f"{lhs} (NOT)"
                    elif "+" in combined_exprs or "-" in combined_exprs or "adder" in entity_name.lower():
                        gate_type = "ADDER"
                        label = f"{lhs} (ADDER)"
                    else:
                        gate_type = "CUSTOM"
                        label = f"{lhs} (RTL)"

                    # Extract distinct input operands
                    operands: List[str] = []
                    for expr in expr_list:
                        tokens = re.findall(r'\b[a-zA-Z0-9_]+\b', expr)
                        for t in tokens:
                            # Discard numeric literals (e.g. '0', '1', 42) and reserved VHDL keywords
                            if not t.isdigit() and t.lower() not in reserved_keywords:
                                if t.lower() != lhs.lower() and t not in operands:
                                    operands.append(t)

                    # Add case selectors (e.g. 'sel') and sensitivity inputs
                    for cs in case_selectors:
                        if cs not in operands and cs.lower() != lhs.lower():
                            operands.insert(0, cs)
                    for ps in process_sens:
                        if ps not in operands and ps.lower() != lhs.lower() and ps.lower() not in ("clk", "clock"):
                            operands.append(ps)

                    # If this is the sole consolidated top-level node, ensure all primary inputs are included
                    if total_nodes == 1:
                        for pi in primary_inputs:
                            if pi.name not in operands and pi.name.lower() != lhs.lower():
                                operands.append(pi.name)

                    node_id = f"node_{lhs.lower()}_{node_idx}"
                    in_ports = [
                        PortDef(
                            f"in_{op}",
                            op,
                            "in",
                            next((p.width for p in primary_inputs if p.name.lower() == op.lower()), 1)
                        )
                        for op in operands
                    ]
                    out_ports = [
                        PortDef(
                            f"out_{lhs}",
                            lhs,
                            "out",
                            next((p.width for p in primary_outputs if p.name.lower() == lhs.lower()), 1)
                        )
                    ]

                    # Snap dimensions and layout to 20px grid
                    if total_nodes == 1:
                        x = 420
                        y = 100
                        width = 220
                        height = max(120, len(in_ports) * 32)
                        height = (height // 20) * 20
                    else:
                        col = (node_idx - 1) % 2
                        row = (node_idx - 1) // 2
                        x = 280 + col * 280
                        y = 80 + row * 160
                        width = 200
                        height = max(100, len(in_ports) * 28)
                        height = (height // 20) * 20

                    node = NetlistNode(
                        id=node_id,
                        label=label,
                        type=gate_type,
                        scale=1 if total_nodes > 1 else 2,
                        x=x,
                        y=y,
                        width=width,
                        height=height,
                        inputs=in_ports,
                        outputs=out_ports,
                        properties={
                            "gate_type": gate_type,
                            "branches": len(expr_list),
                            "target_signal": lhs
                        }
                    )
                    nodes.append(node)

                    # Route input wires
                    for op in operands:
                        in_match = next((p for p in primary_inputs if p.name.lower() == op.lower()), None)
                        if in_match:
                            wires.append(NetlistWire(
                                id=f"w_{in_match.id}_{node_id}_{op}",
                                source_node=in_match.id,
                                source_port=in_match.name,
                                target_node=node_id,
                                target_port=f"in_{op}",
                                width=in_match.width,
                                label=op
                            ))
                        else:
                            prev_node = next((n for n in nodes if n.outputs[0].name.lower() == op.lower()), None)
                            if prev_node:
                                wires.append(NetlistWire(
                                    id=f"w_{prev_node.id}_{node_id}_{op}",
                                    source_node=prev_node.id,
                                    source_port=prev_node.outputs[0].id,
                                    target_node=node_id,
                                    target_port=f"in_{op}",
                                    width=1,
                                    label=op
                                ))

                    # Route output wire to primary output
                    out_match = next((p for p in primary_outputs if p.name.lower() == lhs.lower()), None)
                    if out_match:
                        wires.append(NetlistWire(
                            id=f"w_{node_id}_{out_match.id}",
                            source_node=node_id,
                            source_port=out_ports[0].id,
                            target_node=out_match.id,
                            target_port=out_match.name,
                            width=out_match.width,
                            label=lhs
                        ))

                    node_idx += 1

        if not nodes:
            block_h = max(120, len(primary_inputs) * 40)
            block_h = (block_h // 20) * 20
            block_node = NetlistNode(
                id=f"{entity_name}_core",
                label=f"{entity_name} (RTL Core)",
                type="CUSTOM",
                scale=2,
                x=460,
                y=100,
                width=240,
                height=block_h,
                inputs=[PortDef(p.id, p.name, "in", p.width) for p in primary_inputs],
                outputs=[PortDef(p.id, p.name, "out", p.width) for p in primary_outputs],
                properties={"processes": parse_res.processes_count}
            )
            nodes.append(block_node)
            for pi in primary_inputs:
                wires.append(NetlistWire(
                    id=f"w_in_{pi.name}",
                    source_node=pi.id,
                    source_port=pi.name,
                    target_node=block_node.id,
                    target_port=pi.id,
                    width=pi.width,
                    label=pi.name
                ))
            for po in primary_outputs:
                wires.append(NetlistWire(
                    id=f"w_out_{po.name}",
                    source_node=block_node.id,
                    source_port=po.id,
                    target_node=po.id,
                    target_port=po.name,
                    width=po.width,
                    label=po.name
                ))

        return NetlistGraph(
            name=entity_name,
            scale=1 if len(nodes) > 1 else 2,
            description=f"Synthesized RTL architecture from VHDL source ({entity_name})",
            primary_inputs=primary_inputs,
            primary_outputs=primary_outputs,
            nodes=nodes,
            wires=wires,
            metadata={"source": "VHDL Synthesizer", "entities": len(parse_res.entities)}
        )
