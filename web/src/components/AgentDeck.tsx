import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Play,
  Pause,
  FastForward,
  Send,
  Terminal,
  Sparkles,
  CheckCircle2,
  Loader2,
  Circle,
  Settings2,
  Key,
  Cpu,
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  MessageSquare,
  ListFilter,
  User,
  Check,
  PlusCircle,
  RotateCcw,
  Bookmark,
  Star,
} from 'lucide-react';
import { AgentLog } from '../types/circuit';
import {
  getAgentModels,
  testAgentConnection,
  configureAgent,
  searchAgentModels,
  chatWithAgent,
  getKeyStatus,
  KeyStatus
} from '../services/api';

export interface AgentPhaseProgress {
  step_name: string;
  step_index: number;
  total_steps: number;
  status: string;
  thought: string;
}

interface AgentDeckProps {
  logs: AgentLog[];
  agentState: string;
  onIntervention: (action: 'pause' | 'resume' | 'step' | 'steer', params?: { guidance?: string }) => void;
  onLaunchTask: (goal: string, scale: number, circuitName: string, openrouterKey?: string, model?: string) => void;
  onRunSimulation?: () => void;
  circuitContext?: {
    circuit_name?: string;
    vhdl_code?: string;
    gate_count?: number;
    wire_count?: number;
    probes?: Record<string, string>;
    faults?: Record<string, string>;
  };
  currentPhase?: AgentPhaseProgress | null;
  openrouterKey: string;
  selectedModel: string;
  onUpdateOpenRouterConfig: (key: string, model: string, storagePref?: 'session' | 'local') => void;
  activeProjectId?: string;
  onApplyDesignToCanvas?: (vhdlCode: string, circuitName: string) => void;
}

const PHASES = [
  { id: 0, name: 'Knowledge Retrieval', desc: 'Scale hierarchy & graph query' },
  { id: 1, name: 'Architecture Planning', desc: 'OpenRouter LLM & RTL planning' },
  { id: 2, name: 'AST & Netlist Gen', desc: 'VHDL parsing & wire netlist' },
  { id: 3, name: 'Static DRC Checks', desc: 'Latch inference & timing rules' },
  { id: 4, name: 'Simulation & Tests', desc: 'Testbench waveforms & assertions' },
  { id: 5, name: 'Memory Augmentation', desc: 'Reflection & KG graph update' },
];

const inferScale = (goal: string): number => {
  const g = goal.toLowerCase();
  if (/processor|microprocessor|cpu|riscv|risc-v|rv32|rv64|pipeline|core/.test(g)) return 4;
  if (/alu|subsystem|controller|fsm|uart|dsp|decoder|multiplier|mac/.test(g)) return 3;
  if (/counter|register|shift|timer|fifo|accumulator/.test(g)) return 2;
  return 1;
};

