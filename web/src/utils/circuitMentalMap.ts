import { NetlistGraph } from '../types/circuit';
import { getFilePalette } from './circuitColors';

export interface StageNode {
  id: string;
  label: string;
  type: string;
  delayNs: number;
}

export interface IdentifiedDRCIssue {
  id: string;
  code: string;
  title: string;
  severity: 'error' | 'warning';
  target: string;
  targetNodeId?: string;
  targetPort?: string;
  sourceFile?: string;
  explanation: string;
  physicalConsequence: string;
  suggestedFix: string;
  autoFixAction: string;
}

export interface LiveProbeTelemetry {
  name: string;
  value: string;
  voltage: string;
  state: 'HIGH' | 'LOW' | 'HIGH_Z' | 'UNKNOWN';
}

export interface AgentCognitiveTracking {
  currentGoal: string;
  activePhaseName: string;
  activePhaseIndex: number;
  totalPhases: number;
  currentThought: string;
  agentState: string;
  lastAction?: string;
}

export interface FileOriginSummary {
  fileName: string;
  gateCount: number;
  palette: any;
}

export interface MentalMapData {
  circuitName: string;
  classification: string;
  designIntent: string;
  scaleLevel: string;
  complexity: {
    nodeCount: number;
    wireCount: number;
    inputCount: number;
    outputCount: number;
  };
  primaryInputs: string[];
  primaryOutputs: string[];
  stages: Record<number, StageNode[]>;
  maxStages: number;
  criticalPath: {
    delayNs: number;
    path: string[];
    endpoint: string;
  };
  signalLineage: Record<
    string,
    {
      outputPin: string;
      drivingInputs: string[];
      intermediateGates: string[];
    }
  >;
  codeCanvasMap: Array<{
    nodeId: string;
    nodeLabel: string;
    gateType: string;
    vhdlLine?: number;
    vhdlStatement: string;
  }>;
  drcHealth: {
    isClean: boolean;
    floatingInputs: string[];
    unroutedOutputs: string[];
    activeFaultsCount: number;
  };
  identifiedIssues: IdentifiedDRCIssue[];
  liveProbesList: LiveProbeTelemetry[];
  fileOriginsSummary: FileOriginSummary[];
  agentCognition: AgentCognitiveTracking;
  activeFaultsList: Array<{ net: string; faultValue: string; consequence: string }>;
  recommendations: string[];
  activeTab?: string;
  activeTabLabel?: string;
  currentScreen?: {
    tab: string;
    label: string;
    description: string;
  };
}

const GATE_DELAYS: Record<string, number> = {
  NOT: 1.0,
  INV: 1.0,
  BUF: 1.0,
  BUFFER: 1.0,
  AND: 1.5,
  NAND: 1.5,
  OR: 1.5,
  NOR: 1.5,
  XOR: 2.5,
  XNOR: 2.5,
  HALF_ADDER: 3.0,
  ADDER: 4.5,
  ALU: 8.0,
  MULTIPLIER8: 12.0,
  SUBTRACTOR8: 6.0,
  COMPARATOR: 5.0,
  MUX2: 2.0,
  MUX4: 3.0,
  MUX8: 4.5,
  DEMUX4: 3.0,
  DECODER_3TO8: 3.5,
  DFF: 2.0,
  TFF: 2.5,
  JKFF: 2.5,
  COUNTER_4BIT: 5.5,
  SHIFT_REG8: 4.0,
  PROGRAM_COUNTER: 3.5,
  INSTR_DECODER: 4.0,
  REG_FILE_32X32: 6.5,
  SRAM_BLOCK: 7.0,
  BRAM_DUAL: 7.5,
  FIFO_BUFFER: 6.0,
  TEMP_SENSOR: 15.0,
  LIGHT_SENSOR: 15.0,
  PWM_DRIVER: 4.0,
  ADC_8BIT: 25.0,
  DAC_8BIT: 10.0,
  RISCV_CORE: 12.0,
  PROBE: 0.2,
  OUTPUT_PIN: 0.2,
  LED: 0.5,
  RGB_LED: 0.5,
  SEVEN_SEG: 1.0,
};

