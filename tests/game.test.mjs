import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateConfig,
  newGroup,
  elapsed,
  formatTime,
  findStation,
  recordStation,
  qrValue,
} from "../src/game.js";
const config = JSON.parse(
  await readFile(new URL("../public/hunt.json", import.meta.url)),
);
test("deployed configuration is valid and rejects duplicate codes", () => {
  assert.equal(validateConfig(config), config);
  const invalid = structuredClone(config);
  invalid.stations[1].code = invalid.stations[0].code;
  assert.throws(() => validateConfig(invalid));
});
test("QR codes belong to this hunt; manual codes are case insensitive", () => {
  const station = config.stations[0];
  assert.equal(findStation(config, qrValue(config, station)), station);
  assert.equal(
    findStation(config, "  " + station.code.toLowerCase() + " "),
    station,
  );
  assert.equal(
    findStation(config, "waldabenteuer:foreign:" + station.code),
    null,
  );
  assert.equal(findStation(config, "garbage"), null);
});
test("timer requires start, counts reload time and freezes after completion", () => {
  const g = newGroup("Test");
  assert.equal(
    recordStation(config, g, config.stations[0], 2000),
    "not-started",
  );
  g.started = 1000;
  assert.equal(elapsed(g, 8000), 7000);
  config.stations.forEach((s, i) =>
    assert.equal(recordStation(config, g, s, 2000 + i * 1000), "success"),
  );
  assert.equal(elapsed(g, 99000), 5000);
  assert.equal(g.found[config.stations[0].id].elapsed, 1000);
  assert.equal(recordStation(config, g, config.stations[0], 9000), "duplicate");
  assert.equal(Object.keys(g.found).length, config.stations.length);
});
test("groups have independent progress and time formatting preserves hours", () => {
  const a = newGroup("A"),
    b = newGroup("B");
  a.started = 1000;
  recordStation(config, a, config.stations[0], 2000);
  assert.deepEqual(b.found, {});
  assert.equal(formatTime(3661000), "01:01:01");
});