export const AgentDeck: React.FC<AgentDeckProps> = ({
  logs,
  agentState,
  onIntervention,
  onLaunchTask,
  onRunSimulation,
  circuitContext,
  currentPhase,
  openrouterKey,
  selectedModel,
  onUpdateOpenRouterConfig,
  activeProjectId,
  onApplyDesignToCanvas,
}) => {
  const [steerPrompt, setSteerPrompt] = useState('');
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'telemetry'>('chat');
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(openrouterKey);
  const [tempModel, setTempModel] = useState(selectedModel);
  const [customModelInput, setCustomModelInput] = useState('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelSearchResults, setModelSearchResults] = useState<any[]>([]);
  const [isSearchingModels, setIsSearchingModels] = useState(false);
  const [isModelSearchOpen, setIsModelSearchOpen] = useState(false);
  const [serverKeyStatus, setServerKeyStatus] = useState<KeyStatus | null>(null);
  const [keyStoragePref, setKeyStoragePref] = useState<'session' | 'local'>(() => {
    return sessionStorage.getItem('circuitforge_openrouter_key') ? 'session' : 'local';
  });
  const [isPipelineExpanded, setIsPipelineExpanded] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  useEffect(() => {
    getKeyStatus().then(setServerKeyStatus).catch(() => {});
  }, [isSettingsOpen]);

  const [savedModels, setSavedModels] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('circuitforge_saved_models');
      return stored ? JSON.parse(stored) : [
        'anthropic/claude-3.7-sonnet',
        'deepseek/deepseek-r1',
        'mistralai/codestral-2501',
        'openai/gpt-4o'
      ];
    } catch {
      return ['anthropic/claude-3.7-sonnet', 'deepseek/deepseek-r1'];
    }
  });

  // Debounced model search
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setIsSearchingModels(true);
      try {
        const res = await searchAgentModels(modelSearchQuery);
        if (active) setModelSearchResults(res.models || []);
      } catch (e) {
        if (active) setModelSearchResults([]);
      } finally {
        if (active) setIsSearchingModels(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [modelSearchQuery]);

  const handleSaveFavoriteModel = (modelId: string) => {
    if (!savedModels.includes(modelId)) {
      const updated = [modelId, ...savedModels.slice(0, 7)];
      setSavedModels(updated);
      localStorage.setItem('circuitforge_saved_models', JSON.stringify(updated));
    }
  };

  const handleRemoveFavoriteModel = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedModels.filter((m) => m !== modelId);
    setSavedModels(updated);
    localStorage.setItem('circuitforge_saved_models', JSON.stringify(updated));
  };
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [testStatus, setTestStatus] = useState<{ testing: boolean; success?: boolean; msg?: string } | null>(null);

  // Custom Task Launcher state
  const [isCustomLauncherOpen, setIsCustomLauncherOpen] = useState(false);
  const [customGoal, setCustomGoal] = useState('');
  const [customScale, setCustomScale] = useState<number>(1);
  const [customCircuitName, setCustomCircuitName] = useState('');

  // Local user chat messages for true interactive co-pilot experience
  const [userChatMessages, setUserChatMessages] = useState<Array<{ id: string; time: number; text: string }>>([]);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Extract latest materialized hardware artifacts from logs
  const latestMaterializedLog = [...logs].reverse().find(
    (l) => l.action === 'files_synced' || l.action === 'materialize_complete'
  );
  const materializedFiles: string[] = latestMaterializedLog?.details?.files || [];
  const materializedTop: string = latestMaterializedLog?.details?.top_file || '';

  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider: string }>>([
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 Reasoning', provider: 'DeepSeek' },
    { id: 'openai/gpt-4o', name: 'GPT-4o Omnimodal', provider: 'OpenAI' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'Meta' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', provider: 'Qwen' },
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google' },
  ]);

  useEffect(() => {
    setTempApiKey(openrouterKey);
    setTempModel(selectedModel);
    if (!availableModels.some((m) => m.id === selectedModel)) {
      setCustomModelInput(selectedModel);
      setUseCustomModel(true);
    }
  }, [openrouterKey, selectedModel]);

  useEffect(() => {
    getAgentModels()
      .then((data) => {
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, userChatMessages]);

  const handleSendSteer = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const textToSend = overrideText !== undefined ? overrideText : steerPrompt;
    if (!textToSend.trim()) return;

    const userMsg = textToSend.trim();
    setUserChatMessages((prev) => [
      ...prev,
      { id: `msg_${Date.now()}`, time: Date.now(), text: userMsg },
    ]);
    setSteerPrompt('');

    // If agent pipeline is actively running, also steer the pipeline
    if (agentState === 'RUNNING' || agentState === 'PAUSED') {
      onIntervention('steer', { guidance: userMsg });
    }

    // Call real Co-Pilot LLM with full circuit context
    setIsCopilotThinking(true);
    try {
      const res = await chatWithAgent(
        userMsg,
        circuitContext,
        openrouterKey,
        selectedModel
      );

      // If the LLM response contains an automated studio action:
      if (res.action?.type === 'design' && res.action.goal) {
        const cleanName = `circuit_${Date.now().toString(36)}`;
        const scale = inferScale(res.action.goal);
        onLaunchTask(res.action.goal, scale, cleanName, openrouterKey, selectedModel);
      } else if (res.action?.type === 'simulate' && onRunSimulation) {
        onRunSimulation();
      }
    } catch (err) {
      console.error('Failed to chat with agent', err);
    } finally {
      setIsCopilotThinking(false);
    }
  };

  const handleTestConnection = async () => {
    const activeModel = useCustomModel && customModelInput.trim() ? customModelInput.trim() : tempModel;
    if (!tempApiKey.trim()) {
      setTestStatus({ testing: false, success: false, msg: 'Please provide an OpenRouter API key first.' });
      return;
    }
    setTestStatus({ testing: true });
    const startTime = performance.now();
    try {
      const res = await testAgentConnection(tempApiKey, activeModel);
      const elapsed = Math.round(performance.now() - startTime);
      if (res.success) {
        setTestStatus({
          testing: false,
          success: true,
          msg: `Online! ${res.model || activeModel} responded in ${elapsed}ms (${res.response || 'Ready'}).`
        });
        handleSaveFavoriteModel(activeModel);
      } else {
        setTestStatus({ testing: false, success: false, msg: res.error || 'Connection failed.' });
      }
    } catch (e: any) {
      setTestStatus({ testing: false, success: false, msg: e?.message || 'Network error connecting to OpenRouter.' });
    }
  };

  const handleSaveSettings = async () => {
    const activeModel = useCustomModel && customModelInput.trim() ? customModelInput.trim() : tempModel;
    onUpdateOpenRouterConfig(tempApiKey, activeModel, keyStoragePref);
    try {
      await configureAgent(tempApiKey, activeModel);
    } catch {}
    setIsSettingsOpen(false);
  };

  const handleLaunchCustomGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGoal.trim()) return;
    const cleanName = customCircuitName.trim()
      ? customCircuitName.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
      : `custom_${customGoal.slice(0, 15).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}`;

    onLaunchTask(customGoal.trim(), customScale, cleanName, openrouterKey, selectedModel);
    setIsCustomLauncherOpen(false);
    setCustomGoal('');
    setCustomCircuitName('');
  };

  const presets = [
    { id: 'full_adder', name: '1-Bit Full Adder', scale: 1, goal: 'Design a 1-bit full adder using gate primitives, synthesize schematic, and verify truth table.' },
    { id: 'counter_8bit', name: '8-Bit Counter', scale: 2, goal: 'Design an 8-bit synchronous up/down counter with load and enable, run 100ns simulation, and verify terminal count.' },
    { id: 'alu_32bit', name: '32-Bit ALU Subsystem', scale: 3, goal: 'Synthesize 32-bit multi-function ALU with arithmetic, shift, and logic operations, and verify zero/overflow flags.' },
    { id: 'riscv_core', name: 'RISC-V 5-Stage Core', scale: 4, goal: 'Verify RISC-V RV32I 5-stage pipeline core datapath and hazard forwarding unit.' },
  ];

  const quickPromptChips = [
    'Add asynchronous active-low reset',
    'Optimize critical path timing',
    'Inject stuck-at-0 fault on Sum',
    'Run 200ns cycle simulation',
    'Verify zero unclocked latches',
  ];

  // NaN-safe phase index calculation
  const getActivePhaseIndex = () => {
    if (agentState === 'COMPLETED') return 6;
    if (currentPhase) {
      if (typeof currentPhase.step_index === 'number' && !isNaN(currentPhase.step_index)) {
        return currentPhase.step_index;
      }
      if (typeof (currentPhase as any).step === 'number' && !isNaN((currentPhase as any).step)) {
        return (currentPhase as any).step - 1;
      }
    }
    if (agentState === 'RUNNING') return 1;
    return -1;
  };

  const activeIndex = getActivePhaseIndex();

  const getPhaseNumberDisplay = () => {
    if (!currentPhase) return null;
    const rawIdx =
      typeof currentPhase.step_index === 'number' && !isNaN(currentPhase.step_index)
        ? currentPhase.step_index + 1
        : typeof (currentPhase as any).step === 'number' && !isNaN((currentPhase as any).step)
        ? (currentPhase as any).step
        : 1;
    return `Phase ${rawIdx}/6`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800 text-slate-200 select-none overflow-hidden font-sans">
      {/* Deck Top Header */}
      <div className="p-2.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between z-10 backdrop-blur flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/30">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <span>EDA Copilot</span>
              <span
                className={`font-mono font-semibold px-1.5 py-0.2 rounded text-[9px] ${
                  agentState === 'RUNNING'
                    ? 'bg-purple-950 border border-purple-700 text-purple-300 animate-pulse'
                    : agentState === 'PAUSED'
                    ? 'bg-amber-950 border border-amber-700 text-amber-300'
                    : agentState === 'COMPLETED'
                    ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {agentState}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Model Selector & Human Controls */}
        <div className="flex items-center space-x-1.5">
          {/* Quick Model Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="px-2 py-1 rounded-lg border border-slate-700 hover:border-purple-500 bg-slate-800/90 text-slate-300 hover:text-white text-[10px] font-mono flex items-center space-x-1 transition cursor-pointer"
              title="Switch Active AI Model"
            >
              <Cpu className="w-3 h-3 text-purple-400" />
              <span className="max-w-[110px] truncate">{selectedModel.split('/').pop() || selectedModel}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isModelDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsModelDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1 z-50 divide-y divide-slate-800 text-xs animate-fade-in font-mono">
                  <div className="px-2 py-1 text-[9px] uppercase font-bold text-slate-400">Select Frontier Model</div>
                  <div className="py-1 space-y-0.5">
                    {availableModels.slice(0, 6).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          onUpdateOpenRouterConfig(openrouterKey, m.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-[11px] transition cursor-pointer ${
                          selectedModel === m.id
                            ? 'bg-purple-950/80 text-purple-200 font-semibold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{m.name}</span>
                        {selectedModel === m.id && <Check className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                  <div className="pt-1">
                    <button
                      onClick={() => {
                        setIsModelDropdownOpen(false);
                        setIsSettingsOpen(true);
                      }}
                      className="w-full text-left px-2 py-1 rounded text-[10px] text-purple-400 hover:text-purple-300 hover:bg-slate-800/60 flex items-center space-x-1 transition cursor-pointer"
                    >
                      <Settings2 className="w-3 h-3" />
                      <span>More Model Settings & API Key...</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {agentState === 'PAUSED' ? (
            <button
              onClick={() => onIntervention('resume')}
              className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow flex items-center transition cursor-pointer"
              title="Resume Agent"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => onIntervention('pause')}
              className="p-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium shadow flex items-center transition cursor-pointer"
              title="Pause Agent"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
            </button>
          )}

          <button
            onClick={() => onIntervention('step')}
            className="p-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-medium shadow flex items-center transition cursor-pointer"
            title="Step 1 Action"
          >
            <FastForward className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sleek Collapsible 6-Phase Planning & Execution Stepper */}
      <div className="border-b border-slate-800 bg-slate-900/40 flex-shrink-0">
        <div
          id="agent-pipeline-toggle"
          onClick={() => setIsPipelineExpanded(!isPipelineExpanded)}
          className="px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-slate-900/70 transition select-none text-[11px]"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <Zap className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span className="font-semibold text-slate-300 truncate">
              {currentPhase && agentState === 'RUNNING'
                ? `${getPhaseNumberDisplay()}: ${currentPhase.step_name}`
                : 'Autonomous EDA Pipeline'}
            </span>
            {agentState === 'RUNNING' && <Loader2 className="w-3 h-3 text-purple-400 animate-spin flex-shrink-0" />}
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* 6 Step Progress Indicator Dots */}
            <div className="flex items-center space-x-1">
              {PHASES.map((p) => {
                const isCompleted = activeIndex > p.id;
                const isCurrent = activeIndex === p.id && agentState === 'RUNNING';
                return (
                  <span
                    key={p.id}
                    className={`w-2 h-2 rounded-full transition-all ${
                      isCurrent
                        ? 'bg-purple-400 ring-2 ring-purple-400/50 animate-pulse'
                        : isCompleted
                        ? 'bg-emerald-400'
                        : 'bg-slate-700'
                    }`}
                    title={`${p.id + 1}. ${p.name}`}
                  />
                );
              })}
            </div>
            {isPipelineExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </div>
        </div>

        {/* Detailed 6-Phase Expansion Drawer */}
        {(isPipelineExpanded || agentState === 'RUNNING') && (
          <div className="p-2.5 pt-0 border-t border-slate-800/60 bg-slate-950/60 animate-fade-in">
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {PHASES.map((p) => {
                const isCompleted = activeIndex > p.id;
                const isCurrent = activeIndex === p.id && agentState === 'RUNNING';

                return (
                  <div
                    key={p.id}
                    className={`p-1.5 rounded-lg border transition text-[10px] flex items-start space-x-1.5 ${
                      isCurrent
                        ? 'bg-purple-950/60 border-purple-500 shadow-sm shadow-purple-500/20'
                        : isCompleted
                        ? 'bg-slate-900/90 border-emerald-900/60 text-slate-300'
                        : 'bg-slate-950 border-slate-800/80 text-slate-500'
                    }`}
                  >
                    <div className="mt-0.5">
                      {isCurrent ? (
                        <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                      ) : isCompleted ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Circle className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                    <div className="truncate flex-1">
                      <div
                        className={`font-semibold truncate ${
                          isCurrent ? 'text-purple-200' : isCompleted ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        {p.id + 1}. {p.name}
                      </div>
                      <div className="text-[8.5px] text-slate-500 truncate">{p.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {currentPhase && agentState === 'RUNNING' && (
              <div className="mt-2 p-2 rounded-lg bg-purple-950/40 border border-purple-800/60 text-[10px] font-mono text-purple-200 flex items-start space-x-1.5">
                <Loader2 className="w-3 h-3 text-purple-400 animate-spin mt-0.5 flex-shrink-0" />
                <div className="leading-tight truncate">
                  {currentPhase.thought || 'Executing autonomous phase instructions...'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Space-Efficient Quick Autonomous Goal Chips */}
      <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/30 flex items-center space-x-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
        <span className="text-[10px] uppercase font-bold text-slate-500 font-mono flex-shrink-0 flex items-center space-x-1">
          <Sparkles className="w-3 h-3 text-purple-400" />
          <span>Goals:</span>
        </span>
        {presets.map((p) => (
          <button
            key={p.name}
            onClick={() => onLaunchTask(p.goal, p.scale, p.id, openrouterKey, selectedModel)}
            className="px-2.5 py-0.5 rounded-full bg-slate-900 hover:bg-purple-950/60 border border-slate-800 hover:border-purple-600 text-[11px] text-slate-300 font-mono transition flex items-center space-x-1 flex-shrink-0 cursor-pointer shadow-sm active:scale-95"
            title={`Launch Scale ${p.scale}: ${p.name}`}
          >
            <span>{p.name}</span>
            <span className="text-[9px] text-purple-400 font-bold">S{p.scale}</span>
          </button>
        ))}
        <button
          onClick={() => setIsCustomLauncherOpen(!isCustomLauncherOpen)}
          className="px-2 py-0.5 rounded-full bg-purple-950/50 hover:bg-purple-900/80 border border-purple-800 text-[10px] text-purple-300 font-mono transition flex items-center space-x-1 flex-shrink-0 cursor-pointer"
        >
          <PlusCircle className="w-3 h-3" />
          <span>Custom</span>
        </button>
      </div>

      {/* Custom Goal Input Drawer */}
      {isCustomLauncherOpen && (
        <form onSubmit={handleLaunchCustomGoal} className="p-3 bg-slate-900/95 border-b border-purple-600/50 space-y-2 animate-fade-in flex-shrink-0">
          <div className="text-[11px] font-bold text-purple-300">Design Custom Circuit Specification</div>
          <textarea
            placeholder="e.g. 'Design a 4-bit priority encoder with valid output and active-low enable, run truth table simulation'..."
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            rows={2}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
          />
          <div className="flex items-center space-x-2">
            <select
              value={customScale}
              onChange={(e) => setCustomScale(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 focus:outline-none"
            >
              <option value={1}>Scale 1: Gate Level</option>
              <option value={2}>Scale 2: RTL Module</option>
              <option value={3}>Scale 3: Datapath Subsystem</option>
              <option value={4}>Scale 4: CPU Architecture</option>
            </select>
            <input
              type="text"
              placeholder="Module name (optional, e.g. mux_4to1)"
              value={customCircuitName}
              onChange={(e) => setCustomCircuitName(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 focus:outline-none font-mono"
            />
          </div>
          <button
            type="submit"
            className="w-full py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Launch Autonomous Pipeline</span>
          </button>
        </form>
      )}

      {/* View Mode Toggle: Interactive Chat vs Detailed Telemetry */}
      <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between text-[10px]">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setViewMode('chat')}
            className={`px-2 py-0.5 rounded-md flex items-center space-x-1 transition font-medium ${
              viewMode === 'chat'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Interactive Co-Pilot Chat</span>
          </button>
          <button
            onClick={() => setViewMode('telemetry')}
            className={`px-2 py-0.5 rounded-md flex items-center space-x-1 transition font-medium ${
              viewMode === 'telemetry'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListFilter className="w-3 h-3" />
            <span>Engineering Logs</span>
          </button>
        </div>
        <span className="text-slate-500 font-mono text-[9px]">{logs.length} events</span>
      </div>

      {/* Materialized Hardware Artifacts & Architecture Inspector */}
      {materializedFiles.length > 0 && (
        <div className="mx-3 my-1.5 p-2.5 rounded-xl bg-gradient-to-r from-purple-950/50 via-slate-900/80 to-slate-950 border border-purple-800/60 shadow-md flex-shrink-0">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setIsArtifactsOpen(!isArtifactsOpen)}
          >
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] font-bold text-slate-100">Materialized Architecture Artifacts</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/70 text-emerald-300 font-mono font-bold">
                  {materializedFiles.length} files
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1 text-slate-400 hover:text-white">
              <span className="text-[9.5px] font-mono">{isArtifactsOpen ? 'Hide' : 'Show'}</span>
              {isArtifactsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </div>

          {isArtifactsOpen && (
            <div className="mt-2 space-y-2 border-t border-slate-800/80 pt-2 text-[10px]">
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                {materializedFiles.map((f, i) => {
                  const isTop = f === materializedTop || f.endsWith('processor_top.vhd') || f.endsWith('top.vhd');
                  return (
                    <div
                      key={i}
                      className={`px-2 py-0.5 rounded font-mono text-[9px] flex items-center space-x-1 border ${
                        isTop
                          ? 'bg-purple-900/70 border-purple-500 text-purple-200 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <span>{f.split('/').pop()}</span>
                      {isTop && <span className="text-[8px] text-amber-300">★ TOP</span>}
                    </div>
                  );
                })}
              </div>

              {onApplyDesignToCanvas && circuitContext?.vhdl_code && (
                <button
                  onClick={() => onApplyDesignToCanvas(circuitContext.vhdl_code || '', circuitContext.circuit_name || 'processor_top')}
                  className="w-full py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-bold text-[10.5px] flex items-center justify-center space-x-1.5 transition cursor-pointer shadow-md active:scale-98"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>⚡ Apply to Studio Canvas (Elaborate Schematic)</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stream Area: Either Interactive Chat Conversation or Engineering Logs */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-mono text-xs">
        {logs.length === 0 && userChatMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 text-center text-xs">
            <div>
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-400" />
              <p className="text-slate-300 font-medium">Autonomous Co-Pilot Ready</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-xs">
                Select a preset goal above, launch a custom design specification, or send steering instructions below.
              </p>
            </div>
          </div>
        ) : viewMode === 'chat' ? (
          // Two-Way Interactive Co-Pilot Conversation Stream
          <div className="space-y-3">
            {logs.map((log, idx) => {
              const isUser = log.action === 'user_steer' || log.action === 'user_chat';
              const isAgentReply = log.action === 'agent_reply' || log.action === 'task_complete';

              if (isUser) {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[85%] bg-purple-900/60 border border-purple-600/60 rounded-2xl rounded-tr-sm p-2.5 text-xs text-purple-100 shadow-md">
                      <div className="flex items-center space-x-1.5 text-[9px] text-purple-300 font-semibold mb-1">
                        <User className="w-3 h-3" />
                        <span>You (Human Co-Pilot)</span>
                      </div>
                      <p className="font-sans leading-relaxed">{log.thought.replace("Human Intervention: Received guidance: ", "").replace("Human Co-Pilot: ", "").replace(/['"]/g, "")}</p>
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className="flex items-start space-x-2">
                  <div className="w-6 h-6 rounded-md bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400 flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="max-w-[88%] bg-slate-900/90 border border-slate-800 rounded-2xl rounded-tl-sm p-2.5 text-xs text-slate-200 shadow-sm">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                      <span className="font-semibold text-purple-300 font-mono">{log.state}</span>
                      <div className="flex items-center space-x-1">
                        {log.details?.model && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                            {log.details.model.split('/').pop()}
                          </span>
                        )}
                        {log.action && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-950 text-slate-400">
                            {log.action}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="font-sans text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap">
                      {log.thought}
                    </p>
                    {log.details && Object.keys(log.details).length > 0 && !log.details.model && (
                      <div className="mt-2 p-1.5 bg-slate-950 rounded border border-slate-800 text-[10px] text-slate-400 overflow-x-auto">
                        <pre>{JSON.stringify(log.details, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isCopilotThinking && (
              <div className="flex items-start space-x-2 animate-pulse">
                <div className="w-6 h-6 rounded-md bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400 flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-purple-300">
                  <span className="font-mono text-[11px] text-slate-300">Co-Pilot analyzing circuit & synthesizing response...</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
        ) : (
          // Detailed Raw Engineering Telemetry
          logs.map((log, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span className="px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-800 text-purple-300 font-bold">
                  {log.state}
                </span>
                {log.action && <span className="text-slate-400 font-semibold">{log.action}</span>}
              </div>
              <div className="text-slate-200 leading-relaxed text-[11px] font-sans">{log.thought}</div>
              {log.details && Object.keys(log.details).length > 0 && (
                <div className="mt-1.5 p-1.5 bg-slate-950 rounded border border-slate-800 text-[10px] text-slate-400 overflow-x-auto">
                  <pre>{JSON.stringify(log.details, null, 2)}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Quick Suggestion Chips */}
      <div className="px-2.5 py-1.5 border-t border-slate-800/80 bg-slate-900/30 flex items-center space-x-1.5 overflow-x-auto text-[9.5px]">
        {quickPromptChips.map((chip, i) => (
          <button
            key={i}
            onClick={() => handleSendSteer(undefined, chip)}
            className="px-2 py-0.5 rounded-full bg-slate-900 hover:bg-purple-950/70 border border-slate-800 hover:border-purple-600/70 text-slate-400 hover:text-purple-200 whitespace-nowrap transition"
          >
            + {chip}
          </button>
        ))}
      </div>

      {/* Real-time Steer / Prompt Chat Form */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-900/60">
        <form onSubmit={(e) => handleSendSteer(e)} className="flex items-center space-x-1.5">
          <input
            type="text"
            placeholder="Instruct agent (e.g. 'Add active-low reset', 'Optimize delay', 'Test 100ns')..."
            value={steerPrompt}
            onChange={(e) => setSteerPrompt(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
          />
          <button
            type="submit"
            className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow transition"
            title="Send Real-time Guidance / Prompt"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* OpenRouter Model Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-400">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">OpenRouter LLM Configuration</h3>
                  <p className="text-[11px] text-slate-400">Connect frontier AI models for autonomous circuit synthesis</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Server Env Key Status Badge */}
            {serverKeyStatus?.is_configured && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between font-mono">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>
                    Server {serverKeyStatus.source === 'env' ? 'Environment (.env)' : 'Active'}: {serverKeyStatus.masked_key}
                  </span>
                </div>
                <span className="text-[10px] bg-emerald-900/60 px-1.5 py-0.5 rounded border border-emerald-700">
                  Zero Plaintext Logging
                </span>
              </div>
            )}

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <Key className="w-3.5 h-3.5 text-purple-400" />
                  <span>OpenRouter API Key</span>
                </span>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center space-x-0.5"
                >
                  <span>Get Key</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </label>
              <input
                type="password"
                placeholder={serverKeyStatus?.is_configured ? "Using active backend credentials (or enter override)" : "sk-or-v1-..."}
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />

              {/* Key Storage Mode */}
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                <span className="text-[10px] text-slate-500">
                  Storage preference:
                </span>
                <div className="flex items-center space-x-3 font-sans">
                  <label className="flex items-center space-x-1 cursor-pointer hover:text-slate-200">
                    <input
                      type="radio"
                      name="storagePref"
                      checked={keyStoragePref === 'session'}
                      onChange={() => setKeyStoragePref('session')}
                      className="accent-purple-500 w-3 h-3"
                    />
                    <span>Session Only (wiped on tab close)</span>
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer hover:text-slate-200">
                    <input
                      type="radio"
                      name="storagePref"
                      checked={keyStoragePref === 'local'}
                      onChange={() => setKeyStoragePref('local')}
                      className="accent-purple-500 w-3 h-3"
                    />
                    <span>Local Browser</span>
                  </label>
                </div>
              </div>

              <p className="text-[10px] text-slate-500">
                Optional: If no key is set, CircuitForge uses its offline deterministic synthesis engine.
              </p>
            </div>

            {/* Model Selection & Search */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                  <span>AI Synthesis Model</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleSaveFavoriteModel(useCustomModel && customModelInput.trim() ? customModelInput.trim() : tempModel)}
                  className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center space-x-1 transition"
                  title="Save current model to favorites"
                >
                  <Bookmark className="w-3 h-3" />
                  <span>Save to Favorites</span>
                </button>
              </div>

              {/* Saved / Favorite Quick Pills */}
              {savedModels.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                    Saved & Recent Models
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {savedModels.map((sm) => {
                      const isActive = (useCustomModel && customModelInput === sm) || (!useCustomModel && tempModel === sm);
                      const shortName = sm.includes('/') ? sm.split('/')[1] : sm;
                      return (
                        <span
                          key={sm}
                          onClick={() => {
                            setTempModel(sm);
                            setCustomModelInput(sm);
                            setUseCustomModel(true);
                          }}
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer border transition ${
                            isActive
                              ? 'bg-purple-900/70 border-purple-500 text-purple-200 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                          title={sm}
                        >
                          <span>{shortName}</span>
                          <button
                            type="button"
                            onClick={(e) => handleRemoveFavoriteModel(sm, e)}
                            className="hover:text-rose-400 opacity-60 hover:opacity-100 transition"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Searchable Model Input with Dropdown */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search all OpenRouter models (e.g. claude, deepseek, gpt, codestral)..."
                  value={modelSearchQuery}
                  onChange={(e) => {
                    setModelSearchQuery(e.target.value);
                    setIsModelSearchOpen(true);
                  }}
                  onFocus={() => setIsModelSearchOpen(true)}
                  className="w-full bg-slate-950 border border-slate-700 hover:border-purple-500/60 focus:border-purple-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none transition shadow-inner"
                />
                {isSearchingModels && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                  </div>
                )}

                {/* Search Results Dropdown */}
                {isModelSearchOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsModelSearchOpen(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur z-50 divide-y divide-slate-800 text-xs p-1 animate-fade-in">
                      {modelSearchResults.length === 0 ? (
                        <div className="p-3 text-center text-slate-400 text-xs">
                          {isSearchingModels ? 'Searching models...' : 'No models found. You can enter any custom Model ID below.'}
                        </div>
                      ) : (
                        modelSearchResults.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => {
                              setTempModel(m.id);
                              setCustomModelInput(m.id);
                              setUseCustomModel(true);
                              setIsModelSearchOpen(false);
                            }}
                            className="p-2 hover:bg-slate-800/80 rounded-lg cursor-pointer transition flex items-start justify-between space-x-2"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-200 text-xs flex items-center space-x-1.5">
                                <span>{m.name}</span>
                                {m.is_reasoning && (
                                  <span className="text-[9px] bg-purple-950 border border-purple-700 text-purple-300 px-1 rounded font-mono">
                                    Reasoning
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-purple-400 font-mono mt-0.5 truncate">
                                {m.id}
                              </div>
                              <p className="text-[10px] text-slate-400 line-clamp-1 font-sans">
                                {m.description}
                              </p>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                              {Math.round((m.context_window || 0) / 1000)}k ctx
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Active Selected Model Display */}
              <div className="p-2 rounded-lg bg-purple-950/40 border border-purple-900/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 text-[11px]">Selected:</span>
                <span className="text-purple-300 font-bold truncate max-w-[240px]">
                  {useCustomModel && customModelInput ? customModelInput : tempModel}
                </span>
              </div>
            </div>

            {/* Test Connection Output */}
            {testStatus && (
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-start space-x-2 ${
                  testStatus.testing
                    ? 'bg-slate-950 border-slate-800 text-slate-300'
                    : testStatus.success
                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                    : 'bg-rose-950/80 border-rose-700 text-rose-300'
                }`}
              >
                {testStatus.testing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400 mt-0.5" />
                ) : testStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="leading-snug">
                  {testStatus.testing ? 'Testing connection to OpenRouter API...' : testStatus.msg}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus?.testing}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition disabled:opacity-50"
              >
                Test Connection
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-3 py-1.5 bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow transition"
                >
                  Save & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
