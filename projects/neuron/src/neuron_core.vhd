library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity neuron_core is
    Port (
        clk            : in  STD_LOGIC;
        rst            : in  STD_LOGIC;
        valid_in       : in  STD_LOGIC;
        stimulus_in    : in  STD_LOGIC_VECTOR(7 downto 0); -- Signed 8-bit electrical input
        weight_in      : in  STD_LOGIC_VECTOR(7 downto 0); -- Signed 8-bit synaptic weight
        bias_in        : in  STD_LOGIC_VECTOR(7 downto 0); -- Signed 8-bit threshold bias
        activation_out : out STD_LOGIC_VECTOR(7 downto 0); -- 8-bit rectified linear activation (ReLU)
        mac_raw_out    : out STD_LOGIC_VECTOR(15 downto 0);-- 16-bit signed raw MAC value
        valid_out      : out STD_LOGIC
    );
end neuron_core;

architecture rtl of neuron_core is
    signal prod_reg : signed(15 downto 0) := (others => '0');
    signal sum_reg  : signed(16 downto 0) := (others => '0');
    signal v_pipe1  : STD_LOGIC := '0';
    signal v_pipe2  : STD_LOGIC := '0';
begin
    process(clk, rst)
    begin
        if rst = '1' then
            prod_reg <= (others => '0');
            sum_reg  <= (others => '0');
            v_pipe1  <= '0';
            v_pipe2  <= '0';
        elsif rising_edge(clk) then
            v_pipe1 <= valid_in;
            v_pipe2 <= v_pipe1;

            -- Stage 1: Synaptic product multiplication
            if valid_in = '1' then
                prod_reg <= signed(stimulus_in) * signed(weight_in);
            end if;

            -- Stage 2: Bias accumulation + threshold
            if v_pipe1 = '1' then
                sum_reg <= resize(prod_reg, 17) + resize(signed(bias_in), 17);
            end if;
        end if;
    end process;

    -- Non-Linear Activation Function: Rectified Linear Unit (ReLU) with saturation clamp
    process(sum_reg)
    begin
        if sum_reg <= 0 then
            activation_out <= (others => '0'); -- Negative inhibition clamped to zero
        elsif sum_reg > 127 then
            activation_out <= "01111111";      -- Positive saturation clamp at +127
        else
            activation_out <= std_logic_vector(sum_reg(7 downto 0));
        end if;
    end process;

    mac_raw_out <= std_logic_vector(sum_reg(15 downto 0));
    valid_out   <= v_pipe2;
end rtl;
