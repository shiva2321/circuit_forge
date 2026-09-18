"""
CircuitForge EDA Project & Filesystem Manager
Manages workspace projects, hierarchical directory trees, file reading/writing,
and starter architecture templates.
"""

import os
import json
import time
from typing import List, Dict, Any, Optional

PROJECTS_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "projects"))

class ProjectManager:
    def __init__(self, base_dir: str = PROJECTS_BASE_DIR):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)
        self._ensure_starter_projects()

    def _ensure_starter_projects(self):
        """Initializes canonical starter projects if not already present."""
        starters = [
            {
                "id": "scale1_full_adder",
                "name": "1-Bit Full Adder",
                "scale": 1,
                "scale_label": "Scale 1: Gate Level",
                "description": "Constructed from 2 XOR, 2 AND, and 1 OR gate with full testbench.",
                "files": {
                    "src/full_adder.vhd": (
                        "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n\n"
                        "entity full_adder is\n"
                        "    Port (\n"
                        "        A    : in  STD_LOGIC;\n"
                        "        B    : in  STD_LOGIC;\n"
                        "        Cin  : in  STD_LOGIC;\n"
                        "        Sum  : out STD_LOGIC;\n"
                        "        Cout : out STD_LOGIC\n"
                        "    );\n"
                        "end full_adder;\n\n"
                        "architecture Dataflow of full_adder is\n"
                        "    signal s1, c1, c2 : STD_LOGIC;\n"
                        "begin\n"
                        "    s1   <= A xor B;\n"
                        "    Sum  <= s1 xor Cin;\n"
                        "    c1   <= A and B;\n"
                        "    c2   <= s1 and Cin;\n"
                        "    Cout <= c1 or c2;\n"
                        "end Dataflow;\n"
                    ),
                    "tb/full_adder_tb.vhd": (
                        "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n\n"
                        "entity full_adder_tb is\nend full_adder_tb;\n\n"
                        "architecture sim of full_adder_tb is\n"
                        "    signal a, b, cin, sum, cout : STD_LOGIC := '0';\n"
                        "begin\n"
                        "    uut: entity work.full_adder port map (A => a, B => b, Cin => cin, Sum => sum, Cout => cout);\n"
                        "    process begin\n"
                        "        wait for 10 ns; a <= '1';\n"
                        "        wait for 10 ns; b <= '1';\n"
                        "        wait for 10 ns; cin <= '1';\n"
                        "        wait;\n"
                        "    end process;\n"
                        "end sim;\n"
                    ),
                    "constraints/timing.sdc": (
                        "# SDC Timing Constraints\ncreate_clock -name sys_clk -period 10.0 [get_ports clk]\n"
                    )
                }
            },
            {
                "id": "scale2_counter",
                "name": "8-Bit Synchronous Counter",
                "scale": 2,
                "scale_label": "Scale 2: RTL Module",
                "description": "8-bit up/down registered counter with enable, synchronous reset, and load.",
                "files": {
                    "src/counter_8bit.vhd": (
                        "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nuse IEEE.NUMERIC_STD.ALL;\n\n"
                        "entity counter_8bit is\n"
                        "    Port (\n"
                        "        clk   : in  STD_LOGIC;\n"
                        "        rst   : in  STD_LOGIC;\n"
                        "        en    : in  STD_LOGIC;\n"
                        "        load  : in  STD_LOGIC;\n"
                        "        d_in  : in  STD_LOGIC_VECTOR(7 downto 0);\n"
                        "        count : out STD_LOGIC_VECTOR(7 downto 0)\n"
                        "    );\n"
                        "end counter_8bit;\n\n"
                        "architecture RTL of counter_8bit is\n"
                        "    signal r_cnt : unsigned(7 downto 0);\n"
                        "begin\n"
                        "    process(clk, rst) begin\n"
                        "        if rst = '1' then\n"
                        "            r_cnt <= (others => '0');\n"
                        "        elsif rising_edge(clk) then\n"
                        "            if load = '1' then\n"
                        "                r_cnt <= unsigned(d_in);\n"
                        "            elsif en = '1' then\n"
                        "                r_cnt <= r_cnt + 1;\n"
                        "            end if;\n"
                        "        end if;\n"
                        "    end process;\n"
                        "    count <= std_logic_vector(r_cnt);\n"
                        "end RTL;\n"
                    ),
                    "tb/counter_tb.vhd": (
                        "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n\n"
                        "entity counter_tb is\nend counter_tb;\n\n"
                        "architecture sim of counter_tb is\n"
                        "    signal clk : STD_LOGIC := '0';\n"
                        "    signal rst, en, load : STD_LOGIC := '0';\n"
                        "    signal d_in, count : STD_LOGIC_VECTOR(7 downto 0) := (others => '0');\n"
                        "begin\n"
                        "    clk <= not clk after 5 ns;\n"
                        "    uut: entity work.counter_8bit port map(clk=>clk, rst=>rst, en=>en, load=>load, d_in=>d_in, count=>count);\n"
                        "    process begin\n"
                        "        rst <= '1'; wait for 20 ns;\n"
                        "        rst <= '0'; en <= '1'; wait for 100 ns;\n"
                        "        wait;\n"
                        "    end process;\n"
                        "end sim;\n"
                    )
                }
            },
            {
                "id": "scale3_alu",
                "name": "32-Bit Multi-Function ALU",
                "scale": 3,
                "scale_label": "Scale 3: Subsystem",
                "description": "32-bit arithmetic, logic, and comparison unit with zero flag output.",
                "files": {
                    "src/alu_32bit.vhd": (
                        "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nuse IEEE.NUMERIC_STD.ALL;\n\n"
                        "entity alu_32bit is\n"
                        "    Port (\n"
                        "        A          : in  STD_LOGIC_VECTOR(31 downto 0);\n"
                        "        B          : in  STD_LOGIC_VECTOR(31 downto 0);\n"
                        "        ALUControl : in  STD_LOGIC_VECTOR(3 downto 0);\n"
                        "        Result     : out STD_LOGIC_VECTOR(31 downto 0);\n"
                        "        Zero       : out STD_LOGIC\n"
                        "    );\n"
                        "end alu_32bit;\n\n"
                        "architecture Behavioral of alu_32bit is\n"
                        "    signal r_res : STD_LOGIC_VECTOR(31 downto 0);\n"
                        "begin\n"
                        "    process(A, B, ALUControl) begin\n"
                        "        case ALUControl is\n"
                        "            when \"0000\" => r_res <= std_logic_vector(unsigned(A) + unsigned(B));\n"
                        "            when \"0001\" => r_res <= std_logic_vector(unsigned(A) - unsigned(B));\n"
                        "            when \"0010\" => r_res <= A and B;\n"
                        "            when \"0011\" => r_res <= A or B;\n"
                        "            when others => r_res <= A xor B;\n"
                        "        end case;\n"
                        "    end process;\n"
                        "    Result <= r_res;\n"
                        "    Zero <= '1' if r_res = x\"00000000\" else '0';\n"
                        "end Behavioral;\n"
                    )
                }
            },
            {
                "id": "scale4_riscv",
                "name": "RISC-V RV32I Processor Core",
                "scale": 4,
                "scale_label": "Scale 4: Processor Core",
                "description": "Pipelined 32-bit RISC-V CPU core with Fetch, Decode, Execute, Memory, and Writeback stages.",
                "files": {
                    "src/riscv_core.vhd": (
                        "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nuse IEEE.NUMERIC_STD.ALL;\n\n"
                        "entity riscv_core is\n"
                        "    Port (\n"
                        "        clk     : in  STD_LOGIC;\n"
                        "        rst     : in  STD_LOGIC;\n"
                        "        PC      : out STD_LOGIC_VECTOR(31 downto 0);\n"
                        "        Instr   : in  STD_LOGIC_VECTOR(31 downto 0);\n"
                        "        WB_Data : out STD_LOGIC_VECTOR(31 downto 0)\n"
                        "    );\n"
                        "end riscv_core;\n\n"
                        "architecture Pipeline of riscv_core is\n"
                        "    signal r_pc : unsigned(31 downto 0);\n"
                        "begin\n"
                        "    process(clk, rst) begin\n"
                        "        if rst = '1' then\n"
                        "            r_pc <= (others => '0');\n"
                        "        elsif rising_edge(clk) then\n"
                        "            r_pc <= r_pc + 4;\n"
                        "        end if;\n"
                        "    end process;\n"
                        "    PC <= std_logic_vector(r_pc);\n"
                        "    WB_Data <= x\"0000000A\";\n"
                        "end Pipeline;\n"
                    )
                }
            },
            {
                "id": "mux_4to1",
                "name": "4-to-1 Multiplexer",
                "scale": 1,
                "scale_label": "Scale 1: Gate Level",
                "description": "Single-node consolidated 4:1 multiplexer with select input.",
                "files": {
                    "src/mux_4to1.vhd": (
                        "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\n\n"
                        "entity mux_4to1 is\n"
                        "    Port (\n"
                        "        sel : in  STD_LOGIC_VECTOR(1 downto 0);\n"
                        "        d0  : in  STD_LOGIC;\n"
                        "        d1  : in  STD_LOGIC;\n"
                        "        d2  : in  STD_LOGIC;\n"
                        "        d3  : in  STD_LOGIC;\n"
                        "        y   : out STD_LOGIC\n"
                        "    );\n"
                        "end mux_4to1;\n\n"
                        "architecture Behavioral of mux_4to1 is\n"
                        "begin\n"
                        "    process(sel, d0, d1, d2, d3) begin\n"
                        "        case sel is\n"
                        "            when \"00\" => y <= d0;\n"
                        "            when \"01\" => y <= d1;\n"
                        "            when \"10\" => y <= d2;\n"
                        "            when \"11\" => y <= d3;\n"
                        "            when others => y <= '0';\n"
                        "        end case;\n"
                        "    end process;\n"
                        "end Behavioral;\n"
                    )
                }
            },
            {
                "id": "esp32_iot_sensor",
                "name": "ESP32-S3 IoT Wireless Station",
                "scale": 3,
                "scale_label": "Scale 3: ESP32-S3 Dual-Core",
                "description": "ESP32-S3 dual-core Wi-Fi/BLE station with ESP-IDF C driver, MicroPython script, and PlatformIO configuration.",
                "files": {
                    "main/app_main.c": (
                        "#include <stdio.h>\n#include \"freertos/FreeRTOS.h\"\n#include \"freertos/task.h\"\n#include \"driver/gpio.h\"\n#include \"esp_log.h\"\n\n"
                        "void app_main(void) {\n"
                        "    ESP_LOGI(\"ESP32S3\", \"ESP32-S3 Dual-Core Xtensa LX7 Edge System Running!\");\n"
                        "    gpio_set_direction(GPIO_NUM_8, GPIO_MODE_OUTPUT);\n"
                        "    while(1) {\n"
                        "        gpio_set_level(GPIO_NUM_8, 1);\n"
                        "        vTaskDelay(pdMS_TO_TICKS(500));\n"
                        "        gpio_set_level(GPIO_NUM_8, 0);\n"
                        "        vTaskDelay(pdMS_TO_TICKS(500));\n"
                        "    }\n"
                        "}\n"
                    ),
                    "main.py": (
                        "import time\nfrom machine import Pin, I2C\n"
                        "print(\"ESP32-S3 MicroPython Sensor Node\")\n"
                        "led = Pin(8, Pin.OUT)\n"
                        "while True:\n"
                        "    led.value(not led.value())\n"
                        "    time.sleep_ms(500)\n"
                    ),
                    "platformio.ini": (
                        "[env:esp32s3]\nplatform = espressif32\nboard = esp32-s3-devkitc-1\nframework = espidf\nmonitor_speed = 115200\n"
                    )
                }
            },
            {
                "id": "rpi_pico_motion",
                "name": "Raspberry Pi Pico RP2040 Controller",
                "scale": 3,
                "scale_label": "Scale 3: RP2040 Dual-Core",
                "description": "RP2040 dual-core ARM Cortex-M0+ with custom hardware PIO state machine and Pico SDK C driver.",
                "files": {
                    "main.c": (
                        "#include <stdio.h>\n#include \"pico/stdlib.h\"\n#include \"pico/multicore.h\"\n\n"
                        "void core1_entry() {\n"
                        "    while(1) { tight_loop_contents(); }\n"
                        "}\n\n"
                        "int main() {\n"
                        "    stdio_init_all();\n"
                        "    multicore_launch_core1(core1_entry);\n"
                        "    gpio_init(25);\n"
                        "    gpio_set_dir(25, GPIO_OUT);\n"
                        "    while(1) {\n"
                        "        gpio_put(25, 1); sleep_ms(250);\n"
                        "        gpio_put(25, 0); sleep_ms(250);\n"
                        "    }\n"
                        "}\n"
                    ),
                    "stepper.pio": (
                        ".program stepper\n.wrap_target\n    pull block\n    out pins, 1\n.wrap\n"
                    ),
                    "CMakeLists.txt": (
                        "cmake_minimum_required(VERSION 3.13)\ninclude(pico_sdk_import.cmake)\nproject(rpi_pico_motion C CXX ASM)\npico_sdk_init()\nadd_executable(rpi_pico_motion main.c)\ntarget_link_libraries(rpi_pico_motion pico_stdlib pico_multicore)\npico_add_extra_outputs(rpi_pico_motion)\n"
                    )
                }
            },
            {
                "id": "rpi5_linux_gateway",
                "name": "Raspberry Pi 5 Linux Edge Gateway",
                "scale": 4,
                "scale_label": "Scale 4: Linux SBC (BCM2712)",
                "description": "Industrial edge controller running Linux on Broadcom BCM2712 Quad Cortex-A76 with gpiozero, systemd service, and 40-pin header mapping.",
                "files": {
                    "edge_controller.py": (
                        "#!/usr/bin/env python3\nimport time\nfrom gpiozero import LED, Button\n"
                        "led = LED(17)\n"
                        "print(\"Raspberry Pi 5 Edge Gateway Active!\")\n"
                        "while True:\n"
                        "    led.toggle()\n"
                        "    time.sleep(1.0)\n"
                    ),
                    "pinout_map.txt": (
                        "Raspberry Pi 5 40-Pin Header Configuration:\nPin 1: 3V3 Power\nPin 6: GND\nPin 11: GPIO 17 -> LED\nPin 3/5: GPIO 2/3 -> I2C1\n"
                    ),
                    "edge_controller.service": (
                        "[Unit]\nDescription=Raspberry Pi 5 Hardware Edge Gateway\nAfter=network.target\n\n[Service]\nExecStart=/usr/bin/python3 /opt/edge_controller.py\nRestart=always\n\n[Install]\nWantedBy=multi-user.target\n"
                    )
                }
            },
            {
                "id": "verilog_uart_subsystem",
                "name": "Verilog Synthesizable UART Subsystem",
                "scale": 2,
                "scale_label": "Scale 2: Verilog RTL Block",
                "description": "Synthesizable IEEE 1364-2005 Verilog UART transmitter/receiver with SystemVerilog testbench.",
                "files": {
                    "rtl/uart_tx.v": (
                        "`timescale 1ns / 1ps\n"
                        "module uart_tx #(\n"
                        "    parameter CLK_FREQ = 100_000_000,\n"
                        "    parameter BAUD = 115200\n"
                        ")(\n"
                        "    input wire clk, input wire rst_n,\n"
                        "    input wire [7:0] data_in, input wire start,\n"
                        "    output reg tx, output reg busy\n"
                        ");\n"
                        "    always @(posedge clk or negedge rst_n) begin\n"
                        "        if (!rst_n) begin tx <= 1'b1; busy <= 1'b0; end\n"
                        "        else if (start && !busy) begin busy <= 1'b1; tx <= 1'b0; end\n"
                        "    end\n"
                        "endmodule\n"
                    ),
                    "tb/uart_tx_tb.sv": (
                        "`timescale 1ns / 1ps\n"
                        "module uart_tx_tb;\n"
                        "    reg clk = 0; reg rst_n = 0; reg start = 0;\n"
                        "    reg [7:0] data = 8'h55; wire tx; wire busy;\n"
                        "    always #5 clk = ~clk;\n"
                        "    uart_tx uut (.clk(clk), .rst_n(rst_n), .data_in(data), .start(start), .tx(tx), .busy(busy));\n"
                        "    initial begin #20 rst_n = 1; #20 start = 1; #10 start = 0; #200 $finish; end\n"
                        "endmodule\n"
                    )
                }
            }
        ]

        for s in starters:
            proj_dir = os.path.join(self.base_dir, s["id"])
            os.makedirs(proj_dir, exist_ok=True)
            meta_path = os.path.join(proj_dir, "project.json")
            if not os.path.exists(meta_path):
                meta = {
                    "id": s["id"],
                    "name": s["name"],
                    "scale": s["scale"],
                    "scale_label": s["scale_label"],
                    "description": s["description"],
                    "created_at": time.time(),
                    "last_modified": time.time(),
                    "top_file": list(s["files"].keys())[0]
                }
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, indent=2)

            for rel_path, content in s["files"].items():
                full_path = os.path.join(proj_dir, rel_path)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                if not os.path.exists(full_path):
                    with open(full_path, "w", encoding="utf-8") as f:
                        f.write(content)

    def list_projects(self) -> List[Dict[str, Any]]:
        projects = []
        if not os.path.exists(self.base_dir):
            return projects

        for entry in os.scandir(self.base_dir):
            if entry.is_dir():
                meta_path = os.path.join(entry.path, "project.json")
                if os.path.exists(meta_path):
                    try:
                        with open(meta_path, "r", encoding="utf-8") as f:
                            meta = json.load(f)
                            # Count files
                            file_count = sum(len(files) for _, _, files in os.walk(entry.path) if not any(p.startswith('.') for p in files))
                            meta["file_count"] = file_count
                            meta["path"] = entry.path
                            projects.append(meta)
                    except Exception:
                        pass
                else:
                    projects.append({
                        "id": entry.name,
                        "name": entry.name.replace("_", " ").title(),
                        "scale": 1,
                        "scale_label": "Custom Project",
                        "description": "User created workspace project",
                        "path": entry.path,
                        "file_count": 0,
                        "last_modified": os.path.getmtime(entry.path)
                    })

        projects.sort(key=lambda p: p.get("last_modified", 0), reverse=True)
        return projects

    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves metadata for a specific project by id."""
        if not project_id:
            return None
        proj_dir = os.path.join(self.base_dir, project_id)
        if not os.path.exists(proj_dir):
            return None
        meta_path = os.path.join(proj_dir, "project.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    meta["path"] = proj_dir
                    file_count = sum(len(files) for _, _, files in os.walk(proj_dir) if not any(p.startswith('.') for p in files))
                    meta["file_count"] = file_count
                    return meta
            except Exception:
                pass
        top_f = self.get_top_file(project_id)
        return {
            "id": project_id,
            "name": project_id.replace("_", " ").title(),
            "scale": 1,
            "scale_label": "Custom Project",
            "description": "User created workspace project",
            "path": proj_dir,
            "file_count": 1,
            "top_file": top_f,
            "last_modified": os.path.getmtime(proj_dir) if os.path.exists(proj_dir) else time.time()
        }

    def get_top_file(self, project_id: str) -> Optional[str]:
        """Returns the relative path to the primary top-level design source file for a project."""
        if not project_id:
            return None
        proj_dir = os.path.join(self.base_dir, project_id)
        if not os.path.exists(proj_dir):
            return None
        meta_path = os.path.join(proj_dir, "project.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    if meta.get("top_file"):
                        return meta["top_file"]
            except Exception:
                pass

        # Search src/ directory for .vhd, .vhdl, .v, .sv files
        src_dir = os.path.join(proj_dir, "src")
        if os.path.exists(src_dir):
            candidates = []
            for f in sorted(os.listdir(src_dir)):
                fl = f.lower()
                if fl.endswith((".vhd", ".vhdl", ".v", ".sv")) and "tb" not in fl:
                    candidates.append(f"src/{f}")
            if candidates:
                # Prefer one matching the project_id name
                for c in candidates:
                    if project_id.lower() in c.lower():
                        return c
                return candidates[0]

        # Search main/ directory (for embedded platforms)
        main_dir = os.path.join(proj_dir, "main")
        if os.path.exists(main_dir):
            for f in sorted(os.listdir(main_dir)):
                fl = f.lower()
                if fl.endswith((".c", ".cpp", ".py", ".rs")):
                    return f"main/{f}"

        # Root directory fallback
        for f in sorted(os.listdir(proj_dir)):
            fl = f.lower()
            if fl.endswith((".vhd", ".vhdl", ".v", ".sv", ".c", ".py")) and not fl.startswith("."):
                return f
        return "src/full_adder.vhd"

    def create_project(self, name: str, scale: int = 1, template_type: str = "rtl", description: str = "") -> Dict[str, Any]:
        proj_id = name.lower().replace(" ", "_").replace("-", "_")
        proj_id = "".join(c for c in proj_id if c.isalnum() or c == "_")
        if not proj_id:
            proj_id = f"project_{int(time.time())}"

        proj_dir = os.path.join(self.base_dir, proj_id)
        os.makedirs(proj_dir, exist_ok=True)
        os.makedirs(os.path.join(proj_dir, "src"), exist_ok=True)
        os.makedirs(os.path.join(proj_dir, "tb"), exist_ok=True)
        os.makedirs(os.path.join(proj_dir, "constraints"), exist_ok=True)

        entity_name = proj_id
        top_vhd = (
            "library IEEE;\nuse IEEE.STD_LOGIC_1164.ALL;\nuse IEEE.NUMERIC_STD.ALL;\n\n"
            f"entity {entity_name} is\n"
            "    Port (\n"
            "        clk   : in  STD_LOGIC;\n"
            "        rst   : in  STD_LOGIC;\n"
            "        d_in  : in  STD_LOGIC_VECTOR(7 downto 0);\n"
            "        d_out : out STD_LOGIC_VECTOR(7 downto 0)\n"
            "    );\n"
            f"end {entity_name};\n\n"
            f"architecture RTL of {entity_name} is\n"
            "begin\n"
            "    process(clk, rst) begin\n"
            "        if rst = '1' then\n"
            "            d_out <= (others => '0');\n"
            "        elsif rising_edge(clk) then\n"
            "            d_out <= d_in;\n"
            "        end if;\n"
            "    end process;\n"
            "end RTL;\n"
        )

        top_file_rel = f"src/{entity_name}.vhd"
        with open(os.path.join(proj_dir, top_file_rel), "w", encoding="utf-8") as f:
            f.write(top_vhd)

        scale_labels = {
            1: "Scale 1: Gate Level",
            2: "Scale 2: RTL Module",
            3: "Scale 3: Subsystem",
            4: "Scale 4: Processor Core"
        }

        meta = {
            "id": proj_id,
            "name": name,
            "scale": scale,
            "scale_label": scale_labels.get(scale, "Custom RTL"),
            "description": description or f"Digital hardware design project ({name})",
            "created_at": time.time(),
            "last_modified": time.time(),
            "top_file": top_file_rel
        }

        with open(os.path.join(proj_dir, "project.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        meta["path"] = proj_dir
        meta["file_count"] = 1
        return meta

    def get_project_tree(self, project_id: str) -> Dict[str, Any]:
        proj_dir = os.path.join(self.base_dir, project_id)
        if not os.path.exists(proj_dir):
            raise FileNotFoundError(f"Project '{project_id}' not found.")

        def _build_tree(cur_dir: str, rel_prefix: str = "") -> List[Dict[str, Any]]:
            items = []
            for entry in sorted(os.scandir(cur_dir), key=lambda e: (not e.is_dir(), e.name.lower())):
                if entry.name.startswith(".") or entry.name == "__pycache__":
                    continue
                rel_path = os.path.join(rel_prefix, entry.name).replace("\\", "/")
                if entry.is_dir():
                    children = _build_tree(entry.path, rel_path)
                    items.append({
                        "name": entry.name,
                        "path": rel_path,
                        "is_dir": True,
                        "children": children
                    })
                else:
                    ext = os.path.splitext(entry.name)[1].lower()
                    items.append({
                        "name": entry.name,
                        "path": rel_path,
                        "is_dir": False,
                        "size": entry.stat().st_size,
                        "ext": ext
                    })
            return items

        return {
            "project_id": project_id,
            "tree": _build_tree(proj_dir)
        }

    def read_file(self, project_id: str, rel_path: str) -> str:
        clean_rel = rel_path.replace("\\", "/").lstrip("/")
        full_path = os.path.abspath(os.path.join(self.base_dir, project_id, clean_rel))
        proj_dir = os.path.abspath(os.path.join(self.base_dir, project_id))

        if not full_path.startswith(proj_dir):
            raise PermissionError("Access outside project boundary is prohibited.")
        if not os.path.exists(full_path) or os.path.isdir(full_path):
            raise FileNotFoundError(f"File '{rel_path}' not found.")

        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    def write_file(self, project_id: str, rel_path: str, content: str) -> bool:
        clean_rel = rel_path.replace("\\", "/").lstrip("/")
        full_path = os.path.abspath(os.path.join(self.base_dir, project_id, clean_rel))
        proj_dir = os.path.abspath(os.path.join(self.base_dir, project_id))

        if not full_path.startswith(proj_dir):
            raise PermissionError("Access outside project boundary is prohibited.")

        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)

        # Update project modified timestamp
        meta_path = os.path.join(proj_dir, "project.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r+", encoding="utf-8") as f:
                    meta = json.load(f)
                    meta["last_modified"] = time.time()
                    f.seek(0)
                    json.dump(meta, f, indent=2)
                    f.truncate()
            except Exception:
                pass
        return True

    def create_entry(self, project_id: str, rel_path: str, is_dir: bool = False, content: str = "") -> bool:
        clean_rel = rel_path.replace("\\", "/").lstrip("/")
        full_path = os.path.abspath(os.path.join(self.base_dir, project_id, clean_rel))
        proj_dir = os.path.abspath(os.path.join(self.base_dir, project_id))

        if not full_path.startswith(proj_dir):
            raise PermissionError("Access outside project boundary is prohibited.")

        if is_dir:
            os.makedirs(full_path, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)
        return True

    def delete_entry(self, project_id: str, rel_path: str) -> bool:
        clean_rel = rel_path.replace("\\", "/").lstrip("/")
        full_path = os.path.abspath(os.path.join(self.base_dir, project_id, clean_rel))
        proj_dir = os.path.abspath(os.path.join(self.base_dir, project_id))

        if not full_path.startswith(proj_dir) or full_path == proj_dir:
            raise PermissionError("Deleting project root or outside boundary is prohibited.")

        if not os.path.exists(full_path):
            return False

        if os.path.isdir(full_path):
            import shutil
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)
        return True

    def rename_entry(self, project_id: str, old_rel: str, new_rel: str) -> bool:
        clean_old = old_rel.replace("\\", "/").lstrip("/")
        clean_new = new_rel.replace("\\", "/").lstrip("/")
        old_path = os.path.abspath(os.path.join(self.base_dir, project_id, clean_old))
        new_path = os.path.abspath(os.path.join(self.base_dir, project_id, clean_new))
        proj_dir = os.path.abspath(os.path.join(self.base_dir, project_id))

        if not old_path.startswith(proj_dir) or not new_path.startswith(proj_dir):
            raise PermissionError("Access outside project boundary is prohibited.")

        os.makedirs(os.path.dirname(new_path), exist_ok=True)
        os.rename(old_path, new_path)
        return True

    def create_embedded_platform_project(
        self,
        platform_id: str,
        target_language: str,
        project_name: str,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        from backend.app.engine.embedded_platforms import embedded_platforms_engine
        gen = embedded_platforms_engine.generate_platform_firmware_and_config(
            platform_id=platform_id,
            target_language=target_language,
            project_name=project_name
        )
        proj_id = project_name.lower().replace(" ", "_").replace("-", "_")
        proj_dir = os.path.join(self.base_dir, proj_id)
        os.makedirs(proj_dir, exist_ok=True)

        top_file = ""
        # Write source files
        for rel_path, content in gen["source_files"].items():
            if not top_file:
                top_file = rel_path
            full_path = os.path.join(proj_dir, rel_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)

        # Write manifest files
        for rel_path, content in gen["manifest_files"].items():
            full_path = os.path.join(proj_dir, rel_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)

        # Save project metadata
        meta = {
            "id": proj_id,
            "name": gen["project_name"],
            "platform_id": gen["platform_id"],
            "platform_name": gen["platform_name"],
            "soc": gen["soc"],
            "architecture": gen["architecture"],
            "target_language": gen["target_language"],
            "scale": 3,
            "scale_label": f"Scale 3: {gen['platform_name']}",
            "description": description or f"{gen['platform_name']} ({gen['architecture']}) embedded system project",
            "created_at": time.time(),
            "last_modified": time.time(),
            "top_file": top_file
        }
        with open(os.path.join(proj_dir, "project.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        meta["path"] = proj_dir
        meta["file_count"] = len(gen["source_files"]) + len(gen["manifest_files"])
        return meta

project_mgr = ProjectManager()
