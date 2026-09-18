library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity register_file_64bit is
    Port (
        clk        : in  STD_LOGIC;
        rst        : in  STD_LOGIC;
        we         : in  STD_LOGIC;
        waddr      : in  STD_LOGIC_VECTOR(4 downto 0);
        wdata      : in  STD_LOGIC_VECTOR(63 downto 0);
        raddr1     : in  STD_LOGIC_VECTOR(4 downto 0);
        raddr2     : in  STD_LOGIC_VECTOR(4 downto 0);
        rdata1     : out STD_LOGIC_VECTOR(63 downto 0);
        rdata2     : out STD_LOGIC_VECTOR(63 downto 0)
    );
end register_file_64bit;

architecture RTL of register_file_64bit is
    type reg_array is array (0 to 31) of STD_LOGIC_VECTOR(63 downto 0);
    signal registers : reg_array := (others => (others => '0'));
begin
    -- Synchronous Write with R0 Hardwired to 0
    process(clk, rst)
    begin
        if rst = '1' then
            registers <= (others => (others => '0'));
        elsif rising_edge(clk) then
            if we = '1' and unsigned(waddr) /= 0 then
                registers(to_integer(unsigned(waddr))) <= wdata;
            end if;
        end if;
    end process;

    -- Asynchronous Dual Read
    rdata1 <= (others => '0') when unsigned(raddr1) = 0 else registers(to_integer(unsigned(raddr1)));
    rdata2 <= (others => '0') when unsigned(raddr2) = 0 else registers(to_integer(unsigned(raddr2)));
end RTL;
