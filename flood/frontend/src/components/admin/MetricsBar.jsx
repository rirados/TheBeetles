import { fmtDistance, fmtDuration, fmtTime } from "../../utils/format";

export default function MetricsBar({ metrics, connected, weather }) {
  if (!metrics) {
    return (
      <div className="bg-[#fffdf9] border-b border-[#e6dbca] px-4 py-2 text-xs text-[#7d6f5f]">
        Loading metrics...
      </div>
    );
  }
  return (
    <div className="bg-[#fffdf9] border-b border-[#e6dbca] px-4 py-2 flex items-center gap-4 overflow-x-auto flex-shrink-0 shadow-sm">
      {/* Brand / status */}
      <div className="flex items-center gap-2 pr-3 border-r border-[#e6dbca]">
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-400 blink"}`}
        ></span>
        <span className="text-xs font-medium text-[#2f2a22]">{connected ? "Live" : "Offline"}</span>
      </div>

      {/* Metric chips */}
      <Metric label="Active Vehicles" value={metrics.active_vehicles} color="text-[#8f6b45]" />
      <Metric label="Total Reports" value={metrics.total_reports} color="text-gray-300" />
      <Metric label="Validated" value={metrics.validated_reports} color="text-[#6d8b5e]" />
      <Metric label="Affected Roads" value={metrics.affected_roads} color="text-[#c96b4c]" />
      <Metric label="High-Risk Edges" value={metrics.high_risk_edges} color="text-red-500" />
      <Metric
        label="Avg Reroute"
        value={`${metrics.avg_reroute_ms.toFixed(0)}ms`}
        color={metrics.avg_reroute_ms < 1000 ? "text-[#6d8b5e]" : "text-[#b88b5a]"}
      />

      {/* Weather */}
      {weather && (
        <div className="flex items-center gap-2 px-3 border-l border-[#e6dbca]">
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

      <div className="ml-auto flex items-center gap-2" />
    </div>
  );
}

function Metric({ label, value, color = "text-[#2f2a22]" }) {
  return (
    <div className="flex flex-col items-center px-2">
      <span className={`text-sm font-bold ${color}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-wider text-[#7d6f5f]">{label}</span>
    </div>
  );
}
