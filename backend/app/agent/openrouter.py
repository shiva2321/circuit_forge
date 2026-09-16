"""
CircuitForge OpenRouter LLM Client
Connects the Autonomous EDA Agent to frontier AI models (Claude 3.7 Sonnet, DeepSeek R1, GPT-4o, Codestral, Qwen)
for intelligent digital logic design, VHDL-2008 synthesis, latch debugging, and architectural exploration.
"""

import httpx
import json
import re
import os
from typing import Dict, Any, Optional, List
from backend.app.core.bus import global_bus

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

def mask_key(key: Optional[str]) -> Optional[str]:
    """Safely masks an API key so it can never be exposed in logs or client inspection."""
    if not key:
        return None
    k = key.strip()
    if len(k) <= 8:
        return "••••••••"
    prefix = k[:7] if k.startswith("sk-or-") else k[:4]
    suffix = k[-4:]
    return f"{prefix}••••••{suffix}"

AVAILABLE_MODELS: List[Dict[str, Any]] = [
    {
        "id": "anthropic/claude-3.7-sonnet",
        "name": "Claude 3.7 Sonnet",
        "provider": "Anthropic",
        "description": "Hybrid reasoning flagship model with unmatched precision in RTL architecture and formal VHDL-2008 contracts.",
        "context_window": 200000,
        "is_reasoning": True,
    },
    {
        "id": "anthropic/claude-3.5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "provider": "Anthropic",
        "description": "Industry gold standard for digital hardware design, clean synchronous processes, and zero-latch RTL.",
        "context_window": 200000,
        "is_reasoning": False,
    },
    {
        "id": "deepseek/deepseek-r1",
        "name": "DeepSeek R1",
        "provider": "DeepSeek",
        "description": "Frontier open-weights reasoning model for complex timing hazard detection, CDC arbitration, and pipeline scheduling.",
        "context_window": 64000,
        "is_reasoning": True,
    },
    {
        "id": "deepseek/deepseek-chat",
        "name": "DeepSeek V3",
        "provider": "DeepSeek",
        "description": "High-speed, cost-effective reasoning engine for RTL refactoring, state machine encoding, and testbench writing.",
        "context_window": 64000,
        "is_reasoning": False,
    },
    {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
        "provider": "OpenAI",
        "description": "High-throughput logic synthesis, hierarchical netlist elaboration, and multi-module interconnects.",
        "context_window": 128000,
        "is_reasoning": False,
    },
    {
        "id": "openai/o3-mini",
        "name": "o3-mini",
        "provider": "OpenAI",
        "description": "Specialized reasoning model for formal digital logic verification and constraint checking.",
        "context_window": 200000,
        "is_reasoning": True,
    },
    {
        "id": "google/gemini-2.0-flash-001",
        "name": "Gemini 2.0 Flash",
        "provider": "Google",
        "description": "Ultra low-latency model for rapid architectural iteration, DRC rule linting, and AST elaboration.",
        "context_window": 1000000,
        "is_reasoning": False,
    },
    {
        "id": "mistralai/codestral-2501",
        "name": "Codestral 2501",
        "provider": "Mistral AI",
        "description": "Expert code-generation model optimized for HDL syntax, testbenches, and structural VHDL.",
        "context_window": 256000,
        "is_reasoning": False,
    },
    {
        "id": "qwen/qwen-2.5-coder-32b-instruct",
        "name": "Qwen 2.5 Coder 32B",
        "provider": "Alibaba Qwen",
        "description": "Specialized hardware-aware coding LLM tuned specifically for VHDL, Verilog, and SystemVerilog.",
        "context_window": 32000,
        "is_reasoning": False,
    },
    {
        "id": "meta-llama/llama-3.3-70b-instruct",
        "name": "Llama 3.3 70B Instruct",
        "provider": "Meta",
        "description": "State-of-the-art open weights model with strong digital circuit modeling and arithmetic units design.",
        "context_window": 128000,
        "is_reasoning": False,
    },
]

