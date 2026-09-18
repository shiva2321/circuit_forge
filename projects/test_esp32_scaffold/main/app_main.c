/**
 * @file app_main.c
 * @brief Espressif ESP32-S3 Production ESP-IDF Firmware Application
 * Target: ESP32-S3-WROOM-1 (Dual-core 32-bit Xtensa LX7 @ 240MHz + AI Vector Instructions)
 */

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/gpio.h"
#include "driver/i2c.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

static const char *TAG = "TEST_ESP32_SCAFFOLD";
#define STATUS_LED_GPIO   GPIO_NUM_8
#define I2C_MASTER_SDA_IO GPIO_NUM_21
#define I2C_MASTER_SCL_IO GPIO_NUM_47

static void telemetry_task(void *pvParameters) {
    ESP_LOGI(TAG, "Starting Telemetry & Sensor Acquisition Loop...");
    gpio_set_direction(STATUS_LED_GPIO, GPIO_MODE_OUTPUT);
    int level = 0;
    for (;;) {
        gpio_set_level(STATUS_LED_GPIO, level);
        level = !level;
        ESP_LOGI(TAG, "Telemetry Pulse: Heap Free = %lu bytes", esp_get_free_heap_size());
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Initializing Espressif ESP32-S3 System Hardware...");
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
    xTaskCreate(telemetry_task, "telemetry_task", 4096, NULL, 5, NULL);
}
