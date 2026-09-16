#include <stdio.h>
#include "pico/stdlib.h"
#include "pico/multicore.h"

void core1_entry() {
    while(1) { tight_loop_contents(); }
}

int main() {
    stdio_init_all();
    multicore_launch_core1(core1_entry);
    gpio_init(25);
    gpio_set_dir(25, GPIO_OUT);
    while(1) {
        gpio_put(25, 1); sleep_ms(250);
        gpio_put(25, 0); sleep_ms(250);
    }
}
