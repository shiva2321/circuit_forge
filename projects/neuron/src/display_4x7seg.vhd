library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity display_4x7seg is
    Port (
        clk        : in  STD_LOGIC;                      -- Main system clock
        rst        : in  STD_LOGIC;                      -- Active-high reset
        value_in   : in  STD_LOGIC_VECTOR(15 downto 0);  -- 16-bit hex/BCD value (4 digits)
        dots_in    : in  STD_LOGIC_VECTOR(3 downto 0);   -- Decimal points for digits 3..0
        blank_in   : in  STD_LOGIC;                      -- Display blanking control
        anode_out  : out STD_LOGIC_VECTOR(3 downto 0);   -- Active-low digit anodes (AN3..AN0)
        seg_out    : out STD_LOGIC_VECTOR(6 downto 0);   -- Active-low cathodes (a,b,c,d,e,f,g)
        dp_out     : out STD_LOGIC                       -- Active-low decimal point
    );
end display_4x7seg;

architecture rtl of display_4x7seg is
    -- Clock divider to generate ~1 kHz digit multiplexing refresh rate
    signal clk_div     : unsigned(15 downto 0) := (others => '0');
    signal digit_sel   : unsigned(1 downto 0) := "00";
    signal cur_nibble  : std_logic_vector(3 downto 0);
    signal cur_dp      : std_logic;
    signal decoded_seg : std_logic_vector(6 downto 0);
begin
    -- Digit Multiplexing Clock Prescaler
    process(clk, rst)
    begin
        if rst = '1' then
            clk_div   <= (others => '0');
            digit_sel <= "00";
        elsif rising_edge(clk) then
            clk_div <= clk_div + 1;
            if clk_div = 0 then
                digit_sel <= digit_sel + 1;
            end if;
        end if;
    end process;

    -- 4-to-1 Nibble Multiplexer
    process(digit_sel, value_in, dots_in)
    begin
        case digit_sel is
            when "00" =>
                cur_nibble <= value_in(3 downto 0);
                cur_dp     <= dots_in(0);
                anode_out  <= "1110"; -- Digit 0 active
            when "01" =>
                cur_nibble <= value_in(7 downto 4);
                cur_dp     <= dots_in(1);
                anode_out  <= "1101"; -- Digit 1 active
            when "10" =>
                cur_nibble <= value_in(11 downto 8);
                cur_dp     <= dots_in(2);
                anode_out  <= "1011"; -- Digit 2 active
            when "11" =>
                cur_nibble <= value_in(15 downto 12);
                cur_dp     <= dots_in(3);
                anode_out  <= "0111"; -- Digit 3 active
            when others =>
                cur_nibble <= "0000";
                cur_dp     <= '0';
                anode_out  <= "1111";
        end case;
    end process;

    -- Hexadecimal to 7-Segment Cathode Decoder (Active-Low: '0' = Lit)
    -- Mapping: seg_out(6 downto 0) = g, f, e, d, c, b, a
    process(cur_nibble, blank_in)
    begin
        if blank_in = '1' then
            decoded_seg <= "1111111"; -- All segments blanked
        else
            case cur_nibble is
                when "0000" => decoded_seg <= "1000000"; -- '0'
                when "0001" => decoded_seg <= "1111001"; -- '1'
                when "0010" => decoded_seg <= "0100100"; -- '2'
                when "0011" => decoded_seg <= "0110000"; -- '3'
                when "0100" => decoded_seg <= "0011001"; -- '4'
                when "0101" => decoded_seg <= "0010010"; -- '5'
                when "0110" => decoded_seg <= "0000010"; -- '6'
                when "0111" => decoded_seg <= "1111000"; -- '7'
                when "1000" => decoded_seg <= "0000000"; -- '8'
                when "1001" => decoded_seg <= "0010000"; -- '9'
                when "1010" => decoded_seg <= "0001000"; -- 'A'
                when "1011" => decoded_seg <= "0000011"; -- 'b'
                when "1100" => decoded_seg <= "1000110"; -- 'C'
                when "1101" => decoded_seg <= "0100001"; -- 'd'
                when "1110" => decoded_seg <= "0000110"; -- 'E'
                when "1111" => decoded_seg <= "0001110"; -- 'F'
                when others => decoded_seg <= "1111111";
            end case;
        end if;
    end process;

    seg_out <= decoded_seg;
    dp_out  <= not cur_dp; -- Active-low decimal point
end rtl;
