import { useState } from "react";

const HAZARDS = [
  { value: "flood", label: "🌊 Flood / Waterlogging" },
  { value: "landslide", label: "⛰️ Landslide" },
  { value: "blocked_road", label: "🚧 Blocked Road" },
  { value: "fallen_tree", label: "🌳 Fallen Tree" },
  { value: "other", label: "⚠️ Other Hazard" },
];

const DEPTHS = [
  { value: "ankle", label: "Ankle-deep (~15 cm)" },
  { value: "knee", label: "Knee-deep (~50 cm)" },
  { value: "waist", label: "Waist-deep (~90 cm)" },
  { value: "chest", label: "Chest-deep (~120 cm)" },
  { value: "above_chest", label: "Above chest (>120 cm)" },
];

export default function CitizenReportForm({ position, onSubmit }) {
  const [hazardType, setHazardType] = useState("flood");
  const [depth, setDepth] = useState("ankle");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!position) {
      setError("Please enable location services to submit a report.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        hazard_type: hazardType,
        flood_depth: hazardType === "flood" ? depth : "none",
        description,
        lat: position.lat,
        lng: position.lng,
        accuracy_m: position.accuracy,
      });
      // Reset
      setDescription("");
    } catch (err) {
      setError(err.message || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <div className="card-header">
        <span>New Hazard Report</span>
        {position && <span className="badge badge-success">GPS Active</span>}
      </div>
      <div className="card-body space-y-3">
        {!position && (
          <div className="bg-yellow-900/30 border border-yellow-700/40 rounded p-2 text-xs text-yellow-300">
            ⚠️ Waiting for GPS location. Please allow location access.
          </div>
        )}

        <div>
          <label className="label">Hazard Type</label>
          <select
            className="select"
            value={hazardType}
            onChange={(e) => setHazardType(e.target.value)}
          >
            {HAZARDS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </div>

        {hazardType === "flood" && (
          <div>
            <label className="label">Estimated Water Depth</label>
            <select
              className="select"
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
            >
              {DEPTHS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Description (optional)</label>
          <textarea
            className="textarea"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add any details that help responders (e.g. number of people stranded, landmarks, severity)..."
          />
        </div>

        {/* Location summary */}
        {position && (
          <div className="bg-[#0b1220] rounded p-2 border border-[#1f2d4d] text-[11px] text-gray-400 font-mono">
            📍 {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            {position.accuracy && (
              <span className="text-gray-500"> (±{Math.round(position.accuracy)}m)</span>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/40 rounded p-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !position}
          className="btn btn-primary w-full"
        >
          {submitting ? "Submitting..." : "🚨 Submit Report"}
        </button>
      </div>
    </form>
  );
}
