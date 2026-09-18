import { NetlistGraph, NetlistNode, NetlistWire } from '../types/circuit';

export interface SimulationState {
  probeValues: Record<string, string>;
  wireValues: Record<string, string>;
}

/**
 * Robust conversion to a single digital bit (0 or 1).
 */
export function toBit(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return v > 0 ? 1 : 0;
  const str = String(v).trim();
  if (str === '1' || str.toLowerCase() === 'true') return 1;
  if (str === '0' || str.toLowerCase() === 'false' || str.toUpperCase() === 'Z' || str.toUpperCase() === 'X') return 0;
  if (str.startsWith('0x') || str.startsWith('0X')) {
    const n = parseInt(str, 16);
    return !isNaN(n) && n > 0 ? 1 : 0;
  }
  const parsed = parseInt(str, 2);
  if (!isNaN(parsed)) return parsed > 0 ? 1 : 0;
  const num = parseInt(str, 10);
  return !isNaN(num) && num > 0 ? 1 : 0;
}

/**
 * Cleanly formats digital logic values based on port width.
 * Single bit (width = 1): always exactly 1 character ('0', '1', 'Z', 'X').
 * Multi-bit (width > 1): compact hexadecimal representation with '0x' prefix.
 */
export function formatLogicValue(val: string | undefined | null, width = 1): string {
  if (val === undefined || val === null || val === '') {
    return width > 1 ? '0x' + '0'.repeat(Math.max(1, Math.ceil(width / 4))) : '0';
  }
  const str = String(val).trim();

  // 1-bit signal: STD_LOGIC
  if (width <= 1) {
    if (str === '0' || str === '1' || str.toUpperCase() === 'Z' || str.toUpperCase() === 'X') {
      return str.toUpperCase();
    }
    return toBit(str) === 1 ? '1' : '0';
  }

  // Multi-bit vector: STD_LOGIC_VECTOR / Bus
  const hexDigits = Math.max(1, Math.ceil(width / 4));
  if (str.startsWith('0x') || str.startsWith('0X')) {
    const rawHex = str.slice(2);
    return '0x' + rawHex.toUpperCase().padStart(hexDigits, '0');
  }

  // Binary string
  if (/^[01ZX_]+$/i.test(str)) {
    if (str.toUpperCase().includes('Z')) return '0x' + 'Z'.repeat(hexDigits);
    if (str.toUpperCase().includes('X')) return '0x' + 'X'.repeat(hexDigits);
    try {
      const cleanBin = str.replace(/_/g, '');
      const big = BigInt('0b' + cleanBin);
      return '0x' + big.toString(16).toUpperCase().padStart(hexDigits, '0');
    } catch {
      const parsed = parseInt(str, 2);
      if (!isNaN(parsed)) {
        return '0x' + (parsed >>> 0).toString(16).toUpperCase().padStart(hexDigits, '0');
      }
    }
  }

  // Decimal number string
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    return '0x' + (num >>> 0).toString(16).toUpperCase().padStart(hexDigits, '0');
  }

  return str;
}

/**
 * Universal Topological Digital Logic Evaluator
 * Evaluates inputs, gate logic, multiplexers, latches, custom blocks, and wires until convergence.
 */
