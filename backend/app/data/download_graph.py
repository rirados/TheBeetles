"""Download and bundle the real Mangalore OSM road graph.

This script downloads the drivable road network for the Mangalore bbox using
OSMnx and saves it as a bundled GraphML file. The graph loader uses this
bundled file as a fallback when the live OSMnx download fails (e.g., in
network-restricted Docker environments).

Run this script once to regenerate the bundled graph:
    python -m app.data.download_graph
"""
from __future__ import annotations

import os

import osmnx as ox

# Mangalore coastal region bbox (lat_min, lng_min, lat_max, lng_max)
BBOX = (12.8600, 74.7800, 12.9600, 74.9200)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "mangalore_roads.graphml")


def download_and_save() -> None:
    lat_min, lng_min, lat_max, lng_max = BBOX
    # OSMnx 2.0 expects bbox=(left, bottom, right, top) = (lng_min, lat_min, lng_max, lat_max)
    osmnx_bbox = (lng_min, lat_min, lng_max, lat_max)
    print(f"[Download] Fetching road network for bbox {osmnx_bbox} ...")

    # Try place-based download first (richer polygon boundary)
    G = None
    try:
        G = ox.graph_from_place("Mangalore, Karnataka, India", network_type="drive")
        print(f"[Download] Place lookup succeeded: {len(G.nodes)} nodes")
    except Exception as e:
        print(f"[Download] Place lookup failed ({e}), trying bbox...")
        try:
            G = ox.graph_from_bbox(bbox=osmnx_bbox, network_type="drive")
            print(f"[Download] Bbox download succeeded: {len(G.nodes)} nodes")
        except Exception as e2:
            print(f"[Download] Bbox also failed ({e2})")
            raise

    # Add speeds and travel times
    G = ox.add_edge_speeds(G)
    G = ox.add_edge_travel_times(G)

    # Save
    ox.save_graphml(G, OUTPUT_PATH)
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"[Download] Saved to {OUTPUT_PATH} ({size_kb:.0f} KB)")
    print(f"[Download] {len(G.nodes)} nodes, {len(G.edges)} edges")

    # Verify edge geometries exist
    sample = list(G.edges(keys=True, data=True))[:5]
    for u, v, k, data in sample:
        has_geom = "geometry" in data and data["geometry"] is not None
        print(f"  Edge {u}->{v}: geometry={has_geom}, length={data.get('length', 'N/A')}")


if __name__ == "__main__":
    download_and_save()
