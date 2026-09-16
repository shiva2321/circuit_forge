"""
CircuitForge Autonomous Knowledge Graph Updation Engine
Listens to agent events, simulation runs, and verification results.
Autonomously generates, links, and evolves the Circuit Knowledge Graph in real time.
"""

import time
from typing import Dict, List, Any, Optional, Callable
from backend.app.knowledge_graph.core import CircuitKnowledgeGraph

class AutonomousGraphUpdater:
    def __init__(self, kg: CircuitKnowledgeGraph, event_emitter: Optional[Callable[[str, Dict[str, Any]], None]] = None):
        self.kg = kg
        self.emit = event_emitter or (lambda event, payload: None)

    def on_circuit_designed(self, name: str, scale: int, vhdl_code: str, entity_info: Dict[str, Any]) -> Dict[str, Any]:
        """Triggered when an agent designs or modifies a circuit."""
        node_id = f"design:{name.lower()}"
        description = f"Autonomous agent circuit design: {name} (Scale {scale})."
        ports = entity_info.get("ports", [])
        port_names = [p.get("name") if isinstance(p, dict) else str(p) for p in ports]

        node = self.kg.add_node(
            node_id=node_id,
            name=f"{name} (Agent Design)",
            scale=scale,
            category="Agent_Design",
            description=description,
            vhdl_code=vhdl_code,
            design_rules=[f"Ports: {', '.join(port_names)}"],
            tags=["agent_generated", f"scale_{scale}", name.lower()],
            source="autonomous_agent",
            metrics={"ports_count": len(ports), "scale": scale}
        )

        # Autonomous relation extraction
        if scale == 1:
            self.kg.add_edge(node_id, "primitive:nand2", "IMPLEMENTS")
        elif scale == 2:
            self.kg.add_edge(node_id, "module:full_adder", "RELATES_TO")
        elif scale == 3:
            self.kg.add_edge(node_id, "subsystem:alu_32bit", "RELATES_TO")
        elif scale >= 4:
            self.kg.add_edge(node_id, "system:riscv_rv32i_5stage", "PART_OF")

        self.emit("kg_node_added", {"node": node, "action": "design_registered"})
        return node

    def on_simulation_completed(self, circuit_name: str, sim_summary: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Updates knowledge graph with empirical cycle & timing metrics."""
        node_id = f"design:{circuit_name.lower()}"
        node_data = self.kg.get_node(node_id)
        if not node_data:
            return None

        metrics = node_data.get("metrics", {})
        metrics.update({
            "sim_time_ns": sim_summary.get("total_time_ns", 0),
            "assertions_passed": sim_summary.get("assertions", {}).get("passed", 0),
            "assertions_total": sim_summary.get("assertions", {}).get("total", 0),
            "net_count": sim_summary.get("net_count", 0),
            "component_count": sim_summary.get("component_count", 0),
            "verified": sim_summary.get("assertions", {}).get("all_passed", False),
            "last_simulated_at": time.time(),
        })

        updated = self.kg.add_node(
            node_id=node_id,
            name=node_data["name"],
            scale=node_data["scale"],
            category=node_data["category"],
            description=node_data["description"],
            vhdl_code=node_data["vhdl_code"],
            design_rules=node_data["design_rules"],
            tags=node_data["tags"],
            source=node_data["source"],
            metrics=metrics
        )

        self.emit("kg_node_updated", {"node_id": node_id, "metrics": metrics})
        return updated

    def on_verification_failure(self, circuit_name: str, failed_assertion: Dict[str, Any]) -> str:
        """Autonomously links design to relevant Failure Mode node."""
        node_id = f"design:{circuit_name.lower()}"
        # Determine likely failure mode
        target_failure = "eda:metastability" if "clk" in str(failed_assertion) else "eda:inferred_latch_prevention"
        self.kg.add_edge(node_id, target_failure, "VULNERABLE_TO", properties={"failure_details": str(failed_assertion)})
        self.emit("kg_edge_added", {"source": node_id, "target": target_failure, "relation": "VULNERABLE_TO"})
        return target_failure

    def on_agent_reflection(self, insight: str, scale: int, related_concept_id: Optional[str] = None) -> Dict[str, Any]:
        """Allows agent to persist learned hardware insights into the graph."""
        insight_id = f"insight:{int(time.time() * 1000)}"
        node = self.kg.add_node(
            node_id=insight_id,
            name=f"Learned Pattern #{insight_id[-4:]}",
            scale=scale,
            category="Agent_Reflection",
            description=insight,
            tags=["agent_learning", "empirical_insight"],
            source="autonomous_reflection"
        )
        if related_concept_id and related_concept_id in self.kg.graph:
            self.kg.add_edge(insight_id, related_concept_id, "ENHANCES")

        self.emit("kg_node_added", {"node": node, "action": "agent_learned_insight"})
        return node
