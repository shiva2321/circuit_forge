library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity riscv_core is
    Port (
        clk     : in  STD_LOGIC;
        rst     : in  STD_LOGIC;
        PC      : out STD_LOGIC_VECTOR(31 downto 0);
        Instr   : in  STD_LOGIC_VECTOR(31 downto 0);
        WB_Data : out STD_LOGIC_VECTOR(31 downto 0)
    );
end riscv_core;

architecture Pipeline of riscv_core is
    signal r_pc : unsigned(31 downto 0);
begin
    process(clk, rst) begin
        if rst = '1' then
            r_pc <= (others => '0');
        elsif rising_edge(clk) then
            r_pc <= r_pc + 4;
        end if;
    end process;
    PC <= std_logic_vector(r_pc);
    WB_Data <= x"0000000A";
end Pipeline;
