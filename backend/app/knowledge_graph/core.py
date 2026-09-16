"""
CircuitForge Circuit Knowledge Graph (CKG)
Backed by NetworkX and SQLite for persistent, multi-scale semantic circuit representation.
Supports autonomous updates, graph querying, and visual export.
"""

import sqlite3
import json
import time
import re
from typing import Dict, List, Any, Optional, Set
import networkx as nx

class CircuitKnowledgeGraph:
    def __init__(self, db_path: str = 'data/circuit_knowledge_graph.db'):
        self.db_path = db_path
        self.graph = nx.DiGraph()
        self._init_db()
        self.load_from_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    scale INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    description TEXT,
                    vhdl_code TEXT,
                    design_rules TEXT,
                    tags TEXT,
                    source TEXT,
                    metrics TEXT,
                    created_at REAL,
                    updated_at REAL
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS edges (
                    source_id TEXT,
                    target_id TEXT,
                    relation TEXT NOT NULL,
                    properties TEXT,
                    PRIMARY KEY (source_id, target_id, relation),
                    FOREIGN KEY (source_id) REFERENCES nodes(id),
                    FOREIGN KEY (target_id) REFERENCES nodes(id)
                )
            ''')
            conn.commit()

    def add_node(
        self,
        node_id: str,
        name: str,
        scale: int,
        category: str,
        description: str = '',
        vhdl_code: str = '',
        design_rules: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        source: str = 'base_ontology',
        metrics: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = time.time()
        rules_list = design_rules or []
        tags_list = tags or []
        metrics_dict = metrics or {}

        node_data = {
            'id': node_id,
            'name': name,
            'scale': scale,
            'category': category,
            'description': description,
            'vhdl_code': vhdl_code,
            'design_rules': rules_list,
            'tags': tags_list,
            'source': source,
            'metrics': metrics_dict,
            'created_at': now,
            'updated_at': now,
        }

        # Update in-memory NetworkX graph
        self.graph.add_node(node_id, **node_data)

        # Persist to SQLite
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO nodes (id, name, scale, category, description, vhdl_code, design_rules, tags, source, metrics, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    scale=excluded.scale,
                    category=excluded.category,
                    description=excluded.description,
                    vhdl_code=excluded.vhdl_code,
                    design_rules=excluded.design_rules,
                    tags=excluded.tags,
                    metrics=excluded.metrics,
                    updated_at=excluded.updated_at
            ''', (
                node_id, name, scale, category, description, vhdl_code,
                json.dumps(rules_list), json.dumps(tags_list), source,
                json.dumps(metrics_dict), now, now
            ))
            conn.commit()

        return node_data

    def add_edge(self, source_id: str, target_id: str, relation: str, properties: Optional[Dict[str, Any]] = None):
        props = properties or {}
        self.graph.add_edge(source_id, target_id, relation=relation, **props)

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO edges (source_id, target_id, relation, properties)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
                    properties=excluded.properties
            ''', (source_id, target_id, relation, json.dumps(props)))
            conn.commit()

    def load_from_db(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id, name, scale, category, description, vhdl_code, design_rules, tags, source, metrics, created_at, updated_at FROM nodes')
            for row in cursor.fetchall():
                node_id, name, scale, category, desc, vhdl, rules, tags, source, metrics, c_at, u_at = row
                self.graph.add_node(node_id, **{
                    'id': node_id,
                    'name': name,
                    'scale': scale,
                    'category': category,
                    'description': desc or '',
                    'vhdl_code': vhdl or '',
                    'design_rules': json.loads(rules or '[]'),
                    'tags': json.loads(tags or '[]'),
                    'source': source or 'base_ontology',
                    'metrics': json.loads(metrics or '{}'),
                    'created_at': c_at,
                    'updated_at': u_at,
                })

            cursor.execute('SELECT source_id, target_id, relation, properties FROM edges')
            for row in cursor.fetchall():
                src, tgt, rel, props = row
                self.graph.add_edge(src, tgt, relation=rel, **json.loads(props or '{}'))

    def search(self, query: str = '', scale: Optional[int] = None, category: Optional[str] = None, limit: int = 30) -> List[Dict[str, Any]]:
        query_lower = query.lower().strip()
        tokens = [t for t in re.findall(r'[a-zA-Z0-9]+', query_lower) if len(t) > 1 or t.isdigit()]
        results = []

        for node_id, data in self.graph.nodes(data=True):
            node_scale = data.get('scale')
            if scale is not None and node_scale != scale:
                continue
            if category and data.get('category', '').lower() != category.lower():
                continue

            score = 0
            if not query_lower:
                score = 1
            else:
                name = data.get('name', '').lower()
                desc = data.get('description', '').lower()
                cat = data.get('category', '').lower()
                node_id_lower = node_id.lower()
                tags = [t.lower() for t in data.get('tags', [])]
                rules = [r.lower() for r in data.get('design_rules', [])]

                # Full phrase exact substring
                if query_lower in name:
                    score += 25
                if query_lower in node_id_lower:
                    score += 20
                if query_lower in desc:
                    score += 10
                if any(query_lower in t for t in tags):
                    score += 15

                # Tokenized keyword matching
                for token in tokens:
                    if token in name:
                        score += 8
                    if token in node_id_lower:
                        score += 6
                    if any(token == t or token in t for t in tags):
                        score += 6
                    if token in cat:
                        score += 4
                    if token in desc:
                        score += 2
                    if any(token in r for r in rules):
                        score += 3

            # Baseline concept score if matching scale was explicitly requested
            if score == 0 and scale is not None and node_scale == scale:
                score = 0.5  # Include as contextual domain knowledge

            if score > 0:
                item = dict(data)
                item['search_score'] = score
                item['degree'] = self.graph.degree(node_id)
                results.append(item)

        results.sort(key=lambda x: (x['search_score'], x.get('degree', 0)), reverse=True)
        return results[:limit]

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        if node_id in self.graph:
            data = dict(self.graph.nodes[node_id])
            # Add neighbors and relations
            outgoing = []
            for _, target, edge_data in self.graph.out_edges(node_id, data=True):
                target_node = self.graph.nodes.get(target, {})
                outgoing.append({
                    'target_id': target,
                    'target_name': target_node.get('name', target),
                    'relation': edge_data.get('relation', 'RELATES_TO'),
                    'scale': target_node.get('scale', 0),
                })
            incoming = []
            for src, _, edge_data in self.graph.in_edges(node_id, data=True):
                src_node = self.graph.nodes.get(src, {})
                incoming.append({
                    'source_id': src,
                    'source_name': src_node.get('name', src),
                    'relation': edge_data.get('relation', 'RELATES_TO'),
                    'scale': src_node.get('scale', 0),
                })
            data['outgoing'] = outgoing
            data['incoming'] = incoming
            return data
        return None

    def export_graph_json(self, max_nodes: int = 350) -> Dict[str, Any]:
        """Export node-link representation for D3 / Canvas visualizers."""
        nodes_out = []
        links_out = []
        included_nodes = set()

        # 1. Always prioritize newly ingested Hugging Face nodes so they are never clipped
        hf_nodes = [
            (nid, data) for nid, data in self.graph.nodes(data=True)
            if data.get('source', '').startswith('huggingface:')
        ]
        for node_id, data in hf_nodes:
            included_nodes.add(node_id)
            nodes_out.append({
                'id': node_id,
                'name': data.get('name', node_id),
                'scale': data.get('scale', 1),
                'category': data.get('category', 'Generic'),
                'source': data.get('source', 'base_ontology'),
                'metrics': data.get('metrics', {}),
                'degree': self.graph.degree(node_id),
            })

        # 2. Fill remaining capacity with core ontology nodes sorted by degree
        remaining_slots = max(0, max_nodes - len(included_nodes))
        core_nodes = [
            (nid, data) for nid, data in self.graph.nodes(data=True)
            if nid not in included_nodes
        ]
        core_nodes_sorted = sorted(core_nodes, key=lambda x: self.graph.degree(x[0]), reverse=True)

        for node_id, data in core_nodes_sorted[:remaining_slots]:
            included_nodes.add(node_id)
            nodes_out.append({
                'id': node_id,
                'name': data.get('name', node_id),
                'scale': data.get('scale', 1),
                'category': data.get('category', 'Generic'),
                'source': data.get('source', 'base_ontology'),
                'metrics': data.get('metrics', {}),
                'degree': self.graph.degree(node_id),
            })


        for src, tgt, edge_data in self.graph.edges(data=True):
            if src in included_nodes and tgt in included_nodes:
                links_out.append({
                    'source': src,
                    'target': tgt,
                    'relation': edge_data.get('relation', 'CONNECTS'),
                })

        return {
            'total_nodes': self.graph.number_of_nodes(),
            'total_edges': self.graph.number_of_edges(),
            'nodes': nodes_out,
            'links': links_out,
        }
