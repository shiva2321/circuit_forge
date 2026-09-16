library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter_8bit is
    Port (
        clk   : in  STD_LOGIC;
        rst   : in  STD_LOGIC;
        en    : in  STD_LOGIC;
        load  : in  STD_LOGIC;
        d_in  : in  STD_LOGIC_VECTOR(7 downto 0);
        count : out STD_LOGIC_VECTOR(7 downto 0)
    );
end counter_8bit;

architecture RTL of counter_8bit is
    signal r_cnt : unsigned(7 downto 0);
begin
    process(clk, rst) begin
        if rst = '1' then
            r_cnt <= (others => '0');
        elsif rising_edge(clk) then
            if load = '1' then
                r_cnt <= unsigned(d_in);
            elsif en = '1' then
                r_cnt <= r_cnt + 1;
            end if;
        end if;
    end process;
    count <= std_logic_vector(r_cnt);
end RTL;
