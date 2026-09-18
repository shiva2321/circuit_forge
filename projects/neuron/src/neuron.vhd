library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity neural_processor_top is
    Port (
        clk                : in  STD_LOGIC;                      -- System clock (e.g. 50/100 MHz)
        rst                : in  STD_LOGIC;                      -- System synchronous reset
        stimulus_in        : in  STD_LOGIC_VECTOR(7 downto 0);   -- Electric stimulus vector
        stimulus_valid     : in  STD_LOGIC;                      -- Strobe asserting valid electric input
        cascade_in         : in  STD_LOGIC_VECTOR(15 downto 0);  -- Provision for chaining additional neural arrays
        display_mode       : in  STD_LOGIC;                      -- '0' = Layer Activation Sum, '1' = Winner ID + Stimulus
        anode_out          : out STD_LOGIC_VECTOR(3 downto 0);   -- 4-digit display active-low anodes
        seg_out            : out STD_LOGIC_VECTOR(6 downto 0);   -- 7-segment active-low cathodes
        dp_out             : out STD_LOGIC;                      -- Display decimal point
        cascade_out        : out STD_LOGIC_VECTOR(15 downto 0);  -- Provision to cascade to downstream arrays
        layer_active_led   : out STD_LOGIC;                      -- LED indicating neural firing activity
        neuron_status_leds : out STD_LOGIC_VECTOR(7 downto 0)    -- Status LEDs (winning neuron ID + upper sum)
    );
end neural_processor_top;

architecture structural of neural_processor_top is
    component neuron_layer_32 is
        Port (
            clk               : in  STD_LOGIC;
            rst               : in  STD_LOGIC;
            valid_in          : in  STD_LOGIC;
            stimulus_in       : in  STD_LOGIC_VECTOR(7 downto 0);
            cascade_in        : in  STD_LOGIC_VECTOR(15 downto 0);
            layer_sum_out     : out STD_LOGIC_VECTOR(15 downto 0);
            winning_neuron_id : out STD_LOGIC_VECTOR(4 downto 0);
            cascade_out       : out STD_LOGIC_VECTOR(15 downto 0);
            valid_out         : out STD_LOGIC
        );
    end component;

    component display_4x7seg is
        Port (
            clk        : in  STD_LOGIC;
            rst        : in  STD_LOGIC;
            value_in   : in  STD_LOGIC_VECTOR(15 downto 0);
            dots_in    : in  STD_LOGIC_VECTOR(3 downto 0);
            blank_in   : in  STD_LOGIC;
            anode_out  : out STD_LOGIC_VECTOR(3 downto 0);
            seg_out    : out STD_LOGIC_VECTOR(6 downto 0);
            dp_out     : out STD_LOGIC
        );
    end component;

    signal layer_sum   : STD_LOGIC_VECTOR(15 downto 0);
    signal winner_id   : STD_LOGIC_VECTOR(4 downto 0);
    signal layer_valid : STD_LOGIC;
    signal disp_value  : STD_LOGIC_VECTOR(15 downto 0);
    signal disp_dots   : STD_LOGIC_VECTOR(3 downto 0);
begin
    -- 32-Neuron Array Subsystem
    u_neural_array: neuron_layer_32
        port map (
            clk               => clk,
            rst               => rst,
            valid_in          => stimulus_valid,
            stimulus_in       => stimulus_in,
            cascade_in        => cascade_in,
            layer_sum_out     => layer_sum,
            winning_neuron_id => winner_id,
            cascade_out       => cascade_out,
            valid_out         => layer_valid
        );

    -- Display Mode Multiplexer:
    -- Mode 0: Display 16-bit aggregate neural layer sum (HEX: 0000 - FFFF)
    -- Mode 1: Display Winning Neuron ID [15:8] & Injected Stimulus [7:0]
    process(display_mode, layer_sum, winner_id, stimulus_in)
    begin
        if display_mode = '0' then
            disp_value <= layer_sum;
            disp_dots  <= "0010"; -- Dot on digit 1 to indicate aggregate metric
        else
            disp_value <= "000" & winner_id & stimulus_in;
            disp_dots  <= "1001"; -- Dots indicating dual telemetry
        end if;
    end process;

    -- 4-Digit Seven-Segment Display Controller Subsystem
    u_display_ctrl: display_4x7seg
        port map (
            clk        => clk,
            rst        => rst,
            value_in   => disp_value,
            dots_in    => disp_dots,
            blank_in   => '0',
            anode_out  => anode_out,
            seg_out    => seg_out,
            dp_out     => dp_out
        );

    -- Primary Diagnostic Status Signals
    layer_active_led   <= layer_valid;
    neuron_status_leds <= winner_id & layer_sum(15 downto 13);
end structural;
