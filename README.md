# 🌊 FloodGuardian

**Flood-Aware Emergency Response Decision Engine**

A live emergency command center that continuously receives flood information, validates it, updates an in-memory road network, recalculates rescue routes, and assists emergency responders in making deployment decisions during severe weather disruptions.

Built for the **24-hour hackathon**. Production-quality architecture, hackathon-feasible implementation.

---

## 🎯 Problem Statement

Standard navigation apps do not account for real-time flood depths or rapid map changes during extreme monsoon events, often routing emergency responders into submerged paths. **FloodGuardian** solves this by:

- Computing map changes **in-memory** (zero-pipeline, no batch processing)
- Recalculating routes in **under a second** when new environmental data arrives
- Running entirely on **free / open data sources** (OpenStreetMap, Open-Meteo) — no commercial map APIs

---

## 🏗️ Architecture

### Processing Pipeline

```
Citizen Report
   ↓
Validation Engine (geotagged photo + traffic anomaly + rainfall + historical flood + water proximity)
   ↓
Map Matching (snap to nearest OSM edge)
   ↓
Flood Intelligence Engine (weighted Road Risk Score)
   ↓
Dynamic Edge Weight Update (in-memory, only affected edges)
   ↓
Incremental A* Routing (Fastest / Safest / Emergency)
   ↓
Rescue Dispatcher (auto-assign + reroute affected vehicles)
   ↓
WebSocket Broadcast (admin + citizen channels)
   ↓
Admin Dashboard (live control room)
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend API | **FastAPI** + Python 3.11+ |
| Road Network | **OSMnx** + **NetworkX** with custom A* |
| Database | **PostgreSQL** (prod) / **SQLite** (hackathon) via SQLAlchemy |
| Cache / PubSub | **Redis** (prod) / in-memory bus (hackathon fallback) |
| Real-time | **WebSockets** (FastAPI native) |
| Frontend | **React 18** + **Vite** + **Leaflet** |
| Weather | **Open-Meteo** (free, no API key) |
| Maps | **OpenStreetMap** tiles (CartoDB Dark Matter) |

---

## 📁 Folder Structure

```
floodguardian/
├── backend/
│   ├── app/
│   │   ├── api/                  # FastAPI route modules
│   │   │   ├── admin.py          # Metrics, weather, map state, traffic anomalies
│   │   │   ├── alerts.py         # CRUD for emergency alerts
│   │   │   ├── citizen.py        # Report submission, nearby, alerts
│   │   │   ├── incidents.py      # Incident lifecycle
│   │   │   ├── routing.py        # /route/plan + /route/dispatch
│   │   │   ├── vehicles.py       # Fleet CRUD + seed
│   │   │   └── websocket.py      # /ws/{admin|citizen}
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic settings
│   │   │   ├── database.py       # SQLAlchemy engine/session
│   │   │   └── pubsub.py         # Redis / in-memory adapter
│   │   ├── models/
│   │   │   ├── db_models.py      # ORM: Report, Vehicle, Incident, Alert, Facility
│   │   │   └── schemas.py        # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── graph_loader.py   # OSMnx loader + synthetic fallback
│   │   │   ├── routing_engine.py # A* with 3 profiles + alternatives
│   │   │   ├── validation_engine.py  # Confidence scoring
│   │   │   ├── flood_intelligence.py # Risk scoring + edge update
│   │   │   ├── weather_service.py    # Open-Meteo cached
│   │   │   ├── rescue_dispatcher.py  # Vehicle assignment + sim
│   │   │   ├── websocket_manager.py  # WS connection manager
│   │   │   └── seed_data.py       # Demo data seeding
│   │   ├── utils/
│   │   │   └── geo.py            # Haversine, bearing, snap-to-segment
│   │   └── main.py               # FastAPI app + lifespan hooks
│   ├── requirements.txt
│   ├── run.py
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── AdminSidebar.jsx
│   │   │   │   ├── MetricsBar.jsx
│   │   │   │   ├── ReportsPanel.jsx
│   │   │   │   ├── IncidentsPanel.jsx
│   │   │   │   ├── VehiclesPanel.jsx
│   │   │   │   ├── AlertsPanel.jsx
│   │   │   │   ├── WeatherPanel.jsx
│   │   │   │   └── LiveFeedPanel.jsx
│   │   │   └── citizen/
│   │   │       ├── CitizenReportForm.jsx  # Camera capture + EXIF-style GPS
│   │   │       ├── NearbyPanel.jsx
│   │   │       └── AlertsPanel.jsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   └── useGeolocation.js
│   │   ├── pages/
│   │   │   ├── CitizenPage.jsx
│   │   │   └── AdminPage.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── utils/
│   │   │   ├── format.js
│   │   │   └── icons.js
│   │   ├── styles/
│   │   │   └── index.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── docker-compose.yml
└── README.md
```

---

## 🚀 Quick Start

### Option A: Local Development (Recommended for Hackathon)

**Backend** (terminal 1):
```bash
cd backend
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python run.py
# → http://localhost:8000 (docs at /docs)
```

**Frontend** (terminal 2):
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Open http://localhost:5173/citizen for the citizen app, or http://localhost:5173/admin for the control room.

### Option B: Docker Compose

```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:5173
```

---

## 🎮 Demo Walkthrough

1. **Open the Admin Dashboard** at `/admin`. The map loads the Mangalore road network, with seeded facilities (hospitals, shelters, police/fire stations) and demo incidents.

2. **Open the Citizen App** at `/citizen` (in another tab or device). Allow location access.

3. **Submit a flood report** from the citizen app:
   - Select hazard type (Flood / Landslide / Blocked Road / Fallen Tree / Other)
   - Choose estimated water depth (ankle → above chest)
   - **Capture a photo** with the in-browser camera (shutter time + GPS are embedded)
   - Submit — the Validation Engine computes a confidence score from 5 weighted signals

4. **Watch the Admin Dashboard update in real-time**:
   - New report marker appears (pulsing)
   - Flood-affected road segments turn yellow → orange → red based on risk
   - High-risk edges are dashed (blocked)
   - Live Event Feed shows the validation breakdown

5. **Dispatch a rescue vehicle**:
   - Click an incident marker on the map, or use the Incidents sidebar
   - Select routing profile: **Fastest** (time-optimal), **Safest** (risk-penalized), or **Emergency** (blocks high-risk edges)
   - Click Dispatch — the nearest idle vehicle gets a route via A*
   - The vehicle moves along its route in real-time (simulation tick every 2s)

6. **Trigger a reroute**:
   - Submit a new high-confidence flood report on the vehicle's current path
   - The system detects the blocked edge and reroutes the vehicle in <1s
   - Watch the Live Feed for `vehicle_rerouted` event with the reroute time

7. **Inject a traffic anomaly** (Weather tab in admin sidebar):
   - Simulates real-time congestion / vehicle stoppage / mass diversion signals
   - Feeds into the Validation Engine for nearby reports

8. **Issue an alert** (Alerts tab): broadcasts to all connected citizens via WebSocket

9. **Decay risk** (top-right 🌅 Decay button): simulates time passage; risk fades exponentially

---

## 🧮 Validation Engine

Each citizen report gets a confidence score in `[0, 1]` computed as a weighted sum:

| Signal | Weight | Source |
|--------|--------|--------|
| Geotagged photo (with shutter time) | **0.40** | Citizen report (HTML5 Geolocation + camera capture) |
| Real-time traffic anomaly | **0.25** | Injected signals (TomTom/fleet GPS in prod) |
| Current rainfall | **0.15** | Open-Meteo API |
| Historical flood susceptibility | **0.12** | NRSC / ISRO / Bhuvan datasets (mock for hackathon) |
| Distance to nearest water body | **0.08** | OSM water polygons (proxy for hackathon) |

Reports with `confidence ≥ 0.45` are accepted and immediately influence the road graph. A bonus +0.1 is applied when ≥3 independent signals agree (>0.5 each).

The breakdown is fully transparent — visible in the Reports panel and the citizen's submission acknowledgement.

---

## 🛣️ Routing Engine

Three routing profiles, all powered by the same A* implementation with profile-specific edge cost functions:

| Profile | Cost Function | Use Case |
|---------|---------------|----------|
| **Fastest** | `travel_time` | Routine transfers |
| **Safest** | `travel_time × (1 + 5 × risk)` | Avoid high-risk edges when possible |
| **Emergency** | `∞` if risk ≥ 0.6 (blocked), else `travel_time × (1 + 2 × risk)` | Hard-block submerged roads |

A* heuristic: great-circle distance / 80 km/h (admissible — never overestimates drivable time).

**Alternatives**: `/route/plan` returns up to 2 alternatives by temporarily penalizing primary edges and re-running A*.

**Incremental rerouting**: when a new flood report blocks an edge, only vehicles whose current path crosses that edge are rerouted (not all vehicles).

---

## 🌐 API Reference

Interactive docs at `http://localhost:8000/docs` (Swagger UI).

