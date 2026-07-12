import { fmtDistance, fmtDuration, fmtTime } from "../../utils/format";

export default function MetricsBar({ metrics, connected, weather, onDecayRisk, onSeedVehicles }) {
  if (!metrics) {
    return (
      <div className="bg-[#0b1220] border-b border-[#1f2d4d] px-4 py-2 text-xs text-gray-500">
        Loading metrics...
      </div>
    );
  }
  return (
    <div className="bg-[#0b1220] border-b border-[#1f2d4d] px-4 py-2 flex items-center gap-4 overflow-x-auto flex-shrink-0">
      {/* Brand / status */}
      <div className="flex items-center gap-2 pr-3 border-r border-[#1f2d4d]">
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500 blink"}`}
        ></span>
        <span className="text-xs font-medium">{connected ? "Live" : "Offline"}</span>
      </div>

      {/* Metric chips */}
      <Metric label="Active Incidents" value={metrics.active_incidents} color="text-red-400" />
      <Metric label="Active Vehicles" value={metrics.active_vehicles} color="text-blue-400" />
      <Metric label="Total Reports" value={metrics.total_reports} color="text-gray-300" />
      <Metric label="Validated" value={metrics.validated_reports} color="text-green-400" />
      <Metric label="Affected Roads" value={metrics.affected_roads} color="text-orange-400" />
      <Metric label="High-Risk Edges" value={metrics.high_risk_edges} color="text-red-500" />
      <Metric
        label="Avg Reroute"
        value={`${metrics.avg_reroute_ms.toFixed(0)}ms`}
        color={metrics.avg_reroute_ms < 1000 ? "text-green-400" : "text-yellow-400"}
      />

      {/* Weather */}
      {weather && (
        <div className="flex items-center gap-2 px-3 border-l border-[#1f2d4d]">
          <span className="text-base">🌧️</span>
          <div className="text-xs">
            <div className="font-medium">
              {weather.precipitation_mm?.toFixed(1)} mm
            </div>
            <div className="text-[10px] text-gray-500 uppercase">
              {weather.rain_intensity}
            </div>
          </div>
          <div className="text-xs">
            <div className="font-medium">{weather.temperature_c?.toFixed(1)}°C</div>
            <div className="text-[10px] text-gray-500">
              💨 {weather.wind_speed_kmh?.toFixed(0)} km/h
            </div>
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] text-gray-500">
          Last: {fmtTime(metrics.last_updated)}
        </span>
        <button onClick={onDecayRisk} className="btn btn-ghost text-xs" title="Apply 1h risk decay">
          🌅 Decay
        </button>
        <button onClick={onSeedVehicles} className="btn btn-ghost text-xs" title="Seed demo vehicles">
          + Fleet
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, color = "text-white" }) {
  return (
    <div className="flex flex-col items-center px-2">
      <span className={`text-sm font-bold ${color}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-wider text-gray-500">{label}</span>
    </div>
  );
}
