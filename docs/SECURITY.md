# 🛡️ CircuitForge EDA Studio — Security & Hardware Safety Specification

This document outlines the security architecture, credential hygiene standards, filesystem sandboxing policies, and physical hardware safety guardrails enforced across the **CircuitForge EDA Studio**.

---

## 1. Security Principles

CircuitForge operates on four core defense-in-depth principles:
1. **Zero-Leak Credential Hygiene**: Sensitive keys, API tokens, and credentials must never leak into client logs, agent thinking streams, or WebSocket broadcasts.
2. **Strict Filesystem Sandboxing**: All file read/write operations must be confined to the active project workspace jail.
3. **Physical Hardware Safety Guardrails**: Circuit simulations and netlist generators must actively detect and prevent physically destructive conditions (e.g. power rail short circuits, driver contention).
4. **Deterministic & Safe Parsing**: VHDL compilation and AST evaluation must execute safely without spawning arbitrary shell sub-processes or unsafe Python evaluations (`eval()` / `exec()`).

---

## 2. Zero-Leak Credential Hygiene

### 2.1 Sensitive Token Masking
When integrating with cloud LLM providers (Google Gemini, Anthropic Claude, OpenAI, or Hugging Face Hub):
- API keys are injected exclusively via environment variables (`GEMINI_API_KEY`, `HUGGINGFACE_TOKEN`).
- Keys are never serialized into `project_manifest.json`, database records, or client-side application bundles.
- All backend logging filters automatically redact any string matching common API token entropy signatures or regex patterns:
  ```python
  # Sanitization pattern example
  REDACTION_PATTERNS = [
      (r'(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*["']?([^"'\s]+)["']?', r': [REDACTED]')
  ]
  ```

### 2.2 WebSocket Broadcast Sanitization
The WebSocket event bus at `/ws/events` streams agent reasoning tokens and simulation events. All outbound payloads are routed through a sanitization middleware that strips stack traces containing system paths, user names, or environment variable dumps.

---

## 3. Filesystem Sandboxing & Path Traversal Mitigations

CircuitForge creates and manages hardware projects on disk. To prevent path traversal attacks (e.g. `../../Windows/System32` or `../../.ssh/id_rsa`):

### 3.1 Path Normalization & Jail Enforcement
All project file endpoints in `backend/app/main.py` enforce canonical path validation:
```python
def secure_resolve_path(project_root: str, relative_path: str) -> str:
    # Resolve absolute canonical paths
    canonical_root = os.path.abspath(project_root)
    target_path = os.path.abspath(os.path.join(canonical_root, relative_path))
    
    # Verify the target path resides strictly within the project root
    if not target_path.startswith(canonical_root + os.sep) and target_path != canonical_root:
        raise HTTPException(
            status_code=403, 
            detail="Access denied: Path traversal outside project workspace boundary is strictly prohibited."
        )
    return target_path
```

### 3.2 Blocked Extensions & System Files
The file manager rejects read/write requests targeting:
- Executable binaries (`.exe`, `.dll`, `.so`, `.sh`, `.bat`, `.cmd`)
- Hidden system directories (`.git`, `.ssh`, `.env`)
- System configuration files (`settings.json`, `credentials.db`)

Only recognized hardware design extensions are permitted for modification (`.vhd`, `.vhdl`, `.v`, `.json`, `.csv`, `.vcd`, `.md`).

---

## 4. Physical Hardware Safety Guardrails

In physical electronic systems, logical errors can produce physical damage (thermal runaway, burnt bonding wires, blown silicon gates). CircuitForge simulates and audits these hazards before fabrication:

### 4.1 Bus Contention & Short-Circuit Prevention
- **Contention Detection**: If two active outputs drive a shared net with opposing logic levels (e.g. Output A drives `'1'` (VDD) and Output B drives `'0'` (GND)), the simulation engine flags a critical `DRC_CONTENTION` fault and sets the net to state `'X'`.
- **VDD-to-GND Short Circuit Check**: Netlists with zero-ohm paths between power and ground rails trigger an immediate simulation abort to prevent infinite current loops.

### 4.2 High Fanout Degradation
- Driving too many gate inputs from a single CMOS output degrades rise/fall edge slew rates ($t_r, t_f$) and can induce clock skew or signal reflections.
- The DRC engine flags any net exceeding $N_{fanout} > 8$ with a `DRC_FANOUT` advisory, recommending the insertion of intermediate non-inverting driver buffers.

### 4.3 Thermal & Power Budget Auditing
The Hardware Lifecycle deck calculates dynamic power dissipation using:
$$P_{dynamic} = lpha \cdot C_L \cdot V_{DD}^2 \cdot f$$
Where:
- $lpha$: Net switching activity factor.
- $C_L$: Sum of load capacitances on the net.
- $V_{DD}$: Supply voltage.
- $f$: Operating clock frequency.

Any component exceeding 85% of its rated thermal dissipation capacity triggers a high-severity warning in the DFM report.

---

## 5. Safe AST Evaluation & Database Parameterization

### 5.1 No Dynamic Execution (`eval`/`exec`)
CircuitForge's VHDL parser and simulation engine are written in pure, type-safe Python. No user-supplied VHDL code or schematic JSON is passed to Python's `eval()` or `exec()` functions.

### 5.2 SQL Parameterization in CKG
All queries to the Circuit Knowledge Graph (`data/circuit_knowledge_graph.db`) utilize parameterized SQL queries (`?` parameter placeholders), preventing SQL injection vulnerabilities:
```python
cursor.execute(
    "SELECT node_id, scale, metadata FROM nodes WHERE entity_type = ? AND verified = ?",
    (entity_type, 1)
)
```

---

## 6. Network & Transport Security

- **Localhost Binding**: By default, the unified server binds to `127.0.0.1`, preventing inadvertent exposure to local area networks (LAN) or public interfaces.
- **CORS Allowlist**: Cross-Origin Resource Sharing is strictly constrained to authorized local ports (`http://localhost:5173`, `http://127.0.0.1:8000`).
- **Input Validation**: All REST payloads are validated using Pydantic v2 schemas. Malformed payloads or oversized payloads (>10 MB) are rejected with `422 Unprocessable Entity` or `413 Payload Too Large`.

---

## 7. Security Incident Reporting

If you identify a potential security issue, memory leak, or sandbox bypass in CircuitForge, please report it privately to:
- **Security Contact**: `security@circuitforge.dev`
- **GPG Key Fingerprint**: `4A8F 90B2 1E53 C67D 89A2  E01F 3C4B 7291 A0B4 5E6F`

Please do not disclose security issues publicly until a patch has been verified and released.\n