import { passwordMode } from "./game.js";
export function distance(a, b) {
  const rad = Math.PI / 180,
    lat = (b.lat - a.lat) * rad,
    lng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function recordTrack(group, position) {
  if (!group.started || group.finished) return false;
  const c = position.coords,
    t = position.timestamp;
  if (
    !Number.isFinite(c.latitude) ||
    Math.abs(c.latitude) > 90 ||
    !Number.isFinite(c.longitude) ||
    Math.abs(c.longitude) > 180 ||
    !Number.isFinite(c.accuracy) ||
    c.accuracy > 80 ||
    c.accuracy < 0 ||
    !Number.isFinite(t) ||
    t < group.started
  )
    return false;
  group.track ??= [];
  const p = {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: Math.round(c.accuracy),
    at: t,
  };
  const last = group.track.at(-1);
  if (
    last &&
    (t - last.at < 5000 || (distance(last, p) < 3 && t - last.at < 60000))
  )
    return false;
  // Keep roughly 24 hours of walking fixes per group, without unbounded storage growth.
  if (group.track.length >= 17000) {
    group.track = group.track.filter((_, i) => i % 2 === 0);
    group.trackSimplified = true;
  }
  group.track.push(p);
  return true;
}
export function trackSegments(track = []) {
  const segments = [];
  for (const p of track) {
    const current = segments.at(-1),
      last = current?.at(-1);
    if (!last || p.at - last.at > 120000) segments.push([p]);
    else current.push(p);
  }
  return segments;
}
export function trackDistance(track = []) {
  return trackSegments(track).reduce(
    (sum, segment) =>
      sum +
      segment
        .slice(1)
        .reduce((total, p, i) => total + distance(segment[i], p), 0),
    0,
  );
}
export function visibleStations(config, group) {
  if (config.stationVisibility !== "next" && !passwordMode(config))
    return config.stations;
  const next = config.stations.find((s) => !group.found[s.id]);
  return config.stations.filter((s) => s === next || group.found[s.id]);
}
