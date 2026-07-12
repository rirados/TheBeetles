"""WebSocket connection manager with channel-based broadcasting."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Set

from fastapi import WebSocket

from app.core.pubsub import pubsub


class WebSocketManager:
    """Manages active WebSocket connections and broadcasts events.

    Supports two channel types:
      * admin    - admin dashboard receives everything
      * citizen  - citizens receive alerts & status updates only
    """

    def __init__(self) -> None:
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, channel: str = "admin") -> None:
        await ws.accept()
        async with self._lock:
            self._connections[channel].add(ws)
        print(f"[WS] +1 connection on '{channel}' (total {len(self._connections[channel])})")
        # Send a welcome envelope
        await ws.send_json({
            "event": "connected",
            "payload": {"channel": channel, "timestamp": datetime.utcnow().isoformat()},
        })

    async def disconnect(self, ws: WebSocket, channel: str = "admin") -> None:
        async with self._lock:
            self._connections[channel].discard(ws)
        print(f"[WS] -1 connection on '{channel}'")

    async def broadcast(self, event: str, payload: Dict[str, Any], channels: List[str] | None = None) -> int:
        """Broadcast an event to one or more channels. Returns recipient count."""
        channels = channels or ["admin", "citizen"]
        envelope = {
            "event": event,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat(),
        }
        message = json.dumps(envelope, default=str)
        delivered = 0
        for channel in channels:
            targets = list(self._connections.get(channel, set()))
            for ws in targets:
                try:
                    await ws.send_text(message)
                    delivered += 1
                except Exception:
                    async with self._lock:
                        self._connections[channel].discard(ws)
        return delivered

    async def send_to(self, ws: WebSocket, event: str, payload: Dict[str, Any]) -> None:
        envelope = {
            "event": event,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat(),
        }
        await ws.send_json(envelope)

    def stats(self) -> Dict[str, int]:
        return {ch: len(conns) for ch, conns in self._connections.items()}


ws_manager = WebSocketManager()


# ---------- Pub/Sub bridge ----------
# When running multi-process, the WebSocket manager would subscribe to Redis
# pub/sub channels here. In single-process mode the bridge is a no-op because
# services call ws_manager.broadcast() directly.

async def _pubsub_callback(message: str) -> None:
    """Forward a pub/sub message to all local WS clients."""
    try:
        envelope = json.loads(message)
        await ws_manager.broadcast(
            envelope.get("event", "message"),
            envelope.get("payload", {}),
        )
    except Exception as exc:  # pragma: no cover
        print(f"[WSBridge] Failed to forward: {exc}")


def register_pubsub_bridge() -> None:
    """Hook the WS manager into the pub/sub bus."""
    if not pubsub._use_redis:
        pubsub.subscribe("floodguardian:events", _pubsub_callback)
