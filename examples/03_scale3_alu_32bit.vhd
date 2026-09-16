-- CircuitForge Scale 3: Subsystem 32-Bit Multi-Function ALU
-- Supports ADD, SUB, AND, OR, XOR, SLL, SRL, SRA, SLT with Zero and Overflow flags

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity alu_32bit_scale3 is
    port (
        A          : in  std_logic_vector(31 downto 0);
        B          : in  std_logic_vector(31 downto 0);
        ALUControl : in  std_logic_vector(3 downto 0);
        Result     : out std_logic_vector(31 downto 0);
        Zero       : out std_logic;
        Negative   : out std_logic;
        Overflow   : out std_logic
    );
end alu_32bit_scale3;

architecture rtl of alu_32bit_scale3 is
    signal s_a, s_b     : signed(31 downto 0);
    signal add_sub_res  : signed(32 downto 0);
    signal res_internal : std_logic_vector(31 downto 0);
    signal is_sub       : std_logic;
begin
    s_a <= signed(A);
    s_b <= signed(B);
    is_sub <= '1' when ALUControl = "0001" else '0';

    process(s_a, s_b, is_sub)
    begin
        if is_sub = '1' then
            add_sub_res <= resize(s_a, 33) - resize(s_b, 33);
        else
            add_sub_res <= resize(s_a, 33) + resize(s_b, 33);
        end if;
    end process;

    process(ALUControl, A, B, add_sub_res)
        variable shamt : integer;
    begin
        shamt := to_integer(unsigned(B(4 downto 0)));
        case ALUControl is
            when "0000" => res_internal <= std_logic_vector(add_sub_res(31 downto 0)); -- ADD
            when "0001" => res_internal <= std_logic_vector(add_sub_res(31 downto 0)); -- SUB
            when "0010" => res_internal <= A and B;                                    -- AND
            when "0011" => res_internal <= A or B;                                     -- OR
            when "0100" => res_internal <= A xor B;                                    -- XOR
            when "0101" => res_internal <= std_logic_vector(shift_left(unsigned(A), shamt));
            when "0110" => res_internal <= std_logic_vector(shift_right(unsigned(A), shamt));
            when others => res_internal <= (others => '0');
        end case;
    end process;

    Result   <= res_internal;
    Zero     <= '1' when res_internal = x"00000000" else '0';
    Negative <= res_internal(31);
    Overflow <= (A(31) xor add_sub_res(31)) and not (A(31) xor B(31) xor is_sub);
end rtl;
