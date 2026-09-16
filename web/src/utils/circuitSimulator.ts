import { NetlistGraph, NetlistNode, NetlistWire } from '../types/circuit';

export interface SimulationState {
  probeValues: Record<string, string>;
  wireValues: Record<string, string>;
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
        const matchedPort = tgtNode.inputs.find(
          (p) =>
            p.id === wire.target_port ||
            p.name === wire.target_port ||
            p.id.toLowerCase() === wire.target_port.toLowerCase() ||
            p.name.toLowerCase() === wire.target_port.toLowerCase()
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

      node.outputs.forEach((outPort) => {
        let outVal = '0';

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
        } else if (gateType === 'BUF' || gateType === 'BUFFER') {
          outVal = inValList[0] || '0';
        } else if (gateType === 'MUX') {
          const sel = toBit(inVals['sel'] || inVals['S'] || inValList[2] || '0');
          const d0 = inVals['in0'] || inVals['A'] || inValList[0] || '0';
          const d1 = inVals['in1'] || inVals['B'] || inValList[1] || '0';
          outVal = sel === 1 ? d1 : d0;
        } else if (gateType === 'DFF' || gateType === 'REGISTER') {
          const d = inVals['D'] || inVals['d'] || inValList[0] || '0';
          outVal = d;
        } else {
          // Complex or arithmetic blocks
          const lowerName = (node.label || node.id).toLowerCase();
          if (lowerName.includes('adder') || gateType.includes('ADDER')) {
            const a = toBit(inVals['A'] || inVals['a'] || inValList[0] || '0');
            const b = toBit(inVals['B'] || inVals['b'] || inValList[1] || '0');
            const cin = toBit(inVals['Cin'] || inVals['cin'] || inValList[2] || '0');
            if (outPort.name.toLowerCase().includes('cout') || outPort.name.toLowerCase().includes('carry')) {
              outVal = (a & b) | (cin & (a ^ b)) ? '1' : '0';
            } else {
              outVal = a ^ b ^ cin ? '1' : '0';
            }
          } else if (lowerName.includes('shift') || node.inputs.some((p) => p.name.includes('shift'))) {
            const a = toBit(inVals['A'] || inValList[0] || '0');
            outVal = a ? '1' : '0';
          } else if (lowerName.includes('encoder') || gateType.includes('ENCODER')) {
            let highestIdx = -1;
            inValList.forEach((v, idx) => {
              if (toBit(v) === 1) highestIdx = idx;
            });
            if (outPort.name.toLowerCase().includes('valid')) {
              outVal = highestIdx >= 0 ? '1' : '0';
            } else {
              outVal = highestIdx >= 0 ? String(highestIdx) : '0';
            }
          } else {
            const anyHigh = inValList.some((v) => toBit(v) === 1);
            outVal = anyHigh ? '1' : '0';
          }
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

  // Ensure default fallback '0' for all primary outputs if not driven
  netlist.primary_outputs.forEach((pin) => {
    if (probeValues[pin.name] === undefined) {
      probeValues[pin.name] = '0';
    }
    if (probeValues[pin.id] === undefined) {
      probeValues[pin.id] = probeValues[pin.name];
    }
  });

  return { probeValues, wireValues };
}
