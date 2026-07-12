import { useState } from "react";
import { fmtDistance, fmtDuration, statusBadgeClass } from "../../utils/format";

const DEFAULT_CENTER = { lat: 12.91, lng: 74.85 };

export default function IncidentsPanel({
  incidents,
  vehicles,
  onDispatch,
  onResolve,
  onCreateIncident,
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState({});

  const open = incidents.filter((i) => i.status !== "resolved");
  const resolved = incidents.filter((i) => i.status === "resolved");
  const idleVehicles = vehicles.filter((v) => v.status === "idle" || v.status === "returning");

  return (
    <div className="p-3 space-y-3">
      <button
        onClick={() => setShowForm(!showForm)}
        className="btn btn-primary w-full text-xs"
      >
        {showForm ? "✕ Cancel" : "➕ New Incident"}
      </button>

      {showForm && (
        <IncidentForm
          onCreate={(payload) => {
            onCreateIncident(payload);
            setShowForm(false);
          }}
        />
      )}

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Active ({open.length})
        </div>
        {open.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-3">No active incidents</div>
        )}
        {open.map((i) => {
          const assignedVehicle = vehicles.find((v) => v.id === i.vehicle_id);
          return (
            <div key={i.id} className="card">
              <div className="p-2.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-xs font-bold">{i.title}</div>
                    {i.description && (
                      <div className="text-[11px] text-gray-400 mt-0.5">{i.description}</div>
                    )}
                  </div>
                  <PriorityBadge priority={i.priority} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span>📍 {i.lat?.toFixed(4)}, {i.lng?.toFixed(4)}</span>
                  <span className={`badge ${statusBadgeClass(i.status)}`}>{i.status}</span>
                </div>

                {assignedVehicle && (
                  <div className="bg-[#0b1220] rounded p-1.5 text-[10px] border border-[#1f2d4d]">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Assigned:</span>
                      <span className="font-medium">{assignedVehicle.call_sign}</span>
                    </div>
                    {assignedVehicle.route_eta_seconds != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">ETA:</span>
                        <span className="font-mono text-blue-300">
                          {fmtDuration(assignedVehicle.route_eta_seconds)}
                        </span>
                      </div>
                    )}
                    {assignedVehicle.route_distance_m != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Dist:</span>
                        <span className="font-mono">
                          {fmtDistance(assignedVehicle.route_distance_m)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-1.5 pt-1">
                  {i.status === "open" && (
                    <>
                      <select
                        className="select flex-1 text-[11px] py-1"
                        value={selectedVehicle[i.id] || ""}
                        onChange={(e) =>
                          setSelectedVehicle({ ...selectedVehicle, [i.id]: e.target.value })
                        }
                      >
                        <option value="">Auto (nearest)</option>
                        {idleVehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.call_sign} ({v.vehicle_type})
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn-primary text-[11px] py-1"
                        onClick={() => onDispatch(i.id, selectedVehicle[i.id] || null)}
                      >
                        Dispatch
                      </button>
                    </>
                  )}
                  {i.status !== "open" && i.status !== "resolved" && (
                    <button
                      className="btn btn-secondary text-[11px] py-1 flex-1"
                      onClick={() => onResolve(i.id)}
                    >
                      ✓ Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {resolved.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Resolved ({resolved.length})
          </div>
          {resolved.slice(0, 5).map((i) => (
            <div key={i.id} className="card opacity-60">
              <div className="p-2 text-xs">
                <div className="font-medium">{i.title}</div>
                <div className="text-[10px] text-gray-500">{fmtDistance(null)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }) {
  const cls =
    priority >= 4 ? "badge-danger" : priority >= 3 ? "badge-warning" : "badge-info";
  return <span className={`badge ${cls}`}>P{priority}</span>;
}

function IncidentForm({ onCreate }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [lat, setLat] = useState(DEFAULT_CENTER.lat);
  const [lng, setLng] = useState(DEFAULT_CENTER.lng);

  const useMyLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        },
        (err) => alert("Could not get location: " + err.message)
      );
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onCreate({ title, description, priority: +priority, lat: +lat, lng: +lng });
      }}
      className="card space-y-2"
    >
      <div className="card-header">
        <span className="text-xs">New Incident</span>
      </div>
      <div className="p-2.5 space-y-2">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief incident title"
            required
          />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label">Priority</label>
            <select
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value={1}>P1 Low</option>
              <option value={2}>P2</option>
              <option value={3}>P3</option>
              <option value={4}>P4</option>
              <option value={5}>P5 Critical</option>
            </select>
          </div>
          <div>
            <label className="label">Lat</label>
            <input
              className="input"
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Lng</label>
            <input
              className="input"
              type="number"
              step="0.0001"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        </div>
        <button type="button" onClick={useMyLocation} className="btn btn-ghost w-full text-xs">
          📍 Use My Location
        </button>
        <button type="submit" className="btn btn-primary w-full text-xs">
          Create Incident
        </button>
      </div>
    </form>
  );
}
