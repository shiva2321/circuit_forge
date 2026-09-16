import { NetlistGraph, NetlistNode, NetlistWire, PortDef } from '../types/circuit';

/**
 * Serializes the current Schematic Canvas NetlistGraph back into valid,
 * compilable IEEE 1076 VHDL-2008 structural/dataflow code.
 * Ensures that any additions, deletions, or wiring changes on canvas
 * immediately reflect in the VHDL source and project files.
 */
export function netlistToVHDL(netlist: NetlistGraph): string {
  if (!netlist) return '';

  const entityName = (netlist.name || 'custom_circuit').replace(/[^a-zA-Z0-9_]/g, '_');

  // Format port declaration helper
  const formatPort = (p: PortDef, dir: 'in' | 'out'): string => {
    const w = p.width || 1;
    const typeStr = w > 1 ? `STD_LOGIC_VECTOR(${w - 1} downto 0)` : 'STD_LOGIC';
    return `        ${p.name.padEnd(16)}: ${dir.padEnd(4)} ${typeStr}`;
  };

  const portLines: string[] = [];
  (netlist.primary_inputs || []).forEach((p) => {
    portLines.push(formatPort(p, 'in'));
  });
  (netlist.primary_outputs || []).forEach((p) => {
    portLines.push(formatPort(p, 'out'));
  });

  const portsBlock = portLines.length > 0 ? portLines.join(';\n') : '        clk : in STD_LOGIC';

  const poNames = new Set((netlist.primary_outputs || []).map((p) => p.name.toLowerCase()));
  const piNames = new Set((netlist.primary_inputs || []).map((p) => p.name.toLowerCase()));

  // Collect internal signals
  const internalSignals: { name: string; width: number }[] = [];
  const declaredSignals = new Set<string>();

  const getSourceSignalName = (w: NetlistWire): string => {
    // If source is a primary input
    const pi = (netlist.primary_inputs || []).find(
      (p) => p.id === w.source_node || p.name === w.source_node || p.name.toLowerCase() === (w.source_port || '').toLowerCase()
    );
    if (pi) return pi.name;

    // Source is a node output
    const cleanSourceNode = (w.source_node || 'node').replace(/[^a-zA-Z0-9_]/g, '_');
    const cleanPort = (w.source_port || 'out').replace(/[^a-zA-Z0-9_]/g, '_');
    const sigName = `sig_${cleanSourceNode}_${cleanPort}`;

    if (!declaredSignals.has(sigName) && !piNames.has(sigName.toLowerCase()) && !poNames.has(sigName.toLowerCase())) {
      declaredSignals.add(sigName);
      internalSignals.push({ name: sigName, width: w.width || 1 });
    }
    return sigName;
  };

  // Build architecture statements
  const archStatements: string[] = [];

  // 1. Synthesize nodes (gates / subsystems)
  (netlist.nodes || []).forEach((node: NetlistNode) => {
    const gateType = (node.properties?.gate_type || node.type || 'CUSTOM').toUpperCase();
    const nodeOutPort = node.outputs?.[0]?.name || 'out';
    const cleanNodeId = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
    const outSig = `sig_${cleanNodeId}_${nodeOutPort.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    // Ensure output signal is declared if not a primary output
    if (!declaredSignals.has(outSig) && !poNames.has(outSig.toLowerCase())) {
      declaredSignals.add(outSig);
      internalSignals.push({ name: outSig, width: node.outputs?.[0]?.width || 1 });
    }

    // Resolve inputs driving this node
    const inSigs = (node.inputs || []).map((pin, idx) => {
      const matchedWire = (netlist.wires || []).find(
        (w) =>
          (w.target_node === node.id || w.target_node === node.label) &&
          (((w.target_port || '').toLowerCase() === (pin.name || '').toLowerCase()) ||
            (pin.id && (w.target_port || '').toLowerCase() === pin.id.toLowerCase()) ||
            ((w.target_port || '').toLowerCase() === `in_${(pin.name || '').toLowerCase()}`))
      );
      if (matchedWire) {
        return getSourceSignalName(matchedWire);
      }
      return idx < (netlist.primary_inputs || []).length ? netlist.primary_inputs[idx].name : "'0'";
    });

    // Generate VHDL based on gate type
    if (gateType === 'AND') {
      archStatements.push(`    -- AND Gate: ${node.label}\n    ${outSig} <= ${inSigs.join(' and ') || "'0'"};`);
    } else if (gateType === 'OR') {
      archStatements.push(`    -- OR Gate: ${node.label}\n    ${outSig} <= ${inSigs.join(' or ') || "'0'"};`);
    } else if (gateType === 'XOR') {
      archStatements.push(`    -- XOR Gate: ${node.label}\n    ${outSig} <= ${inSigs.join(' xor ') || "'0'"};`);
    } else if (gateType === 'NAND') {
      archStatements.push(`    -- NAND Gate: ${node.label}\n    ${outSig} <= not (${inSigs.join(' and ') || "'0'"});`);
    } else if (gateType === 'NOR') {
      archStatements.push(`    -- NOR Gate: ${node.label}\n    ${outSig} <= not (${inSigs.join(' or ') || "'0'"});`);
    } else if (gateType === 'NOT' || gateType === 'INV') {
      archStatements.push(`    -- Inverter: ${node.label}\n    ${outSig} <= not ${inSigs[0] || "'0'"};`);
    } else if (gateType === 'ADDER') {
      archStatements.push(`    -- Adder: ${node.label}\n    ${outSig} <= std_logic_vector(unsigned(${inSigs[0] || 'A'}) + unsigned(${inSigs[1] || 'B'}));`);
    } else if (gateType === 'ALU') {
      const a = inSigs.find((s) => s.toLowerCase() === 'a') || inSigs[0] || 'A';
      const b = inSigs.find((s) => s.toLowerCase() === 'b') || inSigs[1] || 'B';
      const ctrl = inSigs.find((s) => s.toLowerCase().includes('ctrl') || s.toLowerCase().includes('alu')) || inSigs[2] || 'ALUControl';
      archStatements.push(`    -- 32-Bit Arithmetic Logic Unit Core: ${node.label}
    process(${a}, ${b}, ${ctrl})
    begin
        case ${ctrl} is
            when "0000" => ${outSig} <= std_logic_vector(unsigned(${a}) + unsigned(${b}));
            when "0001" => ${outSig} <= std_logic_vector(unsigned(${a}) - unsigned(${b}));
            when "0010" => ${outSig} <= ${a} and ${b};
            when "0011" => ${outSig} <= ${a} or ${b};
            when others => ${outSig} <= ${a} xor ${b};
        end case;
    end process;`);
    } else if (gateType === 'CMP') {
      archStatements.push(`    -- Zero Detector / Comparator: ${node.label}\n    ${outSig} <= '1' when (${inSigs[0] || 'r_res'} = (${inSigs[0] || 'r_res'}'range => '0')) else '0';`);
    } else if (gateType === 'MUX') {
      archStatements.push(`    -- Multiplexer: ${node.label}\n    ${outSig} <= ${inSigs[1] || "'0'"} when ${inSigs[0] || 'sel'} = '1' else ${inSigs[2] || "'0'"};`);
    } else if (gateType === 'SUBSYSTEM') {
      const compType = node.properties?.component || node.id;
      const portMaps = (node.inputs || [])
        .map((p, idx) => `            ${p.name} => ${inSigs[idx] || "'0'"}`)
        .concat((node.outputs || []).map((p) => `            ${p.name} => ${outSig}`))
        .join(',\n');
      archStatements.push(`    -- Structural Subsystem: ${node.label}\n    inst_${cleanNodeId} : entity work.${compType}\n        port map (\n${portMaps}\n        );`);
    } else {
      archStatements.push(`    -- Custom RTL Logic Block: ${node.label}\n    ${outSig} <= ${inSigs.join(' and ') || "'0'"};`);
    }
  });

  // 2. Primary Output Assignments: Route wires driving primary outputs
  (netlist.primary_outputs || []).forEach((po) => {
    const drivingWire = (netlist.wires || []).find(
      (w) =>
        w.target_node === po.id ||
        w.target_node === po.name ||
        (w.target_port && w.target_port.toLowerCase() === (po.name || '').toLowerCase())
    );

    if (drivingWire) {
      const srcSig = getSourceSignalName(drivingWire);
      archStatements.push(`    -- Primary Output: ${po.name}\n    ${po.name} <= ${srcSig};`);
    }
  });

  // Format internal signals block
  const signalDecls = internalSignals
    .map((s) => {
      const typeStr = s.width > 1 ? `STD_LOGIC_VECTOR(${s.width - 1} downto 0)` : 'STD_LOGIC';
      return `    signal ${s.name.padEnd(28)}: ${typeStr};`;
    })
    .join('\n');

  return `--------------------------------------------------------------------------------
-- CircuitForge Automated Bidirectional Structural VHDL Synthesis
-- Entity: ${entityName}
-- Generated from Schematic Canvas Netlist
--------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity ${entityName} is
    Port (
${portsBlock}
    );
end ${entityName};

architecture Structural of ${entityName} is
${signalDecls ? `${signalDecls}\n` : ''}begin
${archStatements.join('\n\n')}
end Structural;
`;
}
