/**
 * @file main.c
 * @brief Raspberry Pi Pico (RP2040) Dual-Core Firmware
 */

#include <stdio.h>
#include "pico/stdlib.h"
#include "pico/multicore.h"
#include "hardware/i2c.h"
#include "hardware/pio.h"

#define LED_PIN 25

void core1_entry() {
    multicore_fifo_push_blocking(123);
    while (1) {
        tight_loop_contents();
    }
}

int main() {
    stdio_init_all();
    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);
    multicore_launch_core1(core1_entry);
    uint32_t msg = multicore_fifo_pop_blocking();
    printf("Core 0 received handshake from Core 1: %lu\n", msg);

    while (1) {
        gpio_put(LED_PIN, 1);
        sleep_ms(250);
        gpio_put(LED_PIN, 0);
        sleep_ms(250);
    }
}
