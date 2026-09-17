import { NetlistGraph, NetlistNode, NetlistWire, PortDef } from '../types/circuit';

/**
 * Sanitizes signal and port identifiers to prevent recursive naming bloat
 * (e.g. sig_node_sig_node_...) across bidirectional canvas-code sync cycles.
 */
export function sanitizeSignalName(raw: string, fallback = 'sig_net'): string {
  if (!raw) return fallback;
  let s = raw.trim();
  // Strip repeated sig_, node_, out_, in_ prefixes
  s = s.replace(/^(?:sig_|node_|out_|in_)+/gi, '');
  const tokens = s.split(/[^a-zA-Z0-9]/).filter((t) => t.length > 0);
  // Filter out noise tokens ('sig', 'node', 'out', 'in')
  const cleanTokens = tokens.filter((t) => !/^(sig|node|out|in)$/i.test(t));
  if (cleanTokens.length === 0) return fallback;

  const uniqueTokens: string[] = [];
  for (const t of cleanTokens) {
    if (!uniqueTokens.some((u) => u.toLowerCase() === t.toLowerCase())) {
      const isGate =
        uniqueTokens.length > 0 &&
        /^(and|or|xor|xnor|nand|nor|not|inv|buf|adder|sub|mux|dff|reg|latch|alu|cmp)$/i.test(uniqueTokens[0]);
      if (/^\d+$/.test(t) && uniqueTokens.length > 0 && !isGate) continue;
      uniqueTokens.push(t);
    }
  }
  let res = uniqueTokens.join('_');
  if (/^[0-9]/.test(res)) res = `s_${res}`;
  return res || fallback;
}

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

  const norm = (s: string = '') => s.toLowerCase().replace(/^(in_|out_|sig_|s_)/, '').trim();

  const poNames = new Set((netlist.primary_outputs || []).map((p) => p.name.toLowerCase()));
  const piNames = new Set((netlist.primary_inputs || []).map((p) => p.name.toLowerCase()));
  const poMap = new Map((netlist.primary_outputs || []).map((p) => [p.name.toLowerCase(), p.name]));
  const piMap = new Map((netlist.primary_inputs || []).map((p) => [p.name.toLowerCase(), p.name]));

  // Pre-resolve output signals for each node (handling multi-output components properly)
  const nodeOutputSignals = new Map<string, string>();
  const directlyDrivenOutputs = new Set<string>();
  const internalSignals: { name: string; width: number }[] = [];
  const declaredSignals = new Set<string>();

  (netlist.nodes || []).forEach((node: NetlistNode) => {
    const cleanNodeId = sanitizeSignalName(node.id, 'gate');
    const outputs = node.outputs || [];

    if (outputs.length === 0) return;

    outputs.forEach((outPort, pIdx) => {
      // Check if this specific output port drives a primary output
      const drivesPoWire = (netlist.wires || []).find((w) => {
        const isSource =
          w.source_node === node.id ||
          norm(w.source_node) === norm(node.id) ||
          (node.label && (w.source_node === node.label || norm(w.source_node) === norm(node.label)));
        if (!isSource) return false;

        if (outputs.length > 1 && w.source_port) {
          const portMatch =
            w.source_port === outPort.id ||
            w.source_port === outPort.name ||
            norm(w.source_port) === norm(outPort.name) ||
            norm(w.source_port) === norm(outPort.id);
          if (!portMatch) return false;
        }

        return (
          poNames.has(w.target_node.toLowerCase()) ||
          poNames.has(norm(w.target_node)) ||
          (w.target_port && (poNames.has(w.target_port.toLowerCase()) || poNames.has(norm(w.target_port)))) ||
          (netlist.primary_outputs || []).some((po) => po.id === w.target_node || norm(po.name) === norm(w.target_node))
        );
      });

      const targetSigLower = (node.properties?.target_signal || '').toLowerCase();
      const isTargetPo = (outputs.length === 1 || pIdx === 0) && (poNames.has(targetSigLower) || poNames.has(norm(targetSigLower)));
      const portNameLower = (outPort.name || '').toLowerCase();
      const isOutPortPo = poNames.has(portNameLower) || poNames.has(norm(portNameLower));

      let assignedSig = '';
      if (drivesPoWire) {
        const matchedPo = (netlist.primary_outputs || []).find(
          (p) =>
            p.id === drivesPoWire.target_node ||
            p.name.toLowerCase() === drivesPoWire.target_node.toLowerCase() ||
            norm(p.name) === norm(drivesPoWire.target_node) ||
            (drivesPoWire.target_port && (p.name.toLowerCase() === drivesPoWire.target_port.toLowerCase() || norm(p.name) === norm(drivesPoWire.target_port)))
        );
        if (matchedPo) {
          assignedSig = matchedPo.name;
          directlyDrivenOutputs.add(matchedPo.name.toLowerCase());
        }
      } else if (isTargetPo) {
        assignedSig = poMap.get(targetSigLower) || poMap.get(norm(targetSigLower)) || node.properties?.target_signal!;
        directlyDrivenOutputs.add(targetSigLower);
      } else if (isOutPortPo) {
        assignedSig = poMap.get(portNameLower) || poMap.get(norm(portNameLower)) || outPort.name;
        directlyDrivenOutputs.add(portNameLower);
      }

      if (!assignedSig) {
        if (
          outputs.length === 1 &&
          node.properties?.target_signal &&
          !piNames.has(node.properties.target_signal.toLowerCase()) &&
          !poNames.has(node.properties.target_signal.toLowerCase())
        ) {
          assignedSig = sanitizeSignalName(node.properties.target_signal);
        } else if (
          outputs.length === 1 &&
          outPort.name &&
          !['out', 'y', 'q', 'result', 'out_0', 'out_y'].includes(outPort.name.toLowerCase())
        ) {
          assignedSig = sanitizeSignalName(outPort.name);
        } else {
          const suffix = outputs.length > 1 ? `_${sanitizeSignalName(outPort.name)}` : '';
          const base = cleanNodeId.startsWith('s_') || cleanNodeId.startsWith('sig_') ? cleanNodeId : (cleanNodeId.length <= 4 ? `s_${cleanNodeId}` : `sig_${cleanNodeId}`);
          assignedSig = `${base}${suffix}`;
        }

        if (
          !declaredSignals.has(assignedSig) &&
          !poNames.has(assignedSig.toLowerCase()) &&
          !piNames.has(assignedSig.toLowerCase())
        ) {
          declaredSignals.add(assignedSig);
          internalSignals.push({ name: assignedSig, width: outPort.width || 1 });
        }
      }

      nodeOutputSignals.set(`${node.id}:${outPort.id}`, assignedSig);
      nodeOutputSignals.set(`${node.id}:${outPort.name}`, assignedSig);
      nodeOutputSignals.set(`${node.id}:${outPort.id.toLowerCase()}`, assignedSig);
      nodeOutputSignals.set(`${node.id}:${outPort.name.toLowerCase()}`, assignedSig);
      nodeOutputSignals.set(`${norm(node.id)}:${norm(outPort.id)}`, assignedSig);
      nodeOutputSignals.set(`${norm(node.id)}:${norm(outPort.name)}`, assignedSig);

      if (node.label) {
        nodeOutputSignals.set(`${node.label}:${outPort.id}`, assignedSig);
        nodeOutputSignals.set(`${node.label}:${outPort.name}`, assignedSig);
        nodeOutputSignals.set(`${node.label}:${outPort.id.toLowerCase()}`, assignedSig);
        nodeOutputSignals.set(`${node.label}:${outPort.name.toLowerCase()}`, assignedSig);
      }

      if (pIdx === 0) {
        nodeOutputSignals.set(node.id, assignedSig);
        nodeOutputSignals.set(node.id.toLowerCase(), assignedSig);
        nodeOutputSignals.set(norm(node.id), assignedSig);
        if (node.label) {
          nodeOutputSignals.set(node.label, assignedSig);
          nodeOutputSignals.set(node.label.toLowerCase(), assignedSig);
          nodeOutputSignals.set(norm(node.label), assignedSig);
        }
      }
    });
  });

  const getSourceSignalName = (w: NetlistWire): string => {
    // Check primary input
    const pi = (netlist.primary_inputs || []).find(
      (p) =>
        p.id === w.source_node ||
        p.name.toLowerCase() === w.source_node.toLowerCase() ||
        norm(p.name) === norm(w.source_node)
    );
    if (pi) return pi.name;

    // Check driving node with port specificity
    if (w.source_port) {
      const portKey = `${w.source_node}:${w.source_port}`;
      const portKeyLower = `${w.source_node.toLowerCase()}:${w.source_port.toLowerCase()}`;
      const portKeyNorm = `${norm(w.source_node)}:${norm(w.source_port)}`;
      const srcPortSig =
        nodeOutputSignals.get(portKey) ||
        nodeOutputSignals.get(portKeyLower) ||
        nodeOutputSignals.get(portKeyNorm);
      if (srcPortSig) return srcPortSig;
    }

    // Check driving node general output
    const srcSig =
      nodeOutputSignals.get(w.source_node) ||
      nodeOutputSignals.get(w.source_node.toLowerCase()) ||
      nodeOutputSignals.get(norm(w.source_node));
    if (srcSig) return srcSig;

    // Explicit wire label fallback
    if (w.label && !w.label.includes('_to_')) {
      const cleanLabel = sanitizeSignalName(w.label);
      if (
        !declaredSignals.has(cleanLabel) &&
        !poNames.has(cleanLabel.toLowerCase()) &&
        !piNames.has(cleanLabel.toLowerCase())
      ) {
        declaredSignals.add(cleanLabel);
        internalSignals.push({ name: cleanLabel, width: w.width || 1 });
      }
      return cleanLabel;
    }

    const cleanSourceNode = sanitizeSignalName(w.source_node || 'node');
    const cleanSig =
      cleanSourceNode.startsWith('s_') || cleanSourceNode.startsWith('sig_')
        ? cleanSourceNode
        : `sig_${cleanSourceNode}`;
    if (
      !declaredSignals.has(cleanSig) &&
      !poNames.has(cleanSig.toLowerCase()) &&
      !piNames.has(cleanSig.toLowerCase())
    ) {
      declaredSignals.add(cleanSig);
      internalSignals.push({ name: cleanSig, width: w.width || 1 });
    }
    return cleanSig;
  };

  // Build architecture statements
  const archStatements: string[] = [];

  // 1. Synthesize nodes (gates / subsystems / silicon primitives)
  (netlist.nodes || []).forEach((node: NetlistNode) => {
    const gateType = (node.properties?.gate_type || node.type || 'CUSTOM').toUpperCase();
    const cleanNodeId = sanitizeSignalName(node.id);

    // Resolve inputs driving this node
    const inSigs = (node.inputs || []).map((pin) => {
      const matchedWire = (netlist.wires || []).slice().reverse().find((w) => {
        const targetNodeMatch =
          w.target_node === node.id ||
          w.target_node === node.label ||
          norm(w.target_node) === norm(node.id) ||
          (node.label && norm(w.target_node) === norm(node.label));

        if (!targetNodeMatch) return false;

        const wirePortNorm = norm(w.target_port);
        const pinNameNorm = norm(pin.name);
        const pinIdNorm = norm(pin.id);

        return (
          wirePortNorm === pinNameNorm ||
          wirePortNorm === pinIdNorm ||
          (w.target_port || '').toLowerCase() === (pin.name || '').toLowerCase() ||
          (w.target_port || '').toLowerCase() === (pin.id || '').toLowerCase()
        );
      });

      if (matchedWire) {
        return getSourceSignalName(matchedWire);
      }
      if (pin.name.toLowerCase() === 'clk' || pin.name.toLowerCase() === 'clock') return 'clk';
      if ((pin.width || 1) > 1) return `(others => '0')`;
      return "'0'";
    });

    // Helpers to access specific input & output signals by port name
    const getIn = (portNameOrId: string, fallbackIdx = 0): string => {
      const idx = (node.inputs || []).findIndex(
        (p) =>
          p.name.toLowerCase() === portNameOrId.toLowerCase() ||
          p.id.toLowerCase() === portNameOrId.toLowerCase() ||
          norm(p.name) === norm(portNameOrId) ||
          norm(p.id) === norm(portNameOrId)
      );
      if (idx >= 0 && inSigs[idx]) return inSigs[idx];
      return inSigs[fallbackIdx] || "'0'";
    };

    const getOut = (portNameOrId: string, fallbackIdx = 0): string => {
      const port = (node.outputs || []).find(
        (p) =>
          p.name.toLowerCase() === portNameOrId.toLowerCase() ||
          p.id.toLowerCase() === portNameOrId.toLowerCase() ||
          norm(p.name) === norm(portNameOrId) ||
          norm(p.id) === norm(portNameOrId)
      ) || node.outputs?.[fallbackIdx];

      if (port) {
        return (
          nodeOutputSignals.get(`${node.id}:${port.id}`) ||
          nodeOutputSignals.get(`${node.id}:${port.name}`) ||
          nodeOutputSignals.get(node.id) ||
          sanitizeSignalName(`${node.id}_${port.name}`)
        );
      }
      return nodeOutputSignals.get(node.id) || sanitizeSignalName(node.id);
    };

    const outSig = getOut('out', 0);

    // Generate VHDL based on component / gate type
    if (gateType === 'AND') {
      archStatements.push(`    -- AND Gate: ${node.label}\n    ${outSig} <= ${inSigs.join(' and ') || "'0'"};`);
    } else if (gateType === 'OR') {
      archStatements.push(`    -- OR Gate: ${node.label}\n    ${outSig} <= ${inSigs.join(' or ') || "'0'"};`);
    } else if (gateType === 'XOR') {
      archStatements.push(`    -- XOR Gate: ${node.label}\n    ${outSig} <= ${inSigs.join(' xor ') || "'0'"};`);
    } else if (gateType === 'XNOR') {
      archStatements.push(`    -- XNOR Gate: ${node.label}\n    ${outSig} <= not (${inSigs.join(' xor ') || "'0'"});`);
    } else if (gateType === 'NAND') {
      archStatements.push(`    -- NAND Gate: ${node.label}\n    ${outSig} <= not (${inSigs.join(' and ') || "'0'"});`);
    } else if (gateType === 'NOR') {
      archStatements.push(`    -- NOR Gate: ${node.label}\n    ${outSig} <= not (${inSigs.join(' or ') || "'0'"});`);
    } else if (gateType === 'NOT' || gateType === 'INV') {
      archStatements.push(`    -- Inverter: ${node.label}\n    ${outSig} <= not ${inSigs[0] || "'0'"};`);
    } else if (gateType === 'BUF' || gateType === 'BUFFER' || gateType === 'CLK_TREE_BUF') {
      archStatements.push(`    -- Buffer / CTS Driver: ${node.label}\n    ${outSig} <= ${inSigs[0] || "'0'"};`);
    } else if (gateType === 'TRISTATE') {
      const d = getIn('D', 0);
      const oe = getIn('OE', 1);
      archStatements.push(`    -- Tri-State Bus Driver: ${node.label}\n    ${outSig} <= ${d} when ${oe} = '1' else 'Z';`);
    } else if (gateType === 'ADDER' || gateType === 'ADD') {
      const a = getIn('A', 0);
      const b = getIn('B', 1);
      const cin = getIn('Cin', 2);
      const sumSig = getOut('Sum', 0);
      const coutSig = getOut('Cout', 1);
      if (node.outputs && node.outputs.length > 1) {
        archStatements.push(`    -- 1-Bit Full Adder: ${node.label}\n    ${sumSig} <= ${a} xor ${b} xor ${cin};\n    ${coutSig} <= (${a} and ${b}) or (${cin} and (${a} xor ${b}));`);
      } else {
        archStatements.push(`    -- Adder: ${node.label}\n    ${outSig} <= std_logic_vector(unsigned(${a}) + unsigned(${b}));`);
      }
    } else if (gateType === 'HALF_ADDER') {
      const a = getIn('A', 0);
      const b = getIn('B', 1);
      const sumSig = getOut('Sum', 0);
      const cSig = getOut('Carry', 1);
      archStatements.push(`    -- Half Adder: ${node.label}\n    ${sumSig} <= ${a} xor ${b};\n    ${cSig} <= ${a} and ${b};`);
    } else if (gateType === 'SUBTRACTOR' || gateType === 'SUB' || gateType === 'SUBTRACTOR8') {
      const a = getIn('A', 0);
      const b = getIn('B', 1);
      const diffSig = getOut('Diff', 0);
      const borrowSig = getOut('Borrow', 1);
      if (node.outputs && node.outputs.length > 1) {
        archStatements.push(`    -- Subtractor with Borrow: ${node.label}\n    ${diffSig} <= std_logic_vector(unsigned(${a}) - unsigned(${b}));\n    ${borrowSig} <= '1' when unsigned(${a}) < unsigned(${b}) else '0';`);
      } else {
        archStatements.push(`    -- Subtractor: ${node.label}\n    ${outSig} <= std_logic_vector(unsigned(${a}) - unsigned(${b}));`);
      }
    } else if (gateType === 'MULTIPLIER8' || gateType === 'MULTIPLIER') {
      const a = getIn('A', 0);
      const b = getIn('B', 1);
      archStatements.push(`    -- 8-Bit Hardware Multiplier: ${node.label}\n    ${outSig} <= std_logic_vector(unsigned(${a}) * unsigned(${b}));`);
    } else if (gateType === 'MUX') {
      const d0 = getIn('D0', 0);
      const d1 = getIn('D1', 1);
      const sel = getIn('Sel', 2);
      archStatements.push(`    -- 2:1 Multiplexer: ${node.label}\n    ${outSig} <= ${d1} when ${sel} = '1' else ${d0};`);
    } else if (gateType === 'MUX4') {
      const d0 = getIn('D0', 0);
      const d1 = getIn('D1', 1);
      const d2 = getIn('D2', 2);
      const d3 = getIn('D3', 3);
      const sel = getIn('Sel', 4);
      archStatements.push(`    -- 4:1 Multiplexer: ${node.label}
    with ${sel} select
        ${outSig} <= ${d0} when "00",
                    ${d1} when "01",
                    ${d2} when "10",
                    ${d3} when others;`);
    } else if (gateType === 'MUX8') {
      const sel = getIn('Sel', 8);
      archStatements.push(`    -- 8:1 Multiplexer: ${node.label}
    with ${sel} select
        ${outSig} <= ${getIn('D0', 0)} when "000",
                    ${getIn('D1', 1)} when "001",
                    ${getIn('D2', 2)} when "010",
                    ${getIn('D3', 3)} when "011",
                    ${getIn('D4', 4)} when "100",
                    ${getIn('D5', 5)} when "101",
                    ${getIn('D6', 6)} when "110",
                    ${getIn('D7', 7)} when others;`);
    } else if (gateType === 'DEMUX4') {
      const d = getIn('D', 0);
      const sel = getIn('Sel', 1);
      archStatements.push(`    -- 1:4 Demultiplexer: ${node.label}
    ${getOut('Y0', 0)} <= ${d} when ${sel} = "00" else '0';
    ${getOut('Y1', 1)} <= ${d} when ${sel} = "01" else '0';
    ${getOut('Y2', 2)} <= ${d} when ${sel} = "10" else '0';
    ${getOut('Y3', 3)} <= ${d} when ${sel} = "11" else '0';`);
    } else if (gateType === 'DECODER_3TO8') {
      const en = getIn('EN', 0);
      const sel = getIn('A', 1);
      archStatements.push(`    -- 3-to-8 Decoder: ${node.label}
    process(${en}, ${sel})
    begin
        if ${en} = '1' then
            case ${sel} is
                when "000" => ${outSig} <= "00000001";
                when "001" => ${outSig} <= "00000010";
                when "010" => ${outSig} <= "00000100";
                when "011" => ${outSig} <= "00001000";
                when "100" => ${outSig} <= "00010000";
                when "101" => ${outSig} <= "00100000";
                when "110" => ${outSig} <= "01000000";
                when others => ${outSig} <= "10000000";
            end case;
        else
            ${outSig} <= (others => '0');
        end if;
    end process;`);
    } else if (gateType === 'DFF' || gateType === 'FLIPFLOP') {
      const d = getIn('D', 0);
      const clk = getIn('CLK', 1);
      const rst = getIn('RST', 2);
      const qSig = getOut('Q', 0);
      const qnSig = node.outputs && node.outputs.length > 1 ? getOut('Q#', 1) : '';
      archStatements.push(`    -- D Flip-Flop: ${node.label}
    process(${clk}, ${rst})
    begin
        if ${rst} = '1' then
            ${qSig} <= '0';
        elsif rising_edge(${clk}) then
            ${qSig} <= ${d};
        end if;
    end process;${qnSig ? `\n    ${qnSig} <= not ${qSig};` : ''}`);
    } else if (gateType === 'TFF') {
      const t = getIn('T', 0);
      const clk = getIn('CLK', 1);
      const rst = getIn('RST', 2);
      archStatements.push(`    -- Toggle Flip-Flop: ${node.label}
    process(${clk}, ${rst})
    begin
        if ${rst} = '1' then
            ${outSig} <= '0';
        elsif rising_edge(${clk}) then
            if ${t} = '1' then
                ${outSig} <= not ${outSig};
            end if;
        end if;
    end process;`);
    } else if (gateType === 'JKFF') {
      const j = getIn('J', 0);
      const k = getIn('K', 1);
      const clk = getIn('CLK', 2);
      const rst = getIn('RST', 3);
      archStatements.push(`    -- JK Flip-Flop: ${node.label}
    process(${clk}, ${rst})
    begin
        if ${rst} = '1' then
            ${outSig} <= '0';
        elsif rising_edge(${clk}) then
            if ${j} = '1' and ${k} = '1' then
                ${outSig} <= not ${outSig};
            elsif ${j} = '1' then
                ${outSig} <= '1';
            elsif ${k} = '1' then
                ${outSig} <= '0';
            end if;
        end if;
    end process;`);
    } else if (gateType === 'REG' || gateType === 'REGISTER') {
      const d = getIn('D', 0);
      const clk = getIn('CLK', 1);
      const en = getIn('EN', 2);
      const rst = getIn('RST', 3);
      archStatements.push(`    -- Register with Enable: ${node.label}
    process(${clk}, ${rst})
    begin
        if ${rst} = '1' then
            ${outSig} <= (others => '0');
        elsif rising_edge(${clk}) then
            if ${en} = '1' then
                ${outSig} <= ${d};
            end if;
        end if;
    end process;`);
    } else if (gateType === 'SHIFT_REG8') {
      const clk = getIn('CLK', 0);
      const rst = getIn('RST', 1);
      const sin = getIn('Sin', 2);
      const din = getIn('Din', 3);
      const load = getIn('Load', 4);
      const qSig = getOut('Q', 0);
      const soutSig = getOut('Sout', 1);
      archStatements.push(`    -- 8-Bit Shift Register: ${node.label}
    process(${clk}, ${rst})
    begin
        if ${rst} = '1' then
            ${qSig} <= (others => '0');
        elsif rising_edge(${clk}) then
            if ${load} = '1' then
                ${qSig} <= ${din};
            else
                ${qSig} <= ${qSig}(6 downto 0) & ${sin};
            end if;
        end if;
    end process;
    ${soutSig} <= ${qSig}(7);`);
    } else if (gateType === 'COUNTER') {
      const clk = getIn('CLK', 0);
      const rst = getIn('RST', 1);
      const en = getIn('EN', 2);
      const cntSig = getOut('count', 0);
      const tcSig = getOut('tc', 1);
      archStatements.push(`    -- 8-Bit Synchronous Counter: ${node.label}
    process(${clk}, ${rst})
    begin
        if ${rst} = '1' then
            ${cntSig} <= (others => '0');
        elsif rising_edge(${clk}) then
            if ${en} = '1' then
                ${cntSig} <= std_logic_vector(unsigned(${cntSig}) + 1);
            end if;
        end if;
    end process;
    ${tcSig} <= '1' when ${cntSig} = x"FF" else '0';`);
    } else if (gateType === 'CLK_DIVIDER') {
      const clk = getIn('CLK_IN', 0);
      const rst = getIn('RST', 1);
      const div2 = getOut('DIV2', 0);
      const div4 = getOut('DIV4', 1);
      const div8 = getOut('DIV8', 2);
      archStatements.push(`    -- Clock Prescaler / Frequency Divider: ${node.label}
    process(${clk}, ${rst})
        variable count : unsigned(2 downto 0) := (others => '0');
    begin
        if ${rst} = '1' then
            count := (others => '0');
            ${div2} <= '0';
            ${div4} <= '0';
            ${div8} <= '0';
        elsif rising_edge(${clk}) then
            count := count + 1;
            ${div2} <= count(0);
            ${div4} <= count(1);
            ${div8} <= count(2);
        end if;
    end process;`);
    } else if (gateType === 'LATCH') {
      const d = inSigs[0] || "'0'";
      const en = inSigs[1] || 'en';
      archStatements.push(`    -- Transparent Latch: ${node.label}
    process(${en}, ${d})
    begin
        if ${en} = '1' then
            ${outSig} <= ${d};
        end if;
    end process;`);
    } else if (gateType === 'ALU') {
      const a = getIn('A', 0);
      const b = getIn('B', 1);
      const ctrl = getIn('ALUControl', 2);
      const resSig = getOut('Result', 0);
      const zeroSig = getOut('Zero', 1);
      const ovfSig = getOut('Overflow', 2);
      archStatements.push(`    -- 32-Bit Arithmetic Logic Unit: ${node.label}
    process(${a}, ${b}, ${ctrl})
    begin
        case ${ctrl} is
            when "0000" => ${resSig} <= std_logic_vector(unsigned(${a}) + unsigned(${b}));
            when "0001" => ${resSig} <= std_logic_vector(unsigned(${a}) - unsigned(${b}));
            when "0010" => ${resSig} <= ${a} and ${b};
            when "0011" => ${resSig} <= ${a} or ${b};
            when others => ${resSig} <= ${a} xor ${b};
        end case;
    end process;
    ${zeroSig} <= '1' when ${resSig} = (31 downto 0 => '0') else '0';
    ${ovfSig}  <= '0';`);
    } else if (gateType === 'CMP' || gateType === 'COMPARATOR') {
      const a = getIn('A', 0);
      const b = getIn('B', 1);
      const eqSig = getOut('EQ', 0);
      const gtSig = getOut('GT', 1);
      const ltSig = getOut('LT', 2);
      archStatements.push(`    -- 8-Bit Magnitude Comparator: ${node.label}
    ${eqSig} <= '1' when unsigned(${a}) = unsigned(${b}) else '0';
    ${gtSig} <= '1' when unsigned(${a}) > unsigned(${b}) else '0';
    ${ltSig} <= '1' when unsigned(${a}) < unsigned(${b}) else '0';`);
    } else if (gateType === 'SEVEN_SEG') {
      const hexIn = getIn('HexIn', 0);
      const segOut = getOut('Seg', 0);
      archStatements.push(`    -- 7-Segment Hexadecimal Display Decoder: ${node.label}
    with ${hexIn} select
        ${segOut} <= "0111111" when "0000", -- 0
                    "0000110" when "0001", -- 1
                    "1011011" when "0010", -- 2
                    "1001111" when "0011", -- 3
                    "1100110" when "0100", -- 4
                    "1101101" when "0101", -- 5
                    "1111101" when "0110", -- 6
                    "0000111" when "0111", -- 7
                    "1111111" when "1000", -- 8
                    "1101111" when "1001", -- 9
                    "1110111" when "1010", -- A
                    "1111100" when "1011", -- b
                    "0111001" when "1100", -- C
                    "1011110" when "1101", -- d
                    "1111001" when "1110", -- E
                    "1110001" when others; -- F`);
    } else if (gateType === 'RGB_LED') {
      archStatements.push(`    -- RGB LED Visual Display Indicator: ${node.label} (R=${getIn('R', 0)}, G=${getIn('G', 1)}, B=${getIn('B', 2)})`);
    } else if (gateType.includes('RISCV') || gateType.includes('PROCESSOR')) {
      const clk = getIn('CLK', 0);
      const rst = getIn('RST', 1);
      const instr = getIn('Instr', 2);
      const dmemIn = getIn('DMem_In', 3);
      const pc = getOut('PC', 0);
      const daddr = getOut('DMem_Addr', 1);
      const dout = getOut('DMem_Out', 2);
      const dwe = getOut('DMem_WE', 3);
      archStatements.push(`    -- RISC-V RV32I Processor Execution Core: ${node.label}
    inst_${cleanNodeId} : entity work.riscv_core
        port map (
            clk       => ${clk},
            rst       => ${rst},
            instr     => ${instr},
            dmem_in   => ${dmemIn},
            pc        => ${pc},
            dmem_addr => ${daddr},
            dmem_out  => ${dout},
            dmem_we   => ${dwe}
        );`);
    } else if (gateType === 'PROGRAM_COUNTER') {
      const clk = getIn('CLK', 0);
      const rst = getIn('RST', 1);
      const pcNext = getIn('PC_Next', 2);
      const stall = getIn('Stall', 3);
      const pc = getOut('PC', 0);
      const pc4 = getOut('PC_Plus4', 1);
      archStatements.push(`    -- Program Counter Unit: ${node.label}
    process(${clk}, ${rst})
    begin
        if ${rst} = '1' then
            ${pc} <= (others => '0');
        elsif rising_edge(${clk}) then
            if ${stall} = '0' then
                ${pc} <= ${pcNext};
            end if;
        end if;
    end process;
    ${pc4} <= std_logic_vector(unsigned(${pc}) + 4);`);
    } else if (gateType === 'INSTR_DECODER') {
      const instr = getIn('Instr', 0);
      const op = getOut('Opcode', 0);
      const rd = getOut('RD', 1);
      const f3 = getOut('Funct3', 2);
      const rs1 = getOut('RS1', 3);
      const rs2 = getOut('RS2', 4);
      const imm = getOut('Imm', 5);
      archStatements.push(`    -- RISC-V RV32I Instruction Decoder: ${node.label}
    ${op}  <= ${instr}(6 downto 0);
    ${rd}  <= ${instr}(11 downto 7);
    ${f3}  <= ${instr}(14 downto 12);
    ${rs1} <= ${instr}(19 downto 15);
    ${rs2} <= ${instr}(24 downto 20);
    ${imm} <= (31 downto 12 => ${instr}(31)) & ${instr}(31 downto 20);`);
    } else if (gateType === 'REG_FILE_32X32') {
      const clk = getIn('CLK', 0);
      const we = getIn('WE', 1);
      const rs1 = getIn('RS1_Addr', 2);
      const rs2 = getIn('RS2_Addr', 3);
      const rd = getIn('RD_Addr', 4);
      const wdata = getIn('WData', 5);
      const rdata1 = getOut('RS1_Data', 0);
      const rdata2 = getOut('RS2_Data', 1);
      archStatements.push(`    -- 32x32 Dual-Read Register File: ${node.label}
    inst_${cleanNodeId} : entity work.reg_file_32x32
        port map (
            clk      => ${clk},
            we       => ${we},
            rs1_addr => ${rs1},
            rs2_addr => ${rs2},
            rd_addr  => ${rd},
            wdata    => ${wdata},
            rs1_data => ${rdata1},
            rs2_data => ${rdata2}
        );`);
    } else if (gateType === 'SRAM_BLOCK') {
      const clk = getIn('CLK', 0);
      const cs = getIn('CS', 1);
      const we = getIn('WE', 2);
      const addr = getIn('Addr', 3);
      const din = getIn('DIn', 4);
      const dout = getOut('DOut', 0);
      archStatements.push(`    -- 256x8 Synchronous SRAM Block: ${node.label}
    process(${clk})
        type ram_t is array (0 to 255) of std_logic_vector(7 downto 0);
        variable ram : ram_t := (others => (others => '0'));
    begin
        if rising_edge(${clk}) then
            if ${cs} = '1' then
                if ${we} = '1' then
                    ram(to_integer(unsigned(${addr}))) := ${din};
                end if;
                ${dout} <= ram(to_integer(unsigned(${addr})));
            end if;
        end if;
    end process;`);
    } else if (gateType === 'BRAM_DUAL') {
      const clk = getIn('CLK', 0);
      const weA = getIn('WE_A', 1);
      const addrA = getIn('Addr_A', 2);
      const dinA = getIn('DIn_A', 3);
      const weB = getIn('WE_B', 4);
      const addrB = getIn('Addr_B', 5);
      const dinB = getIn('DIn_B', 6);
      const doutA = getOut('DOut_A', 0);
      const doutB = getOut('DOut_B', 1);
      archStatements.push(`    -- 1024x32 Dual-Port Block RAM: ${node.label}
    inst_${cleanNodeId} : entity work.bram_dual_port
        port map (
            clk    => ${clk},
            we_a   => ${weA},
            addr_a => ${addrA},
            din_a  => ${dinA},
            dout_a => ${doutA},
            we_b   => ${weB},
            addr_b => ${addrB},
            din_b  => ${dinB},
            dout_b => ${doutB}
        );`);
    } else if (gateType === 'ROM_STORE') {
      const clk = getIn('CLK', 0);
      const addr = getIn('Addr', 1);
      const dout = getOut('Data', 0);
      archStatements.push(`    -- 64x32 Boot ROM: ${node.label}
    process(${clk})
        type rom_t is array (0 to 63) of std_logic_vector(31 downto 0);
        constant rom_data : rom_t := (others => x"00000013"); -- NOP
    begin
        if rising_edge(${clk}) then
            ${dout} <= rom_data(to_integer(unsigned(${addr})));
        end if;
    end process;`);
    } else if (gateType === 'FIFO_BUFFER') {
      const clk = getIn('CLK', 0);
      const rst = getIn('RST', 1);
      const wr = getIn('WR_EN', 2);
      const rd = getIn('RD_EN', 3);
      const din = getIn('DIn', 4);
      const dout = getOut('DOut', 0);
      const full = getOut('Full', 1);
      const empty = getOut('Empty', 2);
      archStatements.push(`    -- 16x8 Synchronous Elastic FIFO: ${node.label}
    inst_${cleanNodeId} : entity work.fifo_sync_16x8
        port map (
            clk   => ${clk},
            rst   => ${rst},
            wr_en => ${wr},
            rd_en => ${rd},
            din   => ${din},
            dout  => ${dout},
            full  => ${full},
            empty => ${empty}
        );`);
    } else if (gateType === 'TEMP_SENSOR') {
      const clk = getIn('CLK', 0);
      const sample = getIn('Sample', 1);
      const temp = getOut('Temp_C', 0);
      const rdy = getOut('Ready', 1);
      archStatements.push(`    -- Temperature Sensor Model: ${node.label}
    process(${clk})
    begin
        if rising_edge(${clk}) then
            if ${sample} = '1' then
                ${temp} <= x"19"; -- 25 deg C ambient
                ${rdy}  <= '1';
            else
                ${rdy}  <= '0';
            end if;
        end if;
    end process;`);
    } else if (gateType === 'LIGHT_SENSOR') {
      const lux = getOut('Lux', 0);
      const alert = getOut('DarkAlert', 1);
      archStatements.push(`    -- Photodiode Ambient Light Sensor: ${node.label}
    ${lux}   <= x"80"; -- 128 lux
    ${alert} <= '1' when unsigned(${lux}) < 30 else '0';`);
    } else if (gateType === 'PWM_DRIVER') {
      const clk = getIn('CLK', 0);
      const duty = getIn('Duty', 1);
      const en = getIn('EN', 2);
      const pwm = getOut('PWM_Out', 0);
      archStatements.push(`    -- PWM Motor Driver: ${node.label}
    process(${clk})
        variable counter : unsigned(7 downto 0) := (others => '0');
    begin
        if rising_edge(${clk}) then
            if ${en} = '1' then
                counter := counter + 1;
                if counter < unsigned(${duty}) then
                    ${pwm} <= '1';
                else
                    ${pwm} <= '0';
                end if;
            else
                ${pwm} <= '0';
            end if;
        end if;
    end process;`);
    } else if (gateType === 'ADC_8BIT') {
      const clk = getIn('CLK', 0);
      const soc = getIn('SOC', 1);
      const data = getOut('Data', 0);
      const eoc = getOut('EOC', 1);
      archStatements.push(`    -- 8-Bit ADC Model: ${node.label}
    process(${clk})
    begin
        if rising_edge(${clk}) then
            if ${soc} = '1' then
                ${data} <= x"AA"; -- ADC Sample
                ${eoc}  <= '1';
            else
                ${eoc}  <= '0';
            end if;
        end if;
    end process;`);
    } else if (gateType === 'DAC_8BIT') {
      const din = getIn('DIn', 1);
      const aout = getOut('V_Analog', 0);
      archStatements.push(`    -- 8-Bit DAC Model: ${node.label}\n    ${aout} <= '1' when unsigned(${din}) > 127 else '0';`);
    } else if (gateType === 'IO_PAD') {
      const coreIn = getIn('Core_In', 0);
      const oe = getIn('OE', 1);
      const coreOut = getOut('Core_Out', 0);
      const pad = getOut('PAD', 1);
      archStatements.push(`    -- ASIC Bidirectional I/O Pad Standard Cell: ${node.label}
    ${pad}     <= ${coreIn} when ${oe} = '1' else 'Z';
    ${coreOut} <= ${pad};`);
    } else if (gateType === 'POWER_SWITCH') {
      const sleep = getIn('Sleep', 0);
      const ack = getOut('Ack', 0);
      const vddOk = getOut('VDD_OK', 1);
      archStatements.push(`    -- MTCMOS Silicon Power Gating Switch: ${node.label}
    ${ack}   <= ${sleep};
    ${vddOk} <= not ${sleep};`);
    } else if (gateType === 'JTAG_TAP') {
      const tck = getIn('TCK', 0);
      const tms = getIn('TMS', 1);
      const tdi = getIn('TDI', 2);
      const trst = getIn('TRST', 3);
      const tdo = getOut('TDO', 0);
      const shiftDr = getOut('ShiftDR', 1);
      archStatements.push(`    -- IEEE 1149.1 JTAG Test Access Port Controller: ${node.label}
    inst_${cleanNodeId} : entity work.jtag_tap_controller
        port map (
            tck      => ${tck},
            tms      => ${tms},
            tdi      => ${tdi},
            trst     => ${trst},
            tdo      => ${tdo},
            shift_dr => ${shiftDr}
        );`);
    } else if (gateType === 'SUBSYSTEM') {
      const compType = node.properties?.component || node.id;
      const portMaps = (node.inputs || [])
        .map((p, idx) => `            ${p.name} => ${inSigs[idx] || "'0'"}`)
        .concat((node.outputs || []).map((p) => `            ${p.name} => ${getOut(p.name)}`))
        .join(',\n');
      archStatements.push(`    -- Structural Subsystem: ${node.label}\n    inst_${cleanNodeId} : entity work.${compType}\n        port map (\n${portMaps}\n        );`);
    } else if (gateType === 'PROBE' || gateType.includes('LED') || gateType === 'OUTPUT_PIN') {
      archStatements.push(`    -- Logic Probe: ${node.label} <= ${inSigs[0] || "'0'"}`);
    } else if (gateType === 'PUSHBUTTON' || gateType.includes('SWITCH')) {
      archStatements.push(`    -- User Stimulus Input: ${node.label}\n    ${outSig} <= '0';`);
    } else if (gateType === 'CLOCK') {
      archStatements.push(`    -- Master Clock: ${node.label}\n    ${outSig} <= clk;`);
    } else {
      archStatements.push(`    -- Custom RTL Logic Block: ${node.label}\n    ${outSig} <= ${inSigs.join(' and ') || "'0'"};`);
    }
  });

  // 2. Primary Output Assignments: Route wires driving primary outputs that weren't directly driven
  (netlist.primary_outputs || []).forEach((po) => {
    if (directlyDrivenOutputs.has(po.name.toLowerCase())) {
      return; // Already driven by node concurrent statement above
    }

    const drivingWire = (netlist.wires || []).find(
      (w) =>
        w.target_node === po.id ||
        w.target_node.toLowerCase() === po.name.toLowerCase() ||
        (w.target_port && w.target_port.toLowerCase() === po.name.toLowerCase())
    );

    if (drivingWire) {
      const srcSig = getSourceSignalName(drivingWire);
      archStatements.push(`    -- Primary Output: ${po.name}\n    ${po.name} <= ${srcSig};`);
    } else {
      const defaultVal = (po.width || 1) > 1 ? "(others => '0')" : "'0'";
      archStatements.push(`    -- Primary Output (Undriven): ${po.name}\n    ${po.name} <= ${defaultVal};`);
    }
  });

  // Format internal signals block
  const signalDecls = internalSignals
    .map((s) => {
      const typeStr = s.width > 1 ? `STD_LOGIC_VECTOR(${s.width - 1} downto 0)` : 'STD_LOGIC';
      return `    signal ${s.name.padEnd(20)}: ${typeStr};`;
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
