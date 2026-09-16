# CircuitForge: Autonomous & Interactive Multi-Scale Circuit EDA Studio

**CircuitForge** is a toolkit, simulation environment, and interactive visual space where an AI agent can autonomously and interactively **design, build, run, test, and inspect circuit designs from scratch to high-level architecture** (from gate-level primitives to 32-bit pipelined RISC-V processors).

The environment features an autonomous **Circuit Knowledge Graph (CKG)**, an open hardware dataset ingestion pipeline (including Hugging Face Hub), interactive schematic and logic analyzer viewers, and a **Human-in-the-Loop Observer Deck** allowing the user to inspect, pause, step, steer, or inject faults at any point in the design process.

---

## Key Features

### 1. Multi-Scale Circuit Engineering
CircuitForge covers the complete hardware abstraction hierarchy across 4 distinct scales:
- **Scale 1: Transistors & Gate Level**: CMOS inverters, 2-input NAND/NOR/XOR gates, transmission gate switches, and master-slave D-Flip-Flops.
- **Scale 2: RTL & Arithmetic Blocks**: 1-bit full adders, 32-bit Carry Lookahead Adders (CLA), 8-bit synchronous up/down counters, 2:1/4:1 multiplexers, and synchronous/asynchronous FIFOs with Gray-code CDC synchronizers.
- **Scale 3: Subsystems & IP Cores**: 32-bit Multi-Function ALU with status flags (Zero, Negative, Carry, Overflow), 32x32-bit dual-read single-write register files, and full-duplex UART cores with 16x oversampling baud generators.
- **Scale 4: High-Level Systems & Processors**: Complete 32-bit RISC-V RV32I 5-stage pipelined processor core (IF, ID, EX, MEM, WB) with hazard detection and data forwarding units.

### 2. Built-in Cycle-Accurate Event-Driven Logic Simulator
- Native event-driven simulation engine in Python (zero external dependencies required to run out of the box).
- 4-state logic representation (`'0'`, `'1'`, `'Z'`, `'X'`).
- Generates standard IEEE 1364 VCD (Value Change Dump) files and structured JSON waveforms for the web logic analyzer.
- Schedule stimulus vectors and automated self-checking assertions.
- Live stuck-at-0 and stuck-at-1 fault injection on any circuit net to test robustness.

### 3. Circuit Knowledge Graph (CKG) with Autonomous Updates
- Backed by **NetworkX** and **SQLite** persistence (`data/circuit_knowledge_graph.db`).
- Indexes entities, design patterns, synthesis rules, and failure modes (`Metastability`, `Inferred Latch`, `Clock Domain Crossing`, `Setup/Hold Violations`).
- **Autonomous Continuous Learning**: As the agent designs circuits and runs simulations, it automatically creates design nodes, logs empirical performance metrics (gate count, critical path, clock frequency), and links to failure modes on assertion errors (`VULNERABLE_TO` / `FIXED_BY`).
- **Interactive Force-Directed Visualizer**: Explore the graph with scale clustering, keyword search, and real-time pulse animations when the agent updates nodes.

### 4. Hugging Face Dataset Ingestion Pipeline
- Stream open-source Verilog/VHDL code and EDA benchmark datasets from the **Hugging Face Hub** (e.g. `shailja/Verilog_Github`, `Open-Source-FPGA-Resource/Verilog-HDL`).
- Automatically extracts module names, ports, and parameters, categorizes abstraction scale, and synthesizes new Knowledge Graph nodes with full provenance.
- Includes pre-packaged offline high-density hardware corpus for instant offline usage.

### 5. Human-in-the-Loop Observer Deck & Interventions
- **Live Thought Stream**: Watch the agent's step-by-step reasoning (`PLANNING`, `DESIGNING`, `LINTING`, `SYNTHESIZING`, `SIMULATING`, `LEARNING`).
- **Real-Time Intervention Controls**:
  - `[Pause]`: Halts the agent immediately before the next tool call.
  - `[Step]`: Allows the agent to execute exactly one action at a time.
  - `[Resume]`: Continues continuous autonomous mode.
  - `[Steer]`: Injects custom natural language guidance mid-flight.
  - `[Inject Fault]`: Forces a wire to stuck-at-0 or stuck-at-1 to test fault tolerance.

### 6. Interactive Visual Studio (Web Workbench)
- **Schematic Canvas**: Zoomable/pannable vector diagram with IEEE logic gate symbols, bus lines, and live logic state color overlays (`0` slate, `1` bright green). Click any block with internal hierarchy to drill down into submodules!
- **Logic Analyzer & Waveform Viewer**: Multi-channel digital timing diagrams with interactive timeline cursors, clock grids, and hex/binary bus decoders.
- **Monaco Code Editor**: Real-time VHDL code editing with syntax highlighting and instant lint error diagnostic markers.

---

## Quickstart Guide

### Start the Unified Studio (Backend + Frontend)
```bash
# In the repository root
python backend/run_server.py
```
Open your browser at **`http://127.0.0.1:8000`** to access the complete CircuitForge EDA Studio.

### Run in Development Mode (Optional)
If you want to run the Vite dev server with hot reload:
```bash
# Terminal 1: Backend
python backend/run_server.py

# Terminal 2: Web Studio
cd web
npm run dev
```
Open `http://localhost:5173`.

---

## Automated Test Suite
```bash
python -m pytest backend/tests -v
```
Verifies the simulation engine, VHDL AST parser, Knowledge Graph persistence, Hugging Face ingestion, and agent autonomous state machine.
