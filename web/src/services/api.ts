import { CatalogCircuit, NetlistGraph, SimulationSummary, WaveformData, KGExport, KGNode } from '../types/circuit';

const API_BASE = '/api';

export async function getStatus() {
  const res = await fetch(`${API_BASE}/status`);
  return res.json();
}

export async function getCircuitsCatalog(): Promise<CatalogCircuit[]> {
  const res = await fetch(`${API_BASE}/circuits/catalog`);
  return res.json();
}

export async function synthesizeCircuit(circuitName: string): Promise<NetlistGraph> {
  const res = await fetch(`${API_BASE}/circuits/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuit_name: circuitName }),
  });
  return res.json();
}

export async function simulateCircuit(circuitName: string, durationNs: number = 100): Promise<{
  circuit_name: string;
  summary: SimulationSummary;
  waveform: WaveformData;
}> {
  const res = await fetch(`${API_BASE}/circuits/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuit_name: circuitName, duration_ns: durationNs }),
  });
  return res.json();
}

export async function runAgent(
  goal: string,
  scale: number = 1,
  circuitName: string = 'custom_circuit',
  openrouterKey?: string,
  model?: string,
  projectId?: string
) {
  const res = await fetch(`${API_BASE}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal,
      scale,
      circuit_name: circuitName,
      openrouter_key: openrouterKey,
      model: model,
      project_id: projectId,
    }),
  });
  return res.json();
}

export async function materializeDesign(projectId: string, circuitName: string = 'processor_top', scale: number = 4): Promise<{
  success: boolean;
  project_id?: string;
  files?: string[];
  modules?: string[];
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/agent/materialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, circuit_name: circuitName, scale }),
  });
  return res.json();
}

export async function lintVHDL(vhdlCode: string): Promise<{
  is_valid: boolean;
  entities: Array<{ name: string; ports: any[] }>;
  messages: Array<{ line: number; severity: string; message: string; rule_id: string }>;
  signals_count: number;
  processes_count: number;
}> {
  const res = await fetch(`${API_BASE}/vhdl/lint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vhdl_code: vhdlCode }),
  });
  return res.json();
}

export async function synthesizeVHDL(vhdlCode: string, circuitName: string = 'custom_vhdl_circuit'): Promise<NetlistGraph> {
  const res = await fetch(`${API_BASE}/vhdl/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vhdl_code: vhdlCode, circuit_name: circuitName }),
  });
  return res.json();
}

export interface KeyStatus {
  is_configured: boolean;
  source: 'env' | 'client' | 'none';
  masked_key: string | null;
  default_model: string;
}

export async function getKeyStatus(): Promise<KeyStatus> {
  const res = await fetch(`${API_BASE}/agent/key-status`);
  return res.json();
}

export async function getAgentModels(): Promise<{
  models: Array<{ id: string; name: string; provider: string; description: string; context_window: number }>;
  current_model: string;
  is_configured: boolean;
  key_status?: KeyStatus;
}> {
  const res = await fetch(`${API_BASE}/agent/models`);
  return res.json();
}

export async function configureAgent(openrouterKey?: string, defaultModel?: string) {
  const res = await fetch(`${API_BASE}/agent/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ openrouter_key: openrouterKey, default_model: defaultModel }),
  });
  return res.json();
}

export async function testAgentConnection(openrouterKey: string, model?: string): Promise<{
  success: boolean;
  model?: string;
  response?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/agent/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ openrouter_key: openrouterKey, default_model: model }),
  });
  return res.json();
}

export async function sendAgentIntervention(
  action: 'pause' | 'resume' | 'step' | 'steer' | 'fault',
  params?: { guidance?: string; net_name?: string; fault_value?: string }
) {
  const res = await fetch(`${API_BASE}/agent/intervention`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  return res.json();
}

export async function chatWithAgent(
  message: string,
  circuitContext?: {
    circuit_name?: string;
    vhdl_code?: string;
    gate_count?: number;
    wire_count?: number;
    probes?: Record<string, string>;
    faults?: Record<string, string>;
  },
  openrouterKey?: string,
  model?: string,
  projectId?: string
): Promise<{
  success: boolean;
  model: string;
  reply: string;
  action?: { type: string; goal?: string };
  tool_history?: Array<{ tool: string; arguments?: any; result?: any }>;
  is_llm?: boolean;
}> {
  const res = await fetch(`${API_BASE}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      circuit_context: circuitContext,
      openrouter_key: openrouterKey,
      model,
      project_id: projectId,
    }),
  });
  return res.json();
}

export async function getAgentTools(): Promise<{ tools: any[] }> {
  const res = await fetch(`${API_BASE}/agent/tools`);
  return res.json();
}

export async function executeAgentTool(
  toolName: string,
  args: Record<string, any> = {},
  projectId?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/agent/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_name: toolName, arguments: args, project_id: projectId }),
  });
  return res.json();
}

export async function benchmarkCircuit(
  circuitName: string,
  durationNs: number = 100,
  vhdlCode?: string
): Promise<{
  success: boolean;
  circuit_name: string;
  benchmark_results: any;
}> {
  const res = await fetch(`${API_BASE}/agent/benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuit_name: circuitName, duration_ns: durationNs, vhdl_code: vhdlCode }),
  });
  return res.json();
}

