"""Weather service - Open-Meteo integration with caching."""
from __future__ import annotations

import asyncio
import time
from typing import Dict, Optional, Tuple

import httpx

from app.core.config import settings


class WeatherService:
    """Cached wrapper around the free Open-Meteo API."""

    def __init__(self) -> None:
        self._cache: Dict[Tuple[float, float], Tuple[float, dict]] = {}
        self._ttl = settings.RAINFALL_CACHE_SECONDS

    def _key(self, lat: float, lng: float) -> Tuple[float, float]:
        return (round(lat, 2), round(lng, 2))

    def _classify_rain(self, mm: float) -> str:
        if mm < 0.1:
            return "none"
        if mm < 2.5:
            return "light"
        if mm < 8.0:
            return "moderate"
        if mm < 30.0:
            return "heavy"
        return "extreme"

    def get_current(self, lat: float, lng: float) -> Optional[dict]:
        """Return current weather snapshot. Cached for RAINFALL_CACHE_SECONDS."""
        key = self._key(lat, lng)
        now = time.time()
        if key in self._cache:
            ts, data = self._cache[key]
            if now - ts < self._ttl:
                return data
        try:
            params = {
                "latitude": lat,
                "longitude": lng,
                "current": "temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m",
                "timezone": "auto",
            }
            # Synchronous call (we run inside threadpool via FastAPI sync endpoints)
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(settings.OPEN_METEO_BASE_URL, params=params)
                resp.raise_for_status()
                j = resp.json()
            current = j.get("current", {})
            mm = float(current.get("precipitation", 0.0) or 0.0)
            data = {
                "lat": lat,
                "lng": lng,
                "temperature_c": float(current.get("temperature_2m", 0.0) or 0.0),
                "precipitation_mm": mm,
                "rain_intensity": self._classify_rain(mm),
                "wind_speed_kmh": float(current.get("wind_speed_10m", 0.0) or 0.0),
                "humidity": float(current.get("relative_humidity_2m", 0.0) or 0.0),
                "timestamp": now,
            }
            self._cache[key] = (now, data)
            return data
        except Exception as exc:
            # On failure, return a best-effort zero-rainfall snapshot so the
            # validation pipeline can still proceed
            print(f"[Weather] Open-Meteo call failed: {exc}")
            fallback = {
                "lat": lat,
                "lng": lng,
                "temperature_c": 28.0,
                "precipitation_mm": 0.0,
                "rain_intensity": "none",
                "wind_speed_kmh": 0.0,
                "humidity": 80.0,
                "timestamp": now,
            }
            return fallback

    async def get_current_async(self, lat: float, lng: float) -> Optional[dict]:
        """Async variant for use inside async endpoints."""
        return await asyncio.to_thread(self.get_current, lat, lng)


weather_service = WeatherService()
