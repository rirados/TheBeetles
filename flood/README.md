# FloodGuardian

FloodGuardian is a flood-aware emergency response dashboard for monitoring hazard reports, updating road risk in near real time, and supporting rescue dispatch decisions during severe weather conditions.

The project combines a FastAPI backend, a React-based frontend, and a road-network routing engine to simulate how flood conditions can influence route planning and fleet coordination.

## Overview

FloodGuardian is designed for a live operations workflow in which:

- citizens can submit hazard reports from the field,
- the backend validates and scores incoming reports,
- the road graph updates its risk state for affected edges,
- rescue vehicles can be routed with different safety profiles,
- admins and citizens receive updates over WebSockets.

## What is included

- A citizen-facing reporting experience for submitting flood and traffic-related incidents
- An admin dashboard for reviewing metrics, weather context, incident state, and map updates
- A dynamic graph-based routing engine with fastest, safest, and emergency route profiles
- WebSocket-driven event updates for dashboards and citizen clients
- Demo seeding for facilities, incidents, alerts, and vehicles
- Docker-based setup for backend, frontend, and optional Redis and PostgreSQL services

## Architecture

### Backend

The backend is built with FastAPI and Python. It includes modules for:

- citizen reports and nearby facility lookups
- incident and alert lifecycle management
- routing and dispatch workflows
- validation scoring and risk updates
- WebSocket event broadcasting
- startup seeding and vehicle simulation

### Frontend

The frontend is a React and Vite application with separate citizen and admin views. It uses a lightweight API layer and real-time updates through WebSocket connections.

### Routing and simulation

The routing system uses an in-memory road network with graph-based risk propagation and route planning. It supports:

- route planning with multiple profiles
- rerouting when new high-confidence flood evidence blocks a path
- vehicle simulation to demonstrate movement and dispatch updates

## Tech stack

- Backend: FastAPI, Python 3.11+, SQLAlchemy, Pydantic
- Routing: OSMnx, NetworkX, custom A* style path planning
- Database: SQLite by default, with optional PostgreSQL/PostGIS support
- Messaging: in-memory pub/sub with optional Redis
- Frontend: React 18, Vite, Leaflet, React Router
- Weather: Open-Meteo
- Maps: OpenStreetMap tiles

## Project structure

```text
flood/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── services/
│   │   └── main.py
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

## Getting started

### Local development

Start the backend in one terminal:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

The API will be available at http://localhost:8000 and the interactive docs at http://localhost:8000/docs.

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at:

- http://localhost:5173/citizen
- http://localhost:5173/admin


This starts:

- backend on port 8000
- frontend on port 5173
- optional Redis and PostgreSQL services when enabled through the compose profiles

## Demo workflow

1. Open the admin dashboard and review the seeded incidents, facilities, and map state.
2. Open the citizen app in a separate tab or device and allow location access.
3. Submit a hazard report from the citizen interface.
4. Watch the admin view update with the new report and risk state changes.
5. Dispatch a vehicle and follow its simulated movement through the route network.
6. Trigger rerouting by adding another high-confidence report along an active route.

## API highlights

The backend exposes endpoints under /api/v1 for:

- citizen reports and alerts
- routing and dispatch
- vehicles and incidents
- admin metrics, weather, map state, traffic anomalies, and risk decay
- WebSocket channels at /ws/admin and /ws/citizen


