import L from "leaflet";

// Override default icon paths to use CDN assets that work with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export { L };

// Custom icon builders
export function makeIcon(emoji, bg = "#1d4ed8", size = 32) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background:${bg};
      width:${size}px;height:${size}px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);font-size:${size * 0.55}px;line-height:1;">${emoji}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
  });
}

export function makePulseIcon(emoji, bg = "#dc2626", size = 36) {
  return L.divIcon({
    className: "custom-marker-pulse",
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        <div class="pulse-ring" style="
          position:absolute;inset:0;border-radius:50%;
          background:${bg};opacity:0.6;
        "></div>
        <div style="
          position:relative;
          background:${bg};
          width:${size}px;height:${size}px;
          border-radius:50%;
          border:2px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
          display:flex;align-items:center;justify-content:center;
        "><span style="font-size:${size * 0.55}px;line-height:1;">${emoji}</span></div>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export const ICONS = {
  hospital: makeIcon("🏥", "#dc2626", 28),
  shelter: makeIcon("🏠", "#16a34a", 28),
  police: makeIcon("👮", "#1e40af", 28),
  fire: makeIcon("🚒", "#ea580c", 28),
  depot: makeIcon("🏭", "#7c3aed", 28),
  flood: makePulseIcon("🌊", "#0891b2", 32),
  landslide: makePulseIcon("⛰️", "#92400e", 34),
  blocked_road: makeIcon("🚧", "#f59e0b", 30),
  fallen_tree: makeIcon("🌳", "#15803d", 30),
  other: makeIcon("⚠️", "#7c3aed", 30),
  incident: makePulseIcon("🆘", "#dc2626", 36),
  citizen: makeIcon("📍", "#3b82f6", 26),
  vehicle_ambulance: makeIcon("🚑", "#16a34a", 30),
  vehicle_fire_truck: makeIcon("🚒", "#ea580c", 30),
  vehicle_police: makeIcon("🚓", "#1e40af", 30),
  vehicle_rescue_boat: makeIcon("🚤", "#0891b2", 30),
  vehicle_ndrf: makeIcon("🎖️", "#7c3aed", 30),
};

export function vehicleIcon(vehicleType) {
  return ICONS[`vehicle_${vehicleType}`] || ICONS.vehicle_ambulance;
}

export function hazardIcon(hazardType) {
  return ICONS[hazardType] || ICONS.other;
}
