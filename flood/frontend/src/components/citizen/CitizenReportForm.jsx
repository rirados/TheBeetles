import { useEffect, useRef, useState } from "react";

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
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoMeta, setPhotoMeta] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return;
    }
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(err.message || "Unable to access the camera.");
    }
  }

  async function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const currentPosition = position || null;
    setPhotoDataUrl(dataUrl);
    setPhotoPreview(dataUrl);
    setPhotoMeta({
      lat: currentPosition?.lat ?? null,
      lng: currentPosition?.lng ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!position) {
      setError("Please enable location services to submit a report.");
      return;
    }
    if (!photoDataUrl) {
      setError("Please click a live photo to submit a report.");
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
        photo_data_url: photoDataUrl,
        photo_gps_lat: photoMeta?.lat ?? position.lat,
        photo_gps_lng: photoMeta?.lng ?? position.lng,
        shutter_time: photoMeta?.timestamp,
      });
      // Reset
      setDescription("");
      setPhotoDataUrl("");
      setPhotoPreview("");
      setPhotoMeta(null);
      setCameraActive(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
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
          <label className="label">Live photo of the hazard</label>
          {!cameraActive ? (
            <button type="button" onClick={startCamera} className="btn btn-primary w-full text-xs">
              Open Camera
            </button>
          ) : (
            <button type="button" onClick={capturePhoto} className="btn btn-secondary w-full text-xs">
              Capture Photo
            </button>
          )}
          {cameraError && (
            <div className="mt-2 rounded border border-red-700/40 bg-red-900/20 p-2 text-[10px] text-red-300">
              {cameraError}
            </div>
          )}
          <div className="mt-2 overflow-hidden rounded border border-[#1f2d4d] bg-[#0b1220]">
            <video ref={videoRef} className="h-40 w-full object-cover bg-black" muted playsInline />
          </div>
          <p className="mt-1 text-[10px] text-gray-500">
            A live camera photo is required. The time and live location are captured when the shutter is clicked.
          </p>
          {photoPreview && (
            <div className="mt-2 overflow-hidden rounded border border-[#1f2d4d] bg-[#0b1220]">
              <img src={photoPreview} alt="Captured hazard" className="h-40 w-full object-cover" />
            </div>
          )}
          {photoMeta && (
            <div className="mt-2 rounded border border-[#1f2d4d] bg-[#0b1220] p-2 text-[11px] text-gray-400">
              <div>📍 Capture location: {photoMeta.lat?.toFixed(5) ?? "—"}, {photoMeta.lng?.toFixed(5) ?? "—"}</div>
              <div>🕒 Capture time: {new Date(photoMeta.timestamp).toLocaleString()}</div>
            </div>
          )}
        </div>

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
