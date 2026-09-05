import { validBounds, mapProfile } from "./regions.js";
export function mapQuery(map) {
  if (!validBounds(map.bounds)) throw Error("Ungültiger Kartenausschnitt.");
  const bbox = map.bounds.flat().join(","),
    large = (map.profile || mapProfile(map.bounds)) === "island";
  return `[out:json][timeout:150];(way[highway](${bbox});${large ? `way[natural~"^(wood|scrub|water|coastline|beach)$"](${bbox});way[landuse=forest](${bbox});` : `way[landuse](${bbox});way[natural](${bbox});way[building](${bbox});`}node[place~"^(city|town|village)$"](${bbox}););out geom;`;
}
export function osmToGeoJSON(data) {
  if (data.remark) throw Error(`Kartendienst: ${data.remark}`);
  if (!Array.isArray(data.elements))
    throw Error("Der Kartendienst lieferte keine gültigen Daten.");
  const features = [];
  for (const e of data.elements) {
    const properties = e.tags || {};
    let geometry;
    if (e.type === "node" && Number.isFinite(e.lat) && Number.isFinite(e.lon))
      geometry = { type: "Point", coordinates: [e.lon, e.lat] };
    else if (e.type === "way" && e.geometry?.length > 1) {
      const coordinates = e.geometry
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)]);
      if (coordinates.length < 2) continue;
      const a = coordinates[0],
        z = coordinates.at(-1),
        closed = coordinates.length >= 4 && a[0] === z[0] && a[1] === z[1];
      const area =
        closed &&
        properties.area !== "no" &&
        (properties.building ||
          properties.landuse ||
          ["wood", "scrub", "water", "beach", "grassland", "heath"].includes(
            properties.natural,
          ) ||
          properties.area === "yes");
      geometry = {
        type: area ? "Polygon" : "LineString",
        coordinates: area ? [coordinates] : coordinates,
      };
    } else continue;
    features.push({
      type: "Feature",
      id: `${e.type}/${e.id}`,
      properties: Object.fromEntries(
        Object.entries(properties).filter(([k]) =>
          [
            "highway",
            "landuse",
            "natural",
            "building",
            "name",
            "place",
            "surface",
            "waterway",
          ].includes(k),
        ),
      ),
      geometry,
    });
  }
  if (!features.length)
    throw Error(
      "Keine Kartendaten gefunden. Die bestehende Karte bleibt erhalten.",
    );
  return { type: "FeatureCollection", features };
}
export async function downloadMapData(
  map,
  { signal, onProgress = () => {} } = {},
) {
  onProgress("OpenStreetMap-Daten werden angefragt …");
  const timeout = AbortSignal.timeout(180000);
  const combined =
    signal && AbortSignal.any
      ? AbortSignal.any([signal, timeout])
      : signal || timeout;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: mapQuery(map) }),
    signal: combined,
  });
  if (!response.ok)
    throw Error(
      `Kartendienst momentan nicht verfügbar (${response.status}). Bitte später erneut versuchen.`,
    );
  onProgress("Kartendaten werden geladen und für offline vorbereitet …");
  const data = await response.json();
  const geo = osmToGeoJSON(data);
  onProgress(
    `${geo.features.length.toLocaleString("de-DE")} Kartenobjekte geladen.`,
  );
  return geo;
}

const loadedMaps = new Map();
export function fetchMapGeoJSON(file) {
  if (!loadedMaps.has(file)) {
    loadedMaps.set(
      file,
      fetch(file)
        .then((r) => {
          if (!r.ok) throw Error("Kartendaten nicht verfügbar.");
          return r.json();
        })
        .catch((e) => {
          loadedMaps.delete(file);
          throw e;
        }),
    );
  }
  return loadedMaps.get(file);
}