export async function getKGNodes(query: string = '', scale?: number, category?: string, limit: number = 40): Promise<KGNode[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  if (scale !== undefined) params.append('scale', String(scale));
  if (category) params.append('category', category);
  const res = await fetch(`${API_BASE}/knowledge-graph/nodes?${params.toString()}`);
  return res.json();
}

export async function getKGNode(nodeId: string): Promise<KGNode> {
  const res = await fetch(`${API_BASE}/knowledge-graph/node/${encodeURIComponent(nodeId)}`);
  return res.json();
}

export async function exportKG(maxNodes: number = 120): Promise<KGExport> {
  const res = await fetch(`${API_BASE}/knowledge-graph/export?max_nodes=${maxNodes}`);
  return res.json();
}

export async function ingestHFDataset(datasetName: string = 'shailja/Verilog_Github', maxSamples: number = 8) {
  const res = await fetch(`${API_BASE}/knowledge-graph/ingest-hf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_name: datasetName, max_samples: maxSamples }),
  });
  return res.json();
}

export async function searchHFDatasets(query: string = ''): Promise<Array<{
  id: string;
  name: string;
  description: string;
  likes: number;
  downloads: number;
  tags: string[];
}>> {
  const params = new URLSearchParams({ query });
  const res = await fetch(`${API_BASE}/knowledge-graph/hf/search?${params.toString()}`);
  return res.json();
}

export async function searchAgentModels(query: string = ''): Promise<{
  query: string;
  models: Array<{
    id: string;
    name: string;
    provider: string;
    description: string;
    context_window: number;
    is_reasoning?: boolean;
  }>;
}> {
  const params = new URLSearchParams({ query });
  const res = await fetch(`${API_BASE}/agent/models/search?${params.toString()}`);
  return res.json();
}

export async function getToolchainStatus(): Promise<{
  default_engine: string;
  active_engine: string;
  builtin_engine: any;
  external_toolchains: any;
  install_guidance: any;
}> {
  const res = await fetch(`${API_BASE}/vhdl/toolchain/status`);
  return res.json();
}

export async function compileAndRunToolchain(vhdlCode: string, circuitName: string = 'circuit_top', engine: string = 'auto') {
  const res = await fetch(`${API_BASE}/vhdl/toolchain/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vhdl_code: vhdlCode, circuit_name: circuitName, engine }),
  });
  return res.json();
}

export interface ProjectMeta {
  id: string;
  name: string;
  scale: number;
  scale_label: string;
  description: string;
  created_at?: number;
  last_modified?: number;
  top_file?: string;
  file_count?: number;
  path?: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  ext?: string;
  children?: FileTreeNode[];
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const res = await fetch(`${API_BASE}/projects`);
  return res.json();
}

export async function createProject(data: {
  name: string;
  scale?: number;
  template_type?: string;
  description?: string;
}): Promise<ProjectMeta> {
  const res = await fetch(`${API_BASE}/projects/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getProjectTree(projectId: string): Promise<{ project_id: string; tree: FileTreeNode[] }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/tree`);
  return res.json();
}

export async function readProjectFile(projectId: string, path: string): Promise<{ path: string; content: string }> {
  const params = new URLSearchParams({ path });
  const res = await fetch(`${API_BASE}/projects/${projectId}/file?${params.toString()}`);
  return res.json();
}

export async function writeProjectFile(projectId: string, path: string, content: string): Promise<{ success: boolean; path: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  return res.json();
}

export async function createProjectEntry(projectId: string, path: string, isDir: boolean = false, content: string = ''): Promise<{ success: boolean; path: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/entry/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, is_dir: isDir, content }),
  });
  return res.json();
}

export async function deleteProjectEntry(projectId: string, path: string): Promise<{ success: boolean; path: string }> {
  const params = new URLSearchParams({ path });
  const res = await fetch(`${API_BASE}/projects/${projectId}/entry?${params.toString()}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function renameProjectEntry(projectId: string, oldPath: string, newPath: string): Promise<{ success: boolean; old_path: string; new_path: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/entry/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  });
  return res.json();
}

// Turnkey Hardware Lifecycle APIs
export async function runMultiphysicsSimulation(params: {
  circuit_name?: string;
  clock_mhz?: number;
  trace_length_mm?: number;
  supply_voltage?: number;
  load_current_a?: number;
  ambient_temp_c?: number;
  airflow_mps?: number;
  board_thickness_mm?: number;
  drop_height_m?: number;
} = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/lifecycle/multiphysics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function runDfmStackupAudit(params: {
  circuit_name?: string;
  layer_count?: number;
  substrate_family?: string;
  trace_width_mil?: number;
  trace_spacing_mil?: number;
  min_via_drill_mil?: number;
  use_nitrogen_purge?: boolean;
} = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/lifecycle/dfm-stackup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function runQaInspection(params: {
  circuit_name?: string;
  bga_package?: string;
  ball_count?: number;
  pitch_mm?: number;
  total_nets?: number;
  fundamental_clock_mhz?: number;
} = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/lifecycle/qa-inspection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function runFirmwareSecurity(params: {
  circuit_name?: string;
  base_address_hex?: string;
  device_serial_id?: string;
  test_cycles?: number;
} = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/lifecycle/firmware-security`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function runSupplyChainLifecycle(params: {
  circuit_name?: string;
  target_volume?: number;
  action?: string;
  original_mpn?: string;
  substitute_mpn?: string;
} = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/lifecycle/supply-chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

