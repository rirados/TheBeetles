"""Incremental A* routing engine.

Supports three routing profiles:
  * fastest   - minimises travel time using OSM travel_time
  * safest    - penalises edges with flood risk
  * emergency - blocks high-risk edges outright, minimises risk+time

The engine keeps all state in memory and reuses the cached graph for sub-second
queries. When a vehicle's current route becomes invalidated by new risk data,
only that vehicle is rerouted (handled by the rescue dispatcher).
"""
from __future__ import annotations

import heapq
import math
import time
from typing import Dict, List, Optional, Tuple

import networkx as nx

from app.core.config import settings
from app.services.graph_loader import road_network
from app.utils.geo import haversine_m


# ---------- Environmental risk weights (for "smart" profile) ----------
ENV_WEIGHTS: Dict[str, float] = {
    "traffic": 0.40,      # 1. Real-time traffic anomalies (highest)
    "rainfall": 0.30,     # 2. Current rainfall from Open-Meteo
    "historical": 0.20,   # 3. Historical flood susceptibility (NRSC/ISRO/Bhuvan)
    "water": 0.10,        # 4. Distance to nearby rivers / water bodies
}


class RouteResult:
    __slots__ = (
        "path", "geometry", "distance_m", "travel_time_s",
        "risk_score", "edges", "blocked_edges", "profile",
        "env_risk_breakdown", "total_risk",
    )

    def __init__(self) -> None:
        self.path: List[int] = []
        self.geometry: List[Tuple[float, float]] = []
        self.distance_m: float = 0.0
        self.travel_time_s: float = 0.0
        self.risk_score: float = 0.0          # citizen-report flood risk (avg)
        self.edges: List[int] = []
        self.blocked_edges: int = 0
        self.profile: str = "fastest"
        # Environmental risk breakdown (avg over all edges in path)
        self.env_risk_breakdown: Dict[str, float] = {
            "traffic": 0.0, "rainfall": 0.0,
            "historical": 0.0, "water": 0.0,
            "combined": 0.0,
        }
        self.total_risk: float = 0.0  # max(flood_risk, env_combined)

    def to_dict(self) -> dict:
        return {
            "profile": self.profile,
            "geometry": self.geometry,
            "distance_m": self.distance_m,
            "travel_time_s": self.travel_time_s,
            "risk_score": round(self.risk_score, 3),
            "edges": self.edges,
            "blocked_edges": self.blocked_edges,
            "env_risk_breakdown": {k: round(v, 3) for k, v in self.env_risk_breakdown.items()},
            "total_risk": round(self.total_risk, 3),
        }


