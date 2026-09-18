`timescale 1ns / 1ps
module uart_tx #(
    parameter CLK_FREQ = 100_000_000,
    parameter BAUD = 115200
)(
    input wire clk, input wire rst_n,
    input wire [7:0] data_in, input wire start,
    output reg tx, output reg busy
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin tx <= 1'b1; busy <= 1'b0; end
        else if (start && !busy) begin busy <= 1'b1; tx <= 1'b0; end
    end
endmodule
