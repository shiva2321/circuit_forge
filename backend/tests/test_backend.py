import pytest
import os
import gc
from backend.app.engine.simulator import Simulator
from backend.app.engine.ast_parser import VHDLParser
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph
from backend.app.knowledge_graph.hf_ingester import DatasetIngester
from backend.app.knowledge_graph.updater import AutonomousGraphUpdater
from backend.app.agent.tools import CircuitTools

TEST_DB = "data/test_circuit_kg.db"

@pytest.fixture
def clean_test_kg():
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass
    kg = CircuitKnowledgeGraph(db_path=TEST_DB)
    yield kg
    del kg
    gc.collect()
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass

def test_simulator_full_adder():
    sim = Simulator()
    sim.add_net('A')
    sim.add_net('B')
    sim.add_net('Cin')
    sim.add_net('Sum')
    sim.add_net('Cout')
    sim.add_net('s1')
    sim.add_net('c1')
    sim.add_net('c2')

    sim.add_gate('xor1', 'XOR', ['A', 'B'], 's1')
    sim.add_gate('xor2', 'XOR', ['s1', 'Cin'], 'Sum')
    sim.add_gate('and1', 'AND', ['A', 'B'], 'c1')
    sim.add_gate('and2', 'AND', ['Cin', 's1'], 'c2')
    sim.add_gate('or1', 'OR', ['c1', 'c2'], 'Cout')

    sim.schedule_stimulus(10, 'A', '1')
    sim.schedule_stimulus(10, 'B', '0')
    sim.schedule_stimulus(10, 'Cin', '1')
    sim.add_assertion(15, 'Sum', '0')
    sim.add_assertion(15, 'Cout', '1')

    summary = sim.run(20)
    assert summary['assertions']['all_passed'] is True

def test_vhdl_parser():
    vhdl = """
    library IEEE;
    use IEEE.STD_LOGIC_1164.ALL;

    entity test_adder is
        port (
            a   : in  std_logic;
            b   : in  std_logic;
            sum : out std_logic
        );
    end test_adder;

    architecture rtl of test_adder is
    begin
        sum <= a xor b;
    end rtl;
    """
    res = VHDLParser.parse_code(vhdl)
    assert res.is_valid is True
    assert len(res.entities) == 1
    assert res.entities[0].name.lower() == "test_adder"
    assert len(res.entities[0].ports) == 3

def test_knowledge_graph_and_ingester(clean_test_kg):
    kg = clean_test_kg
    ingester = DatasetIngester(kg)
    count = ingester.populate_core_ontology()
    assert count > 10
    assert kg.graph.number_of_nodes() >= count

    scale1 = kg.search(scale=1)
    assert len(scale1) > 0

    updater = AutonomousGraphUpdater(kg)
    tools = CircuitTools(kg, updater)

    hf_res = tools.ingest_huggingface("test/eda_benchmarks", max_samples=4)
    assert hf_res["nodes_ingested"] > 0
    assert kg.graph.number_of_nodes() > count

    sim_res = tools.run_simulation("full_adder", 50)
    assert sim_res["summary"]["assertions"]["passed"] > 0

    export_data = kg.export_graph_json()
    assert len(export_data["nodes"]) > 0
    assert len(export_data["links"]) > 0
