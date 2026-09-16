library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity counter_tb is
end counter_tb;

architecture sim of counter_tb is
    signal clk : STD_LOGIC := '0';
    signal rst, en, load : STD_LOGIC := '0';
    signal d_in, count : STD_LOGIC_VECTOR(7 downto 0) := (others => '0');
begin
    clk <= not clk after 5 ns;
    uut: entity work.counter_8bit port map(clk=>clk, rst=>rst, en=>en, load=>load, d_in=>d_in, count=>count);
    process begin
        rst <= '1'; wait for 20 ns;
        rst <= '0'; en <= '1'; wait for 100 ns;
        wait;
    end process;
end sim;
