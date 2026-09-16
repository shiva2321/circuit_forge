#!/usr/bin/env python3
"""
Raspberry Pi 5 Industrial Edge Controller
Hardware: BCM2712 Quad-Core Cortex-A76 running Linux
Utilizes high-speed gpiozero & spidev for 40-pin header interfacing
"""

import time
import sys
from gpiozero import LED, Button, PWMOutputDevice

STATUS_PIN = 17   # Pin 11 on 40-pin header
INPUT_BTN = 27    # Pin 13
PWM_OUTPUT = 18   # Pin 12 (Hardware PWM0)

def on_button_pressed():
    print("[ALERT] Hardware Trigger Button Activated on GPIO 27!")

def main():
    print("Initializing Raspberry Pi 5 Hardware Edge Controller...")
    led = LED(STATUS_PIN)
    pwm = PWMOutputDevice(PWM_OUTPUT, frequency=1000)
    btn = Button(INPUT_BTN)
    btn.when_pressed = on_button_pressed

    pwm.value = 0.65  # 65% Duty Cycle
    print("Edge Controller Running. Press Ctrl+C to terminate.")

    try:
        while True:
            led.toggle()
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nShutting down hardware peripherals safely.")
        led.off()
        pwm.off()

if __name__ == '__main__':
    main()
