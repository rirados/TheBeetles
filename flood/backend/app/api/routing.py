"""Routing API endpoints."""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import db_models, schemas
from app.services import rescue_dispatcher, routing_engine, ws_manager

router = APIRouter(prefix="/route", tags=["routing"])


@router.post("/plan", response_model=schemas.RouteResponse)
def plan_route(payload: schemas.RouteRequest, db: Session = Depends(get_db)):
    """Plan a route between two points.

    Returns up to `num_alternatives` distinct routes (default 3).
    All routing requests are treated as emergency routing for live flood avoidance.
    """
    # Clear env risk cache so fresh traffic/rainfall data is used
    routing_engine.clear_env_risk_cache()

    emergency_profile = "emergency"
    results, ms = routing_engine.route(
        origin=(payload.origin.lat, payload.origin.lng),
        destination=(payload.destination.lat, payload.destination.lng),
        profile=emergency_profile,
        alternatives=payload.alternatives,
        num_alternatives=payload.num_alternatives,
    )
    if not results:
        raise HTTPException(404, "No route found between origin and destination")
    return schemas.RouteResponse(
        request_id=str(uuid.uuid4()),
        paths=[
            schemas.RoutePath(
                profile=r.profile,
                geometry=r.geometry,
                distance_m=r.distance_m,
                travel_time_s=r.travel_time_s,
                risk_score=round(r.risk_score, 3),
                edges=r.edges,
                blocked_edges=r.blocked_edges,
                env_risk_breakdown={k: round(v, 3) for k, v in r.env_risk_breakdown.items()},
                total_risk=round(r.total_risk, 3),
            )
            for r in results
        ],
        computation_ms=round(ms, 2),
        notes=f"Returned {len(results)} path(s) using emergency routing",
    )


@router.post("/dispatch", response_model=schemas.DispatchResponse)
async def dispatch(payload: schemas.DispatchRequest, db: Session = Depends(get_db)):
    """Assign a vehicle to an incident and compute the route."""
    incident = db.query(db_models.Incident).filter(db_models.Incident.id == payload.incident_id).first()
    if not incident:
        raise HTTPException(404, "Incident not found")

    if payload.vehicle_id:
        vehicle = db.query(db_models.Vehicle).filter(db_models.Vehicle.id == payload.vehicle_id).first()
        if not vehicle:
            raise HTTPException(404, "Vehicle not found")
    else:
        vehicle = rescue_dispatcher.select_nearest_vehicle(db, incident.lat, incident.lng)
        if not vehicle:
            raise HTTPException(409, "No idle vehicles available")

    route = rescue_dispatcher.assign_vehicle(db, incident, vehicle, profile=payload.profile)
    if not route:
        raise HTTPException(422, "Could not compute route to incident")

    db.commit()
    db.refresh(vehicle)
    db.refresh(incident)

    await ws_manager.broadcast("vehicle_dispatched", {
        "incident_id": incident.id,
        "vehicle_id": vehicle.id,
        "call_sign": vehicle.call_sign,
        "profile": payload.profile,
        "eta_s": route.travel_time_s,
        "distance_m": route.distance_m,
        "risk_score": round(route.risk_score, 3),
        "geometry": route.geometry,
        "vehicle_lat": vehicle.lat,
        "vehicle_lng": vehicle.lng,
    })

    return schemas.DispatchResponse(
        incident_id=incident.id,
        vehicle_id=vehicle.id,
        route=schemas.RoutePath(
            profile=route.profile,
            geometry=route.geometry,
            distance_m=route.distance_m,
            travel_time_s=route.travel_time_s,
            risk_score=round(route.risk_score, 3),
            edges=route.edges,
            blocked_edges=route.blocked_edges,
        ),
        eta_seconds=route.travel_time_s,
        assigned_at=incident.updated_at,
    )
