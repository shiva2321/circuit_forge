import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Bot,
  Play,
  Pause,
  FastForward,
  Send,
  Sparkles,
  CheckCircle2,
  Loader2,
  Circle,
  Settings2,
  Key,
  Cpu,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  AlertOctagon,
  MessageSquare,
  ListFilter,
  User,
  Check,
  RotateCcw,
  Bookmark,
  Star,
  Brain,
  Activity,
  Clock,
  ArrowRight,
  Wrench,
  Code2,
  FileCode,
  Paperclip,
  Square,
  History,
  Plus,
  Trash2,
  RefreshCw,
  GitBranch,
  Terminal,
  Info,
  CornerUpRight,
  MessageSquarePlus,
  ListPlus,
  Monitor,
  Layers,
  Layout,
  Folder,
  Search,
  FileText,
} from 'lucide-react';
import { AgentLog } from '../types/circuit';
import { generateMentalMap } from '../utils/circuitMentalMap';
import { ChatMessageRenderer } from './ChatMessageRenderer';
import { ContextChip, ContextChipItem } from './ContextChip';
import {
  getAgentModels,
  testAgentConnection,
  configureAgent,
  searchAgentModels,
  chatWithAgent,
  getKeyStatus,
  KeyStatus,
  getProjectTree,
  readProjectFile,
  FileTreeNode,
} from '../services/api';

export interface AgentPhaseProgress {
  step_name: string;
  step_index: number;
  total_steps: number;
  status?: string;
  thought?: string;
  step?: number;
  state?: string;
}

export interface AgentSelection {
  type: 'node' | 'wire' | 'code_range' | 'file';
  label: string;
  data: any;
}

interface ChatSession {
  id: string;
  projectId: string;
  startedAt: number;
  lastMessageAt: number;
  preview: string;
  messages: Array<{ id: string; time: number; text: string; isAgent?: boolean; agentThought?: string }>;
  logSnapshot: AgentLog[];
}

interface AgentDeckProps {
  logs: AgentLog[];
  agentState: string;
  onIntervention: (action: 'pause' | 'resume' | 'step' | 'steer' | 'stop', params?: { guidance?: string }) => void;
  onLaunchTask: (goal: string, scale: number, circuitName: string, openrouterKey?: string, model?: string) => void;
  onRunSimulation?: () => void;
  circuitContext?: {
    circuit_name?: string;
    vhdl_code?: string;
    gate_count?: number;
    wire_count?: number;
    probes?: Record<string, string>;
    faults?: Record<string, string>;
    netlist?: any;
    active_file?: string;
    active_tab?: string;
    active_tab_label?: string;
    canvas_live_summary?: string;
    drc_issues?: any[];
    simulation_summary?: any;
    active_selection?: any;
    project_files?: string[];
    attached_chips?: any[];
    [key: string]: any;
  };
  currentPhase?: AgentPhaseProgress | null;
  openrouterKey: string;
  selectedModel: string;
  onUpdateOpenRouterConfig: (key: string, model: string, storagePref?: 'session' | 'local') => void;
  activeProjectId?: string;
  onClearLogs?: () => void;
  onApplyDesignToCanvas?: (vhdlCode: string, circuitName: string) => void;
  currentSelection?: AgentSelection | null;
  onStopAgent?: () => void;
  onRevertAgent?: () => void;
  incomingContextItem?: { type: string; label: string; data: any } | null;
  onClearIncomingContext?: () => void;
}

const PHASES = [
  { id: 0, name: 'Knowledge Retrieval', desc: 'Scale hierarchy & graph query' },
  { id: 1, name: 'Architecture Planning', desc: 'OpenRouter LLM & RTL planning' },
  { id: 2, name: 'AST & Netlist Gen', desc: 'VHDL parsing & wire netlist' },
  { id: 3, name: 'Static DRC Checks', desc: 'Latch inference & timing rules' },
  { id: 4, name: 'Simulation & Tests', desc: 'Testbench waveforms & assertions' },
  { id: 5, name: 'Memory Augmentation', desc: 'Reflection & KG graph update' },
];

// Engineering actions that belong in the Engineering Logs view
const ENGINEERING_ACTIONS = new Set([
  'synthesize', 'drc_check', 'simulate', 'route', 'optimize',
  'vhdl_write', 'netlist_build', 'files_synced', 'materialize_complete',
  'user_steer', 'phase_start', 'phase_complete', 'tool_call_execute',
  'apply_code', 'design', 'compile', 'elaborate', 'generate_testbench',
  'run_assertion', 'timing_analysis', 'place_route', 'bitstream_gen',
]);

const inferScale = (goal: string): number => {
  const g = goal.toLowerCase();
  if (/processor|microprocessor|cpu|riscv|risc-v|rv32|rv64|pipeline|core/.test(g)) return 4;
  if (/alu|subsystem|controller|fsm|uart|dsp|decoder|multiplier|mac/.test(g)) return 3;
  if (/counter|register|shift|timer|fifo|accumulator/.test(g)) return 2;
  return 1;
};