export function evaluateCircuitLogic(
  netlist: NetlistGraph | null,
  inputValues: Record<string, string>,
  activeFaults: Record<string, string> = {}
): SimulationState {
  if (!netlist) {
    return { probeValues: { ...inputValues }, wireValues: {} };
  }

  // Initialize node pin values, wire values, and probe monitors
  const pinValues: Record<string, string> = {};
  const wireValues: Record<string, string> = {};
  const probeValues: Record<string, string> = { ...inputValues };

  // 1. Initialize primary inputs with full alias coverage
  netlist.primary_inputs.forEach((pin) => {
    let val =
      inputValues[pin.name] ??
      inputValues[pin.id] ??
      inputValues[pin.name.toLowerCase()] ??
      inputValues[pin.id.toLowerCase()] ??
      '0';

    // Check stuck-at faults on primary input
    if (activeFaults[pin.name] !== undefined) {
      val = activeFaults[pin.name];
    } else if (activeFaults[pin.id] !== undefined) {
      val = activeFaults[pin.id];
    }

    pinValues[pin.name] = val;
    pinValues[pin.id] = val;
    pinValues[pin.name.toLowerCase()] = val;
    pinValues[pin.id.toLowerCase()] = val;
    probeValues[pin.name] = val;
    probeValues[pin.id] = val;
  });

  // Fast lookup maps for nodes
  const nodeMap = new Map<string, NetlistNode>();
  netlist.nodes.forEach((n) => {
    nodeMap.set(n.id, n);
    nodeMap.set(n.label, n);
    nodeMap.set(n.id.toLowerCase(), n);
    nodeMap.set(n.label.toLowerCase(), n);
  });

  // 2. Multi-pass topological propagation (up to 16 iterations for convergence)
  const maxIterations = 16;
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // A. Propagate wires: Source pin -> Target pin
    netlist.wires.forEach((wire) => {
      let srcVal: string | undefined = undefined;

      // Check if source is a primary input
      const primaryIn = netlist.primary_inputs.find(
        (p) =>
          p.name === wire.source_node ||
          p.id === wire.source_node ||
          p.name.toLowerCase() === wire.source_node.toLowerCase() ||
          p.id.toLowerCase() === wire.source_node.toLowerCase()
      );

      if (primaryIn) {
        srcVal = pinValues[primaryIn.name] || pinValues[primaryIn.id] || probeValues[primaryIn.name] || '0';
      } else {
        // Source is a gate or block node output
        const srcNode = nodeMap.get(wire.source_node) || nodeMap.get(wire.source_node.toLowerCase());
        if (srcNode) {
          srcVal =
            pinValues[`${srcNode.id}:${wire.source_port}`] ??
            pinValues[`${srcNode.id}:${wire.source_port.toLowerCase()}`] ??
            pinValues[`${srcNode.label}:${wire.source_port}`] ??
            pinValues[`${srcNode.label}:${wire.source_port.toLowerCase()}`] ??
            pinValues[wire.source_port] ??
            pinValues[wire.source_node];
        } else {
          srcVal = pinValues[`${wire.source_node}:${wire.source_port}`] ?? pinValues[wire.source_port];
        }
      }

      if (srcVal === undefined) {
        srcVal = '0';
      }

      // Check for stuck-at faults on this net
      const netName = wire.label || wire.id;
      if (activeFaults[netName] !== undefined) {
        srcVal = activeFaults[netName];
      } else if (activeFaults[wire.source_port] !== undefined) {
        srcVal = activeFaults[wire.source_port];
      } else if (activeFaults[wire.id] !== undefined) {
        srcVal = activeFaults[wire.id];
      }

      // Assign to wire values
      if (wireValues[wire.id] !== srcVal) {
        wireValues[wire.id] = srcVal;
        changed = true;
      }
      if (wire.label) {
        probeValues[wire.label] = srcVal;
      }

      // Propagate to target pin
      const tgtNode = nodeMap.get(wire.target_node) || nodeMap.get(wire.target_node.toLowerCase());
      if (tgtNode) {
        // Set all aliases for target node port
        const targetKeys = [
          `${tgtNode.id}:${wire.target_port}`,
          `${tgtNode.label}:${wire.target_port}`,
          `${tgtNode.id}:${wire.target_port.toLowerCase()}`,
        ];

        // Also check matching port object inside node
        const norm = (s: string = '') => s.toLowerCase().replace(/^(in_|out_|sig_|s_)/, '').trim();
        const matchedPort = tgtNode.inputs.find(
          (p) =>
            p.id === wire.target_port ||
            p.name === wire.target_port ||
            p.id.toLowerCase() === wire.target_port.toLowerCase() ||
            p.name.toLowerCase() === wire.target_port.toLowerCase() ||
            norm(p.name) === norm(wire.target_port) ||
            norm(p.id) === norm(wire.target_port)
        );
        if (matchedPort) {
          targetKeys.push(`${tgtNode.id}:${matchedPort.id}`);
          targetKeys.push(`${tgtNode.id}:${matchedPort.name}`);
          targetKeys.push(`${tgtNode.label}:${matchedPort.id}`);
          targetKeys.push(`${tgtNode.label}:${matchedPort.name}`);
        }

        targetKeys.forEach((key) => {
          if (pinValues[key] !== srcVal) {
            pinValues[key] = srcVal;
            changed = true;
          }
        });
      } else {
        const rawTgtKey = `${wire.target_node}:${wire.target_port}`;
        if (pinValues[rawTgtKey] !== srcVal) {
          pinValues[rawTgtKey] = srcVal;
          changed = true;
        }
      }

      // If target is a primary output, update primary output probes
      const primaryOut = netlist.primary_outputs.find(
        (p) =>
          p.name === wire.target_node ||
          p.id === wire.target_node ||
          p.name.toLowerCase() === wire.target_node.toLowerCase() ||
          p.id.toLowerCase() === wire.target_node.toLowerCase()
      );

      if (primaryOut) {
        let finalOutVal = srcVal;
        if (activeFaults[primaryOut.name] !== undefined) {
          finalOutVal = activeFaults[primaryOut.name];
        } else if (activeFaults[primaryOut.id] !== undefined) {
          finalOutVal = activeFaults[primaryOut.id];
        } else if (activeFaults[wire.target_node] !== undefined) {
          finalOutVal = activeFaults[wire.target_node];
        }

        const outWidth = primaryOut.width || 1;
        finalOutVal = formatLogicValue(finalOutVal, outWidth);

        if (probeValues[primaryOut.name] !== finalOutVal || probeValues[primaryOut.id] !== finalOutVal) {
          probeValues[primaryOut.name] = finalOutVal;
          probeValues[primaryOut.id] = finalOutVal;
          probeValues[wire.target_node] = finalOutVal;
          changed = true;
        }
      }
    });

    // B. Evaluate gates and component outputs
    netlist.nodes.forEach((node) => {
      const gateType = (node.properties?.gate_type || node.type || '').toUpperCase();

      const inVals: Record<string, string> = {};
      node.inputs.forEach((port) => {
        const val =
          pinValues[`${node.id}:${port.id}`] ??
          pinValues[`${node.id}:${port.name}`] ??
          pinValues[`${node.label}:${port.id}`] ??
          pinValues[`${node.label}:${port.name}`] ??
          pinValues[port.name] ??
          pinValues[port.id] ??
          '0';
        inVals[port.name] = val;
        inVals[port.id] = val;
      });

      const inValList = node.inputs.map((p) => inVals[p.name] ?? inVals[p.id] ?? '0');
      const toBit = (v: string): number => (v === '1' || parseInt(v, 2) > 0 ? 1 : 0);

      // For observation sinks (Probes, LEDs, 7-Segment, RGB LED, Output Pins), update probe values directly
      if (
        gateType === 'PROBE' ||
        gateType.includes('LED') ||
        gateType === 'OUTPUT_PIN' ||
        gateType === 'SEVEN_SEG' ||
        node.type === 'PROBE' ||
        node.type === 'OUTPUT_PIN'
      ) {
        if (gateType === 'SEVEN_SEG') {
          const hexVal = inVals['HexIn'] || inVals['in_hex'] || inValList[0] || '0';
          if (probeValues[`${node.id}:in_hex`] !== hexVal || probeValues[node.id] !== hexVal) {
            probeValues[`${node.id}:in_hex`] = hexVal;
            probeValues[node.id] = hexVal;
            probeValues[node.label] = hexVal;
            changed = true;
          }
        } else if (gateType === 'RGB_LED') {
          const r = inVals['R'] || inVals['in_r'] || inValList[0] || '0';
          const g = inVals['G'] || inVals['in_g'] || inValList[1] || '0';
          const b = inVals['B'] || inVals['in_b'] || inValList[2] || '0';
          const rgbStr = `${r}${g}${b}`;
          if (probeValues[`${node.id}:in_r`] !== r || probeValues[`${node.id}:in_g`] !== g || probeValues[`${node.id}:in_b`] !== b) {
            probeValues[`${node.id}:in_r`] = r;
            probeValues[`${node.id}:in_g`] = g;
            probeValues[`${node.id}:in_b`] = b;
            probeValues[`${node.label}:R`] = r;
            probeValues[`${node.label}:G`] = g;
            probeValues[`${node.label}:B`] = b;
            probeValues[node.id] = rgbStr;
            probeValues[node.label] = rgbStr;
            changed = true;
          }
        } else {
          const val = inValList[0] || inVals['Probe'] || inVals['OUT'] || '0';
          if (probeValues[node.id] !== val || probeValues[node.label] !== val) {
            probeValues[node.id] = val;
            probeValues[node.label] = val;
            changed = true;
          }
        }
      }

      node.outputs.forEach((outPort) => {
        let outVal = '0';
        const portNameLower = outPort.name.toLowerCase();

        if (gateType === 'AND') {
          const allHigh = inValList.length > 0 && inValList.every((v) => toBit(v) === 1);
          outVal = allHigh ? '1' : '0';
        } else if (gateType === 'NAND') {
          const allHigh = inValList.length > 0 && inValList.every((v) => toBit(v) === 1);
          outVal = allHigh ? '0' : '1';
        } else if (gateType === 'OR') {
          const anyHigh = inValList.some((v) => toBit(v) === 1);
          outVal = anyHigh ? '1' : '0';
        } else if (gateType === 'NOR') {
          const anyHigh = inValList.some((v) => toBit(v) === 1);
          outVal = anyHigh ? '0' : '1';
        } else if (gateType === 'XOR') {
          const highCount = inValList.filter((v) => toBit(v) === 1).length;
          outVal = highCount % 2 === 1 ? '1' : '0';
        } else if (gateType === 'XNOR') {
          const highCount = inValList.filter((v) => toBit(v) === 1).length;
          outVal = highCount % 2 === 1 ? '0' : '1';
        } else if (gateType === 'NOT' || gateType === 'INV') {
          outVal = toBit(inValList[0] || '0') === 1 ? '0' : '1';
        } else if (gateType === 'BUF' || gateType === 'BUFFER' || gateType === 'CLK_TREE_BUF') {
          outVal = inValList[0] || '0';
        } else if (gateType === 'TRISTATE') {
          const oe = toBit(inVals['OE'] || inVals['in_oe'] || inValList[1] || '0');
          const d = inVals['D'] || inVals['in_data'] || inValList[0] || '0';
          outVal = oe ? d : 'Z';
        } else if (gateType === 'MUX') {
          const sel = toBit(inVals['sel'] || inVals['Sel'] || inVals['S'] || inValList[2] || '0');
          const d0 = inVals['in0'] || inVals['D0'] || inVals['A'] || inValList[0] || '0';
          const d1 = inVals['in1'] || inVals['D1'] || inVals['B'] || inValList[1] || '0';
          outVal = sel === 1 ? d1 : d0;
        } else if (gateType === 'MUX4') {
          const selRaw = inVals['Sel'] || inVals['in_sel'] || inValList[4] || '0';
          const sel = parseInt(selRaw, 2) || parseInt(selRaw, 10) || 0;
          const d = [
            inVals['D0'] || inVals['in_0'] || inValList[0] || '0',
            inVals['D1'] || inVals['in_1'] || inValList[1] || '0',
            inVals['D2'] || inVals['in_2'] || inValList[2] || '0',
            inVals['D3'] || inVals['in_3'] || inValList[3] || '0',
          ];
          outVal = d[sel % 4] || '0';
        } else if (gateType === 'MUX8') {
          const selRaw = inVals['Sel'] || inVals['in_sel'] || inValList[8] || '0';
          const sel = parseInt(selRaw, 2) || parseInt(selRaw, 10) || 0;
          const d = Array.from({ length: 8 }, (_, i) => inVals[`D${i}`] || inVals[`in_${i}`] || inValList[i] || '0');
          outVal = d[sel % 8] || '0';
        } else if (gateType === 'DEMUX4') {
          const d = inVals['D'] || inVals['in_d'] || inValList[0] || '0';
          const selRaw = inVals['Sel'] || inVals['in_sel'] || inValList[1] || '0';
          const sel = parseInt(selRaw, 2) || parseInt(selRaw, 10) || 0;
          if (portNameLower.includes('y0') || portNameLower === 'out_0') outVal = sel === 0 ? d : '0';
          else if (portNameLower.includes('y1') || portNameLower === 'out_1') outVal = sel === 1 ? d : '0';
          else if (portNameLower.includes('y2') || portNameLower === 'out_2') outVal = sel === 2 ? d : '0';
          else if (portNameLower.includes('y3') || portNameLower === 'out_3') outVal = sel === 3 ? d : '0';
          else outVal = '0';
        } else if (gateType === 'DECODER_3TO8') {
          const en = toBit(inVals['EN'] || inVals['in_en'] || '1');
          const aRaw = inVals['A'] || inVals['in_sel'] || '0';
          const a = parseInt(aRaw, 2) || parseInt(aRaw, 10) || 0;
          outVal = en ? (1 << (a % 8)).toString(2).padStart(8, '0') : '00000000';
        } else if (gateType === 'DFF') {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const d = inVals['D'] || inVals['in_d'] || inValList[0] || '0';
          if (rst) {
            outVal = portNameLower.includes('qn') ? '1' : '0';
          } else {
            outVal = portNameLower.includes('qn') ? (toBit(d) === 1 ? '0' : '1') : d;
          }
        } else if (gateType === 'TFF') {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const t = toBit(inVals['T'] || inVals['in_t'] || inValList[0] || '0');
          const prevQ = toBit(pinValues[`${node.id}:out_q`] || pinValues[`${node.id}:Q`] || '0');
          outVal = rst ? '0' : (t ? (prevQ ? '0' : '1') : (prevQ ? '1' : '0'));
        } else if (gateType === 'JKFF') {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const j = toBit(inVals['J'] || inVals['in_j'] || '0');
          const k = toBit(inVals['K'] || inVals['in_k'] || '0');
          const prevQ = toBit(pinValues[`${node.id}:out_q`] || pinValues[`${node.id}:Q`] || '0');
          if (rst) outVal = '0';
          else if (j && !k) outVal = '1';
          else if (!j && k) outVal = '0';
          else if (j && k) outVal = prevQ ? '0' : '1';
          else outVal = prevQ ? '1' : '0';
        } else if (gateType === 'REGISTER' || gateType === 'REG') {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const en = toBit(inVals['EN'] || inVals['in_en'] || '1');
          const d = inVals['D'] || inVals['in_d'] || inValList[0] || '0';
          outVal = rst ? '0' : (en ? d : pinValues[`${node.id}:out_q`] || '0');
        } else if (gateType === 'SHIFT_REG8') {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const load = toBit(inVals['Load'] || inVals['in_load'] || '0');
          const din = inVals['Din'] || inVals['in_pin'] || '00000000';
          const sin = toBit(inVals['Sin'] || inVals['in_din'] || '0');
          const prevQ = pinValues[`${node.id}:out_pout`] || pinValues[`${node.id}:Q`] || '00000000';
          const newQ = rst ? '00000000' : (load ? din.padStart(8, '0') : (prevQ.slice(1) + sin));
          if (portNameLower.includes('sout')) {
            outVal = prevQ[0] || '0';
          } else {
            outVal = newQ;
          }
        } else if (gateType === 'CLK_DIVIDER') {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const prevCnt = parseInt(pinValues[`${node.id}:cnt`] || '0', 10);
          const nextCnt = rst ? 0 : (prevCnt + 1) % 8;
          pinValues[`${node.id}:cnt`] = String(nextCnt);
          if (portNameLower.includes('2')) outVal = ((nextCnt >> 0) & 1).toString();
          else if (portNameLower.includes('4')) outVal = ((nextCnt >> 1) & 1).toString();
          else outVal = ((nextCnt >> 2) & 1).toString();
        } else if (gateType === 'COUNTER') {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const en = toBit(inVals['EN'] || inVals['in_en'] || '1');
          const prevCnt = parseInt(pinValues[`${node.id}:out_cnt`] || '0', 10);
          const nextCnt = rst ? 0 : (en ? (prevCnt + 1) % 256 : prevCnt);
          if (portNameLower.includes('tc')) {
            outVal = nextCnt === 255 ? '1' : '0';
          } else {
            outVal = nextCnt.toString(2).padStart(8, '0');
          }
        } else if (gateType === 'ADDER' || gateType === 'ADD') {
          const a = toBit(inVals['A'] || inVals['in_a'] || inValList[0] || '0');
          const b = toBit(inVals['B'] || inVals['in_b'] || inValList[1] || '0');
          const cin = toBit(inVals['Cin'] || inVals['in_cin'] || inValList[2] || '0');
          if (portNameLower.includes('cout') || portNameLower.includes('carry')) {
            outVal = (a & b) | (cin & (a ^ b)) ? '1' : '0';
          } else {
            outVal = a ^ b ^ cin ? '1' : '0';
          }
        } else if (gateType === 'HALF_ADDER') {
          const a = toBit(inVals['A'] || inVals['in_a'] || inValList[0] || '0');
          const b = toBit(inVals['B'] || inVals['in_b'] || inValList[1] || '0');
          if (portNameLower.includes('carry') || portNameLower.includes('cout') || portNameLower === 'out_c') {
            outVal = a & b ? '1' : '0';
          } else {
            outVal = a ^ b ? '1' : '0';
          }
        } else if (gateType === 'MULTIPLIER8' || gateType === 'MULTIPLIER') {
          const aRaw = inVals['A'] || inVals['in_a'] || inValList[0] || '0';
          const bRaw = inVals['B'] || inVals['in_b'] || inValList[1] || '0';
          const a = parseInt(aRaw, 2) || parseInt(aRaw, 10) || 0;
          const b = parseInt(bRaw, 2) || parseInt(bRaw, 10) || 0;
          const prod = (a * b) & 0xffff;
          outVal = prod.toString(2).padStart(16, '0');
        } else if (gateType === 'SUBTRACTOR8' || gateType === 'SUBTRACTOR' || gateType === 'SUB') {
          const aRaw = inVals['A'] || inVals['in_a'] || inValList[0] || '0';
          const bRaw = inVals['B'] || inVals['in_b'] || inValList[1] || '0';
          const a = parseInt(aRaw, 2) || parseInt(aRaw, 10) || 0;
          const b = parseInt(bRaw, 2) || parseInt(bRaw, 10) || 0;
          if (portNameLower.includes('borrow')) {
            outVal = a < b ? '1' : '0';
          } else {
            outVal = ((a - b) & 0xff).toString(2).padStart(8, '0');
          }
        } else if (gateType === 'COMPARATOR' || gateType === 'CMP') {
          const aRaw = inVals['A'] || inVals['in_a'] || inValList[0] || '0';
          const bRaw = inVals['B'] || inVals['in_b'] || inValList[1] || '0';
          const a = parseInt(aRaw, 2) || parseInt(aRaw, 10) || 0;
          const b = parseInt(bRaw, 2) || parseInt(bRaw, 10) || 0;
          if (portNameLower.includes('eq')) outVal = a === b ? '1' : '0';
          else if (portNameLower.includes('gt')) outVal = a > b ? '1' : '0';
          else if (portNameLower.includes('lt')) outVal = a < b ? '1' : '0';
          else outVal = a === 0 ? '1' : '0';
        } else if (gateType === 'ALU') {
          const aRaw = inVals['A'] || inVals['in_a'] || inValList[0] || '0';
          const bRaw = inVals['B'] || inVals['in_b'] || inValList[1] || '0';
          const ctrlRaw = inVals['ALUControl'] || inVals['in_ctrl'] || inValList[2] || '0';
          const a = parseInt(aRaw, 2) || parseInt(aRaw, 10) || 0;
          const b = parseInt(bRaw, 2) || parseInt(bRaw, 10) || 0;
          let res = 0;
          if (ctrlRaw === '0000' || ctrlRaw === '0') res = (a + b) & 0xffffffff;
          else if (ctrlRaw === '0001' || ctrlRaw === '1') res = (a - b) & 0xffffffff;
          else if (ctrlRaw === '0010' || ctrlRaw === '2') res = (a & b) & 0xffffffff;
          else if (ctrlRaw === '0011' || ctrlRaw === '3') res = (a | b) & 0xffffffff;
          else res = (a ^ b) & 0xffffffff;
          if (portNameLower.includes('zero')) outVal = res === 0 ? '1' : '0';
          else if (portNameLower.includes('ovf') || portNameLower.includes('overflow')) outVal = '0';
          else if ((outPort.width || 1) === 1) outVal = (res & 1) ? '1' : '0';
          else outVal = '0x' + (res >>> 0).toString(16).toUpperCase().padStart(Math.ceil((outPort.width || 32) / 4), '0');
        } else if (gateType === 'SEVEN_SEG') {
          const hexRaw = inVals['HexIn'] || inVals['in_hex'] || inValList[0] || '0';
          const intVal = parseInt(hexRaw, 16) || parseInt(hexRaw, 2) || 0;
          const patterns = ['0111111', '0000110', '1011011', '1001111', '1100110', '1101101', '1111101', '0000111', '1111111', '1101111', '1110111', '1111100', '0111001', '1011110', '1111001', '1110001'];
          outVal = patterns[intVal % 16] || '0111111';
        } else if (gateType.includes('RISCV') || gateType.includes('PROCESSOR')) {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const prevPc = parseInt(pinValues[`${node.id}:PC`] || '0', 16) || 0;
          const nextPc = rst ? 0 : prevPc + 4;
          if (portNameLower.includes('pc')) outVal = '0x' + nextPc.toString(16).padStart(8, '0');
          else if (portNameLower.includes('addr')) outVal = '0x00001000';
          else if (portNameLower.includes('dout')) outVal = '0x00000000';
          else if (portNameLower.includes('we')) outVal = '0';
          else outVal = '0';
        } else if (gateType === 'PROGRAM_COUNTER') {
          const rst = toBit(inVals['RST'] || inVals['in_rst'] || '0');
          const pcNext = inVals['PC_Next'] || inVals['in_pc_next'] || '0';
          const pcInt = parseInt(pcNext, 16) || parseInt(pcNext, 2) || 0;
          if (portNameLower.includes('plus4') || portNameLower.includes('pc4')) {
            outVal = '0x' + (pcInt + 4).toString(16).padStart(8, '0');
          } else {
            outVal = rst ? '0x00000000' : '0x' + pcInt.toString(16).padStart(8, '0');
          }
        } else if (gateType === 'INSTR_DECODER') {
          const instrRaw = inVals['Instr'] || inVals['in_instr'] || '0';
          const instr = parseInt(instrRaw, 16) || parseInt(instrRaw, 2) || 0;
          if (portNameLower.includes('op')) outVal = (instr & 0x7f).toString(2).padStart(7, '0');
          else if (portNameLower.includes('rd')) outVal = ((instr >> 7) & 0x1f).toString(2).padStart(5, '0');
          else if (portNameLower.includes('f3') || portNameLower.includes('funct3')) outVal = ((instr >> 12) & 0x7).toString(2).padStart(3, '0');
          else if (portNameLower.includes('rs1')) outVal = ((instr >> 15) & 0x1f).toString(2).padStart(5, '0');
          else if (portNameLower.includes('rs2')) outVal = ((instr >> 20) & 0x1f).toString(2).padStart(5, '0');
          else if (portNameLower.includes('imm')) outVal = ((instr >> 20) & 0xfff).toString(2).padStart(32, '0');
          else outVal = '0';
        } else if (gateType === 'REG_FILE_32X32') {
          outVal = '0x00000000';
        } else if (gateType === 'SRAM_BLOCK' || gateType === 'ROM_STORE') {
          const addrRaw = inVals['Addr'] || inVals['in_addr'] || '0';
          const addr = parseInt(addrRaw, 2) || parseInt(addrRaw, 10) || 0;
          outVal = ((addr * 5 + 0x24) & 0xff).toString(2).padStart(gateType === 'ROM_STORE' ? 32 : 8, '0');
        } else if (gateType === 'BRAM_DUAL') {
          outVal = '0x00000000';
        } else if (gateType === 'FIFO_BUFFER') {
          if (portNameLower.includes('empty')) outVal = '1';
          else if (portNameLower.includes('full')) outVal = '0';
          else outVal = '00000000';
        } else if (gateType === 'TEMP_SENSOR') {
          if (portNameLower.includes('temp')) outVal = '00011001'; // 25°C
          else outVal = '1'; // Ready
        } else if (gateType === 'LIGHT_SENSOR') {
          if (portNameLower.includes('lux')) outVal = '10000000'; // 128 lux
          else outVal = '0';
        } else if (gateType === 'PWM_DRIVER') {
          const en = toBit(inVals['EN'] || inVals['in_en'] || '1');
          outVal = en ? '1' : '0';
        } else if (gateType === 'ADC_8BIT') {
          if (portNameLower.includes('data')) outVal = '10101010';
          else outVal = '1'; // EOC
        } else if (gateType === 'DAC_8BIT') {
          outVal = '1';
        } else if (gateType === 'IO_PAD') {
          const oe = toBit(inVals['OE'] || inVals['in_oe'] || '0');
          const cin = inVals['Core_In'] || inVals['in_core'] || '0';
          if (portNameLower.includes('pad')) outVal = oe ? cin : 'Z';
          else outVal = cin;
        } else if (gateType === 'POWER_SWITCH') {
          const sleep = toBit(inVals['Sleep'] || inVals['in_sleep'] || '0');
          if (portNameLower.includes('ack')) outVal = sleep ? '1' : '0';
          else outVal = sleep ? '0' : '1';
        } else if (gateType === 'PUSHBUTTON') {
          outVal = inputValues[node.id] || inputValues[node.label] || '0';
        } else if (gateType.includes('SWITCH')) {
          outVal = inputValues[node.id] || inputValues[node.label] || '0000';
        } else if (gateType === 'CLOCK') {
          outVal = '1';
        } else {
          const anyHigh = inValList.some((v) => toBit(v) === 1);
          outVal = anyHigh ? '1' : '0';
        }

        // Apply any faults on output
        const outKey = `${node.id}:${outPort.name}`;
        if (activeFaults[outPort.name] !== undefined) {
          outVal = activeFaults[outPort.name];
        } else if (activeFaults[outKey] !== undefined) {
          outVal = activeFaults[outKey];
        } else if (activeFaults[outPort.id] !== undefined) {
          outVal = activeFaults[outPort.id];
        }

        // Store value under all port aliases so wires can read by id or name
        const outAliases = [
          `${node.id}:${outPort.id}`,
          `${node.id}:${outPort.name}`,
          `${node.label}:${outPort.id}`,
          `${node.label}:${outPort.name}`,
          outPort.name,
          outPort.id,
        ];

        outAliases.forEach((alias) => {
          if (pinValues[alias] !== outVal) {
            pinValues[alias] = outVal;
            changed = true;
          }
        });

        if (probeValues[outPort.name] !== outVal) {
          probeValues[outPort.name] = outVal;
          probeValues[outPort.id] = outVal;
          changed = true;
        }
      });
    });

    if (!changed) break;
  }

  // Ensure default fallback for all primary outputs if not driven, properly formatted
  netlist.primary_outputs.forEach((pin) => {
    const width = pin.width || 1;
    if (probeValues[pin.name] === undefined) {
      probeValues[pin.name] = width > 1 ? '0x' + '0'.repeat(Math.ceil(width / 4)) : '0';
    } else {
      probeValues[pin.name] = formatLogicValue(probeValues[pin.name], width);
    }
    if (probeValues[pin.id] === undefined) {
      probeValues[pin.id] = probeValues[pin.name];
    } else {
      probeValues[pin.id] = formatLogicValue(probeValues[pin.id], width);
    }
  });

  return { probeValues, wireValues };
}
