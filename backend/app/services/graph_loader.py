"""Road network graph loader.

Uses OSMnx to download the drivable road network for a target area and keeps
it fully in memory for sub-second A* queries. Falls back to a synthetic grid
graph if OSMnx cannot reach the network (e.g., offline demo).
"""
from __future__ import annotations

import math
import os
import osmnx as ox
import networkx as nx
from typing import Dict, List, Optional, Tuple

from app.core.config import settings
from app.utils.geo import haversine_m

ox.settings.use_cache = True
ox.settings.log_console = False


class RoadNetworkManager:
    """Holds the in-memory MultiDiGraph and exposes routing helpers."""

    def __init__(self) -> None:
        self.graph: Optional[nx.MultiDiGraph] = None
        self.graph_proj: Optional[nx.MultiDiGraph] = None  # projected for A* heuristic
        self.nodes_gdf = None
        self.edges_gdf = None
        self._bbox: Tuple[float, float, float, float] = settings.DEFAULT_BBOX
        self._edge_risk: Dict[Tuple[int, int, int], float] = {}
        self._edge_blocked: Dict[Tuple[int, int, int], bool] = {}
        self._edge_speed_kmh: Dict[Tuple[int, int, int], float] = {}

    # ---------- Loading ----------
    def load(self, place: Optional[str] = None) -> None:
        """Load graph from OSMnx.

        Load order:
          1. Cached graph at DEFAULT_GRAPH_CACHE (if a previous live download succeeded)
          2. Bundled graph at app/data/mangalore_roads.graphml (real OSM data, always available)
          3. Live OSMnx download (place -> bbox)
          4. Synthetic grid graph (last resort, produces straight-line routes)

        This ensures routes always trace real road geometry, even in network-restricted
        environments like Docker containers without internet access.
        """
        place = place or settings.DEFAULT_PLACE
        cache_path = settings.DEFAULT_GRAPH_CACHE
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)

        # Path to the bundled real OSM graph (shipped with the project)
        bundled_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data", "mangalore_roads.graphml"
        )

        G = None
        source = None

        # ---- 1. Try runtime cache first ----
        if os.path.exists(cache_path):
            try:
                print(f"[Graph] Loading cached graph from {cache_path}")
                G = ox.load_graphml(cache_path)
                source = "cache"
            except Exception as e:
                print(f"[Graph] Cache load failed ({e}), trying other sources...")

        # ---- 2. Try bundled real OSM graph ----
        if G is None and os.path.exists(bundled_path):
            try:
                print(f"[Graph] Loading bundled real OSM graph from {bundled_path}")
                G = ox.load_graphml(bundled_path)
                source = "bundled"
                # Also save to cache so subsequent loads are faster
                try:
                    ox.save_graphml(G, cache_path)
                except Exception:
                    pass
            except Exception as e:
                print(f"[Graph] Bundled graph load failed ({e})")

        # ---- 3. Try live OSMnx download ----
        if G is None:
            print(f"[Graph] Attempting live download for {place} ...")
            try:
                G = ox.graph_from_place(place, network_type=settings.DEFAULT_NETWORK_TYPE)
                source = "live-place"
                print(f"[Graph] Place lookup succeeded: {len(G.nodes)} nodes")
            except Exception as e1:
                print(f"[Graph] Place lookup failed ({e1}); trying bbox...")
                lat_min, lng_min, lat_max, lng_max = settings.DEFAULT_BBOX
                osmnx_bbox = (lng_min, lat_min, lng_max, lat_max)
                print(f"[Graph] bbox (left,bottom,right,top) = {osmnx_bbox}")
                try:
                    G = ox.graph_from_bbox(
                        bbox=osmnx_bbox,
                        network_type=settings.DEFAULT_NETWORK_TYPE,
                    )
                    source = "live-bbox"
                    print(f"[Graph] Bbox download succeeded: {len(G.nodes)} nodes")
                except Exception as e2:
                    print(f"[Graph] Live download failed ({e2})")

            if G is not None:
                # Cache the live-downloaded graph for future runs
                try:
                    ox.save_graphml(G, cache_path)
                    print(f"[Graph] Cached to {cache_path}")
                except Exception:
                    pass

        # ---- 4. Last resort: synthetic grid ----
        if G is None:
            print(f"[Graph] All graph sources failed; building synthetic grid graph")
            self.graph = self._build_synthetic_graph()
            self._init_edge_state()
            print(
                f"[Graph] Synthetic graph built: {len(self.graph.nodes)} nodes, "
                f"{len(self.graph.edges)} edges (WARNING: routes will NOT follow real roads)"
            )
            return

        # ---- Finalize: add speeds/travel times ----
        try:
            G = ox.add_edge_speeds(G)
            G = ox.add_edge_travel_times(G)
        except Exception as e:
            print(f"[Graph] Warning: could not add speeds/travel_times ({e})")

        self.graph = G
        try:
            self.nodes_gdf, self.edges_gdf = ox.graph_to_gdfs(G)
            self._bbox = (
                float(self.nodes_gdf["y"].min()),
                float(self.nodes_gdf["x"].min()),
                float(self.nodes_gdf["y"].max()),
                float(self.nodes_gdf["x"].max()),
            )
        except Exception:
            # Fallback: compute bbox from node data directly
            ys = [float(d.get("y", 0)) for _, d in G.nodes(data=True)]
            xs = [float(d.get("x", 0)) for _, d in G.nodes(data=True)]
            self._bbox = (min(ys), min(xs), max(ys), max(xs))

        self._init_edge_state()
        print(
            f"[Graph] Loaded {len(G.nodes)} nodes, {len(G.edges)} edges "
            f"(source: {source}) bbox={self._bbox}"
        )

    def _init_edge_state(self) -> None:
        self._edge_risk.clear()
        self._edge_blocked.clear()
        self._edge_speed_kmh.clear()
        for u, v, k, data in self.graph.edges(keys=True, data=True):
            key = (u, v, k)
            self._edge_risk[key] = 0.0
            self._edge_blocked[key] = False
            speed = data.get("speed_kph") or data.get("speed_kmh") or 30.0
            try:
                self._edge_speed_kmh[key] = float(speed)
            except (TypeError, ValueError):
                self._edge_speed_kmh[key] = 30.0

    def _build_synthetic_graph(self) -> nx.MultiDiGraph:
        """Build a synthetic grid graph for offline demo / fallback."""
        G = nx.MultiDiGraph(crs="EPSG:4326")
        lat_min, lng_min, lat_max, lng_max = settings.DEFAULT_BBOX
        rows, cols = 14, 18
        for r in range(rows):
            for c in range(cols):
                lat = lat_min + (lat_max - lat_min) * r / (rows - 1)
                lng = lng_min + (lng_max - lng_min) * c / (cols - 1)
                G.add_node(r * cols + c, y=lat, x=lng, street_count=2)

        def _edge_data(u: int, v: int) -> dict:
            y1, x1 = G.nodes[u]["y"], G.nodes[u]["x"]
            y2, x2 = G.nodes[v]["y"], G.nodes[v]["x"]
            length = haversine_m(y1, x1, y2, x2)
            speed_kmh = 40.0
            travel_time = length / (speed_kmh * 1000 / 3600)
            return {
                "length": length,
                "speed_kph": speed_kmh,
                "travel_time": travel_time,
                "highway": "residential",
                "name": f"road-{u}-{v}",
                "osmid": 1_000_000 + u * 100 + v,
            }

        for r in range(rows):
            for c in range(cols):
                node = r * cols + c
                if c + 1 < cols:
                    other = r * cols + (c + 1)
                    G.add_edge(node, other, key=0, **_edge_data(node, other))
                    G.add_edge(other, node, key=0, **_edge_data(other, node))
                if r + 1 < rows:
                    other = (r + 1) * cols + c
                    G.add_edge(node, other, key=0, **_edge_data(node, other))
                    G.add_edge(other, node, key=0, **_edge_data(other, node))
        return G

    # ---------- Lookup helpers ----------
    def nearest_node(self, lat: float, lng: float) -> int:
        """Find the nearest graph node to (lat, lng).

        Tries OSMnx first; falls back to a brute-force scan if sklearn
        isn't available (which OSMnx requires for unprojected graphs).
        """
        if self.graph is None:
            raise RuntimeError("Graph not loaded")
        try:
            return ox.distance.nearest_nodes(self.graph, X=lng, Y=lat)
        except Exception:
            # Brute-force fallback (fast enough for city-scale graphs <10k nodes)
            best = None
            best_d = float("inf")
            for n, data in self.graph.nodes(data=True):
                d = (data["y"] - lat) ** 2 + (data["x"] - lng) ** 2
                if d < best_d:
                    best_d = d
                    best = n
            return best

    def node_coords(self, node_id: int) -> Tuple[float, float]:
        n = self.graph.nodes[node_id]
        return float(n["y"]), float(n["x"])

    def edge_geometry(self, u: int, v: int, k: int = 0) -> List[Tuple[float, float]]:
        """Return list of (lat, lng) along a single edge."""
        data = self.graph.get_edge_data(u, v, key=k)
        if not data:
            return [self.node_coords(u), self.node_coords(v)]
        if "geometry" in data and data["geometry"] is not None:
            return [(float(y), float(x)) for x, y in data["geometry"].coords]
        return [self.node_coords(u), self.node_coords(v)]

    # ---------- Risk state ----------
    def set_edge_risk(self, u: int, v: int, k: int, risk: float) -> None:
        self._edge_risk[(u, v, k)] = max(0.0, min(1.0, risk))

    def get_edge_risk(self, u: int, v: int, k: int = 0) -> float:
        return self._edge_risk.get((u, v, k), 0.0)

    def set_edge_blocked(self, u: int, v: int, k: int, blocked: bool) -> None:
        self._edge_blocked[(u, v, k)] = blocked

    def is_edge_blocked(self, u: int, v: int, k: int = 0) -> bool:
        return self._edge_blocked.get((u, v, k), False)

    def all_edge_risk(self) -> Dict[Tuple[int, int, int], float]:
        return dict(self._edge_risk)

    def affected_edges(self, threshold: float = 0.05) -> int:
        return sum(1 for r in self._edge_risk.values() if r >= threshold)

    def high_risk_edges(self, threshold: float = 0.6) -> int:
        return sum(1 for r in self._edge_risk.values() if r >= threshold)

    def decay_risk(self, hours: float = 1.0) -> None:
        """Apply time-based risk decay across all edges."""
        factor = math.exp(-settings.RISK_DECAY_PER_HOUR * hours)
        for key in list(self._edge_risk.keys()):
            self._edge_risk[key] *= factor
            if self._edge_risk[key] < 0.02:
                self._edge_risk[key] = 0.0
                self._edge_blocked[key] = False

    @property
    def bbox(self) -> Tuple[float, float, float, float]:
        return self._bbox


road_network = RoadNetworkManager()
