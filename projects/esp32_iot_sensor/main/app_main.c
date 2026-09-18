#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_log.h"

void app_main(void) {
    ESP_LOGI("ESP32S3", "ESP32-S3 Dual-Core Xtensa LX7 Edge System Running!");
    gpio_set_direction(GPIO_NUM_8, GPIO_MODE_OUTPUT);
    while(1) {
        gpio_set_level(GPIO_NUM_8, 1);
        vTaskDelay(pdMS_TO_TICKS(500));
        gpio_set_level(GPIO_NUM_8, 0);
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