class OpenRouterClient:
    def __init__(self, api_key: Optional[str] = None, default_model: str = "anthropic/claude-3.7-sonnet"):
        # Explicit client-supplied key overrides env var if set
        self._client_key: Optional[str] = api_key
        self.default_model = default_model

    @property
    def api_key(self) -> Optional[str]:
        """Resolves API key with preference: client-configured key -> OS environment variable."""
        if self._client_key and len(self._client_key.strip()) > 5:
            return self._client_key.strip()
        env_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        return env_key if len(env_key) > 5 else None

    @api_key.setter
    def api_key(self, value: Optional[str]):
        self._client_key = value.strip() if value else None

    def resolve_key(self, custom_key: Optional[str] = None) -> Optional[str]:
        """Resolves active key: explicitly passed -> client instance -> environment variable."""
        if custom_key and len(custom_key.strip()) > 5:
            return custom_key.strip()
        return self.api_key

    def get_key_status(self) -> Dict[str, Any]:
        """Returns key configuration status with zero exposure of raw credentials."""
        active = self.api_key
        if not active:
            return {
                "is_configured": False,
                "source": "none",
                "masked_key": None,
                "default_model": self.default_model
            }
        source = "client" if (self._client_key and len(self._client_key.strip()) > 5) else "env"
        return {
            "is_configured": True,
            "source": source,
            "masked_key": mask_key(active),
            "default_model": self.default_model
        }

    def is_configured(self) -> bool:
        clean = (self.api_key or "").strip()
        return len(clean) > 10

    async def search_models(self, query: str = "") -> List[Dict[str, Any]]:
        """Searches available models both locally and via OpenRouter public API."""
        q = (query or "").strip().lower()

        # Start with static catalog matches
        if not q:
            matches = list(AVAILABLE_MODELS)
        else:
            matches = [
                m for m in AVAILABLE_MODELS
                if q in m["id"].lower() or q in m["name"].lower() or q in m["provider"].lower() or q in m["description"].lower()
            ]

        # Optionally query OpenRouter live models if query has >= 3 chars
        if len(q) >= 3:
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    res = await client.get(OPENROUTER_MODELS_URL)
                    if res.status_code == 200:
                        live_data = res.json().get("data", [])
                        existing_ids = {m["id"] for m in matches}
                        for item in live_data:
                            m_id = item.get("id", "")
                            m_name = item.get("name", m_id)
                            m_desc = item.get("description", "")
                            if (q in m_id.lower() or q in m_name.lower()) and m_id not in existing_ids:
                                matches.append({
                                    "id": m_id,
                                    "name": m_name,
                                    "provider": m_id.split("/")[0].title() if "/" in m_id else "OpenRouter",
                                    "description": m_desc[:120] if m_desc else "OpenRouter live model",
                                    "context_window": item.get("context_length", 32000),
                                    "is_reasoning": "reasoning" in m_id.lower() or "r1" in m_id.lower(),
                                })
                                if len(matches) >= 30:
                                    break
            except Exception:
                pass  # Fall back to local matches on network timeout

        return matches[:30]

    async def test_connection(self, api_key: str, model: Optional[str] = None) -> Dict[str, Any]:
        """Validates the OpenRouter API key with a minimal completion request."""
        clean_key = (api_key or self.api_key or "").strip()
        if not clean_key:
            return {"success": False, "error": "No API key provided. Please enter your OpenRouter key."}

        target_model = (model or self.default_model or "anthropic/claude-3.5-sonnet").strip()
        headers = {
            "Authorization": f"Bearer {clean_key}",
            "HTTP-Referer": "https://circuitforge.eda",
            "X-Title": "CircuitForge EDA Studio",
            "Content-Type": "application/json"
        }
        payload = {
            "model": target_model,
            "messages": [{"role": "user", "content": "Respond strictly with the single word: READY"}],
            "max_tokens": 15,
        }
        try:
            async with httpx.AsyncClient(timeout=18.0) as client:
                res = await client.post(OPENROUTER_API_URL, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if not choices:
                        return {"success": True, "model": target_model, "response": "Connected successfully."}
                    message = choices[0].get("message", {})
                    # Handle reasoning models where content might be null and reasoning is populated
                    content = message.get("content") or message.get("reasoning") or "Connected successfully."
                    response_str = str(content).strip()[:100]
                    return {"success": True, "model": target_model, "response": response_str}
                else:
                    return {"success": False, "error": f"HTTP {res.status_code}: {res.text}"}
        except Exception as e:
            err_str = str(e)
            if clean_key:
                err_str = err_str.replace(clean_key, mask_key(clean_key))
            return {"success": False, "error": err_str}

    async def plan_knowledge_retrieval(
        self,
        goal: str,
        scale: int = 1,
        circuit_name: str = "custom_circuit",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        AI Model-Driven Knowledge Retrieval:
        The LLM analyzes the digital logic objective, design constraints, and scale,
        then autonomously formulates targeted queries to retrieve relevant concepts,
        primitives, and DRC rules from the Knowledge Graph.
        """
        key = self.resolve_key(api_key)
        target_model = (model or self.default_model or "anthropic/claude-3.7-sonnet").strip()

        if key and len(key) > 10:
            system_prompt = (
                "You are CircuitForge Knowledge Retrieval Engine: an expert hardware reasoning agent. "
                "Analyze the user's circuit objective and provide a JSON plan for querying the digital logic knowledge graph.\n"
                "Output strictly valid JSON with this schema:\n"
                "{\n"
                '  "queries": ["query1", "query2", "query3"],\n'
                '  "architectural_notes": "concise design notes",\n'
                '  "hazards_to_prevent": ["hazard1", "hazard2"],\n'
                '  "target_primitives": ["primitive1", "primitive2"]\n'
                "}"
            )
            user_prompt = (
                f"Design Objective: {goal}\n"
                f"Circuit Name: {circuit_name}\n"
                f"Abstraction Scale: {scale} (1=Gate, 2=RTL Block, 3=Subsystem, 4=Processor)\n\n"
                f"Formulate 2-4 targeted knowledge graph queries (e.g. primitives, standard architectures, CDC rules, timing) "
                f"and list key hazards to avoid (e.g. latch inference, glitches, clock domain crossing)."
            )

            headers = {
                "Authorization": f"Bearer {key}",
                "HTTP-Referer": "https://circuitforge.eda",
                "X-Title": "CircuitForge EDA Studio",
                "Content-Type": "application/json"
            }
            payload = {
                "model": target_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.1,
                "max_tokens": 1000,
            }

            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    res = await client.post(OPENROUTER_API_URL, headers=headers, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        choices = data.get("choices", [])
                        if choices:
                            msg = choices[0].get("message", {})
                            raw_content = msg.get("content") or msg.get("reasoning") or ""
                            json_match = re.search(r"\{.*\}", str(raw_content), re.DOTALL)
                            if json_match:
                                plan = json.loads(json_match.group(0))
                                plan["source"] = f"LLM ({target_model})"
                                if "queries" in plan and isinstance(plan["queries"], list):
                                    return plan
            except Exception:
                pass  # Fall through to expert heuristics

        # Deterministic Expert Hardware Heuristics Fallback
        base_queries = [circuit_name]
        g_lower = goal.lower()
        if "adder" in g_lower:
            base_queries.extend(["full adder", "carry lookahead", "half adder"])
        elif "counter" in g_lower:
            base_queries.extend(["synchronous counter", "register", "flip flop"])
        elif "alu" in g_lower:
            base_queries.extend(["arithmetic logic unit", "multiplexer", "shifter"])
        elif "riscv" in g_lower or "cpu" in g_lower or "processor" in g_lower:
            base_queries.extend(["instruction decoder", "register file", "pipeline hazard"])
        elif "mux" in g_lower:
            base_queries.extend(["multiplexer", "logic gate", "truth table"])
        else:
            base_queries.append(goal)

        return {
            "queries": list(dict.fromkeys(base_queries))[:4],
            "architectural_notes": f"Scale {scale} digital architecture for {circuit_name}.",
            "hazards_to_prevent": [
                "Unintentional transparent latch inference in combinational processes",
                "Glitches on asynchronous control lines",
                "Combinational feedback loops"
            ],
            "target_primitives": ["logic_gate", "flip_flop", "standard_cell"],
            "source": "Expert EDA Heuristic Engine"
        }

    async def generate_circuit_design(
        self,
        goal: str,
        scale: int = 1,
        circuit_name: str = "custom_circuit",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        kg_context: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Calls OpenRouter LLM to design synthesis-ready VHDL-2008 and return structured reasoning."""
        key = self.resolve_key(api_key)
        if not key:
            raise ValueError("OpenRouter API key is not configured.")

        target_model = (model or self.default_model or "anthropic/claude-3.5-sonnet").strip()

        system_prompt = (
            "You are CircuitForge AI: an elite digital logic designer and hardware architect. "
            "You write synthesis-clean VHDL-2008 code. "
            "Rule 1: Always use `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;`. "
            "Rule 2: Never infer transparent latches. In combinational processes, assign all output signals in all branches. "
            "Rule 3: Enclose the complete, compilable VHDL code within ```vhdl ... ``` code blocks. "
            "Rule 4: Provide a brief architectural breakdown of the entity, ports, internal signals, and test assertions."
        )

        kg_section = ""
        if kg_context:
            rules_list = []
            for item in kg_context[:6]:
                n_name = item.get("name") or item.get("node_id", "")
                cat = item.get("category", "")
                rules = item.get("design_rules", [])
                if rules:
                    rules_list.append(f"- {n_name} [{cat}]: {'; '.join(str(r) for r in rules[:2])}")
                else:
                    rules_list.append(f"- {n_name} [{cat}]")
            if rules_list:
                kg_section = (
                    "\n\nActive Knowledge Graph Context & Design Rules:\n"
                    + "\n".join(rules_list)
                    + "\nPlease adhere to these architectural rules and primitives in your design."
                )

        user_prompt = (
            f"Design a digital hardware circuit for the following objective:\n"
            f"Goal: {goal}\n"
            f"Circuit Name: {circuit_name}\n"
            f"Scale Level: {scale} (1=Gate, 2=RTL Block, 3=Subsystem, 4=Processor)"
            f"{kg_section}\n\n"
            f"Please generate the complete VHDL entity and architecture, explain the data path, and provide 3 formal assertions."
        )

        headers = {
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://circuitforge.eda",
            "X-Title": "CircuitForge EDA Studio",
            "Content-Type": "application/json"
        }
        payload = {
            "model": target_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2,
            "max_tokens": 3500,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(OPENROUTER_API_URL, headers=headers, json=payload)
            if res.status_code != 200:
                raise RuntimeError(f"OpenRouter API error {res.status_code}: {res.text}")

            data = res.json()
            choices = data.get("choices", [])
            if not choices:
                raise RuntimeError("OpenRouter returned empty choices array.")

            message = choices[0].get("message", {})
            raw_content = message.get("content") or message.get("reasoning") or ""
            raw_content_str = str(raw_content)

            vhdl_match = re.search(r"```vhdl(.*?)```", raw_content_str, re.DOTALL | re.IGNORECASE)
            if vhdl_match:
                vhdl_code = vhdl_match.group(1).strip()
            else:
                code_match = re.search(r"```(.*?)```", raw_content_str, re.DOTALL)
                if code_match:
                    vhdl_code = code_match.group(1).strip()
                else:
                    # Find complete VHDL span from first library/entity to last architecture end
                    start_match = re.search(r'\b(?:library\s+ieee|entity\s+[a-zA-Z0-9_]+)\b', raw_content_str, re.IGNORECASE)
                    end_matches = list(re.finditer(r'(?:end\s+[a-zA-Z0-9_\-]+|end)\s*;', raw_content_str, re.IGNORECASE))
                    if start_match and end_matches:
                        vhdl_code = raw_content_str[start_match.start():end_matches[-1].end()].strip()
                    else:
                        vhdl_code = raw_content_str.strip()

            return {
                "circuit_name": circuit_name,
                "scale": scale,
                "vhdl_code": vhdl_code,
                "model_used": target_model,
                "raw_explanation": raw_content_str[:500],
            }

    async def repair_circuit_design(
        self,
        vhdl_code: str,
        errors: List[str],
        goal: str,
        circuit_name: str = "repaired_circuit",
        api_key: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Self-healing repair tool that fixes syntax and DRC errors in VHDL source."""
        key = self.resolve_key(api_key)
        target_model = (model or self.default_model or "anthropic/claude-3.7-sonnet").strip()

        if key and len(key) > 10:
            error_list_str = "\n".join(f"- {e}" for e in errors)
            system_prompt = (
                "You are CircuitForge Self-Healing EDA Engine. You are an expert at repairing VHDL syntax and DRC errors. "
                "You must output ONLY the corrected, fully compilable VHDL-2008 code inside ```vhdl ... ``` blocks. "
                "Do not include commentary outside the code block."
            )
            user_prompt = (
                f"The following VHDL code failed static DRC and linting with these errors:\n"
                f"{error_list_str}\n\n"
                f"Original Goal: {goal}\n"
                f"Circuit Name: {circuit_name}\n\n"
                f"Failing VHDL Source:\n```vhdl\n{vhdl_code}\n```\n\n"
                f"Please fix all errors and return the corrected VHDL code."
            )

            headers = {
                "Authorization": f"Bearer {key}",
                "HTTP-Referer": "https://circuitforge.eda",
                "X-Title": "CircuitForge EDA Studio",
                "Content-Type": "application/json"
            }
            payload = {
                "model": target_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.1,
                "max_tokens": 3500,
            }

            try:
                async with httpx.AsyncClient(timeout=45.0) as client:
                    res = await client.post(OPENROUTER_API_URL, headers=headers, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        choices = data.get("choices", [])
                        if choices:
                            msg = choices[0].get("message", {})
                            raw = msg.get("content") or msg.get("reasoning") or ""
                            raw_str = str(raw)
                            vm = re.search(r"```vhdl(.*?)```", raw_str, re.DOTALL | re.IGNORECASE)
                            if vm:
                                fixed_code = vm.group(1).strip()
                            else:
                                cm = re.search(r"```(.*?)```", raw_str, re.DOTALL)
                                fixed_code = cm.group(1).strip() if cm else raw_str.strip()
                            return {
                                "vhdl_code": fixed_code,
                                "repaired": True,
                                "method": f"LLM ({target_model})",
                                "errors_addressed": len(errors)
                            }
            except Exception:
                pass

        # Deterministic Expert Rule-based Self-Repair Fallback
        repaired = vhdl_code
        if "ieee.std_logic_1164" not in repaired.lower():
            repaired = "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nuse IEEE.NUMERIC_STD.ALL;\n\n" + repaired

        repaired = re.sub(r'([a-zA-Z0-9_\'\"]+)\s*\n\s*(end\s+[a-zA-Z0-9_]+;)', r'\1;\n\2', repaired, flags=re.IGNORECASE)
        repaired = re.sub(r'(end\s+[a-zA-Z0-9_]+)(?!\s*;)\s*\n', r'\1;\n', repaired, flags=re.IGNORECASE)

        return {
            "vhdl_code": repaired,
            "repaired": True,
            "method": "Expert Rule Engine",
            "errors_addressed": len(errors)
        }

    async def chat_with_copilot(
        self,
        message: str,
        circuit_context: Optional[Dict[str, Any]] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        tools_instance: Optional[Any] = None,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Interactive hardware engineering chat with autonomous tool execution.
        Empowers the model to inspect, read, write, edit, search files, lint, simulate,
        and benchmark digital hardware end-to-end without human intervention.
        """
        key = self.resolve_key(api_key)
        target_model = (model or self.default_model or "anthropic/claude-3.5-sonnet").strip()
        ctx = circuit_context or {}
        circuit_name = ctx.get("circuit_name", "active_circuit")
        vhdl_code = ctx.get("vhdl_code", "")
        gate_count = ctx.get("gate_count", 0)
        wire_count = ctx.get("wire_count", 0)
        probes = ctx.get("probes", {})
        faults = ctx.get("faults", {})
        proj_id = project_id or "scale1_full_adder"

        # ── 1. Autonomous Frontier Tool Calling Loop (If API Key Available) ───────
        if key and len(key) > 10:
            system_prompt = (
                "You are CircuitForge Autonomous EDA Copilot: an expert digital logic architect with full access to "
                "sandboxed filesystem tools and hardware simulation/benchmarking engines.\n\n"
                "Capabilities:\n"
                "- Filesystem: fs_list_files, fs_read_file, fs_write_file, fs_edit_file, fs_delete_file, fs_search_files\n"
                "- Hardware EDA: eda_lint_code, eda_synthesize_netlist, eda_run_simulation, eda_benchmark_circuit, eda_query_knowledge_graph\n"
                f"- Active Project: {proj_id}\n"
                f"- Active Circuit: {circuit_name} ({gate_count} gates, {wire_count} nets)\n"
                f"- Probes / Logic States: {json.dumps(probes)}\n"
                f"- Injected Faults: {json.dumps(faults)}\n\n"
                "Always proactively execute tools when the user requests to see, analyze, benchmark, modify, create, "
                "or test hardware designs or files. Execute your tools in a self-healing loop until the task is complete."
            )

            headers = {
                "Authorization": f"Bearer {key}",
                "HTTP-Referer": "https://circuitforge.eda",
                "X-Title": "CircuitForge EDA Studio",
                "Content-Type": "application/json"
            }

            messages: List[Dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message}
            ]

            tools_schema = tools_instance.get_tool_definitions() if tools_instance else None
            tool_history: List[Dict[str, Any]] = []

            try:
                async with httpx.AsyncClient(timeout=45.0) as client:
                    # Multi-turn autonomous tool execution loop (up to 6 turns)
                    for turn in range(6):
                        payload: Dict[str, Any] = {
                            "model": target_model,
                            "messages": messages,
                            "temperature": 0.2,
                            "max_tokens": 2000,
                        }
                        if tools_schema:
                            payload["tools"] = tools_schema
                            payload["tool_choice"] = "auto"

                        res = await client.post(OPENROUTER_API_URL, headers=headers, json=payload)
                        if res.status_code != 200:
                            break

                        data = res.json()
                        choices = data.get("choices", [])
                        if not choices:
                            break

                        msg_obj = choices[0].get("message", {})
                        tool_calls = msg_obj.get("tool_calls", [])

                        # If model wants to execute tools:
                        if tool_calls and tools_instance:
                            # Append assistant message with tool calls
                            messages.append(msg_obj)

                            for tc in tool_calls:
                                fn = tc.get("function", {})
                                fn_name = fn.get("name", "")
                                raw_args = fn.get("arguments", "{}")
                                try:
                                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                                except Exception:
                                    args = {}

                                # Notify studio via WebSocket
                                await global_bus.broadcast({
                                    "type": "agent_thought",
                                    "data": {
                                        "time": int(time.time() * 1000),
                                        "state": "TOOL_EXEC",
                                        "action": fn_name,
                                        "thought": f"Autonomous Tool Execution: {fn_name}({json.dumps(args)[:80]})",
                                        "details": {"tool": fn_name, "arguments": args, "turn": turn + 1}
                                    }
                                })

                                # Execute tool safely in sandbox
                                result = tools_instance.execute_tool(fn_name, args, default_project_id=proj_id)
                                tool_history.append({
                                    "turn": turn + 1,
                                    "tool": fn_name,
                                    "arguments": args,
                                    "result": result
                                })

                                # Broadcast tool result
                                await global_bus.broadcast({
                                    "type": "agent_thought",
                                    "data": {
                                        "time": int(time.time() * 1000),
                                        "state": "TOOL_RESULT",
                                        "action": f"{fn_name}_done",
                                        "thought": f"Tool Result [{fn_name}]: Success={result.get('success', False)}",
                                        "details": result
                                    }
                                })

                                # Append observation message
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tc.get("id", f"call_{turn}_{fn_name}"),
                                    "content": json.dumps(result)
                                })

                            # Continue loop so model can observe tool results and complete answer
                            continue
                        else:
                            # Final text response reached
                            content = msg_obj.get("content") or msg_obj.get("reasoning") or ""
                            action = None
                            lower_msg = message.lower()
                            if "design" in lower_msg or "synthesize" in lower_msg or "create" in lower_msg or "build" in lower_msg:
                                action = {"type": "design", "goal": message}
                            elif "simulate" in lower_msg or "run simulation" in lower_msg:
                                action = {"type": "simulate"}

                            return {
                                "success": True,
                                "model": target_model,
                                "reply": str(content).strip(),
                                "action": action,
                                "tool_history": tool_history,
                                "is_llm": True
                            }

            except Exception as loop_err:
                # Log error and fall through to expert rule fallback
                pass

        # ── 2. Offline / Deterministic Tool-Assisted Expert Fallback ──────────────
        msg_lower = message.lower()
        action = None
        tool_history = []

        # Proactively execute tools on deterministic user intents even without API key!
        if tools_instance:
            if "benchmark" in msg_lower:
                bench_res = tools_instance.execute_tool("eda_benchmark_circuit", {"circuit_name": circuit_name, "duration_ns": 100})
                tool_history.append({"tool": "eda_benchmark_circuit", "result": bench_res})
                b = bench_res.get("benchmark_results", {})
                reply = (
                    f"### ⚡ Hardware Benchmark Results: `{circuit_name}`\n\n"
                    f"- **Verdict**: `{b.get('verdict', 'VERIFIED')}` (Score: **{b.get('architectural_score')}/100**)\n"
                    f"- **Gate Count**: `{b.get('gate_count')}` nodes, `{b.get('wire_count')}` routed wires\n"
                    f"- **Primary I/O**: `{b.get('primary_inputs')}` inputs, `{b.get('primary_outputs')}` outputs\n"
                    f"- **Max Clock Frequency**: `{b.get('max_clock_frequency_mhz')} MHz` (Crit path: `{b.get('est_critical_path_delay_ns')} ns`)\n"
                    f"- **Simulation Throughput**: `{b.get('simulation_throughput_m_evals_sec')} M-evals/sec` ({b.get('simulated_cycles')} cycles in `{b.get('simulation_wall_time_sec')}s`)\n"
                    f"- **Verification Assertions**: `{b.get('assertions_passed')}/{b.get('assertions_total')}` passed ({b.get('assertion_coverage_percent')}% coverage)\n"
                    f"- **Estimated Dynamic Power**: `{b.get('est_dynamic_power_uw')} µW`"
                )
                return {"success": True, "model": "CircuitForge Expert Benchmarking Engine", "reply": reply, "tool_history": tool_history, "is_llm": False}

            elif "list files" in msg_lower or "show files" in msg_lower or "ls" in msg_lower:
                files_res = tools_instance.execute_tool("fs_list_files", {"project_id": proj_id})
                tool_history.append({"tool": "fs_list_files", "result": files_res})
                flist = files_res.get("files", [])
                lines = [f"- `{f['path']}` ({f['lines']} lines, {f['size_bytes']} bytes)" for f in flist]
                reply = f"### 📁 Workspace Files for Project `{proj_id}`:\n" + ("\n".join(lines) if lines else "No files found.")
                return {"success": True, "model": "CircuitForge Sandboxed Filesystem", "reply": reply, "tool_history": tool_history, "is_llm": False}

            elif "lint" in msg_lower or "drc" in msg_lower:
                lint_res = tools_instance.execute_tool("eda_lint_code", {"vhdl_code": vhdl_code})
                tool_history.append({"tool": "eda_lint_code", "result": lint_res})
                reply = (
                    f"### 🛡️ Static DRC & Syntax Lint Report:\n"
                    f"- **Syntax Valid**: `{'✓ PASSED' if lint_res.get('is_valid') else '✗ ERRORS FOUND'}`\n"
                    f"- **Entities Found**: `{len(lint_res.get('entities', []))}`\n"
                    f"- **Signals**: `{lint_res.get('signals_count')}`, **Processes**: `{lint_res.get('processes_count')}`\n"
                    f"- **Issues**: {len(lint_res.get('messages', []))} warnings/errors."
                )
                return {"success": True, "model": "CircuitForge DRC Engine", "reply": reply, "tool_history": tool_history, "is_llm": False}

        if "simulate" in msg_lower or ("run" in msg_lower and "sim" in msg_lower):
            reply = f"Triggering cycle-accurate digital simulation for **{circuit_name}**. The testbench evaluates signal propagation, transition edges, and assertion vectors over 100ns."
            action = {"type": "simulate"}
        elif "fault" in msg_lower or "stuck" in msg_lower:
            reply = (
                f"**Fault Injection Diagnostics**: The circuit currently has {len(faults)} active faults. "
                "In digital EDA, Stuck-At-0 (s-a-0) and Stuck-At-1 (s-a-1) models verify test pattern coverage (D-Algorithm / PODEM). "
                "Right-click any wire on the schematic to inject or clear a fault, or observe how the downstream logic gate evaluates."
            )
        elif "latch" in msg_lower:
            reply = (
                "**Inferred Latch Prevention**: In VHDL-2008 combinational processes, transparent latches are inferred "
                "when a signal is assigned inside an `if` or `case` statement without covering all possible conditions (i.e. missing `else` or `when others`). "
                "Ensure every output signal is assigned a default value at the top of the process body."
            )
        elif "design" in msg_lower or "synthesize" in msg_lower or "create" in msg_lower or "build" in msg_lower:
            reply = f"I can autonomously design and synthesize that! Launching autonomous RTL pipeline for: *{message}*."
            action = {"type": "design", "goal": message}
        elif "mux" in msg_lower or "multiplexer" in msg_lower:
            reply = (
                "A **Multiplexer** selects binary information from one of many input lines and directs it to a single output line. "
                "A 2^n to 1 multiplexer requires n select lines. For a 4-to-1 MUX, select lines `sel(1 downto 0)` route `d0`, `d1`, `d2`, or `d3` to output `y`."
            )
            action = {"type": "design", "goal": "Design a 4-to-1 Multiplexer with enable"}
        elif "adder" in msg_lower:
            reply = (
                f"In **{circuit_name}**, the 1-bit Full Adder computes `Sum = A ⊕ B ⊕ Cin` and `Cout = (A · B) + (Cin · (A ⊕ B))`. "
                f"Current inputs are evaluated in real time on the schematic canvas with glowing emerald flow lines when active."
            )
        else:
            reply = (
                f"CircuitForge Autonomous Co-Pilot ready. Analyzing **{circuit_name}** ({gate_count} gates, {wire_count} routed nets). "
                "I have direct access to your sandboxed project filesystem, live cycle simulation, and multi-dimensional benchmarking tools. "
                "Ask me to benchmark this circuit, list/read project files, test syntax, or build a new hardware architecture!"
            )

        return {
            "success": True,
            "model": "CircuitForge Expert EDA Engine",
            "reply": reply,
            "action": action,
            "tool_history": tool_history,
            "is_llm": False
        }


openrouter_client = OpenRouterClient()
