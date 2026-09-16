-- CircuitForge Scale 2: RTL 8-Bit Synchronous Up/Down Counter
-- Features synchronous load, count enable, direction, and terminal count

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity sync_counter_scale2 is
    port (
        clk     : in  std_logic;
        rst     : in  std_logic;
        en      : in  std_logic;
        up_down : in  std_logic;
        load    : in  std_logic;
        d_in    : in  std_logic_vector(7 downto 0);
        count   : out std_logic_vector(7 downto 0);
        tc      : out std_logic
    );
end sync_counter_scale2;

architecture rtl of sync_counter_scale2 is
    signal r_count : unsigned(7 downto 0);
begin
    process(clk, rst)
    begin
        if rst = '1' then
            r_count <= (others => '0');
        elsif rising_edge(clk) then
            if load = '1' then
                r_count <= unsigned(d_in);
            elsif en = '1' then
                if up_down = '1' then
                    r_count <= r_count + 1;
                else
                    r_count <= r_count - 1;
                end if;
            end if;
        end if;
    end process;

    count <= std_logic_vector(r_count);
    tc    <= '1' when (up_down = '1' and r_count = 255) or (up_down = '0' and r_count = 0) else '0';
end rtl;
