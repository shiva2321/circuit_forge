# Espressif ESP32-S3 MicroPython Application
import time
from machine import Pin, I2C, UART
import network

print("Initializing Espressif ESP32-S3 MicroPython Engine...")
led = Pin(8, Pin.OUT)
i2c = I2C(0, sda=Pin(21), scl=Pin(47), freq=400000)

devices = i2c.scan()
print(f"I2C Scan Detected Devices: {[hex(x) for x in devices]}")

while True:
    led.value(not led.value())
    time.sleep_ms(500)
