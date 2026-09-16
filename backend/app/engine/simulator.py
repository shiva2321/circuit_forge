# CircuitForge Digital Logic Simulator
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Any, Optional, Callable, Set, Tuple
import json
import time

class LogicVal(str, Enum):
    ZERO = '0'
    ONE = '1'
    HIGH_Z = 'Z'
    UNKNOWN = 'X'

    def __str__(self):
        return self.value

    @staticmethod
    def from_bool(b: bool) -> 'LogicVal':
        return LogicVal.ONE if b else LogicVal.ZERO

    @staticmethod
    def from_val(val: Any) -> 'LogicVal':
        if isinstance(val, LogicVal):
            return val
        s = str(val).strip().upper()
        if s in ('1', 'TRUE', 'HIGH', 'T'):
            return LogicVal.ONE
        if s in ('0', 'FALSE', 'LOW', 'F'):
            return LogicVal.ZERO
        if s in ('Z', 'HIGH_Z'):
            return LogicVal.HIGH_Z
        return LogicVal.UNKNOWN

    def to_int(self) -> int:
        return 1 if self == LogicVal.ONE else 0

def logic_not(v: LogicVal) -> LogicVal:
    if v == LogicVal.ONE:
        return LogicVal.ZERO
    if v == LogicVal.ZERO:
        return LogicVal.ONE
    return LogicVal.UNKNOWN

def logic_and(*vals: LogicVal) -> LogicVal:
    if any(v == LogicVal.ZERO for v in vals):
        return LogicVal.ZERO
    if all(v == LogicVal.ONE for v in vals):
        return LogicVal.ONE
    return LogicVal.UNKNOWN

def logic_or(*vals: LogicVal) -> LogicVal:
    if any(v == LogicVal.ONE for v in vals):
        return LogicVal.ONE
    if all(v == LogicVal.ZERO for v in vals):
        return LogicVal.ZERO
    return LogicVal.UNKNOWN

def logic_xor(a: LogicVal, b: LogicVal) -> LogicVal:
    if a in (LogicVal.UNKNOWN, LogicVal.HIGH_Z) or b in (LogicVal.UNKNOWN, LogicVal.HIGH_Z):
        return LogicVal.UNKNOWN
    return LogicVal.ONE if a != b else LogicVal.ZERO

def logic_nand(*vals: LogicVal) -> LogicVal:
    return logic_not(logic_and(*vals))

def logic_nor(*vals: LogicVal) -> LogicVal:
    return logic_not(logic_or(*vals))

def logic_xnor(a: LogicVal, b: LogicVal) -> LogicVal:
    return logic_not(logic_xor(a, b))

@dataclass
class Net:
    name: str
    width: int = 1
    value: str = '0'
    is_clock: bool = False
    is_reset: bool = False
    history: List[Tuple[int, str]] = field(default_factory=list)
    fault: Optional[str] = None

    def set_value(self, new_val: Any, current_time_ns: int):
        if self.fault is not None:
            new_val = self.fault

        if self.width == 1:
            val_str = str(LogicVal.from_val(new_val))
        else:
            if isinstance(new_val, int):
                mask = (1 << self.width) - 1
                val_str = format(new_val & mask, f'0{self.width}b')
            elif isinstance(new_val, str):
                s = new_val.strip()
                if len(s) < self.width:
                    val_str = s.rjust(self.width, '0')
                else:
                    val_str = s[-self.width:]
            else:
                val_str = 'X' * self.width

        if val_str != self.value or not self.history:
            self.value = val_str
            self.history.append((current_time_ns, val_str))

    def get_int(self) -> int:
        try:
            return int(self.value, 2)
        except ValueError:
            return 0

@dataclass
class Assertion:
    time_ns: int
    net_name: str
    expected_value: str
    passed: Optional[bool] = None
    actual_value: Optional[str] = None
    message: str = ''

