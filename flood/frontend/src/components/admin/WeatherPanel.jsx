import { useState } from "react";

export default function WeatherPanel({ weather, onInjectTraffic }) {
  const [lat, setLat] = useState(12.9100);
  const [lng, setLng] = useState(74.8500);
  const [score, setScore] = useState(0.7);

  return (
    <div className="p-3 space-y-3">
      {weather && (
        <div className="card">
          <div className="card-header">
            <span>Current Weather</span>
            <span className="text-[10px] text-gray-500">
              Open-Meteo
            </span>
          </div>
          <div className="card-body grid grid-cols-2 gap-3">
            <WeatherStat
              icon="🌡️"
              label="Temperature"
              value={`${weather.temperature_c?.toFixed(1)}°C`}
            />
            <WeatherStat
              icon="🌧️"
              label="Precipitation"
              value={`${weather.precipitation_mm?.toFixed(1)} mm`}
              highlight={weather.precipitation_mm > 5}
            />
            <WeatherStat
              icon="💨"
              label="Wind"
              value={`${weather.wind_speed_kmh?.toFixed(0)} km/h`}
            />
            <WeatherStat
              icon="💧"
              label="Humidity"
              value={`${weather.humidity?.toFixed(0)}%`}
            />
          </div>
          <div className="px-3 pb-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Rain Intensity
            </div>
            <div className={`text-sm font-bold ${rainColor(weather.rain_intensity)}`}>
              {weather.rain_intensity?.toUpperCase()}
            </div>
          </div>
        </div>
      )}

      {/* Traffic anomaly injector */}
      <div className="card">
        <div className="card-header">
          <span>Traffic Anomaly Injector</span>
          <span className="badge badge-warning">Sim</span>
        </div>
        <div className="card-body space-y-2">
          <p className="text-[11px] text-gray-500">
            Inject a real-time traffic anomaly signal (congestion, vehicle stoppage,
            mass route diversion) at a location. This feeds into the Validation Engine
            for nearby citizen reports.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Lat</label>
              <input
                className="input"
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(+e.target.value)}
              />
            </div>
            <div>
              <label className="label">Lng</label>
              <input
                className="input"
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => setLng(+e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Anomaly Score: {score.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={score}
              onChange={(e) => setScore(+e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>Normal</span>
              <span>Critical</span>
            </div>
          </div>
          <button
            onClick={() => onInjectTraffic(lat, lng, score)}
            className="btn btn-secondary w-full text-xs"
          >
            ⚡ Inject Anomaly
          </button>
        </div>
      </div>
    </div>
  );
}

function WeatherStat({ icon, label, value, highlight }) {
  return (
    <div className={`p-2 rounded ${highlight ? "bg-yellow-900/30 border border-yellow-700/40" : "bg-[#0b1220] border border-[#1f2d4d]"}`}>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-sm font-bold flex items-center gap-1">
        <span>{icon}</span> {value}
      </div>
    </div>
  );
}

function rainColor(intensity) {
  switch (intensity) {
    case "none": return "text-gray-400";
    case "light": return "text-blue-400";
    case "moderate": return "text-yellow-400";
    case "heavy": return "text-orange-400";
    case "extreme": return "text-red-500 blink";
    default: return "text-gray-400";
  }
}
