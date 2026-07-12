# Development Plan & Module Order

This document captures the recommended order for building FloodGuardian from scratch in a 24-hour hackathon window. Total estimated time: **18–22 hours** including testing and demo polish.

---

## Phase 1 — Foundation (Hours 0–4)

### 1.1 Project Skeleton (30 min)
- Create `backend/` and `frontend/` folders
- Set up Python venv, install FastAPI stack
- Set up Vite + React + Tailwind
- Verify `hello world` end-to-end

### 1.2 Configuration & Database (1 hr)
- `app/core/config.py` — Pydantic settings
- `app/core/database.py` — SQLAlchemy engine + session
- `app/models/db_models.py` — All 6 ORM models
- `app/models/schemas.py` — Pydantic request/response schemas
- Run `init_db()` on startup; verify tables created

### 1.3 Road Network Loader (1.5 hrs)
- `app/services/graph_loader.py`
- OSMnx download for Mangalore (or fallback bbox)
- Cache to GraphML
- In-memory `_edge_risk` and `_edge_blocked` dicts
- Synthetic grid fallback if OSMnx fails
- **Validate**: `len(graph.nodes) > 1000` after load

### 1.4 Geo Utilities (30 min)
- `app/utils/geo.py` — haversine, bearing, snap-to-segment
- Unit-test snap-to-segment on a known polyline

---

## Phase 2 — Core Intelligence (Hours 4–10)

### 2.1 Routing Engine (2 hrs)
- `app/services/routing_engine.py`
- A* with admissible heuristic
- 3 cost profiles (fastest / safest / emergency)
- `_alternative_path` via edge penalty
- **Validate**: route between two random nodes returns valid path < 500 ms

### 2.2 Weather Service (45 min)
- `app/services/weather_service.py`
- Open-Meteo current weather endpoint
- 5-minute cache by rounded lat/lng
- Graceful fallback on API failure

### 2.3 Validation Engine (2 hrs)
- `app/services/validation_engine.py`
- 5 signal scorers (photo_geo, traffic, rainfall, historical, water_proximity)
- Weighted sum + agreement bonus
- Traffic anomaly store (in-memory)
- **Validate**: a report with photo + heavy rain → confidence > 0.7
- **Validate**: a report with no photo + no rain → confidence < 0.4

### 2.4 Flood Intelligence Engine (1.5 hrs)
- `app/services/flood_intelligence.py`
- `snap_to_road` — nearest edge with 2-hop candidate expansion
- `_compute_edge_risk` — depth × distance × confidence
- `apply_report` — update primary + neighbors + reverse direction
- `decay_all` — exponential decay
- **Validate**: report at (12.91, 74.85) with depth=knee, conf=0.8 → primary edge risk > 0.5

---

## Phase 3 — Real-Time Layer (Hours 10–13)

### 3.1 PubSub Adapter (30 min)
- `app/core/pubsub.py`
- In-memory bus + optional Redis adapter
- Bridge to WebSocket manager

### 3.2 WebSocket Manager (1 hr)
- `app/services/websocket_manager.py`
- Channel-based connection tracking (admin / citizen)
- `broadcast(event, payload, channels)`
- Heartbeat handling

### 3.3 Rescue Dispatcher (1.5 hrs)
- `app/services/rescue_dispatcher.py`
- `select_nearest_vehicle` — haversine sort
- `assign_vehicle` — route + status update
- `reroute_affected_vehicles` — detect blocked edges in path, A* reroute
- `_simulation_loop` — 2-second tick, advance vehicles along geometry
- **Validate**: dispatch an idle vehicle, watch it move toward incident

---

## Phase 4 — API Surface (Hours 13–15)

### 4.1 Citizen Routes (30 min)
- POST/GET `/citizen/reports`
- GET `/citizen/nearby`
- GET `/citizen/alerts`

### 4.2 Routing Routes (30 min)
- POST `/route/plan` — returns primary + alternatives
- POST `/route/dispatch` — assign vehicle + compute route

### 4.3 Admin Routes (45 min)
- GET `/admin/metrics`
- GET `/admin/weather`
- GET `/admin/map/state`
- POST `/admin/traffic/anomaly`
- POST `/admin/risk/decay`

### 4.4 Vehicle + Incident + Alert Routes (45 min)
- CRUD for vehicles, incidents, alerts
- `/vehicles/seed` for demo fleet

---

## Phase 5 — Frontend (Hours 15–20)

### 5.1 Scaffolding (30 min)
- Vite + React + Tailwind + Leaflet setup
- Dark theme tokens
- Router (citizen / admin)

### 5.2 Hooks & Services (45 min)
- `useWebSocket` — single connection per channel
- `useGeolocation` — HTML5 wrapper
- `services/api.js` — fetch wrapper

### 5.3 Citizen Page (2 hrs)
- Camera capture component (getUserMedia + canvas overlay for GPS + timestamp)
- Report form (hazard type, depth, description, photo)
- Map with citizen location + accuracy circle
- Nearby facilities panel
- Active alerts panel
- Submission acknowledgement with validation breakdown

### 5.4 Admin Dashboard (2.5 hrs)
- MetricsBar — top KPI strip
- Live Map — flood edges colored by risk, vehicles, incidents, facilities
- AdminSidebar with 5 tabs:
  - Incidents (open / resolved, dispatch controls)
  - Vehicles (active / on-scene / idle)
  - Reports (filter, search, confidence breakdown)
  - Alerts (issue / clear)
  - Weather (current conditions + traffic anomaly injector)
- LiveFeedPanel — bottom-left overlay with event stream
- Profile selector (fastest / safest / emergency)
- Real-time updates from WebSocket

---

## Phase 6 — Integration & Demo Polish (Hours 20–24)

### 6.1 End-to-End Testing (1 hr)
- Submit report from citizen → see it appear on admin
- Dispatch vehicle → watch it move
- Submit flood report on vehicle's path → see reroute
- Issue alert → see it on citizen app
- Verify metrics update in real-time

### 6.2 Seed Data (30 min)
- 12 facilities across Mangalore
- 6 demo vehicles (ambulances, fire truck, police, NDRF, boat)
- 3 sample incidents
- 3 sample alerts

### 6.3 Documentation (45 min)
- README with quickstart
- ARCHITECTURE.md with diagrams
- API reference (auto-generated by FastAPI at /docs)

### 6.4 Demo Script (30 min)
- 5-minute walkthrough script
- Pre-seeded state
- Known scenarios that work reliably

### 6.5 Buffer (1 hr)
- Bug fixes
- Performance tuning
- Demo rehearsal

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| OSMnx download fails (network) | Synthetic grid fallback in `graph_loader.py` |
| Open-Meteo rate limit / down | 5-min cache + zero-rainfall fallback |
| Browser blocks camera / GPS | Graceful UI messages; allow file upload fallback |
| A* too slow on large graph | Bbox limited to city; admissible heuristic keeps it fast |
| Vehicle simulation drift | Recompute nearest node each tick; snap to geometry |
| Race condition on edge risk | In-process dict is single-threaded by GIL; multi-process needs Redis |
