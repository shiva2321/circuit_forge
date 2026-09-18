library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity repair_all_floating_unit_tb is
end repair_all_floating_unit_tb;

architecture sim of repair_all_floating_unit_tb is
    signal clk : STD_LOGIC := '0';
    signal rst : STD_LOGIC := '1';
begin
    clk <= not clk after 5 ns;
    uut: entity work.repair_all_floating_unit port map (clk => clk, rst => rst);
    process begin
        rst <= '1'; wait for 20 ns;
        rst <= '0'; wait for 100 ns;
        wait;
    end process;
end sim;
