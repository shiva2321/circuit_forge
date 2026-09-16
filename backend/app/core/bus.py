"""
CircuitForge Event Bus
Lightweight pub/sub and WebSocket broadcast system for agent telemetry,
simulation events, and knowledge graph mutations.
"""

import asyncio
from typing import Set, Dict, Any, Callable
from fastapi import WebSocket

class EventBus:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.listeners: Dict[str, list] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        dead_connections = set()
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except Exception:
                dead_connections.add(conn)
        for conn in dead_connections:
            self.active_connections.discard(conn)

    def subscribe(self, event_type: str, callback: Callable):
        if event_type not in self.listeners:
            self.listeners[event_type] = []
        self.listeners[event_type].append(callback)

    def emit_sync(self, event_type: str, payload: Dict[str, Any]):
        """Synchronous emit for non-async callbacks or queuing."""
        if event_type in self.listeners:
            for cb in self.listeners[event_type]:
                try:
                    cb(payload)
                except Exception as e:
                    print(f"Error in listener for {event_type}: {e}")

global_bus = EventBus()
