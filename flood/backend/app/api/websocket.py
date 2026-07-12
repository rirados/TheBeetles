"""WebSocket endpoints."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services import ws_manager

router = APIRouter(tags=["ws"])


@router.websocket("/ws/{channel}")
async def websocket_endpoint(ws: WebSocket, channel: str):
    """Unified WebSocket endpoint.

    channel: 'admin' or 'citizen'. Admins receive all events; citizens receive
    only alert_new / alert_cleared / vehicle_arrived / report_ack / status_update.
    """
    if channel not in ("admin", "citizen"):
        await ws.close(code=4400)
        return
    await ws_manager.connect(ws, channel)
    try:
        while True:
            # We don't expect inbound messages, but we read to detect disconnects.
            data = await ws.receive_text()
            # Echo back a heartbeat ack if client sends ping
            if data == "ping":
                await ws.send_json({"event": "pong"})
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws, channel)
    except Exception:
        await ws_manager.disconnect(ws, channel)