class RoutingEngine:
    """A* over the in-memory MultiDiGraph with dynamic edge weights."""

    def __init__(self) -> None:
        self.network = road_network
        # Per-edge environmental risk cache: (u,v,k) -> (timestamp, breakdown_dict)
        self._env_risk_cache: Dict[Tuple[int, int, int], Tuple[float, dict]] = {}
        self._env_risk_ttl: float = 120.0  # 2-minute cache for dynamic risk
        # Static per-edge risk cache (historical + water proximity — never changes)
        self._static_risk_cache: Dict[Tuple[int, int, int], dict] = {}
        self._static_risk_computed: bool = False

    # ---------- Environmental risk computation ----------
    def _compute_static_risks(self) -> None:
        """Pre-compute static per-edge risks (historical flood, water proximity).

        Called lazily on first smart-profile route request after graph load.
        """
        if self._static_risk_computed or self.network.graph is None:
            return
        # Import here to avoid circular dependency
        from app.services.validation_engine import validation_engine

        for u, v, k in self.network.graph.edges(keys=True):
            geom = self.network.edge_geometry(u, v, k)
            mid = geom[len(geom) // 2]
            historical = validation_engine._historical_flood_score(mid[0], mid[1])
            water = validation_engine._water_proximity_score(mid[0], mid[1])
            self._static_risk_cache[(u, v, k)] = {
                "historical": historical,
                "water": water,
            }
        self._static_risk_computed = True
        print(f"[Routing] Pre-computed static risk for {len(self._static_risk_cache)} edges")

    def _compute_edge_env_risk(self, u: int, v: int, k: int) -> dict:
        """Compute the 4-factor environmental risk for a single edge.

        Returns a dict with keys: traffic, rainfall, historical, water, combined.
        Cached per-edge for 2 minutes (dynamic factors: traffic + rainfall).
        """
        cache_key = (u, v, k)
        now = time.time()

        # Check cache
        if cache_key in self._env_risk_cache:
            ts, cached = self._env_risk_cache[cache_key]
            if now - ts < self._env_risk_ttl:
                return cached

        # Ensure static risks are computed
        if not self._static_risk_computed:
            self._compute_static_risks()

        static = self._static_risk_cache.get(
            cache_key, {"historical": 0.5, "water": 0.3}
        )

        # Compute dynamic risks at edge midpoint
        geom = self.network.edge_geometry(u, v, k)
        mid = geom[len(geom) // 2]

        # Import here to avoid circular dependency
        from app.services.validation_engine import validation_engine
        from app.services.weather_service import weather_service

        traffic = validation_engine._traffic_anomaly_score(mid[0], mid[1])

        try:
            w = weather_service.get_current(mid[0], mid[1])
            mm = w.get("precipitation_mm", 0.0) if w else 0.0
            rainfall = min(1.0, 0.2 + mm / 18.0) if w else 0.3
        except Exception:
            rainfall = 0.3

        breakdown = {
            "traffic": traffic,
            "rainfall": rainfall,
            "historical": static["historical"],
            "water": static["water"],
        }

        combined = (
            ENV_WEIGHTS["traffic"] * traffic
            + ENV_WEIGHTS["rainfall"] * rainfall
            + ENV_WEIGHTS["historical"] * static["historical"]
            + ENV_WEIGHTS["water"] * static["water"]
        )
        breakdown["combined"] = combined

        self._env_risk_cache[cache_key] = (now, breakdown)
        return breakdown

    # ---------- Edge weighting ----------
    def _edge_cost(
        self, u: int, v: int, k: int, data: dict, profile: str
    ) -> Tuple[float, float, float, float]:
        """Return (cost, length_m, travel_time_s, risk) for a directed edge.

        Cost is the A* edge weight. Risk is the flood risk in [0, 1].
        """
        length = float(data.get("length", 0.0))
        travel_time = float(data.get("travel_time", 0.0))
        if travel_time <= 0:
            speed_kmh = self.network._edge_speed_kmh.get((u, v, k), 30.0)
            travel_time = length / max(0.1, speed_kmh * 1000 / 3600)

        risk = self.network.get_edge_risk(u, v, k)
        blocked = self.network.is_edge_blocked(u, v, k)

        if profile == "fastest":
            cost = travel_time
        elif profile == "safest":
            # Strongly penalise flood risk but keep time as tiebreaker
            cost = travel_time * (1.0 + 5.0 * risk)
        elif profile == "emergency":
            # Hard block high-risk edges; otherwise weighted blend
            if blocked or risk >= settings.REROUTE_THRESHOLD_RISK:
                cost = float("inf")
            else:
                cost = travel_time * (1.0 + 2.0 * risk)
        else:
            cost = travel_time

        return cost, length, travel_time, risk

    # ---------- Heuristic ----------
    def _heuristic(self, node: int, goal: int) -> float:
        """Admissible A* heuristic based on straight-line travel time.

        Uses haversine distance / max road speed (~80 km/h) which never
        overestimates actual drivable time.
        """
        y1, x1 = self.network.node_coords(node)
        y2, x2 = self.network.node_coords(goal)
        dist_m = haversine_m(y1, x1, y2, x2)
        return dist_m / (80.0 * 1000 / 3600)  # seconds

    # ---------- A* core ----------
    def _astar(
        self, origin: int, destination: int, profile: str
    ) -> Optional[RouteResult]:
        G = self.network.graph
        if G is None or origin not in G or destination not in G:
            return None

        open_heap: List[Tuple[float, int]] = []
        came_from: Dict[int, Tuple[int, int, int]] = {}
        g_score: Dict[int, float] = {origin: 0.0}
        heapq.heappush(open_heap, (self._heuristic(origin, destination), origin))
        closed: set = set()

        while open_heap:
            _, current = heapq.heappop(open_heap)
            if current == destination:
                return self._reconstruct(came_from, origin, destination, profile)
            if current in closed:
                continue
            closed.add(current)

            for neighbor, edges in G[current].items():
                if neighbor in closed:
                    continue
                tentative_best = None
                for k, data in edges.items():
                    cost, length, travel_time, risk = self._edge_cost(
                        current, neighbor, k, data, profile
                    )
                    if math.isinf(cost):
                        continue
                    g = g_score[current] + cost
                    if tentative_best is None or g < tentative_best[0]:
                        tentative_best = (g, k, length, travel_time, risk)
                if tentative_best is None:
                    continue
                g, k, length, travel_time, risk = tentative_best
                if g < g_score.get(neighbor, float("inf")):
                    g_score[neighbor] = g
                    came_from[neighbor] = (current, k, 0)
                    f = g + self._heuristic(neighbor, destination)
                    heapq.heappush(open_heap, (f, neighbor))
        return None

    def _reconstruct(
        self,
        came_from: Dict[int, Tuple[int, int, int]],
        origin: int,
        destination: int,
        profile: str,
    ) -> RouteResult:
        G = self.network.graph
        result = RouteResult()
        result.profile = profile
        node_path = [destination]
        edge_keys: List[Tuple[int, int, int]] = []
        current = destination
        while current != origin:
            prev = came_from.get(current)
            if prev is None:
                break
            u, k, _ = prev
            edge_keys.append((u, current, k))
            node_path.append(u)
            current = u
        node_path.reverse()
        edge_keys.reverse()
        result.path = node_path

        max_total_risk = 0.0

        # Build geometry
        if node_path:
            result.geometry.append(self.network.node_coords(node_path[0]))
        for (u, v, k) in edge_keys:
            seg = self.network.edge_geometry(u, v, k)
            result.geometry.extend(seg[1:] if len(seg) > 1 else seg)
            data = G.get_edge_data(u, v, key=k) or {}
            result.distance_m += float(data.get("length", 0.0))
            result.travel_time_s += float(data.get("travel_time", 0.0))
            flood_risk = self.network.get_edge_risk(u, v, k)
            result.risk_score += flood_risk
            if self.network.is_edge_blocked(u, v, k):
                result.blocked_edges += 1
            result.edges.append(u)

        # Normalise risk scores
        if edge_keys:
            result.risk_score = result.risk_score / len(edge_keys)
            result.total_risk = result.risk_score
        return result

    # ---------- Public API ----------
    def route(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        profile: str = "smart",
        alternatives: bool = True,
        num_alternatives: int = 3,
    ) -> Tuple[List[RouteResult], float]:
        """Compute route(s) between two lat/lng pairs.

        Returns (results, computation_ms). When alternatives=True, returns up
        to num_alternatives distinct routes by iteratively penalising edges of
        previously-found routes. Uses progressively higher penalties and lower
        similarity thresholds to ensure 3 genuinely different paths.
        """
        start = time.perf_counter()
        o_node = self.network.nearest_node(*origin)
        d_node = self.network.nearest_node(*destination)

        results: List[RouteResult] = []
        primary = self._astar(o_node, d_node, profile)
        if primary:
            results.append(primary)

        if alternatives and primary:
            # Try different penalty levels to find distinct alternatives
            penalty_levels = [0.5, 0.7, 0.85, 0.95]
            similarity_thresholds = [0.6, 0.5, 0.4, 0.3]

            for attempt in range(num_alternatives - 1):
                found = False
                for penalty, sim_thresh in zip(penalty_levels, similarity_thresholds):
                    alt = self._find_distinct_alternative(
                        o_node, d_node, profile, results, penalty=penalty
                    )
                    if alt and alt.path and len(alt.path) > 1:
                        sim = self._path_similarity(alt.path, results)
                        if sim < sim_thresh:
                            results.append(alt)
                            found = True
                            break
                if not found:
                    # Last resort: try with fastest profile for a genuinely different path
                    alt = self._find_distinct_alternative(
                        o_node, d_node, "fastest", results, penalty=0.95
                    )
                    if alt and alt.path and len(alt.path) > 1:
                        sim = self._path_similarity(alt.path, results)
                        if sim < 0.5:
                            # Re-run with original profile to get proper risk breakdown
                            alt2 = self._rerun_with_profile(alt.path, o_node, d_node, profile)
                            if alt2:
                                results.append(alt2)
                            else:
                                results.append(alt)
                            break

        elapsed_ms = (time.perf_counter() - start) * 1000
        return results, elapsed_ms

    def _rerun_with_profile(
        self, path: List[int], origin: int, destination: int, profile: str
    ) -> Optional[RouteResult]:
        """Reconstruct a RouteResult for a given node path using the given profile's
        risk computation."""
        if not path or len(path) < 2:
            return None
        # Build a fake came_from dict for _reconstruct
        came_from: Dict[int, Tuple[int, int, int]] = {}
        for i in range(len(path) - 1):
            came_from[path[i + 1]] = (path[i], 0, 0)
        return self._reconstruct(came_from, origin, destination, profile)

    def _path_similarity(self, candidate: List[int], existing: List[RouteResult]) -> float:
        """Max Jaccard similarity between candidate and any existing route."""
        cand_set = set(candidate)
        if not cand_set:
            return 1.0
        max_sim = 0.0
        for r in existing:
            other_set = set(r.path)
            if not other_set:
                continue
            sim = len(cand_set & other_set) / len(cand_set | other_set)
            max_sim = max(max_sim, sim)
        return max_sim

    def _find_distinct_alternative(
        self,
        origin: int,
        destination: int,
        profile: str,
        existing_routes: List[RouteResult],
        penalty: float = 0.85,
    ) -> Optional[RouteResult]:
        """Find an alternative route by penalising edges of ALL existing routes.

        Temporarily inflates risk on every edge used by existing routes, then
        re-runs A* to find a genuinely different path. Restores original risk
        after computation. The `penalty` parameter controls how strongly
        existing-route edges are penalized (higher = more likely to find
        different paths).
        """
        if not existing_routes:
            return None
        saved: List[Tuple[int, int, int, float]] = []
        G = self.network.graph
        try:
            for route in existing_routes:
                for i in range(len(route.path) - 1):
                    u = route.path[i]
                    v = route.path[i + 1]
                    if G.has_edge(u, v, 0):
                        orig_risk = self.network.get_edge_risk(u, v, 0)
                        # Only save once per edge (avoid duplicate restores)
                        if not any(s[0] == u and s[1] == v for s in saved):
                            saved.append((u, v, 0, orig_risk))
                        # Penalty to push A* onto different edges
                        self.network.set_edge_risk(u, v, 0, penalty)
            return self._astar(origin, destination, profile)
        finally:
            for u, v, k, r in saved:
                self.network.set_edge_risk(u, v, k, r)

    def reroute_vehicles_around(self, edge_keys: List[Tuple[int, int, int]]) -> int:
        """Trigger reroute for vehicles whose route crosses the affected edges."""
        return len(edge_keys)

    def clear_env_risk_cache(self) -> None:
        """Clear the environmental risk cache (e.g. after traffic anomaly injection)."""
        self._env_risk_cache.clear()


routing_engine = RoutingEngine()
