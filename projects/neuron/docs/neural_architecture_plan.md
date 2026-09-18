# 32-Neuron Hardware Array & 4-Digit Display Architecture Specification
**Target Entity**: `neural_processor_top`
**Abstraction Level**: Scale 3/4 (Neural Accelerator Subsystem)
**Author**: CircuitForge Autonomous EDA Engine

---

## 1. Executive Architectural Overview
The `neural_processor_top` system is a synthesizable hardware neural inference processor featuring a 32-neuron parallel array, pipelined MAC arithmetic units, ReLU non-linear activation functions, a reduction accumulator tree, daisy-chain cascading provisions, and an integrated 4-digit multiplexed seven-segment display controller.

```
                    +----------------------------------------------+
                    |           ELECTRIC STIMULUS INPUT            |
stimulus_in (8-bit) |===> [u_neural_array: neuron_layer_32]        |
stimulus_valid      |---> 32 Parallel Pipelined MAC Neurons        |
cascade_in (16-bit) |===> Interconnect + Chaining Provision        |
                    +----------------------+-----------------------+
                                           |
                    +----------------------+-----------------------+
                    | layer_sum_out (16b)  | winning_neuron_id (5b)|
                    +----------------------+-----------------------+
                                           |
                                           v
                    +----------------------------------------------+
                    |             DISPLAY MODE SELECTOR            |
display_mode ------>| Mode 0: 16-bit Hex Layer Activation Sum      |
                    | Mode 1: Winning Neuron ID + Stimulus Level   |
                    +----------------------+-----------------------+
                                           | disp_value (16b)
                                           v
                    +----------------------------------------------+
                    |        4-DIGIT SEVEN-SEGMENT DRIVER          |
                    | [u_display_ctrl: display_4x7seg]             |
                    | - 1 kHz Digit Multiplexing Prescaler         |
                    | - 4-to-1 Nibble Time-Division Multiplexer    |
                    | - Active-Low Hex-to-Cathode Decoder (a..g)   |
                    +----------------------+-----------------------+
                                           |
                        +------------------+------------------+
                        |                                     |
                        v                                     v
                 anode_out(3..0)                        seg_out(6..0)
              (Digit 3, 2, 1, 0)                     (Segments a - g)
```

---

## 2. Synthesizable RTL Module Breakdown

| File | Entity Name | Abstraction | Description |
| :--- | :--- | :--- | :--- |
| `src/neural_processor_top.vhd` | `neural_processor_top` | Scale 3/4 System | Top-level structural integration connecting the 32-neuron layer to the 4-digit display. |
| `src/neuron_layer_32.vhd` | `neuron_layer_32` | Scale 3 Subsystem | 32 parallel `neuron_core` instances, reduction accumulator, and winner-take-all classifier. |
| `src/neuron_core.vhd` | `neuron_core` | Scale 2 Module | Single arithmetic neuron with pipelined 8-bit multiplier, bias addition, and clamped ReLU. |
| `src/display_4x7seg.vhd` | `display_4x7seg` | Scale 2 Module | 4-digit dynamic multiplexed 7-segment display driver with hex-to-cathode decoder. |
| `tb/neural_processor_top_tb.vhd` | `neural_processor_top_tb` | Verification | Self-checking simulation testbench applying electrical stimulus and verifying multiplexed display. |
| `docs/neural_architecture_plan.md` | - | Documentation | Architectural specification and integration guide. |

---

## 3. Mathematical Model & Nonlinearity
Each neuron computes the weighted synaptic dot product followed by a biased Rectified Linear Unit (ReLU) activation:

y_i = ReLU(x * w_i + b_i) = max(0, min(127, x * w_i + b_i))

The aggregate layer response incorporates external cascade offsets:
Layer_Sum = Cascade_In + SUM(y_i for i=0..31)

---

## 4. Multi-Cluster Chaining Provision
To connect multiple 32-neuron tiles together in a deep neural network or wider array:
- Connect `cascade_out` of tile N directly to `cascade_in` of tile N+1.
- Stimulus can be broadcast simultaneously or pipelined along the cluster bus.
