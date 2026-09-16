import time
from machine import Pin, I2C
print("ESP32-S3 MicroPython Sensor Node")
led = Pin(8, Pin.OUT)
while True:
    led.value(not led.value())
    time.sleep_ms(500)
