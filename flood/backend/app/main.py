"""FastAPI application entrypoint.

Wires together all routers, the WebSocket endpoint, startup hooks (graph load,
DB init, demo seeding, vehicle simulation) and CORS.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, alerts, citizen, incidents, routing, vehicles, websocket
from app.core.config import settings
from app.core.database import SessionLocal, init_db
from app.core.pubsub import pubsub
from app.services import (
    rescue_dispatcher,
    road_network,
    seed_data,
    ws_manager,
)
from app.services.websocket_manager import register_pubsub_bridge


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    # ---------- Startup ----------
    print("=" * 60)
    print(f"  {settings.APP_NAME} v{settings.APP_VERSION} starting up")
    print("=" * 60)

    # 1. Init DB
    init_db()
    print("[Startup] Database initialised")

    # 2. Load road network (OSMnx or fallback)
    road_network.load()
    print("[Startup] Road network loaded")

    # 3. Connect pub/sub
    await pubsub.connect()
    register_pubsub_bridge()

    # 4. Seed demo data
    db = SessionLocal()
    try:
        facilities_added = seed_data.seed_facilities(db)
        incidents_added = seed_data.seed_sample_incidents(db)
        alerts_added = seed_data.seed_sample_alerts(db)
        print(
            f"[Startup] Seeded {facilities_added} facilities, "
            f"{incidents_added} incidents, {alerts_added} alerts"
        )
    finally:
        db.close()

    # 5. Seed demo vehicles
    if settings.SEED_VEHICLES:
        db = SessionLocal()
        try:
            from app.models import db_models
            existing = db.query(db_models.Vehicle).count()
            if existing == 0:
                # Reuse the seed endpoint logic
                from app.api.vehicles import seed_demo_vehicles
                await seed_demo_vehicles.__wrapped__(db) if hasattr(seed_demo_vehicles, "__wrapped__") else None
                # Call directly with a fresh session
                vehicles_created = await _seed_vehicles_direct(db)
                print(f"[Startup] Seeded {vehicles_created} vehicles")
        finally:
            db.close()

    # 6. Start vehicle simulation
    await rescue_dispatcher.start_simulation(SessionLocal)
    print("[Startup] Vehicle simulation running")

    print("=" * 60)
    print(f"  {settings.APP_NAME} ready at http://localhost:8000")
    print("=" * 60)

    yield

    # ---------- Shutdown ----------
    print("[Shutdown] Stopping simulation...")
    await rescue_dispatcher.stop_simulation()
    await pubsub.disconnect()
    print("[Shutdown] Done.")


async def _seed_vehicles_direct(db) -> int:
    """Seed demo vehicles directly (called during startup)."""
    from app.api.vehicles import seed_demo_vehicles
    # We bypass the FastAPI dependency by passing the db directly
    # seed_demo_vehicles has signature (db=Depends(get_db)) - we call it with db positional
    try:
        result = await seed_demo_vehicles(db=db)
        return len(result) if isinstance(result, list) else 0
    except Exception as exc:
        print(f"[Startup] Vehicle seeding failed: {exc}")
        return 0


app = FastAPI(
    title=settings.APP_NAME,
    description="Flood-Aware Emergency Response Decision Engine",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(citizen.router, prefix=settings.API_PREFIX)
app.include_router(routing.router, prefix=settings.API_PREFIX)
app.include_router(vehicles.router, prefix=settings.API_PREFIX)
app.include_router(incidents.router, prefix=settings.API_PREFIX)
app.include_router(alerts.router, prefix=settings.API_PREFIX)
app.include_router(admin.router, prefix=settings.API_PREFIX)
app.include_router(websocket.router)


@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "websocket": "/ws/{admin|citizen}",
        "endpoints": [
            f"{settings.API_PREFIX}/citizen/reports",
            f"{settings.API_PREFIX}/route/plan",
            f"{settings.API_PREFIX}/route/dispatch",
            f"{settings.API_PREFIX}/vehicles",
            f"{settings.API_PREFIX}/incidents",
            f"{settings.API_PREFIX}/alerts",
            f"{settings.API_PREFIX}/admin/metrics",
            f"{settings.API_PREFIX}/admin/map/state",
            f"{settings.API_PREFIX}/admin/weather",
        ],
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "graph_loaded": road_network.graph is not None,
        "nodes": len(road_network.graph.nodes) if road_network.graph else 0,
        "edges": len(road_network.graph.edges) if road_network.graph else 0,
        "ws_clients": ws_manager.stats(),
    }
