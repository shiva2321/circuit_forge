library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity task_pipelined_mac_un_mu5vfy7w is
    Port (
        clk             : in  STD_LOGIC;
        rst             : in  STD_LOGIC;
        -- Bitstream Serial Input Interface
        bitstream_in    : in  STD_LOGIC;
        bitstream_valid : in  STD_LOGIC;
        bitstream_ack   : out STD_LOGIC;
        -- Instruction Input
        instruction     : in  STD_LOGIC_VECTOR(31 downto 0);
        -- Memory Interface
        mem_we          : out STD_LOGIC;
        mem_re          : out STD_LOGIC;
        mem_ready       : out STD_LOGIC;
        mem_addr_out    : out STD_LOGIC_VECTOR(63 downto 0);
        mem_data_out    : out STD_LOGIC_VECTOR(63 downto 0);
        -- Diagnostic Execution Probes
        alu_result_out  : out STD_LOGIC_VECTOR(63 downto 0);
        zero_flag_out   : out STD_LOGIC
    );
end task_pipelined_mac_un_mu5vfy7w;

architecture Structural of task_pipelined_mac_un_mu5vfy7w is
    -- Internal Interconnect Signals
    signal s_reg_write       : STD_LOGIC;
    signal s_mem_read        : STD_LOGIC;
    signal s_mem_write       : STD_LOGIC;
    signal s_alu_src         : STD_LOGIC;
    signal s_wb_sel          : STD_LOGIC_VECTOR(1 downto 0);
    signal s_alu_op          : STD_LOGIC_VECTOR(3 downto 0);
    signal s_bitstream_ack   : STD_LOGIC;

    signal s_rdata1          : STD_LOGIC_VECTOR(63 downto 0);
    signal s_rdata2          : STD_LOGIC_VECTOR(63 downto 0);
    signal s_wdata           : STD_LOGIC_VECTOR(63 downto 0);
    signal s_alu_b           : STD_LOGIC_VECTOR(63 downto 0);
    signal s_alu_res         : STD_LOGIC_VECTOR(63 downto 0);
    signal s_zero            : STD_LOGIC;
    signal s_carry           : STD_LOGIC;
    signal s_overflow        : STD_LOGIC;

    signal s_mem_rdata       : STD_LOGIC_VECTOR(63 downto 0);
    signal s_bitstream_data  : STD_LOGIC_VECTOR(63 downto 0);
    signal s_bitstream_ready : STD_LOGIC;
    signal s_imm_ext         : STD_LOGIC_VECTOR(63 downto 0);
begin
    -- Immediate sign extension for I/S instructions
    s_imm_ext <= (63 downto 12 => instruction(31)) & instruction(31 downto 20);

    -- ALU Operand B Multiplexer
    s_alu_b <= s_imm_ext when s_alu_src = '1' else s_rdata2;

    -- Writeback Multiplexer
    with s_wb_sel select
        s_wdata <= s_alu_res         when "00",
                   s_mem_rdata       when "01",
                   s_bitstream_data  when "10",
                   s_alu_res         when others;

    -- 1. Control Unit Instance
    u_control: entity work.control_unit
        port map (
            opcode          => instruction(6 downto 0),
            funct3          => instruction(14 downto 12),
            bitstream_ready => s_bitstream_ready,
            reg_write       => s_reg_write,
            mem_read        => s_mem_read,
            mem_write       => s_mem_write,
            alu_src         => s_alu_src,
            wb_sel          => s_wb_sel,
            alu_op          => s_alu_op,
            bitstream_ack   => s_bitstream_ack
        );

    -- 2. 64-bit Register File Instance
    u_regfile: entity work.register_file_64bit
        port map (
            clk    => clk,
            rst    => rst,
            we     => s_reg_write,
            waddr  => instruction(11 downto 7),
            wdata  => s_wdata,
            raddr1 => instruction(19 downto 15),
            raddr2 => instruction(24 downto 20),
            rdata1 => s_rdata1,
            rdata2 => s_rdata2
        );

    -- 3. 64-bit Arithmetic Logic Unit Instance
    u_alu: entity work.alu_64bit
        port map (
            a         => s_rdata1,
            b         => s_alu_b,
            alu_op    => s_alu_op,
            result    => s_alu_res,
            zero      => s_zero,
            carry_out => s_carry,
            overflow  => s_overflow
        );

    -- 4. Memory Controller Instance
    u_mem: entity work.memory_controller
        port map (
            clk        => clk,
            rst        => rst,
            mem_read   => s_mem_read,
            mem_write  => s_mem_write,
            addr       => s_alu_res,
            wdata      => s_rdata2,
            rdata      => s_mem_rdata,
            mem_we_out => mem_we,
            mem_re_out => mem_re,
            ready      => mem_ready
        );

    -- 5. Serial Bitstream Receiver Instance
    u_bitstream: entity work.bitstream_rx
        port map (
            clk             => clk,
            rst             => rst,
            bitstream_in    => bitstream_in,
            bitstream_valid => bitstream_valid,
            bitstream_ack   => s_bitstream_ack,
            parallel_data   => s_bitstream_data,
            data_ready      => s_bitstream_ready,
            bit_counter_out => open
        );

    -- Diagnostic Port Assignments
    bitstream_ack  <= s_bitstream_ack;
    mem_addr_out   <= s_alu_res;
    mem_data_out   <= s_rdata2;
    alu_result_out <= s_alu_res;
    zero_flag_out  <= s_zero;
end Structural;
