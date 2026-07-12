import { useEffect, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents } from "react-leaflet";
import AdminSidebar from "../components/admin/AdminSidebar";
import MetricsBar from "../components/admin/MetricsBar";
import LiveFeedPanel from "../components/admin/LiveFeedPanel";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { ICONS, vehicleIcon, makeIcon, makePulseIcon } from "../utils/icons";
import { riskColor } from "../utils/format";

const DEFAULT_CENTER = [12.9100, 74.8500];
// Route colors: 1st best = green, 2nd = yellow, 3rd = dark yellow
const ROUTE_COLORS = ["#22c55e", "#eab308", "#a16207"];

// Origin / Destination icons for the route planner
const ORIGIN_ICON = makeIcon("📍", "#3b82f6", 32);
const DEST_ICON = makeIcon("🎯", "#dc2626", 32);
const SIM_VEHICLE_ICON = makePulseIcon("🚑", "#16a34a", 36);
const FLOOD_SIM_ICON = makePulseIcon("🌊", "#dc2626", 34);

function FitBounds({ bbox }) {
  const map = useMap();
  useEffect(() => {
    if (bbox) {
      const [[latMin, lngMin], [latMax, lngMax]] = bbox;
      map.fitBounds(
        [
          [latMin, lngMin],
          [latMax, lngMax],
        ],
        { padding: [40, 40] }
      );
    }
  }, [bbox, map]);
  return null;
}

// Map click handler — calls onMapClick when pickMode is active
function MapClickHandler({ pickMode, onMapClick }) {
  useMapEvents({
    click: (e) => {
      if (pickMode && onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng, pickMode);
      }
    },
  });
  return null;
}

// Haversine distance in meters (client-side for flood intersection check)
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistanceM(lat, lng, lat1, lng1, lat2, lng2) {
  const metersPerLat = 111320;
  const latMid = (lat1 + lat2) / 2;
  const metersPerLng = 111320 * Math.cos((latMid * Math.PI) / 180);

  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return haversineM(lat, lng, lat1, lng1);
  }

  const t = ((lng - lng1) * dx + (lat - lat1) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));

  const projLng = lng1 + clamped * dx;
  const projLat = lat1 + clamped * dy;
  const dLng = (lng - projLng) * metersPerLng;
  const dLat = (lat - projLat) * metersPerLat;
  return Math.sqrt(dLng * dLng + dLat * dLat);
}

function geometryIntersectsFlood(geometry, lat, lng, radiusM = 150) {
  if (!geometry || geometry.length < 2) return false;
  for (let i = 0; i < geometry.length - 1; i++) {
    const dist = pointToSegmentDistanceM(
      lat,
      lng,
      geometry[i][0],
      geometry[i][1],
      geometry[i + 1][0],
      geometry[i + 1][1]
    );
    if (dist < radiusM) return true;
  }
  return false;
}

