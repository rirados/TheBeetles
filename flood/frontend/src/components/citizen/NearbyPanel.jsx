import { useState } from "react";
import { fmtDistance } from "../../utils/format";

export default function NearbyPanel({ facilities, position }) {
  const [filter, setFilter] = useState("all");
  if (!facilities || facilities.length === 0) return null;

  const types = ["all", "hospital", "shelter", "police", "fire", "depot"];
  const filtered =
    filter === "all" ? facilities : facilities.filter((f) => f.facility_type === filter);

  // Compute distances if we have position
  const withDistance = position
    ? filtered.map((f) => ({
        ...f,
        distance: haversine(position.lat, position.lng, f.lat, f.lng),
      }))
    : filtered.map((f) => ({ ...f, distance: null }));
  withDistance.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  return (
    <div className="card">
      <div className="card-header">
        <span>Nearby Resources</span>
        <span className="badge badge-muted">{filtered.length}</span>
      </div>
      <div className="card-body space-y-3">
        <div className="flex flex-wrap gap-1">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-2 py-0.5 rounded text-[11px] uppercase tracking-wide font-medium ${
                filter === t
                  ? "bg-[#f3e1c8] text-[#5b422f] border border-[#d9ba8f]"
                  : "bg-[#f7efe6] text-[#7d6f5f] hover:text-[#5b422f]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {withDistance.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between text-xs p-2 bg-[#f7efe6] rounded border border-[#e6dbca]"
            >
              <div>
                <div className="font-medium">{f.name}</div>
                <div className="text-gray-500 uppercase text-[10px]">
                  {f.facility_type}
                  {f.phone && <> · 📞 {f.phone}</>}
                </div>
              </div>
              <div className="text-right">
                {f.distance != null && (
                  <div className="text-[#8f6b45] font-mono text-[11px]">
                    {fmtDistance(f.distance)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
