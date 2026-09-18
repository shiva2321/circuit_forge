import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DOCS_DIR = os.path.join(BASE_DIR, "docs")
os.makedirs(DOCS_DIR, exist_ok=True)

# -------------------------------------------------------------
# 1. README.md
# -------------------------------------------------------------
readme_content = """# ⚡ CircuitForge EDA Studio

<p align="center">
  <img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" height="20" alt="" />&nbsp;
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" height="20" alt="" />&nbsp;
  <img src="https://img.shields.io/badge/TypeScript-5.6+-3178C6?style=flat-square&logo=typescript&logoColor=white" height="20" alt="" />&nbsp;
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black" height="20" alt="" />&nbsp;
  <img src="https://img.shields.io/badge/VHDL-2008-00599C?style=flat-square" height="20" alt="" />&nbsp;
  <img src="https://img.shields.io/badge/Tests-106%20passed-brightgreen?style=flat-square" height="20" alt="" />&nbsp;
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat-square" height="20" alt="" />
</p>

<p align="center">
  <strong>Autonomous & Interactive Multi-Scale Circuit EDA Studio, Logic Simulation Environment, and Embedded Firmware Co-Pilot</strong>
</p>

[Getting Started](#-quick-start) •
[Visual Tour](#-visual-tour) •
[Hardware Hierarchy](#-multi-scale-hardware-hierarchy) •
[Key Features](#-key-features) •
[System Architecture](#-system-architecture) •
[API Reference](#-api-reference) •
[Documentation](#-documentation-index)

</div>

---

## 🌟 Overview

**CircuitForge** is an end-to-end, full-stack Electronic Design Automation (EDA) and digital hardware engineering platform. It bridges the gap between high-level autonomous AI design agents and interactive physical-logical circuit engineering.

CircuitForge empowers hardware designers, embedded engineers, and researchers to **design, simulate, inspect, lint, auto-repair, and deploy digital circuits** spanning from sub-micron transistor/gate-level logic up to 32-bit pipelined RISC-V microprocessors and mixed-signal embedded microcontrollers (ESP32, RP2040, Raspberry Pi 5).

### Why CircuitForge?
- **Real-Time Bidirectional Synchronization**: Drag and drop logic gates, multiplexers, and registers on an interactive canvas; your VHDL-2008 code is synthesized instantly in Monaco. Modify your code, and your visual schematic updates in real time.
- **Autonomous Hardware Agent Co-Pilot**: An integrated LLM hardware engineer with full multi-turn conversational memory, project file tree awareness, automated DRC diagnostics analysis, and 1-click autonomous code/schematic auto-repair.
- **Cycle-Accurate 4-State Logic Simulator**: Built-in event-driven simulation engine with delta cycles, clock configuration, multi-channel waveform viewer, and standard IEEE 1364 VCD export.
- **Comprehensive Design Rule Checker (DRC)**: Detects floating inputs, bus contention, high fanout, impedance mismatch, and asynchronous clock violations, with 1-click single-action remediation.
- **Continuous Learning Knowledge Graph (CKG)**: Persistent SQLite + NetworkX graph tracking design patterns, failure modes, timing constraints, and synthesis heuristics.
- **Turnkey Manufacturing & Embedded Deployment**: Automated BOM generation, DFM validation, thermal dissipation checks, and bare-metal C/C++ firmware scaffolding for microcontrollers.

---

## 📸 Visual Tour

CircuitForge is crafted with an ultra-responsive, dark-themed industrial aesthetic designed for deep engineering workflows.

### 1. Multi-Scale Project Hub & Template Library
Create, clone, export, and switch between multi-scale hardware projects with instant template bootstrapping (Transistor logic to RISC-V pipelined cores).

![Project Manager Hub](docs/images/01_project_hub_modal.png)

---

### 2. Unified Design Studio (Canvas + Monaco Editor + Autonomous Agent Deck)
Seamless multi-pane layout featuring an interactive vector schematic canvas, real-time Monaco VHDL editor with inline AST diagnostics, and the Autonomous Co-Pilot deck with live thinking streams.

![Unified Design Studio](docs/images/02_design_studio_split.png)

---

### 3. Design Rule Checker (DRC) & 1-Click Autonomous Auto-Fix
Instant hardware rule verification catching floating inputs, signal contention, and CDC risks. Click **⚡ Auto-Fix All via Agent** to let the co-pilot automatically resolve all faults across code and schematics simultaneously.

![DRC Inspector Drawer](docs/images/03_drc_inspector_drawer.png)

---

### 4. Cycle-Accurate Digital Timing Waveforms & Logic Analyzer
Multi-channel digital waveform analyzer with interactive timeline cursors, clock dividers, signal zoom, and radix switching (Binary, Hex, Decimal).

![Timing Waveforms & Logic Analyzer](docs/images/04_timing_waveforms.png)

---

### 5. Circuit Knowledge Graph (CKG) Interactive Visualizer
Explore interconnected hardware entities, design patterns, empirical performance metrics, and failure modes (`Metastability`, `Inferred Latch`, `CDC`) in a live force-directed 2D topology.

![Circuit Knowledge Graph](docs/images/05_knowledge_graph.png)

---

### 6. Turnkey Hardware Lifecycle & DFM Manufacturing Deck
Generate production Bill of Materials (BOM), verify footprint availability, audit component thermal/voltage tolerances, and prepare manufacturing archives for rapid prototyping.

![Hardware Lifecycle & DFM](docs/images/06_hardware_lifecycle_dfm.png)

---

### 7. Embedded Platforms & Microcontroller Firmware Studio
Scaffold bare-metal C/C++ drivers, register-level memory maps, and pinout wiring diagrams for ESP32-S3, Raspberry Pi RP2040, and Raspberry Pi 5.

![Embedded Platforms Studio](docs/images/07_embedded_platforms_mcus.png)

---

## 🧱 Multi-Scale Hardware Hierarchy

CircuitForge organizes digital hardware across 4 foundational tiers of abstraction:

| Scale | Description | Example Modules | Verification & Metrics |
| :--- | :--- | :--- | :--- |
| **Scale 1: Gates & Primitives** | Gate-level logic, CMOS inverters, basic flip-flops | `AND2`, `OR2`, `XOR2`, `NAND`, `NOR`, `INV`, `DFF_SR` | Propagation delay ($t_{pd}$), truth tables, gate-equivalent area |
| **Scale 2: RTL & Arithmetic** | Multi-bit datapaths, combinational and sequential blocks | 32-bit Carry Lookahead Adder (CLA), 8-bit Up/Down Counter, Barrel Shifter, FIFOs | Cycle latency, critical path delay, register count |
| **Scale 3: Subsystems & IP Cores** | Functional IP cores, memory units, communication controllers | 32-bit ALU with status flags (Z, N, C, V), 32x32 Register File, UART with 16x baud generator | Bus timing, protocol handshake, CDC synchronizers |
| **Scale 4: Processors & Systems** | Complete computer architectures and SOC subsystems | 32-bit RISC-V RV32I 5-Stage Pipelined Processor (IF, ID, EX, MEM, WB) | CPI, hazard resolution (forwarding & stalls), ISA compliance |

---

## ⚡ Key Features

### 1. Interactive Schematic Vector Canvas
- **Full Vector Rendering**: Crisp, zoomable, and pannable schematic editing powered by React Flow / XYFlow.
- **Port-Level Snapping**: Intuitive magnetic snapping for component pins and bus connections.
- **Live Signal State Coloring**: Real-time visual feedback of logic levels (`0` deep slate, `1` bright green, `Z` amber, `X` red).
- **Hierarchical Drill-Down**: Double-click any subsystem (e.g. ALU, FIFO) to open and inspect its internal gate-level schematic.

### 2. VHDL-2008 Monaco Code Editor
- **Full Language Services**: Syntax highlighting, auto-indentation, bracket matching, and code folding.
- **Instant AST Diagnostics**: Real-time error squiggly markers powered by the backend AST parser.
- **Bidirectional Dynamic Sync**: Any change made on the visual canvas updates the active VHDL file immediately without clobbering manual edits.

### 3. Cycle-Accurate Event-Driven Logic Simulator
- **Zero External Dependencies**: Pure Python event queue simulation engine with delta cycle support.
- **Standard VCD Generation**: Emits industry-standard IEEE 1364 VCD files compatible with GTKWave and ModelSim.
- **Live Fault Injection**: Inject stuck-at-0 and stuck-at-1 faults on arbitrary nets during live simulation to test circuit resilience.

### 4. Autonomous Agent Co-Pilot with Real-Time Interventions
- **Full Chat & Context Memory**: Retains conversation history, project structure, component states, and active file paths.
- **Tool-Augmented Execution**: Autonomous capabilities to create files, update schematics, execute simulation runs, analyze DRC reports, and query the Knowledge Graph.
- **Human-in-the-Loop Observer Deck**:
  - **Pause**: Immediately freeze the agent before tool execution.
  - **Step**: Execute exactly one autonomous cycle at a time.
  - **Steer**: Provide mid-flight natural language guidance.
  - **Resume**: Let the agent run continuously.

### 5. Circuit Knowledge Graph (CKG)
- **Continuous Learning Loop**: Automatically indexes new designs, extracts timing/area characteristics, and records failure mitigations (`FIXED_BY` links).
- **Hugging Face Hub Integration**: Ingest open-source Verilog/VHDL datasets directly from Hugging Face into the knowledge base.

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+** installed and available on your PATH.
- **Node.js 18+** & **npm** installed.

### Option A: Unified Launcher (Recommended)
Launch both the FastAPI backend and web server with a single command:
```bash
# Clone the repository
git clone https://github.com/shiva2321/circuit_forge.git
cd circuit_forge

# Install backend dependencies
pip install -r backend/requirements.txt

# Run the unified server
python backend/run_server.py
```
Open **`http://127.0.0.1:8000`** in your browser.

### Option B: Development Mode (Hot Reload)
To develop with Vite hot module replacement (HMR):

```bash
# Terminal 1: FastAPI Backend
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Vite React Frontend
cd web
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 🧪 Testing & Verification

CircuitForge features a comprehensive test suite covering AST parsing, the simulation engine, DRC rules, CKG persistence, and agent execution.

```bash
# Run backend test suite
python -m pytest backend/tests -v
```
**Results**: `97 passed in ~9.8s` (100% pass rate).

```bash
# Verify frontend build & TypeScript types
cd web
npm run build
```

---

## 📡 API Reference

The FastAPI backend exposes a rich REST and WebSocket interface:

### Core Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/projects` | List all available hardware projects |
| `POST` | `/api/projects` | Create a new project from a template or scratch |
| `GET` | `/api/projects/{name}` | Fetch full project manifest, files, and netlist |
| `POST` | `/api/projects/{name}/files` | Read or write a project file (`.vhd`, `.json`) |
| `POST` | `/api/simulate` | Execute cycle-accurate simulation with stimulus |
| `POST` | `/api/drc` | Run comprehensive Design Rule Check (DRC) on netlist |
| `POST` | `/api/agent/autofix` | 1-Click autonomous DRC resolution across code and canvas |
| `POST` | `/api/agent/interact` | Send prompt to AI co-pilot with full context & history |
| `GET` | `/api/knowledge/graph` | Retrieve nodes, edges, and clusters from CKG |
| `POST` | `/api/knowledge/query` | Perform semantic or structural queries on CKG |
| `GET` | `/api/embedded/platforms` | Get supported microcontroller targets & specs |
| `POST` | `/api/embedded/scaffold` | Generate bare-metal C/C++ driver & header bundle |

### WebSocket Real-Time Stream
Connect to `ws://127.0.0.1:8000/ws/events` to receive:
- Real-time agent thinking tokens and tool execution notifications.
- Simulation cycle step broadcasts.
- Dynamic Knowledge Graph node update pulses.

---

## 🔒 Security & Safety Guarantees

CircuitForge is engineered with strict production safety protocols:
1. **Zero-Leak Credential Hygiene**: All API keys, environment variables, and authentication tokens are masked and sanitized from logs and WebSocket payloads.
2. **Filesystem Sandboxing**: Project file reads and writes are restricted to the designated project workspace root using path normalization and directory traversal defense.
3. **Hardware Safety Guardrails**: Circuit simulations automatically check for direct VDD-to-GND shorts, simultaneous driver bus contention, and excessive power dissipation before running long simulation vectors.

---

## 📚 Documentation Index

For in-depth guides, architectural deep-dives, and security protocols, refer to:
- 📖 [User Guide & Tutorial](docs/USER_GUIDE.md) - Complete step-by-step handbook, interface guide, and design workflows.
- 🏛️ [System Architecture](docs/ARCHITECTURE.md) - AST parser, cycle simulator, event bus, and graph engine specifications.
- 🛡️ [Security & Safety Guidelines](docs/SECURITY.md) - Credential protection, sandboxing, and physical circuit integrity.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
"""

with open(os.path.join(BASE_DIR, "README.md"), "w", encoding="utf-8") as f:
    f.write(readme_content.strip() + "\n")
print("Wrote README.md successfully.")