class Component:
    def __init__(self, name: str, comp_type: str):
        self.name = name
        self.comp_type = comp_type
        self.inputs: Dict[str, str] = {}
        self.outputs: Dict[str, str] = {}

    def evaluate(self, sim: 'Simulator'):
        raise NotImplementedError

class GateComponent(Component):
    def __init__(self, name: str, gate_type: str, in_nets: List[str], out_net: str):
        super().__init__(name, gate_type.upper())
        for i, net in enumerate(in_nets):
            self.inputs[f'in_{i}'] = net
        self.outputs['out'] = out_net

    def evaluate(self, sim: 'Simulator'):
        in_vals = [LogicVal.from_val(sim.get_net_val(net)) for net in self.inputs.values()]
        out_net = self.outputs['out']
        gt = self.comp_type
        if gt == 'AND':
            res = logic_and(*in_vals)
        elif gt == 'OR':
            res = logic_or(*in_vals)
        elif gt == 'NOT':
            res = logic_not(in_vals[0]) if in_vals else LogicVal.UNKNOWN
        elif gt == 'NAND':
            res = logic_nand(*in_vals)
        elif gt == 'NOR':
            res = logic_nor(*in_vals)
        elif gt == 'XOR':
            res = logic_xor(in_vals[0], in_vals[1]) if len(in_vals) >= 2 else LogicVal.UNKNOWN
        elif gt == 'XNOR':
            res = logic_xnor(in_vals[0], in_vals[1]) if len(in_vals) >= 2 else LogicVal.UNKNOWN
        elif gt in ('BUF', 'BUFFER'):
            res = in_vals[0] if in_vals else LogicVal.UNKNOWN
        else:
            res = LogicVal.UNKNOWN
        sim.set_net_val(out_net, str(res))

class DFlipFlop(Component):
    def __init__(self, name: str, clk_net: str, d_net: str, q_net: str, q_bar_net: Optional[str] = None, rst_net: Optional[str] = None):
        super().__init__(name, 'DFF')
        self.inputs['clk'] = clk_net
        self.inputs['d'] = d_net
        if rst_net:
            self.inputs['rst'] = rst_net
        self.outputs['q'] = q_net
        if q_bar_net:
            self.outputs['q_bar'] = q_bar_net
        self.last_clk = '0'
        self.internal_state = '0'

    def evaluate(self, sim: 'Simulator'):
        clk_val = sim.get_net_val(self.inputs['clk'])
        d_val = sim.get_net_val(self.inputs['d'])
        rst_val = sim.get_net_val(self.inputs['rst']) if 'rst' in self.inputs else '0'

        if rst_val == '1':
            self.internal_state = '0'
        elif self.last_clk == '0' and clk_val == '1':
            self.internal_state = d_val if d_val in ('0', '1') else 'X'

        self.last_clk = clk_val
        sim.set_net_val(self.outputs['q'], self.internal_state)
        if 'q_bar' in self.outputs:
            q_bar = logic_not(LogicVal.from_val(self.internal_state))
            sim.set_net_val(self.outputs['q_bar'], str(q_bar))