### Citizen
- `POST /api/v1/citizen/reports` — Submit a hazard report
- `GET /api/v1/citizen/reports` — List recent reports
- `GET /api/v1/citizen/nearby?lat=&lng=&radius_m=&types=` — Nearby facilities
- `GET /api/v1/citizen/alerts` — Active alerts

### Routing
- `POST /api/v1/route/plan` — Plan a route (returns primary + alternatives)
- `POST /api/v1/route/dispatch` — Assign vehicle to incident

### Vehicles
- `GET /api/v1/vehicles` — List fleet
- `POST /api/v1/vehicles` — Add vehicle
- `PATCH /api/v1/vehicles/{id}` — Update position/status
- `POST /api/v1/vehicles/seed` — Seed demo fleet

### Incidents
- `GET /api/v1/incidents` — List
- `POST /api/v1/incidents` — Create
- `PATCH /api/v1/incidents/{id}/resolve` — Resolve

### Alerts
- `GET /api/v1/alerts` — List
- `POST /api/v1/alerts` — Issue
- `DELETE /api/v1/alerts/{id}` — Deactivate

### Admin
- `GET /api/v1/admin/metrics` — Dashboard metrics
- `GET /api/v1/admin/weather` — Open-Meteo snapshot
- `GET /api/v1/admin/map/state` — All flood-affected edges
- `POST /api/v1/admin/traffic/anomaly?lat=&lng=&score=` — Inject traffic signal
- `POST /api/v1/admin/risk/decay?hours=` — Apply risk decay

