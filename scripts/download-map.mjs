import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { validateConfig } from "../src/game.js";
import { downloadMapData } from "../src/map-data.js";
const c = validateConfig(
  JSON.parse(await readFile("public/hunt.json", "utf8")),
);
const geo = await downloadMapData(c.map, { onProgress: console.log });
const file = `public/${c.map.file}`;
await mkdir(dirname(file), { recursive: true });
await writeFile(file + ".tmp", JSON.stringify(geo));
await rename(file + ".tmp", file);
const metadata = {
  ...c.map,
  source: "OpenStreetMap via Overpass",
  license: "ODbL-1.0",
  downloadedAt: new Date().toISOString(),
};
await writeFile(
  c.map.file === "regions/tenerife.geojson"
    ? "public/regions/tenerife-meta.json"
    : "public/map-meta.json",
  JSON.stringify(metadata, null, 2),
);
console.log(`${geo.features.length} OSM-Objekte in ${file} gespeichert.`);
