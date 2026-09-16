library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity full_adder is
    Port (
        A    : in  STD_LOGIC;
        B    : in  STD_LOGIC;
        Cin  : in  STD_LOGIC;
        Sum  : out STD_LOGIC;
        Cout : out STD_LOGIC
    );
end full_adder;

architecture Dataflow of full_adder is
    signal s1, c1, c2 : STD_LOGIC;
begin
    s1   <= A xor B;
    Sum  <= s1 xor Cin;
    c1   <= A and B;
    c2   <= s1 and Cin;
    Cout <= c1 or c2;
end Dataflow;
