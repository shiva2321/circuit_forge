library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity memory_controller is
    Port (
        clk        : in  STD_LOGIC;
        rst        : in  STD_LOGIC;
        mem_read   : in  STD_LOGIC;
        mem_write  : in  STD_LOGIC;
        addr       : in  STD_LOGIC_VECTOR(63 downto 0);
        wdata      : in  STD_LOGIC_VECTOR(63 downto 0);
        rdata      : out STD_LOGIC_VECTOR(63 downto 0);
        mem_we_out : out STD_LOGIC;
        mem_re_out : out STD_LOGIC;
        ready      : out STD_LOGIC
    );
end memory_controller;

architecture RTL of memory_controller is
    type ram_type is array (0 to 63) of STD_LOGIC_VECTOR(63 downto 0);
    signal ram : ram_type := (
        0 => x"0000000000000010",
        1 => x"0000000000000020",
        2 => x"0000000000000042",
        others => (others => '0')
    );
    signal rdata_reg : STD_LOGIC_VECTOR(63 downto 0) := (others => '0');
begin
    process(clk, rst)
        variable idx : integer;
    begin
        if rst = '1' then
            rdata_reg <= (others => '0');
            ready     <= '0';
        elsif rising_edge(clk) then
            idx := to_integer(unsigned(addr(7 downto 2))) mod 64;
            ready <= mem_read or mem_write;

            if mem_write = '1' then
                ram(idx) <= wdata;
            end if;

            if mem_read = '1' then
                rdata_reg <= ram(idx);
            end if;
        end if;
    end process;

    rdata      <= rdata_reg;
    mem_we_out <= mem_write;
    mem_re_out <= mem_read;
end RTL;
