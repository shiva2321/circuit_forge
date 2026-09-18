import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
  Cpu,
  Terminal,
  Code,
  Layers,
  Activity,
  FolderTree,
  Copy,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Zap,
  Radio,
  Sliders,
  ExternalLink,
  ChevronRight,
  Shield,
  FileCode,
  Package,
  Save,
  CheckCheck,
  AlertTriangle,
  Loader2,
  Check,
} from 'lucide-react';
import {
  getPlatformsCatalog,
  generatePlatformCode,
  scaffoldPlatformProject,
  writeProjectFile,
  validateCode,
} from '../services/api';
import { getMonacoLanguage } from './CodeEditor';

export interface EmbeddedPlatformsDeckProps {
  onSelectProject?: (projectId: string) => void;
  onOpenFileInEditor?: (projectId: string, filePath: string) => void;
}

export const EmbeddedPlatformsDeck: React.FC<EmbeddedPlatformsDeckProps> = ({
  onSelectProject,
  onOpenFileInEditor,
}) => {
  const [catalog, setCatalog] = useState<any>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>(() => {
    return localStorage.getItem('circuitforge_embedded_platform') || 'esp32_s3';
  });
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    return localStorage.getItem('circuitforge_embedded_lang') || 'c_cpp';
  });

  useEffect(() => {
    localStorage.setItem('circuitforge_embedded_platform', selectedPlatformId);
  }, [selectedPlatformId]);

  useEffect(() => {
    localStorage.setItem('circuitforge_embedded_lang', selectedLanguage);
  }, [selectedLanguage]);

  const [projectName, setProjectName] = useState<string>('iot_sensor_gateway');
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [lastScaffoldedId, setLastScaffoldedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [scaffolding, setScaffolding] = useState<boolean>(false);
  const [scaffoldResult, setScaffoldResult] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [pinoutFilter, setPinoutFilter] = useState<string>('ALL');

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const data = await getPlatformsCatalog();
      setCatalog(data);
    } catch (e) {
      console.error('Failed to load platforms catalog', e);
    }
  };

  useEffect(() => {
    handleGenerate();
  }, [selectedPlatformId, selectedLanguage]);

  const handleGenerate = async () => {
    setLoading(true);
    setScaffoldResult(null);
    try {
      const res = await generatePlatformCode({
        platform_id: selectedPlatformId,
        target_language: selectedLanguage,
        project_name: projectName,
      });
      setGeneratedData(res);
      // Pick first source file
      const firstSrc = Object.keys(res.source_files || {})[0] || Object.keys(res.manifest_files || {})[0] || '';
      setSelectedFile(firstSrc);
    } catch (e) {
      console.error('Failed to generate platform firmware', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!generatedData || !selectedFile) return;
    const content =
      generatedData.source_files?.[selectedFile] ||
      generatedData.manifest_files?.[selectedFile] ||
      '';
    setFileContent(content);
    setIsDirty(false);
    setValidationResult(null);
  }, [selectedFile, generatedData]);

  const handleScaffold = async () => {
    setScaffolding(true);
    try {
      const res = await scaffoldPlatformProject({
        platform_id: selectedPlatformId,
        target_language: selectedLanguage,
        project_name: projectName,
        description: `Generated ${selectedPlatformId} project in ${selectedLanguage.toUpperCase()}`,
      });
      if (res && res.id) {
        setLastScaffoldedId(res.id);
        setScaffoldResult(`Scaffolded project '${res.id}' with ${res.file_count} files into workspace!`);
        if (onSelectProject) {
          onSelectProject(res.id);
        }
      }
    } catch (e) {
      console.error('Failed to scaffold project', e);
    } finally {
      setScaffolding(false);
    }
  };

  const handleSaveFileToWorkspace = async () => {
    const targetProj = lastScaffoldedId || projectName;
    setIsSaving(true);
    try {
      await writeProjectFile(targetProj, selectedFile, fileContent);
      setIsDirty(false);
      setSaveNotice(`Saved ${selectedFile} to ${targetProj}`);
      setTimeout(() => setSaveNotice(null), 2500);
    } catch (e) {
      console.error('Failed to save file to project', e);
      setSaveNotice(`Save failed`);
      setTimeout(() => setSaveNotice(null), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateCode = async () => {
    setIsValidating(true);
    try {
      const res = await validateCode({
        code: fileContent,
        language: getMonacoLanguage(selectedFile),
        file_path: selectedFile,
      });
      setValidationResult(res);
    } catch (e) {
      console.error('Validation error', e);
    } finally {
      setIsValidating(false);
    }
  };

  const handleOpenInIDE = () => {
    const targetProj = lastScaffoldedId || projectName;
    if (onOpenFileInEditor) {
      onOpenFileInEditor(targetProj, selectedFile);
    } else if (onSelectProject) {
      onSelectProject(targetProj);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentPlatform = catalog?.platforms?.find((p: any) => p.id === selectedPlatformId);

  // Filter pinouts
  const pinouts = (generatedData?.pinout_definition || currentPlatform?.pinout_definition || []).filter((p: any) => {
    if (pinoutFilter === 'ALL') return true;
    const funcs = (p.functions || []).join(' ').toUpperCase();
    const alt = (p.alt || '').toUpperCase();
    return funcs.includes(pinoutFilter) || alt.includes(pinoutFilter);
  });

  const allFiles: { name: string; isManifest: boolean }[] = [];
  if (generatedData?.source_files) {
    Object.keys(generatedData.source_files).forEach((f) => allFiles.push({ name: f, isManifest: false }));
  }
  if (generatedData?.manifest_files) {
    Object.keys(generatedData.manifest_files).forEach((f) => allFiles.push({ name: f, isManifest: true }));
  }

  const currentCode =
    generatedData?.source_files?.[selectedFile] ||
    generatedData?.manifest_files?.[selectedFile] ||
    '';

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Banner Bar */}
      <div className="h-14 border-b border-slate-800/80 bg-slate-900/60 px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-md shadow-teal-500/20">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm tracking-wide text-white">
                Multi-Platform Hardware & Microprocessor Studio
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-teal-950/60 border border-teal-800/60 text-teal-300 font-semibold">
                ESP32 • Raspberry Pi • ARM • RISC-V • Verilog
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleScaffold}
            disabled={scaffolding}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 cursor-pointer transition disabled:opacity-50"
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>{scaffolding ? 'Scaffolding...' : 'Scaffold Project into Workspace'}</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Platform Selection Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { id: 'esp32_s3', name: 'ESP32-S3', desc: 'Xtensa Dual-Core 240MHz', icon: Radio, color: 'text-amber-400', border: 'border-amber-500/50' },
            { id: 'esp32_c6_riscv', name: 'ESP32-C6', desc: 'RISC-V Wi-Fi 6 / Zigbee', icon: Zap, color: 'text-cyan-400', border: 'border-cyan-500/50' },
            { id: 'raspberry_pi_pico', name: 'RP2040 Pico', desc: 'Dual Cortex-M0+ & PIO', icon: Cpu, color: 'text-rose-400', border: 'border-rose-500/50' },
            { id: 'raspberry_pi_5_sbc', name: 'Raspberry Pi 5', desc: 'Quad Cortex-A76 Linux', icon: Terminal, color: 'text-red-400', border: 'border-red-500/50' },
            { id: 'stm32_arm_cortex', name: 'STM32H7 ARM', desc: 'Cortex-M7 480MHz Industrial', icon: Activity, color: 'text-blue-400', border: 'border-blue-500/50' },
            { id: 'verilog_systemverilog', name: 'Verilog / SV', desc: 'FPGA Synthesizable RTL', icon: Layers, color: 'text-purple-400', border: 'border-purple-500/50' },
          ].map((p) => {
            const Icon = p.icon;
            const isSelected = selectedPlatformId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlatformId(p.id)}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? `bg-slate-900 ${p.border} shadow-lg shadow-purple-900/10`
                    : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${p.color}`} />
                  {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                </div>
                <div>
                  <div className="font-bold text-xs text-white">{p.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{p.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Architecture & Language Control Panel */}
        {currentPlatform && (
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase font-mono text-slate-400 block">Target Architecture</span>
                <span className="text-sm font-bold text-white">{currentPlatform.architecture}</span>
                <span className="text-xs text-slate-400 ml-2 font-mono">({currentPlatform.soc})</span>
              </div>

              {/* Language Switcher */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-slate-400">Language:</span>
                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-1 space-x-1">
                  {currentPlatform.supported_languages?.map((lang: string) => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLanguage(lang)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer ${
                        selectedLanguage === lang
                          ? 'bg-purple-600 text-white font-bold shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {lang === 'c_cpp'
                        ? 'C / C++'
                        : lang === 'rust'
                        ? 'Embedded Rust'
                        : lang === 'micropython'
                        ? 'MicroPython'
                        : lang === 'linux_python'
                        ? 'Linux Python'
                        : 'Verilog RTL'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Name Input */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-slate-400">Project:</span>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono w-44"
                />
              </div>
            </div>

            {/* Hardware Capability Tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400">Peripherals:</span>
              {currentPlatform.peripherals?.map((per: string, i: number) => (
                <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                  {per}
                </span>
              ))}
              {currentPlatform.wireless && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300">
                  {currentPlatform.wireless}
                </span>
              )}
            </div>
          </div>
        )}

        {scaffoldResult && (
          <div className="p-3 bg-emerald-950/70 border border-emerald-700 rounded-lg text-xs font-mono text-emerald-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{scaffoldResult}</span>
            </div>
            {lastScaffoldedId && (
              <button
                onClick={handleOpenInIDE}
                className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-sans font-medium transition cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Open in Code Studio IDE</span>
              </button>
            )}
          </div>
        )}

        {/* Dual-Pane View: Hardware Pinout (Left) + Code & Manifest Viewer (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[480px]">
          {/* Left Column: Interactive Pinout & Multiplexing Map (5 Cols) */}
          <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-teal-400" />
                <span className="font-semibold text-xs text-white">
                  Hardware Pinout & Function Multiplexer ({pinouts.length})
                </span>
              </div>

              {/* Pinout filter */}
              <div className="flex space-x-1 text-[10px] font-mono">
                {['ALL', 'I2C', 'SPI', 'UART', 'PWM', 'ADC'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setPinoutFilter(f)}
                    className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                      pinoutFilter === f ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs font-mono">
              {pinouts.map((pin: any, idx: number) => {
                const funcs = pin.functions || (pin.alt ? [pin.alt] : []);
                const isPower = pin.type === 'POWER' || (pin.gpio && pin.gpio.includes('3V3')) || (pin.gpio && pin.gpio.includes('VBUS'));
                const isGnd = pin.type === 'GND' || (pin.gpio && pin.gpio.includes('GND'));
                return (
                  <div
                    key={idx}
                    className="p-2 bg-slate-950 rounded border border-slate-800/80 flex items-center justify-between hover:bg-slate-900/60 transition"
                  >
                    <div className="flex items-center space-x-2">
                      <span
                        className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] ${
                          isPower
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : isGnd
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-teal-950 text-teal-300 border border-teal-800'
                        }`}
                      >
                        {pin.pin}
                      </span>
                      <div>
                        <span className="font-bold text-white block">{pin.gpio || pin.name}</span>
                        {pin.alt && <span className="text-[10px] text-teal-400">{pin.alt}</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 max-w-[200px] justify-end">
                      {funcs.map((fn: string, fIdx: number) => (
                        <span
                          key={fIdx}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/60 text-slate-300"
                        >
                          {fn}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Code & Build Manifests Viewer (7 Cols) */}
          <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2 flex items-center justify-between">
              {/* File Tabs */}
              <div className="flex items-center space-x-1 overflow-x-auto">
                {allFiles.map((file) => {
                  const isSelected = selectedFile === file.name;
                  return (
                    <button
                      key={file.name}
                      onClick={() => setSelectedFile(file.name)}
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600 text-white font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {file.isManifest ? (
                        <Package className="w-3 h-3 text-amber-400" />
                      ) : (
                        <FileCode className="w-3 h-3 text-cyan-400" />
                      )}
                      <span>{file.name}</span>
                      {isSelected && isDirty && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-1" title="Unsaved changes" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                {/* Validate button */}
                <button
                  onClick={handleValidateCode}
                  disabled={isValidating || !fileContent}
                  className="flex items-center space-x-1 text-xs font-mono text-cyan-300 hover:text-white px-2 py-1 rounded bg-cyan-950/60 border border-cyan-800/80 hover:bg-cyan-900/80 cursor-pointer transition disabled:opacity-50"
                  title="Validate code syntax"
                >
                  {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                  <span>{isValidating ? 'Validating...' : 'Validate'}</span>
                </button>

                {/* Save to Project */}
                <button
                  onClick={handleSaveFileToWorkspace}
                  disabled={isSaving || !fileContent}
                  className={`flex items-center space-x-1 text-xs font-mono px-2 py-1 rounded border cursor-pointer transition disabled:opacity-50 ${
                    isDirty
                      ? 'bg-amber-600/30 text-amber-300 border-amber-500/80 hover:bg-amber-600/50'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                  title="Save current file to project workspace"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  <span>{isSaving ? 'Saving...' : isDirty ? 'Save *' : 'Save'}</span>
                </button>

                {/* Open in Code Studio IDE */}
                <button
                  onClick={handleOpenInIDE}
                  className="flex items-center space-x-1 text-xs font-mono text-purple-300 hover:text-white px-2 py-1 rounded bg-purple-950/60 border border-purple-800/80 hover:bg-purple-900/80 cursor-pointer transition"
                  title="Open this file in the full Code Studio IDE"
                >
                  <Code className="w-3 h-3" />
                  <span>Open in IDE</span>
                </button>

                {/* Copy Code */}
                <button
                  onClick={handleCopyCode}
                  className="flex items-center space-x-1 text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 cursor-pointer transition"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Save Notice */}
            {saveNotice && (
              <div className="px-3 py-1 bg-emerald-950/80 border-b border-emerald-800/80 text-[11px] font-mono text-emerald-300 flex items-center space-x-1.5">
                <Check className="w-3 h-3 text-emerald-400" />
                <span>{saveNotice}</span>
              </div>
            )}

            {/* Validation Banner */}
            {validationResult && (
              <div
                className={`px-3 py-1.5 border-b text-[11px] font-mono flex items-center justify-between ${
                  validationResult.success
                    ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-300'
                    : 'bg-rose-950/70 border-rose-800/80 text-rose-300'
                }`}
              >
                <div className="flex items-center space-x-2 overflow-hidden text-ellipsis whitespace-nowrap">
                  {validationResult.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span>
                    [{validationResult.language?.toUpperCase()}] {validationResult.message}
                    {validationResult.error_count > 0 && ` (${validationResult.error_count} error(s))`}
                  </span>
                </div>
                <button
                  onClick={() => setValidationResult(null)}
                  className="text-slate-400 hover:text-white text-xs ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Code Content in Monaco Editor */}
            <div className="flex-1 bg-slate-950 overflow-hidden min-h-[420px]">
              <Editor
                height="100%"
                language={getMonacoLanguage(selectedFile)}
                value={fileContent}
                theme="vs-dark"
                onChange={(val) => {
                  setFileContent(val || '');
                  setIsDirty(true);
                }}
                options={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  lineNumbers: 'on',
                  renderWhitespace: 'selection',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
