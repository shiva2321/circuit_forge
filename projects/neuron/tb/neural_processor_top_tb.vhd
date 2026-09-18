library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity neural_processor_top_tb is
end neural_processor_top_tb;

architecture sim of neural_processor_top_tb is
    signal clk                : STD_LOGIC := '0';
    signal rst                : STD_LOGIC := '1';
    signal stimulus_in        : STD_LOGIC_VECTOR(7 downto 0) := (others => '0');
    signal stimulus_valid     : STD_LOGIC := '0';
    signal cascade_in         : STD_LOGIC_VECTOR(15 downto 0) := (others => '0');
    signal display_mode       : STD_LOGIC := '0';
    signal anode_out          : STD_LOGIC_VECTOR(3 downto 0);
    signal seg_out            : STD_LOGIC_VECTOR(6 downto 0);
    signal dp_out             : STD_LOGIC;
    signal cascade_out        : STD_LOGIC_VECTOR(15 downto 0);
    signal layer_active_led   : STD_LOGIC;
    signal neuron_status_leds : STD_LOGIC_VECTOR(7 downto 0);

    constant CLK_PERIOD : time := 10 ns;
begin
    uut: entity work.neural_processor_top
        port map (
            clk                => clk,
            rst                => rst,
            stimulus_in        => stimulus_in,
            stimulus_valid     => stimulus_valid,
            cascade_in         => cascade_in,
            display_mode       => display_mode,
            anode_out          => anode_out,
            seg_out            => seg_out,
            dp_out             => dp_out,
            cascade_out        => cascade_out,
            layer_active_led   => layer_active_led,
            neuron_status_leds => neuron_status_leds
        );

    -- Clock Generator (100 MHz)
    clk_process: process
    begin
        while now < 1000 ns loop
            clk <= '0';
            wait for CLK_PERIOD / 2;
            clk <= '1';
            wait for CLK_PERIOD / 2;
        end loop;
        wait;
    end process;

    -- Stimulus Sequence
    stim_proc: process
    begin
        -- 1. Reset Asserted
        rst <= '1';
        wait for 30 ns;
        rst <= '0';
        wait for 20 ns;

        -- 2. Inject Stimulus Vector 1 (Positive Stimulus = +16)
        stimulus_in    <= std_logic_vector(to_signed(16, 8));
        stimulus_valid <= '1';
        cascade_in     <= (others => '0');
        wait for 40 ns;

        -- 3. Inject Stimulus Vector 2 (Strong Stimulus = +64) with Cascade Offset (+100)
        stimulus_in    <= std_logic_vector(to_signed(64, 8));
        cascade_in     <= std_logic_vector(to_unsigned(100, 16));
        wait for 40 ns;

        -- 4. Switch Display Mode to Winner ID + Stimulus
        display_mode <= '1';
        wait for 40 ns;

        -- 5. Inhibit Stimulus (Negative Stimulus = -32) - ReLU Clamping Test
        stimulus_in  <= std_logic_vector(to_signed(-32, 8));
        display_mode <= '0';
        wait for 60 ns;

        wait;
    end process;
end sim;