class FunctionalBlock(Component):
    def __init__(
        self,
        name: str,
        comp_type: str,
        inputs: Dict[str, str],
        outputs: Dict[str, str],
        eval_fn: Callable[['FunctionalBlock', 'Simulator'], None],
        initial_state: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(name, comp_type)
        self.inputs = inputs
        self.outputs = outputs
        self.eval_fn = eval_fn
        self.state: Dict[str, Any] = initial_state or {}

    def evaluate(self, sim: 'Simulator'):
        self.eval_fn(self, sim)

class Simulator:
    def __init__(self, time_step_ns: int = 1):
        self.time_step_ns = time_step_ns
        self.current_time_ns = 0
        self.nets: Dict[str, Net] = {}
        self.components: List[Component] = []
        self.stimulus_schedule: Dict[int, Dict[str, Any]] = {}
        self.clock_generators: List[Dict[str, Any]] = []
        self.assertions: List[Assertion] = []
        self.logs: List[str] = []

    def add_net(self, name: str, width: int = 1, initial_val: Any = '0', is_clock: bool = False, is_reset: bool = False) -> Net:
        net = Net(name=name, width=width, is_clock=is_clock, is_reset=is_reset)
        net.set_value(initial_val, 0)
        self.nets[name] = net
        return net

    def get_net(self, name: str) -> Net:
        if name not in self.nets:
            self.add_net(name)
        return self.nets[name]

    def set_net_val(self, name: str, val: Any):
        net = self.get_net(name)
        net.set_value(val, self.current_time_ns)

    def get_net_val(self, name: str) -> str:
        return self.get_net(name).value

    def get_net_int(self, name: str) -> int:
        return self.get_net(name).get_int()

    def add_gate(self, name: str, gate_type: str, in_nets: List[str], out_net: str) -> GateComponent:
        comp = GateComponent(name, gate_type, in_nets, out_net)
        self.components.append(comp)
        return comp

    def add_dff(self, name: str, clk_net: str, d_net: str, q_net: str, q_bar_net: Optional[str] = None, rst_net: Optional[str] = None) -> DFlipFlop:
        dff = DFlipFlop(name, clk_net, d_net, q_net, q_bar_net, rst_net)
        self.components.append(dff)
        return dff

    def add_block(
        self,
        name: str,
        comp_type: str,
        inputs: Dict[str, str],
        outputs: Dict[str, str],
        eval_fn: Callable[[FunctionalBlock, 'Simulator'], None],
        initial_state: Optional[Dict[str, Any]] = None,
    ) -> FunctionalBlock:
        block = FunctionalBlock(name, comp_type, inputs, outputs, eval_fn, initial_state)
        self.components.append(block)
        return block

    def add_clock(self, net_name: str, period_ns: int = 10, duty_cycle: float = 0.5):
        self.get_net(net_name).is_clock = True
        self.clock_generators.append({
            'net': net_name,
            'period_ns': period_ns,
            'high_ns': int(period_ns * duty_cycle),
        })

    def schedule_stimulus(self, time_ns: int, net_name: str, val: Any):
        if time_ns not in self.stimulus_schedule:
            self.stimulus_schedule[time_ns] = {}
        self.stimulus_schedule[time_ns][net_name] = val

    def add_assertion(self, time_ns: int, net_name: str, expected_val: Any, msg: str = ''):
        self.assertions.append(Assertion(
            time_ns=time_ns,
            net_name=net_name,
            expected_value=str(expected_val),
            message=msg,
        ))

    def inject_fault(self, net_name: str, fault_value: Optional[str]):
        net = self.get_net(net_name)
        net.fault = fault_value
        if fault_value is not None:
            net.set_value(fault_value, self.current_time_ns)
            self.logs.append(f'[{self.current_time_ns}ns] FAULT INJECTED on net {net_name} -> {fault_value}')
        else:
            self.logs.append(f'[{self.current_time_ns}ns] FAULT CLEARED on net {net_name}')

    def step(self):
        for clk in self.clock_generators:
            t = self.current_time_ns % clk['period_ns']
            clk_val = '1' if t < clk['high_ns'] else '0'
            self.set_net_val(clk['net'], clk_val)

        if self.current_time_ns in self.stimulus_schedule:
            for net_name, val in self.stimulus_schedule[self.current_time_ns].items():
                self.set_net_val(net_name, val)

        for _ in range(6):
            changed = False
            for comp in self.components:
                before = {p: self.get_net_val(n) for p, n in comp.outputs.items()}
                comp.evaluate(self)
                after = {p: self.get_net_val(n) for p, n in comp.outputs.items()}
                if before != after:
                    changed = True
            if not changed:
                break

        for assertion in self.assertions:
            if assertion.time_ns == self.current_time_ns and assertion.passed is None:
                actual = self.get_net_val(assertion.net_name)
                assertion.actual_value = actual
                if assertion.expected_value == actual:
                    assertion.passed = True
                else:
                    try:
                        assertion.passed = (int(assertion.expected_value, 2) == int(actual, 2))
                    except ValueError:
                        assertion.passed = False
                status = 'PASS' if assertion.passed else 'FAIL'
                self.logs.append(
                    f'[{self.current_time_ns}ns] ASSERTION {status}: {assertion.net_name} == {assertion.expected_value} (actual: {actual}) {assertion.message}'
                )

        self.current_time_ns += self.time_step_ns

    def run(self, duration_ns: int) -> Dict[str, Any]:
        target_time = self.current_time_ns + duration_ns
        start_wall = time.perf_counter()

        while self.current_time_ns <= target_time:
            self.step()

        elapsed = time.perf_counter() - start_wall

        for net in self.nets.values():
            if not net.history or net.history[-1][0] < target_time:
                net.history.append((target_time, net.value))

        return self.get_simulation_summary(elapsed)

    def get_simulation_summary(self, wall_elapsed: float = 0.0) -> Dict[str, Any]:
        total_assertions = len(self.assertions)
        passed_assertions = sum(1 for a in self.assertions if a.passed is True)
        failed_assertions = sum(1 for a in self.assertions if a.passed is False)

        return {
            'total_time_ns': self.current_time_ns,
            'wall_time_sec': round(wall_elapsed, 4),
            'net_count': len(self.nets),
            'component_count': len(self.components),
            'assertions': {
                'total': total_assertions,
                'passed': passed_assertions,
                'failed': failed_assertions,
                'all_passed': (failed_assertions == 0 and total_assertions > 0),
                'details': [
                    {
                        'time_ns': a.time_ns,
                        'net': a.net_name,
                        'expected': a.expected_value,
                        'actual': a.actual_value,
                        'passed': a.passed,
                        'message': a.message,
                    }
                    for a in self.assertions
                ],
            },
            'logs': self.logs[-50:],
        }

    def export_waveform_json(self) -> Dict[str, Any]:
        signals = []
        for name, net in self.nets.items():
            signals.append({
                'name': name,
                'width': net.width,
                'is_clock': net.is_clock,
                'is_reset': net.is_reset,
                'transitions': [{'time': t, 'val': v} for t, v in net.history],
            })

        return {
            'time_range': [0, self.current_time_ns],
            'signals': signals,
        }

    def export_vcd(self) -> str:
        lines = [
            '',
            f'  {time.asctime()}',
            '',
            '',
            '  CircuitForge Logic Simulator v1.0',
            '',
            ' 1ns ',
            ' module top ',
        ]

        var_map: Dict[str, str] = {}
        for i, (name, net) in enumerate(self.nets.items()):
            var_id = f'v{i}'
            var_map[name] = var_id
            if net.width == 1:
                lines.append(f' wire 1 {var_id} {name} ')
            else:
                lines.append(f' wire {net.width} {var_id} {name} [{net.width-1}:0] ')

        lines.append(' ')
        lines.append(' ')
        lines.append('')

        for name, net in self.nets.items():
            vid = var_map[name]
            val = net.history[0][1] if net.history else net.value
            if net.width == 1:
                lines.append(f'{val}{vid}')
            else:
                lines.append(f'b{val} {vid}')
        lines.append('')

        events_by_time: Dict[int, List[Tuple[str, str]]] = {}
        for name, net in self.nets.items():
            for t, val in net.history[1:]:
                if t not in events_by_time:
                    events_by_time[t] = []
                events_by_time[t].append((name, val))

        for t in sorted(events_by_time.keys()):
            lines.append(f'#{t}')
            for name, val in events_by_time[t]:
                vid = var_map[name]
                width = self.nets[name].width
                if width == 1:
                    lines.append(f'{val}{vid}')
                else:
                    lines.append(f'b{val} {vid}')
        return "\n".join(lines)