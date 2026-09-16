`timescale 1ns / 1ps
module uart_tx_tb;
    reg clk = 0; reg rst_n = 0; reg start = 0;
    reg [7:0] data = 8'h55; wire tx; wire busy;
    always #5 clk = ~clk;
    uart_tx uut (.clk(clk), .rst_n(rst_n), .data_in(data), .start(start), .tx(tx), .busy(busy));
    initial begin #20 rst_n = 1; #20 start = 1; #10 start = 0; #200 $finish; end
endmodule
