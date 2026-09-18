library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity task_pipelined_mac_un_mu5vfy7w_tb is
end task_pipelined_mac_un_mu5vfy7w_tb;

architecture sim of task_pipelined_mac_un_mu5vfy7w_tb is
    signal clk             : STD_LOGIC := '0';
    signal rst             : STD_LOGIC := '0';
    signal bitstream_in    : STD_LOGIC := '0';
    signal bitstream_valid : STD_LOGIC := '0';
    signal bitstream_ack   : STD_LOGIC;
    signal instruction     : STD_LOGIC_VECTOR(31 downto 0) := (others => '0');
    signal mem_we          : STD_LOGIC;
    signal mem_re          : STD_LOGIC;
    signal mem_ready       : STD_LOGIC;
    signal mem_addr_out    : STD_LOGIC_VECTOR(63 downto 0);
    signal mem_data_out    : STD_LOGIC_VECTOR(63 downto 0);
    signal alu_result_out  : STD_LOGIC_VECTOR(63 downto 0);
    signal zero_flag_out   : STD_LOGIC;

    constant CLK_PERIOD : time := 10 ns;
begin
    -- 100MHz System Clock
    clk_proc: process
    begin
        clk <= '0'; wait for CLK_PERIOD / 2;
        clk <= '1'; wait for CLK_PERIOD / 2;
    end process;

    -- Device Under Test (DUT)
    uut: entity work.task_pipelined_mac_un_mu5vfy7w
        port map (
            clk             => clk,
            rst             => rst,
            bitstream_in    => bitstream_in,
            bitstream_valid => bitstream_valid,
            bitstream_ack   => bitstream_ack,
            instruction     => instruction,
            mem_we          => mem_we,
            mem_re          => mem_re,
            mem_ready       => mem_ready,
            mem_addr_out    => mem_addr_out,
            mem_data_out    => mem_data_out,
            alu_result_out  => alu_result_out,
            zero_flag_out   => zero_flag_out
        );

    stim_proc: process
        procedure stream_byte(byte_val: in STD_LOGIC_VECTOR(7 downto 0)) is
        begin
            for i in 7 downto 0 loop
                bitstream_in    <= byte_val(i);
                bitstream_valid <= '1';
                wait for CLK_PERIOD;
            end loop;
            bitstream_valid <= '0';
        end procedure;
    begin
        -- 1. Apply System Reset
        rst <= '1';
        wait for 20 ns;
        rst <= '0';
        wait for 10 ns;

        -- 2. Stream 64-bit Test Frame (8 bytes) into Serial Receiver
        stream_byte(x"AA");
        stream_byte(x"55");
        stream_byte(x"01");
        stream_byte(x"02");
        stream_byte(x"03");
        stream_byte(x"04");
        stream_byte(x"42");
        stream_byte(x"FF");
        wait for 20 ns;

        -- 3. Execute Bitstream Ingestion Instruction into Register R1
        -- opcode: 1110011, rd: 00001 (R1)
        instruction <= "00000000000000000000000011110011";
        wait for 20 ns;

        -- 4. Execute 64-bit Memory Store: R1 -> RAM[0x10]
        -- opcode: 0100011, rs1: R1, rs2: R1, imm: 0x10
        instruction <= "00000000000100001000010000100011";
        wait for 30 ns;

        -- 5. Execute 64-bit ADD: R2 = R1 + R1
        -- opcode: 0110011, funct3: 000, rd: R2, rs1: R1, rs2: R1
        instruction <= "00000000000100001000000100110011";
        wait for 30 ns;

        wait;
    end process;
end sim;
