library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity repair_all_floating_unit is
    port (
        A    : in  std_logic;
        B    : in  std_logic;
        Cin  : in  std_logic;
        Sum  : out std_logic;
        Cout : out std_logic
    );
end repair_all_floating_unit;

architecture structural of repair_all_floating_unit is
    signal s1, c1, c2 : std_logic;
begin
    -- 1-Bit Full Adder matching spec: Repair all floating CMOS inputs, tie unconnected pins to safe logic levels ('0'), resolve any bus contention, clear active stuck-at faults, synthesize the netlist, and apply the repaired design to the canvas.
    s1 <= A xor B;
    Sum <= s1 xor Cin;
    c1 <= A and B;
    c2 <= Cin and s1;
    Cout <= c1 or c2;
end structural;