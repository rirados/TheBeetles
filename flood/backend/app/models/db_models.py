"""SQLAlchemy ORM models for persistence (reports, vehicles, alerts, audits)."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class ReportStatus(str, PyEnum):
    PENDING = "pending"
    VALIDATED = "validated"
    REJECTED = "rejected"
    RESOLVED = "resolved"


class HazardType(str, PyEnum):
    FLOOD = "flood"
    LANDSLIDE = "landslide"
    BLOCKED_ROAD = "blocked_road"
    FALLEN_TREE = "fallen_tree"
    OTHER = "other"


class FloodDepth(str, PyEnum):
    NONE = "none"
    ANKLE = "ankle"
    KNEE = "knee"
    WAIST = "waist"
    CHEST = "chest"
    ABOVE_CHEST = "above_chest"


class VehicleType(str, PyEnum):
    AMBULANCE = "ambulance"
    FIRE_TRUCK = "fire_truck"
    POLICE = "police"
    RESCUE_BOAT = "rescue_boat"
    NDRF = "ndrf"


class VehicleStatus(str, PyEnum):
    IDLE = "idle"
    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    ON_SCENE = "on_scene"
    RETURNING = "returning"


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=_uuid)
    citizen_id = Column(String, nullable=True)
    hazard_type = Column(String, nullable=False, default=HazardType.FLOOD.value)
    flood_depth = Column(String, nullable=False, default=FloodDepth.ANKLE.value)
    description = Column(Text, nullable=True)

    # Geolocation of the report
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)
    shutter_time = Column(DateTime, nullable=True)  # EXIF-like capture time

    # Photo (stored as base64 data URL or filesystem path)
    photo_data_url = Column(Text, nullable=True)
    photo_gps_lat = Column(Float, nullable=True)
    photo_gps_lng = Column(Float, nullable=True)

    # Validation
    confidence_score = Column(Float, default=0.0)
    validation_breakdown = Column(JSON, default=dict)
    status = Column(String, default=ReportStatus.PENDING.value)

    # Snapping / intelligence
    snapped_edge_u = Column(Integer, nullable=True)
    snapped_edge_v = Column(Integer, nullable=True)
    snapped_edge_key = Column(Integer, default=0)
    road_risk_score = Column(Float, default=0.0)

    # Admin review
    reviewed_by = Column(String, nullable=True)
    review_note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(String, primary_key=True, default=_uuid)
    call_sign = Column(String, nullable=False, unique=True)
    vehicle_type = Column(String, nullable=False, default=VehicleType.AMBULANCE.value)
    status = Column(String, default=VehicleStatus.IDLE.value)

    # Home base / depot
    depot_lat = Column(Float, nullable=False)
    depot_lng = Column(Float, nullable=False)
    depot_name = Column(String, nullable=True)

    # Live position
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    heading = Column(Float, default=0.0)
    speed_kmh = Column(Float, default=0.0)

    # Current assignment
    assigned_incident_id = Column(String, ForeignKey("incidents.id"), nullable=True)
    route_geometry = Column(JSON, nullable=True)  # list of [lat, lng]
    route_eta_seconds = Column(Float, nullable=True)
    route_profile = Column(String, default="fastest")
    route_distance_m = Column(Float, nullable=True)

    capacity = Column(Integer, default=4)
    onboard_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    incidents = relationship("Incident", back_populates="vehicle", foreign_keys="Incident.vehicle_id")


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, default=_uuid)
    report_id = Column(String, ForeignKey("reports.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Integer, default=2)  # 1 (low) .. 5 (critical)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)

    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=True)
    vehicle = relationship("Vehicle", back_populates="incidents", foreign_keys=[vehicle_id])

    status = Column(String, default="open")  # open | assigned | en_route | resolved
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=_uuid)
    severity = Column(String, default="info")  # info | warning | critical
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    area = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    radius_m = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    active = Column(Boolean, default=True)


class Facility(Base):
    """Pre-loaded POIs: hospitals, shelters, police/fire stations, depots."""

    __tablename__ = "facilities"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    facility_type = Column(String, nullable=False)  # hospital | shelter | police | fire | depot
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    capacity = Column(Integer, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    metadata_json = Column(JSON, default=dict)


class MetricsAudit(Base):
    """Performance metrics audit log (reroute time, affected roads, etc.)."""

    __tablename__ = "metrics_audit"

    id = Column(String, primary_key=True, default=_uuid)
    metric_key = Column(String, nullable=False)  # reroute_time_ms | affected_roads | ...
    metric_value = Column(Float, nullable=False)
    context = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
