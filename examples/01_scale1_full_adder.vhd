-- CircuitForge Scale 1: Gate-Level 1-Bit Full Adder
-- Built from primitive XOR, AND, and OR gates

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity full_adder_scale1 is
    port (
        A    : in  std_logic;
        B    : in  std_logic;
        Cin  : in  std_logic;
        Sum  : out std_logic;
        Cout : out std_logic
    );
end full_adder_scale1;

architecture structural of full_adder_scale1 is
    signal s1, c1, c2 : std_logic;
begin
    -- Gate instances
    s1   <= A xor B;
    Sum  <= s1 xor Cin;
    c1   <= A and B;
    c2   <= Cin and s1;
    Cout <= c1 or c2;
end structural;
