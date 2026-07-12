import { useEffect, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import CitizenReportForm from "../components/citizen/CitizenReportForm";
import NearbyPanel from "../components/citizen/NearbyPanel";
import AlertsPanel from "../components/citizen/AlertsPanel";
import { useGeolocation } from "../hooks/useGeolocation";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../services/api";
import { ICONS } from "../utils/icons";

const DEFAULT_CENTER = [12.9100, 74.8500]; // Mangalore

function Recenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.lat, position.lng], 15);
  }, [position, map]);
  return null;
}

export default function CitizenPage() {
  const { position, error, loading, requestPosition, watch } = useGeolocation();
  const { connected, on } = useWebSocket("citizen");
  const [reports, setReports] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [ack, setAck] = useState(null);
  const watchIdRef = useRef(null);

  // Load initial data
  useEffect(() => {
    api.listReports(20).then(setReports).catch(console.error);
    api.activeAlerts().then(setAlerts).catch(console.error);
  }, []);

  // Try to get location on mount
  useEffect(() => {
    requestPosition();
    watchIdRef.current = watch();
    return () => {
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load nearby facilities when position changes
  useEffect(() => {
    if (!position) return;
    api
      .nearbyFacilities(position.lat, position.lng, 5000)
      .then(setFacilities)
      .catch(console.error);
  }, [position]);

  // Subscribe to alert events
  useEffect(() => {
    const off1 = on("alert_new", (p) => {
      setAlerts((prev) => [{ ...p, active: true, created_at: new Date().toISOString() }, ...prev]);
    });
    const off2 = on("alert_cleared", (p) => {
      setAlerts((prev) => prev.filter((a) => a.id !== p.id));
    });
    const off3 = on("report_new", (p) => {
      setReports((prev) => [{ ...p, created_at: p.created_at || new Date().toISOString() }, ...prev]);
    });
    return () => {
      off1?.();
      off2?.();
      off3?.();
    };
  }, [on]);

  const handleSubmit = useCallback(async (payload) => {
    const result = await api.createReport(payload);
    setAck({
      id: result.id,
      confidence: result.confidence_score,
      status: result.status,
      validation: result.validation_breakdown,
    });
    setTimeout(() => setAck(null), 8000);
    return result;
  }, []);

  const center = position ? [position.lat, position.lng] : DEFAULT_CENTER;

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0">
      {/* Map */}
      <div className="relative">
        <MapContainer
          center={center}
          zoom={14}
          className="h-full w-full"
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {position && (
            <>
              <Marker position={[position.lat, position.lng]} icon={ICONS.citizen}>
                <Popup>
                  <div>
                    <strong>You are here</strong>
                    <br />
                    <small>Accuracy: ±{Math.round(position.accuracy)}m</small>
                  </div>
                </Popup>
              </Marker>
              <Circle
                center={[position.lat, position.lng]}
                radius={position.accuracy || 50}
                pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.1 }}
              />
              <Recenter position={position} />
            </>
          )}

          {/* Reports */}
          {reports.map((r) => (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
              icon={r.hazard_type === "flood" ? ICONS.flood : ICONS.incident}
            >
              <Popup>
                <div className="text-xs space-y-1">
                  <div className="font-bold uppercase">{r.hazard_type}</div>
                  <div>Depth: {r.flood_depth}</div>
                  <div>Confidence: {(r.confidence_score * 100).toFixed(0)}%</div>
                  <div>Status: {r.status}</div>
                  {r.photo_data_url && (
                    <div className="space-y-1 pt-1">
                      <img src={r.photo_data_url} alt="Hazard report" className="h-24 w-full rounded object-cover" />
                      <div>Captured: {r.photo_gps_lat?.toFixed(4) ?? "—"}, {r.photo_gps_lng?.toFixed(4) ?? "—"}</div>
                      <div>{r.shutter_time ? new Date(r.shutter_time).toLocaleString() : ""}</div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Facilities */}
          {facilities.map((f) => (
            <Marker
              key={f.id}
              position={[f.lat, f.lng]}
              icon={ICONS[f.facility_type] || ICONS.hospital}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-bold">{f.name}</div>
                  <div className="uppercase text-gray-400">{f.facility_type}</div>
                  {f.phone && <div>📞 {f.phone}</div>}
                  {f.capacity && <div>Cap: {f.capacity}</div>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Top overlay: location status */}
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-[#111a2e]/90 border border-[#1f2d4d] rounded-lg px-3 py-1.5 backdrop-blur">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500 blink"
            }`}
          ></span>
          <span className="text-xs text-gray-300">
            {connected ? "Live" : "Reconnecting..."}
          </span>
          <span className="text-xs text-gray-500">|</span>
          {position ? (
            <span className="text-xs text-gray-400 font-mono">
              {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
            </span>
          ) : (
            <span className="text-xs text-gray-500">
              {loading ? "Locating..." : error ? "No GPS" : "No GPS"}
            </span>
          )}
          <button
            onClick={requestPosition}
            className="text-xs text-blue-400 hover:text-blue-300 ml-1"
          >
            ↻
          </button>
        </div>

        {ack && (
          <div className="absolute top-3 right-3 z-[1000] slide-in">
            <div className="card max-w-sm">
              <div className="card-header">
                <span>Report Submitted</span>
                <span className={`badge ${ack.status === "validated" ? "badge-success" : "badge-warning"}`}>
                  {ack.status}
                </span>
              </div>
              <div className="card-body text-xs space-y-2">
                <div>
                  Confidence: <strong>{(ack.confidence * 100).toFixed(0)}%</strong>
                </div>
                {ack.validation && (
                  <div className="space-y-1">
                    {Object.entries(ack.validation).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-gray-400 capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="font-mono">{(v * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-gray-500 text-[10px]">Report ID: {ack.id.slice(0, 8)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <div className="bg-[#0b1220] border-l border-[#1f2d4d] overflow-y-auto">
        <div className="p-4 space-y-4">
          <div>
            <h1 className="text-lg font-bold mb-1">Report a Hazard</h1>
            <p className="text-xs text-gray-500">
              Help responders by reporting floods, blocked roads, or other hazards in your area.
              Your location and a geotagged photo are required.
            </p>
          </div>

          <CitizenReportForm position={position} onSubmit={handleSubmit} />

          <AlertsPanel alerts={alerts} />

          <NearbyPanel facilities={facilities} position={position} />
        </div>
      </div>
    </div>
  );
}
