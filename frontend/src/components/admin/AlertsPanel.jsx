import { useState } from "react";
import { fmtDateTime, severityBadgeClass } from "../../utils/format";

export default function AlertsPanel({ alerts, onCreateAlert, onClearAlert }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    severity: "warning",
    title: "",
    body: "",
    area: "",
    radius_m: 2000,
  });

  return (
    <div className="p-3 space-y-3">
      <button
        onClick={() => setShowForm(!showForm)}
        className="btn btn-primary w-full text-xs"
      >
        {showForm ? "✕ Cancel" : "📢 Issue Alert"}
      </button>

      {showForm && (
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.title.trim()) return;
            onCreateAlert({
              ...form,
              radius_m: +form.radius_m,
              lat: 12.91,
              lng: 74.85,
            });
            setForm({ severity: "warning", title: "", body: "", area: "", radius_m: 2000 });
            setShowForm(false);
          }}
        >
          <div className="card-header">
            <span className="text-xs">New Alert</span>
          </div>
          <div className="p-2.5 space-y-2">
            <div>
              <label className="label">Severity</label>
              <select
                className="select"
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Alert title"
                required
              />
            </div>
            <div>
              <label className="label">Body</label>
              <textarea
                className="textarea"
                rows={3}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Area</label>
                <input
                  className="input"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Radius (m)</label>
                <input
                  className="input"
                  type="number"
                  value={form.radius_m}
                  onChange={(e) => setForm({ ...form, radius_m: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full text-xs">
              Broadcast Alert
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {alerts.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-4">No active alerts</div>
        )}
        {alerts.map((a) => (
          <div key={a.id} className="card">
            <div className="p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className={`badge ${severityBadgeClass(a.severity)}`}>{a.severity}</span>
                <button
                  onClick={() => onClearAlert(a.id)}
                  className="text-[10px] text-gray-500 hover:text-red-400"
                >
                  ✕ clear
                </button>
              </div>
              <div className="text-xs font-bold">{a.title}</div>
              {a.body && <div className="text-[11px] text-gray-400">{a.body}</div>}
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                {a.area && <span>📍 {a.area}</span>}
                <span>{fmtDateTime(a.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
