import { useState, useEffect } from "react";
import { fmtDistance, fmtDuration, riskColor, riskLabel } from "../../utils/format";

// Route colors: 1st best = green, 2nd = yellow, 3rd = dark yellow
const ROUTE_COLORS = ["#22c55e", "#eab308", "#a16207"];
const ROUTE_LABELS = ["Route A", "Route B", "Route C"];

export default function RoutePlannerPanel({
  origin,
  destination,
  plannedRoutes,
  planning,
  planError,
  selectedRouteIdx,
  onOriginChange,
  onDestinationChange,
  onPlan,
  onSelectRoute,
  onPickModeChange,
  pickMode,
  vehicles,
  // Simulation props
  simulating,
  simProgress,
  onStartSimulation,
  onStopSimulation,
  floodMarkers,
  simStatus,
}) {
  const [originLat, setOriginLat] = useState(origin?.lat?.toFixed(5) || "");
  const [originLng, setOriginLng] = useState(origin?.lng?.toFixed(5) || "");
  const [destLat, setDestLat] = useState(destination?.lat?.toFixed(5) || "");
  const [destLng, setDestLng] = useState(destination?.lng?.toFixed(5) || "");

  // Sync local inputs when origin/destination change from outside (e.g., map click)
  useEffect(() => {
    if (origin) {
      setOriginLat(origin.lat.toFixed(5));
      setOriginLng(origin.lng.toFixed(5));
    }
  }, [origin]);
  useEffect(() => {
    if (destination) {
      setDestLat(destination.lat.toFixed(5));
      setDestLng(destination.lng.toFixed(5));
    }
  }, [destination]);

  const handlePlan = () => {
    const o = { lat: parseFloat(originLat), lng: parseFloat(originLng) };
    const d = { lat: parseFloat(destLat), lng: parseFloat(destLng) };
    if (isNaN(o.lat) || isNaN(o.lng) || isNaN(d.lat) || isNaN(d.lng)) return;
    onOriginChange(o);
    onDestinationChange(d);
    onPlan(o, d, "emergency");
  };

  const useMyLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOriginLat(o.lat.toFixed(5));
        setOriginLng(o.lng.toFixed(5));
        onOriginChange(o);
      });
    }
  };

  const useVehicleDepot = (vehicleId) => {
    const v = vehicles.find((v) => v.id === vehicleId);
    if (v) {
      const o = { lat: v.depot_lat, lng: v.depot_lng };
      setOriginLat(o.lat.toFixed(5));
      setOriginLng(o.lng.toFixed(5));
      onOriginChange(o);
    }
  };

  // Find the best route index (lowest total_risk)
  const bestRouteIdx = plannedRoutes.length > 0
    ? plannedRoutes.reduce((best, r, i) => (r.total_risk < plannedRoutes[best].total_risk ? i : best), 0)
    : 0;

  return (
    <div className="p-3 space-y-3">
      <div className="rounded border border-blue-500/30 bg-blue-500/10 px-2.5 py-2 text-[10px] text-blue-200">
        <div className="font-semibold uppercase tracking-wide">Emergency routing</div>
        <div className="mt-1 text-gray-300">All route planning and rerouting now operate in emergency mode and will step to the next available alternative if a flood blocks the current path.</div>
      </div>

      {/* Origin */}
      <div className="card">
        <div className="card-header py-1.5">
          <span className="text-xs">Origin</span>
          <div className="flex items-center gap-2">
            <button
              onClick={useMyLocation}
              className="text-[10px] text-blue-400 hover:text-blue-300"
            >
              My GPS
            </button>
            <button
              onClick={() => onPickModeChange(pickMode === "origin" ? null : "origin")}
              className={`text-[10px] ${pickMode === "origin"
                  ? "text-blue-300 blink"
                  : "text-blue-400 hover:text-blue-300"
                }`}
            >
              {pickMode === "origin" ? "Click on map..." : "Pick on map"}
            </button>
          </div>
        </div>
        <div className="p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Lat</label>
              <input
                className="input text-xs"
                type="number"
                step="0.00001"
                value={originLat}
                onChange={(e) => setOriginLat(e.target.value)}
                placeholder="12.91000"
              />
            </div>
            <div>
              <label className="label">Lng</label>
              <input
                className="input text-xs"
                type="number"
                step="0.00001"
                value={originLng}
                onChange={(e) => setOriginLng(e.target.value)}
                placeholder="74.85000"
              />
            </div>
          </div>
          {vehicles.length > 0 && (
            <select
              className="select text-[11px]"
              onChange={(e) => e.target.value && useVehicleDepot(e.target.value)}
              value=""
            >
              <option value="">Use vehicle depot...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.call_sign} — {v.depot_name || "depot"}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Destination */}
      <div className="card">
        <div className="card-header py-1.5">
          <span className="text-xs">Destination</span>
          <button
            onClick={() => onPickModeChange(pickMode === "destination" ? null : "destination")}
            className={`text-[10px] ${pickMode === "destination"
                ? "text-red-400 blink"
                : "text-blue-400 hover:text-blue-300"
              }`}
          >
            {pickMode === "destination" ? "Click on map..." : "Pick on map"}
          </button>
        </div>
        <div className="p-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Lat</label>
              <input
                className="input text-xs"
                type="number"
                step="0.00001"
                value={destLat}
                onChange={(e) => setDestLat(e.target.value)}
                placeholder="12.94000"
              />
            </div>
            <div>
              <label className="label">Lng</label>
              <input
                className="input text-xs"
                type="number"
                step="0.00001"
                value={destLng}
                onChange={(e) => setDestLng(e.target.value)}
                placeholder="74.90000"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Compute button */}
      <button
        onClick={handlePlan}
        disabled={planning || !originLat || !destLat || simulating}
        className="btn btn-primary w-full text-sm"
      >
        {planning ? "Computing 3 emergency routes..." : "Compute 3 Emergency Routes"}
      </button>

      {planError && (
        <div className="bg-red-900/30 border border-red-700/40 rounded p-2 text-xs text-red-300">
          {planError}
        </div>
      )}

      {/* Results */}
      {plannedRoutes.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Suggested Routes ({plannedRoutes.length})
          </div>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            The best route is highlighted automatically. When a flood is plotted on the active path, the vehicle reroutes from its live position in real time and steps to the next available alternative if needed.
          </p>
          <div className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1.5 text-[10px] text-blue-200">
            <span className="font-semibold">Live simulation:</span> {simStatus}
          </div>
          {plannedRoutes.map((route, idx) => (
            <RouteCard
              key={idx}
              route={route}
              idx={idx}
              selected={selectedRouteIdx === idx}
              isBest={idx === bestRouteIdx}
              onSelect={() => onSelectRoute(idx)}
            />
          ))}
        </div>
      )}

      {/* ===== SIMULATION CONTROLS ===== */}
      {plannedRoutes.length > 0 && (
        <div className="card">
          <div className="card-header py-1.5">
            <span className="text-[10px] uppercase">Simulation</span>
          </div>
          <div className="p-2 space-y-2">
            {!simulating ? (
              <button
                onClick={onStartSimulation}
                className="btn btn-primary w-full text-xs"
                disabled={planning}
              >
                Start Vehicle Simulation
              </button>
            ) : (
              <>
                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-gray-400">Vehicle Progress</span>
                    <span className="font-mono text-blue-300">{Math.round(simProgress)}%</span>
                  </div>
                  <div className="h-2 bg-[#0b1220] rounded overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-200"
                      style={{ width: `${simProgress}%` }}
                    />
                  </div>
                </div>

                {/* Simulate Flood button */}
                <button
                  onClick={() => onPickModeChange(pickMode === "flood" ? null : "flood")}
                  className={`btn w-full text-xs ${pickMode === "flood"
                      ? "bg-red-600 hover:bg-red-700 text-white blink"
                      : "btn-secondary"
                    }`}
                >
                  {pickMode === "flood" ? "Click map to place flood..." : "Plot Flood on Active Route"}
                </button>

                {/* Stop button */}
                <button
                  onClick={onStopSimulation}
                  className="btn btn-ghost w-full text-xs text-red-400 hover:text-red-300"
                >
                  Stop Simulation
                </button>
              </>
            )}

            {/* Flood markers placed */}
            {floodMarkers && floodMarkers.length > 0 && (
              <div className="text-[10px] text-gray-400">
                {floodMarkers.length} flood point(s) placed
              </div>
            )}
          </div>
        </div>
      )}

      {/* Env weight legend */}
      <div className="card">
        <div className="card-header py-1.5">
          <span className="text-[10px] uppercase">Smart Profile Weights</span>
        </div>
        <div className="p-2 space-y-1 text-[10px]">
          {[
            ["1. Traffic anomalies", 0.40, "#f472b6"],
            ["2. Current rainfall", 0.30, "#60a5fa"],
            ["3. Historical flood", 0.20, "#fbbf24"],
            ["4. Water proximity", 0.10, "#22d3ee"],
          ].map(([label, weight, color]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-32 text-gray-400">{label}</span>
              <div className="flex-1 h-2 bg-[#0b1220] rounded overflow-hidden">
                <div style={{ width: `${weight * 100}%`, background: color }} className="h-full" />
              </div>
              <span className="font-mono text-gray-300 w-8 text-right">
                {(weight * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RouteCard({ route, idx, selected, isBest, onSelect }) {
  const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
  const label = ROUTE_LABELS[idx % ROUTE_LABELS.length];
  const eb = route.env_risk_breakdown || {};

  return (
    <div
      className="card cursor-pointer transition-all"
      style={{
        borderColor: selected ? color : "#1f2d4d",
        boxShadow: selected ? `0 0 0 2px ${color}` : "none",
      }}
      onClick={onSelect}
    >
      <div className="p-2.5 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: color }}
            ></span>
            <span className="text-xs font-bold">{label}</span>
            {isBest && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                Best
              </span>
            )}
          </div>
          <span
            className="badge"
            style={{
              background: `${riskColor(route.total_risk)}22`,
              color: riskColor(route.total_risk),
            }}
          >
            {riskLabel(route.total_risk)}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-[#0b1220] rounded p-1.5 border border-[#1f2d4d]">
            <div className="text-gray-500 uppercase">Distance</div>
            <div className="font-mono text-gray-200">{fmtDistance(route.distance_m)}</div>
          </div>
          <div className="bg-[#0b1220] rounded p-1.5 border border-[#1f2d4d]">
            <div className="text-gray-500 uppercase">Travel Time</div>
            <div className="font-mono text-gray-200">{fmtDuration(route.travel_time_s)}</div>
          </div>
        </div>

        {/* Total risk bar */}
        <div>
          <div className="flex justify-between text-[10px] mb-0.5">
            <span className="text-gray-500 uppercase">Total Risk</span>
            <span className="font-mono" style={{ color: riskColor(route.total_risk) }}>
              {(route.total_risk * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 bg-[#0b1220] rounded overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${route.total_risk * 100}%`,
                background: riskColor(route.total_risk),
              }}
            />
          </div>
        </div>

        {/* Env breakdown (4 factors) */}
        {eb && eb.combined != null && (
          <div className="grid grid-cols-4 gap-1 text-[9px]">
            {[
              ["Traffic", eb.traffic, "#f472b6"],
              ["Rain", eb.rainfall, "#60a5fa"],
              ["Hist", eb.historical, "#fbbf24"],
              ["Water", eb.water, "#22d3ee"],
            ].map(([name, val, c]) => (
              <div key={name} className="text-center">
                <div className="text-gray-500 uppercase">{name}</div>
                <div className="font-mono" style={{ color: c }}>
                  {((val || 0) * 100).toFixed(0)}
                </div>
                <div className="h-1 bg-[#0b1220] rounded mt-0.5">
                  <div
                    className="h-full rounded"
                    style={{ width: `${(val || 0) * 100}%`, background: c }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Blocked edges */}
        {route.blocked_edges > 0 && (
          <div className="text-[10px] text-red-400">
            {route.blocked_edges} blocked edge(s) along this route
          </div>
        )}

        {/* Select button */}
        {!selected && (
          <button
            className="btn btn-secondary w-full text-[10px] py-1"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            Highlight on map
          </button>
        )}
      </div>
    </div>
  );
}
