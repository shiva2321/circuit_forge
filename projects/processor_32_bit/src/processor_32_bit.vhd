library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity processor_32_bit is
    Port (
        clk   : in  STD_LOGIC;
        rst   : in  STD_LOGIC;
        d_in  : in  STD_LOGIC_VECTOR(7 downto 0);
        d_out : out STD_LOGIC_VECTOR(7 downto 0)
    );
end processor_32_bit;

architecture RTL of processor_32_bit is
begin
    process(clk, rst) begin
        if rst = '1' then
            d_out <= (others => '0');
        elsif rising_edge(clk) then
            d_out <= d_in;
        end if;
    end process;
end RTL;
