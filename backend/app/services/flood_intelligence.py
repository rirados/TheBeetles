"""Flood Intelligence Engine.

Responsibilities:
  * Snap incoming reports to the nearest road segment
  * Compute a weighted Road Risk Score per edge
  * Update only affected graph edges (zero-pipeline, in-memory)
  * Propagate risk to neighboring edges with spatial decay
  * Apply time-based decay periodically
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import networkx as nx

from app.core.config import settings
from app.services.graph_loader import road_network
from app.utils.geo import haversine_m, snap_to_segment


@dataclass
class FloodUpdate:
    edge_keys: List[Tuple[int, int, int]]
    risk_after: Dict[Tuple[int, int, int], float]
    blocked_after: Dict[Tuple[int, int, int], bool]
    timestamp: datetime


class FloodIntelligenceEngine:
    """Map flood reports to road risk in-memory."""

    def __init__(self) -> None:
        self.network = road_network

    # ---------- Snapping ----------
    def snap_to_road(self, lat: float, lng: float) -> Tuple[Optional[Tuple[int, int, int]], float, Tuple[float, float]]:
        """Find the nearest road edge to a (lat, lng) point.

        Returns (edge_key | None, distance_m, snapped_point).
        """
        G = self.network.graph
        if G is None:
            return None, float("inf"), (lat, lng)

        # First reduce candidate set via nearest node, then scan edges in a radius
        nn = self.network.nearest_node(lat, lng)
        candidate_nodes = set([nn])
        # 2-hop neighbourhood
        for nbr in G.neighbors(nn):
            candidate_nodes.add(nbr)
            for nbr2 in G.neighbors(nbr):
                candidate_nodes.add(nbr2)
                if len(candidate_nodes) > 200:
                    break
            if len(candidate_nodes) > 200:
                break

        best_edge = None
        best_dist = float("inf")
        best_point = (lat, lng)
        for u in candidate_nodes:
            for v, edges in G[u].items():
                for k, data in edges.items():
                    seg = self.network.edge_geometry(u, v, k)
                    dist, snapped = snap_to_segment(lat, lng, seg)
                    if dist < best_dist:
                        best_dist = dist
                        best_edge = (u, v, k)
                        best_point = snapped
        return best_edge, best_dist, best_point

    # ---------- Risk scoring ----------
    def _depth_to_base_risk(self, depth_label: str) -> float:
        return settings.RISK_DEPTH_MULTIPLIER.get(depth_label, 0.5)

    def _compute_edge_risk(
        self,
        depth_label: str,
        confidence: float,
        distance_m: float,
    ) -> float:
        """Weighted Road Risk Score for a single edge."""
        base = self._depth_to_base_risk(depth_label)
        # Distance decay: if report is more than 30m off the edge, decay
        distance_factor = math.exp(-max(0.0, distance_m - 5.0) / 30.0)
        # Confidence scales the influence (low-confidence reports have small effect)
        risk = base * distance_factor * (0.4 + 0.6 * confidence)
        return max(0.0, min(1.0, risk))

    # ---------- Edge update ----------
    def apply_report(
        self,
        lat: float,
        lng: float,
        depth_label: str,
        confidence: float,
    ) -> FloodUpdate:
        """Snap a report and update affected edges in-memory.

        Updates the primary edge plus immediate neighbors with decay.
        """
        G = self.network.graph
        edge_key, dist, snapped = self.snap_to_road(lat, lng)
        affected_edges: List[Tuple[int, int, int]] = []
        risk_after: Dict[Tuple[int, int, int], float] = {}
        blocked_after: Dict[Tuple[int, int, int], bool] = {}
        now = datetime.utcnow()

        if edge_key is None:
            return FloodUpdate(affected_edges, risk_after, blocked_after, now)

        u, v, k = edge_key
        primary_risk = self._compute_edge_risk(depth_label, confidence, dist)
        # Update primary edge (take max with existing to avoid damping from old data)
        existing = self.network.get_edge_risk(u, v, k)
        new_risk = max(existing, primary_risk)
        self.network.set_edge_risk(u, v, k, new_risk)
        affected_edges.append((u, v, k))
        risk_after[(u, v, k)] = new_risk
        blocked_after[(u, v, k)] = new_risk >= settings.REROUTE_THRESHOLD_RISK
        self.network.set_edge_blocked(u, v, k, blocked_after[(u, v, k)])

        # Propagate to adjacent edges with decay
        decay = 0.6
        for nbr in G.neighbors(v):
            for k2 in G[v][nbr].keys():
                r = primary_risk * decay
                existing2 = self.network.get_edge_risk(v, nbr, k2)
                new2 = max(existing2, r)
                self.network.set_edge_risk(v, nbr, k2, new2)
                affected_edges.append((v, nbr, k2))
                risk_after[(v, nbr, k2)] = new2
                blocked_after[(v, nbr, k2)] = new2 >= settings.REROUTE_THRESHOLD_RISK
                self.network.set_edge_blocked(v, nbr, k2, blocked_after[(v, nbr, k2)])

        # Also update reverse direction (roads are bidirectional for flooding)
        for (a, b, kk) in list(affected_edges):
            if G.has_edge(b, a, 0):
                r = self.network.get_edge_risk(a, b, kk)
                self.network.set_edge_risk(b, a, 0, r)
                self.network.set_edge_blocked(b, a, 0, r >= settings.REROUTE_THRESHOLD_RISK)
                affected_edges.append((b, a, 0))
                risk_after[(b, a, 0)] = r
                blocked_after[(b, a, 0)] = r >= settings.REROUTE_THRESHOLD_RISK

        return FloodUpdate(affected_edges, risk_after, blocked_after, now)

    def decay_all(self, hours: float = 1.0) -> None:
        """Apply exponential decay to all edge risk scores."""
        self.network.decay_risk(hours)


flood_intelligence = FloodIntelligenceEngine()