const SESSION_STORAGE_KEY = (projectId: string) => `cf_sessions_${projectId}`;
const MAX_SESSIONS = 10;
const MAX_MESSAGES_PER_SESSION = 60;

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
  onClearLogs,
  onApplyDesignToCanvas,
  currentSelection,
  onStopAgent,
  onRevertAgent,
  incomingContextItem,
  onClearIncomingContext,
}) => {
  // ── Core UI State ──────────────────────────────────────────────────────────
  const [steerPrompt, setSteerPrompt] = useState('');
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'task-wizard' | 'mental-map' | 'eng-logs'>('chat');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPipelineExpanded, setIsPipelineExpanded] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isRedirectOpen, setIsRedirectOpen] = useState(false);
  const [redirectPrompt, setRedirectPrompt] = useState('');

  // ── Autonomous Engineering Task Wizard State ──────────────────────────────
  const [isTaskWizardOpen, setIsTaskWizardOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('Pipelined MAC Unit with Accumulator');
  const [taskRequirements, setTaskRequirements] = useState(
    'Synthesize a 16-bit signed multiply-accumulate unit with 32-bit output register, valid/ready handshake control, synchronous active-low reset, and overflow saturation detection.'
  );
  const [taskStandard, setTaskStandard] = useState('IEEE 1076-2008');
  const [taskScale, setTaskScale] = useState(3);
  const [taskClockFreq, setTaskClockFreq] = useState(100);
  const [taskResetType, setTaskResetType] = useState<'sync_active_low' | 'sync_active_high'>('sync_active_low');
  const [taskZeroLatches, setTaskZeroLatches] = useState(true);
  const [taskCdcProtected, setTaskCdcProtected] = useState(true);
  const [taskSupervisionMode, setTaskSupervisionMode] = useState<'supervised' | 'autonomous'>('supervised');
  const [taskEvolveKnowledge, setTaskEvolveKnowledge] = useState(true);
  const [taskAttachFiles, setTaskAttachFiles] = useState(true);
  const [taskAttachNetlist, setTaskAttachNetlist] = useState(true);
  const [taskAttachDrc, setTaskAttachDrc] = useState(true);

  // ── Context Chips ──────────────────────────────────────────────────────────
  const [contextChips, setContextChips] = useState<ContextChipItem[]>([]);
  const [customContextText, setCustomContextText] = useState('');
  const [projectFiles, setProjectFiles] = useState<Array<{ name: string; path: string; ext?: string; size?: number }>>([]);
  const [mentionMenu, setMentionMenu] = useState<{
    open: boolean;
    type: 'file' | 'window';
    query: string;
    triggerIndex: number;
    selectedIndex: number;
  } | null>(null);
  const [contextModalSearch, setContextModalSearch] = useState('');
  const [contextModalTab, setContextModalTab] = useState<'smart' | 'windows' | 'files'>('smart');

  // ── Chat Session Persistence ───────────────────────────────────────────────
  const [userChatMessages, setUserChatMessages] = useState<Array<{ id: string; time: number; text: string; isAgent?: boolean; agentThought?: string; action?: any }>>(() => {
    try {
      const pid = activeProjectId || 'default';
      const stored = localStorage.getItem(`cf_current_msgs_${pid}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    try {
      const pid = activeProjectId || 'default';
      const stored = localStorage.getItem(SESSION_STORAGE_KEY(pid));
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [isPipelineTraceOpen, setIsPipelineTraceOpen] = useState(false);
  const [excludedContextKeys, setExcludedContextKeys] = useState<Set<string>>(new Set());
  const [showTopContextPicker, setShowTopContextPicker] = useState(false);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [customContextNote, setCustomContextNote] = useState('');
  const [clearedLogsTimestamp, setClearedLogsTimestamp] = useState<number>(() => {
    try {
      const pid = activeProjectId || 'default';
      const val = localStorage.getItem(`cf_cleared_logs_ts_${pid}`);
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  });

  // ── Mental Map ─────────────────────────────────────────────────────────────
  const [mentalMapLastUpdated, setMentalMapLastUpdated] = useState(Date.now());
  const [mentalMapPulse, setMentalMapPulse] = useState(false);
  const lastLogCountRef = useRef(logs.length);

  // ── Model & Settings ───────────────────────────────────────────────────────
  const [tempApiKey, setTempApiKey] = useState(openrouterKey);
  const [tempModel, setTempModel] = useState(selectedModel);
  const [customModelInput, setCustomModelInput] = useState('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelSearchResults, setModelSearchResults] = useState<any[]>([]);
  const [isSearchingModels, setIsSearchingModels] = useState(false);
  const [isModelSearchOpen, setIsModelSearchOpen] = useState(false);
  const [serverKeyStatus, setServerKeyStatus] = useState<KeyStatus | null>(null);
  const [keyStoragePref, setKeyStoragePref] = useState<'session' | 'local'>(() =>
    sessionStorage.getItem('circuitforge_openrouter_key') ? 'session' : 'local'
  );
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [testStatus, setTestStatus] = useState<{ testing: boolean; success?: boolean; msg?: string } | null>(null);
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
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider: string }>>([
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 Reasoning', provider: 'DeepSeek' },
    { id: 'openai/gpt-4o', name: 'GPT-4o Omnimodal', provider: 'OpenAI' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'Meta' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', provider: 'Qwen' },
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google' },
  ]);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // ── Artifacts ──────────────────────────────────────────────────────────────
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(true);
  const latestMaterializedLog = [...logs].reverse().find(
    (l) => l.action === 'files_synced' || l.action === 'materialize_complete'
  );
  const materializedFiles: string[] = latestMaterializedLog?.details?.files || [];
  const materializedTop: string = latestMaterializedLog?.details?.top_file || '';

  // ── Live Mental Map ────────────────────────────────────────────────────────
  const liveMentalMap = useMemo(() => {
    return generateMentalMap(
      circuitContext?.netlist || { nodes: [], wires: [], primary_inputs: [], primary_outputs: [] },
      circuitContext?.probes || {},
      circuitContext?.vhdl_code || '',
      circuitContext?.faults || {},
      circuitContext?.circuit_name || 'active_circuit',
      circuitContext?.active_tab || 'design',
      circuitContext?.active_tab_label || 'Design & RTL Studio',
      {
        currentPhase,
        agentState,
        logs,
        activeGoal: steerPrompt,
      }
    );
  }, [
    circuitContext?.netlist,
    circuitContext?.probes,
    circuitContext?.vhdl_code,
    circuitContext?.circuit_name,
    circuitContext?.faults,
    circuitContext?.active_tab,
    circuitContext?.active_tab_label,
    circuitContext?.gate_count,
    circuitContext?.wire_count,
    circuitContext?.canvas_live_summary,
    currentPhase,
    agentState,
    logs,
    steerPrompt,
  ]);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Instant reactive update whenever mental map data changes (add, update, or remove)
  useEffect(() => {
    setMentalMapLastUpdated(Date.now());
    setMentalMapPulse(true);
    const timer = setTimeout(() => setMentalMapPulse(false), 1200);
    return () => clearTimeout(timer);
  }, [liveMentalMap]);

  // Pulse mental map when new TOOL_RESULT log arrives
  useEffect(() => {
    if (logs.length > lastLogCountRef.current) {
      const newLog = logs[logs.length - 1];
      if (newLog?.state === 'TOOL_RESULT' || newLog?.action) {
        setMentalMapLastUpdated(Date.now());
        setMentalMapPulse(true);
        setTimeout(() => setMentalMapPulse(false), 1500);
      }
      lastLogCountRef.current = logs.length;
    }
  }, [logs]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, userChatMessages]);

  // Sync key/model
  useEffect(() => {
    setTempApiKey(openrouterKey);
    setTempModel(selectedModel);
    if (!availableModels.some((m) => m.id === selectedModel)) {
      setCustomModelInput(selectedModel);
      setUseCustomModel(true);
    }
  }, [openrouterKey, selectedModel]);

  // Load available models
  useEffect(() => {
    getAgentModels().then((data) => {
      if (data.models?.length > 0) setAvailableModels(data.models);
    }).catch(() => {});
  }, []);

  // Key status
  useEffect(() => {
    getKeyStatus().then(setServerKeyStatus).catch(() => {});
  }, [isSettingsOpen]);

  // Debounced model search
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setIsSearchingModels(true);
      try {
        const res = await searchAgentModels(modelSearchQuery);
        if (active) setModelSearchResults(res.models || []);
      } catch {
        if (active) setModelSearchResults([]);
      } finally {
        if (active) setIsSearchingModels(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [modelSearchQuery]);

  // Persist current messages to localStorage
  useEffect(() => {
    try {
      const pid = activeProjectId || 'default';
      localStorage.setItem(`cf_current_msgs_${pid}`, JSON.stringify(userChatMessages.slice(-MAX_MESSAGES_PER_SESSION)));
    } catch {}
  }, [userChatMessages, activeProjectId]);

  // Sync messages, sessions, and cleared log timestamp when activeProjectId changes
  useEffect(() => {
    const pid = activeProjectId || 'default';
    try {
      const storedMsgs = localStorage.getItem(`cf_current_msgs_${pid}`);
      setUserChatMessages(storedMsgs ? JSON.parse(storedMsgs) : []);
      const storedSessions = localStorage.getItem(SESSION_STORAGE_KEY(pid));
      setChatSessions(storedSessions ? JSON.parse(storedSessions) : []);
      const storedTs = localStorage.getItem(`cf_cleared_logs_ts_${pid}`);
      setClearedLogsTimestamp(storedTs ? parseInt(storedTs, 10) : 0);
    } catch {
      setUserChatMessages([]);
      setChatSessions([]);
      setClearedLogsTimestamp(0);
    }
  }, [activeProjectId]);

  // Auto-add current canvas selection as a context chip suggestion
  useEffect(() => {
    if (!currentSelection) return;
    // Only suggest if not already in chips
    const alreadyExists = contextChips.some(c => c.data?.id === currentSelection.data?.id && c.type === currentSelection.type);
    if (alreadyExists) return;
    // Don't auto-add; just make it visible in context picker
  }, [currentSelection]);

  // ── Context Chip Helpers ───────────────────────────────────────────────────
  const addContextChip = useCallback((chip: Omit<ContextChipItem, 'id'>) => {
    setContextChips(prev => {
      if (prev.some(c => c.label === chip.label && c.type === chip.type)) return prev;
      return [...prev, { ...chip, id: `chip_${Date.now()}_${Math.random().toString(36).slice(2)}` }];
    });
  }, []);

  // Listen to external context additions from SchematicCanvas, CodeEditor, or WaveformViewer
  useEffect(() => {
    if (incomingContextItem) {
      addContextChip({
        type: incomingContextItem.type as any,
        label: incomingContextItem.label,
        data: incomingContextItem.data,
      });
      onClearIncomingContext?.();
    }
  }, [incomingContextItem, addContextChip, onClearIncomingContext]);

  const removeContextChip = useCallback((id: string) => {
    setContextChips(prev => prev.filter(c => c.id !== id));
  }, []);

  const buildContextString = useCallback(() => {
    if (contextChips.length === 0) return '';
    const parts = contextChips.map(chip => {
      if (chip.type === 'file') {
        const codeSnippet = chip.data?.content ? `\n\`\`\`vhdl\n${chip.data.content}\n\`\`\`` : '';
        return `[Attached Project File: ${chip.data?.path || chip.label}]${codeSnippet}`;
      }
      if (chip.type === 'window') {
        return `[Attached Workspace Window: ${chip.label}]\nLive Window Telemetry: ${JSON.stringify(chip.data, null, 2)}`;
      }
      if (chip.type === 'tab') {
        const code = chip.data?.code ? `\n\`\`\`vhdl\n${chip.data.code}\n\`\`\`` : '';
        return `[Attached Editor Tab: ${chip.label}]${code}`;
      }
      if (chip.type === 'screen') {
        return `[Attached Studio Screen: ${chip.label} — state: ${JSON.stringify(chip.data)}]`;
      }
      if (chip.type === 'node') return `[Canvas Node: ${chip.label} — type: ${chip.data?.type || 'component'}, inputs: ${chip.data?.inputs?.map((i: any) => i.name).join(', ') || 'none'}, outputs: ${chip.data?.outputs?.map((o: any) => o.name).join(', ') || 'none'}]`;
      if (chip.type === 'wire') return `[Canvas Wire: net "${chip.label}"]`;
      if (chip.type === 'drc_issue') return `[DRC Issue: ${chip.label} — details: ${JSON.stringify(chip.data)}]`;
      if (chip.type === 'canvas_snapshot') return `[Canvas Snapshot: ${chip.data?.gates || 0} gates, ${chip.data?.wires || 0} nets, summary: ${chip.data?.summary || 'active'}]`;
      if (chip.type === 'chat_history') return `[Prior Context: last ${chip.data?.count || 5} messages]`;
      if (chip.type === 'custom') return `[User Engineering Directive: ${chip.data?.text || chip.label}]`;
      return `[${chip.type}: ${chip.label}]`;
    });
    return '\n\n=== ATTACHED WORKSPACE CONTEXT ===\n' + parts.join('\n\n') + '\n=================================';
  }, [contextChips]);

  // ── Session Management ────────────────────────────────────────────────────
  const saveCurrentSession = useCallback(() => {
    if (userChatMessages.length === 0) return;
    const pid = activeProjectId || 'default';
    const session: ChatSession = {
      id: `session_${Date.now()}`,
      projectId: pid,
      startedAt: userChatMessages[0]?.time || Date.now(),
      lastMessageAt: userChatMessages[userChatMessages.length - 1]?.time || Date.now(),
      preview: userChatMessages[0]?.text?.slice(0, 80) || '',
      messages: userChatMessages.slice(-MAX_MESSAGES_PER_SESSION),
      logSnapshot: logs.slice(-20),
    };
    setChatSessions(prev => {
      const updated = [session, ...prev].slice(0, MAX_SESSIONS);
      try { localStorage.setItem(SESSION_STORAGE_KEY(pid), JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [userChatMessages, logs, activeProjectId]);

  const restoreSession = useCallback((session: ChatSession) => {
    setUserChatMessages(session.messages);
    setClearedLogsTimestamp(0);
    setShowHistoryPanel(false);
  }, []);

  const restartSessionFromLast = useCallback((session: ChatSession) => {
    setUserChatMessages(session.messages);
    const lastUserMsg = [...session.messages].reverse().find(m => !m.isAgent);
    if (lastUserMsg) {
      setSteerPrompt(lastUserMsg.text);
    }
    setClearedLogsTimestamp(0);
    setShowHistoryPanel(false);
  }, []);

  const handleNewChat = useCallback(() => {
    if (userChatMessages.length > 0) {
      saveCurrentSession();
    }
    const now = Date.now();
    const pid = activeProjectId || 'default';
    setClearedLogsTimestamp(now);
    try {
      localStorage.setItem(`cf_cleared_logs_ts_${pid}`, now.toString());
      localStorage.removeItem(`cf_current_msgs_${pid}`);
    } catch {}
    onClearLogs?.();
    setUserChatMessages([
      {
        id: `welcome_${now}`,
        time: now,
        text: '👋 **Hardware Co-Pilot Ready**\n\nAsk questions, explore architectural alternatives, verify VHDL syntax, or inspect canvas DRC rules. Type your message below.',
        isAgent: true,
      }
    ]);
    setSteerPrompt('');
    setContextChips([]);
    setIsPipelineTraceOpen(false);
    setViewMode('chat');
  }, [userChatMessages.length, saveCurrentSession, activeProjectId, onClearLogs]);

  const handleOpenTaskWizard = useCallback(() => {
    setViewMode('task-wizard');
  }, []);

  const handleLaunchTaskFromWizard = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (userChatMessages.length > 0) {
      saveCurrentSession();
    }
    if (agentState === 'RUNNING' || agentState === 'PAUSED') {
      onIntervention('stop');
      onStopAgent?.();
    }
    const now = Date.now();
    const pid = activeProjectId || 'default';
    setClearedLogsTimestamp(now);
    try {
      localStorage.setItem(`cf_cleared_logs_ts_${pid}`, now.toString());
      localStorage.removeItem(`cf_current_msgs_${pid}`);
    } catch {}
    onClearLogs?.();

    const cleanCircuitName = `task_${taskTitle.slice(0, 16).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${Date.now().toString(36)}`;

    // Create structured task briefing message
    const briefingMsg = {
      id: `task_brief_${now}`,
      time: now,
      text: `🚀 **Autonomous Engineering Mission Launched**\n\n**Goal**: ${taskTitle}\n**Standard**: ${taskStandard}\n**Constraints**: ${taskClockFreq} MHz • ${taskResetType === 'sync_active_low' ? 'Sync Active-Low (rst_n)' : 'Sync Active-High (rst)'} • Zero Latches Guaranteed\n**Supervision Mode**: ${taskSupervisionMode === 'supervised' ? 'Supervised (Human Approval Required)' : 'Autonomous Background Execution'}\n\n*Agent is working in the background. High-level milestone updates will appear below.*`,
      isAgent: true,
      details: {
        type: 'task_briefing',
        goal: taskTitle,
        requirements: taskRequirements,
        standard: taskStandard,
        scale: taskScale,
        clockFreq: taskClockFreq,
        resetType: taskResetType,
        supervisionMode: taskSupervisionMode,
        evolveKnowledge: taskEvolveKnowledge,
        attachedContext: [
          taskAttachFiles && circuitContext?.active_file ? `File: ${circuitContext.active_file}` : null,
          taskAttachNetlist ? `Canvas: ${circuitContext?.gate_count || 0} gates, ${circuitContext?.wire_count || 0} nets` : null,
          taskAttachDrc && (circuitContext?.drc_issues?.length || 0) > 0 ? `DRC: ${circuitContext?.drc_issues?.length} issues` : null,
        ].filter(Boolean),
      }
    };

    setUserChatMessages([briefingMsg]);
    setSteerPrompt('');
    setContextChips([]);
    setIsPipelineTraceOpen(false);
    setViewMode('chat');
    setIsTaskWizardOpen(false);

    // Launch background pipeline
    onLaunchTask(taskTitle, taskScale, cleanCircuitName, openrouterKey, selectedModel);
  }, [
    userChatMessages.length,
    saveCurrentSession,
    agentState,
    onIntervention,
    onStopAgent,
    activeProjectId,
    onClearLogs,
    taskTitle,
    taskRequirements,
    taskStandard,
    taskScale,
    taskClockFreq,
    taskResetType,
    taskSupervisionMode,
    taskEvolveKnowledge,
    taskAttachFiles,
    taskAttachNetlist,
    taskAttachDrc,
    circuitContext,
    onLaunchTask,
    openrouterKey,
    selectedModel
  ]);

  const handleRemoveTopContext = useCallback((tokenId: string) => {
    if (tokenId === 'file' || tokenId === 'canvas' || tokenId === 'selection' || tokenId === 'drc' || tokenId === 'probes') {
      setExcludedContextKeys(prev => new Set([...prev, tokenId]));
    } else {
      removeContextChip(tokenId);
    }
  }, [removeContextChip]);

  const handleRestoreTopContext = useCallback((tokenId: string) => {
    setExcludedContextKeys(prev => {
      const next = new Set(prev);
      next.delete(tokenId);
      return next;
    });
  }, []);

  const handleResetAllContext = useCallback(() => {
    setExcludedContextKeys(new Set());
    setContextChips([]);
  }, []);

  const handleAddCustomNote = useCallback(() => {
    if (!customContextNote.trim()) return;
    addContextChip({
      type: 'custom',
      label: customContextNote.trim().slice(0, 24),
      data: { text: customContextNote.trim() },
    });
    setCustomContextNote('');
    setShowTopContextPicker(false);
  }, [customContextNote, addContextChip]);

  // ── Project Files Discovery ───────────────────────────────────────────────
  const refreshProjectFiles = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const res = await getProjectTree(activeProjectId);
      if (res?.tree) {
        const flatten = (nodes: FileTreeNode[]): Array<{ name: string; path: string; ext?: string; size?: number }> => {
          const list: Array<{ name: string; path: string; ext?: string; size?: number }> = [];
          for (const n of nodes) {
            if (!n.is_dir) {
              const ext = n.name.split('.').pop() || '';
              list.push({ name: n.name, path: n.path, ext, size: n.size });
            }
            if (n.children) {
              list.push(...flatten(n.children));
            }
          }
          return list;
        };
        const files = flatten(res.tree);
        setProjectFiles(files);
      }
    } catch (e) {
      console.error('Failed to load project files for autocomplete', e);
    }
  }, [activeProjectId]);

  useEffect(() => {
    refreshProjectFiles();
  }, [refreshProjectFiles]);

  const effectiveFiles = useMemo(() => {
    if (projectFiles.length > 0) return projectFiles;
    const list: Array<{ name: string; path: string; ext?: string; size?: number }> = [];
    if (circuitContext?.active_file) {
      list.push({
        name: circuitContext.active_file.split('/').pop() || circuitContext.active_file,
        path: circuitContext.active_file,
        ext: circuitContext.active_file.split('.').pop() || 'vhd',
      });
    }
    return list;
  }, [projectFiles, circuitContext?.active_file]);

  const attachProjectFileChip = useCallback(async (file: { name: string; path: string; ext?: string }) => {
    let content = '';
    if (activeProjectId) {
      try {
        const res = await readProjectFile(activeProjectId, file.path);
        content = res.content || '';
      } catch (e) {
        console.error('Failed to read file content for chip', e);
      }
    }
    addContextChip({
      type: 'file',
      label: file.name,
      data: {
        name: file.name,
        path: file.path,
        content: content,
        ext: file.ext,
      },
    });
  }, [activeProjectId, addContextChip]);

  // ── Available Workspace Windows Catalog for '@' Mention ──────────────────
  const availableWindowContexts = useMemo(() => {
    const list: Array<{
      id: string;
      trigger: string;
      label: string;
      type: 'window' | 'tab' | 'screen';
      category: string;
      description: string;
      data: any;
      statusBadge?: string;
    }> = [
      {
        id: 'win_canvas',
        trigger: '@canvas',
        label: 'Schematic Canvas',
        type: 'window',
        category: 'Workspace Window',
        description: `${circuitContext?.gate_count || 0} gates, ${circuitContext?.wire_count || 0} nets, live schematic & ports`,
        statusBadge: `${circuitContext?.gate_count || 0}g · ${circuitContext?.wire_count || 0}n`,
        data: {
          window: 'canvas',
          circuit_name: circuitContext?.circuit_name,
          gate_count: circuitContext?.gate_count || 0,
          wire_count: circuitContext?.wire_count || 0,
          netlist: circuitContext?.netlist,
          probes: circuitContext?.probes,
          faults: circuitContext?.faults,
          canvas_live_summary: circuitContext?.canvas_live_summary,
        }
      },
      {
        id: 'win_editor',
        trigger: '@editor',
        label: 'VHDL Code Editor',
        type: 'window',
        category: 'Workspace Window',
        description: circuitContext?.active_file ? `Active buffer: ${circuitContext.active_file.split('/').pop()}` : 'Live VHDL code buffer',
        statusBadge: circuitContext?.active_file ? circuitContext.active_file.split('.').pop()?.toUpperCase() : 'VHDL',
        data: {
          window: 'editor',
          file: circuitContext?.active_file,
          code: circuitContext?.vhdl_code,
          code_length: circuitContext?.vhdl_code?.length || 0,
        }
      },
      {
        id: 'win_waveforms',
        trigger: '@waveforms',
        label: 'Waveform Viewer',
        type: 'window',
        category: 'Workspace Window',
        description: 'Digital logic analyzer signals, bus transitions, simulation timing',
        statusBadge: 'Timing Trace',
        data: {
          window: 'waveforms',
          probes: circuitContext?.probes,
          faults: circuitContext?.faults,
        }
      },
      {
        id: 'win_drc',
        trigger: '@drc',
        label: 'DRC & Safety Rules',
        type: 'window',
        category: 'Diagnostics Window',
        description: `${circuitContext?.drc_issues?.length || 0} rule violations, CMOS floating pins, CDC analysis`,
        statusBadge: (circuitContext?.drc_issues?.length || 0) > 0 ? `${circuitContext?.drc_issues?.length} issues` : 'Clean',
        data: {
          window: 'drc',
          issues: circuitContext?.drc_issues || [],
          identifiedIssues: liveMentalMap.identifiedIssues,
        }
      },
      {
        id: 'win_mindmap',
        trigger: '@mindmap',
        label: 'Cognitive Circuit MindMap',
        type: 'window',
        category: 'Cognitive Window',
        description: 'Multi-scale hardware hierarchy, module ontology & system risks',
        statusBadge: `${liveMentalMap.complexity.nodeCount} gates`,
        data: {
          window: 'mindmap',
          complexity: liveMentalMap.complexity,
          issues: liveMentalMap.identifiedIssues,
          criticalPath: liveMentalMap.criticalPath,
        }
      },
      {
        id: 'win_logs',
        trigger: '@logs',
        label: 'Engineering Logs',
        type: 'window',
        category: 'Diagnostics Window',
        description: 'Synthesizer output, compiler logs, autonomous tool execution history',
        statusBadge: `${logs.length} entries`,
        data: {
          window: 'logs',
          recent_logs: logs.slice(-10),
        }
      },
    ];

    if (circuitContext?.active_file) {
      const fileName = circuitContext.active_file.split('/').pop() || circuitContext.active_file;
      list.push({
        id: `tab_${circuitContext.active_file}`,
        trigger: `@tab:${fileName}`,
        label: `Tab: ${fileName}`,
        type: 'tab',
        category: 'Active Tab',
        description: `Current tab buffer (${fileName}) in editor`,
        statusBadge: 'Active Tab',
        data: {
          tab_name: fileName,
          path: circuitContext.active_file,
          code: circuitContext.vhdl_code,
        }
      });
    }

    list.push({
      id: `screen_studio`,
      trigger: `@screen:${circuitContext?.active_tab || 'studio'}`,
      label: `Screen: ${circuitContext?.active_tab_label || 'Current Studio Screen'}`,
      type: 'screen',
      category: 'Screen State',
      description: `Active screen layout and studio UI state (${circuitContext?.active_tab || 'design'})`,
      statusBadge: 'Current Screen',
      data: {
        screen_id: circuitContext?.active_tab || 'design',
        screen_label: circuitContext?.active_tab_label || 'Design & RTL Studio',
        gates: circuitContext?.gate_count,
        wires: circuitContext?.wire_count,
      }
    });

    return list;
  }, [circuitContext, liveMentalMap, logs]);

  // ── Autocomplete Filtering for '/' and '@' ─────────────────────────────────
  const filteredMentionItems = useMemo(() => {
    if (!mentionMenu?.open) return [];
    const q = mentionMenu.query.toLowerCase().trim();
    if (mentionMenu.type === 'file') {
      return effectiveFiles
        .filter(f => !q || f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
        .slice(0, 10)
        .map(f => ({ ...f, triggerType: 'file' as const }));
    } else {
      return availableWindowContexts
        .filter(w => !q || w.trigger.toLowerCase().includes(q) || w.label.toLowerCase().includes(q) || w.description.toLowerCase().includes(q))
        .slice(0, 10)
        .map(w => ({ ...w, triggerType: 'window' as const }));
    }
  }, [mentionMenu, effectiveFiles, availableWindowContexts]);

  const handleSelectMentionItem = useCallback(async (item: any) => {
    if (!mentionMenu) return;
    const textBefore = steerPrompt.slice(0, mentionMenu.triggerIndex);
    const textAfter = steerPrompt.slice(mentionMenu.triggerIndex + mentionMenu.query.length + 1);
    const newPrompt = (textBefore + (textAfter.startsWith(' ') ? textAfter : ' ' + textAfter)).trimStart();
    setSteerPrompt(newPrompt);
    setMentionMenu(null);

    if (item.triggerType === 'file') {
      await attachProjectFileChip(item);
    } else {
      addContextChip({
        type: item.type || 'window',
        label: item.label,
        data: item.data,
      });
    }
  }, [mentionMenu, steerPrompt, attachProjectFileChip, addContextChip]);

  const handlePromptInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setSteerPrompt(val);

    const textBeforeCursor = val.slice(0, cursorPos);
    const lastWordMatch = textBeforeCursor.match(/(?:^|\s)([\/@][a-zA-Z0-9_\-\.:]*)$/);

    if (lastWordMatch && lastWordMatch[1]) {
      const matchText = lastWordMatch[1];
      const triggerChar = matchText[0];
      const query = matchText.slice(1);
      const matchIndex = cursorPos - matchText.length;

      setMentionMenu({
        open: true,
        type: triggerChar === '/' ? 'file' : 'window',
        query: query,
        triggerIndex: matchIndex,
        selectedIndex: 0,
      });
    } else {
      if (mentionMenu?.open) {
        setMentionMenu(null);
      }
    }
  }, [mentionMenu?.open]);

  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMenu?.open && filteredMentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionMenu(prev => prev ? {
          ...prev,
          selectedIndex: (prev.selectedIndex + 1) % filteredMentionItems.length
        } : null);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionMenu(prev => prev ? {
          ...prev,
          selectedIndex: (prev.selectedIndex - 1 + filteredMentionItems.length) % filteredMentionItems.length
        } : null);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selectedItem = filteredMentionItems[mentionMenu.selectedIndex];
        if (selectedItem) {
          handleSelectMentionItem(selectedItem);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionMenu(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }, [mentionMenu, filteredMentionItems, handleSelectMentionItem]);

  // ── Filtered Circuit Context for Agent ────────────────────────────────────
  const filteredCircuitContext = useMemo(() => {
    if (!circuitContext) return circuitContext;
    const filtered = { ...circuitContext };
    if (excludedContextKeys.has('file')) {
      delete filtered.active_file;
      delete filtered.vhdl_code;
    }
    if (excludedContextKeys.has('canvas')) {
      filtered.gate_count = 0;
      filtered.wire_count = 0;
      delete filtered.netlist;
      delete filtered.canvas_live_summary;
    }
    if (excludedContextKeys.has('selection')) {
      delete filtered.active_selection;
    }
    if (excludedContextKeys.has('drc')) {
      filtered.drc_issues = [];
    }
    if (excludedContextKeys.has('probes')) {
      filtered.probes = {};
      filtered.faults = {};
    }
    return filtered;
  }, [circuitContext, excludedContextKeys]);

  const clearCurrentSession = useCallback(() => {
    if (!window.confirm('Clear this conversation? This cannot be undone.')) return;
    saveCurrentSession();
    setUserChatMessages([]);
    try {
      const pid = activeProjectId || 'default';
      localStorage.removeItem(`cf_current_msgs_${pid}`);
    } catch {}
  }, [saveCurrentSession, activeProjectId]);

  const deleteSession = useCallback((sessionId: string) => {
    const pid = activeProjectId || 'default';
    setChatSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      try { localStorage.setItem(SESSION_STORAGE_KEY(pid), JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [activeProjectId]);

  const handleRedirect = useCallback(() => {
    if (!redirectPrompt.trim()) return;
    const ctx = buildContextString();
    const full = `[MISSION REDIRECTION]: ${redirectPrompt.trim()}${ctx}`;
    onIntervention('steer', { guidance: full });
    setUserChatMessages(prev => [
      ...prev,
      { id: `msg_${Date.now()}`, time: Date.now(), text: `🔀 Redirected Agent: ${redirectPrompt.trim()}` }
    ]);
    setRedirectPrompt('');
    setIsRedirectOpen(false);
  }, [redirectPrompt, buildContextString, onIntervention]);

  // ── Agent Actions ─────────────────────────────────────────────────────────
  const handleSendSteer = useCallback(async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const textToSend = overrideText !== undefined ? overrideText : steerPrompt;
    if (!textToSend.trim()) return;

    const contextSuffix = buildContextString();
    const fullMessage = textToSend.trim() + contextSuffix;

    const userMsg = textToSend.trim();
    const chipsToSend = [...contextChips];
    setUserChatMessages(prev => [...prev, { id: `msg_${Date.now()}`, time: Date.now(), text: userMsg }]);
    setSteerPrompt('');
    setContextChips([]);

    if (agentState === 'RUNNING' || agentState === 'PAUSED') {
      onIntervention('steer', { guidance: fullMessage });
    }

    setIsCopilotThinking(true);
    try {
      const res = await chatWithAgent(fullMessage, { ...filteredCircuitContext, attached_chips: chipsToSend }, openrouterKey, selectedModel, activeProjectId);

      if (res.reply) {
        setUserChatMessages(prev => [...prev, {
          id: `agent_${Date.now()}`,
          time: Date.now(),
          text: res.reply,
          isAgent: true,
          agentThought: res.reply,
          action: res.action,
        }]);
      }

      if (res.action?.type === 'design' && res.action.goal) {
        const cleanName = `circuit_${Date.now().toString(36)}`;
        const scale = inferScale(res.action.goal);
        onLaunchTask(res.action.goal, scale, cleanName, openrouterKey, selectedModel);
      } else if (res.action?.type === 'simulate' && onRunSimulation) {
        onRunSimulation();
      } else if (res.action?.type === 'apply_code' && res.action.vhdl_code && onApplyDesignToCanvas) {
        onApplyDesignToCanvas(res.action.vhdl_code, res.action.circuit_name || 'custom_design');
      }
    } catch (err) {
      console.error('Failed to chat with agent', err);
    } finally {
      setIsCopilotThinking(false);
    }
  }, [steerPrompt, buildContextString, agentState, onIntervention, filteredCircuitContext, openrouterKey, selectedModel, activeProjectId, onLaunchTask, onRunSimulation, onApplyDesignToCanvas]);

  const handleLaunchGoal = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const goal = steerPrompt.trim();
    if (!goal) return;
    const cleanName = `task_${goal.slice(0, 12).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}_${Date.now().toString(36)}`;
    const scale = inferScale(goal);
    onLaunchTask(goal, scale, cleanName, openrouterKey, selectedModel);
    setUserChatMessages(prev => [...prev, { id: `msg_${Date.now()}`, time: Date.now(), text: goal }]);
    setSteerPrompt('');
    setContextChips([]);
  }, [steerPrompt, onLaunchTask, openrouterKey, selectedModel]);

  const handleAutoFixAll = useCallback(() => {
    handleSendSteer(undefined, "Repair all floating CMOS inputs, tie unconnected pins to safe logic levels ('0'), resolve any bus contention, clear active stuck-at faults, synthesize the netlist, and apply the repaired design to the canvas.");
  }, [handleSendSteer]);

  const handleFixSingleIssue = useCallback((issue: any) => {
    handleSendSteer(undefined, `Auto-fix DRC issue on node '${issue.target || issue.targetNodeId}' (pin '${issue.targetPort || ''}'): ${issue.suggestedFix}. Synthesize and apply repaired VHDL to canvas.`);
  }, [handleSendSteer]);

  const handleStop = useCallback(() => {
    onIntervention('stop');
    onStopAgent?.();
  }, [onIntervention, onStopAgent]);

  // ── Settings Handlers ─────────────────────────────────────────────────────
  const handleSaveFavoriteModel = (modelId: string) => {
    if (!savedModels.includes(modelId)) {
      const updated = [modelId, ...savedModels.slice(0, 7)];
      setSavedModels(updated);
      localStorage.setItem('circuitforge_saved_models', JSON.stringify(updated));
    }
  };
  const handleRemoveFavoriteModel = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedModels.filter(m => m !== modelId);
    setSavedModels(updated);
    localStorage.setItem('circuitforge_saved_models', JSON.stringify(updated));
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
        setTestStatus({ testing: false, success: true, msg: `Online! ${res.model || activeModel} responded in ${elapsed}ms.` });
        handleSaveFavoriteModel(activeModel);
      } else {
        setTestStatus({ testing: false, success: false, msg: res.error || 'Connection failed.' });
      }
    } catch (e: any) {
      setTestStatus({ testing: false, success: false, msg: e?.message || 'Network error.' });
    }
  };
  const handleSaveSettings = async () => {
    const activeModel = useCustomModel && customModelInput.trim() ? customModelInput.trim() : tempModel;
    onUpdateOpenRouterConfig(tempApiKey, activeModel, keyStoragePref);
    try { await configureAgent(tempApiKey, activeModel); } catch {}
    setIsSettingsOpen(false);
  };

  // ── Phase Progress ────────────────────────────────────────────────────────
  const getActivePhaseIndex = () => {
    if (agentState === 'COMPLETED') return 6;
    if (currentPhase) {
      if (typeof currentPhase.step_index === 'number' && !isNaN(currentPhase.step_index)) return currentPhase.step_index;
      if (typeof (currentPhase as any).step === 'number' && !isNaN((currentPhase as any).step)) return (currentPhase as any).step - 1;
    }
    if (agentState === 'RUNNING') return 1;
    return -1;
  };
  const activeIndex = getActivePhaseIndex();

  const getPhaseNumberDisplay = () => {
    if (!currentPhase) return null;
    const rawIdx = typeof currentPhase.step_index === 'number' && !isNaN(currentPhase.step_index)
      ? currentPhase.step_index + 1
      : typeof (currentPhase as any).step === 'number' && !isNaN((currentPhase as any).step)
      ? (currentPhase as any).step : 1;
    return `Phase ${rawIdx}/6`;
  };

  // ── Quick Prompt Chips (context-aware) ───────────────────────────────────
  const quickPromptChips = useMemo(() => {
    const tab = circuitContext?.active_tab;
    if (tab === 'lifecycle') return [
      '🏭 Run DFM & Multiphysics check for canvas circuit',
      '🌡️ Audit thermal hot spots and MTBF reliability',
      '📦 Verify bill of materials (BOM) availability',
    ];
    if (tab === 'embedded') return [
      '🔌 Map canvas circuit ports to RP2040 GPIOs',
      '💻 Generate C/C++ firmware HAL driver for current circuit',
      '⚡ Test MCU communication bus (SPI/I2C/UART)',
    ];
    if (tab === 'waveform') return [
      '📈 Analyze propagation delay & clock skew',
      '⚡ Detect race conditions and glitch hazards',
      '📋 Simulate verification truth table',
    ];
    if (tab === 'kg') return [
      '🕸️ Inspect multi-scale ontology graph',
      '🔍 Trace upstream dependencies of current netlist',
    ];
    return [
      '🧠 Where are we and what is on the canvas?',
      '💡 Diagnose floating inputs & DRC issues',
      '⚡ Optimize critical path timing',
      '📋 Simulate verification truth table',
    ];
  }, [circuitContext?.active_tab]);

  // ── Engineering Log Filter (Session-scoped) ─────────────────────────────────
  const currentSessionLogs = useMemo(() =>
    logs.filter(log => (log.time || 0) >= clearedLogsTimestamp),
    [logs, clearedLogsTimestamp]
  );

  const engineeringLogs = useMemo(() =>
    currentSessionLogs.filter(log =>
      (log.action && ENGINEERING_ACTIONS.has(log.action)) ||
      log.category === 'engineering' ||
      (log.state === 'TOOL_RESULT' && log.action)
    ),
    [currentSessionLogs]
  );

  // ── Mental Map age display ─────────────────────────────────────────────────
  const mentalMapAge = Math.round((Date.now() - mentalMapLastUpdated) / 1000);

  // ── Context token count summary ───────────────────────────────────────────
  const contextTokens = useMemo(() => {
    const tokens: Array<{ id: string; label: string; icon: React.ReactNode; title: string; canRemove: boolean; isChip?: boolean }> = [];

    // 1. Active File
    if (circuitContext?.active_file && !excludedContextKeys.has('file')) {
      tokens.push({
        id: 'file',
        label: circuitContext.active_file.split('/').pop() || circuitContext.active_file,
        icon: <FileCode className="w-2.5 h-2.5 text-blue-400" />,
        title: `Active file: ${circuitContext.active_file} (click 'x' to exclude from agent)`,
        canRemove: true,
      });
    }

    // 2. Canvas Netlist
    if ((circuitContext?.gate_count || 0) > 0 && !excludedContextKeys.has('canvas')) {
      tokens.push({
        id: 'canvas',
        label: `${circuitContext?.gate_count}g·${circuitContext?.wire_count}n`,
        icon: <Zap className="w-2.5 h-2.5 text-amber-400" />,
        title: `Canvas netlist: ${circuitContext?.gate_count} gates, ${circuitContext?.wire_count} nets (click 'x' to exclude)`,
        canRemove: true,
      });
    }

    // 3. Selection
    if (currentSelection && !excludedContextKeys.has('selection')) {
      tokens.push({
        id: 'selection',
        label: currentSelection.label,
        icon: currentSelection.type === 'node' ? <Cpu className="w-2.5 h-2.5 text-indigo-400" /> : <GitBranch className="w-2.5 h-2.5 text-cyan-400" />,
        title: `Canvas selection: ${currentSelection.label} (click 'x' to exclude)`,
        canRemove: true,
      });
    }

    // 4. DRC Issues
    if ((circuitContext?.drc_issues?.length || 0) > 0 && !excludedContextKeys.has('drc')) {
      tokens.push({
        id: 'drc',
        label: `${circuitContext?.drc_issues?.length} DRC`,
        icon: <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />,
        title: `${circuitContext?.drc_issues?.length} DRC diagnostic issues in context (click 'x' to exclude)`,
        canRemove: true,
      });
    }

    // 5. Attached Context Chips
    contextChips.forEach(chip => {
      tokens.push({
        id: chip.id,
        label: chip.label,
        icon: chip.type === 'node' ? <Cpu className="w-2.5 h-2.5 text-indigo-400" />
            : chip.type === 'wire' ? <GitBranch className="w-2.5 h-2.5 text-cyan-400" />
            : chip.type === 'drc_issue' ? <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />
            : chip.type === 'canvas_snapshot' ? <Zap className="w-2.5 h-2.5 text-amber-400" />
            : chip.type === 'chat_history' ? <MessageSquare className="w-2.5 h-2.5 text-purple-400" />
            : <FileCode className="w-2.5 h-2.5 text-purple-400" />,
        title: `Attached context [${chip.type}]: ${chip.label} (click 'x' to remove)`,
        canRemove: true,
        isChip: true,
      });
    });

    // 6. Active Model
    tokens.push({
      id: 'model',
      label: selectedModel.split('/').pop() || selectedModel,
      icon: <Cpu className="w-2.5 h-2.5 text-slate-400" />,
      title: `Active AI model: ${selectedModel}`,
      canRemove: false,
    });

    return tokens;
  }, [circuitContext, excludedContextKeys, currentSelection, contextChips, selectedModel]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800 text-slate-200 select-none overflow-hidden font-sans">

      {/* ── ROW 1: Identity + Agent Controls ─────────────────────────────── */}
      <div className="relative px-3 py-2 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between flex-shrink-0 backdrop-blur z-30">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-teal-500/20 flex-shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <span>EDA Copilot</span>
              <span className={`font-mono font-semibold px-1.5 rounded text-[9px] ${
                agentState === 'RUNNING' ? 'bg-teal-950/80 border border-teal-600/70 text-teal-300 animate-pulse'
                : agentState === 'PAUSED' ? 'bg-amber-950 border border-amber-700 text-amber-300'
                : agentState === 'COMPLETED' ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                : 'bg-slate-800 text-slate-400'
              }`}>
                {agentState}
              </span>
            </div>
          </div>
        </div>

        {/* Agent Controls: Stop | Revert | Pause/Resume | Step | Model | Settings */}
        <div className="flex items-center space-x-1 flex-shrink-0">
          {/* Stop */}
          {(agentState === 'RUNNING' || agentState === 'PAUSED') && (
            <button
              onClick={handleStop}
              className="p-1 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs flex items-center transition cursor-pointer"
              title="Stop Agent — halt pipeline and reset to IDLE"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          )}

          {/* Revert */}
          {onRevertAgent && (
            <button
              onClick={onRevertAgent}
              className="p-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs flex items-center transition cursor-pointer"
              title="Revert — roll back last agent VHDL change"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          {/* Pause / Resume */}
          {agentState === 'PAUSED' ? (
            <button onClick={() => onIntervention('resume')} className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center transition cursor-pointer" title="Resume Agent">
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button onClick={() => onIntervention('pause')} className="p-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg flex items-center transition cursor-pointer" title="Pause Agent">
              <Pause className="w-3.5 h-3.5 fill-current" />
            </button>
          )}

          {/* Step */}
          <button onClick={() => onIntervention('step')} className="p-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg flex items-center transition cursor-pointer" title="Step 1 Action">
            <FastForward className="w-3.5 h-3.5" />
          </button>

          {/* Redirect Agent Control */}
          <button
            onClick={() => setIsRedirectOpen(!isRedirectOpen)}
            className={`p-1 rounded-lg text-xs flex items-center transition cursor-pointer ${
              isRedirectOpen
                ? 'bg-teal-600 text-white ring-2 ring-teal-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
            title="Redirect Agent — steer mission with context & prompt"
          >
            <CornerUpRight className="w-3.5 h-3.5" />
          </button>

          {/* Model Picker */}
          <div className="relative">
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="px-2 py-1 rounded-lg border border-slate-700 hover:border-teal-500 bg-slate-800/90 text-slate-300 hover:text-white text-[10px] font-mono flex items-center space-x-1 transition cursor-pointer"
              title="Switch Active AI Model"
            >
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span className="max-w-[90px] truncate">{selectedModel.split('/').pop() || selectedModel}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {isModelDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsModelDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-1 z-50 divide-y divide-slate-800 text-xs animate-fade-in font-mono">
                  <div className="px-2 py-1 text-[9px] uppercase font-bold text-slate-400">Active Model</div>
                  <div className="py-1 space-y-0.5">
                    {availableModels.slice(0, 6).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { onUpdateOpenRouterConfig(openrouterKey, m.id); setIsModelDropdownOpen(false); }}
                        className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-[11px] transition cursor-pointer ${selectedModel === m.id ? 'bg-slate-800 text-teal-200 font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}
                      >
                        <span className="truncate">{m.name}</span>
                        {selectedModel === m.id && <Check className="w-3 h-3 text-teal-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                  <div className="pt-1">
                    <button
                      onClick={() => { setIsModelDropdownOpen(false); setIsSettingsOpen(true); }}
                      className="w-full text-left px-2 py-1 rounded text-[10px] text-teal-400 hover:text-teal-300 hover:bg-slate-800/60 flex items-center space-x-1 transition cursor-pointer"
                    >
                      <Settings2 className="w-3 h-3" />
                      <span>API Key & Advanced Settings...</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Settings */}
          <button onClick={() => setIsSettingsOpen(true)} className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer" title="Settings">
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── REDIRECT MISSION DRAWER ────────────────────────────────────────── */}
      {isRedirectOpen && (
        <div className="p-2.5 bg-gradient-to-r from-indigo-950/95 via-purple-950/90 to-slate-950 border-b border-indigo-700/80 shadow-lg text-xs font-sans space-y-2 animate-fade-in flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-indigo-200 font-bold text-[11px]">
              <CornerUpRight className="w-3.5 h-3.5 text-indigo-400" />
              <span>Redirect Agent Mission</span>
              <span className="px-1.5 py-0.2 rounded bg-indigo-900 border border-indigo-600 text-[9px] font-mono text-indigo-300">
                Steer with Context
              </span>
            </div>
            <button onClick={() => setIsRedirectOpen(false)} className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-indigo-900/50">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-slate-300 leading-tight">
            Inject immediate steering instructions. Current context tokens and state remain preserved.
          </p>
          <div className="flex items-center space-x-1.5">
            <input
              type="text"
              placeholder="e.g. 'Prioritize latency over area', 'Add synchronous active-low reset', 'Refactor into structural VHDL'..."
              value={redirectPrompt}
              onChange={(e) => setRedirectPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && redirectPrompt.trim()) {
                  handleRedirect();
                }
              }}
              className="flex-1 bg-slate-950 border border-indigo-600/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-400 font-sans"
              autoFocus
            />
            <button
              onClick={handleRedirect}
              disabled={!redirectPrompt.trim()}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center space-x-1 cursor-pointer transition shadow"
            >
              <span>Redirect ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* ── ROW 2: Live Context Breadcrumb Strip & Session Actions ─────────── */}
      <div className={`relative px-2.5 py-1.5 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between gap-1 flex-shrink-0 ${showTopContextPicker || showHistoryPanel ? 'z-40' : 'z-10'}`}>

        {/* Left: CTX label + Add Context dropdown */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <span className="text-[9px] uppercase font-bold text-slate-500 font-mono flex items-center space-x-1">
            <Info className="w-2.5 h-2.5" />
            <span>CTX:</span>
          </span>

          <div className="relative">
            <button
              onClick={() => {
                setShowTopContextPicker(!showTopContextPicker);
                setShowHistoryPanel(false);
              }}
              className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-teal-500 text-[9.5px] font-mono text-slate-300 hover:text-white transition cursor-pointer shadow-sm"
              title="Add or restore context items for the agent"
              data-testid="top-add-context-btn"
            >
              <Plus className="w-2.5 h-2.5 text-teal-400" />
              <span>+ Ctx</span>
              {excludedContextKeys.size > 0 && (
                <span className="ml-0.5 px-1 rounded-full bg-amber-600/80 text-white text-[8px] font-bold" title={`${excludedContextKeys.size} context source(s) excluded`}>
                  -{excludedContextKeys.size}
                </span>
              )}
            </button>

            {showTopContextPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTopContextPicker(false)} />
                <div className="absolute left-0 top-full mt-1 w-84 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in text-slate-200 font-sans">
                  {/* Header */}
                  <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
                    <div className="flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                      <span className="text-[11px] font-bold text-slate-200">Manage Agent Context</span>
                    </div>
                    <button
                      onClick={() => setShowTopContextPicker(false)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-slate-800 bg-slate-950/40 px-2 pt-1 gap-1 text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={() => setContextModalTab('smart')}
                      className={`px-2.5 py-1 rounded-t-md font-semibold transition cursor-pointer flex items-center space-x-1 ${
                        contextModalTab === 'smart'
                          ? 'bg-slate-900 text-amber-300 border-t border-x border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>⚡ Smart</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContextModalTab('windows')}
                      className={`px-2.5 py-1 rounded-t-md font-semibold transition cursor-pointer flex items-center space-x-1 ${
                        contextModalTab === 'windows'
                          ? 'bg-slate-900 text-cyan-300 border-t border-x border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Monitor className="w-3 h-3 text-cyan-400" />
                      <span>🪟 Windows (@)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContextModalTab('files')}
                      className={`px-2.5 py-1 rounded-t-md font-semibold transition cursor-pointer flex items-center space-x-1 ${
                        contextModalTab === 'files'
                          ? 'bg-slate-900 text-blue-300 border-t border-x border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Folder className="w-3 h-3 text-blue-400" />
                      <span>📁 Files (/)</span>
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2 space-y-2 font-sans">
                    {/* TAB 1: SMART SUGGESTIONS & EXCLUDED RECOVERY */}
                    {contextModalTab === 'smart' && (
                      <div className="space-y-2">
                        {/* Excluded System Context (Click to Restore) */}
                        {excludedContextKeys.size > 0 && (
                          <div className="space-y-1 pb-1.5 border-b border-slate-800">
                            <div className="text-[9px] uppercase font-bold text-amber-400 px-1 font-mono">
                              Excluded Context (Click to Restore)
                            </div>
                            {excludedContextKeys.has('file') && circuitContext?.active_file && (
                              <button
                                type="button"
                                onClick={() => handleRestoreTopContext('file')}
                                className="w-full text-left p-1.5 rounded-lg hover:bg-amber-950/40 border border-amber-800/40 flex items-center justify-between cursor-pointer text-[10px] text-amber-200 transition"
                              >
                                <div className="flex items-center space-x-1.5 truncate">
                                  <FileCode className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                  <span className="truncate">Restore Active File ({circuitContext.active_file.split('/').pop()})</span>
                                </div>
                                <Plus className="w-3 h-3 text-amber-400 flex-shrink-0 ml-1" />
                              </button>
                            )}
                            {excludedContextKeys.has('canvas') && (
                              <button
                                type="button"
                                onClick={() => handleRestoreTopContext('canvas')}
                                className="w-full text-left p-1.5 rounded-lg hover:bg-amber-950/40 border border-amber-800/40 flex items-center justify-between cursor-pointer text-[10px] text-amber-200 transition"
                              >
                                <div className="flex items-center space-x-1.5 truncate">
                                  <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                  <span className="truncate">Restore Canvas Netlist ({circuitContext?.gate_count || 0}g·{circuitContext?.wire_count || 0}n)</span>
                                </div>
                                <Plus className="w-3 h-3 text-amber-400 flex-shrink-0 ml-1" />
                              </button>
                            )}
                            {excludedContextKeys.has('selection') && currentSelection && (
                              <button
                                type="button"
                                onClick={() => handleRestoreTopContext('selection')}
                                className="w-full text-left p-1.5 rounded-lg hover:bg-amber-950/40 border border-amber-800/40 flex items-center justify-between cursor-pointer text-[10px] text-amber-200 transition"
                              >
                                <div className="flex items-center space-x-1.5 truncate">
                                  <Cpu className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                  <span className="truncate">Restore Selection ({currentSelection.label})</span>
                                </div>
                                <Plus className="w-3 h-3 text-amber-400 flex-shrink-0 ml-1" />
                              </button>
                            )}
                            {excludedContextKeys.has('drc') && (
                              <button
                                type="button"
                                onClick={() => handleRestoreTopContext('drc')}
                                className="w-full text-left p-1.5 rounded-lg hover:bg-amber-950/40 border border-amber-800/40 flex items-center justify-between cursor-pointer text-[10px] text-amber-200 transition"
                              >
                                <div className="flex items-center space-x-1.5 truncate">
                                  <ShieldAlert className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                  <span className="truncate">Restore DRC Diagnostics</span>
                                </div>
                                <Plus className="w-3 h-3 text-amber-400 flex-shrink-0 ml-1" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Dynamic Live Suggestions */}
                        <div className="space-y-1">
                          <div className="text-[9px] uppercase font-bold text-slate-400 px-1 font-mono flex items-center justify-between">
                            <span>Dynamic State Suggestions</span>
                            <span className="text-[8.5px] text-purple-400 font-normal">Real-time Telemetry</span>
                          </div>

                          {/* Current canvas selection */}
                          {currentSelection && (
                            <button
                              type="button"
                              onClick={() => {
                                addContextChip({ type: currentSelection.type as any, label: currentSelection.label, data: currentSelection.data });
                                setShowTopContextPicker(false);
                              }}
                              className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between cursor-pointer transition border border-transparent hover:border-indigo-700/60"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <Cpu className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-[10px] text-slate-200 font-medium truncate">📌 Selection: {currentSelection.label}</div>
                                  <div className="text-[9px] text-slate-500">Attach active component pins & nets</div>
                                </div>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">⚡ Attach</span>
                            </button>
                          )}

                          {/* Active file */}
                          {circuitContext?.active_file && (
                            <button
                              type="button"
                              onClick={async () => {
                                await attachProjectFileChip({
                                  name: circuitContext.active_file!.split('/').pop() || circuitContext.active_file!,
                                  path: circuitContext.active_file!,
                                  ext: circuitContext.active_file!.split('.').pop() || 'vhd',
                                });
                                setShowTopContextPicker(false);
                              }}
                              className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between cursor-pointer transition border border-transparent hover:border-blue-700/60"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-[10px] text-slate-200 font-medium truncate">{circuitContext.active_file.split('/').pop()}</div>
                                  <div className="text-[9px] text-slate-500">Active VHDL buffer with full source</div>
                                </div>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">⚡ Attach</span>
                            </button>
                          )}

                          {/* DRC Issues */}
                          {liveMentalMap.identifiedIssues.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                addContextChip({
                                  type: 'drc_issue',
                                  label: `${liveMentalMap.identifiedIssues.length} DRC issues`,
                                  data: { count: liveMentalMap.identifiedIssues.length, topIssue: liveMentalMap.identifiedIssues[0]?.title, issues: liveMentalMap.identifiedIssues }
                                });
                                setShowTopContextPicker(false);
                              }}
                              className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between cursor-pointer transition border border-transparent hover:border-rose-700/60"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-[10px] text-rose-200 font-medium">DRC Diagnostics</div>
                                  <div className="text-[9px] text-slate-400">{liveMentalMap.identifiedIssues.length} violations (CMOS floating/contention)</div>
                                </div>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono">⚡ Attach</span>
                            </button>
                          )}

                          {/* Canvas snapshot */}
                          <button
                            type="button"
                            onClick={() => {
                              addContextChip({
                                type: 'canvas_snapshot',
                                label: `${circuitContext?.gate_count || 0}g·${circuitContext?.wire_count || 0}n`,
                                data: {
                                  gates: circuitContext?.gate_count,
                                  wires: circuitContext?.wire_count,
                                  name: circuitContext?.circuit_name,
                                  summary: circuitContext?.canvas_live_summary,
                                  netlist: circuitContext?.netlist,
                                }
                              });
                              setShowTopContextPicker(false);
                            }}
                            className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between cursor-pointer transition border border-transparent hover:border-amber-700/60"
                          >
                            <div className="flex items-center space-x-2 min-w-0">
                              <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-[10px] text-slate-200 font-medium">Live Canvas Netlist</div>
                                <div className="text-[9px] text-slate-500">{circuitContext?.gate_count || 0} gates · {circuitContext?.wire_count || 0} nets</div>
                              </div>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">⚡ Attach</span>
                          </button>

                          {/* Probes / Waveforms telemetry */}
                          {circuitContext?.probes && Object.keys(circuitContext.probes).length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                addContextChip({
                                  type: 'window',
                                  label: 'Waveforms & Probes',
                                  data: {
                                    window: 'waveforms',
                                    probes: circuitContext.probes,
                                    faults: circuitContext.faults,
                                  }
                                });
                                setShowTopContextPicker(false);
                              }}
                              className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between cursor-pointer transition border border-transparent hover:border-cyan-700/60"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <Activity className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-[10px] text-slate-200 font-medium">Logic Analyzer Probes</div>
                                  <div className="text-[9px] text-slate-500">{Object.keys(circuitContext.probes).length} active signal probes</div>
                                </div>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">⚡ Attach</span>
                            </button>
                          )}

                          {/* Chat History */}
                          {userChatMessages.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                addContextChip({
                                  type: 'chat_history',
                                  label: `Last ${Math.min(userChatMessages.length, 5)} msgs`,
                                  data: { count: Math.min(userChatMessages.length, 5) }
                                });
                                setShowTopContextPicker(false);
                              }}
                              className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between cursor-pointer transition border border-transparent hover:border-purple-700/60"
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <MessageSquare className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-[10px] text-slate-200 font-medium">Recent Chat History</div>
                                  <div className="text-[9px] text-slate-500">Summary of last conversation turns</div>
                                </div>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">⚡ Attach</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB 2: WORKSPACE WINDOWS & TABS (@) */}
                    {contextModalTab === 'windows' && (
                      <div className="space-y-1">
                        <div className="text-[9px] uppercase font-bold text-slate-400 px-1 font-mono flex items-center justify-between">
                          <span>Workspace Windows (@)</span>
                          <span className="text-[8.5px] text-cyan-400 font-mono">{availableWindowContexts.length} available</span>
                        </div>
                        {availableWindowContexts.map((win) => (
                          <button
                            key={win.id}
                            type="button"
                            onClick={() => {
                              addContextChip({
                                type: win.type,
                                label: win.label,
                                data: win.data,
                              });
                              setShowTopContextPicker(false);
                            }}
                            className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between cursor-pointer transition border border-slate-800/60 hover:border-cyan-700/60"
                          >
                            <div className="flex items-center space-x-2 min-w-0">
                              {win.type === 'tab' ? (
                                <Layout className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              ) : win.type === 'screen' ? (
                                <Layers className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                              ) : (
                                <Monitor className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-[10px] text-slate-200 font-medium truncate flex items-center space-x-1.5">
                                  <span>{win.label}</span>
                                  <span className="text-[8.5px] font-mono text-cyan-400">{win.trigger}</span>
                                </div>
                                <div className="text-[9px] text-slate-400 truncate">{win.description}</div>
                              </div>
                            </div>
                            {win.statusBadge && (
                              <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 font-mono ml-2 flex-shrink-0">
                                {win.statusBadge}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* TAB 3: PROJECT FILES (/) */}
                    {contextModalTab === 'files' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                          <Search className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <input
                            type="text"
                            placeholder="Filter project files (e.g. .vhd, .sdc, .md)..."
                            value={contextModalSearch}
                            onChange={(e) => setContextModalSearch(e.target.value)}
                            className="w-full bg-transparent text-[10px] text-slate-200 focus:outline-none"
                          />
                          {contextModalSearch && (
                            <button
                              type="button"
                              onClick={() => setContextModalSearch('')}
                              className="text-slate-500 hover:text-slate-300"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-0.5">
                          {effectiveFiles
                            .filter(f => !contextModalSearch || f.name.toLowerCase().includes(contextModalSearch.toLowerCase()) || f.path.toLowerCase().includes(contextModalSearch.toLowerCase()))
                            .map((f, idx) => (
                              <button
                                key={f.path || idx}
                                type="button"
                                onClick={async () => {
                                  await attachProjectFileChip(f);
                                  setShowTopContextPicker(false);
                                }}
                                className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center justify-between cursor-pointer transition border border-transparent hover:border-blue-700/60"
                              >
                                <div className="flex items-center space-x-2 min-w-0">
                                  <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-[10px] text-slate-200 font-medium truncate">{f.name}</div>
                                    <div className="text-[8.5px] text-slate-500 truncate">{f.path}</div>
                                  </div>
                                </div>
                                <span className="text-[8.5px] px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800 font-mono ml-2 flex-shrink-0">
                                  + Attach
                                </span>
                              </button>
                            ))}
                          {effectiveFiles.length === 0 && (
                            <div className="py-4 text-center text-slate-500 text-[10px]">
                              No files found in active project tree.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Custom Text Note (Always available at bottom) */}
                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-[9px] uppercase font-bold text-slate-400 px-1 font-mono">
                        Custom Context Note
                      </div>
                      <div className="flex items-center space-x-1 mt-1">
                        <input
                          type="text"
                          placeholder="e.g. 50MHz clk, active-low rst, zero latches..."
                          value={customContextNote}
                          onChange={(e) => setCustomContextNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomNote();
                            }
                          }}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-purple-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomNote}
                          disabled={!customContextNote.trim()}
                          className="px-2 py-1 rounded-md bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-[10px] font-mono transition cursor-pointer flex-shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Reset all context */}
                    {(excludedContextKeys.size > 0 || contextChips.length > 0) && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleResetAllContext}
                          className="w-full text-center py-1 text-[9px] text-slate-400 hover:text-rose-300 font-mono transition cursor-pointer"
                        >
                          ↺ Reset All Context to Default
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: Scrollable Context Tokens Strip */}
        <div className="flex-1 flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5 min-w-0">
          {contextTokens.map((token) => (
            <span
              key={token.id}
              className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md border text-[9.5px] font-mono flex-shrink-0 transition ${
                token.isChip ? 'bg-teal-950/60 border-teal-500/70 text-teal-200' : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
              title={token.title}
            >
              {token.icon}
              <span className="max-w-[70px] truncate">{token.label}</span>
              {token.canRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTopContext(token.id);
                  }}
                  className="opacity-60 hover:opacity-100 hover:text-rose-400 text-slate-400 ml-0.5 transition cursor-pointer"
                  title={`Remove ${token.label} from agent context`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Right: Pinned Session Actions (+ Chat, + Task, History) */}
        <div className="flex items-center space-x-1 flex-shrink-0 pl-1 border-l border-slate-800">
          <button
            onClick={handleNewChat}
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-teal-500 text-[9.5px] font-mono text-slate-300 hover:text-white transition cursor-pointer shadow-sm"
            title="Start fresh conversation in this project (current session auto-saved to history)"
            data-testid="top-new-chat-btn"
          >
            <MessageSquarePlus className="w-3 h-3 text-teal-400" />
            <span>+ Chat</span>
          </button>

          <button
            onClick={handleOpenTaskWizard}
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500 text-[9.5px] font-mono text-slate-300 hover:text-white transition cursor-pointer shadow-sm"
            title="Open Autonomous Engineering Task Wizard (Goals, IEEE standards, constraints, and supervision mode)"
            data-testid="top-new-task-btn"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>+ Task</span>
          </button>

          {/* History button */}
          <div className="relative">
            <button
              onClick={() => {
                setShowHistoryPanel(!showHistoryPanel);
                setShowTopContextPicker(false);
              }}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-700 hover:border-slate-600 text-[9.5px] font-mono text-slate-400 hover:text-slate-200 transition cursor-pointer"
              title="Chat & Task Session History"
              data-testid="session-history-btn"
            >
              <History className="w-2.5 h-2.5" />
              <span>{chatSessions.length > 0 ? `${chatSessions.length}` : '0'}</span>
            </button>
            {showHistoryPanel && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHistoryPanel(false)} />
                <div className="absolute right-0 top-full mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in font-sans">
                  <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200">Chat & Task History</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => { handleNewChat(); setShowHistoryPanel(false); }}
                        className="text-[9px] text-teal-400 hover:text-teal-300 font-mono flex items-center space-x-0.5 transition cursor-pointer"
                        title="Start new chat session"
                      >
                        <Plus className="w-3 h-3" />
                        <span>New</span>
                      </button>
                      <button onClick={clearCurrentSession} className="text-[9px] text-rose-400 hover:text-rose-300 flex items-center space-x-0.5 transition cursor-pointer" title="Save & clear current session">
                        <Trash2 className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    </div>
                  </div>
                  {chatSessions.length === 0 ? (
                    <div className="p-4 text-center text-[10px] text-slate-500">No saved sessions yet</div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-800">
                      {chatSessions.map(session => (
                        <div key={session.id} className="px-3 py-2 hover:bg-slate-800/60 flex items-start justify-between space-x-2 group">
                          <button
                            onClick={() => restoreSession(session)}
                            className="flex-1 text-left min-w-0 cursor-pointer"
                          >
                            <div className="text-[10px] text-slate-300 font-medium truncate">{session.preview || '(empty session)'}</div>
                            <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                              {new Date(session.startedAt).toLocaleString()} · {session.messages.length} msgs
                            </div>
                          </button>
                          <div className="flex items-center space-x-1 flex-shrink-0">
                            <button
                              onClick={() => restartSessionFromLast(session)}
                              className="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-300 text-[9px] font-mono flex items-center space-x-1 transition cursor-pointer"
                              title="Restart conversation from this session's last point"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Restart</span>
                            </button>
                            <button
                              onClick={() => deleteSession(session.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                              title="Delete session"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Pipeline Stepper (collapsible) ────────────────────────────────── */}
      <div className="border-b border-slate-800 bg-slate-900/40 flex-shrink-0">
        <div
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
            <div className="flex items-center space-x-1">
              {PHASES.map((p) => {
                const isCompleted = activeIndex > p.id;
                const isCurrent = activeIndex === p.id && agentState === 'RUNNING';
                return (
                  <span
                    key={p.id}
                    className={`w-2 h-2 rounded-full transition-all ${isCurrent ? 'bg-purple-400 ring-2 ring-purple-400/50 animate-pulse' : isCompleted ? 'bg-emerald-400' : 'bg-slate-700'}`}
                    title={`${p.id + 1}. ${p.name}`}
                  />
                );
              })}
            </div>
            {isPipelineExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </div>
        </div>

        {(isPipelineExpanded || agentState === 'RUNNING') && (
          <div className="p-2.5 pt-0 border-t border-slate-800/60 bg-slate-950/60 animate-fade-in">
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {PHASES.map((p) => {
                const isCompleted = activeIndex > p.id;
                const isCurrent = activeIndex === p.id && agentState === 'RUNNING';
                return (
                  <div
                    key={p.id}
                    className={`p-1.5 rounded-lg border transition text-[10px] flex items-start space-x-1.5 ${isCurrent ? 'bg-purple-950/60 border-purple-500 shadow-sm shadow-purple-500/20' : isCompleted ? 'bg-slate-900/90 border-emerald-900/60 text-slate-300' : 'bg-slate-950 border-slate-800/80 text-slate-500'}`}
                  >
                    <div className="mt-0.5">
                      {isCurrent ? <Loader2 className="w-3 h-3 text-purple-400 animate-spin" /> : isCompleted ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Circle className="w-3 h-3 text-slate-600" />}
                    </div>
                    <div className="truncate flex-1">
                      <div className={`font-semibold truncate ${isCurrent ? 'text-purple-200' : isCompleted ? 'text-slate-200' : 'text-slate-500'}`}>
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
                <div className="leading-tight">{currentPhase.thought || 'Executing autonomous phase...'}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Context Telemetry Strip ───────────────────────────────────────── */}
      <div className="px-3 py-1 border-b border-slate-800 bg-slate-950/95 backdrop-blur flex items-center justify-between text-[11px] font-mono flex-shrink-0">
        <div className="flex items-center space-x-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider flex-shrink-0">Screen:</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-slate-200 font-semibold truncate text-[10px]" title="Active Studio Workspace Tab">
            {circuitContext?.active_tab_label || 'Design & RTL Studio'}
          </span>
        </div>
        <div className="flex items-center space-x-2 text-[10px] text-slate-400 flex-shrink-0">
          <div className="flex items-center space-x-1" title="Live gate count">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-slate-300 font-semibold">{circuitContext?.gate_count || 0}</span>
            <span className="text-slate-500">gates</span>
          </div>
          <span className="text-slate-700">•</span>
          <div className="flex items-center space-x-1">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span className="text-slate-300 font-semibold">{circuitContext?.wire_count || 0}</span>
            <span className="text-slate-500">nets</span>
          </div>
          {Object.keys(circuitContext?.faults || {}).length > 0 && (
            <>
              <span className="text-slate-700">•</span>
              <span className="px-1.5 rounded bg-rose-950 border border-rose-700 text-rose-300 text-[9px] font-bold">
                {Object.keys(circuitContext?.faults || {}).length} Faults
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── View Mode Toggle ──────────────────────────────────────────────── */}
      <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between text-[10px] flex-shrink-0">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setViewMode('chat')}
            className={`px-2.5 py-1 rounded-md flex items-center space-x-1 transition font-medium ${
              viewMode === 'chat'
                ? 'bg-slate-800 text-white border border-slate-700 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare className={`w-3 h-3 ${viewMode === 'chat' ? 'text-teal-300' : 'text-teal-400'}`} />
            <span>Co-Pilot</span>
          </button>
          <button
            onClick={() => setViewMode('mental-map')}
            className={`px-2.5 py-1 rounded-md flex items-center space-x-1 transition font-medium ${
              viewMode === 'mental-map'
                ? 'bg-slate-800 text-white border border-slate-700 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Brain className={`w-3 h-3 ${viewMode === 'mental-map' ? 'text-cyan-300' : 'text-cyan-400'}`} />
            <span>Mind Map</span>
            <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${mentalMapPulse ? 'bg-emerald-300 animate-ping' : 'bg-emerald-500'}`} />
          </button>
          <button
            onClick={() => setViewMode('eng-logs')}
            className={`px-2.5 py-1 rounded-md flex items-center space-x-1 transition font-medium ${
              viewMode === 'eng-logs'
                ? 'bg-slate-800 text-white border border-slate-700 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Terminal className={`w-3 h-3 ${viewMode === 'eng-logs' ? 'text-blue-300' : 'text-blue-400'}`} />
            <span>Eng Logs</span>
            {engineeringLogs.length > 0 && <span className="px-1 rounded-full bg-slate-700 text-slate-300 text-[8px] font-bold">{engineeringLogs.length}</span>}
          </button>
          {viewMode === 'task-wizard' && (
            <button
              onClick={() => setViewMode('task-wizard')}
              className="px-2.5 py-1 rounded-md flex items-center space-x-1 font-medium bg-slate-800 text-white border border-slate-700 shadow-sm"
              title="Autonomous Engineering Task Setup"
            >
              <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
              <span>Task Setup</span>
            </button>
          )}
        </div>
        {viewMode === 'mental-map' && (
          <span className="text-slate-500 font-mono text-[9px]">
            {mentalMapAge < 10 ? '🟢 just updated' : mentalMapAge < 60 ? `↻ ${mentalMapAge}s ago` : `↻ ${Math.round(mentalMapAge / 60)}m ago`}
          </span>
        )}
      </div>

      {/* ── Materialized Artifacts Banner ─────────────────────────────────── */}
      {materializedFiles.length > 0 && (
        <div className="mx-3 my-1.5 p-2.5 rounded-xl bg-gradient-to-r from-purple-950/50 via-slate-900/80 to-slate-950 border border-purple-800/60 shadow-md flex-shrink-0">
          <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setIsArtifactsOpen(!isArtifactsOpen)}>
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span className="text-[11px] font-bold text-slate-100">Materialized Artifacts</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/70 text-emerald-300 font-mono font-bold">{materializedFiles.length} files</span>
            </div>
            {isArtifactsOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </div>
          {isArtifactsOpen && (
            <div className="mt-2 space-y-2 border-t border-slate-800/80 pt-2 text-[10px]">
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {materializedFiles.map((f, i) => {
                  const isTop = f === materializedTop || f.endsWith('_top.vhd') || f.endsWith('top.vhd');
                  return (
                    <div key={i} className={`px-2 py-0.5 rounded font-mono text-[9px] flex items-center space-x-1 border ${isTop ? 'bg-purple-900/70 border-purple-500 text-purple-200 font-bold' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
                      <span>{f.split('/').pop()}</span>
                      {isTop && <span className="text-[8px] text-amber-300">★ TOP</span>}
                    </div>
                  );
                })}
              </div>
              {onApplyDesignToCanvas && circuitContext?.vhdl_code && (
                <button
                  onClick={() => onApplyDesignToCanvas(circuitContext.vhdl_code || '', circuitContext.circuit_name || 'processor_top')}
                  className="w-full py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-bold text-[10.5px] flex items-center justify-center space-x-1.5 transition cursor-pointer shadow-md"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>⚡ Apply to Studio Canvas</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-mono text-xs">

        {/* ── INLINE AUTONOMOUS ENGINEERING TASK WIZARD VIEW ── */}
        {viewMode === 'task-wizard' && (
          <div className="space-y-3 font-sans pb-4 animate-fade-in" data-testid="task-wizard-view">
            {/* Inline Header */}
            <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-950 border border-indigo-700/60 shadow-md flex items-center justify-between">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-300 flex-shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-100 text-xs truncate">Autonomous Engineering Task</h3>
                  <p className="text-[10px] text-slate-400 truncate">Objectives, standards, rules & supervision mode</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewMode('chat')}
                className="px-2.5 py-1 text-[10px] font-mono text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-lg transition cursor-pointer flex-shrink-0"
                title="Cancel and return to chat"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleLaunchTaskFromWizard} className="space-y-3.5">
              {/* Task Title & Primary Goal */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-200 flex items-center justify-between">
                  <span>Hardware Goal / Circuit Name</span>
                  <span className="text-[9.5px] text-indigo-400 font-mono">Scale {taskScale}/4</span>
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => {
                    setTaskTitle(e.target.value);
                    setTaskScale(inferScale(e.target.value));
                  }}
                  placeholder="e.g. 16-bit Pipelined MAC Unit with Accumulator"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Functional Requirements & Specification */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-200">
                  Instructions & Functional Requirements
                </label>
                <textarea
                  rows={3}
                  required
                  value={taskRequirements}
                  onChange={(e) => setTaskRequirements(e.target.value)}
                  placeholder="Specify interfaces, bitwidths, control signals (valid/ready), reset behavior, and target assertions..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                />
              </div>

              {/* Standard & Constraints Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-semibold text-slate-200">VHDL Standard</label>
                  <select
                    value={taskStandard}
                    onChange={(e) => setTaskStandard(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="IEEE 1076-2008">IEEE 1076-2008 (Synthesizable)</option>
                    <option value="IEEE 1076-1993">IEEE 1076-1993 (Classic)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-semibold text-slate-200">Target Clock (MHz)</label>
                  <div className="flex items-center space-x-1">
                    {[50, 100, 200].map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setTaskClockFreq(f)}
                        className={`flex-1 py-1 text-[10px] font-mono font-bold rounded-lg border transition cursor-pointer ${
                          taskClockFreq === f
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={taskClockFreq}
                      onChange={(e) => setTaskClockFreq(parseInt(e.target.value, 10) || 100)}
                      className="w-12 bg-slate-950 border border-slate-700 rounded-lg px-1 py-1 text-[10px] font-mono text-center text-slate-200 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Hardware Rules & Synthesis Safety */}
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                <span className="text-[9.5px] font-bold text-slate-400 font-mono block">SYNTHESIS & DRC RULES</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center space-x-2 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taskZeroLatches}
                      onChange={(e) => setTaskZeroLatches(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>Zero Implied Latches</span>
                  </label>
                  <label className="flex items-center space-x-2 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taskCdcProtected}
                      onChange={(e) => setTaskCdcProtected(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>CDC Synchronizers</span>
                  </label>
                </div>
                <div className="flex items-center space-x-3 pt-0.5 text-[10.5px] text-slate-300">
                  <span className="text-slate-400">Reset:</span>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="inline_reset_type"
                      checked={taskResetType === 'sync_active_low'}
                      onChange={() => setTaskResetType('sync_active_low')}
                      className="accent-indigo-500"
                    />
                    <span className="font-mono text-[10px]">rst_n (Active-Low)</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="inline_reset_type"
                      checked={taskResetType === 'sync_active_high'}
                      onChange={() => setTaskResetType('sync_active_high')}
                      className="accent-indigo-500"
                    />
                    <span className="font-mono text-[10px]">rst (Active-High)</span>
                  </label>
                </div>
              </div>

              {/* Context Scope Attachment */}
              <div className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-200 block">Context Scope Attachment</span>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <label className={`px-2 py-1 rounded-lg border cursor-pointer flex items-center space-x-1.5 transition ${
                    taskAttachFiles ? 'bg-purple-950/60 border-purple-600 text-purple-200' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={taskAttachFiles}
                      onChange={(e) => setTaskAttachFiles(e.target.checked)}
                      className="hidden"
                    />
                    <span>📄 Active File ({circuitContext?.active_file?.split('/').pop() || 'Editor'})</span>
                  </label>
                  <label className={`px-2 py-1 rounded-lg border cursor-pointer flex items-center space-x-1.5 transition ${
                    taskAttachNetlist ? 'bg-indigo-950/60 border-indigo-600 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={taskAttachNetlist}
                      onChange={(e) => setTaskAttachNetlist(e.target.checked)}
                      className="hidden"
                    />
                    <span>⚡ Canvas Netlist ({circuitContext?.gate_count || 0} gates)</span>
                  </label>
                  <label className={`px-2 py-1 rounded-lg border cursor-pointer flex items-center space-x-1.5 transition ${
                    taskAttachDrc ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={taskAttachDrc}
                      onChange={(e) => setTaskAttachDrc(e.target.checked)}
                      className="hidden"
                    />
                    <span>🛡️ DRC Rules ({circuitContext?.drc_issues?.length || 0} issues)</span>
                  </label>
                </div>
              </div>

              {/* Supervision Mode */}
              <div className="space-y-1">
                <span className="text-[10.5px] font-semibold text-slate-200 block">Supervision & Execution Mode</span>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setTaskSupervisionMode('supervised')}
                    className={`p-2.5 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                      taskSupervisionMode === 'supervised'
                        ? 'bg-amber-950/30 border-amber-500/80 shadow-md'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[11px] text-amber-300 flex items-center space-x-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Supervised</span>
                      </span>
                      {taskSupervisionMode === 'supervised' && <Check className="w-3 h-3 text-amber-400" />}
                    </div>
                    <p className="text-[9.5px] text-slate-400 leading-snug">
                      Requires human approval before applying RTL code or modifying files.
                    </p>
                  </div>

                  <div
                    onClick={() => setTaskSupervisionMode('autonomous')}
                    className={`p-2.5 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                      taskSupervisionMode === 'autonomous'
                        ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[11px] text-indigo-300 flex items-center space-x-1">
                        <Zap className="w-3.5 h-3.5" />
                        <span>Autonomous</span>
                      </span>
                      {taskSupervisionMode === 'autonomous' && <Check className="w-3 h-3 text-indigo-400" />}
                    </div>
                    <p className="text-[9.5px] text-slate-400 leading-snug">
                      Executes in background, posting milestone progress cards.
                    </p>
                  </div>
                </div>
              </div>

              {/* Knowledge Base Self-Evolution Toggle */}
              <div className="pt-0.5">
                <label className="flex items-center space-x-2 text-[10.5px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taskEvolveKnowledge}
                    onChange={(e) => setTaskEvolveKnowledge(e.target.checked)}
                    className="rounded accent-purple-500"
                  />
                  <span>🧠 Auto-evolve Knowledge Graph & persist verified architecture</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewMode('chat')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
                  data-testid="launch-autonomous-task-btn"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Launch Autonomous Task</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── CHAT VIEW ── */}
        {viewMode === 'chat' && (
          <div className="space-y-3 font-sans">
            {/* DRC Warning Banner */}
            {liveMentalMap.identifiedIssues.length > 0 && (
              <div className="p-2.5 rounded-xl bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-950 border border-rose-600/70 shadow-lg flex items-center justify-between animate-fade-in">
                <div className="flex items-center space-x-2 min-w-0">
                  <AlertOctagon className="w-4 h-4 text-rose-400 flex-shrink-0 animate-pulse" />
                  <span className="text-[11px] text-rose-200 font-bold font-sans truncate">
                    {liveMentalMap.identifiedIssues.length} DRC Violations Detected
                  </span>
                </div>
                <button
                  onClick={handleAutoFixAll}
                  className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono text-[10px] font-bold shadow transition flex items-center space-x-1 flex-shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>⚡ Auto-Fix All</span>
                </button>
              </div>
            )}

            {/* Empty state */}
            {currentSessionLogs.length === 0 && userChatMessages.length === 0 && (
              <div className="h-32 flex items-center justify-center text-slate-600 text-center text-xs">
                <div>
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-30 text-purple-400" />
                  <p className="text-slate-400 font-medium text-[11px]">Autonomous Co-Pilot Ready</p>
                  <p className="text-[10px] text-slate-600 mt-1">Send a design goal or prompt below to begin.</p>
                </div>
              </div>
            )}

            {/* ── UNIFIED AUTONOMOUS PIPELINE EXECUTION CARD ── */}
            {currentSessionLogs.length > 0 && (
              <div className="rounded-2xl border border-purple-900/60 bg-gradient-to-br from-slate-900/95 via-purple-950/20 to-slate-950 overflow-hidden shadow-lg transition-all">
                <div
                  onClick={() => setIsPipelineTraceOpen(!isPipelineTraceOpen)}
                  className="p-3 flex items-center justify-between cursor-pointer hover:bg-purple-950/30 transition select-none"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      agentState === 'RUNNING' || agentState === 'THINKING'
                        ? 'bg-amber-500/20 text-amber-300 animate-pulse border border-amber-500/40'
                        : agentState === 'ERROR'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {agentState === 'RUNNING' || agentState === 'THINKING' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : agentState === 'ERROR' ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-[12px] font-bold text-slate-100 font-sans">
                          {agentState === 'RUNNING' || agentState === 'THINKING'
                            ? 'Autonomous Pipeline Running'
                            : agentState === 'ERROR'
                            ? 'Pipeline Stopped'
                            : 'Autonomous Pipeline Completed'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full bg-purple-950 border border-purple-800 text-purple-300 text-[9px] font-mono font-bold">
                          {currentSessionLogs.length} steps
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                        {currentSessionLogs[currentSessionLogs.length - 1]?.thought || 'Hardware synthesis & verification complete.'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <span className="px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] font-mono flex items-center space-x-1 transition">
                      <span>{isPipelineTraceOpen ? 'Hide Trace' : 'View Trace'}</span>
                      {isPipelineTraceOpen ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                    </span>
                  </div>
                </div>

                {/* Collapsible Step-by-Step Timeline Trace */}
                {isPipelineTraceOpen && (
                  <div className="border-t border-purple-900/40 p-3 bg-slate-950/80 space-y-2 max-h-72 overflow-y-auto font-mono text-[10.5px]">
                    {currentSessionLogs.map((log, idx) => {
                      const isUser = log.action === 'user_steer' || log.action === 'user_chat';
                      const isTool = log.state === 'TOOL_EXEC' || log.state === 'TOOL_RESULT';
                      const isComplete = log.state === 'COMPLETED' || log.action === 'task_complete';
                      return (
                        <div key={idx} className="flex items-start space-x-2 pb-2 border-b border-slate-800/50 last:border-0 last:pb-0">
                          <div className="mt-1">
                            <span className={`w-2 h-2 rounded-full block ${
                              isComplete ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50'
                              : isTool ? 'bg-cyan-400'
                              : isUser ? 'bg-purple-400'
                              : 'bg-indigo-400'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[9px] text-slate-500 mb-0.5">
                              <span className={`font-bold uppercase ${
                                isComplete ? 'text-emerald-300'
                                : isTool ? 'text-cyan-300'
                                : isUser ? 'text-purple-300'
                                : 'text-indigo-300'
                              }`}>
                                {log.state}
                              </span>
                              {log.action && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                                  {log.action}
                                </span>
                              )}
                            </div>
                            <div className="text-slate-200 text-[10.5px] font-sans leading-snug">
                              {log.thought}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* User-typed messages & agent replies (local session) */}
            {userChatMessages.map((msg) => (
              msg.isAgent ? (
                <div key={msg.id} className="flex items-start space-x-2">
                  <div className="w-6 h-6 rounded-md bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400 flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm p-2.5 text-xs bg-slate-900/90 border border-slate-800 text-slate-200 shadow-sm">
                    <ChatMessageRenderer
                      thought={msg.text}
                      details={(msg as any).details}
                      action={msg.action}
                      circuitName={circuitContext?.circuit_name || 'custom_design'}
                      hasUnresolvedDrc={liveMentalMap.identifiedIssues.length > 0}
                      onApplyDesignToCanvas={onApplyDesignToCanvas}
                      onAutoFixAll={handleAutoFixAll}
                      onPermissionDecision={(approved, permDetails) => {
                        if (approved) {
                          setUserChatMessages((prev) => [
                            ...prev,
                            {
                              id: `approved_${Date.now()}`,
                              time: Date.now(),
                              text: `✅ **Human Co-Pilot Approved**: Synthesized hardware design was verified and applied to workspace.`,
                              isAgent: true,
                            },
                          ]);
                        } else {
                          setUserChatMessages((prev) => [
                            ...prev,
                            {
                              id: `rejected_${Date.now()}`,
                              time: Date.now(),
                              text: `✕ **Human Co-Pilot Rejected**: Design was not applied. Please provide guidance below.`,
                              isAgent: true,
                            },
                          ]);
                        }
                      }}
                    />
                    {msg.action?.type === 'apply_code' && msg.action.vhdl_code && onApplyDesignToCanvas && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/60 flex items-center justify-between shadow-md">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">⚡</span>
                          <div>
                            <div className="text-[11px] font-bold text-emerald-200">Synthesizable Hardware Design Ready</div>
                            <div className="text-[9.5px] text-emerald-400/90 font-mono">Entity: {msg.action.circuit_name || 'Design'} • Direct Canvas/Editor Sync</div>
                          </div>
                        </div>
                        <button
                          onClick={() => onApplyDesignToCanvas(msg.action.vhdl_code, msg.action.circuit_name || 'custom_design')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-[10px] flex items-center space-x-1.5 transition cursor-pointer shadow-md"
                          title="Apply this synthesizable design to the RTL editor and canvas"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>Apply to Canvas & Editor</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] bg-purple-900/60 border border-purple-600/60 rounded-2xl rounded-tr-sm p-2.5 text-xs text-purple-100 shadow-md">
                    <div className="flex items-center space-x-1.5 text-[9px] text-purple-300 font-semibold mb-1">
                      <User className="w-3 h-3" />
                      <span>You</span>
                    </div>
                    <p className="font-sans leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              )
            ))}

            {isCopilotThinking && (
              <div className="flex items-start space-x-2 animate-pulse">
                <div className="w-6 h-6 rounded-md bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400 flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-purple-300">
                  <span className="font-mono text-[11px] text-slate-300">Analyzing circuit & synthesizing response...</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
        )}

        {/* ── MENTAL MAP VIEW ── */}
        {viewMode === 'mental-map' && (
          <div className="space-y-3 font-sans">
            {/* Header row */}
            <div className="p-2.5 rounded-xl bg-slate-900/95 border border-purple-900/50 flex items-center justify-between text-[11px] font-mono shadow-sm">
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${mentalMapPulse ? 'bg-emerald-300 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
                <span className="text-slate-400">Active Screen:</span>
                <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-700/60 text-purple-200 font-bold">
                  {circuitContext?.active_tab_label || 'Design & RTL Studio'}
                </span>
              </div>
              <span className="text-slate-500 text-[10px]">
                {circuitContext?.gate_count || 0}g · {circuitContext?.wire_count || 0}n
              </span>
            </div>

            {/* 1. Agent Cognition */}
            <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-950/70 via-purple-950/40 to-slate-950 border border-indigo-700/60 shadow-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-900/80 border border-indigo-500 flex items-center justify-center text-indigo-300">
                    <Brain className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[12px] font-bold text-slate-100">Agent Cognition & Mission</div>
                    <div className="text-[10px] text-indigo-300 font-mono">
                      State: <span className="font-bold text-emerald-400">{liveMentalMap.agentCognition?.agentState || agentState}</span>
                      {' '}· Phase: <span className="text-amber-300 font-bold">{liveMentalMap.agentCognition?.activePhaseName || 'Standby'}</span>
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-200 text-[9.5px] font-mono">
                  {(liveMentalMap.agentCognition?.activePhaseIndex ?? 0) + 1}/{liveMentalMap.agentCognition?.totalPhases || 6}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px]">
                <div className="text-[9.5px] uppercase font-bold text-slate-400 font-mono mb-0.5">Active Goal:</div>
                <div className="text-slate-200 font-sans leading-snug">{liveMentalMap.agentCognition?.currentGoal || 'Awaiting instructions.'}</div>
              </div>
              {liveMentalMap.agentCognition?.currentThought && (
                <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-[10.5px] text-indigo-200 font-mono flex items-start space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse mt-0.5 flex-shrink-0" />
                  <div className="leading-tight">{liveMentalMap.agentCognition.currentThought}</div>
                </div>
              )}
              {liveMentalMap.agentCognition?.lastAction && (
                <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-1.5">
                  <span className="text-indigo-400">Last Action:</span>
                  <span className="text-slate-200 font-semibold">{liveMentalMap.agentCognition.lastAction}</span>
                </div>
              )}
            </div>

            {/* 2. DRC Matrix */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span className="text-[11px] font-bold text-slate-200">DRC Violation Matrix</span>
                  <span className="px-1.5 rounded-full bg-rose-950 border border-rose-800 text-rose-300 text-[9px] font-mono font-bold">{liveMentalMap.identifiedIssues.length}</span>
                </div>
                {liveMentalMap.identifiedIssues.length > 0 && (
                  <button onClick={handleAutoFixAll} className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono text-[10px] font-bold shadow transition flex items-center space-x-1 cursor-pointer">
                    <Wrench className="w-3 h-3 text-amber-300" />
                    <span>⚡ Auto-Fix All</span>
                  </button>
                )}
              </div>
              {liveMentalMap.identifiedIssues.length === 0 ? (
                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/50 flex items-center space-x-2 text-[11px] text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>All pins & nets verified clean. Zero DRC violations.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {liveMentalMap.identifiedIssues.map((issue) => (
                    <div key={issue.id} className="p-2.5 rounded-lg bg-slate-950/90 border border-rose-900/60 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <span className={`px-1.5 rounded text-[9px] font-mono font-bold ${issue.severity === 'error' ? 'bg-rose-950 border border-rose-700 text-rose-300' : 'bg-amber-950 border border-amber-700 text-amber-300'}`}>
                            {issue.severity === 'error' ? 'HIGH RISK' : 'WARN'}
                          </span>
                          <span className="text-slate-200 font-mono font-bold">{issue.target || issue.targetNodeId || 'Circuit Node'}</span>
                        </div>
                        <button onClick={() => handleFixSingleIssue(issue)} className="px-2 py-0.5 rounded bg-purple-900 hover:bg-purple-800 text-purple-200 font-mono text-[9px] font-bold flex items-center space-x-1 cursor-pointer">
                          <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                          <span>Fix</span>
                        </button>
                      </div>
                      <div className="text-slate-300 text-[10.5px] leading-tight"><span className="font-semibold text-slate-200">{issue.title}: </span>{issue.explanation}</div>
                      <div className="p-1.5 rounded bg-rose-950/30 border border-rose-900/40 text-[10px] text-rose-200 leading-snug">
                        <span className="font-bold text-rose-400">Consequence: </span>{issue.physicalConsequence}
                      </div>
                      <div className="text-[9.5px] text-slate-400 font-mono"><span className="text-purple-400">Fix: </span>{issue.suggestedFix}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Live Probes */}
            {liveMentalMap.liveProbesList?.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[11px] font-bold text-slate-200">Live Signal Probes ({liveMentalMap.liveProbesList.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {liveMentalMap.liveProbesList.map((probe) => (
                    <div key={probe.name} className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col space-y-0.5 text-[9.5px] font-mono">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 truncate">{probe.name}</span>
                        <span className={`px-1 rounded font-bold ${probe.state === 'HIGH' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : probe.state === 'LOW' ? 'bg-slate-900 text-slate-400 border border-slate-700' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}>{probe.value}</span>
                      </div>
                      <div className="flex items-center justify-between text-[8.5px]">
                        <span className="text-cyan-300 font-bold">{probe.voltage}</span>
                        <span className="text-slate-500">{probe.state}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. File Origins */}
            {liveMentalMap.fileOriginsSummary?.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[11px] font-bold text-slate-200">Module Origins ({liveMentalMap.fileOriginsSummary.length} Files)</span>
                </div>
                <div className="space-y-1.5">
                  {liveMentalMap.fileOriginsSummary.map((file) => {
                    const color = file.palette?.primary || file.palette?.border || '#818cf8';
                    return (
                      <div key={file.fileName} className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[10px] font-mono text-slate-300 truncate">{file.fileName}</span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 flex-shrink-0">{file.gateCount} gates</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. Critical Path */}
            {liveMentalMap.criticalPath && (
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center space-x-1.5 text-[10.5px] font-semibold text-slate-200">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Critical Path & DRC Health</span>
                </div>
                <div className="text-[10px] font-mono text-slate-300 p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="flex items-center space-x-1.5">
                    <span className={`w-2 h-2 rounded-full ${liveMentalMap.drcHealth?.isClean ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className={liveMentalMap.drcHealth?.isClean ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
                      {liveMentalMap.drcHealth?.isClean ? 'DRC: CLEAN' : 'DRC: Issues Found'}
                    </span>
                  </div>
                  {liveMentalMap.drcHealth && (
                    <div className="text-[9px] text-slate-400 mt-1">
                      Floating: {liveMentalMap.drcHealth.floatingInputs.length} · Unrouted: {liveMentalMap.drcHealth.unroutedOutputs.length}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. Engineering Recommendations */}
            {liveMentalMap.recommendations?.length > 0 && (
              <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-1.5">
                <div className="text-[11px] font-semibold text-purple-200 flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>Engineering Opportunities</span>
                </div>
                <div className="space-y-1">
                  {liveMentalMap.recommendations.map((rec, i) => (
                    <button
                      key={i}
                      onClick={() => { setViewMode('chat'); handleSendSteer(undefined, rec); }}
                      className="w-full text-left p-1.5 rounded bg-slate-950/80 hover:bg-purple-900/40 border border-slate-800 hover:border-purple-600/60 text-[10px] text-slate-300 hover:text-purple-100 transition flex items-start space-x-1.5 cursor-pointer group"
                    >
                      <span className="text-purple-400 font-bold font-mono mt-0.5">{i + 1}.</span>
                      <span className="flex-1 font-sans leading-tight">{rec}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-purple-300 flex-shrink-0 mt-0.5" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ENGINEERING LOGS VIEW ── */}
        {viewMode === 'eng-logs' && (
          <div className="space-y-2 font-mono">
            {engineeringLogs.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-center">
                <div>
                  <Terminal className="w-7 h-7 mx-auto mb-2 opacity-30 text-slate-400" />
                  <p className="text-slate-500 text-[11px]">No engineering actions recorded yet.</p>
                  <p className="text-[10px] text-slate-600 mt-1">Actions appear here when the agent synthesizes, runs DRC, simulates, etc.</p>
                </div>
              </div>
            ) : (
              engineeringLogs.map((log, idx) => {
                const isUser = log.action === 'user_steer' || log.action === 'user_chat';
                const isSynth = log.action === 'synthesize' || log.action === 'materialize_complete' || log.action === 'files_synced';
                const isDRC = log.action === 'drc_check';
                const isSim = log.action === 'simulate';
                const outcome = log.details?.gate_count ? `→ ${log.details.gate_count} gates` : log.details?.violations ? `→ ${log.details.violations} violations` : log.details?.files ? `→ ${log.details.files.length} files` : '';

                return (
                  <EngLogCard
                    key={idx}
                    log={log}
                    isUser={isUser}
                    isSynth={isSynth}
                    isDRC={isDRC}
                    isSim={isSim}
                    outcome={outcome}
                  />
                );
              })
            )}
          </div>
        )}
      </div>

      {viewMode !== 'task-wizard' && (
        <>
          {/* ── Quick Suggestion Chips ────────────────────────────────────────── */}
          <div className="px-2.5 py-1.5 border-t border-slate-800/80 bg-slate-900/20 flex items-center space-x-1.5 overflow-x-auto no-scrollbar text-[9.5px] flex-shrink-0">
        {quickPromptChips.map((chip, i) => (
          <button
            key={i}
            onClick={() => setSteerPrompt(chip)}
            className="px-2 py-0.5 rounded-full bg-slate-900 hover:bg-purple-950/70 border border-slate-800 hover:border-purple-600/70 text-slate-400 hover:text-purple-200 whitespace-nowrap transition cursor-pointer flex-shrink-0"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* ── Unified Command Input ─────────────────────────────────────────── */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-900/70 flex-shrink-0">
        {/* Context chips row */}
        {contextChips.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {contextChips.map(chip => (
              <ContextChip key={chip.id} chip={chip} onRemove={removeContextChip} />
            ))}
          </div>
        )}

        {/* Floating Mention Autocomplete Popup */}
        {mentionMenu?.open && filteredMentionItems.length > 0 && (
          <div className="mb-2 p-1.5 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in max-h-64 overflow-y-auto font-sans">
            <div className="px-2 py-1 border-b border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span className="flex items-center space-x-1">
                {mentionMenu.type === 'file' ? (
                  <>
                    <Folder className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-300 font-bold">Project Files</span>
                    <span className="text-slate-500">(/ to filter)</span>
                  </>
                ) : (
                  <>
                    <Monitor className="w-3 h-3 text-cyan-400" />
                    <span className="text-cyan-300 font-bold">Workspace Windows & Screens</span>
                    <span className="text-slate-500">(@ to filter)</span>
                  </>
                )}
              </span>
              <span className="text-[9px] text-slate-500">↑↓ navigate • Enter to attach • Esc</span>
            </div>
            <div className="py-1 space-y-0.5">
              {filteredMentionItems.map((item: any, idx: number) => {
                const isSelected = idx === mentionMenu.selectedIndex;
                return (
                  <button
                    key={item.id || item.path || idx}
                    type="button"
                    onMouseEnter={() => setMentionMenu(prev => prev ? { ...prev, selectedIndex: idx } : null)}
                    onClick={() => handleSelectMentionItem(item)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition cursor-pointer ${
                      isSelected ? 'bg-slate-800 border border-teal-500/60 text-white shadow-sm' : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      {item.triggerType === 'file' ? (
                        <FileCode className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-blue-300' : 'text-blue-400'}`} />
                      ) : item.type === 'tab' ? (
                        <Layout className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-amber-300' : 'text-amber-400'}`} />
                      ) : item.type === 'screen' ? (
                        <Layers className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-cyan-300' : 'text-cyan-400'}`} />
                      ) : (
                        <Monitor className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-purple-300' : 'text-purple-400'}`} />
                      )}
                      <div className="truncate">
                        <div className="font-medium text-[11px] truncate flex items-center space-x-1.5">
                          <span>{item.name || item.label}</span>
                          {item.trigger && <span className="text-[9px] font-mono text-cyan-400 font-normal">{item.trigger}</span>}
                        </div>
                        <div className="text-[9px] text-slate-400 truncate">{item.path || item.description}</div>
                      </div>
                    </div>
                    {item.statusBadge && (
                      <span className={`text-[8.5px] font-mono px-1.5 py-0.5 rounded ml-2 flex-shrink-0 ${
                        isSelected ? 'bg-slate-800 text-teal-300 border border-teal-500/50' : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}>
                        {item.statusBadge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (agentState === 'IDLE' || agentState === 'COMPLETED') {
              // Long goal → launch autonomous pipeline
              if (steerPrompt.trim().length > 30) {
                handleLaunchGoal(e);
              } else {
                handleSendSteer(e);
              }
            } else {
              handleSendSteer(e);
            }
          }}
          className="space-y-1.5"
        >
          <textarea
            rows={2}
            placeholder={
              agentState === 'RUNNING' || agentState === 'PAUSED'
                ? 'Steer agent... Type "/" for files, "@" for windows & views'
                : 'Design goal or prompt... Type "/" for files, "@" for windows & views'
            }
            value={steerPrompt}
            onChange={handlePromptInputChange}
            onKeyDown={handlePromptKeyDown}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 font-sans resize-none"
          />
          <div className="flex items-center justify-between">
            {/* Context attachment picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowContextPicker(!showContextPicker)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-teal-500 text-slate-400 hover:text-teal-200 text-[10px] font-mono transition cursor-pointer"
                title="Attach context to message"
              >
                <Paperclip className="w-3 h-3" />
                <span>Context</span>
                {contextChips.length > 0 && <span className="px-1 rounded-full bg-teal-600 text-white text-[8px] font-bold">{contextChips.length}</span>}
              </button>

              {showContextPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowContextPicker(false)} />
                  <div className="absolute bottom-full left-0 mb-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                    <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-bold text-slate-200">Attach Context to Message</div>
                    <div className="p-2 space-y-1">
                      {/* Current canvas selection */}
                      {currentSelection && (
                        <button
                          type="button"
                          onClick={() => { addContextChip({ type: currentSelection.type as any, label: currentSelection.label, data: currentSelection.data }); setShowContextPicker(false); }}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-800 flex items-center space-x-2 cursor-pointer transition"
                        >
                          <Cpu className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[10px] text-slate-200 font-medium truncate">📌 {currentSelection.type}: {currentSelection.label}</div>
                            <div className="text-[9px] text-slate-500">Currently selected on canvas</div>
                          </div>
                        </button>
                      )}
                      {/* Active file */}
                      {circuitContext?.active_file && (
                        <button
                          type="button"
                          onClick={() => { addContextChip({ type: 'file', label: circuitContext.active_file!.split('/').pop() || circuitContext.active_file!, data: { path: circuitContext.active_file } }); setShowContextPicker(false); }}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-800 flex items-center space-x-2 cursor-pointer transition"
                        >
                          <FileCode className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[10px] text-slate-200 font-medium truncate">{circuitContext.active_file.split('/').pop()}</div>
                            <div className="text-[9px] text-slate-500">Active file in editor</div>
                          </div>
                        </button>
                      )}
                      {/* Canvas snapshot */}
                      <button
                        type="button"
                        onClick={() => { addContextChip({ type: 'canvas_snapshot', label: `${circuitContext?.gate_count || 0}g·${circuitContext?.wire_count || 0}n`, data: { gates: circuitContext?.gate_count, wires: circuitContext?.wire_count, name: circuitContext?.circuit_name } }); setShowContextPicker(false); }}
                        className="w-full text-left p-2 rounded-lg hover:bg-slate-800 flex items-center space-x-2 cursor-pointer transition"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-200 font-medium">Canvas Snapshot</div>
                          <div className="text-[9px] text-slate-500">{circuitContext?.gate_count || 0} gates · {circuitContext?.wire_count || 0} nets</div>
                        </div>
                      </button>
                      {/* DRC issues */}
                      {liveMentalMap.identifiedIssues.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { addContextChip({ type: 'drc_issue', label: `${liveMentalMap.identifiedIssues.length} DRC violations`, data: { issues: liveMentalMap.identifiedIssues } }); setShowContextPicker(false); }}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-800 flex items-center space-x-2 cursor-pointer transition"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[10px] text-slate-200 font-medium">{liveMentalMap.identifiedIssues.length} DRC Violations</div>
                            <div className="text-[9px] text-slate-500">Attach all flagged issues</div>
                          </div>
                        </button>
                      )}
                      {/* Prior chat */}
                      {userChatMessages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { addContextChip({ type: 'chat_history', label: `Last ${Math.min(5, userChatMessages.length)} messages`, data: { count: Math.min(5, userChatMessages.length), messages: userChatMessages.slice(-5) } }); setShowContextPicker(false); }}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-800 flex items-center space-x-2 cursor-pointer transition"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[10px] text-slate-200 font-medium">Recent Chat</div>
                            <div className="text-[9px] text-slate-500">Last {Math.min(5, userChatMessages.length)} messages</div>
                          </div>
                        </button>
                      )}
                      {/* Custom text snippet */}
                      <div className="border-t border-slate-800 pt-2 mt-1">
                        <div className="text-[9px] text-slate-400 font-mono mb-1 px-1">Paste custom context snippet:</div>
                        <div className="flex items-center space-x-1.5 px-1">
                          <input
                            type="text"
                            value={customContextText}
                            onChange={e => setCustomContextText(e.target.value)}
                            placeholder="Any code, notes, or text..."
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 font-mono"
                            onKeyDown={e => { if (e.key === 'Enter' && customContextText.trim()) { addContextChip({ type: 'custom', label: customContextText.slice(0, 30), data: { text: customContextText } }); setCustomContextText(''); setShowContextPicker(false); } }}
                          />
                          <button
                            type="button"
                            onClick={() => { if (customContextText.trim()) { addContextChip({ type: 'custom', label: customContextText.slice(0, 30), data: { text: customContextText } }); setCustomContextText(''); setShowContextPicker(false); } }}
                            className="p-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Run / Send button */}
            <button
              type="submit"
              disabled={!steerPrompt.trim() && contextChips.length === 0}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-teal-500/20 transition cursor-pointer"
              title={agentState === 'RUNNING' || agentState === 'PAUSED' ? 'Steer Agent' : 'Send / Launch Task'}
            >
              {agentState === 'RUNNING' || agentState === 'PAUSED' ? (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Steer</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{steerPrompt.trim().length > 30 ? 'Launch Task' : 'Send'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  )}

      {/* ── Settings Modal ────────────────────────────────────────────────── */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-400">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">OpenRouter Configuration</h3>
                  <p className="text-[11px] text-slate-400">Connect frontier AI models for autonomous synthesis</p>
                </div>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {serverKeyStatus?.is_configured && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between font-mono">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Server {serverKeyStatus.source === 'env' ? 'Env (.env)' : 'Active'}: {serverKeyStatus.masked_key}</span>
                </div>
                <span className="text-[10px] bg-emerald-900/60 px-1.5 py-0.5 rounded border border-emerald-700">Secure</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>OpenRouter API Key</span>
              </label>
              <input
                type="password"
                placeholder="sk-or-..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <div className="flex items-center space-x-3 text-[10px] text-slate-400">
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input type="radio" name="storage" checked={keyStoragePref === 'session'} onChange={() => setKeyStoragePref('session')} className="accent-purple-500" />
                  <span>Session only</span>
                </label>
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input type="radio" name="storage" checked={keyStoragePref === 'local'} onChange={() => setKeyStoragePref('local')} className="accent-purple-500" />
                  <span>Persist locally</span>
                </label>
              </div>
            </div>

            {/* Saved Models */}
            {savedModels.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Saved Models</div>
                <div className="flex flex-wrap gap-1">
                  {savedModels.map((sm) => {
                    const isActive = (useCustomModel && customModelInput === sm) || (!useCustomModel && tempModel === sm);
                    const shortName = sm.includes('/') ? sm.split('/')[1] : sm;
                    return (
                      <span
                        key={sm}
                        onClick={() => { setTempModel(sm); setCustomModelInput(sm); setUseCustomModel(true); }}
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer border transition ${isActive ? 'bg-purple-900/70 border-purple-500 text-purple-200 font-bold' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'}`}
                        title={sm}
                      >
                        <span>{shortName}</span>
                        <button type="button" onClick={(e) => handleRemoveFavoriteModel(sm, e)} className="hover:text-rose-400 opacity-60 hover:opacity-100 transition">×</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Model Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search OpenRouter models..."
                value={modelSearchQuery}
                onChange={(e) => { setModelSearchQuery(e.target.value); setIsModelSearchOpen(true); }}
                onFocus={() => setIsModelSearchOpen(true)}
                className="w-full bg-slate-950 border border-slate-700 hover:border-purple-500/60 focus:border-purple-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none transition"
              />
              {isSearchingModels && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" /></div>}
              {isModelSearchOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsModelSearchOpen(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur z-50 p-1">
                    {modelSearchResults.length === 0 ? (
                      <div className="p-3 text-center text-slate-400 text-xs">{isSearchingModels ? 'Searching...' : 'No results. Enter a custom model ID.'}</div>
                    ) : (
                      modelSearchResults.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => { setTempModel(m.id); setCustomModelInput(m.id); setUseCustomModel(true); setIsModelSearchOpen(false); }}
                          className="p-2 hover:bg-slate-800/80 rounded-lg cursor-pointer flex items-start justify-between space-x-2"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-200 text-xs flex items-center space-x-1.5">
                              <span>{m.name}</span>
                              {m.is_reasoning && <span className="text-[9px] bg-purple-950 border border-purple-700 text-purple-300 px-1 rounded font-mono">Reasoning</span>}
                            </div>
                            <div className="text-[10px] text-purple-400 font-mono mt-0.5 truncate">{m.id}</div>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{Math.round((m.context_window || 0) / 1000)}k ctx</span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Active model display */}
            <div className="p-2 rounded-lg bg-purple-950/40 border border-purple-900/80 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 text-[11px]">Selected:</span>
              <span className="text-purple-300 font-bold truncate max-w-[240px]">{useCustomModel && customModelInput ? customModelInput : tempModel}</span>
            </div>

            {testStatus && (
              <div className={`p-2.5 rounded-lg border text-xs flex items-start space-x-2 ${testStatus.testing ? 'bg-slate-950 border-slate-800 text-slate-300' : testStatus.success ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300' : 'bg-rose-950/80 border-rose-700 text-rose-300'}`}>
                {testStatus.testing ? <Loader2 className="w-4 h-4 animate-spin text-purple-400 mt-0.5" /> : testStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />}
                <div className="leading-snug">{testStatus.testing ? 'Testing connection...' : testStatus.msg}</div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <button type="button" onClick={handleTestConnection} disabled={testStatus?.testing} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer">
                Test Connection
              </button>
              <div className="flex items-center space-x-2">
                <button type="button" onClick={() => setIsSettingsOpen(false)} className="px-3 py-1.5 bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs transition cursor-pointer">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveSettings} className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer">
                  Save & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Modal close ── */}
    </div>
  );
};

// ── Engineering Log Card sub-component ──────────────────────────────────────
interface EngLogCardProps {
  log: AgentLog;
  isUser: boolean;
  isSynth: boolean;
  isDRC: boolean;
  isSim: boolean;
  outcome: string;
}

const EngLogCard: React.FC<EngLogCardProps> = ({ log, isUser, isSynth, isDRC, isSim, outcome }) => {
  const [expanded, setExpanded] = useState(false);

  const icon = isUser ? '👤' : isSynth ? '⚙' : isDRC ? '🔍' : isSim ? '📊' : log.action === 'phase_start' ? '▶' : log.action === 'phase_complete' ? '✓' : '⚡';
  const color = isSynth ? 'border-purple-800/60 bg-purple-950/20' : isDRC ? 'border-amber-800/60 bg-amber-950/10' : isSim ? 'border-cyan-800/60 bg-cyan-950/10' : isUser ? 'border-indigo-800/60 bg-indigo-950/20' : 'border-slate-800 bg-slate-900/50';
  const ts = new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className={`rounded-lg border ${color} overflow-hidden`}>
      <div className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center space-x-2 min-w-0">
          <span className="text-[11px] flex-shrink-0">{icon}</span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex-shrink-0 ${isSynth ? 'bg-purple-950 text-purple-300 border border-purple-800' : isDRC ? 'bg-amber-950 text-amber-300 border border-amber-800' : isSim ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : isUser ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' : 'bg-slate-900 text-slate-400 border border-slate-700'}`}>
            {log.action || log.state}
          </span>
          <span className="text-[10px] text-slate-300 truncate font-sans">{log.thought.slice(0, 80)}{log.thought.length > 80 ? '...' : ''}</span>
          {outcome && <span className="text-[9px] text-emerald-400 font-mono flex-shrink-0">{outcome}</span>}
        </div>
        <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
          <span className="text-[9px] text-slate-500 font-mono">{ts}</span>
          {log.details && Object.keys(log.details).length > 0 && (
            <ChevronRight className={`w-3 h-3 text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          )}
        </div>
      </div>
      {expanded && log.details && Object.keys(log.details).length > 0 && (
        <div className="px-2.5 pb-2 border-t border-slate-800/60">
          <pre className="text-[9px] text-slate-400 overflow-x-auto mt-1.5 leading-relaxed">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
