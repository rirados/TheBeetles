import { fmtDistance, fmtDuration, statusBadgeClass } from "../../utils/format";

export default function VehiclesPanel({ vehicles }) {
  const idle = vehicles.filter((v) => v.status === "idle");
  const active = vehicles.filter((v) => v.status !== "idle" && v.status !== "on_scene");
  const onScene = vehicles.filter((v) => v.status === "on_scene");

  return (
    <div className="p-3 space-y-3">
      <Section title="Active" vehicles={active} />
      <Section title="On Scene" vehicles={onScene} />
      <Section title="Idle / Available" vehicles={idle} />
    </div>
  );
}

function Section({ title, vehicles }) {
  if (!vehicles || vehicles.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
        {title} ({vehicles.length})
      </div>
      {vehicles.map((v) => (
        <div key={v.id} className="card">
          <div className="p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {vehicleEmoji(v.vehicle_type)}
                </span>
                <div>
                  <div className="text-xs font-bold">{v.call_sign}</div>
                  <div className="text-[10px] uppercase text-gray-500">
                    {v.vehicle_type}
                  </div>
                </div>
              </div>
              <span className={`badge ${statusBadgeClass(v.status)}`}>{v.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-[#f7efe6] rounded p-1.5 border border-[#e6dbca]">
                <div className="text-gray-500 uppercase">Position</div>
                <div className="font-mono text-[#4f463b]">
                  {v.lat?.toFixed(4)}, {v.lng?.toFixed(4)}
                </div>
              </div>
              <div className="bg-[#f7efe6] rounded p-1.5 border border-[#e6dbca]">
                <div className="text-gray-500 uppercase">Speed</div>
                <div className="font-mono text-[#4f463b]">
                  {(v.speed_kmh || 0).toFixed(1)} km/h
                </div>
              </div>
            </div>
            {v.route_eta_seconds != null && (
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-[#f7efe6] rounded p-1.5 border border-[#e6dbca]">
                  <div className="text-gray-500 uppercase">ETA</div>
                  <div className="font-mono text-[#8f6b45]">
                    {fmtDuration(v.route_eta_seconds)}
                  </div>
                </div>
                <div className="bg-[#f7efe6] rounded p-1.5 border border-[#e6dbca]">
                  <div className="text-gray-500 uppercase">Distance</div>
                  <div className="font-mono text-[#4f463b]">
                    {fmtDistance(v.route_distance_m)}
                  </div>
                </div>
              </div>
            )}
            {v.route_profile && (
              <div className="text-[10px] text-gray-500">
                Profile: <span className="uppercase font-medium text-gray-400">{v.route_profile}</span>
              </div>
            )}
            {v.depot_name && (
              <div className="text-[10px] text-gray-500"> {v.depot_name}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function vehicleEmoji(t) {
  return {
    ambulance: "",
    fire_truck: "",
    police: "",
    rescue_boat: "",
    ndrf: "",
  }[t] || "";
}
