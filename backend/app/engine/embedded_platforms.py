"""
CircuitForge Universal Embedded Platforms Engine
Supports multi-architecture microprocessors and microcontrollers:
- Raspberry Pi (RP2040 Pico / RP2350 Pico 2 & Raspberry Pi 4/5 Linux SBC)
- ESP32 Series (ESP32-S3 Xtensa Dual-Core & ESP32-C3/C6 RISC-V)
- ARM Cortex-M (STM32H7 / F4)
- RISC-V Microcontrollers (CH32V / SiFive / PicoRV32)
- Verilog & SystemVerilog Synthesizable RTL
Multi-language code generators: C/C++, Embedded Rust, MicroPython, Linux Python (gpiozero), Verilog.
Pinout multiplexing, peripheral configuration, and build manifests (platformio.ini, Cargo.toml, CMakeLists.txt).
"""

from typing import Dict, Any, List, Optional


class EmbeddedPlatformsEngine:
    """Multi-platform hardware architecture, pinout, and firmware generator."""

    PLATFORM_CATALOG: Dict[str, Dict[str, Any]] = {
        "raspberry_pi_pico": {
            "id": "raspberry_pi_pico",
            "name": "Raspberry Pi Pico / Pico W",
            "soc": "RP2040 / RP2350",
            "architecture": "Dual ARM Cortex-M0+ (133MHz) / Hazard3 RISC-V",
            "category": "Microcontroller (MCU)",
            "memory": "264KB SRAM, 2MB to 16MB QSPI Flash",
            "peripherals": ["8x PIO State Machines", "2x UART", "2x SPI", "2x I2C", "16x PWM", "3x 12-bit ADC", "USB 1.1 Host/Device"],
            "wireless": "Infineon CYW43439 802.11n Wi-Fi + BLE 5.2 (Pico W)",
            "supported_languages": ["c_cpp", "rust", "micropython"],
            "recommended_framework": "Raspberry Pi Pico SDK / Embassy Rust / MicroPython",
            "pinout_definition": [
                {"pin": 1, "gpio": "GP0", "functions": ["UART0 TX", "I2C0 SDA", "SPI0 RX", "PWM0 A"]},
                {"pin": 2, "gpio": "GP1", "functions": ["UART0 RX", "I2C0 SCL", "SPI0 CSn", "PWM0 B"]},
                {"pin": 4, "gpio": "GP2", "functions": ["I2C1 SDA", "SPI0 SCK", "PWM1 A"]},
                {"pin": 5, "gpio": "GP3", "functions": ["I2C1 SCL", "SPI0 TX", "PWM1 B"]},
                {"pin": 6, "gpio": "GP4", "functions": ["UART1 TX", "I2C0 SDA", "SPI0 RX", "PWM2 A"]},
                {"pin": 7, "gpio": "GP5", "functions": ["UART1 RX", "I2C0 SCL", "SPI0 CSn", "PWM2 B"]},
                {"pin": 31, "gpio": "GP26_ADC0", "functions": ["ADC0 (0-3.3V)", "I2C1 SDA", "PWM5 A"]},
                {"pin": 32, "gpio": "GP27_ADC1", "functions": ["ADC1 (0-3.3V)", "I2C1 SCL", "PWM5 B"]},
                {"pin": 34, "gpio": "GP28_ADC2", "functions": ["ADC2 (0-3.3V)", "PWM6 A"]},
                {"pin": 36, "gpio": "3V3(OUT)", "functions": ["Power Output 3.3V"]},
                {"pin": 38, "gpio": "GND", "functions": ["Ground Reference"]},
                {"pin": 39, "gpio": "VSYS", "functions": ["System Power Supply (1.8V to 5.5V)"]},
                {"pin": 40, "gpio": "VBUS", "functions": ["Micro-USB 5V Power"]}
            ]
        },
        "raspberry_pi_5_sbc": {
            "id": "raspberry_pi_5_sbc",
            "name": "Raspberry Pi 5 / CM5",
            "soc": "Broadcom BCM2712",
            "architecture": "Quad-core ARM Cortex-A76 64-bit @ 2.4GHz",
            "category": "Single Board Computer (Linux SBC)",
            "memory": "4GB / 8GB / 16GB LPDDR4X SDRAM",
            "peripherals": ["RP1 Southbridge I/O", "2x 4-lane MIPI DSI/CSI", "PCIe 2.0 x1", "2x USB 3.0", "Gigabit Ethernet"],
            "wireless": "Dual-band 802.11ac Wi-Fi + Bluetooth 5.0 BLE",
            "supported_languages": ["linux_python", "c_cpp", "rust"],
            "recommended_framework": "Linux gpiozero / libgpiod / Python 3 / C++",
            "pinout_definition": [
                {"pin": 1, "name": "3V3 Power", "type": "POWER", "gpio": None},
                {"pin": 2, "name": "5V Power", "type": "POWER", "gpio": None},
                {"pin": 3, "name": "GPIO 2", "type": "IO", "gpio": "GPIO2", "alt": "I2C1 SDA"},
                {"pin": 5, "name": "GPIO 3", "type": "IO", "gpio": "GPIO3", "alt": "I2C1 SCL"},
                {"pin": 6, "name": "Ground", "type": "GND", "gpio": None},
                {"pin": 7, "name": "GPIO 4", "type": "IO", "gpio": "GPIO4", "alt": "GPCLK0 / 1-Wire"},
                {"pin": 8, "name": "GPIO 14", "type": "IO", "gpio": "GPIO14", "alt": "UART0 TXD"},
                {"pin": 10, "name": "GPIO 15", "type": "IO", "gpio": "GPIO15", "alt": "UART0 RXD"},
                {"pin": 12, "name": "GPIO 18", "type": "IO", "gpio": "GPIO18", "alt": "PCM CLK / PWM0"},
                {"pin": 19, "name": "GPIO 10", "type": "IO", "gpio": "GPIO10", "alt": "SPI0 MOSI"},
                {"pin": 21, "name": "GPIO 9", "type": "IO", "gpio": "GPIO9", "alt": "SPI0 MISO"},
                {"pin": 23, "name": "GPIO 11", "type": "IO", "gpio": "GPIO11", "alt": "SPI0 SCLK"},
                {"pin": 24, "name": "GPIO 8", "type": "IO", "gpio": "GPIO8", "alt": "SPI0 CE0"}
            ]
        },
        "esp32_s3": {
            "id": "esp32_s3",
            "name": "Espressif ESP32-S3",
            "soc": "ESP32-S3-WROOM-1",
            "architecture": "Dual-core 32-bit Xtensa LX7 @ 240MHz + AI Vector Instructions",
            "category": "Microcontroller (MCU with Wireless)",
            "memory": "512KB SRAM, 384KB ROM, 8MB/16MB Octal PSRAM/Flash",
            "peripherals": ["45x Programmable GPIOs", "Full-speed USB-OTG", "Camera DVP", "LCD Interface", "MCPWM", "Touch Sensors"],
            "wireless": "2.4GHz Wi-Fi (802.11 b/g/n) + Bluetooth 5 (LE) Long Range",
            "supported_languages": ["c_cpp", "rust", "micropython"],
            "recommended_framework": "ESP-IDF v5.x / FreeRTOS / esp-hal Rust",
            "pinout_definition": [
                {"pin": 1, "gpio": "GPIO0", "functions": ["Boot Strapping", "ADC1_CH0", "RTC_GPIO0"]},
                {"pin": 4, "gpio": "GPIO3", "functions": ["Touch3", "ADC1_CH2", "JTAG"]},
                {"pin": 9, "gpio": "GPIO8", "functions": ["RGB LED Data", "SPI HD"]},
                {"pin": 11, "gpio": "GPIO10", "functions": ["FSPI IO4", "Touch10"]},
                {"pin": 19, "gpio": "GPIO19", "functions": ["USB D-", "JTAG"]},
                {"pin": 20, "gpio": "GPIO20", "functions": ["USB D+", "JTAG"]},
                {"pin": 21, "gpio": "GPIO21", "functions": ["I2C SDA", "RTC_GPIO21"]},
                {"pin": 22, "gpio": "GPIO47", "functions": ["I2C SCL", "SPICLK_P"]},
                {"pin": 43, "gpio": "GPIO43", "functions": ["U0TXD (Console UART)"]},
                {"pin": 44, "gpio": "GPIO44", "functions": ["U0RXD (Console UART)"]}
            ]
        },
        "esp32_c6_riscv": {
            "id": "esp32_c6_riscv",
            "name": "Espressif ESP32-C6 (RISC-V)",
            "soc": "ESP32-C6FH4",
            "architecture": "Single-core 32-bit RISC-V RV32IMAC @ 160MHz + LP-RISC-V @ 20MHz",
            "category": "Microcontroller (MCU with Wi-Fi 6 & Thread)",
            "memory": "512KB HP SRAM, 16KB LP SRAM, 4MB Quad SPI Flash",
            "peripherals": ["30x GPIOs", "USB Serial/JTAG", "SDIO 2.0", "Motor Control PWM", "Temperature Sensor"],
            "wireless": "Wi-Fi 6 (802.11ax), BLE 5.3, IEEE 802.15.4 (Zigbee 3.0 & Thread 1.3)",
            "supported_languages": ["c_cpp", "rust", "micropython"],
            "recommended_framework": "ESP-IDF / esp-hal-riscv / Zephyr RTOS",
            "pinout_definition": [
                {"pin": 2, "gpio": "GPIO1", "functions": ["ADC1_CH1", "Touch1"]},
                {"pin": 3, "gpio": "GPIO2", "functions": ["ADC1_CH2", "Touch2"]},
                {"pin": 7, "gpio": "GPIO6", "functions": ["I2C0 SDA", "UART1 TX"]},
                {"pin": 8, "gpio": "GPIO7", "functions": ["I2C0 SCL", "UART1 RX"]},
                {"pin": 16, "gpio": "GPIO12", "functions": ["USB Serial D-"]},
                {"pin": 17, "gpio": "GPIO13", "functions": ["USB Serial D+"]},
                {"pin": 21, "gpio": "GPIO16", "functions": ["U0TXD"]},
                {"pin": 22, "gpio": "GPIO17", "functions": ["U0RXD"]}
            ]
        },
        "stm32_arm_cortex": {
            "id": "stm32_arm_cortex",
            "name": "STM32H7 High-Performance ARM",
            "soc": "STM32H743ZI",
            "architecture": "ARM Cortex-M7 32-bit RISC @ 480MHz with DP-FPU",
            "category": "Industrial Microcontroller (MCU)",
            "memory": "2MB Flash, 1MB RAM, External FMC SDRAM",
            "peripherals": ["Dual 16-bit ADCs (3.6 MSPS)", "Ethernet MAC", "USB OTG High-Speed", "FDCAN", "HRTIM High-Res Timer"],
            "wireless": "External SPI/UART transceiver",
            "supported_languages": ["c_cpp", "rust"],
            "recommended_framework": "STM32Cube HAL / FreeRTOS / Embassy STM32",
            "pinout_definition": [
                {"pin": "PA9", "gpio": "PA9", "functions": ["USART1_TX", "TIM1_CH2"]},
                {"pin": "PA10", "gpio": "PA10", "functions": ["USART1_RX", "TIM1_CH3"]},
                {"pin": "PB6", "gpio": "PB6", "functions": ["I2C1_SCL", "CAN2_TX"]},
                {"pin": "PB7", "gpio": "PB7", "functions": ["I2C1_SDA", "CAN2_RX"]},
                {"pin": "PA5", "gpio": "PA5", "functions": ["SPI1_SCK", "ADC12_INP19"]},
                {"pin": "PA7", "gpio": "PA7", "functions": ["SPI1_MOSI", "TIM3_CH2"]}
            ]
        },
        "verilog_systemverilog": {
            "id": "verilog_systemverilog",
            "name": "Verilog & SystemVerilog RTL",
            "soc": "FPGA / ASIC Synthesis Target",
            "architecture": "Synthesizable IEEE 1364-2005 Verilog & IEEE 1800 SystemVerilog",
            "category": "Hardware Description Language (HDL)",
            "memory": "Block RAM (BRAM), UltraRAM (URAM), Distributed LUT RAM",
            "peripherals": ["Configurable AXI4-Lite, Wishbone, Avalon, APB Interconnect"],
            "wireless": "SDR / RF Front-End Transceiver Interface",
            "supported_languages": ["verilog", "systemverilog"],
            "recommended_framework": "Yosys / Vivado / Icarus Verilog / Verilator",
            "pinout_definition": [
                {"pin": "clk", "gpio": "clk", "functions": ["Primary Input Clock (100 MHz)"]},
                {"pin": "rst_n", "gpio": "rst_n", "functions": ["Active-Low Asynchronous Reset"]},
                {"pin": "tx_data", "gpio": "tx_data", "functions": ["Parallel Bus Output"]},
                {"pin": "rx_data", "gpio": "rx_data", "functions": ["Parallel Bus Input"]}
            ]
        }
    }

    @classmethod
    def get_platforms_catalog(cls) -> Dict[str, Any]:
        """Returns all supported embedded architectures, languages, and features."""
        return {
            "total_platforms": len(cls.PLATFORM_CATALOG),
            "platforms": list(cls.PLATFORM_CATALOG.values()),
            "supported_languages": [
                {"id": "c_cpp", "name": "Bare-Metal C / C++", "icon": "Code"},
                {"id": "rust", "name": "Embedded Rust (no_std / Embassy)", "icon": "Cpu"},
                {"id": "micropython", "name": "MicroPython / CircuitPython", "icon": "Terminal"},
                {"id": "linux_python", "name": "Embedded Linux Python (gpiozero)", "icon": "Activity"},
                {"id": "verilog", "name": "Verilog-2005 / SystemVerilog RTL", "icon": "Layers"}
            ]
        }

    @classmethod
    def generate_platform_firmware_and_config(
        cls,
        platform_id: str,
        target_language: str,
        project_name: str = "iot_edge_controller",
        peripherals: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Generates complete source code, hardware configuration, pinout mapping, and build manifests."""
        platform = cls.PLATFORM_CATALOG.get(platform_id)
        if not platform:
            platform = cls.PLATFORM_CATALOG["esp32_s3"]
            platform_id = "esp32_s3"

        if peripherals is None:
            peripherals = ["GPIO", "I2C", "SPI", "UART", "TIMER"]

        source_files: Dict[str, str] = {}
        manifest_files: Dict[str, str] = {}

        # -------------------------------------------------------------
        # 1. ESP32-S3 / ESP32-C6 (C/C++ ESP-IDF / Rust / MicroPython)
        # -------------------------------------------------------------
        if "esp32" in platform_id:
            if target_language == "c_cpp":
                source_files["main/app_main.c"] = (
                    f"/**\n"
                    f" * @file app_main.c\n"
                    f" * @brief {platform['name']} Production ESP-IDF Firmware Application\n"
                    f" * Target: {platform['soc']} ({platform['architecture']})\n"
                    f" */\n\n"
                    f"#include <stdio.h>\n"
                    f"#include \"freertos/FreeRTOS.h\"\n"
                    f"#include \"freertos/task.h\"\n"
                    f"#include \"freertos/queue.h\"\n"
                    f"#include \"driver/gpio.h\"\n"
                    f"#include \"driver/i2c.h\"\n"
                    f"#include \"esp_log.h\"\n"
                    f"#include \"esp_wifi.h\"\n"
                    f"#include \"nvs_flash.h\"\n\n"
                    f"static const char *TAG = \"{project_name.upper()}\";\n"
                    f"#define STATUS_LED_GPIO   GPIO_NUM_8\n"
                    f"#define I2C_MASTER_SDA_IO GPIO_NUM_21\n"
                    f"#define I2C_MASTER_SCL_IO GPIO_NUM_47\n\n"
                    f"static void telemetry_task(void *pvParameters) {{\n"
                    f"    ESP_LOGI(TAG, \"Starting Telemetry & Sensor Acquisition Loop...\");\n"
                    f"    gpio_set_direction(STATUS_LED_GPIO, GPIO_MODE_OUTPUT);\n"
                    f"    int level = 0;\n"
                    f"    for (;;) {{\n"
                    f"        gpio_set_level(STATUS_LED_GPIO, level);\n"
                    f"        level = !level;\n"
                    f"        ESP_LOGI(TAG, \"Telemetry Pulse: Heap Free = %lu bytes\", esp_get_free_heap_size());\n"
                    f"        vTaskDelay(pdMS_TO_TICKS(1000));\n"
                    f"    }}\n"
                    f"}}\n\n"
                    f"void app_main(void) {{\n"
                    f"    ESP_LOGI(TAG, \"Initializing {platform['name']} System Hardware...\");\n"
                    f"    esp_err_t ret = nvs_flash_init();\n"
                    f"    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {{\n"
                    f"        ESP_ERROR_CHECK(nvs_flash_erase());\n"
                    f"        ret = nvs_flash_init();\n"
                    f"    }}\n"
                    f"    ESP_ERROR_CHECK(ret);\n"
                    f"    xTaskCreate(telemetry_task, \"telemetry_task\", 4096, NULL, 5, NULL);\n"
                    f"}}\n"
                )
                manifest_files["CMakeLists.txt"] = (
                    "cmake_minimum_required(VERSION 3.16)\n"
                    "include($ENV{IDF_PATH}/tools/cmake/project.cmake)\n"
                    f"project({project_name})\n"
                )
                manifest_files["platformio.ini"] = (
                    "[env:esp32s3]\n"
                    "platform = espressif32\n"
                    "board = esp32-s3-devkitc-1\n"
                    "framework = espidf\n"
                    "monitor_speed = 115200\n"
                    "build_flags = -DCORE_DEBUG_LEVEL=3\n"
                )
            elif target_language == "rust":
                source_files["src/main.rs"] = (
                    f"//! {platform['name']} Embedded Rust (no_std) Application\n"
                    f"//! Real-time hardware control with memory safety guarantees\n\n"
                    f"#![no_std]\n"
                    f"#![no_main]\n\n"
                    f"use esp_backtrace as _;\n"
                    f"use esp_hal::{{\n"
                    f"    clock::ClockControl,\n"
                    f"    gpio::{{Io, Level, Output}},\n"
                    f"    peripherals::Peripherals,\n"
                    f"    prelude::*,\n"
                    f"    system::SystemControl,\n"
                    f"    delay::Delay,\n"
                    f"}};\n\n"
                    f"#[entry]\n"
                    f"fn main() -> ! {{\n"
                    f"    let peripherals = Peripherals::take();\n"
                    f"    let system = SystemControl::new(peripherals.SYSTEM);\n"
                    f"    let clocks = ClockControl::boot_defaults(system.clock_control).freeze();\n"
                    f"    let io = Io::new(peripherals.GPIO, peripherals.IO_MUX);\n"
                    f"    let mut led = Output::new(io.pins.gpio8, Level::Low);\n"
                    f"    let delay = Delay::new(&clocks);\n\n"
                    f"    loop {{\n"
                    f"        led.toggle();\n"
                    f"        delay.delay_millis(500);\n"
                    f"    }}\n"
                    f"}}\n"
                )
                manifest_files["Cargo.toml"] = (
                    f"[package]\n"
                    f"name = \"{project_name}\"\n"
                    f"version = \"0.1.0\"\n"
                    f"edition = \"2021\"\n\n"
                    f"[dependencies]\n"
                    f"esp-hal = {{ version = \"0.21.0\", features = [\"{platform_id.replace('_', '-')}\"] }}\n"
                    f"esp-backtrace = {{ version = \"0.14.0\", features = [\"{platform_id.replace('_', '-')}\", \"panic-handler\", \"println\"] }}\n"
                )
            else:  # MicroPython
                source_files["main.py"] = (
                    f"# {platform['name']} MicroPython Application\n"
                    f"import time\n"
                    f"from machine import Pin, I2C, UART\n"
                    f"import network\n\n"
                    f"print(\"Initializing {platform['name']} MicroPython Engine...\")\n"
                    f"led = Pin(8, Pin.OUT)\n"
                    f"i2c = I2C(0, sda=Pin(21), scl=Pin(47), freq=400000)\n\n"
                    f"devices = i2c.scan()\n"
                    f"print(f\"I2C Scan Detected Devices: {{[hex(x) for x in devices]}}\")\n\n"
                    f"while True:\n"
                    f"    led.value(not led.value())\n"
                    f"    time.sleep_ms(500)\n"
                )
                manifest_files["pymakr.conf"] = f"{{\n  \"name\": \"{project_name}\"\n}}\n"

        # -------------------------------------------------------------
        # 2. Raspberry Pi Pico / RP2040 (C SDK / Rust / MicroPython)
        # -------------------------------------------------------------
        elif platform_id == "raspberry_pi_pico":
            if target_language == "c_cpp":
                source_files["main.c"] = (
                    f"/**\n"
                    f" * @file main.c\n"
                    f" * @brief Raspberry Pi Pico (RP2040) Dual-Core Firmware\n"
                    f" */\n\n"
                    f"#include <stdio.h>\n"
                    f"#include \"pico/stdlib.h\"\n"
                    f"#include \"pico/multicore.h\"\n"
                    f"#include \"hardware/i2c.h\"\n"
                    f"#include \"hardware/pio.h\"\n\n"
                    f"#define LED_PIN 25\n\n"
                    f"void core1_entry() {{\n"
                    f"    multicore_fifo_push_blocking(123);\n"
                    f"    while (1) {{\n"
                    f"        tight_loop_contents();\n"
                    f"    }}\n"
                    f"}}\n\n"
                    f"int main() {{\n"
                    f"    stdio_init_all();\n"
                    f"    gpio_init(LED_PIN);\n"
                    f"    gpio_set_dir(LED_PIN, GPIO_OUT);\n"
                    f"    multicore_launch_core1(core1_entry);\n"
                    f"    uint32_t msg = multicore_fifo_pop_blocking();\n"
                    f"    printf(\"Core 0 received handshake from Core 1: %lu\\n\", msg);\n\n"
                    f"    while (1) {{\n"
                    f"        gpio_put(LED_PIN, 1);\n"
                    f"        sleep_ms(250);\n"
                    f"        gpio_put(LED_PIN, 0);\n"
                    f"        sleep_ms(250);\n"
                    f"    }}\n"
                    f"}}\n"
                )
                source_files["stepper_pulse.pio"] = (
                    "; Raspberry Pi Pico Programmable I/O (PIO) Assembly\n"
                    ".program stepper_pulse\n"
                    ".wrap_target\n"
                    "    pull block\n"
                    "    out pins, 1\n"
                    "    set x, 31\n"
                    "delay_loop:\n"
                    "    jmp x-- delay_loop\n"
                    ".wrap\n"
                )
                manifest_files["CMakeLists.txt"] = (
                    "cmake_minimum_required(VERSION 3.13)\n"
                    "include(pico_sdk_import.cmake)\n"
                    f"project({project_name} C CXX ASM)\n"
                    "pico_sdk_init()\n"
                    f"add_executable({project_name} main.c)\n"
                    f"target_link_libraries({project_name} pico_stdlib pico_multicore hardware_i2c hardware_pio)\n"
                    f"pico_add_extra_outputs({project_name})\n"
                )
                manifest_files["platformio.ini"] = (
                    "[env:raspberry_pi_pico]\n"
                    "platform = raspberrypi\n"
                    "board = pico\n"
                    "framework = arduino\n"
                )
            elif target_language == "rust":
                source_files["src/main.rs"] = (
                    f"//! RP2040 Raspberry Pi Pico Rust (no_std) Firmware\n"
                    f"#![no_std]\n"
                    f"#![no_main]\n\n"
                    f"use bsp::entry;\n"
                    f"use defmt::*;\n"
                    f"use defmt_rtt as _;\n"
                    f"use embedded_hal::digital::v2::ToggleableOutputPin;\n"
                    f"use panic_probe as _;\n"
                    f"use rp_pico as bsp;\n"
                    f"use bsp::hal::{{clocks::init_clocks_and_plls, pac, watchdog::Watchdog, Sio}};\n\n"
                    f"#[entry]\n"
                    f"fn main() -> ! {{\n"
                    f"    let mut pac = pac::Peripherals::take().unwrap();\n"
                    f"    let mut watchdog = Watchdog::new(pac.WATCHDOG);\n"
                    f"    let sio = Sio::new(pac.SIO);\n"
                    f"    let pins = bsp::Pins::new(pac.IO_BANK0, pac.PADS_BANK0, sio.gpio_bank0, &mut pac.RESETS);\n"
                    f"    let mut led_pin = pins.led.into_push_pull_output();\n\n"
                    f"    loop {{\n"
                    f"        led_pin.toggle().unwrap();\n"
                    f"        cortex_m::asm::delay(12_000_000);\n"
                    f"    }}\n"
                    f"}}\n"
                )
                manifest_files["Cargo.toml"] = (
                    f"[package]\n"
                    f"name = \"{project_name}\"\n"
                    f"version = \"0.1.0\"\n"
                    f"edition = \"2021\"\n\n"
                    f"[dependencies]\n"
                    f"rp-pico = \"0.9.0\"\n"
                    f"cortex-m = \"0.7.7\"\n"
                    f"cortex-m-rt = \"0.7.3\"\n"
                    f"embedded-hal = \"0.2.7\"\n"
                    f"panic-probe = {{ version = \"0.3.1\", features = [\"print-defmt\"] }}\n"
                    f"defmt = \"0.3.5\"\n"
                    f"defmt-rtt = \"0.4.0\"\n"
                )
            else:  # MicroPython
                source_files["main.py"] = (
                    "# Raspberry Pi Pico MicroPython Dual-Core Example\n"
                    "import time\n"
                    "import _thread\n"
                    "from machine import Pin, PWM, ADC\n\n"
                    "led = Pin(25, Pin.OUT)\n"
                    "adc = ADC(Pin(26))\n\n"
                    "def background_core():\n"
                    "    while True:\n"
                    "        val = adc.read_u16()\n"
                    "        voltage = val * (3.3 / 65535)\n"
                    "        print(f\"ADC Channel 0: {voltage:.2f} V\")\n"
                    "        time.sleep(1)\n\n"
                    "_thread.start_new_thread(background_core, ())\n\n"
                    "while True:\n"
                    "    led.toggle()\n"
                    "    time.sleep(0.5)\n"
                )

        # -------------------------------------------------------------
        # 3. Raspberry Pi 5 Linux SBC (Python gpiozero / C++ libgpiod)
        # -------------------------------------------------------------
        elif platform_id == "raspberry_pi_5_sbc":
            source_files["edge_controller.py"] = (
                f"#!/usr/bin/env python3\n"
                f"\"\"\"\n"
                f"Raspberry Pi 5 Industrial Edge Controller\n"
                f"Hardware: BCM2712 Quad-Core Cortex-A76 running Linux\n"
                f"Utilizes high-speed gpiozero & spidev for 40-pin header interfacing\n"
                f"\"\"\"\n\n"
                f"import time\n"
                f"import sys\n"
                f"from gpiozero import LED, Button, PWMOutputDevice\n\n"
                f"STATUS_PIN = 17   # Pin 11 on 40-pin header\n"
                f"INPUT_BTN = 27    # Pin 13\n"
                f"PWM_OUTPUT = 18   # Pin 12 (Hardware PWM0)\n\n"
                f"def on_button_pressed():\n"
                f"    print(\"[ALERT] Hardware Trigger Button Activated on GPIO 27!\")\n\n"
                f"def main():\n"
                f"    print(\"Initializing Raspberry Pi 5 Hardware Edge Controller...\")\n"
                f"    led = LED(STATUS_PIN)\n"
                f"    pwm = PWMOutputDevice(PWM_OUTPUT, frequency=1000)\n"
                f"    btn = Button(INPUT_BTN)\n"
                f"    btn.when_pressed = on_button_pressed\n\n"
                f"    pwm.value = 0.65  # 65% Duty Cycle\n"
                f"    print(\"Edge Controller Running. Press Ctrl+C to terminate.\")\n\n"
                f"    try:\n"
                f"        while True:\n"
                f"            led.toggle()\n"
                f"            time.sleep(1.0)\n"
                f"    except KeyboardInterrupt:\n"
                f"        print(\"\\nShutting down hardware peripherals safely.\")\n"
                f"        led.off()\n"
                f"        pwm.off()\n\n"
                f"if __name__ == '__main__':\n"
                f"    main()\n"
            )
            source_files["hardware_pinout_map.txt"] = (
                "Raspberry Pi 5 40-Pin Header Configuration:\n"
                "Pin 1  : 3V3 Power\n"
                "Pin 6  : Ground\n"
                "Pin 11 : GPIO 17 -> Status LED\n"
                "Pin 12 : GPIO 18 -> Hardware PWM (1 kHz)\n"
                "Pin 13 : GPIO 27 -> Input Button Trigger\n"
                "Pin 3/5: GPIO 2/3 -> I2C1 Bus (Sensors)\n"
            )
            manifest_files["requirements.txt"] = "gpiozero>=2.0\nspidev>=3.6\nsmbus2>=0.4.3\npaho-mqtt>=1.6.1\n"
            manifest_files["edge_controller.service"] = (
                "[Unit]\n"
                "Description=Raspberry Pi 5 Hardware Edge Controller Service\n"
                "After=network.target\n\n"
                "[Service]\n"
                "ExecStart=/usr/bin/python3 /opt/edge_controller.py\n"
                "Restart=always\n"
                "User=pi\n\n"
                "[Install]\n"
                "WantedBy=multi-user.target\n"
            )

        # -------------------------------------------------------------
        # 4. Verilog & SystemVerilog RTL Subsystem
        # -------------------------------------------------------------
        elif platform_id == "verilog_systemverilog":
            source_files["rtl/uart_controller.v"] = (
                "// Synthesizable Verilog-2005 UART Transmitter/Receiver Controller\n"
                "`timescale 1ns / 1ps\n\n"
                "module uart_controller #(\n"
                "    parameter CLK_FREQ_HZ = 100_000_000,\n"
                "    parameter BAUD_RATE   = 115200\n"
                ")(\n"
                "    input  wire       clk,\n"
                "    input  wire       rst_n,\n"
                "    input  wire [7:0] tx_byte,\n"
                "    input  wire       tx_start,\n"
                "    output reg        tx_busy,\n"
                "    output reg        tx_line\n"
                ");\n\n"
                "    localparam CLKS_PER_BIT = CLK_FREQ_HZ / BAUD_RATE;\n"
                "    reg [15:0] clk_cnt;\n"
                "    reg [3:0]  bit_idx;\n"
                "    reg [9:0]  shifter;\n\n"
                "    always @(posedge clk or negedge rst_n) begin\n"
                "        if (!rst_n) begin\n"
                "            tx_line  <= 1'b1;\n"
                "            tx_busy  <= 1'b0;\n"
                "            clk_cnt  <= 16'd0;\n"
                "            bit_idx  <= 4'd0;\n"
                "        end else if (tx_start && !tx_busy) begin\n"
                "            tx_busy  <= 1'b1;\n"
                "            shifter  <= {1'b1, tx_byte, 1'b0}; // Stop bit, Data, Start bit\n"
                "            clk_cnt  <= 16'd0;\n"
                "            bit_idx  <= 4'd0;\n"
                "        end else if (tx_busy) begin\n"
                "            if (clk_cnt < CLKS_PER_BIT - 1) begin\n"
                "                clk_cnt <= clk_cnt + 1'b1;\n"
                "            end else begin\n"
                "                clk_cnt <= 16'd0;\n"
                "                tx_line <= shifter[0];\n"
                "                shifter <= {1'b1, shifter[9:1]};\n"
                "                if (bit_idx == 4'd9) begin\n"
                "                    tx_busy <= 1'b0;\n"
                "                end else begin\n"
                "                    bit_idx <= bit_idx + 1'b1;\n"
                "                end\n"
                "            end\n"
                "        end\n"
                "    end\n"
                "endmodule\n"
            )
            source_files["tb/uart_controller_tb.sv"] = (
                "// SystemVerilog Verification Testbench\n"
                "`timescale 1ns / 1ps\n\n"
                "module uart_controller_tb;\n"
                "    reg clk = 0;\n"
                "    reg rst_n = 0;\n"
                "    reg [7:0] tx_byte = 8'hA5;\n"
                "    reg tx_start = 0;\n"
                "    wire tx_busy;\n"
                "    wire tx_line;\n\n"
                "    always #5 clk = ~clk; // 100 MHz\n\n"
                "    uart_controller uut (\n"
                "        .clk(clk), .rst_n(rst_n), .tx_byte(tx_byte),\n"
                "        .tx_start(tx_start), .tx_busy(tx_busy), .tx_line(tx_line)\n"
                "    );\n\n"
                "    initial begin\n"
                "        #20 rst_n = 1;\n"
                "        #20 tx_start = 1;\n"
                "        #10 tx_start = 0;\n"
                "        wait(!tx_busy);\n"
                "        #100 $finish;\n"
                "    end\n"
                "endmodule\n"
            )
            manifest_files["constraints/timing.sdc"] = "create_clock -name clk -period 10.0 [get_ports clk]\n"

        # -------------------------------------------------------------
        # 5. STM32 ARM Cortex-M
        # -------------------------------------------------------------
        else:
            source_files["src/main.c"] = (
                f"/**\n"
                f" * @file main.c\n"
                f" * @brief {platform['name']} Industrial Embedded Firmware\n"
                f" */\n\n"
                f"#include \"stm32h7xx_hal.h\"\n\n"
                f"void SystemClock_Config(void);\n"
                f"static void MX_GPIO_Init(void);\n\n"
                f"int main(void) {{\n"
                f"    HAL_Init();\n"
                f"    SystemClock_Config();\n"
                f"    MX_GPIO_Init();\n\n"
                f"    while (1) {{\n"
                f"        HAL_GPIO_TogglePin(GPIOB, GPIO_PIN_0); // Green LED\n"
                f"        HAL_Delay(500);\n"
                f"    }}\n"
                f"}}\n"
            )
            manifest_files["platformio.ini"] = (
                "[env:nucleo_h743zi]\n"
                "platform = ststm32\n"
                "board = nucleo_h743zi\n"
                "framework = stm32cube\n"
            )

        return {
            "success": True,
            "platform_id": platform_id,
            "platform_name": platform["name"],
            "soc": platform["soc"],
            "architecture": platform["architecture"],
            "category": platform["category"],
            "target_language": target_language,
            "project_name": project_name,
            "source_files": source_files,
            "manifest_files": manifest_files,
            "pinout_definition": platform["pinout_definition"],
            "recommended_framework": platform["recommended_framework"],
            "peripherals_configured": peripherals
        }


embedded_platforms_engine = EmbeddedPlatformsEngine()
