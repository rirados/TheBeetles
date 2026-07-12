"""Application configuration using Pydantic Settings."""
from functools import lru_cache
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized application configuration.

    All values can be overridden through environment variables or a `.env` file.
    Sensible hackathon-friendly defaults are provided so the app runs out of the box.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        env_prefix="FLOODGUARDIAN_",
    )

    # ---- App ----
    APP_NAME: str = "FloodGuardian"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]

    # ---- Database (SQLite for hackathon portability; swap to Postgres for prod) ----
    DATABASE_URL: str = "sqlite:///./floodguardian.db"

    # ---- Redis (optional; falls back to in-memory pub/sub) ----
    REDIS_URL: Optional[str] = None
    USE_REDIS: bool = False

    # ---- OSMnx / Map ----
    # Default target area: Mangalore coastal region (prone to monsoon flooding)
    DEFAULT_PLACE: str = "Mangalore, Karnataka, India"
    DEFAULT_NETWORK_TYPE: str = "drive"
    DEFAULT_GRAPH_CACHE: str = "./cache/road_graph.graphml"
    # Bounding box fallback (lat_min, lng_min, lat_max, lng_max) if place lookup fails
    # Stored as a string "lat_min,lng_min,lat_max,lng_max" to avoid env-var JSON issues
    DEFAULT_BBOX_STR: str = "12.8600,74.7800,12.9600,74.9200"

    @property
    def DEFAULT_BBOX(self) -> tuple:
        parts = [float(x.strip()) for x in self.DEFAULT_BBOX_STR.split(",")]
        if len(parts) != 4:
            return (12.8600, 74.7800, 12.9600, 74.9200)
        return tuple(parts)

    # ---- Routing ----
    ROUTE_PROFILE_DEFAULT: str = "fastest"  # fastest | safest | emergency
    REROUTE_THRESHOLD_RISK: float = 0.6  # Trigger reroute if edge risk exceeds this
    MAX_ALTERNATIVES: int = 2  # Number of safer alternative paths to return

    # ---- Validation Engine weights (must sum to 1.0) ----
    # Photo-geo feature removed; weight redistributed to remaining 4 signals.
    VALIDATION_WEIGHTS: dict = {
        "traffic_anomaly": 0.40,  # Real-time traffic anomaly signal (highest)
        "rainfall": 0.30,         # Open-Meteo current rainfall
        "historical_flood": 0.20, # NRSC/ISRO/Bhuvan susceptibility
        "water_proximity": 0.10,  # Distance to nearest water body
    }
    REPORT_ACCEPT_THRESHOLD: float = 0.40  # Min confidence to influence graph

    # ---- Weather (Open-Meteo) ----
    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1/forecast"
    RAINFALL_CACHE_SECONDS: int = 300

    # ---- Flood Intelligence ----
    RISK_DECAY_PER_HOUR: float = 0.15  # Risk decays exponentially over time
    RISK_DEPTH_MULTIPLIER: dict = {
        "none": 0.0,
        "ankle": 0.45,
        "knee": 0.7,
        "waist": 0.85,
        "chest": 0.95,
        "above_chest": 1.0,
    }

    # ---- WebSocket ----
    WS_HEARTBEAT_SECONDS: int = 30

    # ---- Rescue Fleet (demo seed) ----
    SEED_VEHICLES: bool = True


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor."""
    return Settings()


settings = get_settings()
