"""Validation Engine.

Cross-checks citizen reports against (in priority order):
  1. Real-time traffic anomalies / congestion / diversions (highest weight)
  2. Current rainfall intensity from Open-Meteo
  3. Historical flood susceptibility (NRSC / ISRO / Bhuvan mock)
  4. Distance to nearest water body from OSM

Produces a weighted confidence score in [0, 1] and a transparent breakdown.

Note: The geotagged-photo signal was removed per requirements. The DB columns
for photo data remain (nullable) for backward compatibility but are no longer
populated by the citizen form or scored by this engine.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Optional

from app.core.config import settings
from app.services.weather_service import weather_service
from app.utils.geo import haversine_m


@dataclass
class ValidationBreakdown:
    traffic_anomaly: float
    rainfall: float
    historical_flood: float
    water_proximity: float
    confidence: float
    accepted: bool

    def to_dict(self) -> Dict[str, float]:
        return {
            "traffic_anomaly": round(self.traffic_anomaly, 3),
            "rainfall": round(self.rainfall, 3),
            "historical_flood": round(self.historical_flood, 3),
            "water_proximity": round(self.water_proximity, 3),
            "confidence": round(self.confidence, 3),
        }


class ValidationEngine:
    """Compute confidence score for an incoming citizen report."""

    def __init__(self) -> None:
        self.weights = settings.VALIDATION_WEIGHTS
        # Simple in-memory traffic anomaly store (lat,lng -> anomaly_score)
        self._traffic_anomalies: Dict[tuple, float] = {}

    # ---------- Traffic anomaly API ----------
    def report_traffic_anomaly(self, lat: float, lng: float, score: float) -> None:
        """Feed in a real-time traffic anomaly signal (0..1).

        Source could be TomTom flow data, fleet GPS, or simulated signals.
        """
        key = (round(lat, 3), round(lng, 3))
        self._traffic_anomalies[key] = max(
            self._traffic_anomalies.get(key, 0.0), min(1.0, max(0.0, score))
        )

    def _traffic_anomaly_score(self, lat: float, lng: float) -> float:
        best = 0.0
        for (la, lo), score in self._traffic_anomalies.items():
            d = haversine_m(lat, lng, la, lo)
            if d < 800:  # within 800m
                # Distance-weighted decay
                best = max(best, score * math.exp(-d / 500))
        return best

    # ---------- Individual validators ----------
    @staticmethod
    def _rainfall_score(lat: float, lng: float) -> float:
        """Map current rainfall intensity to a 0..1 corroboration score."""
        try:
            w = weather_service.get_current(lat, lng)
            if w is None:
                return 0.3
            mm = w.get("precipitation_mm", 0.0)
            # Heuristic: 0mm -> 0.2, 5mm -> 0.6, 15mm+ -> 1.0
            return min(1.0, 0.2 + mm / 18.0)
        except Exception:
            return 0.3

    @staticmethod
    def _historical_flood_score(lat: float, lng: float) -> float:
        """Mock historical flood susceptibility lookup.

        In production this would query NRSC/ISRO/Bhuvan flood-prone area layers.
        For the hackathon we synthesise a stable score from the coordinates.
        """
        # Stable pseudo-susceptibility: lower elevation + coastal proximity => higher
        # Use latitude band as proxy (closer to coast in our default bbox = higher)
        bbox = settings.DEFAULT_BBOX
        lat_min, _, lat_max, _ = bbox
        norm = (lat - lat_min) / max(0.001, lat_max - lat_min)  # 0 south, 1 north
        # Coastal (south) areas higher susceptibility
        base = 1.0 - norm
        # Add a sinusoidal component for natural variation
        variation = 0.15 * math.sin(lat * 80 + lng * 60)
        return max(0.0, min(1.0, base * 0.7 + variation + 0.1))

    @staticmethod
    def _water_proximity_score(lat: float, lng: float) -> float:
        """Score based on distance to nearest water body.

        Uses a coarse approximation; in production would query OSM water polygons
        via Overpass or a local water bodies layer.
        """
        # Mock: closer to known river / sea => higher score
        # In Mangalore, the Netravati / Arabian Sea are west & south
        sea_lng = 74.80  # approximate coastline longitude
        d_sea = abs(lng - sea_lng) * 111_000 * math.cos(math.radians(lat))
        # 1km from sea => 0.8, 5km => 0.3, 10km+ => 0.1
        if d_sea < 500:
            return 0.95
        return max(0.1, 1.0 - d_sea / 10_000)

    # ---------- Combined score ----------
    def validate(self, report) -> ValidationBreakdown:
        traffic = self._traffic_anomaly_score(report.lat, report.lng)
        rainfall = self._rainfall_score(report.lat, report.lng)
        historical = self._historical_flood_score(report.lat, report.lng)
        water = self._water_proximity_score(report.lat, report.lng)

        w = self.weights
        confidence = (
            w["traffic_anomaly"] * traffic
            + w["rainfall"] * rainfall
            + w["historical_flood"] * historical
            + w["water_proximity"] * water
        )
        # Boost if multiple independent signals agree
        agree = sum(1 for s in (traffic, rainfall, historical, water) if s > 0.5)
        if agree >= 3:
            confidence = min(1.0, confidence + 0.1)

        accepted = confidence >= settings.REPORT_ACCEPT_THRESHOLD
        return ValidationBreakdown(
            traffic_anomaly=traffic,
            rainfall=rainfall,
            historical_flood=historical,
            water_proximity=water,
            confidence=confidence,
            accepted=accepted,
        )


validation_engine = ValidationEngine()
