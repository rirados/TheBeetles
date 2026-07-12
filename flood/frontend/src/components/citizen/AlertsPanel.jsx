import { fmtDateTime, severityBadgeClass } from "../../utils/format";

export default function AlertsPanel({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="card">
      <div className="card-header">
        <span>Live Alerts</span>
        <span className="badge badge-danger blink">{alerts.length}</span>
      </div>
      <div className="card-body space-y-2 max-h-72 overflow-y-auto">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="p-2 bg-[#0b1220] rounded border border-[#1f2d4d] text-xs"
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`badge ${severityBadgeClass(a.severity)}`}>
                {a.severity}
              </span>
              <span className="text-[10px] text-gray-500">
                {fmtDateTime(a.created_at)}
              </span>
            </div>
            <div className="font-semibold">{a.title}</div>
            {a.body && <div className="text-gray-400 mt-0.5">{a.body}</div>}
            {a.area && (
              <div className="text-[10px] text-gray-500 mt-1">📍 {a.area}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