export function generateMentalMap(
  netlist: NetlistGraph | null,
  probeValues: Record<string, string> = {},
  vhdlCode: string = '',
  activeFaults: Record<string, string> = {},
  circuitName: string = 'active_circuit',
  activeTab: string = 'design',
  activeTabLabel: string = 'Design & RTL Studio',
  agentCognitionInput?: {
    currentPhase?: any;
    agentState?: string;
    logs?: any[];
    activeGoal?: string;
  }
): MentalMapData {
  const nodes = netlist?.nodes || [];
  const wires = netlist?.wires || [];
  const primaryInputs = (netlist?.primary_inputs || []).map((p) => p.name || p.id);
  const primaryOutputs = (netlist?.primary_outputs || []).map((p) => p.name || p.id);

  const nodeTypes = nodes.map((n) => (n.properties?.gate_type || n.type || '').toUpperCase());
  const typesSet = new Set(nodeTypes);
  const cLower = circuitName.toLowerCase();
  const codeLower = vhdlCode.toLowerCase();

  // 1. Classify Architecture
  let classification = `Custom Digital Architecture: ${circuitName}`;
  let designIntent = 'Synthesized digital hardware design on interactive EDA canvas.';
  let scaleLevel = 'Scale 1 (Gate Level)';

  if (cLower.includes('riscv') || codeLower.includes('riscv') || typesSet.has('RISCV_CORE')) {
    classification = '32-Bit RISC-V (RV32I) Microprocessor Core';
    designIntent = 'Single-cycle execution unit with instruction fetch, decode, ALU execution, and register file storage.';
    scaleLevel = 'Scale 4 (System on Chip / Processor)';
  } else if (typesSet.has('SRAM_BLOCK') || typesSet.has('BRAM_DUAL') || typesSet.has('FIFO_BUFFER') || cLower.includes('memory')) {
    classification = 'Synchronous Memory Subsystem';
    designIntent = 'Byte-addressable SRAM/BRAM array with synchronous read/write enables and elastic buffering.';
    scaleLevel = 'Scale 3 (Subsystem & Memory Array)';
  } else if (typesSet.has('ALU') || cLower.includes('alu')) {
    classification = 'Arithmetic Logic Unit (ALU)';
    designIntent = 'Configurable multi-function computing block executing arithmetic addition/subtraction and bitwise operations.';
    scaleLevel = 'Scale 3 (Computing Subsystem)';
  } else if (typesSet.has('COUNTER_4BIT') || typesSet.has('DFF') || cLower.includes('counter')) {
    classification = 'Synchronous Sequential Counter / FSM';
    designIntent = 'Clock-driven sequential state machine advancing binary counts with synchronous reset.';
    scaleLevel = 'Scale 2 (Sequential Block / FSM)';
  } else if (cLower.includes('full_adder') || (typesSet.has('XOR') && typesSet.has('AND') && typesSet.has('OR'))) {
    classification = '1-Bit Gate-Level Full Adder';
    designIntent = 'Fundamental arithmetic primitive computing binary Sum (A ⊕ B ⊕ Cin) and Carry-Out (AB + Cin(A ⊕ B)).';
    scaleLevel = 'Scale 1 (Combinational Gate-Level Unit)';
  } else if (cLower.includes('half_adder') || (typesSet.has('XOR') && typesSet.has('AND') && typesSet.size <= 2)) {
    classification = '1-Bit Half Adder';
    designIntent = 'Computes 2-operand single-bit sum and carry-out without carry-in cascade.';
    scaleLevel = 'Scale 1 (Gate-Level Primitive)';
  } else if (typesSet.has('MUX4') || typesSet.has('MUX8') || cLower.includes('mux')) {
    classification = 'Digital Multiplexer / Data Router';
    designIntent = 'Routes selected input channels to single destination bus based on binary address control lines.';
    scaleLevel = 'Scale 1 (Combinational Multiplexer)';
  }

  // 2. Build Adjacencies & Topological Stages
  const incomingMap: Record<string, string[]> = {};
  const outgoingMap: Record<string, string[]> = {};
  const connectedInputs: Set<string> = new Set();
  const connectedOutputs: Set<string> = new Set();
  const wireTargets: Set<string> = new Set();
  const wireSourcesPerTarget: Record<string, string[]> = {};

  wires.forEach((w) => {
    incomingMap[w.target_node] = incomingMap[w.target_node] || [];
    incomingMap[w.target_node].push(w.source_node);

    outgoingMap[w.source_node] = outgoingMap[w.source_node] || [];
    outgoingMap[w.source_node].push(w.target_node);

    const outKey = `${w.source_node}:${w.source_port}`;
    const inKey = `${w.target_node}:${w.target_port}`;
    connectedOutputs.add(outKey);
    connectedInputs.add(inKey);
    connectedInputs.add(w.target_port);
    wireTargets.add(w.target_node);

    wireSourcesPerTarget[inKey] = wireSourcesPerTarget[inKey] || [];
    wireSourcesPerTarget[inKey].push(outKey);
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inputSet = new Set(primaryInputs);

  const depthMemo: Record<string, number> = {};
  const delayMemo: Record<string, number> = {};
  const pathMemo: Record<string, string[]> = {};

  function getNodeDepth(nid: string, visited: Set<string> = new Set()): [number, number, string[]] {
    if (visited.has(nid)) return [0, 0, [nid]];
    if (depthMemo[nid] !== undefined) return [depthMemo[nid], delayMemo[nid], pathMemo[nid]];

    if (inputSet.has(nid)) {
      depthMemo[nid] = 0;
      delayMemo[nid] = 0;
      pathMemo[nid] = [nid];
      return [0, 0, [nid]];
    }

    const n = nodeMap.get(nid);
    const gtype = (n?.properties?.gate_type || n?.type || 'GATE').toUpperCase();
    const gdel = GATE_DELAYS[gtype] ?? 2.0;

    const parents = incomingMap[nid] || [];
    if (parents.length === 0) {
      depthMemo[nid] = 1;
      delayMemo[nid] = gdel;
      pathMemo[nid] = [nid];
      return [1, gdel, [nid]];
    }

    visited.add(nid);
    let maxD = 0;
    let maxDel = 0;
    let bestPath: string[] = [];

    parents.forEach((p) => {
      const [pd, pdel, ppath] = getNodeDepth(p, new Set(visited));
      if (pdel >= maxDel) {
        maxD = pd;
        maxDel = pdel;
        bestPath = ppath;
      }
    });

    const totalD = maxD + 1;
    const totalDel = maxDel + gdel;
    const fullPath = [...bestPath, nid];

    depthMemo[nid] = totalD;
    delayMemo[nid] = totalDel;
    pathMemo[nid] = fullPath;
    return [totalD, totalDel, fullPath];
  }

  // Calculate critical path
  const allEndpoints = [...nodes.map((n) => n.id), ...primaryOutputs];
  let worstDelay = 0;
  let criticalPath: string[] = [];
  let criticalEndpoint = '';

  allEndpoints.forEach((ep) => {
    const [, del, path] = getNodeDepth(ep);
    if (del > worstDelay) {
      worstDelay = del;
      criticalPath = path;
      criticalEndpoint = ep;
    }
  });

  // Stages breakdown
  const stages: Record<number, StageNode[]> = {};
  nodes.forEach((n) => {
    const d = depthMemo[n.id] ?? 1;
    stages[d] = stages[d] || [];
    stages[d].push({
      id: n.id,
      label: n.label || n.id,
      type: n.type || 'logic',
      delayNs: delayMemo[n.id] ?? 2.0,
    });
  });

  // 3. Signal Lineage
  const signalLineage: MentalMapData['signalLineage'] = {};
  primaryOutputs.forEach((outName) => {
    const visited = new Set<string>();
    const drivingInputs = new Set<string>();
    const intermediateGates: string[] = [];

    function backtrack(curr: string, depth = 0) {
      if (depth > 16 || visited.has(curr)) return;
      visited.add(curr);

      if (inputSet.has(curr)) {
        drivingInputs.add(curr);
        return;
      }

      const n = nodeMap.get(curr);
      if (n && curr !== outName) {
        intermediateGates.push(`${n.label || curr} [${n.type}]`);
      }

      (incomingMap[curr] || []).forEach((p) => backtrack(p, depth + 1));
    }

    backtrack(outName);
    signalLineage[outName] = {
      outputPin: outName,
      drivingInputs: Array.from(drivingInputs).sort(),
      intermediateGates,
    };
  });

  // 4. Code-to-Canvas Correlation Matrix
  const vhdlLines = vhdlCode.split('\n');
  const codeCanvasMap: MentalMapData['codeCanvasMap'] = nodes.map((node) => {
    const lbl = node.label || node.id;
    const ntype = (node.properties?.gate_type || node.type || '').toUpperCase();

    let matchedLine: number | undefined;
    let matchedStmt = '';

    for (let idx = 0; idx < vhdlLines.length; idx++) {
      const line = vhdlLines[idx].trim();
      const regex = new RegExp(`\\b(?:${lbl}|${node.id})\\s*<=`, 'i');
      if (regex.test(line)) {
        matchedLine = idx + 1;
        matchedStmt = line;
        break;
      }
    }

    if (!matchedLine) {
      for (let idx = 0; idx < vhdlLines.length; idx++) {
        const line = vhdlLines[idx].trim();
        const regex = new RegExp(`\\bsignal\\s+(?:${lbl}|${node.id})\\b`, 'i');
        if (regex.test(line)) {
          matchedLine = idx + 1;
          matchedStmt = line;
          break;
        }
      }
    }

    return {
      nodeId: node.id,
      nodeLabel: lbl,
      gateType: ntype,
      vhdlLine: matchedLine,
      vhdlStatement: matchedStmt || `-- Inferred ${ntype} instance`,
    };
  });

  // 5. Deep Hardware DRC & Health Engine
  const identifiedIssues: IdentifiedDRCIssue[] = [];
  const floatingInputs: string[] = [];

  nodes.forEach((n) => {
    (n.inputs || []).forEach((inp) => {
      const pName = inp.name || inp.id;
      const key = `${n.id}:${pName}`;
      if (!connectedInputs.has(key) && !connectedInputs.has(pName)) {
        floatingInputs.push(`${n.label || n.id}.${pName}`);
        identifiedIssues.push({
          id: `drc_floating_${n.id}_${pName}`,
          code: 'DRC-E101',
          title: `Floating CMOS Input: ${n.label || n.id}.${pName}`,
          severity: 'error',
          target: `${n.label || n.id}.${pName}`,
          targetNodeId: n.id,
          targetPort: pName,
          sourceFile: n.properties?.source_file || n.properties?.file || 'active_circuit.vhd',
          explanation: `Input pin "${pName}" on component "${n.label || n.id}" has no active driving net attached.`,
          physicalConsequence: 'CMOS gate floating inputs have infinite impedance (~10^12 Ω) and collect ambient static charge. The gate voltage drifts to ~VDD/2, conducting both PMOS and NMOS channels simultaneously (crowbar short-circuit current ~mA, causing localized overheating and erratic oscillation).',
          suggestedFix: `Route a driving signal to ${pName} or tie to VDD/GND with pull-up/pull-down resistor.`,
          autoFixAction: `Auto-fix floating pin ${n.label || n.id}.${pName}`,
        });
      }
    });
  });

  // Check for bus contention (multiple drivers)
  Object.entries(wireSourcesPerTarget).forEach(([tgtKey, sources]) => {
    if (sources.length > 1) {
      identifiedIssues.push({
        id: `drc_contention_${tgtKey}`,
        code: 'DRC-E102',
        title: `Bus Contention Conflict on ${tgtKey}`,
        severity: 'error',
        target: tgtKey,
        explanation: `${sources.length} active push-pull outputs are driving net "${tgtKey}" simultaneously: ${sources.join(', ')}.`,
        physicalConsequence: 'Multiple active push-pull drivers asserting opposite logic states (one sourcing VDD, one sinking GND) create a direct short circuit across power rails, burning output driver FETs.',
        suggestedFix: 'Insert a 2:1 Multiplexer or Tristate Buffer so only one driver asserts the net at any given time.',
        autoFixAction: `Resolve bus contention on ${tgtKey}`,
      });
    }
  });

  const unroutedOutputs = primaryOutputs.filter((p) => !wireTargets.has(p));
  unroutedOutputs.forEach((outName) => {
    identifiedIssues.push({
      id: `drc_unrouted_${outName}`,
      code: 'DRC-W104',
      title: `Unrouted Primary Output: ${outName}`,
      severity: 'warning',
      target: outName,
      explanation: `Primary output pin "${outName}" is declared in the entity but receives no internal driver assignment.`,
      physicalConsequence: 'The PCB output pin will float in high-impedance state, causing downstream peripheral chips to read indeterminate logic levels.',
      suggestedFix: `Assign an internal stage logic expression or register signal to "${outName}".`,
      autoFixAction: `Route driver signal to output ${outName}`,
    });
  });

  // Active Injected Faults
  const activeFaultsList: Array<{ net: string; faultValue: string; consequence: string }> = [];
  Object.entries(activeFaults).forEach(([net, val]) => {
    activeFaultsList.push({
      net,
      faultValue: String(val),
      consequence: `Forces net "${net}" permanently to ${String(val) === '1' ? 'VDD (3.3V Logic 1)' : 'GND (0V Logic 0)'}, preventing dynamic signal transitions.`,
    });
    identifiedIssues.push({
      id: `fault_inj_${net}`,
      code: 'FAULT-INJ',
      title: `Active Fault Injected: Net "${net}" Stuck-At-${val}`,
      severity: 'warning',
      target: net,
      explanation: `Net "${net}" has an active Stuck-at-${val} electrical fault override.`,
      physicalConsequence: `Simulates a physical solder bridge to ${String(val) === '1' ? 'VDD (+3.3V)' : 'GND (0V)'}, disabling logical propagation along this path.`,
      suggestedFix: 'Clear fault injection to restore normal gate-level switching.',
      autoFixAction: `Clear fault on net ${net}`,
    });
  });

  const activeFaultsCount = Object.keys(activeFaults).length;

  // 6. Live Probes & Voltage Telemetry
  const liveProbesList: LiveProbeTelemetry[] = [];
  const allProbeNames = Array.from(new Set([...primaryInputs, ...primaryOutputs, ...Object.keys(probeValues)]));
  allProbeNames.forEach((pName) => {
    const rawVal = probeValues[pName] ?? '0';
    let state: LiveProbeTelemetry['state'] = 'UNKNOWN';
    let voltage = '0.0V';

    if (rawVal === '1' || rawVal === 'true') {
      state = 'HIGH';
      voltage = '3.3V';
    } else if (rawVal === '0' || rawVal === 'false') {
      state = 'LOW';
      voltage = '0.0V';
    } else if (rawVal.toUpperCase() === 'Z' || rawVal.toUpperCase() === 'HIGH_Z') {
      state = 'HIGH_Z';
      voltage = 'High-Z (Floating)';
    } else {
      state = 'UNKNOWN';
      voltage = rawVal;
    }

    liveProbesList.push({
      name: pName,
      value: rawVal,
      voltage,
      state,
    });
  });

  // 7. Multi-File Module Origins Summary
  const fileCounts: Record<string, number> = {};
  nodes.forEach((n) => {
    const f = n.properties?.source_file || n.properties?.file || (cLower.includes('full_adder') ? 'full_adder.vhd' : 'active_circuit.vhd');
    fileCounts[f] = (fileCounts[f] || 0) + 1;
  });
  const fileOriginsSummary: FileOriginSummary[] = Object.entries(fileCounts).map(([fileName, gateCount]) => ({
    fileName,
    gateCount,
    palette: getFilePalette(fileName),
  }));

  // 8. Agent Cognition & Mission Tracking
  const rawPhaseIdx =
    agentCognitionInput?.currentPhase?.step_index !== undefined
      ? agentCognitionInput.currentPhase.step_index
      : agentCognitionInput?.currentPhase?.step
      ? agentCognitionInput.currentPhase.step - 1
      : 0;
  const safePhaseIdx = typeof rawPhaseIdx === 'number' && !isNaN(rawPhaseIdx) ? rawPhaseIdx : 0;

  const agentCognition: AgentCognitiveTracking = {
    currentGoal: agentCognitionInput?.activeGoal || `Synthesize, verify, and simulate ${classification}`,
    activePhaseName: agentCognitionInput?.currentPhase?.step_name || (agentCognitionInput?.agentState === 'COMPLETED' ? 'Knowledge & Reflection' : 'Autonomous EDA Pipeline'),
    activePhaseIndex: safePhaseIdx,
    totalPhases: 6,
    currentThought:
      agentCognitionInput?.currentPhase?.thought ||
      (identifiedIssues.length > 0
        ? `Identified ${identifiedIssues.length} circuit conditions: ${identifiedIssues.map((i) => i.title).slice(0, 2).join(', ')}. Ready to auto-fix.`
        : 'Circuit design is synthesized, clean, and verified with zero DRC violations.'),
    agentState: agentCognitionInput?.agentState || 'IDLE',
    lastAction: agentCognitionInput?.logs && agentCognitionInput.logs.length > 0 ? agentCognitionInput.logs[agentCognitionInput.logs.length - 1].action : 'ready',
  };

  // 9. Actionable Recommendations
  const recommendations: string[] = [];
  if (identifiedIssues.some((i) => i.severity === 'error')) {
    recommendations.push(`Auto-fix ${identifiedIssues.filter((i) => i.severity === 'error').length} critical DRC errors to prevent CMOS shoot-through crowbar currents.`);
  }
  if (floatingInputs.length > 0) {
    recommendations.push(`Route floating gate inputs: ${floatingInputs.slice(0, 3).join(', ')}.`);
  }
  if (unroutedOutputs.length > 0) {
    recommendations.push(`Connect driver signals to primary outputs: ${unroutedOutputs.join(', ')}.`);
  }

  const hasProbe = nodes.some((n) => ['PROBE', 'OUTPUT_PIN', 'LED', 'RGB_LED', 'SEVEN_SEG'].includes((n.type || '').toUpperCase()));
  if (!hasProbe) {
    recommendations.push('Add an illuminated LED or digital Probe to primary outputs for live visual voltage telemetry.');
  }

  if (classification.includes('Full Adder')) {
    recommendations.push('Chain full adders to synthesize a multi-bit Ripple Carry Adder with overflow detection.');
    recommendations.push('Optimize critical carry propagation path using Carry-Lookahead (CLA) generate/propagate logic.');
  } else if (classification.includes('Counter')) {
    recommendations.push('Connect counter output bus to a 7-Segment Hex Display for real-time numeric readouts.');
  }

  if (!vhdlCode.toLowerCase().includes('assert') && !vhdlCode.toLowerCase().includes('testbench')) {
    recommendations.push('Run 100ns cycle simulation with an automated testbench asserting all truth table vectors.');
  }

  let screenDescription = 'Working in Design & RTL Studio with Schematic Netlist Canvas and VHDL-2008 RTL Code Editor.';
  if (activeTab === 'lifecycle') {
    screenDescription = 'Auditing Turnkey Hardware Lifecycle (Signal & Power Integrity, Thermal CFD, Mechanical FEA, and PCB DFM Stackup).';
  } else if (activeTab === 'embedded') {
    screenDescription = 'Configuring Multi-Platform Embedded Systems & MCU firmware drivers (ESP32-S3, RP2040, RPi5 SBC).';
  } else if (activeTab === 'waveform') {
    screenDescription = 'Inspecting timing waveforms, signal skew, and digital clock cycles in Waveform Analyzer.';
  } else if (activeTab === 'kg') {
    screenDescription = 'Navigating the Multi-Scale Circuit Knowledge Graph & Hardware Ontology.';
  }

  return {
    circuitName,
    classification,
    designIntent,
    scaleLevel,
    activeTab,
    activeTabLabel,
    currentScreen: {
      tab: activeTab,
      label: activeTabLabel,
      description: screenDescription,
    },
    complexity: {
      nodeCount: nodes.length,
      wireCount: wires.length,
      inputCount: primaryInputs.length,
      outputCount: primaryOutputs.length,
    },
    primaryInputs,
    primaryOutputs,
    stages,
    maxStages: Object.keys(stages).length,
    criticalPath: {
      delayNs: Number(worstDelay.toFixed(2)),
      path: criticalPath,
      endpoint: criticalEndpoint,
    },
    signalLineage,
    codeCanvasMap,
    drcHealth: {
      isClean: identifiedIssues.filter((i) => i.severity === 'error').length === 0,
      floatingInputs,
      unroutedOutputs,
      activeFaultsCount,
    },
    identifiedIssues,
    liveProbesList,
    fileOriginsSummary,
    agentCognition,
    activeFaultsList,
    recommendations: recommendations.slice(0, 4),
  };
}
