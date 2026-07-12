"""Citizen-facing API routes: reports, nearby facilities, alerts."""
from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import db_models, schemas
from app.services import (
    flood_intelligence,
    validation_engine,
    ws_manager,
)

router = APIRouter(prefix="/citizen", tags=["citizen"])


@router.post("/reports", response_model=schemas.ReportOut, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: schemas.ReportCreate,
    db: Session = Depends(get_db),
):
    """Submit a citizen hazard report.

    The report goes through the validation engine, gets a confidence score,
    is snapped to a road edge, and - if accepted - immediately influences the
    in-memory road graph. A WebSocket event is then broadcast to all admins.
    """
    report = db_models.Report(
        citizen_id=payload.citizen_id,
        hazard_type=payload.hazard_type,
        flood_depth=payload.flood_depth,
        description=payload.description,
        lat=payload.lat,
        lng=payload.lng,
        accuracy_m=payload.accuracy_m,
        status="pending",
    )

    # ---------- Validation ----------
    breakdown = validation_engine.validate(report)
    report.confidence_score = breakdown.confidence
    report.validation_breakdown = breakdown.to_dict()
    report.status = "validated" if breakdown.accepted else "pending"

    # ---------- Map matching + Flood intelligence ----------
    if breakdown.accepted:
        update = flood_intelligence.apply_report(
            lat=report.lat,
            lng=report.lng,
            depth_label=report.flood_depth,
            confidence=report.confidence_score,
        )
        if update.edge_keys:
            # Store the primary snapped edge
            primary = update.edge_keys[0] if update.edge_keys else None
            if primary:
                report.snapped_edge_u = primary[0]
                report.snapped_edge_v = primary[1]
                report.snapped_edge_key = primary[2]
            report.road_risk_score = update.risk_after.get(primary, 0.0) if primary else 0.0
        # Broadcast flood update
        await ws_manager.broadcast("flood_update", {
            "report_id": None,  # set after commit
            "lat": report.lat,
            "lng": report.lng,
            "hazard_type": report.hazard_type,
            "depth": report.flood_depth,
            "confidence": round(report.confidence_score, 3),
            "breakdown": report.validation_breakdown,
            "affected_edges": [
                {"u": u, "v": v, "k": k, "risk": r}
                for (u, v, k), r in update.risk_after.items()
            ],
            "blocked_edges": [
                {"u": u, "v": v, "k": k}
                for (u, v, k), b in update.blocked_after.items() if b
            ],
        }, channels=["admin"])

    db.add(report)
    db.commit()
    db.refresh(report)

    # Broadcast the new report to admins (and a citizen ack)
    await ws_manager.broadcast("report_new", {
        "id": report.id,
        "lat": report.lat,
        "lng": report.lng,
        "hazard_type": report.hazard_type,
        "flood_depth": report.flood_depth,
        "confidence": round(report.confidence_score, 3),
        "status": report.status,
        "created_at": report.created_at.isoformat(),
    }, channels=["admin"])

    return report


@router.get("/reports", response_model=List[schemas.ReportOut])
def list_reports(limit: int = 100, db: Session = Depends(get_db)):
    return (
        db.query(db_models.Report)
        .order_by(db_models.Report.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/reports/{report_id}", response_model=schemas.ReportOut)
def get_report(report_id: str, db: Session = Depends(get_db)):
    rpt = db.query(db_models.Report).filter(db_models.Report.id == report_id).first()
    if not rpt:
        raise HTTPException(404, "Report not found")
    return rpt


@router.get("/nearby", response_model=List[schemas.FacilityOut])
def nearby_facilities(
    lat: float,
    lng: float,
    radius_m: int = 3000,
    types: str | None = None,
    db: Session = Depends(get_db),
):
    """Return facilities within radius_m of (lat, lng), optionally filtered by type."""
    from app.utils.geo import haversine_m

    q = db.query(db_models.Facility)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        q = q.filter(db_models.Facility.facility_type.in_(type_list))
    facilities = q.all()
    out = []
    for f in facilities:
        d = haversine_m(lat, lng, f.lat, f.lng)
        if d <= radius_m:
            out.append(f)
    out.sort(key=lambda x: haversine_m(lat, lng, x.lat, x.lng))
    return out


@router.get("/alerts", response_model=List[schemas.AlertOut])
def active_alerts(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    return (
        db.query(db_models.Alert)
        .filter(db_models.Alert.active == True)  # noqa: E712
        .filter((db_models.Alert.expires_at == None) | (db_models.Alert.expires_at > now))  # noqa: E711
        .order_by(db_models.Alert.created_at.desc())
        .all()
    )
