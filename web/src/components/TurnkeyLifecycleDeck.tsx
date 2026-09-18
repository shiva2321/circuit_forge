import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
  Brain,
  Factory,
  ShieldCheck,
  Flame,
  Boxes,
  Cpu,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  RefreshCw,
  TrendingUp,
  Shield,
  Layers,
  Thermometer,
  Radio,
  Sliders,
  Sparkles,
  ArrowRightLeft,
  ChevronRight,
  Info,
  Save,
  FileCode,
  Package,
  CheckCheck,
  Loader2,
  Check,
  FolderTree,
} from 'lucide-react';
import {
  runMultiphysicsSimulation,
  runDfmStackupAudit,
  runQaInspection,
  runFirmwareSecurity,
  runSupplyChainLifecycle,
  exportLifecycleArtifact,
  validateCode,
} from '../services/api';

export interface TurnkeyLifecycleDeckProps {
  circuitName?: string;
  projectId?: string;
  onOpenFileInEditor?: (projectId: string, filePath: string) => void;
  onSelectProject?: (projectId: string) => void;
}

type PillarTab = 'multiphysics' | 'forging' | 'qa' | 'firmware' | 'supply_chain';

export const TurnkeyLifecycleDeck: React.FC<TurnkeyLifecycleDeckProps> = ({
  circuitName = 'CircuitForge_Enterprise_SoC',
  projectId,
  onOpenFileInEditor,
  onSelectProject,
}) => {
  const [activeTab, setActiveTab] = useState<PillarTab>(() => {
    const saved = localStorage.getItem('circuitforge_lifecycle_tab');
    if (saved === 'multiphysics' || saved === 'forging' || saved === 'qa' || saved === 'firmware' || saved === 'supply_chain') {
      return saved;
    }
    return 'multiphysics';
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('circuitforge_lifecycle_tab', activeTab);
  }, [activeTab]);

  // Pillar 1: Multiphysics State
  const [mpClockMhz, setMpClockMhz] = useState<number>(350);
  const [mpTraceLenMm, setMpTraceLenMm] = useState<number>(45);
  const [mpVoltage, setMpVoltage] = useState<number>(1.0);
  const [mpCurrent, setMpCurrent] = useState<number>(3.5);
  const [mpAirflow, setMpAirflow] = useState<number>(1.5);
  const [multiphysicsData, setMultiphysicsData] = useState<any>(null);

  // Pillar 2: Forging & DFM State
  const [layerCount, setLayerCount] = useState<number>(8);
  const [substrateFamily, setSubstrateFamily] = useState<string>('Rogers_RO4350B');
  const [traceWidthMil, setTraceWidthMil] = useState<number>(3.5);
  const [useNitrogen, setUseNitrogen] = useState<boolean>(true);
  const [forgingData, setForgingData] = useState<any>(null);

  // Pillar 3: QA & Testing State
  const [bgaPackage, setBgaPackage] = useState<string>('BGA256_0.5mm_Pitch');
  const [bgaBallCount, setBgaBallCount] = useState<number>(64);
  const [totalNets, setTotalNets] = useState<number>(48);
  const [qaData, setQaData] = useState<any>(null);

  // Pillar 4: Firmware & Security State
  const [baseAddress, setBaseAddress] = useState<string>('0x40000000');
  const [activeFwTab, setActiveFwTab] = useState<'c_hal' | 'rust_pac' | 'rtos' | 'security'>(() => {
    const saved = localStorage.getItem('circuitforge_lifecycle_fw_tab');
    if (saved === 'c_hal' || saved === 'rust_pac' || saved === 'rtos' || saved === 'security') return saved;
    return 'c_hal';
  });

  useEffect(() => {
    localStorage.setItem('circuitforge_lifecycle_fw_tab', activeFwTab);
  }, [activeFwTab]);
  const [firmwareData, setFirmwareData] = useState<any>(null);

  // Pillar 5: Supply Chain & BOM State
  const [targetVolume, setTargetVolume] = useState<number>(1000);
  const [supplyChainData, setSupplyChainData] = useState<any>(null);
  const [substitutionNotice, setSubstitutionNotice] = useState<string | null>(null);

  // Unified Lifecycle Artifacts & Firmware Editing State
  const [fwCode, setFwCode] = useState<string>('');
  const [isFwDirty, setIsFwDirty] = useState<boolean>(false);
  const [isFwSaving, setIsFwSaving] = useState<boolean>(false);
  const [fwSaveNotice, setFwSaveNotice] = useState<string | null>(null);
  const [isFwValidating, setIsFwValidating] = useState<boolean>(false);
  const [fwValidationResult, setFwValidationResult] = useState<any>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!firmwareData) return;
    const code =
      activeFwTab === 'c_hal'
        ? firmwareData.firmware?.c_hal_driver || ''
        : activeFwTab === 'rust_pac'
        ? firmwareData.firmware?.embedded_rust_pac || ''
        : activeFwTab === 'rtos'
        ? firmwareData.firmware?.rtos_task_template || ''
        : JSON.stringify(firmwareData.security || {}, null, 2);
    setFwCode(code);
    setIsFwDirty(false);
    setFwValidationResult(null);
  }, [firmwareData, activeFwTab]);

  const getFwLanguage = (tab: string) => {
    if (tab === 'c_hal' || tab === 'rtos') return 'c';
    if (tab === 'rust_pac') return 'rust';
    if (tab === 'security') return 'json';
    return 'plaintext';
  };

  const getFwFilePath = (tab: string) => {
    const slug = circuitName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (tab === 'c_hal') return `firmware/${slug}_hal.c`;
    if (tab === 'rust_pac') return `firmware/src/${slug}_pac.rs`;
    if (tab === 'rtos') return `firmware/${slug}_rtos_task.c`;
    return `security/root_of_trust_manifest.json`;
  };

  const handleValidateFirmware = async () => {
    setIsFwValidating(true);
    try {
      const res = await validateCode({
        code: fwCode,
        language: getFwLanguage(activeFwTab),
        file_path: getFwFilePath(activeFwTab),
      });
      setFwValidationResult(res);
    } catch (e) {
      console.error('Firmware validation failed', e);
    } finally {
      setIsFwValidating(false);
    }
  };

  const handleSaveFirmwareToProject = async () => {
    const targetProj = projectId || 'current';
    setIsFwSaving(true);
    try {
      const res = await exportLifecycleArtifact({
        project_id: targetProj,
        artifact_type: activeFwTab,
        circuit_name: circuitName,
        payload: activeFwTab === 'security' ? undefined : fwCode,
      });
      if (res && res.success) {
        setIsFwDirty(false);
        const files = Object.keys(res.exported_files || {}).join(', ');
        setFwSaveNotice(res.message || `Saved to workspace: ${files}`);
        setTimeout(() => setFwSaveNotice(null), 3500);
      }
    } catch (e) {
      console.error('Failed to export firmware', e);
      setFwSaveNotice('Export failed');
      setTimeout(() => setFwSaveNotice(null), 3000);
    } finally {
      setIsFwSaving(false);
    }
  };

  const handleOpenFwInEditor = () => {
    const targetProj = projectId || 'current';
    const filePath = getFwFilePath(activeFwTab);
    if (onOpenFileInEditor) {
      onOpenFileInEditor(targetProj, filePath);
    } else if (onSelectProject) {
      onSelectProject(targetProj);
    }
  };

  const handleExportArtifact = async (artifactType: string, payload?: any) => {
    const targetProj = projectId || 'current';
    setIsExporting(true);
    try {
      const res = await exportLifecycleArtifact({
        project_id: targetProj,
        artifact_type: artifactType,
        circuit_name: circuitName,
        payload: payload,
      });
      if (res && res.success) {
        const files = Object.keys(res.exported_files || {}).join(', ');
        setExportNotice(res.message || `Exported ${artifactType}: ${files}`);
        setTimeout(() => setExportNotice(null), 3500);
        if (onSelectProject) {
          onSelectProject(targetProj);
        }
      }
    } catch (e) {
      console.error('Failed to export artifact', e);
      setExportNotice('Export failed');
      setTimeout(() => setExportNotice(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  // Auto-run active tab data on initial mount or tab change if null
  useEffect(() => {
    if (activeTab === 'multiphysics' && !multiphysicsData) {
      handleRunMultiphysics();
    } else if (activeTab === 'forging' && !forgingData) {
      handleRunForging();
    } else if (activeTab === 'qa' && !qaData) {
      handleRunQa();
    } else if (activeTab === 'firmware' && !firmwareData) {
      handleRunFirmware();
    } else if (activeTab === 'supply_chain' && !supplyChainData) {
      handleRunSupplyChain();
    }
  }, [activeTab]);

  const handleRunMultiphysics = async () => {
    setLoading(true);
    try {
      const res = await runMultiphysicsSimulation({
        circuit_name: circuitName,
        clock_mhz: mpClockMhz,
        trace_length_mm: mpTraceLenMm,
        supply_voltage: mpVoltage,
        load_current_a: mpCurrent,
        airflow_mps: mpAirflow,
      });
      setMultiphysicsData(res);
    } catch (e) {
      console.error('Failed to run multiphysics co-simulation', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRunForging = async () => {
    setLoading(true);
    try {
      const res = await runDfmStackupAudit({
        circuit_name: circuitName,
        layer_count: layerCount,
        substrate_family: substrateFamily,
        trace_width_mil: traceWidthMil,
        use_nitrogen_purge: useNitrogen,
      });
      setForgingData(res);
    } catch (e) {
      console.error('Failed to run forging DFM audit', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRunQa = async () => {
    setLoading(true);
    try {
      const res = await runQaInspection({
        circuit_name: circuitName,
        bga_package: bgaPackage,
        ball_count: bgaBallCount,
        total_nets: totalNets,
        fundamental_clock_mhz: mpClockMhz,
      });
      setQaData(res);
    } catch (e) {
      console.error('Failed to run QA inspection', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRunFirmware = async () => {
    setLoading(true);
    try {
      const res = await runFirmwareSecurity({
        circuit_name: circuitName,
        base_address_hex: baseAddress,
        test_cycles: 1000,
      });
      setFirmwareData(res);
    } catch (e) {
      console.error('Failed to run firmware & RoT generation', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSupplyChain = async () => {
    setLoading(true);
    try {
      const res = await runSupplyChainLifecycle({
        circuit_name: circuitName,
        target_volume: targetVolume,
      });
      setSupplyChainData(res);
    } catch (e) {
      console.error('Failed to extract BOM', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubstituteComponent = async (originalMpn: string, altMpn: string) => {
    setLoading(true);
    try {
      const res = await runSupplyChainLifecycle({
        action: 'substitute',
        original_mpn: originalMpn,
        substitute_mpn: altMpn,
      });
      if (res?.success) {
        setSubstitutionNotice(`Substituted ${originalMpn} with ${altMpn} (Pin-Compatible drop-in)`);
        // Refresh BOM
        handleRunSupplyChain();
      }
    } catch (e) {
      console.error('Failed to substitute component', e);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Turnkey Lifecycle Top Bar */}
      <div className="h-14 border-b border-slate-800/80 bg-slate-900/60 px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-md shadow-rose-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm tracking-wide text-white">
                Turnkey Hardware Lifecycle Solution
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-800/60 text-amber-300 font-semibold">
                Tier-1 Silicon & Assembly
              </span>
            </div>
          </div>
        </div>

        {/* 5 Core Pillar Tabs */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 space-x-1">
          <button
            onClick={() => setActiveTab('multiphysics')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'multiphysics'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-blue-300" />
            <span>1. Multiphysics & SI/PI</span>
          </button>

          <button
            onClick={() => setActiveTab('forging')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'forging'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Factory className="w-3.5 h-3.5 text-amber-300" />
            <span>2. Forging & HDI DFM</span>
          </button>

          <button
            onClick={() => setActiveTab('qa')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'qa'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span>3. QA & Virtual Testing</span>
          </button>

          <button
            onClick={() => setActiveTab('firmware')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'firmware'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-pink-300" />
            <span>4. Firmware & RoT Security</span>
          </button>

          <button
            onClick={() => setActiveTab('supply_chain')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'supply_chain'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Boxes className="w-3.5 h-3.5 text-cyan-300" />
            <span>5. Supply Chain & BOM</span>
          </button>
        </div>

        {/* Global Action Refresh & Artifact Materialization */}
        <div className="flex items-center space-x-2">
          {activeTab === 'multiphysics' && multiphysicsData && (
            <button
              onClick={() => handleExportArtifact('multiphysics', multiphysicsData)}
              disabled={isExporting}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-blue-950/60 border border-blue-800 hover:bg-blue-900/60 text-blue-300 text-xs font-medium cursor-pointer transition disabled:opacity-50"
              title="Export physical report to project workspace (reports/multiphysics.json)"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Export Report</span>
            </button>
          )}

          {activeTab === 'forging' && forgingData && (
            <button
              onClick={() => handleExportArtifact('dfm_stackup', forgingData.stackup)}
              disabled={isExporting}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-800 hover:bg-amber-900/60 text-amber-300 text-xs font-medium cursor-pointer transition disabled:opacity-50"
              title="Save stackup constraints to project workspace (constraints/stackup.json)"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              <span>Save Stackup</span>
            </button>
          )}

          {activeTab === 'supply_chain' && supplyChainData && (
            <button
              onClick={() => handleExportArtifact('bom', supplyChainData)}
              disabled={isExporting}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 hover:bg-emerald-900/60 text-emerald-300 text-xs font-medium cursor-pointer transition disabled:opacity-50"
              title="Save BOM to project workspace (bom.json)"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
              <span>Save BOM</span>
            </button>
          )}

          <button
            onClick={() => {
              if (activeTab === 'multiphysics') handleRunMultiphysics();
              if (activeTab === 'forging') handleRunForging();
              if (activeTab === 'qa') handleRunQa();
              if (activeTab === 'firmware') handleRunFirmware();
              if (activeTab === 'supply_chain') handleRunSupplyChain();
            }}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition border border-slate-700 cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-400' : ''}`} />
            <span>{loading ? 'Simulating...' : 'Re-Simulate'}</span>
          </button>
        </div>
      </div>

      {/* Artifact Export Notice Banner */}
      {exportNotice && (
        <div className="bg-emerald-950/80 border-b border-emerald-800 px-5 py-2 flex items-center justify-between text-xs font-mono text-emerald-300">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportNotice}</span>
          </div>
          <button
            onClick={() => setExportNotice(null)}
            className="text-slate-400 hover:text-white text-xs cursor-pointer ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Deck Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* ============================================================== */}
        {/* PILLAR 1: MULTIPHYSICS CO-SIMULATION (SI, PI, CFD, FEA)         */}
        {/* ============================================================== */}
        {activeTab === 'multiphysics' && (
          <div className="space-y-5">
            {/* Control Bar */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Clock Freq (MHz)</label>
                  <input
                    type="number"
                    value={mpClockMhz}
                    onChange={(e) => setMpClockMhz(Number(e.target.value))}
                    className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Trace Length (mm)</label>
                  <input
                    type="number"
                    value={mpTraceLenMm}
                    onChange={(e) => setMpTraceLenMm(Number(e.target.value))}
                    className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Core Voltage (V)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={mpVoltage}
                    onChange={(e) => setMpVoltage(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Load Current (A)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={mpCurrent}
                    onChange={(e) => setMpCurrent(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Airflow (m/s)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={mpAirflow}
                    onChange={(e) => setMpAirflow(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>

              {multiphysicsData && (
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Physics Composite Score</span>
                    <span className="text-xl font-black text-emerald-400 font-mono">
                      {multiphysicsData.composite_physics_score}/100
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-700 text-emerald-300">
                    {multiphysicsData.overall_status}
                  </span>
                </div>
              )}
            </div>

            {multiphysicsData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 1. Signal Integrity (SI) & Eye Diagram */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-4 h-4 text-blue-400" />
                      <span className="font-semibold text-sm text-white">Signal Integrity & Eye Diagram</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                      Z0: {multiphysicsData.signal_integrity?.characteristic_impedance_ohms} Ω
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono py-1">
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Eye Height</span>
                      <span className="text-blue-300 font-bold">{multiphysicsData.signal_integrity?.eye_height_v} V</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Eye Width</span>
                      <span className="text-blue-300 font-bold">{multiphysicsData.signal_integrity?.eye_width_ps} ps</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Total Jitter (Tj)</span>
                      <span className="text-amber-300 font-bold">{multiphysicsData.signal_integrity?.total_jitter_ps} ps</span>
                    </div>
                  </div>

                  {/* SVG Eye Diagram Simulation */}
                  <div className="h-44 w-full bg-slate-950 rounded-lg border border-slate-800 p-2 relative flex items-center justify-center overflow-hidden">
                    <svg className="w-full h-full" viewBox="0 0 300 120">
                      {/* Grid Lines */}
                      <line x1="0" y1="60" x2="300" y2="60" stroke="#334155" strokeDasharray="3,3" strokeWidth="0.8" />
                      <line x1="150" y1="0" x2="150" y2="120" stroke="#334155" strokeDasharray="3,3" strokeWidth="0.8" />
                      {/* Eye Opening Overlay Mask */}
                      <ellipse cx="150" cy="60" rx="45" ry="32" fill="none" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="2,2" opacity="0.4" />
                      {/* Traces */}
                      {multiphysicsData.signal_integrity?.eye_traces?.map((tr: any, idx: number) => {
                        const pathStr = tr.points
                          ?.map((pt: [number, number], i: number) => `${i === 0 ? 'M' : 'L'} ${pt[0] * 3} ${120 - pt[1] * 100}`)
                          .join(' ');
                        return (
                          <path
                            key={idx}
                            d={pathStr}
                            fill="none"
                            stroke={idx % 2 === 0 ? '#38bdf8' : '#a855f7'}
                            strokeWidth="1.4"
                            opacity="0.85"
                          />
                        );
                      })}
                    </svg>
                    <div className="absolute bottom-1 right-2 text-[9px] font-mono text-slate-500">
                      BER: {multiphysicsData.signal_integrity?.ber_estimate}
                    </div>
                  </div>
                </div>

                {/* 2. Power Integrity (PI) & DC IR Drop */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-sm text-white">Power Integrity & DC IR Drop</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                      {multiphysicsData.power_integrity?.verdict}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono py-1">
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">DC IR Drop</span>
                      <span className="text-emerald-400 font-bold">{multiphysicsData.power_integrity?.dc_ir_drop_mv} mV</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Die Voltage</span>
                      <span className="text-white font-bold">{multiphysicsData.power_integrity?.voltage_at_die_v} V</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Current Density</span>
                      <span className="text-cyan-300 font-bold">{multiphysicsData.power_integrity?.current_density_a_mm2} A/mm²</span>
                    </div>
                  </div>

                  {/* Frequency Dependent PDN Impedance Profile */}
                  <div className="bg-slate-950 rounded-lg border border-slate-800 p-3">
                    <span className="text-[11px] font-mono text-slate-400 block mb-2">PDN Impedance Spectrum Z(f)</span>
                    <div className="space-y-1">
                      {multiphysicsData.power_integrity?.impedance_profile?.slice(0, 4).map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs font-mono">
                          <span className="text-slate-400">{p.frequency}</span>
                          <div className="flex-1 mx-3 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full"
                              style={{ width: `${Math.min(100, (p.z_ohms / 0.1) * 100)}%` }}
                            />
                          </div>
                          <span className="text-emerald-300">{p.z_ohms} Ω ({p.status})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Thermal CFD Diffusion Heatmap */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <Thermometer className="w-4 h-4 text-rose-400" />
                      <span className="font-semibold text-sm text-white">Thermal CFD Diffusion (10x10 Finite Grid)</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono">
                      Tj Peak: {multiphysicsData.thermal_cfd?.peak_junction_temp_c} °C
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Thermal Margin to Tj_max:</span>
                    <span className="text-emerald-400 font-bold">+{multiphysicsData.thermal_cfd?.thermal_margin_c} °C</span>
                  </div>

                  {/* 10x10 Heatmap Grid */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col items-center">
                    <div className="grid grid-cols-10 gap-1 w-full max-w-xs">
                      {multiphysicsData.thermal_cfd?.thermal_grid?.flatMap((row: number[], rIdx: number) =>
                        row.map((val: number, cIdx: number) => {
                          const norm = Math.max(0, Math.min(1, (val - 25) / 50));
                          const color = norm > 0.7 ? '#ef4444' : norm > 0.4 ? '#f59e0b' : '#3b82f6';
                          return (
                            <div
                              key={`${rIdx}-${cIdx}`}
                              className="w-full aspect-square rounded-xs transition hover:scale-125 hover:z-10"
                              style={{ backgroundColor: color, opacity: 0.35 + norm * 0.65 }}
                              title={`Cell [${rIdx},${cIdx}]: ${val} °C`}
                            />
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center justify-between w-full max-w-xs text-[9px] font-mono text-slate-400 mt-2">
                      <span>Ambient 25°C</span>
                      <div className="h-1.5 flex-1 mx-3 rounded bg-gradient-to-r from-blue-500 via-amber-500 to-red-500" />
                      <span>Peak 75°C+</span>
                    </div>
                  </div>
                </div>

                {/* 4. Mechanical FEA & Stress */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      <span className="font-semibold text-sm text-white">Mechanical FEA & Drop Shock Integrity</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                      {multiphysicsData.mechanical_fea?.verdict}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono py-1">
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Warpage</span>
                      <span className="text-white font-bold">{multiphysicsData.mechanical_fea?.warping_displacement_um} µm</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">1.5m Drop Shock</span>
                      <span className="text-amber-400 font-bold">{multiphysicsData.mechanical_fea?.impact_g_force} G</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Solder Shear</span>
                      <span className="text-blue-300 font-bold">{multiphysicsData.mechanical_fea?.solder_shear_stress_mpa} MPa</span>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-300">
                      <span>Max Allowable Warping (IPC-TM-650):</span>
                      <span className="font-mono text-emerald-400">{multiphysicsData.mechanical_fea?.max_allowable_warping_um} µm</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>SAC305 Solder Yield Strength:</span>
                      <span className="font-mono text-emerald-400">{multiphysicsData.mechanical_fea?.yield_strength_solder_mpa} MPa</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* PILLAR 2: FORGING & HIGH-PRECISION HDI DFM                      */}
        {/* ============================================================== */}
        {activeTab === 'forging' && (
          <div className="space-y-5">
            {/* Control Bar */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Layer Count (2-32)</label>
                  <select
                    value={layerCount}
                    onChange={(e) => setLayerCount(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                  >
                    {[2, 4, 6, 8, 12, 16, 24, 32].map((l) => (
                      <option key={l} value={l}>{l} Layers</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Substrate Preset</label>
                  <select
                    value={substrateFamily}
                    onChange={(e) => setSubstrateFamily(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                  >
                    <option value="Rogers_RO4350B">Rogers RO4350B (Low Loss HF)</option>
                    <option value="Megtron 6">Panasonic Megtron 6 (High Speed)</option>
                    <option value="FR4_HighTg">FR4 High-Tg (Standard Multi-Layer)</option>
                    <option value="Polyimide_Flex">Polyimide (Rigid-Flex)</option>
                    <option value="Ceramic_Al2O3">Ceramic Al2O3 (Extreme Thermal)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Min Trace (mil)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={traceWidthMil}
                    onChange={(e) => setTraceWidthMil(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-4">
                  <input
                    type="checkbox"
                    id="n2-purge"
                    checked={useNitrogen}
                    onChange={(e) => setUseNitrogen(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                  />
                  <label htmlFor="n2-purge" className="text-xs text-slate-300 font-medium">Nitrogen (N2) Reflow Purge</label>
                </div>
              </div>

              {forgingData && (
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Forging DFM Score</span>
                    <span className="text-xl font-black text-amber-400 font-mono">
                      {forgingData.overall_forging_score}/100
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 border border-amber-700 text-amber-300">
                    {forgingData.status}
                  </span>
                </div>
              )}
            </div>

            {forgingData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 1. Symmetrical Layer Stackup Architecture */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-amber-400" />
                      <span className="font-semibold text-sm text-white">
                        {forgingData.stackup?.layer_count}-Layer Symmetrical Stackup ({forgingData.stackup?.substrate_name})
                      </span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                      Er: {forgingData.stackup?.dielectric_constant_er} | Tg: {forgingData.stackup?.glass_transition_temp_tg_c}°C
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono py-1">
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Single-Ended 50Ω Trace Width</span>
                      <span className="text-amber-300 font-bold">{forgingData.stackup?.calc_single_ended_width_mil} mil</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">100Ω Diff-Pair Spacing</span>
                      <span className="text-amber-300 font-bold">{forgingData.stackup?.calc_diff_pair_spacing_mil} mil</span>
                    </div>
                  </div>

                  {/* Stackup Graphic Layers */}
                  <div className="space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-800 max-h-52 overflow-y-auto">
                    {forgingData.stackup?.layers?.map((layer: any, idx: number) => (
                      <div
                        key={idx}
                        className={`px-3 py-1 rounded text-xs font-mono flex items-center justify-between ${
                          layer.type === 'SIGNAL'
                            ? 'bg-amber-950/50 text-amber-200 border-l-4 border-amber-500'
                            : layer.type === 'GND_PLANE'
                            ? 'bg-blue-950/50 text-blue-200 border-l-4 border-blue-500'
                            : 'bg-red-950/50 text-red-200 border-l-4 border-red-500'
                        }`}
                      >
                        <span className="font-bold">L{layer.layer_idx}: {layer.name}</span>
                        <span className="text-[10px] text-slate-400">{layer.type} | {layer.thickness_um} µm</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Sub-1-mil Ultra-HDI DFM Rule Audit */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-sm text-white">Ultra-HDI Fabrication DFM Audit</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                      {forgingData.dfm_rules?.fabrication_tier}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white block">Fabrication Yield Score</span>
                      <span className="text-xs text-slate-400">Total DRC/DFM Violations: {forgingData.dfm_rules?.total_violations}</span>
                    </div>
                    <span className="text-lg font-mono font-bold text-emerald-400">
                      {forgingData.dfm_rules?.dfm_yield_score}%
                    </span>
                  </div>

                  {/* SMT Reflow Oven 8-Zone Nitrogen Curve */}
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-300">SMT Reflow Atmosphere:</span>
                      <span className="text-amber-400">{forgingData.smt_assembly?.nitrogen_n2_purge ? 'Nitrogen N2 Purged (<100 ppm O2)' : 'Air Ambient'}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-300">Smallest Component Placement:</span>
                      <span className="text-cyan-300">{forgingData.smt_assembly?.smallest_component_package}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-300">Tombstone Risk Index:</span>
                      <span className="text-emerald-400">{forgingData.smt_assembly?.tombstone_risk_percentage}% (Low)</span>
                    </div>

                    <div className="pt-2">
                      <span className="text-[10px] font-mono text-slate-500 block mb-1">8-Zone Thermal Profile:</span>
                      <div className="grid grid-cols-4 gap-1 text-[10px] font-mono text-center">
                        {forgingData.smt_assembly?.reflow_zones?.map((z: any, i: number) => {
                          const zoneLabel = (z?.zone_name || z?.name || `Zone ${z?.zone ?? (i + 1)}`).toString().split(' ')[0];
                          const temp = z?.setpoint_temp_c ?? z?.target_temp_c ?? 0;
                          return (
                            <div key={i} className="p-1 bg-slate-900 rounded border border-slate-800 text-slate-300">
                              {zoneLabel}: {temp}°C
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* PILLAR 3: QA, VIRTUAL INSPECTION & CERTIFICATION               */}
        {/* ============================================================== */}
        {activeTab === 'qa' && (
          <div className="space-y-5">
            {/* Control Bar */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">BGA Package</label>
                  <select
                    value={bgaPackage}
                    onChange={(e) => setBgaPackage(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                  >
                    <option value="BGA256_0.5mm_Pitch">BGA256 (0.5mm Pitch)</option>
                    <option value="BGA484_0.4mm_Pitch">BGA484 (0.4mm Pitch)</option>
                    <option value="BGA1156_0.8mm_Pitch">BGA1156 (0.8mm Pitch)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Ball Count</label>
                  <input
                    type="number"
                    value={bgaBallCount}
                    onChange={(e) => setBgaBallCount(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Total Nets</label>
                  <input
                    type="number"
                    value={totalNets}
                    onChange={(e) => setTotalNets(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>

              {qaData && (
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Inspection Standard</span>
                    <span className="text-xs font-mono font-bold text-emerald-400 block">
                      IPC-A-610 Class 3 / Space
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-700 text-emerald-300">
                    {qaData.certification_status}
                  </span>
                </div>
              )}
            </div>

            {qaData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 1. 3D X-Ray (AXI) BGA Ball Grid Void Matrix */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-sm text-white">3D X-Ray (AXI) BGA Void Matrix</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                      Avg Void: {qaData.xray_bga?.average_void_percentage}% (Limit 15%)
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col items-center">
                    <div className="grid grid-cols-8 gap-1.5 w-full max-w-xs">
                      {qaData.xray_bga?.ball_inspection_map?.slice(0, 64).map((ball: any, idx: number) => {
                        const isDefective = ball.is_defective;
                        const voidPct = ball.void_percentage;
                        const bgClass = isDefective ? 'bg-red-500' : voidPct > 10 ? 'bg-amber-500' : 'bg-emerald-500';
                        return (
                          <div
                            key={idx}
                            className={`w-full aspect-square rounded-full transition hover:scale-150 cursor-pointer ${bgClass}`}
                            title={`Ball ${ball.ball_id}: ${voidPct}% Void (${ball.status})`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between w-full max-w-xs text-[9px] font-mono text-slate-400 mt-2">
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/><span>&lt;10% Nominal</span></span>
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/><span>10-15% Caution</span></span>
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/><span>&gt;15% Reject</span></span>
                    </div>
                  </div>
                </div>

                {/* 2. Flying Probe ICT & 3D AOI */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      <span className="font-semibold text-sm text-white">Flying Probe ICT & 3D AOI</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                      Nodal Coverage: {qaData.flying_probe_ict?.nodal_fault_coverage_percentage}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono py-1">
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">3D AOI Optical Yield</span>
                      <span className="text-emerald-400 font-bold">{qaData.optical_aoi?.optical_yield_percentage}%</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Probe Test Time</span>
                      <span className="text-cyan-300 font-bold">{qaData.flying_probe_ict?.estimated_flying_probe_time_sec} s</span>
                    </div>
                  </div>

                  {/* EMC Pre-Compliance Spectrum */}
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                    <span className="text-[11px] font-mono text-slate-400 block">
                      EMC Radiation Spectrum vs FCC Part 15 / CISPR 32 Class B:
                    </span>
                    <div className="space-y-1 text-xs font-mono">
                      {qaData.emc_precompliance?.harmonics_spectrum?.slice(0, 3).map((h: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-slate-300">
                          <span>{h.harmonic_order} ({h.freq_mhz} MHz):</span>
                          <span className={h.status === 'COMPLIANT_PASS' ? 'text-emerald-400' : 'text-red-400'}>
                            {h.radiated_field_dbuv_m} dBuV/m (Limit: {h.fcc_limit_dbuv_m})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* PILLAR 4: FIRMWARE, ROOT OF TRUST & HARDWARE SECURITY           */}
        {/* ============================================================== */}
        {activeTab === 'firmware' && (
          <div className="space-y-5">
            {/* Control Bar */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Base Memory Address</label>
                  <input
                    type="text"
                    value={baseAddress}
                    onChange={(e) => setBaseAddress(e.target.value)}
                    className="w-32 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {firmwareData && (
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">PUF Entropy Fingerprint</span>
                    <span className="text-xs font-mono font-bold text-pink-400 block">
                      256-Bit Silicon PUF (NIST P-256)
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pink-950/80 border border-pink-700 text-pink-300">
                    RoT Provisioned
                  </span>
                </div>
              )}
            </div>

            {firmwareData && (
              <div className="space-y-4">
                {/* Hardware Root of Trust Status Banner */}
                <div className="p-4 bg-gradient-to-r from-purple-950/60 to-pink-950/60 border border-pink-900/40 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Shield className="w-6 h-6 text-pink-400" />
                    <div>
                      <span className="text-xs font-mono text-slate-300 block">
                        Hardware Root of Trust: <span className="text-white font-bold">{firmwareData.security?.hardware_root_of_trust}</span>
                      </span>
                      <span className="text-[10px] font-mono text-pink-300/80">
                        PUF Entropy: {firmwareData.security?.puf_entropy_bits} bits | Cloning Risk: {firmwareData.security?.puf_cloning_probability}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => copyToClipboard(firmwareData.security?.ecc_device_identity?.public_key_pem, 'puf_key')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-pink-900/40 hover:bg-pink-900/80 border border-pink-700/60 text-pink-200 text-xs font-mono cursor-pointer transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedCode === 'puf_key' ? 'Copied Public Key!' : 'Copy Device Public Key'}</span>
                  </button>
                </div>

                {/* Firmware Code Viewers with Sub-tabs & Monaco Editor */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-2 gap-2">
                    <div className="flex space-x-1">
                      <button
                        onClick={() => setActiveFwTab('c_hal')}
                        className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer ${
                          activeFwTab === 'c_hal' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Bare-Metal C HAL (.c/.h)
                      </button>
                      <button
                        onClick={() => setActiveFwTab('rust_pac')}
                        className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer ${
                          activeFwTab === 'rust_pac' ? 'bg-orange-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Embedded Rust PAC (no_std)
                      </button>
                      <button
                        onClick={() => setActiveFwTab('rtos')}
                        className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer ${
                          activeFwTab === 'rtos' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        FreeRTOS Priority Task
                      </button>
                      <button
                        onClick={() => setActiveFwTab('security')}
                        className={`px-3 py-1 text-xs font-mono rounded transition cursor-pointer ${
                          activeFwTab === 'security' ? 'bg-pink-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        RoT Manifest (.json)
                      </button>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      {/* Validate Button */}
                      <button
                        onClick={handleValidateFirmware}
                        disabled={isFwValidating || !fwCode}
                        className="flex items-center space-x-1 text-xs font-mono text-cyan-300 hover:text-white px-2.5 py-1 rounded bg-cyan-950/60 border border-cyan-800/80 hover:bg-cyan-900/80 cursor-pointer transition disabled:opacity-50"
                        title="Validate code syntax"
                      >
                        {isFwValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                        <span>{isFwValidating ? 'Validating...' : 'Validate'}</span>
                      </button>

                      {/* Save to Project Workspace */}
                      <button
                        onClick={handleSaveFirmwareToProject}
                        disabled={isFwSaving || !fwCode}
                        className={`flex items-center space-x-1 text-xs font-mono px-2.5 py-1 rounded border cursor-pointer transition disabled:opacity-50 ${
                          isFwDirty
                            ? 'bg-amber-600/30 text-amber-300 border-amber-500/80 hover:bg-amber-600/50'
                            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                        title="Save current file into project workspace"
                      >
                        {isFwSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        <span>{isFwSaving ? 'Saving...' : isFwDirty ? 'Save to Workspace *' : 'Save to Workspace'}</span>
                      </button>

                      {/* Open in Code Editor */}
                      <button
                        onClick={handleOpenFwInEditor}
                        className="flex items-center space-x-1 text-xs font-mono text-purple-300 hover:text-white px-2.5 py-1 rounded bg-purple-950/60 border border-purple-800/80 hover:bg-purple-900/80 cursor-pointer transition"
                        title="Open in Code Studio IDE"
                      >
                        <FileCode className="w-3 h-3" />
                        <span>Open in Editor</span>
                      </button>

                      {/* Copy */}
                      <button
                        onClick={() => copyToClipboard(fwCode, 'fw_code')}
                        className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer transition"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedCode === 'fw_code' ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Save Notice */}
                  {fwSaveNotice && (
                    <div className="px-4 py-1.5 bg-emerald-950/80 border-b border-emerald-800 text-[11px] font-mono text-emerald-300 flex items-center space-x-1.5">
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>{fwSaveNotice}</span>
                    </div>
                  )}

                  {/* Validation Diagnostics */}
                  {fwValidationResult && (
                    <div
                      className={`px-4 py-1.5 border-b text-[11px] font-mono flex items-center justify-between ${
                        fwValidationResult.success
                          ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-300'
                          : 'bg-rose-950/70 border-rose-800/80 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {fwValidationResult.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                        <span>
                          [{fwValidationResult.language?.toUpperCase()}] {fwValidationResult.message}
                          {fwValidationResult.error_count > 0 && ` (${fwValidationResult.error_count} error(s))`}
                        </span>
                      </div>
                      <button
                        onClick={() => setFwValidationResult(null)}
                        className="text-slate-400 hover:text-white text-xs ml-2 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Monaco Editor Container */}
                  <div className="min-h-[380px] h-[380px] bg-slate-950 overflow-hidden">
                    <Editor
                      height="100%"
                      language={getFwLanguage(activeFwTab)}
                      value={fwCode}
                      theme="vs-dark"
                      onChange={(val) => {
                        setFwCode(val || '');
                        setIsFwDirty(true);
                      }}
                      options={{
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        automaticLayout: true,
                        lineNumbers: 'on',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* PILLAR 5: SUPPLY CHAIN & GLOBAL BOM LIFECYCLE                  */}
        {/* ============================================================== */}
        {activeTab === 'supply_chain' && (
          <div className="space-y-5">
            {/* Control Bar */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Target Production Volume</label>
                  <select
                    value={targetVolume}
                    onChange={(e) => setTargetVolume(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                  >
                    <option value={1}>Prototype (1 Unit)</option>
                    <option value={100}>Pilot Run (100 Units)</option>
                    <option value={1000}>Production (1,000 Units)</option>
                    <option value={10000}>Mass Production (10,000 Units)</option>
                  </select>
                </div>
              </div>

              {supplyChainData && (
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Estimated Unit BOM Cost</span>
                    <span className="text-xl font-black text-cyan-400 font-mono">
                      ${supplyChainData.estimated_unit_bom_cost_usd} USD
                    </span>
                  </div>
                  <div className="text-right border-l border-slate-800 pl-4">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Total Production Cost</span>
                    <span className="text-xl font-black text-white font-mono">
                      ${supplyChainData.total_production_run_cost_usd?.toLocaleString()} USD
                    </span>
                  </div>
                </div>
              )}
            </div>

            {substitutionNotice && (
              <div className="p-3 bg-emerald-950/70 border border-emerald-700 rounded-lg text-xs font-mono text-emerald-300 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{substitutionNotice}</span>
              </div>
            )}

            {supplyChainData && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-3 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
                  <span className="font-semibold text-xs text-white">
                    Live Distributor Inventory & Obsolescence Audit ({supplyChainData.bom_items?.length} Line Items)
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Lead Time: {supplyChainData.critical_path_lead_time_weeks} Weeks Critical Path
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">MPN / Manufacturer</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Qty</th>
                        <th className="p-2.5">Unit Price</th>
                        <th className="p-2.5">Ext Price</th>
                        <th className="p-2.5">Distributor Stock</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {supplyChainData.bom_items?.map((item: any, idx: number) => {
                        const isShortage = item.stock_status === 'SHORTAGE_RISK';
                        const isNrnd = item.lifecycle_status === 'NRND' || item.lifecycle_status === 'EOL';
                        return (
                          <tr key={idx} className="hover:bg-slate-800/40 transition">
                            <td className="p-2.5">
                              <span className="font-bold text-white block">{item.mpn}</span>
                              <span className="text-[10px] text-slate-400">{item.manufacturer}</span>
                            </td>
                            <td className="p-2.5 text-slate-300">{item.category}</td>
                            <td className="p-2.5 text-slate-300">{item.total_quantity_required}</td>
                            <td className="p-2.5 text-cyan-300 font-bold">${item.unit_price_usd}</td>
                            <td className="p-2.5 text-white font-bold">${item.extended_price_usd?.toLocaleString()}</td>
                            <td className="p-2.5">
                              <div className="text-[10px] text-slate-300">
                                <div>DigiKey: {item.digikey_stock?.toLocaleString()}</div>
                                <div>Mouser: {item.mouser_stock?.toLocaleString()}</div>
                                <div>Arrow: {item.arrow_stock?.toLocaleString()}</div>
                              </div>
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isNrnd
                                    ? 'bg-red-950 text-red-300 border border-red-800'
                                    : isShortage
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                }`}
                              >
                                {item.lifecycle_status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              {item.pin_compatible_alternatives?.length > 0 && (
                                <button
                                  onClick={() => handleSubstituteComponent(item.mpn, item.pin_compatible_alternatives[0])}
                                  className="px-2 py-1 bg-indigo-900/60 hover:bg-indigo-800 border border-indigo-700 rounded text-[10px] text-indigo-200 transition cursor-pointer"
                                  title={`Substitute with ${item.pin_compatible_alternatives[0]}`}
                                >
                                  Swap Drop-In
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
