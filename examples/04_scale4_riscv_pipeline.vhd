-- CircuitForge Scale 4: High-Level System 32-Bit RISC-V RV32I Processor Top Level
-- Outlines Harvard bus interface, program counter, instruction decode, and memory access

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity riscv_pipeline_core_scale4 is
    port (
        clk         : in  std_logic;
        rst         : in  std_logic;
        -- Instruction Memory Bus
        instr_addr  : out std_logic_vector(31 downto 0);
        instr_rdata : in  std_logic_vector(31 downto 0);
        -- Data Memory Bus
        data_addr   : out std_logic_vector(31 downto 0);
        data_wdata  : out std_logic_vector(31 downto 0);
        data_rdata  : in  std_logic_vector(31 downto 0);
        data_wen    : out std_logic
    );
end riscv_pipeline_core_scale4;

architecture rtl of riscv_pipeline_core_scale4 is
    signal pc_reg : unsigned(31 downto 0);
begin
    process(clk, rst)
    begin
        if rst = '1' then
            pc_reg <= (others => '0');
        elsif rising_edge(clk) then
            pc_reg <= pc_reg + 4;
        end if;
    end process;

    instr_addr <= std_logic_vector(pc_reg);
    data_addr  <= (others => '0');
    data_wdata <= (others => '0');
    data_wen   <= '0';
end rtl;
