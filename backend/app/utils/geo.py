"""Geo utility helpers (haversine, bearing, point-in-bbox, etc.)."""
from __future__ import annotations

import math
from typing import Tuple

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres between two WGS84 points."""
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Initial bearing in degrees [0, 360)."""
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlng = math.radians(lng2 - lng1)
    x = math.sin(dlng) * math.cos(rlat2)
    y = math.cos(rlat1) * math.sin(rlat2) - math.sin(rlat1) * math.cos(rlat2) * math.cos(dlng)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def in_bbox(lat: float, lng: float, bbox: Tuple[float, float, float, float]) -> bool:
    lat_min, lng_min, lat_max, lng_max = bbox
    return lat_min <= lat <= lat_max and lng_min <= lng <= lng_max


def project_m_per_deg_lat(lat: float) -> float:
    """Metres per degree of latitude at a given latitude."""
    return math.pi / 180 * EARTH_RADIUS_M


def project_m_per_deg_lng(lat: float) -> float:
    return math.pi / 180 * EARTH_RADIUS_M * math.cos(math.radians(lat))


def snap_to_segment(
    lat: float, lng: float, segment: list
) -> Tuple[float, Tuple[float, float]]:
    """Project a point onto a polyline; return (distance_m, snapped_point)."""
    best = (float("inf"), (lat, lng))
    for i in range(len(segment) - 1):
        y1, x1 = segment[i]
        y2, x2 = segment[i + 1]
        # Convert to planar metres for snapping
        mlat = project_m_per_deg_lat(y1)
        mlng = project_m_per_deg_lng(y1)
        px, py = lng * mlng, lat * mlat
        ax, ay = x1 * mlng, y1 * mlat
        bx, by = x2 * mlng, y2 * mlat
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            t = 0.0
        else:
            t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
        t = max(0.0, min(1.0, t))
        sx, sy = ax + t * dx, ay + t * dy
        dist = math.hypot(px - sx, py - sy)
        if dist < best[0]:
            # Convert back to lat/lng
            snap_lat = sy / mlat
            snap_lng = sx / mlng
            best = (dist, (snap_lat, snap_lng))
    return best
