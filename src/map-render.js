import L from "leaflet";
function boundsOf(geometry) {
  const points =
    geometry.type === "Point"
      ? [geometry.coordinates]
      : geometry.type === "Polygon"
        ? geometry.coordinates.flat()
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates.flat(2)
          : geometry.type === "MultiLineString"
            ? geometry.coordinates.flat()
            : geometry.coordinates;
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const p of points || []) {
    if (!Array.isArray(p)) continue;
    west = Math.min(west, p[0]);
    east = Math.max(east, p[0]);
    south = Math.min(south, p[1]);
    north = Math.max(north, p[1]);
  }
  return [west, south, east, north];
}
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderMapData(map, geo) {
  const entries = geo.features
    .filter((f) => f.geometry)
    .map((f) => ({ feature: f, bounds: boundsOf(f.geometry) }));
  const layer = L.layerGroup().addTo(map);
  let queued;
  function draw() {
    if (!map._loaded) return;
    const view = map.getBounds().pad(0.2),
      z = map.getZoom();
    const selected = entries
      .filter(({ feature: f, bounds: b }) => {
        if (
          b[2] < view.getWest() ||
          b[0] > view.getEast() ||
          b[3] < view.getSouth() ||
          b[1] > view.getNorth()
        )
          return false;
        const h = f.properties?.highway;
        if (
          z < 11 &&
          h &&
          !["motorway", "trunk", "primary", "secondary", "tertiary"].includes(h)
        )
          return false;
        if (
          z < 13 &&
          h &&
          ["path", "footway", "steps", "cycleway", "track", "service"].includes(
            h,
          )
        )
          return false;
        if (z < 14 && f.properties?.building) return false;
        if (
          f.geometry.type === "Point" &&
          z < 11 &&
          f.properties.place !== "city"
        )
          return false;
        return true;
      })
      .map((e) => e.feature);
    layer.clearLayers();
    L.geoJSON(
      { type: "FeatureCollection", features: selected },
      {
        interactive: false,
        pointToLayer: (f, p) => {
          const dot = L.circleMarker(p, {
            radius: 2.5,
            color: "#6c8063",
            fillOpacity: 1,
            weight: 1,
          });
          if (f.properties.name)
            dot.bindTooltip(escape(f.properties.name), {
              permanent: true,
              direction: "right",
              className: "place-label",
            });
          return dot;
        },
        style: (f) => {
          const p = f.properties || {},
            highway = !!p.highway,
            path = ["path", "footway", "track", "steps"].includes(p.highway),
            water = ["water", "coastline"].includes(p.natural);
          return {
            color: highway
              ? path
                ? "#aa9a76"
                : "#c5b292"
              : p.building
                ? "#b7af96"
                : water
                  ? "#9ab9b4"
                  : "#b4c6a7",
            weight: highway ? (path ? 2 : 3) : 1,
            fillColor: p.building ? "#dcd4bb" : water ? "#c6dcd4" : "#cbd8b8",
            fillOpacity: 0.65,
            dashArray: path ? "5 6" : null,
          };
        },
      },
    ).addTo(layer);
  }
  function schedule() {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(draw);
  }
  map.on("moveend zoomend", schedule);
  draw();
  return {
    layer,
    remove() {
      cancelAnimationFrame(queued);
      map.off("moveend zoomend", schedule);
      map.removeLayer(layer);
    },
  };
}
