# FloodGuardian — Architecture & Data Flow

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                   │
│  ┌──────────────────────┐         ┌────────────────────────────────┐  │
│  │  Citizen React App   │         │  Admin Dashboard React App     │  │
│  │  (Leaflet + HTML5    │         │  (Leaflet + Live WS feed +     │  │
│  │   Geolocation +      │         │   metrics bar + sidebar tabs)  │  │
│  │   Camera capture)    │         │                                │  │
│  └──────────┬───────────┘         └──────────────┬─────────────────┘  │
└─────────────┼─────────────────────────────────────┼────────────────────┘
              │ HTTP /api/v1/*                      │ HTTP /api/v1/*
              │ WS  /ws/citizen                     │ WS  /ws/admin
              ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       FASTAPI BACKEND                                   │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ citizen.py   │  │ routing.py   │  │ vehicles.py  │  │ admin.py   │ │
│  │ alerts.py    │  │ incidents.py │  │ websocket.py │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │                │        │
│         ▼                 ▼                 ▼                ▼        │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                    SERVICE LAYER                             │     │
│  │                                                              │     │
│  │  Validation    Flood        Routing       Rescue            │     │
│  │  Engine        Intelligence Engine       Dispatcher         │     │
│  │  ─────────     ──────────    ─────────    ──────────        │     │
│  │  • photo geo   • snap to     • A*         • nearest vehicle │     │
│  │  • traffic     edge          • 3 profiles • route assign    │     │
│  │  • rainfall    • risk score  • alternatives• reroute on     │     │
│  │  • historical  • edge update • incremental   flooding       │     │
│  │  • water       • propagation                  • simulation  │     │
│  │                                                              │     │
│  │  Weather       WS Manager   PubSub                          │     │
│  │  Service       (Redis or                                    │     │
│  │  (Open-Meteo)  in-memory)                                   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │              RoadNetworkManager (in-memory)                  │     │
│  │                                                              │     │
│  │  MultiDiGraph (OSMnx / NetworkX)                            │     │
│  │  • nodes (lat/lng)                                           │     │
│  │  • edges (length, travel_time, speed)                       │     │
│  │  • _edge_risk: Dict[(u,v,k) → float in 0..1]                │     │
│  │  • _edge_blocked: Dict[(u,v,k) → bool]                      │     │
│  └──────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       PERSISTENCE LAYER                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────────┐ │
│  │ SQLite /    │  │ Redis       │  │ GraphML cache                  │ │
│  │ PostgreSQL  │  │ (optional)  │  │ ./cache/road_graph.graphml     │ │
│  │             │  │ pub/sub     │  │ (OSMnx download cached)        │ │
│  │ Reports     │  │             │  │                                 │ │
│  │ Vehicles    │  │             │  │                                 │ │
│  │ Incidents   │  │             │  │                                 │ │
│  │ Alerts      │  │             │  │                                 │ │
│  │ Facilities  │  │             │  │                                 │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Processing Pipeline (per citizen report)

```
                  ┌──────────────────────────────┐
                  │   Citizen React App          │
                  │   1. GPS via HTML5 Geo API   │
                  │   2. Camera capture (shutter │
                  │      time + GPS embedded)    │
                  │   3. Hazard type + depth     │
                  └──────────────┬───────────────┘
                                 │
                                 ▼ POST /api/v1/citizen/reports
                  ┌──────────────────────────────┐
                  │   Validation Engine          │
                  │   ─────────────────          │
                  │   Weighted score [0,1]:      │
                  │   • 0.40 photo_geo           │
                  │   • 0.25 traffic_anomaly     │
                  │   • 0.15 rainfall            │
                  │   • 0.12 historical_flood    │
                  │   • 0.08 water_proximity     │
                  │   Bonus +0.1 if 3+ agree     │
                  └──────────────┬───────────────┘
                                 │
                       accepted if conf ≥ 0.45
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │   Map Matching               │
                  │   snap_to_road(lat, lng)     │
                  │   → nearest OSM edge (u,v,k) │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │   Flood Intelligence Engine  │
                  │   ──────────────────────     │
                  │   base_risk = depth_multiplier│
                  │   × distance_decay            │
                  │   × (0.4 + 0.6 × confidence)  │
                  │                              │
                  │   Update primary edge (max)   │
                  │   Propagate to neighbors ×0.6 │
                  │   Mirror to reverse direction │
                  │   Block if risk ≥ 0.6         │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │   Dynamic Edge Weight Update │
                  │   ──────────────────────     │
                  │   _edge_risk[(u,v,k)] = ...  │
                  │   _edge_blocked[(u,v,k)] = … │
                  │   (in-memory, O(edges))      │
                  └──────────────┬───────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
  ┌──────────────────────────┐     ┌──────────────────────────┐
  │  Rescue Dispatcher       │     │  WebSocket Manager       │
  │  ──────────────────      │     │  ──────────────────      │
  │  For each en_route veh:  │     │  Broadcast to admins:    │
  │   - check if path crosses│     │   • flood_update         │
  │     newly blocked edge   │     │   • report_new           │
  │   - if yes: A* reroute   │     │                          │
  │     (sub-second)         │     │  Broadcast to citizens:  │
  │   - update route in DB   │     │   • alert_new (if any)   │
  │   - emit vehicle_rerouted│     │                          │
  └──────────────┬───────────┘     └──────────┬───────────────┘
                 │                            │
                 └────────────┬───────────────┘
                              ▼
                  ┌──────────────────────────────┐
                  │   Admin Dashboard            │
                  │   ───────────────────        │
                  │   • Map updates live         │
                  │   • Risk-colored road edges  │
                  │   • Vehicle positions tick   │
                  │   • Live Event Feed          │
                  │   • Metrics bar refreshes    │
                  └──────────────────────────────┘
```

## WebSocket Event Catalog

| Event | Channels | Trigger | Payload |
|-------|----------|---------|---------|
| `connected` | both | WS connect | `{channel, timestamp}` |
| `report_new` | admin | Citizen submits report | `{id, lat, lng, hazard_type, confidence, status}` |
| `flood_update` | admin | Report accepted | `{lat, lng, affected_edges[], blocked_edges[]}` |
| `incident_new` | admin | Incident created | `{id, title, priority, lat, lng}` |
| `incident_resolved` | admin | Incident resolved | `{id}` |
| `vehicle_dispatched` | admin | Dispatch called | `{vehicle_id, call_sign, eta_s, geometry}` |
| `vehicle_rerouted` | admin | Blocked edge detected | `{vehicle_id, new_eta_s, reroute_ms}` |
| `vehicle_positions` | admin | Simulation tick (2s) | `{vehicles: [{vehicle_id, lat, lng, speed_kmh}]}` |
| `vehicle_arrived` | both | Vehicle reaches destination | `{vehicles: [...]}` |
| `alert_new` | both | Alert issued | `{id, severity, title, body, area}` |
| `alert_cleared` | both | Alert deactivated | `{id}` |

## A* Edge Cost Functions

```
For each directed edge (u, v, k) with travel_time t and risk r ∈ [0,1]:

fastest:    cost = t
safest:     cost = t × (1 + 5r)
emergency:  cost = ∞            if blocked or r ≥ 0.6
            cost = t × (1 + 2r) otherwise

Heuristic: h(n, goal) = haversine(n, goal) / (80 km/h)   [admissible]
```

## Validation Engine Signals (Detail)

```
photo_geo (0.40):
  base = 0.05 (no photo) or 0.50 (photo present)
  + 0.30 × exp(-distance_m / 75)   if photo GPS within 50m of report GPS
  + 0.20                            if shutter_time < 15 min ago
  + 0.10                            if 15–60 min ago

traffic_anomaly (0.25):
  best score from in-memory anomaly store within 800m
  weighted by exp(-distance_m / 500)

rainfall (0.15):
  Open-Meteo current precipitation_mm
  0mm → 0.2 | 5mm → 0.6 | 15mm+ → 1.0
  (cached 5 min)

historical_flood (0.12):
  Proxy: latitude band within bbox + sinusoidal variation
  Prod: NRSC/ISRO/Bhuvan flood susceptibility WMS

water_proximity (0.08):
  Proxy: distance to coastline (west of bbox)
  Prod: OSM water polygon Overpass query

confidence = Σ(weight_i × score_i)
  + 0.10 bonus if ≥3 scores > 0.5
```
