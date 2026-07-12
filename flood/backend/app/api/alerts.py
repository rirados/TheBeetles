"""Alerts API."""
from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import db_models, schemas
from app.services import ws_manager

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=List[schemas.AlertOut])
def list_alerts(active_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(db_models.Alert)
    if active_only:
        now = datetime.utcnow()
        q = q.filter(db_models.Alert.active == True)  # noqa: E712
        q = q.filter((db_models.Alert.expires_at == None) | (db_models.Alert.expires_at > now))  # noqa: E711
    return q.order_by(db_models.Alert.created_at.desc()).all()


@router.post("", response_model=schemas.AlertOut, status_code=201)
async def create_alert(payload: schemas.AlertCreate, db: Session = Depends(get_db)):
    a = db_models.Alert(**payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    await ws_manager.broadcast("alert_new", {
        "id": a.id, "severity": a.severity, "title": a.title,
        "body": a.body, "area": a.area, "lat": a.lat, "lng": a.lng,
        "radius_m": a.radius_m, "expires_at": a.expires_at.isoformat() if a.expires_at else None,
    }, channels=["admin", "citizen"])
    return a


@router.delete("/{alert_id}")
async def deactivate_alert(alert_id: str, db: Session = Depends(get_db)):
    a = db.query(db_models.Alert).filter(db_models.Alert.id == alert_id).first()
    if not a:
        raise HTTPException(404, "Alert not found")
    a.active = False
    db.commit()
    await ws_manager.broadcast("alert_cleared", {"id": alert_id})
    return {"ok": True}
