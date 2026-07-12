// Utility formatting helpers

export function fmtDistance(m) {
  if (m == null) return "-";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export function fmtDuration(s) {
  if (s == null) return "-";
  if (s < 60) return `${Math.round(s)} s`;
  const min = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export function fmtTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function riskColor(risk) {
  if (risk == null) return "#1f2d4d";
  if (risk < 0.2) return "#22c55e";
  if (risk < 0.4) return "#eab308";
  if (risk < 0.6) return "#f97316";
  if (risk < 0.8) return "#ea580c";
  return "#dc2626";
}

export function riskLabel(risk) {
  if (risk == null) return "Unknown";
  if (risk < 0.2) return "Clear";
  if (risk < 0.4) return "Low";
  if (risk < 0.6) return "Moderate";
  if (risk < 0.8) return "High";
  return "Critical";
}

export function severityBadgeClass(severity) {
  if (severity === "critical") return "badge-danger";
  if (severity === "warning") return "badge-warning";
  return "badge-info";
}

export function statusBadgeClass(status) {
  switch (status) {
    case "validated":
    case "resolved":
    case "on_scene":
      return "badge-success";
    case "pending":
    case "open":
      return "badge-warning";
    case "rejected":
      return "badge-danger";
    case "en_route":
    case "assigned":
      return "badge-info";
    default:
      return "badge-muted";
  }
}
