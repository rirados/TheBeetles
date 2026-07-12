"""Rescue Dispatcher.

Handles:
  * Auto-selecting the nearest idle vehicle for an incident
  * Computing the route (emergency / safest / fastest)
  * Triggering reroutes when a vehicle's active path crosses newly flooded edges
  * Simulating vehicle movement along the assigned route
"""
from __future__ import annotations

import asyncio
import math
import random
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import db_models
from app.services.graph_loader import road_network
from app.services.routing_engine import RouteResult, routing_engine
from app.services.websocket_manager import ws_manager
from app.utils.geo import haversine_m


class RescueDispatcher:
    """Coordinates rescue vehicle assignment and live movement."""

    def __init__(self) -> None:
        self._sim_task: Optional[asyncio.Task] = None
        self._reroute_log: List[float] = []  # ms timings for metrics

    # ---------- Assignment ----------
    def select_nearest_vehicle(
        self, db: Session, lat: float, lng: float, exclude_ids: Optional[set] = None
    ) -> Optional[db_models.Vehicle]:
        """Pick the nearest IDLE vehicle to (lat, lng)."""
        exclude_ids = exclude_ids or set()
        vehicles = (
            db.query(db_models.Vehicle)
            .filter(db_models.Vehicle.status.in_(["idle", "returning"]))
            .all()
        )
        candidates = [v for v in vehicles if v.id not in exclude_ids]
        if not candidates:
            return None
        candidates.sort(key=lambda v: haversine_m(lat, lng, v.lat, v.lng))
        return candidates[0]

    def assign_vehicle(
        self,
        db: Session,
        incident: db_models.Incident,
        vehicle: db_models.Vehicle,
        profile: str = "emergency",
    ) -> Optional[RouteResult]:
        """Compute route, attach to vehicle, mark both as en_route."""
        results, ms = routing_engine.route(
            (vehicle.lat, vehicle.lng),
            (incident.lat, incident.lng),
            profile="emergency",
            alternatives=False,
        )
        if not results:
            return None
        route = results[0]
        vehicle.route_geometry = route.geometry
        vehicle.route_eta_seconds = route.travel_time_s
        vehicle.route_distance_m = route.distance_m
        vehicle.route_profile = profile
        vehicle.status = "en_route"
        vehicle.assigned_incident_id = incident.id
        incident.vehicle_id = vehicle.id
        incident.status = "assigned"
        self._reroute_log.append(ms)
        return route

    # ---------- Reroute on flooding ----------
    async def reroute_affected_vehicles(self, db: Session, blocked_edge_keys: List[Tuple[int, int, int]]) -> int:
        """Reroute any en_route vehicle whose path crosses a blocked edge."""
        if not blocked_edge_keys:
            return 0
        blocked_set = set(blocked_edge_keys)
        vehicles = (
            db.query(db_models.Vehicle)
            .filter(db_models.Vehicle.status == "en_route")
            .all()
        )
        rerouted = 0
        for vehicle in vehicles:
            geom = vehicle.route_geometry or []
            if len(geom) < 2:
                continue
            # Check if any edge along the current route is now blocked
            o_node = road_network.nearest_node(geom[0][0], geom[0][1])
            d_node = road_network.nearest_node(geom[-1][0], geom[-1][1])
            # Walk the previous node path and check edges
            G = road_network.graph
            # Reconstruct path nodes by snapping each geometry point
            node_path = [road_network.nearest_node(y, x) for y, x in geom]
            needs_reroute = False
            for i in range(len(node_path) - 1):
                u, v = node_path[i], node_path[i + 1]
                if (u, v, 0) in blocked_set or road_network.is_edge_blocked(u, v, 0):
                    needs_reroute = True
                    break
            if not needs_reroute:
                continue
            t0 = time.perf_counter()
            results, ms = routing_engine.route(
                (vehicle.lat, vehicle.lng),
                (geom[-1][0], geom[-1][1]),
                profile="emergency",
                alternatives=False,
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000
            self._reroute_log.append(elapsed_ms)
            if results:
                new_route = results[0]
                vehicle.route_geometry = new_route.geometry
                vehicle.route_eta_seconds = new_route.travel_time_s
                vehicle.route_distance_m = new_route.distance_m
                db.commit()
                await ws_manager.broadcast("vehicle_rerouted", {
                    "vehicle_id": vehicle.id,
                    "call_sign": vehicle.call_sign,
                    "new_eta_s": new_route.travel_time_s,
                    "new_distance_m": new_route.distance_m,
                    "reroute_ms": round(elapsed_ms, 1),
                    "profile": vehicle.route_profile,
                    "geometry": new_route.geometry,
                })
                rerouted += 1
        return rerouted

    # ---------- Vehicle simulation ----------
    async def start_simulation(self, db_session_factory) -> None:
        """Background task that advances vehicle positions along their routes."""
        if self._sim_task and not self._sim_task.done():
            return
        self._sim_task = asyncio.create_task(self._simulation_loop(db_session_factory))

    async def stop_simulation(self) -> None:
        if self._sim_task:
            self._sim_task.cancel()
            try:
                await self._sim_task
            except asyncio.CancelledError:
                pass
            self._sim_task = None

    async def _simulation_loop(self, db_session_factory) -> None:
        """Move each en_route vehicle along its route geometry at ~30 km/h."""
        step_seconds = 2.0
        speed_mps = 30.0 * 1000 / 3600  # 30 km/h average
        while True:
            try:
                await asyncio.sleep(step_seconds)
                db: Session = db_session_factory()
                try:
                    vehicles = (
                        db.query(db_models.Vehicle)
                        .filter(db_models.Vehicle.status == "en_route")
                        .all()
                    )
                    moved: List[dict] = []
                    arrived: List[dict] = []
                    for v in vehicles:
                        geom = v.route_geometry or []
                        if len(geom) < 2:
                            continue
                        # Advance along geometry
                        advance_m = speed_mps * step_seconds
                        remaining = advance_m
                        new_lat, new_lng = v.lat, v.lng
                        # Find current segment
                        # For simplicity: find nearest geometry index, then advance
                        nearest_idx = 0
                        best_d = float("inf")
                        for i, (y, x) in enumerate(geom):
                            d = haversine_m(v.lat, v.lng, y, x)
                            if d < best_d:
                                best_d = d
                                nearest_idx = i
                        idx = nearest_idx
                        while idx < len(geom) - 1 and remaining > 0:
                            y1, x1 = geom[idx]
                            y2, x2 = geom[idx + 1]
                            seg_len = haversine_m(y1, x1, y2, x2)
                            if seg_len <= 0:
                                idx += 1
                                continue
                            if remaining >= seg_len:
                                remaining -= seg_len
                                idx += 1
                                new_lat, new_lng = y2, x2
                            else:
                                t = remaining / seg_len
                                new_lat = y1 + (y2 - y1) * t
                                new_lng = x1 + (x2 - x1) * t
                                remaining = 0
                                idx += 1
                        v.lat = new_lat
                        v.lng = new_lng
                        v.speed_kmh = 30.0 + random.uniform(-5, 5)
                        if idx >= len(geom) - 1:
                            # Arrived
                            v.status = "on_scene"
                            v.speed_kmh = 0.0
                            arrived.append({
                                "vehicle_id": v.id,
                                "call_sign": v.call_sign,
                                "lat": v.lat,
                                "lng": v.lng,
                                "status": "on_scene",
                            })
                        else:
                            moved.append({
                                "vehicle_id": v.id,
                                "call_sign": v.call_sign,
                                "lat": v.lat,
                                "lng": v.lng,
                                "speed_kmh": round(v.speed_kmh, 1),
                                "eta_s": v.route_eta_seconds,
                            })
                    db.commit()
                    if moved:
                        await ws_manager.broadcast("vehicle_positions", {"vehicles": moved})
                    if arrived:
                        await ws_manager.broadcast("vehicle_arrived", {"vehicles": arrived})
                finally:
                    db.close()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover
                print(f"[Sim] loop error: {exc}")

    # ---------- Metrics ----------
    def average_reroute_ms(self) -> float:
        if not self._reroute_log:
            return 0.0
        # Use last 50 samples
        recent = self._reroute_log[-50:]
        return sum(recent) / len(recent)


rescue_dispatcher = RescueDispatcher()
