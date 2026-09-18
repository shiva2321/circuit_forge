library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity neuron_layer_32 is
    Port (
        clk               : in  STD_LOGIC;
        rst               : in  STD_LOGIC;
        valid_in          : in  STD_LOGIC;
        stimulus_in       : in  STD_LOGIC_VECTOR(7 downto 0);  -- Shared electrical stimulus bus
        cascade_in        : in  STD_LOGIC_VECTOR(15 downto 0); -- Inter-layer daisy-chain expansion provision
        layer_sum_out     : out STD_LOGIC_VECTOR(15 downto 0); -- Aggregate neural layer activation score
        winning_neuron_id : out STD_LOGIC_VECTOR(4 downto 0);  -- Index (0-31) of max active neuron
        cascade_out       : out STD_LOGIC_VECTOR(15 downto 0); -- Provision for downstream neural array chaining
        valid_out         : out STD_LOGIC
    );
end neuron_layer_32;

architecture structural of neuron_layer_32 is
    component neuron_core is
        Port (
            clk            : in  STD_LOGIC;
            rst            : in  STD_LOGIC;
            valid_in       : in  STD_LOGIC;
            stimulus_in    : in  STD_LOGIC_VECTOR(7 downto 0);
            weight_in      : in  STD_LOGIC_VECTOR(7 downto 0);
            bias_in        : in  STD_LOGIC_VECTOR(7 downto 0);
            activation_out : out STD_LOGIC_VECTOR(7 downto 0);
            mac_raw_out    : out STD_LOGIC_VECTOR(15 downto 0);
            valid_out      : out STD_LOGIC
        );
    end component;

    type act_array_t is array (0 to 31) of STD_LOGIC_VECTOR(7 downto 0);
    signal act_array  : act_array_t;
    signal core_valid : STD_LOGIC_VECTOR(31 downto 0);

    type weight_lut_t is array (0 to 31) of signed(7 downto 0);
    -- Diverse synaptic weights covering harmonic, linear, and receptive-field patterns
    constant WEIGHT_LUT : weight_lut_t := (
        to_signed(1, 8),   to_signed(2, 8),   to_signed(3, 8),   to_signed(4, 8),
        to_signed(5, 8),   to_signed(6, 8),   to_signed(7, 8),   to_signed(8, 8),
        to_signed(-1, 8),  to_signed(-2, 8),  to_signed(-3, 8),  to_signed(-4, 8),
        to_signed(10, 8),  to_signed(12, 8),  to_signed(15, 8),  to_signed(20, 8),
        to_signed(-5, 8),  to_signed(-8, 8),  to_signed(-10, 8), to_signed(-12, 8),
        to_signed(14, 8),  to_signed(18, 8),  to_signed(22, 8),  to_signed(25, 8),
        to_signed(2, 8),   to_signed(4, 8),   to_signed(6, 8),   to_signed(8, 8),
        to_signed(11, 8),  to_signed(13, 8),  to_signed(17, 8),  to_signed(19, 8)
    );

    type bias_lut_t is array (0 to 31) of signed(7 downto 0);
    constant BIAS_LUT : bias_lut_t := (
        to_signed(0, 8),  to_signed(2, 8),  to_signed(-2, 8), to_signed(4, 8),
        to_signed(-4, 8), to_signed(1, 8),  to_signed(3, 8),  to_signed(-1, 8),
        to_signed(0, 8),  to_signed(5, 8),  to_signed(-3, 8), to_signed(2, 8),
        to_signed(-2, 8), to_signed(6, 8),  to_signed(-5, 8), to_signed(0, 8),
        to_signed(1, 8),  to_signed(-1, 8), to_signed(4, 8),  to_signed(-4, 8),
        to_signed(2, 8),  to_signed(0, 8),  to_signed(-2, 8), to_signed(3, 8),
        to_signed(-3, 8), to_signed(5, 8),  to_signed(-1, 8), to_signed(0, 8),
        to_signed(2, 8),  to_signed(-2, 8), to_signed(4, 8),  to_signed(-4, 8)
    );

    signal accum_sum : unsigned(15 downto 0) := (others => '0');
    signal max_id    : unsigned(4 downto 0) := (others => '0');
    signal v_out_reg : STD_LOGIC := '0';
begin
    -- Parallel 32-Neuron Array Generation
    gen_neurons: for i in 0 to 31 generate
        u_neuron: neuron_core
            port map (
                clk            => clk,
                rst            => rst,
                valid_in       => valid_in,
                stimulus_in    => stimulus_in,
                weight_in      => std_logic_vector(WEIGHT_LUT(i)),
                bias_in        => std_logic_vector(BIAS_LUT(i)),
                activation_out => act_array(i),
                mac_raw_out    => open,
                valid_out      => core_valid(i)
            );
    end generate;

    -- Reduction Pipeline: Parallel Activation Accumulator + Winner-Take-All Index
    process(clk, rst)
        variable v_sum : unsigned(15 downto 0);
        variable v_max : unsigned(7 downto 0);
        variable v_id  : unsigned(4 downto 0);
    begin
        if rst = '1' then
            accum_sum <= (others => '0');
            max_id    <= (others => '0');
            v_out_reg <= '0';
        elsif rising_edge(clk) then
            v_out_reg <= core_valid(0);
            if core_valid(0) = '1' then
                v_sum := unsigned(cascade_in); -- Incorporate expansion cascade from previous array
                v_max := (others => '0');
                v_id  := (others => '0');

                for i in 0 to 31 loop
                    v_sum := v_sum + unsigned(act_array(i));
                    if unsigned(act_array(i)) > v_max then
                        v_max := unsigned(act_array(i));
                        v_id  := to_unsigned(i, 5);
                    end if;
                end loop;

                accum_sum <= v_sum;
                max_id    <= v_id;
            end if;
        end if;
    end process;

    layer_sum_out     <= std_logic_vector(accum_sum);
    winning_neuron_id <= std_logic_vector(max_id);
    cascade_out       <= std_logic_vector(accum_sum); -- Forwarded for inter-cluster chaining
    valid_out         <= v_out_reg;
end structural;
