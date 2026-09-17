library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity alu_64bit is
    Port (
        a          : in  STD_LOGIC_VECTOR(63 downto 0);
        b          : in  STD_LOGIC_VECTOR(63 downto 0);
        alu_op     : in  STD_LOGIC_VECTOR(3 downto 0);
        result     : out STD_LOGIC_VECTOR(63 downto 0);
        zero       : out STD_LOGIC;
        carry_out  : out STD_LOGIC;
        overflow   : out STD_LOGIC
    );
end alu_64bit;

architecture Behavioral of alu_64bit is
    signal res_internal : unsigned(64 downto 0) := (others => '0');
    signal u_a, u_b     : unsigned(64 downto 0);
begin
    u_a <= unsigned('0' & a);
    u_b <= unsigned('0' & b);

    process(a, b, alu_op, u_a, u_b, res_internal)
    begin
        case alu_op is
            when "0000" => -- ADD
                res_internal <= u_a + u_b;
            when "0001" => -- SUB
                res_internal <= u_a - u_b;
            when "0010" => -- AND
                res_internal <= unsigned('0' & (a and b));
            when "0011" => -- OR
                res_internal <= unsigned('0' & (a or b));
            when "0100" => -- XOR
                res_internal <= unsigned('0' & (a xor b));
            when "0101" => -- SHIFT LEFT LOGICAL (1 bit)
                res_internal <= unsigned('0' & a(62 downto 0) & '0');
            when "0110" => -- SHIFT RIGHT LOGICAL (1 bit)
                res_internal <= unsigned('0' & '0' & a(63 downto 1));
            when "0111" => -- SET LESS THAN (SLT)
                if signed(a) < signed(b) then
                    res_internal <= to_unsigned(1, 65);
                else
                    res_internal <= (others => '0');
                end if;
            when others =>
                res_internal <= unsigned('0' & a);
        end case;
    end process;

    result     <= std_logic_vector(res_internal(63 downto 0));
    carry_out  <= res_internal(64);
    zero       <= '1' when res_internal(63 downto 0) = 0 else '0';
    overflow   <= (a(63) xor res_internal(63)) and not (a(63) xor b(63)) when alu_op = "0000" else '0';
end Behavioral;
