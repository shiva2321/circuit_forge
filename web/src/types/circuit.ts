export interface PortDef {
  id: string;
  name: string;
  direction: 'in' | 'out' | 'inout';
  width: number;
  type_name?: string;
}

export interface SynthesisDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  hardware_consequence: string;
  target_node?: string;
  target_port?: string;
  target_signal?: string;
  source_file?: string;
  line?: number;
  suggested_fix?: string;
}

export interface NetlistNode {
  id: string;
  label: string;
  type: string;
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs: PortDef[];
  outputs: PortDef[];
  properties?: Record<string, any>;
  has_subgraph?: boolean;
  subgraph_ref?: string | null;
  source_file?: string;
  source_module?: string;
  color_group?: string;
  parent_instance?: string;
  diagnostics?: SynthesisDiagnostic[];
}

export interface NetlistWire {
  id: string;
  source_node: string;
  source_port: string;
  target_node: string;
  target_port: string;
  width: number;
  label?: string | null;
  points?: [number, number][];
  is_inherited?: boolean;
  parent_port?: string;
  child_port?: string;
  source_file?: string;
  has_conflict?: boolean;
  conflict_reason?: string;
}

export interface NetlistGraph {
  name: string;
  scale: number;
  description: string;
  primary_inputs: PortDef[];
  primary_outputs: PortDef[];
  nodes: NetlistNode[];
  wires: NetlistWire[];
  metadata?: Record<string, any>;
  diagnostics?: SynthesisDiagnostic[];
}

export interface WaveformTransition {
  time: number;
  val: string;
}

export interface WaveformSignal {
  name: string;
  width: number;
  is_clock: boolean;
  is_reset: boolean;
  transitions: WaveformTransition[];
}

export interface WaveformData {
  time_range: [number, number];
  signals: WaveformSignal[];
}

export interface AssertionDetail {
  time_ns: number;
  net: string;
  expected: string;
  actual: string | null;
  passed: boolean | null;
  message: string;
}

export interface SimulationSummary {
  total_time_ns: number;
  wall_time_sec: number;
  net_count: number;
  component_count: number;
  assertions: {
    total: number;
    passed: number;
    failed: number;
    all_passed: boolean;
    details: AssertionDetail[];
  };
  logs: string[];
}

export interface AgentLog {
  time: number;
  state: string;
  thought: string;
  action?: string | null;
  details?: Record<string, any>;
  category?: 'engineering' | 'system' | 'user' | 'tool';
}

export interface KGNode {
  id: string;
  name: string;
  scale: number;
  category: string;
  source: string;
  metrics?: Record<string, any>;
  properties?: Record<string, any>;
  degree?: number;
  x?: number;
  y?: number;
  description?: string;
  design_rules?: string[];
  vhdl_code?: string;
  tags?: string[];
}

export interface KGLink {
  source: string;
  target: string;
  relation: string;
}

export interface KGExport {
  total_nodes: number;
  total_edges: number;
  nodes: KGNode[];
  links: KGLink[];
}

export interface CatalogCircuit {
  id: string;
  name: string;
  scale: number;
  scale_label: string;
  description: string;
}
