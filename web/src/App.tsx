import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Header } from './components/Header';
import { SchematicCanvas } from './components/SchematicCanvas';
import { WaveformViewer } from './components/WaveformViewer';
import { KnowledgeGraphVisualizer } from './components/KnowledgeGraphVisualizer';
import { CodeEditor } from './components/CodeEditor';
import { AgentDeck, AgentPhaseProgress } from './components/AgentDeck';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { StudioWindowManager, StudioLayoutMode } from './components/StudioWindowManager';
import { TurnkeyLifecycleDeck } from './components/TurnkeyLifecycleDeck';
import { CatalogCircuit, NetlistGraph, NetlistNode, NetlistWire, WaveformData, SimulationSummary, AgentLog } from './types/circuit';
import { ComponentBlueprint } from './components/ComponentPalette';
import {
  getCircuitsCatalog,
  synthesizeCircuit,
  simulateCircuit,
  runAgent,
  sendAgentIntervention,
  lintVHDL,
  synthesizeVHDL,
  configureAgent,
} from './services/api';
import { evaluateCircuitLogic } from './utils/circuitSimulator';

export function App() {
  const [circuits, setCircuits] = useState<CatalogCircuit[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<string>('full_adder_gate_level');
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return localStorage.getItem('circuitforge_active_project') || 'scale1_full_adder';
  });
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState<boolean>(() => {
    return localStorage.getItem('circuitforge_project_initialized') !== 'true';
  });
  const [activeTab, setActiveTab] = useState<'design' | 'waveform' | 'kg' | 'schematic' | 'code' | 'lifecycle'>(() => {
    const saved = localStorage.getItem('circuitforge_active_tab');
    if (saved === 'waveform' || saved === 'kg' || saved === 'lifecycle') return saved;
    return 'design';
  });
  const [workspaceMode, setWorkspaceMode] = useState<'split' | 'schematic' | 'code'>(() => {
    return (localStorage.getItem('circuitforge_workspace_mode') as any) || 'split';
  });
  const [studioLayoutMode, setStudioLayoutMode] = useState<StudioLayoutMode>(() => {
    const saved = localStorage.getItem('circuitforge_studio_layout_mode');
    if (saved === 'tile' || saved === 'float' || saved === 'split') return saved;
    return 'split';
  });
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = localStorage.getItem('circuitforge_workspace_split_ratio');
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 20 && parsed <= 80) return parsed;
    }
    return 50; // default 50%
  });
  const [isDraggingWorkspaceSplitter, setIsDraggingWorkspaceSplitter] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceContainerRef = useRef<HTMLDivElement | null>(null);

  const [netlist, setNetlist] = useState<NetlistGraph | null>(null);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isLinting, setIsLinting] = useState<boolean>(false);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [agentState, setAgentState] = useState<string>('IDLE');
  const [currentPhase, setCurrentPhase] = useState<AgentPhaseProgress | null>(null);

  // OpenRouter LLM Settings
  const [openrouterKey, setOpenrouterKey] = useState<string>(() => {
    return sessionStorage.getItem('circuitforge_openrouter_key') || localStorage.getItem('circuitforge_openrouter_key') || '';
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('circuitforge_model') || 'anthropic/claude-3.5-sonnet';
  });

  const [vhdlCode, setVhdlCode] = useState<string>('');
  const [lintMessages, setLintMessages] = useState<any[]>([]);
  const [lastUpdatedKGNodeId, setLastUpdatedKGNodeId] = useState<string | null>(null);
  const [probeValues, setProbeValues] = useState<Record<string, string>>({});
  const [activeFaults, setActiveFaults] = useState<Record<string, string>>({});
  const [codeEditorReloadVersion, setCodeEditorReloadVersion] = useState<number>(0);

  // Resizable Sidebar State & Persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('circuitforge_sidebar_width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 260 && parsed <= 900) return parsed;
    }
    return 384; // default 384px (w-96)
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('circuitforge_sidebar_collapsed') === 'true';
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('circuitforge_sidebar_width', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('circuitforge_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('circuitforge_workspace_mode', workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    localStorage.setItem('circuitforge_workspace_split_ratio', String(splitRatio));
  }, [splitRatio]);

  useEffect(() => {
    localStorage.setItem('circuitforge_studio_layout_mode', studioLayoutMode);
  }, [studioLayoutMode]);

  useEffect(() => {
    localStorage.setItem('circuitforge_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('circuitforge_active_project', activeProjectId);
  }, [activeProjectId]);

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    localStorage.setItem('circuitforge_project_initialized', 'true');

    const mapping: Record<string, string> = {
      scale1_full_adder: 'full_adder_gate_level',
      scale2_counter: 'scale2_counter',
      scale3_alu: 'scale3_alu',
      scale4_riscv: 'scale4_riscv',
      mux_4to1: 'mux_4to1',
    };

    const targetCircuit = mapping[projectId] || projectId;
    setSelectedCircuit(targetCircuit);
    await loadCircuit(targetCircuit);
  };

  // Global mousemove and mouseup listeners for smooth dragging across canvas & Monaco
  useEffect(() => {
    if (!isDraggingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const calculatedWidth = window.innerWidth - e.clientX;
      const minWidth = 260;
      const maxWidth = Math.max(300, Math.min(950, window.innerWidth - 320));

      if (calculatedWidth < 180) {
        setIsSidebarCollapsed(true);
      } else {
        setIsSidebarCollapsed(false);
        setSidebarWidth(Math.max(minWidth, Math.min(maxWidth, calculatedWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  // Global mouse listeners for workspace divider (Canvas vs VHDL Code)
  useEffect(() => {
    if (!isDraggingWorkspaceSplitter) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!workspaceContainerRef.current) return;
      const rect = workspaceContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      const clamped = Math.max(20, Math.min(80, percentage));
      setSplitRatio(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingWorkspaceSplitter(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingWorkspaceSplitter]);

  const handleMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
  };

  const handleDoubleClickResizer = () => {
    setSidebarWidth(384);
    setIsSidebarCollapsed(false);
  };

  const wsRef = useRef<WebSocket | null>(null);

  // Initialize catalog and synthesize initial circuit
  useEffect(() => {
    const init = async () => {
      try {
        const cat = await getCircuitsCatalog();
        setCircuits(cat);
        if (cat.length > 0) {
          const initial = cat[0].id;
          setSelectedCircuit(initial);
          await loadCircuit(initial);
        }
      } catch (e) {
        console.error('Failed to initialize circuits catalog', e);
      }
    };
    init();
  }, []);

  // WebSocket for real-time telemetry
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/live`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.state) setAgentState(msg.state);

        if (msg.type === 'agent_step_progress') {
          const rawIdx =
            msg.data.step_index !== undefined
              ? msg.data.step_index
              : msg.data.step
              ? msg.data.step - 1
              : 0;
          const safeIdx = typeof rawIdx === 'number' && !isNaN(rawIdx) ? rawIdx : 0;
          const normalized = { ...msg.data, step_index: safeIdx };
          setCurrentPhase(normalized);
          // Also record progress in log stream
          setAgentLogs((prev) => [
            ...prev,
            {
              time: Date.now(),
              state: `PHASE ${safeIdx + 1}`,
              action: msg.data.step_name || `Phase ${safeIdx + 1}`,
              thought: msg.data.thought || 'Executing phase...',
            },
          ]);
        } else if (msg.type === 'agent_thought') {
          setAgentLogs((prev) => [...prev, msg.data]);
        } else if (msg.type === 'agent_state_change') {
          setAgentState(msg.data.state);
        } else if (msg.type === 'circuit_designed') {
          setVhdlCode(msg.data.vhdl_code);
          setLintMessages(msg.data.lint_messages || []);
        } else if (msg.type === 'netlist_synthesized') {
          setNetlist(msg.data);
        } else if (msg.type === 'simulation_finished') {
          setSummary(msg.data.summary);
          setWaveform(msg.data.waveform);
          // update probes
          const probes: Record<string, string> = {};
          msg.data.waveform.signals.forEach((s: any) => {
            if (s.transitions && s.transitions.length > 0) {
              probes[s.name] = s.transitions[s.transitions.length - 1].val;
            }
          });
          setProbeValues(probes);
        } else if (msg.type === 'fault_injected' && msg.data) {
          if (msg.data.fault !== null && msg.data.fault !== undefined && msg.data.net) {
            setActiveFaults((prev) => ({ ...prev, [msg.data.net]: String(msg.data.fault) }));
          } else if (msg.data.net) {
            setActiveFaults((prev) => {
              const next = { ...prev };
              delete next[msg.data.net];
              return next;
            });
          }
        } else if (msg.type === 'kg_node_added' || msg.type === 'kg_node_updated') {
          setLastUpdatedKGNodeId(msg.data.node?.id || msg.data.node_id);
        } else if (msg.type === 'project_files_updated') {
          // New VHDL files materialized by the Agent — reload file explorer
          const d = msg.data as { project_id: string; files: string[]; top_file: string; modules: string[]; circuit_name: string };
          if (d.project_id === activeProjectId || !activeProjectId) {
            // Bump reload version so CodeEditor re-fetches the project tree
            setCodeEditorReloadVersion((v) => v + 1);
            // If a top structural file exists, load it into the editor
            if (d.top_file) {
              const topPath = d.top_file;
              import('./services/api').then(({ readProjectFile, synthesizeVHDL: synVHDL }) => {
                readProjectFile(d.project_id, topPath).then((resp: { path: string; content: string }) => {
                  if (resp?.content) {
                    setVhdlCode(resp.content);
                    synVHDL(resp.content, d.circuit_name).then((nl: any) => {
                      if (nl) setNetlist(nl);
                    }).catch(() => {});
                  }
                }).catch(() => {});
              }).catch(() => {});
            }
            // Add agent log entry
            setAgentLogs((prev) => [
              ...prev,
              {
                time: Date.now(),
                state: 'MATERIALIZER',
                action: 'files_synced',
                thought: `Studio synced: ${d.files.length} file(s) written to project '${d.project_id}'. Top: ${d.top_file || 'N/A'}.`,
                details: { files: d.files, top_file: d.top_file, modules: d.modules, project_id: d.project_id },
              },
            ]);
          }
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const loadCircuit = async (circuitId: string) => {
    setSelectedCircuit(circuitId);
    try {
      const net = await synthesizeCircuit(circuitId);
      setNetlist(net);

      // Default sample VHDL for the circuit
      if (circuitId.includes('adder')) {
        setVhdlCode(`library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity full_adder is
    port (
        A    : in  std_logic;
        B    : in  std_logic;
        Cin  : in  std_logic;
        Sum  : out std_logic;
        Cout : out std_logic
    );
end full_adder;

architecture structural of full_adder is
    signal s1, c1, c2 : std_logic;
begin
    s1 <= A xor B;
    Sum <= s1 xor Cin;
    c1 <= A and B;
    c2 <= Cin and s1;
    Cout <= c1 or c2;
end structural;`);
      } else if (circuitId.includes('counter')) {
        setVhdlCode(`library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter_8bit is
    port (
        clk     : in  std_logic;
        rst     : in  std_logic;
        en      : in  std_logic;
        count   : out std_logic_vector(7 downto 0)
    );
end counter_8bit;

architecture rtl of counter_8bit is
    signal r_cnt : unsigned(7 downto 0);
begin
    process(clk, rst)
    begin
        if rst = '1' then
            r_cnt <= (others => '0');
        elsif rising_edge(clk) then
            if en = '1' then
                r_cnt <= r_cnt + 1;
            end if;
        end if;
    end process;
    count <= std_logic_vector(r_cnt);
end rtl;`);
      } else if (circuitId.includes('alu')) {
        setVhdlCode(`library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity alu_32bit is
    port (
        A          : in  std_logic_vector(31 downto 0);
        B          : in  std_logic_vector(31 downto 0);
        ALUControl : in  std_logic_vector(3 downto 0);
        Result     : out std_logic_vector(31 downto 0);
        Zero       : out std_logic
    );
end alu_32bit;

architecture rtl of alu_32bit is
begin
    process(A, B, ALUControl)
    begin
        case ALUControl is
            when "0000" => Result <= std_logic_vector(unsigned(A) + unsigned(B));
            when "0001" => Result <= std_logic_vector(unsigned(A) - unsigned(B));
            when "0010" => Result <= A and B;
            when "0011" => Result <= A or B;
            when "0100" => Result <= A xor B;
            when "0101" => Result <= std_logic_vector(shift_left(unsigned(A), 1));
            when "0110" => Result <= std_logic_vector(shift_right(unsigned(A), 1));
            when others => Result <= (others => '0');
        end case;
        if A = B then
            Zero <= '1';
        else
            Zero <= '0';
        end if;
    end process;
end rtl;`);
      }

      // Automatically simulate to populate waveforms
      const sim = await simulateCircuit(circuitId, 100);
      setSummary(sim.summary);
      setWaveform(sim.waveform);

      const probes: Record<string, string> = {};
      sim.waveform.signals.forEach((s) => {
        if (s.transitions && s.transitions.length > 0) {
          probes[s.name] = s.transitions[s.transitions.length - 1].val;
        }
      });
      setProbeValues(probes);
    } catch (e) {
      console.error('Failed to load circuit', e);
    }
  };

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await simulateCircuit(selectedCircuit, 100);
      setSummary(res.summary);
      setWaveform(res.waveform);

      const probes: Record<string, string> = {};
      res.waveform.signals.forEach((s) => {
        if (s.transitions && s.transitions.length > 0) {
          probes[s.name] = s.transitions[s.transitions.length - 1].val;
        }
      });
      setProbeValues(probes);
    } catch (e) {
      console.error('Simulation failed', e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRunLint = async (customCode?: string) => {
    setIsLinting(true);
    const codeToLint = typeof customCode === 'string' ? customCode : vhdlCode;
    try {
      const res = await lintVHDL(codeToLint);
      setLintMessages(res.messages || []);
    } catch (e) {
      console.error('Linting failed', e);
    } finally {
      setIsLinting(false);
    }
  };

  // Debounced live VHDL -> Schematic netlist auto-synchronization
  const handleVhdlCodeChange = (newCode: string) => {
    setVhdlCode(newCode);
    setSyncStatus('syncing');

    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setTimeout(async () => {
      try {
        const net = await synthesizeVHDL(newCode, selectedCircuit);
        if (net && net.nodes && net.nodes.length > 0) {
          setNetlist(net);
          setSyncStatus('synced');
          // Re-evaluate logic with new netlist
          const simState = evaluateCircuitLogic(net, probeValues, activeFaults);
          setProbeValues(simState.probeValues);
        } else {
          setSyncStatus('error');
        }
      } catch (e) {
        setSyncStatus('error');
      }
    }, 750);
  };

  const handleSynthesizeVHDL = async (customCode?: string) => {
    setIsSynthesizing(true);
    const codeToSyn = typeof customCode === 'string' ? customCode : vhdlCode;
    try {
      const net = await synthesizeVHDL(codeToSyn, selectedCircuit);
      setNetlist(net);
      setSyncStatus('synced');
      // If user was on full code view, switch to split view so they see both code and schematic!
      if (workspaceMode === 'code') {
        setWorkspaceMode('split');
      }
      setActiveTab('design');
      // Also run simulation to refresh waveforms
      await handleRunSimulation();
    } catch (e) {
      console.error('Synthesis failed', e);
      setSyncStatus('error');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSaveOpenRouterConfig = (key: string, model: string, storagePref: 'session' | 'local' = 'local') => {
    setOpenrouterKey(key);
    setSelectedModel(model);
    if (storagePref === 'session') {
      sessionStorage.setItem('circuitforge_openrouter_key', key);
      localStorage.removeItem('circuitforge_openrouter_key');
    } else {
      localStorage.setItem('circuitforge_openrouter_key', key);
      sessionStorage.removeItem('circuitforge_openrouter_key');
    }
    localStorage.setItem('circuitforge_model', model);
    configureAgent(key, model).catch(() => {});
  };

  const handleAgentIntervention = async (action: 'pause' | 'resume' | 'step' | 'steer', params?: { guidance?: string }) => {
    if (action === 'pause') setAgentState('PAUSED');
    if (action === 'resume') setAgentState('RUNNING');
    if (action === 'step') setAgentState('RUNNING');
    try {
      await sendAgentIntervention(action, params);
    } catch (e) {
      console.error('Agent intervention failed', e);
    }
  };

  const handleLaunchTask = (
    goal: string,
    scale: number,
    circuitName: string,
    key?: string,
    model?: string
  ) => {
    setAgentState('RUNNING');
    const activeKey = key !== undefined ? key : openrouterKey;
    const activeModel = model !== undefined ? model : selectedModel;
    runAgent(goal, scale, circuitName, activeKey, activeModel, activeProjectId || undefined);
  };

  const handleInjectFault = async (netName: string, faultVal: string | null) => {
    try {
      const nextFaults = { ...activeFaults };
      if (faultVal !== null) {
        nextFaults[netName] = faultVal;
      } else {
        delete nextFaults[netName];
      }
      setActiveFaults(nextFaults);

      // Re-evaluate logic across entire netlist with updated faults
      const simState = evaluateCircuitLogic(netlist, probeValues, nextFaults);
      setProbeValues(simState.probeValues);

      await sendAgentIntervention('fault', {
        net_name: netName,
        fault_value: faultVal !== null ? faultVal : 'clear',
      });
      await handleRunSimulation();
    } catch (e) {
      console.error('Failed to inject fault', e);
    }
  };

  const handleToggleInput = (pinName: string, currentVal: string) => {
    const newVal = currentVal === '1' ? '0' : '1';
    const updatedInputs = { ...probeValues, [pinName]: newVal };

    // Universal topological logic simulation for any circuit, custom gate, or interconnect
    const simState = evaluateCircuitLogic(netlist, updatedInputs, activeFaults);
    setProbeValues(simState.probeValues);
  };

  const handleAddComponent = (blueprint: ComponentBlueprint, pos: { x: number; y: number }) => {
    if (!netlist) return;
    const count = netlist.nodes.filter((n) => n.type === blueprint.type).length + 1;
    const newId = `${blueprint.type.toLowerCase()}_${Date.now().toString().slice(-4)}`;
    const newNode: NetlistNode = {
      id: newId,
      label: `${blueprint.name} ${count}`,
      type: blueprint.type,
      scale: blueprint.scale || 1,
      x: pos.x,
      y: pos.y,
      width: blueprint.width,
      height: blueprint.height,
      inputs: blueprint.inputs.map((p) => ({
        id: `${newId}_${p.name}`,
        name: p.name,
        direction: 'in',
        width: p.width || 1,
      })),
      outputs: blueprint.outputs.map((p) => ({
        id: `${newId}_${p.name}`,
        name: p.name,
        direction: 'out',
        width: p.width || 1,
      })),
      properties: { gate_type: blueprint.type, scale: blueprint.scale },
    };
    const updatedNetlist = {
      ...netlist,
      nodes: [...netlist.nodes, newNode],
    };
    setNetlist(updatedNetlist);
    const simState = evaluateCircuitLogic(updatedNetlist, probeValues, activeFaults);
    setProbeValues(simState.probeValues);
  };

  const handleDeleteComponent = (nodeId: string) => {
    if (!netlist) return;
    const updatedNetlist = {
      ...netlist,
      nodes: netlist.nodes.filter((n) => n.id !== nodeId),
      wires: netlist.wires.filter((w) => w.source_node !== nodeId && w.target_node !== nodeId),
    };
    setNetlist(updatedNetlist);
    const simState = evaluateCircuitLogic(updatedNetlist, probeValues, activeFaults);
    setProbeValues(simState.probeValues);
  };

  const handleAddWire = (newWire: NetlistWire) => {
    if (!netlist) return;
    const exists = netlist.wires.some(
      (w) =>
        w.source_node === newWire.source_node &&
        w.source_port === newWire.source_port &&
        w.target_node === newWire.target_node &&
        w.target_port === newWire.target_port
    );
    if (exists) return;
    const updatedNetlist = {
      ...netlist,
      wires: [...netlist.wires, newWire],
    };
    setNetlist(updatedNetlist);
    const simState = evaluateCircuitLogic(updatedNetlist, probeValues, activeFaults);
    setProbeValues(simState.probeValues);
  };

  const handleDeleteWire = (wireId: string) => {
    if (!netlist) return;
    const updatedNetlist = {
      ...netlist,
      wires: netlist.wires.filter((w) => w.id !== wireId),
    };
    setNetlist(updatedNetlist);
    const simState = evaluateCircuitLogic(updatedNetlist, probeValues, activeFaults);
    setProbeValues(simState.probeValues);
  };

  const currentScale = netlist ? netlist.scale : 1;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Studio Header */}
      <Header
        circuits={circuits}
        selectedCircuit={selectedCircuit}
        onSelectCircuit={loadCircuit}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        workspaceMode={workspaceMode}
        onChangeWorkspaceMode={setWorkspaceMode}
        layoutMode={studioLayoutMode}
        onChangeLayoutMode={setStudioLayoutMode}
        syncStatus={syncStatus}
        agentState={agentState}
        isSimulating={isSimulating}
        onRunSimulation={handleRunSimulation}
        currentScale={currentScale}
        onOpenProjectManager={() => setIsProjectManagerOpen(true)}
        onToggleAgentPanel={() => setIsSidebarCollapsed((c) => !c)}
        isAgentPanelOpen={!isSidebarCollapsed}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Fullscreen transparent drag shield preventing Monaco or SVG from capturing mouse during resize */}
        {(isDraggingSidebar || isDraggingWorkspaceSplitter) && (
          <div className="fixed inset-0 z-50 cursor-col-resize pointer-events-auto select-none" />
        )}

        {/* Main Central Studio Workspace */}
        <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
          {/* Unified Multi-Window Studio Manager (Split, Tile, Float) */}
          {(activeTab === 'design' || activeTab === 'schematic' || activeTab === 'code') && (
            <StudioWindowManager
              netlist={netlist}
              probeValues={probeValues}
              activeFaults={activeFaults}
              onInjectFault={handleInjectFault}
              onToggleInput={handleToggleInput}
              onSelectSubcircuit={loadCircuit}
              agentState={agentState}
              isSimulating={isSimulating}
              onAgentIntervention={handleAgentIntervention}
              onLaunchTask={handleLaunchTask}
              onAddComponent={handleAddComponent}
              onDeleteComponent={handleDeleteComponent}
              onAddWire={handleAddWire}
              onDeleteWire={handleDeleteWire}

              vhdlCode={vhdlCode}
              onChangeCode={handleVhdlCodeChange}
              onRunLint={handleRunLint}
              lintMessages={lintMessages}
              onSynthesizeAndSimulate={handleSynthesizeVHDL}
              isLinting={isLinting}
              isSynthesizing={isSynthesizing}
              activeProjectId={activeProjectId}
              onSelectProject={handleSelectProject}
              syncStatus={syncStatus}

              waveform={waveform}
              summary={summary}
              lastUpdatedKGNodeId={lastUpdatedKGNodeId}

              agentLogs={agentLogs}
              currentPhase={currentPhase}
              openrouterKey={openrouterKey}
              selectedModel={selectedModel}
              onUpdateOpenRouterConfig={handleSaveOpenRouterConfig}

              selectedCircuit={selectedCircuit}
              onRunSimulation={handleRunSimulation}

              layoutMode={studioLayoutMode}
              onChangeLayoutMode={setStudioLayoutMode}
              codeEditorReloadVersion={codeEditorReloadVersion}
            />
          )}

          {activeTab === 'waveform' && (
            <WaveformViewer waveform={waveform} summary={summary} />
          )}

          {activeTab === 'kg' && (
            <KnowledgeGraphVisualizer lastUpdatedNodeId={lastUpdatedKGNodeId} />
          )}

          {activeTab === 'lifecycle' && (
            <TurnkeyLifecycleDeck circuitName={selectedCircuit} projectId={activeProjectId} />
          )}
        </div>

        {/* Interactive Resizer Splitter Bar (Split Mode Docked Sidebar) */}
        {!isSidebarCollapsed && studioLayoutMode === 'split' && (
          <div
            onMouseDown={handleMouseDownResizer}
            onDoubleClick={handleDoubleClickResizer}
            className={`relative w-2.5 group cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors select-none z-20 ${
              isDraggingSidebar
                ? 'bg-purple-600 shadow-[0_0_12px_rgba(168,85,247,0.7)]'
                : 'bg-slate-900 hover:bg-purple-500/40 border-l border-r border-slate-800'
            }`}
            title="Drag to resize panel · Double-click to reset (384px)"
          >
            {/* Grip handle indicator */}
            <div className="w-1 h-8 rounded-full bg-slate-700/80 group-hover:bg-purple-300 transition-colors flex flex-col items-center justify-center space-y-1">
              <span className="w-0.5 h-0.5 rounded-full bg-slate-400 group-hover:bg-white" />
              <span className="w-0.5 h-0.5 rounded-full bg-slate-400 group-hover:bg-white" />
              <span className="w-0.5 h-0.5 rounded-full bg-slate-400 group-hover:bg-white" />
            </div>

            {/* Quick Collapse Button on Divider */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsSidebarCollapsed(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute -left-3 top-10 z-30 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:bg-purple-950 hover:border-purple-500 shadow-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer"
              title="Collapse Agent Deck"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right Pane: Autonomous Agent Observer Deck & Intervention Station (Docked in Split View) */}
        {studioLayoutMode === 'split' && (
          <div
            style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
            className={`h-full flex flex-col flex-shrink-0 overflow-hidden ${
              isDraggingSidebar ? '' : 'transition-[width] duration-150 ease-out'
            } ${isSidebarCollapsed ? 'w-0 border-0 pointer-events-none' : 'border-l border-slate-800'}`}
          >
            <AgentDeck
              logs={agentLogs}
              agentState={agentState}
              onIntervention={handleAgentIntervention}
              onLaunchTask={handleLaunchTask}
              onRunSimulation={handleRunSimulation}
              circuitContext={{
                circuit_name: selectedCircuit,
                vhdl_code: vhdlCode,
                gate_count: netlist?.nodes.length || 0,
                wire_count: netlist?.wires.length || 0,
                probes: probeValues,
                faults: activeFaults,
              }}
              currentPhase={currentPhase}
              openrouterKey={openrouterKey}
              selectedModel={selectedModel}
              onUpdateOpenRouterConfig={handleSaveOpenRouterConfig}
              activeProjectId={activeProjectId}
              onApplyDesignToCanvas={(code) => {
                setVhdlCode(code);
                handleSynthesizeVHDL(code);
              }}
            />
          </div>
        )}

        {/* Floating Expand Tab when collapsed (Split Mode only) */}
        {isSidebarCollapsed && studioLayoutMode === 'split' && (
          <button
            onClick={() => setIsSidebarCollapsed(false)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-40 bg-slate-900/95 hover:bg-purple-950 border-l border-t border-b border-purple-800/80 hover:border-purple-500 rounded-l-xl py-3 px-2 shadow-2xl flex flex-col items-center gap-2.5 group transition-all backdrop-blur cursor-pointer"
            title="Expand Agent Deck (Click to open)"
          >
            <ChevronLeft className="w-4 h-4 text-purple-400 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold tracking-wider [writing-mode:vertical-lr] rotate-180 text-slate-300 group-hover:text-purple-300 font-mono">
              AGENT DECK
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                agentState === 'RUNNING' || agentState === 'THINKING'
                  ? 'bg-amber-400 animate-pulse'
                  : agentState === 'ERROR'
                  ? 'bg-rose-400'
                  : 'bg-emerald-400'
              }`}
              title={`Agent: ${agentState}`}
            />
          </button>
        )}
      </div>

      {/* Project Hub & Workspace Manager Modal */}
      <ProjectManagerModal
        isOpen={isProjectManagerOpen}
        onClose={() => setIsProjectManagerOpen(false)}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onProjectCreated={(newProj) => {
          setActiveProjectId(newProj.id);
        }}
      />
    </div>
  );
}

export default App;
