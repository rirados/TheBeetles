const API_BASE = "/api/v1";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Citizen
  createReport: (payload) =>
    request("/citizen/reports", { method: "POST", body: JSON.stringify(payload) }),
  listReports: (limit = 50) => request(`/citizen/reports?limit=${limit}`),
  getReport: (id) => request(`/citizen/reports/${id}`),
  nearbyFacilities: (lat, lng, radius = 3000, types = null) =>
    request(
      `/citizen/nearby?lat=${lat}&lng=${lng}&radius_m=${radius}${types ? `&types=${types}` : ""}`
    ),
  activeAlerts: () => request("/citizen/alerts"),

  // Routing
  planRoute: (payload) =>
    request("/route/plan", { method: "POST", body: JSON.stringify(payload) }),
  dispatch: (payload) =>
    request("/route/dispatch", { method: "POST", body: JSON.stringify(payload) }),

  // Vehicles
  listVehicles: () => request("/vehicles"),
  createVehicle: (payload) =>
    request("/vehicles", { method: "POST", body: JSON.stringify(payload) }),
  updateVehicle: (id, payload) =>
    request(`/vehicles/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  seedVehicles: () => request("/vehicles/seed", { method: "POST" }),

  // Incidents
  listIncidents: () => request("/incidents"),
  createIncident: (payload) =>
    request("/incidents", { method: "POST", body: JSON.stringify(payload) }),
  resolveIncident: (id) =>
    request(`/incidents/${id}/resolve`, { method: "PATCH" }),

  // Alerts
  listAlerts: () => request("/alerts"),
  createAlert: (payload) =>
    request("/alerts", { method: "POST", body: JSON.stringify(payload) }),
  clearAlert: (id) => request(`/alerts/${id}`, { method: "DELETE" }),

  // Admin
  metrics: () => request("/admin/metrics"),
  weather: (lat, lng) =>
    request(`/admin/weather${lat ? `?lat=${lat}&lng=${lng}` : ""}`),
  mapState: () => request("/admin/map/state"),
  reportTrafficAnomaly: (lat, lng, score) =>
    request(`/admin/traffic/anomaly?lat=${lat}&lng=${lng}&score=${score}`, {
      method: "POST",
    }),
  decayRisk: (hours = 1) =>
    request(`/admin/risk/decay?hours=${hours}`, { method: "POST" }),
  clearAll: () => request("/admin/clear-all", { method: "POST" }),
  simulateFlood: (lat, lng, depth = "waist") =>
    request(`/admin/simulate/flood?lat=${lat}&lng=${lng}&depth=${depth}`, { method: "POST" }),
};
