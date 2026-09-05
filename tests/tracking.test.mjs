import { test } from "node:test";
import assert from "node:assert/strict";
import { newGroup } from "../src/game.js";
import {
  recordTrack,
  trackDistance,
  trackSegments,
  visibleStations,
} from "../src/tracking.js";
test("track records only active game, rejects poor GPS and preserves gaps", () => {
  const g = newGroup("Team"),
    pos = (t, lat, accuracy = 5) => ({
      timestamp: t,
      coords: { latitude: lat, longitude: 0, accuracy },
    });
  assert.equal(recordTrack(g, pos(1000, 0)), false);
  g.started = 1000;
  assert.equal(recordTrack(g, pos(1000, 0)), true);
  assert.equal(recordTrack(g, pos(2000, 0.00001)), false);
  assert.equal(recordTrack(g, pos(7000, 0.0001, 100)), false);
  assert.equal(recordTrack(g, pos(7000, 0.0001)), true);
  assert.equal(recordTrack(g, pos(150000, 0.01)), true);
  assert.equal(trackSegments(g.track).length, 2);
  assert.ok(trackDistance(g.track) > 10 && trackDistance(g.track) < 12);
  g.finished = 160000;
  assert.equal(recordTrack(g, pos(170000, 0.02)), false);
});
test("next mode reveals next station and discoveries only", () => {
  const stations = [{ id: "a" }, { id: "b" }, { id: "c" }],
    g = { found: {} };
  assert.deepEqual(
    visibleStations({ stations, stationVisibility: "next" }, g),
    [stations[0]],
  );
  g.found.a = {};
  assert.deepEqual(
    visibleStations({ stations, stationVisibility: "next" }, g),
    stations.slice(0, 2),
  );
  assert.equal(
    visibleStations({ stations, stationVisibility: "all" }, g).length,
    3,
  );
});
