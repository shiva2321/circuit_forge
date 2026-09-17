library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity bitstream_rx is
    Port (
        clk             : in  STD_LOGIC;
        rst             : in  STD_LOGIC;
        bitstream_in    : in  STD_LOGIC;
        bitstream_valid : in  STD_LOGIC;
        bitstream_ack   : in  STD_LOGIC;
        parallel_data   : out STD_LOGIC_VECTOR(63 downto 0);
        data_ready      : out STD_LOGIC;
        bit_counter_out : out STD_LOGIC_VECTOR(5 downto 0)
    );
end bitstream_rx;

architecture RTL of bitstream_rx is
    signal shift_reg : STD_LOGIC_VECTOR(63 downto 0) := (others => '0');
    signal bit_count : unsigned(5 downto 0) := (others => '0');
    signal ready_reg : STD_LOGIC := '0';
begin
    process(clk, rst)
    begin
        if rst = '1' then
            shift_reg <= (others => '0');
            bit_count <= (others => '0');
            ready_reg <= '0';
        elsif rising_edge(clk) then
            if bitstream_ack = '1' then
                ready_reg <= '0';
            end if;

            if bitstream_valid = '1' then
                shift_reg <= shift_reg(62 downto 0) & bitstream_in;
                if bit_count = 63 then
                    bit_count <= (others => '0');
                    ready_reg <= '1';
                else
                    bit_count <= bit_count + 1;
                end if;
            end if;
        end if;
    end process;

    parallel_data   <= shift_reg;
    data_ready      <= ready_reg;
    bit_counter_out <= std_logic_vector(bit_count);
end RTL;