### WebSocket
- `ws://localhost:8000/ws/admin` — Admin channel (all events)
- `ws://localhost:8000/ws/citizen` — Citizen channel (alerts + status)

**Events**: `report_new`, `flood_update`, `incident_new`, `incident_resolved`,
`vehicle_dispatched`, `vehicle_rerouted`, `vehicle_positions`, `vehicle_arrived`,
`alert_new`, `alert_cleared`

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `reports` | Citizen hazard reports with photo, GPS, validation breakdown |
| `vehicles` | Rescue fleet: position, status, current route |
| `incidents` | Open incidents with priority and assigned vehicle |
| `alerts` | Emergency alerts (info / warning / critical) |
| `facilities` | Hospitals, shelters, police/fire stations, depots |
| `metrics_audit` | Performance metrics log (reroute times, etc.) |

---

## ⚡ Performance Characteristics

- **Route computation**: typically 50–300 ms for a single A* path on the Mangalore graph (~5k nodes)
- **Edge risk update**: O(1) per affected edge — only neighbors of the snapped edge are touched
- **Reroute on flooding**: sub-second for individual vehicles (only affected ones rerouted)
- **WebSocket broadcast**: <10 ms to all connected clients in single-process mode
- **Memory**: full graph + risk state in ~50–100 MB for a city-scale network

---

## 🎯 Hackathon Feasibility Notes

The implementation is **practical within a 24-hour window**:

- **No external API keys required** — Open-Meteo and OSM are free
- **Graceful fallbacks**: synthetic grid graph if OSMnx can't reach the network; in-memory pub/sub if Redis isn't installed; SQLite instead of Postgres for portability
- **Seed data included**: facilities, vehicles, incidents, and alerts are seeded on startup
- **Vehicle simulation**: built-in position advancement so the demo "feels alive" without needing real GPS hardware

---

## 🔄 Production Hardening (Beyond Hackathon Scope)

- Replace mock `_historical_flood_score` with real NRSC / ISRO / Bhuvan WMS queries
- Replace `_water_proximity_score` with Overpass API OSM water polygon query
- Switch to PostgreSQL + PostGIS for spatial indexing
- Add Redis pub/sub for multi-process WebSocket fan-out
- Integrate real traffic flow APIs (TomTom / HERE / Mapbox Traffic)
- Add JWT auth + role-based access (citizen vs. admin)
- Add EXIF GPS extraction from uploaded photos (browser EXIF library)
- Persist road graph in PostGIS Topology instead of GraphML cache
- Add Prometheus metrics + Grafana dashboards

---

## 📜 License

MIT License — Built for the Flood-Aware Evacuation Routing hackathon.

---

**🌊 Stay safe. Route smart. Respond faster.**
