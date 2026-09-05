import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  newGroup,
  recordStation,
  solveStation,
  validateConfig,
} from "../src/game.js";
import { createDraft, assignOrder, exportConfig } from "../src/admin-model.js";
import { visibleStations } from "../src/tracking.js";
import { resolveMap, mapKey, contains } from "../src/regions.js";
import { mapQuery, osmToGeoJSON } from "../src/map-data.js";
import { certificateSvg } from "../src/experience.js";
const base = JSON.parse(
  await readFile(new URL("../public/hunt.json", import.meta.url)),
);
test("password progression requires scan then correct answer, persists pending task and blocks later QR codes", () => {
  const c = {
    ...base,
    progression: "password",
    stationVisibility: "all",
    stations: base.stations
      .slice(0, 2)
      .map((s) => ({
        ...s,
        challenge: { prompt: "Wie heißt dieser Baum?", answer: "Grüne Pinie" },
      })),
  };
  validateConfig(c);
  let g = newGroup("Die Füchse");
  g.started = 1000;
  assert.equal(
    solveStation(c, g, c.stations[0], "Grüne Pinie", 2000),
    "not-scanned",
  );
  assert.equal(recordStation(c, g, c.stations[1], 2000), "locked");
  assert.equal(recordStation(c, g, c.stations[0], 2000), "challenge");
  assert.equal(Object.keys(g.found).length, 0);
  g = JSON.parse(JSON.stringify(g));
  assert.ok(g.scanned[c.stations[0].id]);
  assert.equal(visibleStations(c, g).length, 1);
  assert.equal(solveStation(c, g, c.stations[0], "falsch", 3000), "incorrect");
  assert.equal(
    solveStation(c, g, c.stations[0], "  GRÜNE   PINIE ", 4000),
    "success",
  );
  assert.equal(visibleStations(c, g).length, 2);
  assert.equal(recordStation(c, g, c.stations[1], 5000), "challenge");
  assert.equal(g.finished, null);
  assert.equal(
    solveStation(c, g, c.stations[1], "Grüne Pinie", 6000),
    "success",
  );
  assert.equal(g.finished, 6000);
  assert.equal(
    solveStation(c, g, c.stations[1], "Grüne Pinie", 8000),
    "duplicate",
  );
  assert.equal(g.finished, 6000);
});
test("new adventures default to untimed and export requires complete tasks only for placed cards", () => {
  const d = createDraft("Wald", 3);
  assert.equal(d.timing, false);
  const s = d.stations[0];
  s.position = [28.42, -16.38];
  assignOrder(d, s);
  d.progression = "password";
  assert.throws(() => exportConfig(d), /Aufgabe oder Lösungswort/);
  s.challenge = {
    prompt: "Wie heißt der Baum?",
    answer: "Pinie",
    hint: "Er hat Nadeln.",
  };
  const c = exportConfig(d);
  assert.equal(c.stations.length, 1);
  assert.equal(c.stationVisibility, "next");
  assert.equal(c.timing, false);
  assert.equal(c.stations[0].challenge.answer, "Pinie");
  const g = {
    name: "Team",
    started: 1000,
    finished: 2000,
    found: { [s.id]: {} },
  };
  assert.ok(!certificateSvg(c, g).includes("ABENTEUERZEIT"));
});
test("island map allows widely separated Tenerife stations and custom regions work outside Tenerife", () => {
  const d = createDraft("Inselrunde", 2);
  d.mapSelection = { mode: "tenerife" };
  d.stations[0].position = [28.1, -16.7];
  d.stations[1].position = [28.55, -16.15];
  const c = exportConfig(d);
  assert.equal(c.map.file, "regions/tenerife.geojson");
  assert.ok(c.stations.every((s) => contains(c.map.bounds, s.position)));
  const map = resolveMap({
    mode: "custom",
    center: [52.52, 13.405],
    radiusKm: 5,
  });
  assert.ok(contains(map.bounds, [52.52, 13.405]));
  assert.throws(() =>
    resolveMap({ mode: "custom", center: [52, 13], radiusKm: 100 }),
  );
  assert.notEqual(mapKey(map), mapKey(c.map));
  d.mapSelection = { mode: "las-raices" };
  assert.throws(() => exportConfig(d), /außerhalb/);
});
test("map queries adapt to island size and reject partial Overpass replies", () => {
  assert.ok(
    mapQuery(resolveMap({ mode: "tenerife" })).includes(
      "way[highway](27.97,-16.98,28.63,-16.08)",
    ),
  );
  assert.ok(!mapQuery(resolveMap({ mode: "tenerife" })).includes("[building]"));
  assert.ok(
    mapQuery(resolveMap({ mode: "las-raices" })).includes("[building]"),
  );
  assert.throws(() =>
    osmToGeoJSON({ remark: "runtime error: timeout", elements: [{}] }),
  );
  const geo = osmToGeoJSON({
    elements: [
      {
        type: "way",
        id: 1,
        tags: { highway: "path" },
        geometry: [
          { lat: 28, lon: -16 },
          { lat: 28.01, lon: -16.01 },
        ],
      },
      {
        type: "node",
        id: 2,
        tags: { place: "town", name: "Ort" },
        lat: 28,
        lon: -16,
      },
    ],
  });
  assert.equal(geo.features[0].geometry.type, "LineString");
  assert.equal(geo.features[1].properties.name, "Ort");
});
