"""Incident management API."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import db_models, schemas
from app.services import ws_manager

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("", response_model=List[schemas.IncidentOut])
def list_incidents(db: Session = Depends(get_db)):
    return (
        db.query(db_models.Incident)
        .order_by(db_models.Incident.priority.desc())
        .all()
    )


@router.post("", response_model=schemas.IncidentOut, status_code=201)
async def create_incident(payload: schemas.IncidentCreate, db: Session = Depends(get_db)):
    inc = db_models.Incident(
        report_id=payload.report_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        lat=payload.lat,
        lng=payload.lng,
        status="open",
    )
    db.add(inc)
    db.commit()
    db.refresh(inc)
    await ws_manager.broadcast("incident_new", {
        "id": inc.id, "title": inc.title, "priority": inc.priority,
        "lat": inc.lat, "lng": inc.lng, "status": inc.status,
        "created_at": inc.created_at.isoformat(),
    })
    return inc


@router.patch("/{incident_id}/resolve", response_model=schemas.IncidentOut)
async def resolve_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.query(db_models.Incident).filter(db_models.Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    inc.status = "resolved"
    # Release the assigned vehicle
    if inc.vehicle_id:
        v = db.query(db_models.Vehicle).filter(db_models.Vehicle.id == inc.vehicle_id).first()
        if v:
            v.status = "returning"
            v.assigned_incident_id = None
    db.commit()
    db.refresh(inc)
    await ws_manager.broadcast("incident_resolved", {"id": inc.id})
    return inc
