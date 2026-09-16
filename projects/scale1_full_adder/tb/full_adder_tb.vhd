library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity full_adder_tb is
end full_adder_tb;

architecture sim of full_adder_tb is
    signal a, b, cin, sum, cout : STD_LOGIC := '0';
begin
    uut: entity work.full_adder port map (A => a, B => b, Cin => cin, Sum => sum, Cout => cout);
    process begin
        wait for 10 ns; a <= '1';
        wait for 10 ns; b <= '1';
        wait for 10 ns; cin <= '1';
        wait;
    end process;
end sim;
