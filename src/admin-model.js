import { validateConfig, validId } from "./game.js";
import {
  isPoint,
  deriveMap,
  resolveMap,
  validateSelection,
  contains,
} from "./regions.js";
export { isPoint, deriveMap } from "./regions.js";
export function createDraft(title, count, area = "Las Raíces") {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error("Bitte zwischen 1 und 100 QR-Codes wählen.");
  const id = `wald-${crypto.randomUUID()}`;
  return {
    schemaVersion: 1,
    stationVisibility: "all",
    timing: false,
    progression: "scan",
    mapSelection: { mode: "auto" },
    id,
    title: title.trim() || "Unser Waldabenteuer",
    area,
    region: "Teneriffa",
    description:
      "Ein Wald voller Geheimnisse. Findet alle Stationen und entdeckt gemeinsam euren Schatz!",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stations: Array.from({ length: count }, (_, i) => ({
      id: `station-${i + 1}`,
      code: crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
      name: "Neue Station",
      hint: "Findet die nächste Spur auf eurer Schatzkarte.",
      icon: "trees",
      position: null,
      title: "Eine neue Spur gefunden!",
      message: "Super gemacht! Gemeinsam kommt ihr dem Schatz immer näher.",
    })),
  };
}
export function validateDraft(d) {
  if (
    !d ||
    !validId(d.id) ||
    typeof d.title !== "string" ||
    !Array.isArray(d.stations) ||
    !d.stations.length ||
    d.stations.length > 100
  )
    throw new Error("Keine gültige Abenteuer-Datei.");
  if (d.stationVisibility && !["all", "next"].includes(d.stationVisibility))
    throw new Error("Ungültige Stationsanzeige.");
  validateSelection(d.mapSelection);
  if (d.timing !== undefined && typeof d.timing !== "boolean")
    throw Error("Ungültige Zeit-Einstellung.");
  if (d.progression && !["scan", "password"].includes(d.progression))
    throw Error("Ungültiger Spielmodus.");
  const ids = new Set(),
    codes = new Set();
  for (const s of d.stations) {
    if (
      !validId(s.id) ||
      !validId(s.code) ||
      ids.has(s.id) ||
      codes.has(s.code.toUpperCase()) ||
      !["name", "title", "message"].every(
        (k) => typeof s[k] === "string" && s[k].trim(),
      ) ||
      (s.position !== null && !isPoint(s.position))
    )
      throw new Error(
        "Ungültige Stationen, doppelte Codes oder fehlerhafte Koordinaten.",
      );
    ids.add(s.id);
    codes.add(s.code.toUpperCase());
  }
  return d;
}
export function exportConfig(draft) {
  validateDraft(draft);
  const placed = placedStations(draft);
  if (!placed.length)
    throw new Error(
      "Noch keine Station platziert. Hänge einen beliebigen QR-Code auf und speichere seinen Ort.",
    );
  const map = resolveMap(draft.mapSelection, placed);
  if (!placed.every((s) => contains(map.bounds, s.position)))
    throw Error(
      "Eine Station liegt außerhalb des gewählten Gebiets. Bitte ein größeres Gebiet oder die automatische Karte wählen.",
    );
  return validateConfig({
    id: draft.id,
    title: draft.title,
    area: draft.area || "Unser Wald",
    region: draft.region || "",
    stationVisibility:
      draft.progression === "password"
        ? "next"
        : draft.stationVisibility || "all",
    timing: draft.timing ?? true,
    progression: draft.progression || "scan",
    mapSelection: structuredClone(draft.mapSelection || { mode: "auto" }),
    demo: false,
    description:
      draft.description || "Findet alle Stationen und entdeckt euren Schatz!",
    map,
    stations: placed.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      hint: s.hint || "",
      position: s.position,
      icon: s.icon || "flag",
      title: s.title,
      message: s.message,
      ...(draft.progression === "password"
        ? { challenge: structuredClone(s.challenge || {}) }
        : {}),
    })),
  });
}
export function applySurvey(station, coords, timestamp = Date.now()) {
  const point = [coords.latitude, coords.longitude];
  if (
    !isPoint(point) ||
    !Number.isFinite(coords.accuracy) ||
    coords.accuracy < 0 ||
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp > 60000
  )
    throw new Error(
      "Die GPS-Messung ist ungültig oder veraltet. Bitte erneut messen.",
    );
  station.position = point.map((n) => +n.toFixed(7));
  station.survey = {
    accuracy: Math.round(coords.accuracy),
    capturedAt: new Date(timestamp).toISOString(),
    method: "gps",
  };
  return station;
}

export function placedStations(draft) {
  return draft.stations
    .filter((s) => isPoint(s.position))
    .sort(
      (a, b) =>
        (a.order ?? draft.stations.indexOf(a)) -
        (b.order ?? draft.stations.indexOf(b)),
    );
}
export function assignOrder(draft, station) {
  if (!Number.isFinite(station.order))
    station.order =
      Math.max(
        0,
        ...draft.stations
          .filter((s) => s !== station && isPoint(s.position))
          .map((s) => s.order ?? draft.stations.indexOf(s) + 1),
      ) + 1;
  if (station.name === "Neue Station")
    station.name = `Station ${station.order}`;
}

/** Extend the printed pool without invalidating any existing card. */
export function addCards(draft, count) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    draft.stations.length + count > 100
  )
    throw new Error("Insgesamt sind bis zu 100 Vorratskarten möglich.");
  const cards = createDraft(draft.title, count, draft.area).stations;
  const ids = new Set(draft.stations.map((s) => s.id));
  const codes = new Set(draft.stations.map((s) => s.code.toUpperCase()));
  let next = 1;
  for (const card of cards) {
    while (ids.has(`station-${next}`)) next++;
    card.id = `station-${next++}`;
    while (codes.has(card.code))
      card.code = crypto
        .randomUUID()
        .replaceAll("-", "")
        .slice(0, 10)
        .toUpperCase();
    ids.add(card.id);
    codes.add(card.code);
  }
  draft.stations.push(...cards);
  return cards;
}

export function moveStation(draft, station, offset) {
  const placed = placedStations(draft);
  const from = placed.indexOf(station),
    to = from + offset;
  if (from < 0 || ![-1, 1].includes(offset) || to < 0 || to >= placed.length)
    return;
  [placed[from], placed[to]] = [placed[to], placed[from]];
  placed.forEach((s, i) => {
    s.order = i + 1;
  });
}

export function returnToPool(draft, station) {
  station.position = null;
  station.survey = null;
  delete station.order;
  placedStations(draft).forEach((s, i) => {
    s.order = i + 1;
  });
}
