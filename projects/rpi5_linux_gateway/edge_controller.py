#!/usr/bin/env python3
import time
from gpiozero import LED, Button
led = LED(17)
print("Raspberry Pi 5 Edge Gateway Active!")
while True:
    led.toggle()
    time.sleep(1.0)
