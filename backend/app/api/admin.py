"""Admin dashboard API: metrics, weather, map snapshot, traffic anomalies."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import db_models
from app.services import (
    flood_intelligence,
    rescue_dispatcher,
    road_network,
    validation_engine,
    weather_service,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/metrics")
def metrics(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Return a real-time dashboard metrics snapshot."""
    active_incidents = (
        db.query(db_models.Incident)
        .filter(db_models.Incident.status.in_(["open", "assigned", "en_route"]))
        .count()
    )
    active_vehicles = (
        db.query(db_models.Vehicle)
        .filter(db_models.Vehicle.status != "idle")
        .count()
    )
    total_reports = db.query(db_models.Report).count()
    validated_reports = (
        db.query(db_models.Report)
        .filter(db_models.Report.status == "validated")
        .count()
    )
    return {
        "active_incidents": active_incidents,
        "active_vehicles": active_vehicles,
        "total_reports": total_reports,
        "validated_reports": validated_reports,
        "avg_reroute_ms": round(rescue_dispatcher.average_reroute_ms(), 2),
        "affected_roads": road_network.affected_edges(),
        "high_risk_edges": road_network.high_risk_edges(),
        "ws_connections": 0,  # filled in by main app via dependency
        "last_updated": datetime.utcnow().isoformat(),
    }


@router.get("/weather")
def get_weather(lat: float | None = None, lng: float | None = None) -> Dict[str, Any]:
    bbox = settings.DEFAULT_BBOX
    center_lat = (bbox[0] + bbox[2]) / 2 if lat is None else lat
    center_lng = (bbox[1] + bbox[3]) / 2 if lng is None else lng
    return weather_service.get_current(center_lat, center_lng) or {}


@router.get("/map/state")
def map_state() -> Dict[str, Any]:
    """Return the full in-memory map state for the admin dashboard."""
    edges: List[Dict[str, Any]] = []
    for (u, v, k), risk in road_network.all_edge_risk().items():
        if risk < 0.02 and not road_network.is_edge_blocked(u, v, k):
            continue
        geom = road_network.edge_geometry(u, v, k)
        edges.append({
            "u": u, "v": v, "k": k,
            "risk": round(risk, 3),
            "blocked": road_network.is_edge_blocked(u, v, k),
            "geometry": geom,
        })
    return {
        "bbox": list(road_network.bbox),
        "node_count": len(road_network.graph.nodes) if road_network.graph else 0,
        "edge_count": len(road_network.graph.edges) if road_network.graph else 0,
        "edges": edges,
    }


@router.post("/traffic/anomaly")
def report_traffic_anomaly(lat: float, lng: float, score: float):
    """Inject a real-time traffic anomaly signal (used by fleet GPS / TomTom feed)."""
    validation_engine.report_traffic_anomaly(lat, lng, score)
    # Clear the routing engine's env risk cache so the new anomaly is picked up
    from app.services.routing_engine import routing_engine
    routing_engine.clear_env_risk_cache()
    return {"ok": True}


@router.post("/flood/simulate")
def simulate_flood(lat: float, lng: float, radius_m: float = 150.0):
    """Apply a simulated flood pulse at a point and update affected road edges."""
    update = flood_intelligence.apply_report(lat, lng, "severe", 0.95)
    from app.services.routing_engine import routing_engine
    routing_engine.clear_env_risk_cache()

    affected_edges: List[Dict[str, Any]] = []
    for (u, v, k) in update.edge_keys:
        if not road_network.graph or not road_network.graph.has_edge(u, v, k):
            continue
        affected_edges.append({
            "u": u,
            "v": v,
            "k": k,
            "risk": round(road_network.get_edge_risk(u, v, k), 3),
            "blocked": road_network.is_edge_blocked(u, v, k),
            "geometry": road_network.edge_geometry(u, v, k),
        })

    return {
        "ok": True,
        "radius_m": radius_m,
        "affected_edges": affected_edges,
        "blocked_edges": [edge for edge in affected_edges if edge["blocked"]],
    }


@router.post("/risk/decay")
def decay_risk(hours: float = 1.0):
    """Apply time-based risk decay across all edges."""
    flood_intelligence.decay_all(hours)
    return {
        "ok": True,
        "affected_roads_after": road_network.affected_edges(),
        "high_risk_edges_after": road_network.high_risk_edges(),
    }
