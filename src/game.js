export const timingEnabled = (config) => config.timing !== false;
export const passwordMode = (config) => config.progression === "password";
export const normalizeAnswer = (value) =>
  String(value)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("de-DE");
export function validId(id) {
  return (
    typeof id === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(id) &&
    !["__proto__", "constructor", "prototype"].includes(id)
  );
}
export function validateConfig(c) {
  const point = (p) =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(Number.isFinite) &&
    Math.abs(p[0]) <= 90 &&
    Math.abs(p[1]) <= 180;
  if (
    !validId(c.id) ||
    typeof c.title !== "string" ||
    !c.title.trim() ||
    !c.map ||
    !point(c.map.center) ||
    !Array.isArray(c.map.bounds) ||
    c.map.bounds.length !== 2 ||
    !c.map.bounds.every(point) ||
    !/^[\w/-]+\.geojson$/.test(c.map.file) ||
    !c.stations?.length
  )
    throw new Error("Die Konfiguration ist unvollständig.");
  if (
    c.map.bounds[0][0] >= c.map.bounds[1][0] ||
    c.map.bounds[0][1] >= c.map.bounds[1][1]
  )
    throw new Error(
      "Kartengrenzen müssen von Südwest nach Nordost angegeben werden.",
    );
  if (c.stationVisibility && !["all", "next"].includes(c.stationVisibility))
    throw new Error("Ungültige Stationsanzeige.");
  if (c.timing !== undefined && typeof c.timing !== "boolean")
    throw Error("Ungültige Zeit-Einstellung.");
  if (c.progression && !["scan", "password"].includes(c.progression))
    throw Error("Ungültiger Spielmodus.");
  const ids = new Set(),
    codes = new Set();
  for (const s of c.stations) {
    if (
      !validId(s.id) ||
      !validId(s.code) ||
      !["name", "title", "message"].every(
        (key) => typeof s[key] === "string" && s[key].trim(),
      ) ||
      !point(s.position) ||
      ids.has(s.id) ||
      codes.has(s.code.trim().toUpperCase())
    )
      throw new Error(
        "Stationen brauchen eindeutige IDs, Codes, Texte und gültige Koordinaten.",
      );
    if (
      passwordMode(c) &&
      (!s.challenge ||
        typeof s.challenge.prompt !== "string" ||
        !s.challenge.prompt.trim() ||
        typeof s.challenge.answer !== "string" ||
        !normalizeAnswer(s.challenge.answer))
    )
      throw Error(`Für „${s.name}“ fehlen Aufgabe oder Lösungswort.`);
    ids.add(s.id);
    codes.add(s.code.trim().toUpperCase());
  }
  return c;
}
export function newGroup(name) {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Die Waldentdecker",
    started: null,
    finished: null,
    found: {},
    scanned: {},
    track: [],
  };
}
export function elapsed(group, now = Date.now()) {
  return group?.started
    ? Math.max(0, (group.finished || now) - group.started)
    : 0;
}
export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
export function findStation(config, value) {
  const raw = value.trim();
  if (raw.startsWith("waldabenteuer:")) {
    const [hunt, code] = raw.slice(14).split(":");
    if (hunt !== config.id) return null;
    return config.stations.find((s) => s.code === code) || null;
  }
  return (
    config.stations.find((s) => s.code.toUpperCase() === raw.toUpperCase()) ||
    null
  );
}
export function recordStation(config, group, station, now = Date.now()) {
  if (!group.started) return "not-started";
  if (group.found[station.id]) return "duplicate";
  if (group.finished) return "finished";
  if (passwordMode(config)) {
    if (config.stations.find((s) => !group.found[s.id])?.id !== station.id)
      return "locked";
    group.scanned ??= {};
    group.scanned[station.id] ??= {
      at: now,
      elapsed: Math.max(0, now - group.started),
    };
    return "challenge";
  }
  return completeStation(config, group, station, now);
}
function completeStation(config, group, station, now) {
  group.found[station.id] = {
    at: now,
    elapsed: Math.max(0, now - group.started),
  };
  if (config.stations.every((s) => group.found[s.id])) group.finished = now;
  return "success";
}
export function qrValue(config, station) {
  return `waldabenteuer:${config.id}:${station.code}`;
}

export function solveStation(config, group, station, value, now = Date.now()) {
  if (!passwordMode(config)) return "not-password-mode";
  if (!group.started) return "not-started";
  if (group.found[station.id]) return "duplicate";
  if (config.stations.find((s) => !group.found[s.id])?.id !== station.id)
    return "locked";
  if (!group.scanned?.[station.id]) return "not-scanned";
  if (
    !normalizeAnswer(station.challenge?.answer) ||
    normalizeAnswer(value) !== normalizeAnswer(station.challenge.answer)
  )
    return "incorrect";
  return completeStation(config, group, station, now);
}
