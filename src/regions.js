export const isPoint = (p) =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every(Number.isFinite) &&
  Math.abs(p[0]) < 85 &&
  Math.abs(p[1]) <= 180;
export const REGIONS = [
  {
    id: "las-raices",
    name: "Las Raíces · La Esperanza",
    center: [28.421, -16.379],
    bounds: [
      [28.41, -16.395],
      [28.433, -16.362],
    ],
  },
  {
    id: "anaga",
    name: "Anaga · Cruz del Carmen",
    center: [28.546, -16.281],
    bounds: [
      [28.51, -16.325],
      [28.58, -16.235],
    ],
  },
  {
    id: "orotava",
    name: "La Orotava · Aguamansa",
    center: [28.358, -16.505],
    bounds: [
      [28.33, -16.54],
      [28.39, -16.47],
    ],
  },
  {
    id: "teide",
    name: "Teide · Las Cañadas",
    center: [28.248, -16.63],
    bounds: [
      [28.195, -16.705],
      [28.315, -16.53],
    ],
  },
  {
    id: "tenerife",
    name: "Ganz Teneriffa",
    center: [28.3, -16.53],
    bounds: [
      [27.97, -16.98],
      [28.63, -16.08],
    ],
    profile: "island",
  },
];
export function validBounds(bounds) {
  return (
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    bounds.every(isPoint) &&
    bounds[0][0] < bounds[1][0] &&
    bounds[0][1] < bounds[1][1] &&
    bounds[1][0] - bounds[0][0] <= 1.6 &&
    bounds[1][1] - bounds[0][1] <= 2
  );
}
export function contains(bounds, point) {
  return (
    point[0] >= bounds[0][0] &&
    point[0] <= bounds[1][0] &&
    point[1] >= bounds[0][1] &&
    point[1] <= bounds[1][1]
  );
}
export function customBounds(center, radiusKm) {
  if (
    !isPoint(center) ||
    !Number.isFinite(radiusKm) ||
    radiusKm < 0.2 ||
    radiusKm > 70
  )
    throw Error(
      "Bitte gültige Koordinaten und einen Radius zwischen 0,2 und 70 km wählen.",
    );
  const dy = radiusKm / 111.32,
    dx = dy / Math.cos((center[0] * Math.PI) / 180);
  const b = [
    [center[0] - dy, center[1] - dx],
    [center[0] + dy, center[1] + dx],
  ].map((p) => p.map((n) => +n.toFixed(6)));
  if (!validBounds(b))
    throw Error(
      "Dieser Kartenausschnitt ist zu groß oder überschreitet die Datumsgrenze.",
    );
  return b;
}
export function validateSelection(selection) {
  if (!selection || selection.mode === "auto") return true;
  if (REGIONS.some((r) => r.id === selection.mode)) return true;
  if (selection.mode === "custom") {
    customBounds(selection.center, selection.radiusKm);
    return true;
  }
  throw Error("Unbekanntes Kartengebiet.");
}
export function deriveMap(stations, paddingMeters = 400) {
  const points = stations.map((s) => s.position);
  if (!points.length || !points.every(isPoint))
    throw Error("Jede Station braucht eine gültige Position.");
  const lats = points.map((p) => p[0]),
    lngs = points.map((p) => p[1]);
  const center = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];
  const dy = paddingMeters / 111320,
    dx = dy / Math.cos((center[0] * Math.PI) / 180);
  const bounds = [
    [Math.min(...lats) - dy, Math.min(...lngs) - dx],
    [Math.max(...lats) + dy, Math.max(...lngs) + dx],
  ].map((p) => p.map((n) => +n.toFixed(6)));
  if (!validBounds(bounds))
    throw Error(
      "Die Stationen sind zu weit verstreut. Bitte die Koordinaten prüfen.",
    );
  return {
    file: "map.geojson",
    center: center.map((n) => +n.toFixed(6)),
    bounds,
    profile: mapProfile(bounds),
  };
}
export function mapProfile(bounds) {
  return (bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1]) > 0.02
    ? "island"
    : "local";
}
export function resolveMap(selection, stations = [], fallback) {
  validateSelection(selection);
  const mode = selection?.mode || "auto";
  if (mode === "auto") {
    const placed = stations.filter((s) => isPoint(s.position));
    return placed.length
      ? deriveMap(placed)
      : structuredClone(
          fallback || { ...REGIONS[0], file: "map.geojson", profile: "local" },
        );
  }
  if (mode === "custom") {
    const bounds = customBounds(selection.center, selection.radiusKm);
    return {
      file: "map.geojson",
      center: selection.center,
      bounds,
      profile: mapProfile(bounds),
    };
  }
  const r = REGIONS.find((r) => r.id === mode);
  return {
    file: mode === "tenerife" ? "regions/tenerife.geojson" : "map.geojson",
    center: [...r.center],
    bounds: structuredClone(r.bounds),
    profile: r.profile || mapProfile(r.bounds),
  };
}
export function mapKey(map) {
  return `${map.profile || mapProfile(map.bounds)}:${map.bounds
    .flat()
    .map((n) => n.toFixed(6))
    .join(",")}`;
}
