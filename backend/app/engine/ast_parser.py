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
    def run_circuit_drc(
        nodes: List[Any],
        wires: List[Any],
        primary_inputs: List[Any],
        primary_outputs: List[Any],
        clean_text: str,
        vhdl_text: str
    ) -> List[Dict[str, Any]]:
        """Runs thorough Design Rule Checking (DRC) for connection faults, bus contention, and floating gates."""
        diagnostics: List[Dict[str, Any]] = []

        # 1. Missing Connection / Undriven Input Pin Check (DRC-E101)
        for node in nodes:
            node_incoming = [w for w in wires if w.target_node == node.id]
            for pin in node.inputs:
                pin_connected = any(
                    w.target_port.lower() in (pin.id.lower(), pin.name.lower(), f"in_{pin.name.lower()}")
                    for w in node_incoming
                )
                if not pin_connected:
                    diag = {
                        "code": "DRC-E101",
                        "severity": "error",
                        "title": f"Undriven Input Pin ({node.label} ➔ {pin.name})",
                        "message": f"Input terminal '{pin.name}' on '{node.label}' is floating with no driving wire connection.",
                        "hardware_consequence": "Floating CMOS inputs drift to an indeterminate threshold (~VDD/2), partially turning ON both NMOS and PMOS channels. This causes crowbar shoot-through current, severe static leakage, thermal runaway, and unpredictable floating gate output oscillations.",
                        "target_node": node.id,
                        "target_port": pin.name,
                        "source_file": getattr(node, 'source_file', 'design.vhd') or 'design.vhd',
                        "suggested_fix": f"Route an input wire to port '{pin.name}', connect it to a primary input, or tie to '0' / '1'."
                    }
                    diagnostics.append(diag)
                    if hasattr(node, 'diagnostics'):
                        node.diagnostics.append(diag)

        # 2. Multi-Driver Bus Contention / Short-Circuit Hazard Check (DRC-E102)
        target_drivers: Dict[str, List[Any]] = {}
        for w in wires:
            key = f"{w.target_node}::{w.target_port}"
            target_drivers.setdefault(key, []).append(w)

        for key, drivers in target_drivers.items():
            if len(drivers) > 1:
                target_node_id, target_port_name = key.split("::", 1)
                for w in drivers:
                    w.has_conflict = True
                    w.conflict_reason = f"Bus contention: {len(drivers)} active drivers"
                driver_sources = [w.source_node for w in drivers]
                diag = {
                    "code": "DRC-E102",
                    "severity": "error",
                    "title": f"Bus Contention Short-Circuit on '{target_port_name}'",
                    "message": f"Target port '{target_port_name}' is driven simultaneously by {len(drivers)} distinct active output pins ({', '.join(driver_sources)}).",
                    "hardware_consequence": "When one output attempts to drive high ('1' / VDD) while another drives low ('0' / GND), a direct low-impedance short-circuit path forms across the power supply rails. This creates dangerous crowbar currents (>150mA), voltage rail droop, and will physically destroy silicon output buffers or burn PCB traces.",
                    "target_node": target_node_id,
                    "target_port": target_port_name,
                    "source_file": getattr(drivers[0], 'source_file', 'design.vhd') or 'design.vhd',
                    "suggested_fix": "Insert a 2:1 Multiplexer (MUX) to arbitrate between signals or use tri-state buffers ('Z') with mutually exclusive enable logic."
                }
                diagnostics.append(diag)

        # 3. Incomplete Port Map Associations on Sub-modules (DRC-E103)
        KNOWN_ENTITIES = {
            "full_adder": ["a", "b", "cin", "sum", "cout"],
            "half_adder": ["a", "b", "sum", "cout"],
            "alu_32bit": ["a", "b", "alucontrol", "result", "zero"],
            "counter_8bit": ["clk", "rst", "en", "count"],
            "dff": ["clk", "d", "q"],
            "mux_2to1": ["in0", "in1", "sel", "out"],
        }
        comp_matches = re.finditer(
            r'([a-zA-Z0-9_]+)\s*:\s*(?:entity\s+(?:work\.)?)?([a-zA-Z0-9_]+)\s+port\s+map\s*\((.*?)\)\s*;',
            clean_text,
            re.DOTALL | re.IGNORECASE
        )
        for m in comp_matches:
            inst_name = m.group(1).strip()
            comp_type = m.group(2).strip().lower()
            port_text = m.group(3)
            bindings = VHDLParser._parse_port_map_bindings(port_text)
            mapped_formals = {f.lower() for f, _ in bindings}

            if comp_type in KNOWN_ENTITIES:
                req_ports = KNOWN_ENTITIES[comp_type]
                missing = [p for p in req_ports if p not in mapped_formals]
                if missing:
                    diag = {
                        "code": "DRC-E103",
                        "severity": "error",
                        "title": f"Incomplete Port Map on '{inst_name}' ({comp_type})",
                        "message": f"Component instantiation '{inst_name}' of type '{comp_type}' is missing association for required port(s): [{', '.join(missing)}].",
                        "hardware_consequence": "VHDL-2008 Standard LRM section 6.5.6.3 requires all undefaulted input ports to be explicitly associated in structural architectures. In hardware synthesis, unmapped inputs leave physical semiconductor pins disconnected and floating.",
                        "target_node": f"node_{inst_name.lower()}",
                        "source_file": f"{comp_type}.vhd",
                        "suggested_fix": f"Explicitly map missing ports: {', '.join(f'{p} => <signal>' for p in missing)} or mark unneeded outputs with keyword 'open'."
                    }
                    diagnostics.append(diag)

        # 4. Dangling / Dead-End Output Warning (DRC-W201)
        for node in nodes:
            node_outgoing = [w for w in wires if w.source_node == node.id]
            for pin in node.outputs:
                if getattr(pin, 'is_open', False) or (hasattr(pin, 'properties') and isinstance(pin.properties, dict) and pin.properties.get('open')):
                    continue
                pin_driven = any(
                    w.source_port.lower() in (pin.id.lower(), pin.name.lower(), f"out_{pin.name.lower()}")
                    for w in node_outgoing
                )
                if not pin_driven and len(nodes) > 1:
                    diag = {
                        "code": "DRC-W201",
                        "severity": "warning",
                        "title": f"Unconnected Output ({node.label} ➔ {pin.name})",
                        "message": f"Output pin '{pin.name}' on '{node.label}' has no downstream connections or fanout loads.",
                        "hardware_consequence": "The gate transitions and consumes dynamic switching power (C*V^2*f), but its computed logic state is never observed or routed. EDA synthesis tools will prune and optimize away this dead logic.",
                        "target_node": node.id,
                        "target_port": pin.name,
                        "source_file": getattr(node, 'source_file', 'design.vhd') or 'design.vhd',
                        "suggested_fix": f"Route '{pin.name}' to a primary output or downstream component, or mark with 'open' in port map."
                    }
                    diagnostics.append(diag)

        return diagnostics

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
            r'architecture\s+([a-zA-Z0-9_\-]+)\s+of\s+([a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+)*)\s+is\s*(.*?)\s*begin\s*(.*?)\s*end(?:\s+architecture)?(?:\s+(?!if\b|case\b|process\b|loop\b|generate\b|record\b|component\b|for\b)[a-zA-Z0-9_\-]+)?\s*;',
            clean_text,
            re.DOTALL | re.IGNORECASE
        )
        if not arch_match:
            arch_match = re.search(
                r'architecture\s+([a-zA-Z0-9_\-]+)\s+of\s+([a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+)*)\s+is\s*(.*?)\s*begin\s*(.*)\s*end',
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

            # Find with-select statements: with sel select target <= ...;
            with_select_pattern = re.compile(
                r'with\s+([a-zA-Z0-9_]+)\s+select\s+([a-zA-Z0-9_]+)\s*<=\s*([^;]+);',
                re.DOTALL | re.IGNORECASE
            )
            for sel_sig, target_lhs, raw_expr in with_select_pattern.findall(clean_arch_body):
                target_lhs = target_lhs.strip()
                if target_lhs not in grouped_assigns:
                    grouped_assigns[target_lhs] = []
                grouped_assigns[target_lhs].append(f"{sel_sig} {raw_expr.strip()}")

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
            KNOWN_COMPONENT_PORTS: Dict[str, Dict[str, str]] = {
                "control_unit": {
                    "clk": "in", "rst": "in", "opcode": "in", "funct3": "in", "bitstream_ready": "in",
                    "reg_write": "out", "mem_read": "out", "mem_write": "out", "alu_src": "out",
                    "wb_sel": "out", "alu_op": "out", "bitstream_ack": "out"
                },
                "register_file_64bit": {
                    "clk": "in", "rst": "in", "we": "in", "waddr": "in", "wdata": "in", "raddr1": "in", "raddr2": "in",
                    "rdata1": "out", "rdata2": "out"
                },
                "register_file_32bit": {
                    "clk": "in", "rst": "in", "we": "in", "waddr": "in", "wdata": "in", "raddr1": "in", "raddr2": "in",
                    "rdata1": "out", "rdata2": "out"
                },
                "alu_64bit": {
                    "a": "in", "b": "in", "alu_op": "in",
                    "result": "out", "zero": "out", "carry_out": "out", "overflow": "out"
                },
                "alu_32bit": {
                    "a": "in", "b": "in", "alu_op": "in", "alucontrol": "in",
                    "result": "out", "zero": "out", "carry_out": "out", "overflow": "out"
                },
                "memory_controller": {
                    "clk": "in", "rst": "in", "mem_read": "in", "mem_write": "in", "addr": "in", "wdata": "in",
                    "rdata": "out", "mem_we_out": "out", "mem_re_out": "out", "ready": "out"
                },
                "bitstream_rx": {
                    "clk": "in", "rst": "in", "bitstream_in": "in", "bitstream_valid": "in", "bitstream_ack": "in",
                    "parallel_data": "out", "data_ready": "out", "bit_counter_out": "out"
                },
                "full_adder": {
                    "a": "in", "b": "in", "cin": "in", "sum": "out", "cout": "out"
                },
                "half_adder": {
                    "a": "in", "b": "in", "sum": "out", "cout": "out"
                },
                "dff": {
                    "clk": "in", "rst": "in", "d": "in", "q": "out", "qn": "out"
                },
                "mux_2to1": {
                    "in0": "in", "in1": "in", "sel": "in", "out": "out"
                }
            }

            # Parse declared components in architecture header if any
            arch_header = arch_match.group(3) if arch_match else ""
            comp_decl_pattern = re.compile(
                r'component\s+([a-zA-Z0-9_]+)\s+(?:is\s+)?port\s*\((.*?)\)\s*;\s*end\s+component',
                re.DOTALL | re.IGNORECASE
            )
            for c_name, c_ports_raw in comp_decl_pattern.findall(arch_header):
                c_name_l = c_name.strip().lower()
                parsed_c_ports = VHDLParser._parse_port_block(c_ports_raw)
                if parsed_c_ports:
                    KNOWN_COMPONENT_PORTS[c_name_l] = {p.name.lower(): p.direction.lower() for p in parsed_c_ports}

            comp_pattern = re.compile(
                r'([a-zA-Z0-9_]+)\s*:\s*(?:entity\s+(?:work\.)?)?([a-zA-Z0-9_]+)\s+port\s+map\s*\((.*?)\)\s*;',
                re.DOTALL | re.IGNORECASE
            )
            comp_matches = comp_pattern.findall(clean_arch_body)
            comp_nodes: List[NetlistNode] = []
            cols = 3  # pack into grid columns
            _comp_scale = 4 if len(comp_matches) >= 4 else 3
            signal_producers: Dict[str, tuple] = {}  # sig_name_lower -> (node_id, port_id, formal_name, width)

            for ci, (inst_label, comp_type, port_map_text) in enumerate(comp_matches):
                inst_label = inst_label.strip()
                comp_type  = comp_type.strip().lower()
                disp_label = COMPONENT_LABELS.get(comp_type, comp_type.replace("_", " ").title())
                node_id_c  = f"node_{inst_label.lower()}_{ci+1}"
                bindings   = VHDLParser._parse_port_map_bindings(port_map_text)
                known_ports = KNOWN_COMPONENT_PORTS.get(comp_type, {})
                in_ports_c: List[PortDef] = []
                out_ports_c: List[PortDef] = []

                for formal, actual in bindings:
                    formal_l = formal.lower()
                    if formal_l in known_ports:
                        is_out = known_ports[formal_l] == "out"
                    else:
                        is_out = any(kw in formal_l for kw in ("out", "dout", "data_out", "rdata", "q", "result", "zero", "carry", "overflow", "ack", "done", "ready_out", "cout")) and not any(kw in formal_l for kw in ("bitstream_ack", "ready_in"))

                    actual_clean = actual.strip()
                    is_open_port = actual_clean.lower() == "open"
                    actual_base = re.sub(r'\(.*?\)', '', actual_clean).strip().lower()

                    if is_out:
                        p = PortDef(f"out_{formal}", formal, "out", 64)
                        if is_open_port:
                            setattr(p, 'is_open', True)
                        out_ports_c.append(p)
                        if actual_base and not is_open_port:
                            signal_producers[actual_base] = (node_id_c, f"out_{formal}", formal, 64)
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
                    properties={"component": comp_type, "instance": inst_label, "bindings": bindings},
                    source_file=f"{comp_type}.vhd",
                    source_module=comp_type,
                    color_group=comp_type,
                    parent_instance=inst_label
                ))

            if comp_nodes:
                nodes.extend(comp_nodes)

                # Glue logic / internal continuous assignments
                po_names_lower = {p.name.lower() for p in primary_outputs}
                glue_assigns: Dict[str, List[str]] = {}
                for lhs, expr_list in grouped_assigns.items():
                    if lhs.lower() not in po_names_lower:
                        glue_assigns[lhs] = expr_list

                # Synthesize glue logic nodes (multiplexers, sign extension, combinational logic)
                glue_idx = 1
                for lhs, expr_list in glue_assigns.items():
                    lhs_l = lhs.lower()
                    combined_exprs = " ".join(expr_list).lower()
                    tokens = re.findall(r'\b[a-zA-Z0-9_]+\b', combined_exprs)
                    operands: List[str] = []
                    for t in tokens:
                        if not t.isdigit() and t.lower() not in reserved_keywords and t.lower() != lhs_l and t not in operands:
                            operands.append(t)

                    is_mux = ("when" in combined_exprs and "else" in combined_exprs) or "select" in combined_exprs
                    gate_type = "MUX" if is_mux else "CUSTOM"
                    label = f"MUX ({lhs})" if is_mux else f"RTL ({lhs})"
                    node_id_g = f"node_glue_{lhs.lower()}_{glue_idx}"
                    in_ports_g = [PortDef(f"in_{op}", op, "in", 64) for op in operands]
                    out_ports_g = [PortDef(f"out_{lhs}", lhs, "out", 64)]

                    glue_node = NetlistNode(
                        id=node_id_g,
                        label=label,
                        type=gate_type,
                        scale=2,
                        x=200 + (glue_idx - 1) * 220,
                        y=600,
                        width=180,
                        height=max(100, len(in_ports_g) * 28),
                        inputs=in_ports_g,
                        outputs=out_ports_g,
                        properties={"target_signal": lhs},
                        source_file=f"{entity_name}.vhd",
                        source_module=entity_name,
                        color_group=entity_name,
                        parent_instance=entity_name
                    )
                    nodes.append(glue_node)
                    signal_producers[lhs_l] = (glue_node.id, f"out_{lhs}", lhs, 64)
                    glue_idx += 1

                wire_id_ctr = 0
                # 1. Connect primary outputs forwarded by continuous assignments (e.g. alu_result_out <= s_alu_res;)
                for lhs, expr_list in grouped_assigns.items():
                    lhs_l = lhs.lower()
                    po_match = next((p for p in primary_outputs if p.name.lower() == lhs_l), None)
                    if po_match:
                        rhs = expr_list[0].strip()
                        rhs_base = re.sub(r'\(.*?\)', '', rhs).strip().lower()
                        if rhs_base in signal_producers:
                            src_node, src_port, _, _ = signal_producers[rhs_base]
                            wires.append(NetlistWire(
                                id=f"w_po_{wire_id_ctr}",
                                source_node=src_node,
                                source_port=src_port,
                                target_node=po_match.id,
                                target_port=po_match.name,
                                width=po_match.width,
                                label=lhs,
                                source_file=f"{entity_name}.vhd"
                            ))
                            wire_id_ctr += 1
                        else:
                            in_match = next((p for p in primary_inputs if p.name.lower() == rhs_base), None)
                            if in_match:
                                wires.append(NetlistWire(
                                    id=f"w_pi_po_{wire_id_ctr}",
                                    source_node=in_match.id,
                                    source_port=in_match.name,
                                    target_node=po_match.id,
                                    target_port=po_match.name,
                                    width=po_match.width,
                                    label=lhs,
                                    source_file=f"{entity_name}.vhd"
                                ))
                                wire_id_ctr += 1

                # 2. Connect component node inputs, outputs, and glue logic
                for cn in nodes:
                    bindings = cn.properties.get("bindings", [])
                    if bindings:
                        for formal, actual in bindings:
                            formal_l = formal.lower()
                            actual_clean = actual.strip()
                            if actual_clean.lower() == "open":
                                continue
                            actual_base = re.sub(r'\(.*?\)', '', actual_clean).strip().lower()
                            is_input = any(ip.name.lower() == formal_l for ip in cn.inputs)

                            if is_input:
                                if actual_base in signal_producers:
                                    src_node, src_port, _, _ = signal_producers[actual_base]
                                    wires.append(NetlistWire(
                                        id=f"w_comp_{wire_id_ctr}",
                                        source_node=src_node,
                                        source_port=src_port,
                                        target_node=cn.id,
                                        target_port=f"in_{formal}",
                                        width=64,
                                        label=actual_base,
                                        source_file=cn.source_file
                                    ))
                                    wire_id_ctr += 1
                                else:
                                    in_match = next((p for p in primary_inputs if p.name.lower() == actual_base or p.name.lower() == formal_l), None)
                                    if in_match:
                                        wires.append(NetlistWire(
                                            id=f"w_pi_{wire_id_ctr}",
                                            source_node=in_match.id,
                                            source_port=in_match.name,
                                            target_node=cn.id,
                                            target_port=f"in_{formal}",
                                            width=in_match.width,
                                            label=in_match.name,
                                            source_file=cn.source_file
                                        ))
                                        wire_id_ctr += 1
                            else:
                                # Check if output port is directly connected to a primary output (e.g. mem_we_out => mem_we)
                                po_match = next((p for p in primary_outputs if p.name.lower() == actual_base), None)
                                if po_match:
                                    wires.append(NetlistWire(
                                        id=f"w_comp_po_{wire_id_ctr}",
                                        source_node=cn.id,
                                        source_port=f"out_{formal}",
                                        target_node=po_match.id,
                                        target_port=po_match.name,
                                        width=po_match.width,
                                        label=po_match.name,
                                        source_file=cn.source_file
                                    ))
                                    wire_id_ctr += 1

                    elif cn.type in ("MUX", "CUSTOM") and cn.id.startswith("node_glue_"):
                        # Glue logic node inputs
                        for ip in cn.inputs:
                            op_base = ip.name.lower()
                            if op_base in signal_producers:
                                src_node, src_port, _, _ = signal_producers[op_base]
                                wires.append(NetlistWire(
                                    id=f"w_glue_{wire_id_ctr}",
                                    source_node=src_node,
                                    source_port=src_port,
                                    target_node=cn.id,
                                    target_port=ip.id,
                                    width=64,
                                    label=op_base,
                                    source_file=f"{entity_name}.vhd"
                                ))
                                wire_id_ctr += 1
                            else:
                                in_match = next((p for p in primary_inputs if p.name.lower() == op_base), None)
                                if in_match:
                                    wires.append(NetlistWire(
                                        id=f"w_glue_pi_{wire_id_ctr}",
                                        source_node=in_match.id,
                                        source_port=in_match.name,
                                        target_node=cn.id,
                                        target_port=ip.id,
                                        width=in_match.width,
                                        label=in_match.name,
                                        source_file=f"{entity_name}.vhd"
                                    ))
                                    wire_id_ctr += 1

            elif grouped_assigns:
                total_nodes = len(grouped_assigns)
                node_idx = 1
                for lhs, expr_list in grouped_assigns.items():
                    # Check if this is a direct forwarding assignment to a primary output (e.g. Result <= r_res;)
                    po_match = next((p for p in primary_outputs if p.name.lower() == lhs.lower()), None)
                    if po_match and len(expr_list) == 1:
                        src_sig = expr_list[0].strip()
                        # Find if an existing node already produces src_sig
                        src_node = next((n for n in nodes if any(op.name.lower() == src_sig.lower() for op in n.outputs)), None)
                        if src_node:
                            src_port = next(op for op in src_node.outputs if op.name.lower() == src_sig.lower())
                            wires.append(NetlistWire(
                                id=f"w_{src_node.id}_{po_match.id}",
                                source_node=src_node.id,
                                source_port=src_port.id,
                                target_node=po_match.id,
                                target_port=po_match.name,
                                width=po_match.width,
                                label=lhs
                            ))
                            continue

                    # Determine functional gate/block type
                    gate_type = "CUSTOM"
                    combined_exprs = " ".join(expr_list).lower()
                    is_alu = (
                        ("+" in combined_exprs or "-" in combined_exprs) and
                        ("and" in combined_exprs or "or" in combined_exprs or "xor" in combined_exprs or "alu" in entity_name.lower())
                    )
                    is_cmp = (
                        ("=" in combined_exprs or "/=" in combined_exprs) and
                        ("zero" in lhs.lower() or "'1'" in combined_exprs or "'0'" in combined_exprs)
                    )
                    is_mux = (
                        (len(expr_list) > 1 and not is_alu) or
                        ("when " in combined_exprs and "else" in combined_exprs and not is_cmp) or
                        "mux" in entity_name.lower() or
                        "multiplex" in entity_name.lower()
                    )

                    if is_alu:
                        gate_type = "ALU"
                        label = f"32-Bit ALU ({lhs})" if "32" in entity_name or any(p.width == 32 for p in primary_inputs) else f"ALU ({lhs})"
                    elif is_cmp:
                        gate_type = "CMP"
                        label = f"{lhs} (Zero Detect)" if "zero" in lhs.lower() else f"{lhs} (CMP)"
                    elif is_mux:
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

                    # Add case selectors (e.g. 'sel') and sensitivity inputs for multi-branch/process blocks
                    if (len(expr_list) > 1 or is_mux or is_alu) and not is_cmp:
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
                        },
                        source_file=f"{entity_name}.vhd",
                        source_module=entity_name,
                        color_group=entity_name,
                        parent_instance=entity_name
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
                                label=op,
                                is_inherited=True,
                                parent_port=in_match.name,
                                child_port=f"in_{op}",
                                source_file=f"{entity_name}.vhd"
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
                                    label=op,
                                    source_file=f"{entity_name}.vhd"
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
                            label=lhs,
                            is_inherited=True,
                            parent_port=out_match.name,
                            child_port=out_ports[0].name,
                            source_file=f"{entity_name}.vhd"
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
                properties={"processes": parse_res.processes_count},
                source_file=f"{entity_name}.vhd",
                source_module=entity_name,
                color_group=entity_name,
                parent_instance=entity_name
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
                    label=pi.name,
                    is_inherited=True,
                    parent_port=pi.name,
                    child_port=pi.id,
                    source_file=f"{entity_name}.vhd"
                ))
            for po in primary_outputs:
                wires.append(NetlistWire(
                    id=f"w_out_{po.name}",
                    source_node=block_node.id,
                    source_port=po.id,
                    target_node=po.id,
                    target_port=po.name,
                    width=po.width,
                    label=po.name,
                    is_inherited=True,
                    parent_port=po.name,
                    child_port=po.id,
                    source_file=f"{entity_name}.vhd"
                ))

        # Run Design Rule Checking (DRC) for connection diagnostics, floating inputs, and contention
        drc_diagnostics = VHDLParser.run_circuit_drc(nodes, wires, primary_inputs, primary_outputs, clean_text, vhdl_text)

        return NetlistGraph(
            name=entity_name,
            scale=1 if len(nodes) > 1 else 2,
            description=f"Synthesized RTL architecture from VHDL source ({entity_name})",
            primary_inputs=primary_inputs,
            primary_outputs=primary_outputs,
            nodes=nodes,
            wires=wires,
            metadata={"source": "VHDL Synthesizer", "entities": len(parse_res.entities)},
            diagnostics=drc_diagnostics
        )
