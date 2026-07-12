import { useState } from "react";
import { fmtTime } from "../../utils/format";

const EVENT_COLORS = {
  init: "text-gray-400",
  error: "text-red-400",
  report_new: "text-blue-400",
  flood_update: "text-cyan-400",
  incident_new: "text-orange-400",
  incident_resolved: "text-green-400",
  vehicle_dispatched: "text-blue-300",
  vehicle_rerouted: "text-yellow-300",
  vehicle_arrived: "text-green-300",
  alert_new: "text-red-300",
  traffic_anomaly: "text-purple-300",
  risk_decay: "text-emerald-300",
  dispatch_request: "text-blue-200",
  vehicles_seeded: "text-gray-300",
};

export default function LiveFeedPanel({ feed }) {
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="card px-3 py-1.5 text-xs text-gray-400 hover:text-white"
      >
        📡 Live Feed ({feed.length})
      </button>
    );
  }
  return (
    <div className="card max-h-72 overflow-hidden flex flex-col">
      <div className="card-header py-1.5">
        <span className="text-xs flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 blink"></span>
          Live Event Feed
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[10px] text-gray-500 hover:text-white"
        >
          −
        </button>
      </div>
      <div className="overflow-y-auto max-h-56">
        {feed.length === 0 && (
          <div className="p-3 text-xs text-gray-500 text-center">Waiting for events...</div>
        )}
        {feed.map((f) => (
          <div
            key={f.id}
            className="px-2.5 py-1 border-b border-[#1f2d4d]/50 text-[11px] flex gap-2 items-start"
          >
            <span className="text-[10px] text-gray-500 font-mono flex-shrink-0 mt-0.5">
              {fmtTime(f.time)}
            </span>
            <div className="flex-1 min-w-0">
              <span className={`font-mono ${EVENT_COLORS[f.event] || "text-gray-300"}`}>
                {f.event}
              </span>
              <div className="text-gray-400 text-[10px] break-words">{f.msg}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