export default function AdminPage() {
  const { connected, on } = useWebSocket("admin");
  const [reports, setReports] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [floodEdges, setFloodEdges] = useState([]);
  const [weather, setWeather] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [bbox, setBbox] = useState(null);
  const [routes, setRoutes] = useState({}); // vehicleId -> geometry (active dispatch routes)
  const [feed, setFeed] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState("emergency");
  const [activeTab, setActiveTab] = useState("router");
  const pollRef = useRef(null);

  // ---- Route Planner state ----
  const [rpOrigin, setRpOrigin] = useState(null);
  const [rpDestination, setRpDestination] = useState(null);
  const [plannedRoutes, setPlannedRoutes] = useState([]);
  const [routePlanning, setRoutePlanning] = useState(false);
  const [routePlanError, setRoutePlanError] = useState(null);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [pickMode, setPickMode] = useState(null); // null | "origin" | "destination" | "flood"

  // ---- Simulation state ----
  const [simulating, setSimulating] = useState(false);
  const [simVehiclePos, setSimVehiclePos] = useState(null); // {lat, lng}
  const [simGeomIdx, setSimGeomIdx] = useState(0); // fractional index along geometry
  const [simProgress, setSimProgress] = useState(0); // 0-100
  const [simDestination, setSimDestination] = useState(null); // saved destination for rerouting
  const [floodMarkers, setFloodMarkers] = useState([]); // [{lat, lng}]
  const [simStatus, setSimStatus] = useState("Ready to simulate emergency routes");
  const simIntervalRef = useRef(null);
  const simGeomRef = useRef([]); // current route geometry for simulation

  const log = useCallback((event, msg) => {
    setFeed((prev) =>
      [
        { id: `${Date.now()}-${Math.random()}`, event, msg, time: new Date().toISOString() },
        ...prev,
      ].slice(0, 100)
    );
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const [r, v, i, a, f, ms] = await Promise.all([
          api.listReports(50),
          api.listVehicles(),
          api.listIncidents(),
          api.listAlerts(),
          api.nearbyFacilities(12.91, 74.85, 100000),
          api.mapState(),
        ]);
        setReports(r);
        setVehicles(v);
        setIncidents(i);
        setAlerts(a);
        setFacilities(f);
        setFloodEdges(ms.edges || []);
        setBbox([[ms.bbox[0], ms.bbox[1]], [ms.bbox[2], ms.bbox[3]]]);
        log("init", `Loaded ${r.length} reports, ${v.length} vehicles, ${i.length} incidents`);
      } catch (e) {
        log("error", `Init failed: ${e.message}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll metrics & weather
  useEffect(() => {
    const tick = async () => {
      try {
        const [m, w] = await Promise.all([api.metrics(), api.weather()]);
        setMetrics(m);
        setWeather(w);
      } catch (e) { }
    };
    tick();
    pollRef.current = setInterval(tick, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Periodic map state refresh
  useEffect(() => {
    const i = setInterval(async () => {
      try {
        const ms = await api.mapState();
        setFloodEdges(ms.edges || []);
        setVehicles(await api.listVehicles());
      } catch (e) { }
    }, 8000);
    return () => clearInterval(i);
  }, []);

  // ---------- WebSocket handlers ----------
  useEffect(() => {
    const offs = [];
    offs.push(on("report_new", (p) => {
      setReports((prev) => [{ ...p, created_at: p.created_at || new Date().toISOString() }, ...prev]);
      log("report_new", `New ${p.hazard_type} report @ ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)} (conf ${(p.confidence * 100).toFixed(0)}%)`);
    }));
    offs.push(on("flood_update", (p) => {
      const newEdges = (p.affected_edges || []).map((e) => ({
        u: e.u, v: e.v, k: e.k, risk: e.risk,
        blocked: (p.blocked_edges || []).some((b) => b.u === e.u && b.v === e.v),
        geometry: null,
      }));
      setFloodEdges((prev) => {
        const map = new Map(prev.map((e) => [`${e.u}-${e.v}-${e.k}`, e]));
        for (const ne of newEdges) map.set(`${ne.u}-${ne.v}-${ne.k}`, ne);
        return Array.from(map.values());
      });
      log("flood_update", `Flood update: ${p.affected_edges?.length || 0} edges affected, ${p.blocked_edges?.length || 0} blocked`);
    }));
    offs.push(on("incident_new", (p) => {
      setIncidents((prev) => [{ ...p, created_at: p.created_at || new Date().toISOString() }, ...prev]);
      log("incident_new", `New incident: ${p.title} (P${p.priority})`);
    }));
    offs.push(on("vehicle_dispatched", (p) => {
      setVehicles((prev) => prev.map((v) => v.id === p.vehicle_id ? { ...v, status: "en_route", route_geometry: p.geometry, route_eta_seconds: p.eta_s, route_distance_m: p.distance_m, route_profile: p.profile, assigned_incident_id: p.incident_id } : v));
      setRoutes((prev) => ({ ...prev, [p.vehicle_id]: p.geometry }));
      log("vehicle_dispatched", `${p.call_sign} dispatched (ETA ${Math.round(p.eta_s)}s, profile=${p.profile})`);
    }));
    offs.push(on("vehicle_positions", (p) => {
      const updates = new Map((p.vehicles || []).map((v) => [v.vehicle_id, v]));
      setVehicles((prev) => prev.map((v) => {
        const u = updates.get(v.id);
        return u ? { ...v, lat: u.lat, lng: u.lng, speed_kmh: u.speed_kmh ?? v.speed_kmh, route_eta_seconds: u.eta_s ?? v.route_eta_seconds } : v;
      }));
    }));
    offs.push(on("vehicle_rerouted", (p) => {
      setVehicles((prev) => prev.map((v) => v.id === p.vehicle_id ? { ...v, route_geometry: p.geometry, route_eta_seconds: p.new_eta_s, route_distance_m: p.new_distance_m } : v));
      setRoutes((prev) => ({ ...prev, [p.vehicle_id]: p.geometry }));
      log("vehicle_rerouted", `${p.call_sign} rerouted in ${p.reroute_ms}ms (new ETA ${Math.round(p.new_eta_s)}s)`);
    }));
    offs.push(on("vehicle_arrived", (p) => {
      setVehicles((prev) => prev.map((v) => {
        const u = (p.vehicles || []).find((x) => x.vehicle_id === v.id);
        return u ? { ...v, status: "on_scene", speed_kmh: 0 } : v;
      }));
      log("vehicle_arrived", `Vehicle arrived on scene`);
    }));
    offs.push(on("alert_new", (p) => {
      setAlerts((prev) => [{ ...p, active: true, created_at: new Date().toISOString() }, ...prev]);
      log("alert_new", `New ${p.severity} alert: ${p.title}`);
    }));
    offs.push(on("incident_resolved", (p) => {
      setIncidents((prev) => prev.map((i) => (i.id === p.id ? { ...i, status: "resolved" } : i)));
      log("incident_resolved", `Incident ${p.id.slice(0, 8)} resolved`);
    }));
    return () => offs.forEach((off) => off && off());
  }, [on, log]);

  // ---------- Actions ----------
  const handleDispatch = useCallback(async (incidentId, vehicleId = null) => {
    try {
      await api.dispatch({ incident_id: incidentId, vehicle_id: vehicleId, profile: selectedProfile });
      log("dispatch_request", `Dispatch request sent (profile=${selectedProfile})`);
    } catch (e) { log("error", `Dispatch failed: ${e.message}`); }
  }, [selectedProfile, log]);

  const handleResolve = useCallback(async (incidentId) => {
    try { await api.resolveIncident(incidentId); } catch (e) { log("error", `Resolve failed: ${e.message}`); }
  }, [log]);

  const handleCreateIncident = useCallback(async (payload) => {
    try { await api.createIncident(payload); } catch (e) { log("error", `Create incident failed: ${e.message}`); }
  }, [log]);

  const handleCreateAlert = useCallback(async (payload) => {
    try { await api.createAlert(payload); } catch (e) { log("error", `Create alert failed: ${e.message}`); }
  }, [log]);

  const handleClearAlert = useCallback(async (alertId) => {
    try { await api.clearAlert(alertId); setAlerts((prev) => prev.filter((a) => a.id !== alertId)); } catch (e) { log("error", `Clear alert failed: ${e.message}`); }
  }, [log]);

  const handleInjectTrafficAnomaly = useCallback(async (lat, lng, score) => {
    try {
      await api.reportTrafficAnomaly(lat, lng, score);
      log("traffic_anomaly", `Traffic anomaly injected @ ${lat.toFixed(3)}, ${lng.toFixed(3)} (score=${score})`);
    } catch (e) { log("error", `Traffic anomaly failed: ${e.message}`); }
  }, [log]);

  const handleDecayRisk = useCallback(async () => {
    try {
      await api.decayRisk(1);
      const ms = await api.mapState();
      setFloodEdges(ms.edges || []);
      log("risk_decay", `Risk decay applied (1h). ${ms.edges?.length || 0} edges still affected.`);
    } catch (e) { log("error", `Decay failed: ${e.message}`); }
  }, [log]);

  const handleSeedVehicles = useCallback(async () => {
    try {
      const created = await api.seedVehicles();
      setVehicles(await api.listVehicles());
      log("vehicles_seeded", `Seeded ${created.length} vehicles`);
    } catch (e) { log("error", `Seed failed: ${e.message}`); }
  }, [log]);

  // ---------- Route Planner actions ----------
  const handlePlanRoutes = useCallback(async (origin, destination, profile) => {
    setRoutePlanning(true);
    setRoutePlanError(null);
    setPlannedRoutes([]);
    setSelectedRouteIdx(0);
    try {
      const res = await api.planRoute({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        profile,
        alternatives: true,
        num_alternatives: 3,
      });
      const paths = res.paths || [];
      setPlannedRoutes(paths);
      // Auto-select the best route (lowest total_risk)
      if (paths.length > 0) {
        const bestIdx = paths.reduce((best, r, i) => (r.total_risk < paths[best].total_risk ? i : best), 0);
        setSelectedRouteIdx(bestIdx);
      }
      log("route_plan", `Computed ${paths.length} routes in ${res.computation_ms}ms (profile=${profile})`);
    } catch (e) {
      setRoutePlanError(e.message || "Failed to compute routes");
      log("error", `Route plan failed: ${e.message}`);
    } finally {
      setRoutePlanning(false);
    }
  }, [log]);

  // ---------- SIMULATION ENGINE ----------

  const startSimulationOnGeometry = useCallback((geometry, startPoint = null, options = {}) => {
    if (!geometry || geometry.length < 2) return;

    const routeStart = startPoint || { lat: geometry[0][0], lng: geometry[0][1] };
    const preserveFloodMarkers = options.preserveFloodMarkers ?? false;

    simGeomRef.current = geometry;
    setSimVehiclePos(routeStart);
    setSimGeomIdx(0);
    setSimProgress(0);
    setSimulating(true);
    if (!preserveFloodMarkers) {
      setFloodMarkers([]);
    }
    setSimStatus("Vehicle moving along the selected route");

    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }

    const TICK_MS = 200;
    const SPEED_MPS = 40 * 1000 / 3600;
    const ADVANCE_M = SPEED_MPS * (TICK_MS / 1000);

    let currentIdx = 0;
    let currentFrac = 0;

    simIntervalRef.current = setInterval(() => {
      const g = simGeomRef.current;
      if (!g || g.length < 2) return;

      let remaining = ADVANCE_M;
      while (remaining > 0 && currentIdx < g.length - 1) {
        const [y1, x1] = g[currentIdx];
        const [y2, x2] = g[currentIdx + 1];
        const segLen = haversineM(y1, x1, y2, x2);
        if (segLen <= 0) {
          currentIdx++;
          currentFrac = 0;
          continue;
        }
        const remainingInSeg = segLen * (1 - currentFrac);
        if (remaining >= remainingInSeg) {
          remaining -= remainingInSeg;
          currentIdx++;
          currentFrac = 0;
        } else {
          currentFrac += remaining / segLen;
          remaining = 0;
        }
      }

      let newLat, newLng;
      if (currentIdx >= g.length - 1) {
        newLat = g[g.length - 1][0];
        newLng = g[g.length - 1][1];
        setSimVehiclePos({ lat: newLat, lng: newLng });
        setSimProgress(100);
        setSimGeomIdx(g.length - 1);
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
        setSimulating(false);
        log("sim_arrived", "Simulated vehicle has arrived at destination!");
        return;
      }

      const [y1, x1] = g[currentIdx];
      const [y2, x2] = g[currentIdx + 1];
      newLat = y1 + (y2 - y1) * currentFrac;
      newLng = x1 + (x2 - x1) * currentFrac;

      setSimVehiclePos({ lat: newLat, lng: newLng });
      setSimGeomIdx(currentIdx + currentFrac);

      const totalPoints = g.length - 1;
      const progress = ((currentIdx + currentFrac) / totalPoints) * 100;
      setSimProgress(Math.min(progress, 100));
    }, TICK_MS);
  }, [log]);

  // Start vehicle simulation along the selected route
  const handleStartSimulation = useCallback(() => {
    if (plannedRoutes.length === 0) return;
    const route = plannedRoutes[selectedRouteIdx];
    if (!route || !route.geometry || route.geometry.length < 2) return;

    const geom = route.geometry;
    setSimDestination({ lat: geom[geom.length - 1][0], lng: geom[geom.length - 1][1] });
    startSimulationOnGeometry(geom, { lat: geom[0][0], lng: geom[0][1] }, { preserveFloodMarkers: false });

    log("sim_start", `Simulation started on Route ${String.fromCharCode(65 + selectedRouteIdx)} (${geom.length} points)`);
  }, [plannedRoutes, selectedRouteIdx, startSimulationOnGeometry, log]);

  // Stop vehicle simulation
  const handleStopSimulation = useCallback(() => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setSimulating(false);
    setSimVehiclePos(null);
    setSimProgress(0);
    setSimGeomIdx(0);
    simGeomRef.current = [];
    setSimStatus("Simulation stopped");
    log("sim_stop", "Simulation stopped");
  }, [log]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  // ---------- FLOOD SIMULATION & REROUTING ----------
  const handleFloodSimulation = useCallback(async (lat, lng) => {
    setFloodMarkers((prev) => [...prev, { lat, lng }]);
    setSimStatus("Flood plotted — checking the live route for impact");
    log("sim_flood", `Flood placed @ ${lat.toFixed(5)}, ${lng.toFixed(5)}`);

    try {
      const result = await api.simulateFlood(lat, lng);
      const newEdges = (result.affected_edges || []).map((e) => ({
        u: e.u, v: e.v, k: e.k,
        risk: e.risk,
        blocked: e.blocked,
        geometry: e.geometry,
      }));
      setFloodEdges((prev) => {
        const map = new Map(prev.map((e) => [`${e.u}-${e.v}-${e.k}`, e]));
        for (const ne of newEdges) map.set(`${ne.u}-${ne.v}-${ne.k}`, ne);
        return Array.from(map.values());
      });
      log("sim_flood_edges", `${newEdges.length} road edges affected, ${newEdges.filter((e) => e.blocked).length} blocked`);
    } catch (e) {
      log("error", `Flood simulation failed: ${e.message}`);
      return;
    }

    if (!simulating || !simVehiclePos || !simDestination) return;

    const geom = simGeomRef.current;
    const currentGeomIdx = Math.max(0, Math.floor(simGeomIdx || 0));
    const FLOOD_RADIUS_M = 150;

    let intersects = false;
    for (let i = currentGeomIdx; i < geom.length - 1; i++) {
      const dist = pointToSegmentDistanceM(
        lat,
        lng,
        geom[i][0],
        geom[i][1],
        geom[i + 1][0],
        geom[i + 1][1]
      );
      if (dist < FLOOD_RADIUS_M) {
        intersects = true;
        break;
      }
    }

    if (!intersects) {
      setSimStatus("Flood is clear of the live route — continuing on the current path");
      log("sim_flood_clear", "Flood does NOT intersect the vehicle's remaining path — continuing");
      return;
    }

    setSimStatus("Flood is on the active path — rerouting from the vehicle's live position");
    log("sim_reroute", "Flood is on the active path. Rerouting from the vehicle's live position...");

    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }

    const newOrigin = { lat: simVehiclePos.lat, lng: simVehiclePos.lng };
    setRpOrigin(newOrigin);

    try {
        const res = await api.planRoute({
        origin: { lat: newOrigin.lat, lng: newOrigin.lng },
        destination: { lat: simDestination.lat, lng: simDestination.lng },
        profile: "emergency",
        alternatives: true,
        num_alternatives: 3,
      });
      const paths = res.paths || [];
      if (paths.length === 0) {
        setSimStatus("No safe fallback route remains — simulation paused");
        log("error", "No alternative routes found after flood!");
        setSimulating(false);
        return;
      }

      setPlannedRoutes(paths);
      const currentRouteIdx = Math.max(0, Math.min(selectedRouteIdx, paths.length - 1));
      let nextRouteIdx = -1;
      for (let offset = 1; offset < paths.length; offset++) {
        const candidateIdx = (currentRouteIdx + offset) % paths.length;
        if (!geometryIntersectsFlood(paths[candidateIdx].geometry, lat, lng, 150)) {
          nextRouteIdx = candidateIdx;
          break;
        }
      }

      if (nextRouteIdx === -1) {
        const fallbackIdx = paths.findIndex((route) => !geometryIntersectsFlood(route.geometry, lat, lng, 150));
        nextRouteIdx = fallbackIdx >= 0 ? fallbackIdx : currentRouteIdx;
      }

      setSelectedRouteIdx(nextRouteIdx);
      const chosenRoute = paths[nextRouteIdx];
      setSimStatus(`Reroute complete — following ${String.fromCharCode(65 + nextRouteIdx)} (${Math.round(chosenRoute.distance_m / 1000)}km)`);
      log("sim_rerouted", `REROUTED! ${paths.length} new routes computed in ${res.computation_ms}ms. Selected: Route ${String.fromCharCode(65 + nextRouteIdx)}`);

      startSimulationOnGeometry(chosenRoute.geometry, newOrigin, { preserveFloodMarkers: true });
    } catch (e) {
      setSimStatus("Reroute failed — the vehicle remains stopped");
      log("error", `Reroute failed: ${e.message}`);
      setSimulating(false);
    }
  }, [simulating, simVehiclePos, simDestination, simGeomIdx, startSimulationOnGeometry, log]);

  // ---------- Map click handler ----------
  const handleMapClick = useCallback((lat, lng, mode) => {
    if (mode === "origin") {
      setRpOrigin({ lat, lng });
      setPickMode(null);
    } else if (mode === "destination") {
      setRpDestination({ lat, lng });
      setPickMode(null);
    } else if (mode === "flood") {
      setPickMode(null);
      handleFloodSimulation(lat, lng);
    }
  }, [handleFloodSimulation]);

  return (
    <div className="h-full grid grid-rows-[auto_1fr]">
      <MetricsBar
        metrics={metrics}
        connected={connected}
        weather={weather}
        onDecayRisk={handleDecayRisk}
        onSeedVehicles={handleSeedVehicles}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] overflow-hidden">
        {/* Map */}
        <div className="relative">
          <MapContainer center={DEFAULT_CENTER} zoom={14} className="h-full w-full">
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            <MapClickHandler pickMode={pickMode} onMapClick={handleMapClick} />

            {/* Flood-affected edges */}
            {floodEdges.map((e, idx) => (
              <Polyline
                key={`fe-${e.u}-${e.v}-${e.k}-${idx}`}
                positions={e.geometry || [[12.91, 74.85]]}
                pathOptions={{
                  color: riskColor(e.risk),
                  weight: e.blocked ? 8 : 5,
                  opacity: 0.85,
                  dashArray: e.blocked ? "8 6" : null,
                }}
              />
            ))}

            {/* Planned routes — all 3 highlighted in distinct colors */}
            {plannedRoutes.map((route, idx) => {
              const isSelected = selectedRouteIdx === idx;
              const isBest = plannedRoutes.length > 0 &&
                idx === plannedRoutes.reduce((best, r, i) => (r.total_risk < plannedRoutes[best].total_risk ? i : best), 0);
              return (
                <Polyline
                  key={`plan-${idx}`}
                  positions={route.geometry}
                  pathOptions={{
                    color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
                    weight: isSelected ? 8 : (isBest ? 6 : 4),
                    opacity: isSelected ? 0.95 : (simulating ? 0.3 : 0.7),
                    dashArray: (!isSelected && !isBest) ? "6 4" : null,
                  }}
                />
              );
            })}

            {/* Active vehicle dispatch routes */}
            {Object.entries(routes).map(([vid, geom]) => (
              <Polyline
                key={`route-${vid}`}
                positions={geom}
                pathOptions={{ color: "#22d3ee", weight: 4, opacity: 0.7, dashArray: "6 4" }}
              />
            ))}

            {/* Facilities */}
            {facilities.map((f) => (
              <Marker key={`f-${f.id}`} position={[f.lat, f.lng]} icon={ICONS[f.facility_type] || ICONS.hospital}>
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold">{f.name}</div>
                    <div className="uppercase text-gray-400">{f.facility_type}</div>
                    {f.phone && <div>{f.phone}</div>}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Incidents */}
            {incidents.filter((i) => i.status !== "resolved").map((i) => (
              <Marker key={`i-${i.id}`} position={[i.lat, i.lng]} icon={ICONS.incident}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold">{i.title}</div>
                    <div>Priority: P{i.priority}</div>
                    <div>Status: {i.status}</div>
                    {i.description && <div className="text-gray-400">{i.description}</div>}
                    {i.status === "open" && (
                      <button className="btn btn-primary text-xs mt-1" onClick={() => handleDispatch(i.id)}>
                        Dispatch Nearest
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Reports */}
            {reports.slice(0, 40).map((r) => (
              <Marker key={`r-${r.id}`} position={[r.lat, r.lng]} icon={r.hazard_type === "flood" ? ICONS.flood : ICONS.incident}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold uppercase">{r.hazard_type}</div>
                    <div>Depth: {r.flood_depth}</div>
                    <div>Confidence: {((r.confidence_score || 0) * 100).toFixed(0)}%</div>
                    <div>Status: {r.status}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Vehicles */}
            {vehicles.map((v) => (
              <Marker key={`v-${v.id}`} position={[v.lat, v.lng]} icon={vehicleIcon(v.vehicle_type)}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold">{v.call_sign}</div>
                    <div className="uppercase text-gray-400">{v.vehicle_type}</div>
                    <div>Status: {v.status}</div>
                    <div>Speed: {Math.round(v.speed_kmh || 0)} km/h</div>
                    {v.route_eta_seconds != null && <div>ETA: {Math.round(v.route_eta_seconds)}s</div>}
                    {v.route_distance_m != null && <div>Dist: {(v.route_distance_m / 1000).toFixed(2)} km</div>}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Route Planner origin marker */}
            {rpOrigin && (
              <Marker position={[rpOrigin.lat, rpOrigin.lng]} icon={ORIGIN_ICON}>
                <Popup><div className="text-xs"><strong>Route Origin</strong></div></Popup>
              </Marker>
            )}

            {/* Route Planner destination marker */}
            {rpDestination && (
              <Marker position={[rpDestination.lat, rpDestination.lng]} icon={DEST_ICON}>
                <Popup><div className="text-xs"><strong>Route Destination</strong></div></Popup>
              </Marker>
            )}

            {/* ===== SIMULATION MARKERS ===== */}

            {/* Simulated vehicle position */}
            {simVehiclePos && (
              <Marker position={[simVehiclePos.lat, simVehiclePos.lng]} icon={SIM_VEHICLE_ICON}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold">Simulated Vehicle</div>
                    <div>Speed: 40 km/h (constant)</div>
                    <div>Progress: {Math.round(simProgress)}%</div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Simulated flood markers */}
            {floodMarkers.map((fm, idx) => (
              <Marker key={`flood-sim-${idx}`} position={[fm.lat, fm.lng]} icon={FLOOD_SIM_ICON}>
                <Popup>
                  <div className="text-xs">
                    <div className="font-bold text-red-400">Simulated Flood</div>
                    <div>{fm.lat.toFixed(5)}, {fm.lng.toFixed(5)}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Flood impact radius circles */}
            {floodMarkers.map((fm, idx) => (
              <Circle
                key={`flood-circle-${idx}`}
                center={[fm.lat, fm.lng]}
                radius={150}
                pathOptions={{
                  color: "#dc2626",
                  fillColor: "#dc2626",
                  fillOpacity: 0.15,
                  weight: 2,
                  dashArray: "4 4",
                }}
              />
            ))}

            <FitBounds bbox={bbox} />
          </MapContainer>

          {/* Live feed overlay */}
          <div className="absolute bottom-3 left-3 z-[1000] w-80 max-w-[80vw]">
            <LiveFeedPanel feed={feed} />
          </div>

          <div className="absolute top-3 left-3 z-[1000] rounded-lg border border-blue-500/30 bg-[#111a2e]/90 px-2.5 py-1.5 text-[11px] text-blue-200 backdrop-blur">
            Emergency routing is active for all route planning and rerouting.
          </div>

          {/* Pick mode indicator */}
          {pickMode && (
            <div className={`absolute top-3 right-3 z-[1000] border rounded-lg px-3 py-1.5 backdrop-blur slide-in ${pickMode === "origin"
                ? "bg-blue-900/90 border-blue-600"
                : pickMode === "flood"
                  ? "bg-red-900/90 border-red-600"
                  : "bg-red-900/90 border-red-600"
              }`}>
              <span className={`text-xs blink ${pickMode === "origin" ? "text-blue-300" : "text-red-300"
                }`}>
                {pickMode === "flood"
                  ? "● Click on map to simulate flood"
                  : `● Click on map to set ${pickMode}`}
              </span>
            </div>
          )}

          {/* Route legend overlay (visible when routes are planned) */}
          {plannedRoutes.length > 0 && !pickMode && (
            <div className="absolute top-3 right-3 z-[1000] bg-[#111a2e]/90 border border-[#1f2d4d] rounded-lg px-3 py-2 backdrop-blur space-y-1 slide-in">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
                Optimal Routes
              </div>
              {plannedRoutes.map((route, idx) => {
                const isBest = idx === plannedRoutes.reduce((best, r, i) => (r.total_risk < plannedRoutes[best].total_risk ? i : best), 0);
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedRouteIdx(idx)}
                    className={`flex items-center gap-2 text-xs w-full text-left px-1 py-0.5 rounded ${selectedRouteIdx === idx ? "bg-[#1a2541]" : "hover:bg-[#1a2541]/50"
                      }`}
                  >
                    <span
                      className="w-4 h-1 rounded-full flex-shrink-0"
                      style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }}
                    ></span>
                    <span className="text-gray-300">
                      Route {String.fromCharCode(65 + idx)}
                    </span>
                    {isBest && (
                      <span className="text-[8px] text-emerald-400 font-bold">BEST</span>
                    )}
                    <span className="text-gray-500 ml-auto font-mono text-[10px]">
                      {(route.distance_m / 1000).toFixed(1)}km
                    </span>
                  </button>
                );
              })}
              {simulating && (
                <div className="text-[9px] text-blue-300 mt-1 font-mono">
                  Vehicle: {Math.round(simProgress)}% complete
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar with tabs */}
        <AdminSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          reports={reports}
          incidents={incidents}
          vehicles={vehicles}
          alerts={alerts}
          weather={weather}
          onDispatch={handleDispatch}
          onResolve={handleResolve}
          onCreateIncident={handleCreateIncident}
          onCreateAlert={handleCreateAlert}
          onClearAlert={handleClearAlert}
          onInjectTraffic={handleInjectTrafficAnomaly}
          routePlannerOrigin={rpOrigin}
          routePlannerDestination={rpDestination}
          plannedRoutes={plannedRoutes}
          routePlanning={routePlanning}
          routePlanError={routePlanError}
          selectedRouteIdx={selectedRouteIdx}
          pickMode={pickMode}
          onRoutePlannerOriginChange={setRpOrigin}
          onRoutePlannerDestinationChange={setRpDestination}
          onPlanRoutes={handlePlanRoutes}
          onSelectRoute={setSelectedRouteIdx}
          onPickModeChange={setPickMode}
          simulating={simulating}
          simProgress={simProgress}
          onStartSimulation={handleStartSimulation}
          onStopSimulation={handleStopSimulation}
          floodMarkers={floodMarkers}
          simStatus={simStatus}
        />
      </div>
    </div>
  );
}
