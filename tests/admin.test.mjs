import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDraft,
  validateDraft,
  exportConfig,
  deriveMap,
  applySurvey,
  assignOrder,
} from "../src/admin-model.js";
import { qrValue, findStation } from "../src/game.js";
test("unsorted pool keeps codes stable and exports only placed codes in survey order", () => {
  const d = createDraft("Pinienparty", 30);
  assert.equal(d.stations.length, 30);
  assert.equal(new Set(d.stations.map((s) => s.code)).size, 30);
  assert.throws(() => exportConfig(d), /Noch keine/);
  const picks = [d.stations[21], d.stations[3], d.stations[17]],
    qrs = picks.map((s) => qrValue(d, s));
  for (const [i, s] of picks.entries()) {
    applySurvey(s, {
      latitude: 28.42 + i * 0.001,
      longitude: -16.378,
      accuracy: 8,
    });
    assignOrder(d, s);
  }
  d.stationVisibility = "next";
  const out = exportConfig(d);
  assert.equal(out.stations.length, 3);
  assert.equal(out.stationVisibility, "next");
  assert.deepEqual(
    out.stations.map((s) => s.id),
    picks.map((s) => s.id),
  );
  qrs.forEach((qr, i) => assert.equal(findStation(out, qr).id, picks[i].id));
  assert.equal(findStation(out, qrValue(d, d.stations[0])), null);
  const before = picks[0].order;
  applySurvey(picks[0], { latitude: 28.4201, longitude: -16.378, accuracy: 6 });
  assignOrder(d, picks[0]);
  assert.equal(picks[0].order, before);
  assert.equal(out.stations[0].name, "Station 1");
});
test("draft backup round-trip allows incomplete coordinates and validates duplicates", () => {
  const d = createDraft("Test", 10);
  assert.equal(
    validateDraft(JSON.parse(JSON.stringify(d))).stations.length,
    10,
  );
  const invalid = structuredClone(d);
  invalid.stations[1].code = invalid.stations[0].code;
  assert.throws(() => validateDraft(invalid));
  assert.throws(() => createDraft("Test", 0));
  assert.throws(() => createDraft("Test", 101));
});
test("map bounds cover points with margin and reject unreasonable spread", () => {
  const points = [
    { position: [28.42, -16.38] },
    { position: [28.425, -16.375] },
  ];
  const map = deriveMap(points);
  points.forEach((s) => {
    assert.ok(
      s.position[0] > map.bounds[0][0] && s.position[0] < map.bounds[1][0],
    );
    assert.ok(
      s.position[1] > map.bounds[0][1] && s.position[1] < map.bounds[1][1],
    );
  });
  assert.throws(() =>
    deriveMap([{ position: [28, -16] }, { position: [32, -16] }]),
  );
  assert.throws(() => deriveMap([{ position: null }]));
});
test("stale GPS cannot silently become a saved station", () => {
  const d = createDraft("Test", 1);
  assert.throws(() =>
    applySurvey(
      d.stations[0],
      { latitude: 28.42, longitude: -16.38, accuracy: 8 },
      Date.now() - 61000,
    ),
  );
  assert.equal(d.stations[0].position, null);
});

test("pool extension, reorder and returning cards preserve printed QR identities", async () => {
  const { addCards, moveStation, returnToPool, placedStations } =
    await import("../src/admin-model.js");
  const d = createDraft("Wald", 3);
  const original = d.stations.map((s) => qrValue(d, s));
  addCards(d, 4);
  assert.equal(validateDraft(d).stations.length, 7);
  assert.deepEqual(
    d.stations.slice(0, 3).map((s) => qrValue(d, s)),
    original,
  );
  const [a, b, c] = d.stations;
  for (const s of [a, b, c]) {
    applySurvey(s, { latitude: 28.42, longitude: -16.38, accuracy: 5 });
    assignOrder(d, s);
  }
  moveStation(d, c, -1);
  assert.deepEqual(placedStations(d), [a, c, b]);
  returnToPool(d, c);
  assert.deepEqual(placedStations(d), [a, b]);
  assert.deepEqual(
    placedStations(d).map((s) => s.order),
    [1, 2],
  );
  assert.equal(c.position, null);
  assert.equal(qrValue(d, c), original[2]);
  assert.throws(() => addCards(d, 94));
  assert.equal(d.stations.length, 7);
});
