import { readFile, access } from "node:fs/promises";
import { validateConfig } from "../src/game.js";
const c = validateConfig(
  JSON.parse(await readFile("public/hunt.json", "utf8")),
);
let fresh = false;
try {
  const metadata = JSON.parse(
    await readFile(
      c.map.file === "regions/tenerife.geojson"
        ? "public/regions/tenerife-meta.json"
        : "public/map-meta.json",
      "utf8",
    ),
  );
  await access(`public/${c.map.file}`);
  fresh =
    metadata.file === c.map.file &&
    JSON.stringify(metadata.bounds) === JSON.stringify(c.map.bounds);
} catch {}
if (!fresh) {
  console.log(
    "Kartenausschnitt hat sich geändert. Lade passende OpenStreetMap-Daten …",
  );
  await import("./download-map.mjs");
} else console.log("Mitgelieferte Offline-Karte passt zur Konfiguration.");
