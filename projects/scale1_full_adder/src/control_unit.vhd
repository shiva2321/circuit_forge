library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity control_unit is
    Port (
        opcode          : in  STD_LOGIC_VECTOR(6 downto 0);
        funct3          : in  STD_LOGIC_VECTOR(2 downto 0);
        bitstream_ready : in  STD_LOGIC;
        reg_write       : out STD_LOGIC;
        mem_read        : out STD_LOGIC;
        mem_write       : out STD_LOGIC;
        alu_src         : out STD_LOGIC;
        wb_sel          : out STD_LOGIC_VECTOR(1 downto 0);
        alu_op          : out STD_LOGIC_VECTOR(3 downto 0);
        bitstream_ack   : out STD_LOGIC
    );
end control_unit;

architecture Behavioral of control_unit is
begin
    process(opcode, funct3, bitstream_ready)
    begin
        -- Default inactive states
        reg_write     <= '0';
        mem_read      <= '0';
        mem_write     <= '0';
        alu_src       <= '0';
        wb_sel        <= "00"; -- 00: ALU, 01: Memory, 10: Bitstream
        alu_op        <= "0000";
        bitstream_ack <= '0';

        case opcode is
            when "0110011" => -- R-Type (64-bit ALU operations)
                reg_write <= '1';
                alu_src   <= '0';
                wb_sel    <= "00";
                case funct3 is
                    when "000" => alu_op <= "0000"; -- ADD
                    when "001" => alu_op <= "0101"; -- SLL
                    when "010" => alu_op <= "0111"; -- SLT
                    when "100" => alu_op <= "0100"; -- XOR
                    when "101" => alu_op <= "0110"; -- SRL
                    when "110" => alu_op <= "0011"; -- OR
                    when "111" => alu_op <= "0010"; -- AND
                    when others => alu_op <= "0000";
                end case;

            when "0000011" => -- I-Type: Memory Load (64-bit)
                reg_write <= '1';
                mem_read  <= '1';
                alu_src   <= '1';
                wb_sel    <= "01";
                alu_op    <= "0000"; -- Address calculation

            when "0100011" => -- S-Type: Memory Store (64-bit)
                mem_write <= '1';
                alu_src   <= '1';
                alu_op    <= "0000"; -- Address calculation

            when "1110011" => -- Custom Bitstream Ingestion Instruction
                if bitstream_ready = '1' then
                    reg_write     <= '1';
                    wb_sel        <= "10"; -- Route bitstream to register
                    bitstream_ack <= '1';
                end if;

            when others =>
                null;
        end case;
    end process;
end Behavioral;
