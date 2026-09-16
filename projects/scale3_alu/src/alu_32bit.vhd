library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity alu_32bit is
    Port (
        A          : in  STD_LOGIC_VECTOR(31 downto 0);
        B          : in  STD_LOGIC_VECTOR(31 downto 0);
        ALUControl : in  STD_LOGIC_VECTOR(3 downto 0);
        Result     : out STD_LOGIC_VECTOR(31 downto 0);
        Zero       : out STD_LOGIC
    );
end alu_32bit;

architecture Behavioral of alu_32bit is
    signal r_res : STD_LOGIC_VECTOR(31 downto 0);
begin
    process(A, B, ALUControl) begin
        case ALUControl is
            when "0000" => r_res <= std_logic_vector(unsigned(A) + unsigned(B));
            when "0001" => r_res <= std_logic_vector(unsigned(A) - unsigned(B));
            when "0010" => r_res <= A and B;
            when "0011" => r_res <= A or B;
            when others => r_res <= A xor B;
        end case;
    end process;
    Result <= r_res;
    Zero <= '1' if r_res = x"00000000" else '0';
end Behavioral;
