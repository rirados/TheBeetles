"""Vehicle management API."""
from __future__ import annotations

import random
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import db_models, schemas
from app.services import ws_manager

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("", response_model=List[schemas.VehicleOut])
def list_vehicles(db: Session = Depends(get_db)):
    return db.query(db_models.Vehicle).all()


@router.post("", response_model=schemas.VehicleOut, status_code=201)
async def create_vehicle(payload: schemas.VehicleCreate, db: Session = Depends(get_db)):
    v = db_models.Vehicle(
        call_sign=payload.call_sign,
        vehicle_type=payload.vehicle_type,
        depot_lat=payload.depot_lat,
        depot_lng=payload.depot_lng,
        depot_name=payload.depot_name,
        lat=payload.depot_lat,
        lng=payload.depot_lng,
        capacity=payload.capacity,
        status="idle",
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    await ws_manager.broadcast("vehicle_added", {
        "id": v.id, "call_sign": v.call_sign, "lat": v.lat, "lng": v.lng,
        "vehicle_type": v.vehicle_type, "status": v.status,
    })
    return v


@router.patch("/{vehicle_id}", response_model=schemas.VehicleOut)
async def update_vehicle(
    vehicle_id: str,
    payload: schemas.VehicleUpdate,
    db: Session = Depends(get_db),
):
    v = db.query(db_models.Vehicle).filter(db_models.Vehicle.id == vehicle_id).first()
    if not v:
        raise HTTPException(404, "Vehicle not found")
    for field in ("lat", "lng", "heading", "speed_kmh", "status"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(v, field, val)
    db.commit()
    db.refresh(v)
    await ws_manager.broadcast("vehicle_updated", {
        "id": v.id, "call_sign": v.call_sign, "lat": v.lat, "lng": v.lng,
        "status": v.status, "speed_kmh": v.speed_kmh,
    })
    return v


@router.post("/seed", response_model=List[schemas.VehicleOut])
async def seed_demo_vehicles(db: Session = Depends(get_db)):
    """Seed a demo rescue fleet spread across the graph bbox."""
    if not settings.SEED_VEHICLES:
        raise HTTPException(400, "Vehicle seeding is disabled")
    lat_min, lng_min, lat_max, lng_max = settings.DEFAULT_BBOX
    presets = [
        ("AMB-01", "ambulance", "City Hospital"),
        ("AMB-02", "ambulance", "District Hospital"),
        ("FR-01", "fire_truck", "Central Fire Station"),
        ("PD-01", "police", "Police HQ"),
        ("NDRF-01", "ndrf", "NDRF Camp"),
        ("BOAT-01", "rescue_boat", "Riverside Depot"),
    ]
    existing = {v.call_sign for v in db.query(db_models.Vehicle).all()}
    created = []
    for i, (cs, vt, depot) in enumerate(presets):
        if cs in existing:
            continue
        lat = lat_min + (lat_max - lat_min) * (0.25 + 0.1 * i)
        lng = lng_min + (lng_max - lng_min) * (0.3 + 0.08 * i)
        v = db_models.Vehicle(
            call_sign=cs,
            vehicle_type=vt,
            depot_lat=lat,
            depot_lng=lng,
            depot_name=depot,
            lat=lat,
            lng=lng,
            capacity=4 if vt != "fire_truck" else 6,
            status="idle",
        )
        db.add(v)
        created.append(v)
    db.commit()
    for v in created:
        db.refresh(v)
    await ws_manager.broadcast("vehicles_seeded", {
        "count": len(created),
        "vehicles": [{"id": v.id, "call_sign": v.call_sign, "lat": v.lat, "lng": v.lng} for v in created],
    })
    return created
