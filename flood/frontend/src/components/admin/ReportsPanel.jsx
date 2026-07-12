import { useState } from "react";
import { fmtDateTime, statusBadgeClass } from "../../utils/format";

export default function ReportsPanel({ reports }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = reports.filter((r) => {
    if (filter !== "all" && r.hazard_type !== filter) return false;
    if (search && !`${r.hazard_type} ${r.description || ""}`.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-1 flex-wrap">
        {["all", "flood", "landslide", "blocked_road", "fallen_tree", "other"].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium ${
              filter === t ? "bg-blue-600 text-white" : "bg-[#1a2541] text-gray-400 hover:text-white"
            }`}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>
      <input
        className="input"
        placeholder="Search reports..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-4">No reports</div>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="card">
            <div className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold uppercase">
                    {r.hazard_type.replace("_", " ")}
                  </span>
                  {r.hazard_type === "flood" && (
                    <span className="text-[10px] text-blue-300">· {r.flood_depth}</span>
                  )}
                </div>
                <span className={`badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
              </div>
              {r.description && (
                <div className="text-xs text-gray-400">{r.description}</div>
              )}
              {r.photo_data_url && (
                <div className="space-y-1.5 rounded border border-[#1f2d4d] bg-[#0b1220] p-2">
                  <img src={r.photo_data_url} alt="Hazard report" className="h-32 w-full rounded object-cover" />
                  <div className="text-[10px] text-gray-400">
                    <div>📍 Capture: {r.photo_gps_lat?.toFixed(4) ?? "—"}, {r.photo_gps_lng?.toFixed(4) ?? "—"}</div>
                    <div>🕒 {r.shutter_time ? new Date(r.shutter_time).toLocaleString() : "—"}</div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>📍 {r.lat?.toFixed(4)}, {r.lng?.toFixed(4)}</span>
                <span>{fmtDateTime(r.created_at)}</span>
              </div>
              {/* Confidence breakdown */}
              <div className="pt-1">
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-gray-500 uppercase">Confidence</span>
                  <span className={`font-mono font-bold ${
                    (r.confidence_score || 0) >= 0.6 ? "text-green-400"
                    : (r.confidence_score || 0) >= 0.4 ? "text-yellow-400"
                    : "text-red-400"
                  }`}>
                    {((r.confidence_score || 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#0b1220] rounded overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(r.confidence_score || 0) * 100}%`,
                      background:
                        (r.confidence_score || 0) >= 0.6 ? "#22c55e"
                        : (r.confidence_score || 0) >= 0.4 ? "#eab308"
                        : "#dc2626",
                    }}
                  />
                </div>
                {r.validation_breakdown && (
                  <div className="mt-1.5 grid grid-cols-4 gap-1 text-[9px]">
                    {Object.entries(r.validation_breakdown)
                      .filter(([k]) => k !== "confidence")
                      .map(([k, v]) => (
                        <div key={k} className="text-center">
                          <div className="text-gray-500 uppercase truncate">{k.split("_")[0]}</div>
                          <div className="font-mono">{(v * 100).toFixed(0)}</div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
