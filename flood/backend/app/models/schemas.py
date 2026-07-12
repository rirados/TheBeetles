"""Pydantic schemas for API request/response validation."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field


# ---------- Geo ----------
class LatLng(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


# ---------- Reports ----------
class ReportCreate(BaseModel):
    citizen_id: Optional[str] = None
    hazard_type: str = Field("flood")
    flood_depth: str = Field("ankle")
    description: Optional[str] = None
    lat: float
    lng: float
    accuracy_m: Optional[float] = None
    photo_data_url: Optional[str] = None
    photo_gps_lat: Optional[float] = None
    photo_gps_lng: Optional[float] = None
    shutter_time: Optional[datetime] = None


class ReportOut(BaseModel):
    id: str
    hazard_type: str
    flood_depth: str
    description: Optional[str]
    lat: float
    lng: float
    accuracy_m: Optional[float]
    photo_data_url: Optional[str] = None
    photo_gps_lat: Optional[float] = None
    photo_gps_lng: Optional[float] = None
    shutter_time: Optional[datetime] = None
    confidence_score: float
    validation_breakdown: Dict[str, float] = Field(default_factory=dict)
    status: str
    snapped_edge_u: Optional[int]
    snapped_edge_v: Optional[int]
    road_risk_score: float
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Routing ----------
class RouteRequest(BaseModel):
    origin: LatLng
    destination: LatLng
    profile: str = Field("emergency", pattern="^(fastest|safest|emergency)$")
    alternatives: bool = True
    num_alternatives: int = Field(3, ge=1, le=5)
    vehicle_id: Optional[str] = None


class RoutePath(BaseModel):
    profile: str
    geometry: List[Tuple[float, float]]  # list of (lat, lng)
    distance_m: float
    travel_time_s: float
    risk_score: float
    edges: List[int] = Field(default_factory=list)
    blocked_edges: int = 0
    env_risk_breakdown: Dict[str, float] = Field(default_factory=dict)
    total_risk: float = 0.0


class RouteResponse(BaseModel):
    request_id: str
    paths: List[RoutePath]
    computation_ms: float
    notes: Optional[str] = None


# ---------- Vehicles ----------
class VehicleCreate(BaseModel):
    call_sign: str
    vehicle_type: str = "ambulance"
    depot_lat: float
    depot_lng: float
    depot_name: Optional[str] = None
    capacity: int = 4


class VehicleUpdate(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    heading: Optional[float] = None
    speed_kmh: Optional[float] = None
    status: Optional[str] = None


class VehicleOut(BaseModel):
    id: str
    call_sign: str
    vehicle_type: str
    status: str
    depot_lat: float
    depot_lng: float
    depot_name: Optional[str]
    lat: float
    lng: float
    heading: float
    speed_kmh: float
    assigned_incident_id: Optional[str]
    route_geometry: Optional[List[Tuple[float, float]]]
    route_eta_seconds: Optional[float]
    route_profile: str
    route_distance_m: Optional[float]
    capacity: int
    onboard_count: int

    class Config:
        from_attributes = True


# ---------- Incidents ----------
class IncidentCreate(BaseModel):
    report_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: int = Field(2, ge=1, le=5)
    lat: float
    lng: float


class IncidentOut(BaseModel):
    id: str
    report_id: Optional[str]
    title: str
    description: Optional[str]
    priority: int
    lat: float
    lng: float
    vehicle_id: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Alerts ----------
class AlertCreate(BaseModel):
    severity: str = Field("info", pattern="^(info|warning|critical)$")
    title: str
    body: Optional[str] = None
    area: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_m: Optional[float] = None
    expires_at: Optional[datetime] = None


class AlertOut(AlertCreate):
    id: str
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Facilities ----------
class FacilityOut(BaseModel):
    id: str
    name: str
    facility_type: str
    lat: float
    lng: float
    capacity: Optional[int]
    phone: Optional[str]
    address: Optional[str]

    class Config:
        from_attributes = True


# ---------- Dispatch ----------
class DispatchRequest(BaseModel):
    incident_id: str
    vehicle_id: Optional[str] = None  # if None, auto-select nearest
    profile: str = Field("emergency", pattern="^(fastest|safest|emergency)$")


class DispatchResponse(BaseModel):
    incident_id: str
    vehicle_id: str
    route: RoutePath
    eta_seconds: float
    assigned_at: datetime


# ---------- Metrics ----------
class MetricsSnapshot(BaseModel):
    active_incidents: int
    active_vehicles: int
    total_reports: int
    validated_reports: int
    avg_reroute_ms: float
    affected_roads: int
    high_risk_edges: int
    last_updated: datetime


# ---------- Weather ----------
class WeatherSnapshot(BaseModel):
    lat: float
    lng: float
    temperature_c: float
    precipitation_mm: float
    rain_intensity: str  # none | light | moderate | heavy | extreme
    wind_speed_kmh: float
    humidity: float
    timestamp: datetime


# ---------- WebSocket envelope ----------
class WSEnvelope(BaseModel):
    event: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
