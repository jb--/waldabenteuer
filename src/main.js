import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  createIcons,
  Trees,
  Map,
  Flag,
  Users,
  Download,
  MapPin,
  Sparkles,
  Sun,
  Footprints,
  Pencil,
  Timer,
  Play,
  LoaderCircle,
  LocateFixed,
  Expand,
  ScanLine,
  Leaf,
  Mountain,
  WifiOff,
  X,
  Trophy,
  Check,
  Compass,
  CircleCheck,
  ArrowRight,
  PartyPopper,
  Plus,
  Printer,
  Move,
  Sprout,
  Bird,
  Gem,
  Route,
  Volume2,
  VolumeX,
  Moon,
  CircleHelp,
  Maximize2,
  Minimize2,
  Award,
  Navigation,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  KeyRound,
} from "lucide";
const icons = {
  Trees,
  Map,
  Flag,
  Users,
  Download,
  MapPin,
  Sparkles,
  Sun,
  Footprints,
  Pencil,
  Timer,
  Play,
  LoaderCircle,
  LocateFixed,
  Expand,
  ScanLine,
  Leaf,
  Mountain,
  WifiOff,
  X,
  Trophy,
  Check,
  Compass,
  CircleCheck,
  ArrowRight,
  PartyPopper,
  Plus,
  Printer,
  Move,
  Sprout,
  Bird,
  Gem,
  Route,
  Volume2,
  VolumeX,
  Moon,
  CircleHelp,
  Maximize2,
  Minimize2,
  Award,
  Navigation,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  KeyRound,
};
import jsQR from "jsqr";
import {
  validateConfig,
  newGroup,
  elapsed,
  formatTime,
  findStation,
  recordStation,
  solveStation,
  passwordMode,
  timingEnabled,
} from "./game.js";
import "./style.css";
import "./polish.css";
import "./adventure-settings.css";
import { renderMapData } from "./map-render.js";
import { fetchMapGeoJSON } from "./map-data.js";
import { createExperience } from "./experience.js";
import {
  recordTrack,
  trackDistance,
  trackSegments,
  visibleStations,
  distance,
} from "./tracking.js";

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name, cls = "") => `<i data-lucide="${name}" class="${cls}"></i>`;
const paintIcons = () => createIcons({ icons });
const app = $("#app");
let config,
  state,
  map,
  markers = [],
  locationMarker,
  accuracyCircle,
  watch,
  activeView = "map",
  offlineReady = false,
  installPrompt,
  stream,
  scanFrame,
  scannerSession = 0;
let saveErrorShown = false,
  trackingGroupId = null,
  trackingStatus = "GPS startet mit eurem Abenteuer",
  routeMap = null,
  followLocation = false,
  latestPosition = null,
  experience,
  dialogTrigger,
  liveTrail;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(
    () => $("#toast").classList.remove("visible"),
    4500,
  );
}
function save() {
  try {
    localStorage.setItem(`wald:${config.id}`, JSON.stringify(state));
  } catch {
    if (!saveErrorShown) {
      toast(
        "Speicher voll oder gesperrt. Fortschritt bleibt nur bis zum Schließen erhalten.",
      );
      saveErrorShown = true;
    }
  }
}
function group() {
  return state.groups.find((g) => g.id === state.active);
}
function foundCount() {
  return Object.keys(group().found).length;
}
function closeDialog() {
  routeMap?.remove();
  routeMap = null;
  scannerSession++;
  cancelAnimationFrame(scanFrame);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $("#dialog")?.close();
  $("#dialog")?.remove();
  if (dialogTrigger?.isConnected) dialogTrigger.focus({ preventScroll: true });
}
function dialog(html) {
  closeDialog();
  dialogTrigger = document.activeElement;
  const d = document.createElement("dialog");
  d.id = "dialog";
  d.innerHTML = `<button class="dialog-close icon-button" aria-label="Schließen">${icon("x")}</button>${html}`;
  document.body.append(d);
  d.querySelector(".dialog-close").onclick = closeDialog;
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDialog();
  });
  d.addEventListener("click", (e) => {
    if (e.target === d) closeDialog();
  });
  if (d.querySelector("h2")) {
    d.querySelector("h2").id = "dialog-title";
    d.setAttribute("aria-labelledby", "dialog-title");
  }
  d.showModal();
  paintIcons();
  return d;
}

const landscape = `<svg class="landscape" viewBox="0 0 590 260" aria-hidden="true"><defs><linearGradient id="hill" x2="0" y2="1"><stop stop-color="#d2dcc3"/><stop offset="1" stop-color="#a5bca1"/></linearGradient><g id="pine"><path d="M0 0-20 32h10l-21 31h14l-24 35h33v18H8V98h33L17 63h14L10 32h10Z"/></g></defs><circle cx="408" cy="52" r="36" fill="#efcc84"/><path d="m47 219 117-99 74 56L359 30l148 167 83-61v124H0Z" fill="#dae1cd"/><path d="m224 186 135-156 148 167-108-79-32 12-30-39-63 99z" fill="#c7d3bc"/><path d="m337 56 22-26 45 51-32-10-9 9Z" fill="#f8f7ee"/><path d="M0 226q85-93 177-43t153 9 260-53v121H0Z" fill="url(#hill)"/><path d="M0 249q123-67 243-18t347-39v68H0Z" fill="#8eaa8d"/><path d="M259 260q-52-29 38-37t43-26" fill="none" stroke="#e6dcc0" stroke-width="15"/><g fill="#66896c"><use href="#pine" transform="translate(134 116) scale(.75)"/><use href="#pine" transform="translate(475 109) scale(.9)"/><use href="#pine" transform="translate(521 135) scale(.75)"/><use href="#pine" transform="translate(212 163) scale(.48)"/></g><g fill="#355f4e"><use href="#pine" transform="translate(72 137) scale(1.12)"/><use href="#pine" transform="translate(439 147) scale(1.05)"/><use href="#pine" transform="translate(571 107) scale(1.35)"/></g><path d="m259 70 6-4 6 4m13-14 5-3 5 3" fill="none" stroke="#6c8671" stroke-width="2"/></svg>`;

function shell() {
  document.body.classList.add("app-game");
  app.innerHTML = `<header class="topbar"><a class="brand" href="#"> <span class="brand-icon">${icon("trees")}</span><span>Waldabenteuer<small>KLEINE ENTDECKER. GROSSE ABENTEUER.</small></span></a><nav aria-label="Hauptnavigation"><button class="nav-link active" data-view="map">${icon("map")}<span>Schatzkarte</span></button><button class="nav-link" data-view="stations">${icon("flag")}<span>Stationen</span></button><button class="nav-link" data-view="team">${icon("users")}<span>Unser Team</span></button></nav><button id="install" class="install-button">${icon("download")}<span>App installieren</span></button></header>
 <main><section class="hero"><div class="hero-copy"><div class="eyebrow"><span></span> ${esc(config.title.toUpperCase())}</div><h1>Das Abenteuer ruft.<br><em>Der Wald wartet auf euch.</em></h1><p>${esc(config.description)}</p><div class="hero-meta"><span>${icon("map-pin")}${esc(config.area)}, ${esc(config.region)}</span><span>${icon("flag")}${config.stations.length} geheime Stationen</span><span>${icon("sparkles")}Ein großer Schatz</span></div></div>${landscape}<div class="adventure-stamp">DRAUSSEN<br><strong>ist’s am<br>schönsten!</strong>${icon("sun")}</div></section>
 <section class="adventure-bar"><div class="team-summary"><span class="team-avatar">${icon("footprints")}</span><div><small>EUER ENTDECKERTEAM</small><button id="team-name">${esc(group().name)} ${icon("pencil")}</button></div></div><div class="timer-wrap">${icon(timingEnabled(config) ? "timer" : "leaf")}<div><small>${timingEnabled(config) ? "ABENTEUERZEIT" : "EUER ABENTEUER"}</small>${timingEnabled(config) ? `<strong id="timer">${formatTime(elapsed(group()))}</strong>` : `<strong class="no-pressure">Ohne Zeitdruck</strong>`}</div></div><div class="progress-wrap"><div><span>Euer Fortschritt</span><strong id="progress-label"></strong></div><div class="progress-track" role="progressbar" aria-label="Euer Fortschritt" aria-valuemin="0" aria-valuemax="${config.stations.length}" aria-valuenow="0"><span id="progress-fill"></span></div></div><button id="start" class="primary">${icon("play")}Abenteuer starten</button></section>
 <div class="journey-tools"><button id="gps-live" class="live-state">${icon("compass")}<span>GPS startet mit eurem Abenteuer</span></button><div><button id="wake-toggle" class="utility-button" aria-pressed="true">${icon("sun")}Bildschirm wach halten</button><button id="sound-toggle" class="utility-button icon-button" aria-label="Erfolgston einschalten" aria-pressed="false">${icon("volume-x")}</button><button id="how-to" class="utility-button" aria-label="So funktioniert die Schatzsuche">${icon("circle-help")}<span>So geht’s</span></button></div></div>
 <div id="main-content"><section class="map-layout"><div class="map-card"><div class="section-heading"><div><span class="eyebrow">IMMER DER NEUGIER NACH</span><h2><span class="map-heading-possessive">Eure </span>Schatzkarte</h2></div><div class="map-heading-actions"><span id="offline-badge" class="badge">${icon("loader-circle")}Wird vorbereitet</span><button id="expand-map" class="icon-button" aria-label="Karte groß anzeigen" aria-expanded="false">${icon("maximize-2")}</button></div></div><div class="map-container"><div id="map" aria-label="Offline-Schatzkarte von ${esc(config.area)}"></div><div class="map-label">${icon("trees")} PINIENWALD · ${esc(config.area.toUpperCase())}</div><button id="locate" class="location-button">${icon("locate-fixed")}Meinen Standort finden</button><button id="fit-map" class="fit-button icon-button" aria-label="Alle Stationen anzeigen">${icon("expand")}</button></div><div class="map-footer"><span><b class="legend-dot orange"></b>Station<span class="legend-dot blue"></span>Euer Standort<span class="legend-dot green"></span>Gefunden<span class="legend-trail"></span>Euer Weg</span><span>${icon("move")}Verschieben & zoomen</span><button id="expanded-scan" class="primary" hidden>${icon("scan-line")}Code scannen</button></div></div><aside><div class="next-card"><div class="eyebrow">EUER NÄCHSTES ZIEL</div><div class="station-illustration">${icon("trees")}<span>✦</span></div><span id="next-number" class="mini-label"></span><h2 id="next-name"></h2><p id="next-hint"></p><button id="focus-next" class="target-distance">${icon("navigation")}<span id="next-distance">Ziel auf der Karte zeigen</span>${icon("arrow-up-right")}</button><button id="scan" class="primary scan-button">${icon("scan-line")}QR-Code scannen</button><span class="scan-note">Code gefunden? Kamera drauf und los!</span></div><div class="tip-card"><span class="tip-icon">${icon("leaf")}</span><div><h3>Großes Abenteuer. Kleine Spuren.</h3><p>Bleibt auf den Wegen und lasst den Wald so schön, wie ihr ihn gefunden habt.</p></div></div></aside></section><section class="station-section"><div class="section-heading"><div><span class="eyebrow">SCHRITT FÜR SCHRITT ZUM SCHATZ</span><h2>Eure Entdeckungen <span id="discovery-count"></span></h2></div><span class="subtle">${config.stationVisibility === "next" ? "Eine Spur nach der anderen." : "Jede Station ein kleines Abenteuer."}</span></div><div id="station-list" class="station-grid"></div></section></div>
 <section id="alternate-view" hidden></section><div id="mobile-scan-dock" class="mobile-scan-dock" hidden><span><small>NÄCHSTE SPUR</small><strong id="dock-target"></strong></span><button id="dock-scan" class="primary">${icon("scan-line")}Scannen</button></div><footer><span>${icon("mountain")} Mit Neugier im Gepäck und Wald unter den Füßen.</span><button id="offline-info">${icon("wifi-off")}<span id="offline-text">Offline-Paket wird vorbereitet</span></button></footer><p class="demo-note">${config.demo ? "Beispiel-Abenteuer · Stationen vor dem Geburtstag vor Ort prüfen und in der Konfiguration anpassen." : ""}</p></main>`;
  paintIcons();
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("#team-name").onclick = teamDialog;
  $("#start").onclick = start;
  $("#scan").onclick = openScanner;
  $("#install").onclick = install;
  $("#offline-info").onclick = offlineInfo;
  $("#how-to").onclick = howTo;
  $("#gps-live").onclick = locate;
  $("#expand-map").onclick = () => toggleMap();
  $("#expanded-scan").onclick = openScanner;
  $("#dock-scan").onclick = openScanner;
  $("#focus-next").onclick = focusNext;
  experience.bind();
  initMap();
  update();
}
function update() {
  const g = group(),
    count = foundCount(),
    next = config.stations.find((s) => !g.found[s.id]);
  $("#team-name").innerHTML = `${esc(g.name)} ${icon("pencil")}`;
  $("#progress-label").textContent =
    `${count} / ${config.stations.length} gefunden`;
  $("#progress-fill").style.width =
    `${(count / config.stations.length) * 100}%`;
  $("#start").innerHTML = g.finished
    ? `${icon("trophy")}Schatz gefunden!`
    : g.started
      ? `${icon("scan-line")}QR-Code scannen`
      : `${icon("play")}Abenteuer starten`;
  $("#next-number").textContent = next
    ? `STATION ${config.stations.indexOf(next) + 1} VON ${config.stations.length}`
    : "ALLE STATIONEN GEFUNDEN";
  $("#next-name").textContent = next?.name || "Ihr seid Waldhelden!";
  $("#next-hint").textContent = next
    ? next.hint ||
      "Findet diesen Ort auf eurer Karte und haltet nach einem QR-Code Ausschau."
    : "Alle Geheimnisse gelüftet. Euer Schatz wartet bei der Spielleitung!";
  document.body.classList.toggle("game-started", !!g.started && !g.finished);
  document.body.classList.toggle("game-finished", !!g.finished);
  $(".progress-track").setAttribute("aria-valuenow", count);
  $("#scan").innerHTML = g.finished
    ? `${icon("award")}Eure Urkunde ansehen`
    : `${icon("scan-line")}QR-Code scannen`;
  $("#scan").onclick = g.finished ? experience.certificate : openScanner;
  const waiting = passwordMode(config) && next && g.scanned?.[next.id];
  if (waiting) {
    $("#next-number").textContent = "QR-CODE GEFUNDEN · AUFGABE OFFEN";
    $("#next-hint").textContent =
      "Löst eure Aufgabe, um die nächste Spur freizuschalten.";
    $("#scan").innerHTML = `${icon("pencil")}Aufgabe lösen`;
    $("#start").innerHTML = `${icon("pencil")}Aufgabe lösen`;
    $("#dock-scan").textContent = "Aufgabe";
  } else $("#dock-scan").innerHTML = `${icon("scan-line")}Scannen`;
  $("#focus-next").hidden = !next;
  $("#dock-target").textContent = next?.name || "Geschafft!";
  $("#mobile-scan-dock").hidden =
    !g.started || !!g.finished || activeView === "team";
  updateDistance();
  $("#discovery-count").textContent = `${count}/${config.stations.length}`;
  $("#station-list").innerHTML = config.stations
    .filter((s) => visibleStations(config, g).includes(s))
    .map((s) => {
      const i = config.stations.indexOf(s);
      return `<button class="station-tile ${g.found[s.id] ? "is-found" : ""}" data-station="${s.id}"><span class="tile-icon">${icon(g.found[s.id] ? "check" : s.icon || "flag")}</span><small>STATION ${String(i + 1).padStart(2, "0")}</small><h3>${esc(s.name)}</h3><span class="tile-status">${g.found[s.id] ? `${icon("check")}Gefunden${timingEnabled(config) ? " · " + formatTime(g.found[s.id].elapsed) : ""}` : `${icon("compass")}Noch zu entdecken`}</span></button>`;
    })
    .join("");
  document
    .querySelectorAll("[data-station]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          stationDetail(
            config.stations.find((s) => s.id === b.dataset.station),
          )),
    );
  markers.forEach((m, i) => {
    m.setIcon(stationIcon(i, !!g.found[config.stations[i].id]));
    const visible = visibleStations(config, g).includes(config.stations[i]);
    if (visible && !map.hasLayer(m)) m.addTo(map);
    if (!visible && map.hasLayer(m)) map.removeLayer(m);
  });
  paintIcons();
  if (activeView === "team") renderTeam();
  redrawTrail();
  syncTracking();
  experience?.sync();
}
function stationIcon(i, done) {
  return L.divIcon({
    className: "station-marker-wrap",
    html: `<span class="station-marker ${done ? "done" : ""} ${!done && config.stations.find((s) => !group().found[s.id]) === config.stations[i] ? "is-next" : ""}">${done ? "✓" : i + 1}</span>`,
    iconSize: [44, 50],
    iconAnchor: [22, 46],
  });
}
async function initMap() {
  map = L.map("map", {
    zoomControl: false,
    minZoom: 7,
    preferCanvas: true,
    maxZoom: 19,
    attributionControl: true,
  }).setView(config.map.center, 16);
  map.createPane("trailPane").style.zIndex = "450";
  liveTrail = L.layerGroup().addTo(map);
  redrawTrail();
  L.control.zoom({ position: "topright" }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  );
  map.setMaxBounds(L.latLngBounds(config.map.bounds).pad(0.1));
  try {
    const data = await fetchMapGeoJSON(config.map.file);
    renderMapData(map, data);
  } catch {
    toast("Die Kartendaten fehlen. Bitte online erneut laden.");
    $("#offline-badge").textContent = "Kartendaten fehlen";
  }
  markers = config.stations.map((s, i) =>
    L.marker(s.position, {
      icon: stationIcon(i, !!group().found[s.id]),
      title: s.name,
    }).on("click", () => stationDetail(s)),
  );
  markers.forEach((m, i) => {
    if (visibleStations(config, group()).includes(config.stations[i]))
      m.addTo(map);
  });
  // Decorative tree symbols are cartographic styling, not surveyed tree locations.
  const trees = [
    [28.4226, -16.383],
    [28.4194, -16.381],
    [28.4247, -16.376],
    [28.4206, -16.374],
    [28.4237, -16.378],
    [28.422, -16.377],
    [28.421, -16.382],
    [28.425, -16.381],
  ];
  trees.forEach((p) =>
    L.marker(p, {
      interactive: false,
      icon: L.divIcon({ className: "map-tree", html: "♠", iconSize: [24, 28] }),
    }).addTo(map),
  );
  fitMap();
  $("#fit-map").onclick = fitMap;
  $("#locate").onclick = locate;
}
function fitMap() {
  map.fitBounds(
    visibleStations(config, group()).map((s) => s.position),
    { padding: [65, 65], maxZoom: 16 },
  );
}
function setTrackingStatus(message) {
  trackingStatus = message;
  if ($("#tracking-status")) $("#tracking-status").textContent = message;
  if ($("#gps-live span")) $("#gps-live span").textContent = message;
  $("#gps-live")?.classList.toggle(
    "has-fix",
    message.includes("±") && !message.includes("ungenau"),
  );
}
function syncTracking() {
  const g = group();
  if (g.started && !g.finished) {
    if (trackingGroupId !== g.id) beginTracking(false);
  } else if (trackingGroupId) {
    if (watch !== undefined) navigator.geolocation?.clearWatch(watch);
    watch = undefined;
    trackingGroupId = null;
    setTrackingStatus(
      g.finished ? "Aufzeichnung beendet" : "GPS startet mit eurem Abenteuer",
    );
  }
}
function locate() {
  beginTracking(true);
}
function beginTracking(follow = false) {
  if (!navigator.geolocation) {
    setTrackingStatus("Dieses Gerät unterstützt keine Standortbestimmung.");
    return toast(trackingStatus);
  }
  if (watch !== undefined) navigator.geolocation.clearWatch(watch);
  trackingGroupId = group().started && !group().finished ? group().id : null;
  followLocation = follow;
  $("#locate").innerHTML = `${icon("loader-circle")}GPS wird gesucht …`;
  paintIcons();
  setTrackingStatus("GPS-Signal wird gesucht …");
  let outsideNotified = false;
  watch = navigator.geolocation.watchPosition(
    (p) => {
      const point = [p.coords.latitude, p.coords.longitude];
      latestPosition = p;
      updateDistance();
      const g = group();
      if (g.id === trackingGroupId && recordTrack(g, p)) {
        save();
        redrawTrail();
      }
      setTrackingStatus(
        g.started && !g.finished
          ? `Route wird aufgezeichnet · GPS ±${Math.round(p.coords.accuracy)} m${p.coords.accuracy > 80 ? " · Warte auf genauere Position" : ""}`
          : `GPS ±${Math.round(p.coords.accuracy)} m`,
      );
      if ($("#route-distance"))
        $("#route-distance").textContent =
          (trackDistance(g.track) / 1000).toFixed(2) + " km";
      if (!L.latLngBounds(config.map.bounds).contains(point)) {
        if (locationMarker) {
          map.removeLayer(locationMarker);
          locationMarker = null;
        }
        if (accuracyCircle) {
          map.removeLayer(accuracyCircle);
          accuracyCircle = null;
        }
        if (!outsideNotified) {
          toast(
            "Außerhalb der Offline-Karte. Eure GPS-Route wird trotzdem gespeichert.",
          );
          outsideNotified = true;
        }
        $("#locate").innerHTML = `${icon("map-pin")}Außerhalb des Gebiets`;
        paintIcons();
        return;
      }
      if (locationMarker) {
        locationMarker.setLatLng(point);
        accuracyCircle.setLatLng(point).setRadius(p.coords.accuracy);
      } else {
        accuracyCircle = L.circle(point, {
          radius: p.coords.accuracy,
          color: "#438bc4",
          weight: 1,
          fillOpacity: 0.12,
        }).addTo(map);
        locationMarker = L.marker(point, {
          icon: L.divIcon({
            className: "gps-marker",
            html: "<span></span>",
            iconSize: [22, 22],
          }),
        }).addTo(map);
      }
      if (followLocation) {
        map.panTo(point);
        ((followLocation = false),
          (latestPosition = null),
          experience,
          dialogTrigger);
      }
      $("#locate").innerHTML =
        `${icon("locate-fixed")}Standort · ±${Math.round(p.coords.accuracy)} m`;
      paintIcons();
    },
    (e) => {
      latestPosition = null;
      updateDistance();
      if (locationMarker) {
        map.removeLayer(locationMarker);
        locationMarker = null;
      }
      if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }
      const message =
        e.code === 1
          ? "Standortzugriff fehlt. Bitte im Browser erlauben, damit eure Route aufgezeichnet wird."
          : "GPS-Signal fehlt. Die Route wird fortgesetzt, sobald ein Signal verfügbar ist.";
      setTrackingStatus(message);
      toast(message);
      $("#locate").innerHTML = `${icon("locate-fixed")}Standort erneut suchen`;
      paintIcons();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 },
  );
}
async function showRoute() {
  const g = group(),
    track = g.track || [];
  if (!track.length)
    return toast(
      "Noch keine Route gespeichert. Erlaubt beim Start den Standortzugriff.",
    );
  dialog(
    `<span class="eyebrow">EUER WEG DURCH DEN WALD</span><h2>${esc(g.name)} unterwegs</h2><p>${(trackDistance(track) / 1000).toFixed(2)} km aufgezeichnet · ${track.length} GPS-Punkte</p><div id="route-map" aria-label="Eure aufgezeichnete Route"></div><p class="small-note">Längere GPS-Pausen werden als Lücken dargestellt. Die Strecke ist eine GPS-Schätzung.</p><button id="download-route" class="secondary">${icon("download")}Route als GPX herunterladen</button>`,
  );
  const instance = L.map("route-map", {
    maxZoom: 19,
    preferCanvas: true,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  });
  routeMap = instance;
  instance.createPane("trailPane").style.zIndex = "450";
  instance.attributionControl.setPrefix(false);
  instance.attributionControl.addAttribution(
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  );
  trackSegments(track).forEach((segment) =>
    L.polyline(
      segment.map((p) => [p.lat, p.lng]),
      { pane: "trailPane", color: "#d9784e", weight: 4 },
    ).addTo(instance),
  );
  L.circleMarker([track[0].lat, track[0].lng], {
    pane: "trailPane",
    radius: 7,
    color: "#fff",
    fillColor: "#438bc4",
    fillOpacity: 1,
  })
    .bindTooltip("Start")
    .addTo(instance);
  const last = track.at(-1);
  L.circleMarker([last.lat, last.lng], {
    pane: "trailPane",
    radius: 7,
    color: "#fff",
    fillColor: "#214e40",
    fillOpacity: 1,
  })
    .bindTooltip("Letzter Punkt")
    .addTo(instance);
  visibleStations(config, g).forEach((st) =>
    L.circleMarker(st.position, {
      radius: 5,
      color: g.found[st.id] ? "#618757" : "#d9784e",
      fillOpacity: 1,
    }).addTo(instance),
  );
  instance.fitBounds(
    track.map((p) => [p.lat, p.lng]),
    { padding: [25, 25], maxZoom: 17 },
  );
  $("#download-route").onclick = () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Waldabenteuer" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>' +
      esc(g.name) +
      "</name>" +
      trackSegments(track)
        .map(
          (segment) =>
            "<trkseg>" +
            segment
              .map(
                (p) =>
                  `<trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.at).toISOString()}</time></trkpt>`,
              )
              .join("") +
            "</trkseg>",
        )
        .join("") +
      "</trk></gpx>";
    download("waldabenteuer-route.gpx", xml, "application/gpx+xml");
  };
  try {
    const geo = await fetchMapGeoJSON(config.map.file);
    if (routeMap !== instance) return;
    renderMapData(instance, geo);
  } catch {}
}

function start() {
  if (group().finished) return showView("team");
  if (group().started) return openScanner();
  dialog(
    `<div class="modal-symbol">${icon("footprints")}</div><span class="eyebrow">ALLE BEREIT?</span><h2>Euer Abenteuer beginnt!</h2><p>Ein Team, ein Wald voller Geheimnisse. Wie wollt ihr heißen?</p><div class="start-checks"><span>${icon("map")}${offlineReady ? "Offline-Karte im Gepäck" : "Karte auf diesem Gerät"}</span><span>${icon("scan-line")}Codes im Wald entdecken</span><span>${icon("route")}Euren Weg festhalten</span></div><form id="start-form"><label for="group-input">Teamname</label><input id="group-input" maxlength="40" value="${esc(group().name)}" required><button class="primary" type="submit">${icon("play")}Jetzt loslaufen</button></form><p class="small-note">${timingEnabled(config) ? "Mit dem Start läuft eure Zeit." : "Entdeckt alles in eurem eigenen Tempo – ohne Stoppuhr."} Erlaubt den Standort, damit ihr euch und euren gelaufenen Weg auf der Karte seht.</p>`,
  );
  $("#start-form").onsubmit = (e) => {
    e.preventDefault();
    group().name = $("#group-input").value.trim() || "Die Waldentdecker";
    group().started = Date.now();
    save();
    closeDialog();
    update();
    focusNext(false);
    toast("Los geht’s! Euer Abenteuer läuft.");
  };
}
function teamDialog() {
  dialog(
    `<div class="modal-symbol">${icon("users")}</div><h2>Euer Entdeckerteam</h2><form id="team-form"><label for="group-input">Teamname</label><input id="group-input" maxlength="40" value="${esc(group().name)}" required><button class="primary">Teamname speichern</button></form><button id="manage-team" class="secondary">Alle Gruppen & Zeiten ansehen</button>`,
  );
  $("#team-form").onsubmit = (e) => {
    e.preventDefault();
    group().name = $("#group-input").value.trim() || "Die Waldentdecker";
    save();
    closeDialog();
    update();
  };
  $("#manage-team").onclick = () => {
    closeDialog();
    showView("team");
  };
}
function stationDetail(s) {
  const found = group().found[s.id];
  if (passwordMode(config) && group().scanned?.[s.id] && !found)
    return showChallenge(s);
  dialog(
    `<span class="modal-symbol">${icon(found ? "check" : s.icon || "flag")}</span><span class="eyebrow">STATION ${config.stations.indexOf(s) + 1}</span><h2>${esc(found ? s.title : s.name)}</h2><p>${esc(found ? s.message : s.hint)}</p>${found ? `<div class="success-time">${icon(timingEnabled(config) ? "timer" : "check")} ${timingEnabled(config) ? "Gefunden nach " + formatTime(found.elapsed) : "Gemeinsam entdeckt!"}</div>` : `<button id="detail-scan" class="primary">${icon("scan-line")}QR-Code scannen</button>`}`,
  );
  if (!found) $("#detail-scan").onclick = openScanner;
}
function acceptCode(value) {
  const s = findStation(config, value);
  if (!s) {
    $("#scan-error").textContent =
      "Dieser Code gehört nicht zu eurer Schatzsuche. Versucht es noch einmal.";
    return false;
  }
  const result = recordStation(config, group(), s);
  if (result === "not-started") {
    closeDialog();
    start();
    return true;
  }
  if (result === "challenge") {
    save();
    closeDialog();
    update();
    showChallenge(s);
    return true;
  }
  if (result === "locked") {
    $("#scan-error").textContent =
      "Diese Station ist noch gesperrt. Löst zuerst die aktuelle Aufgabe.";
    return false;
  }
  if (result === "duplicate") {
    $("#scan-error").textContent =
      "Diese Station habt ihr schon gefunden. Auf zur nächsten!";
    return false;
  }
  if (result !== "success") return false;
  finishFound(s);
  return true;
}
function finishFound(s) {
  save();
  closeDialog();
  update();
  dialog(
    `<div class="celebration">✦ <span>${icon("party-popper")}</span> ✦</div><span class="eyebrow">${group().finished ? "ALLE GEHEIMNISSE GELÜFTET" : "STATION GEFUNDEN"}</span><h2>${esc(s.title)}</h2><p>${esc(s.message)}</p><div class="success-time">${icon(timingEnabled(config) ? "timer" : "check")}${timingEnabled(config) ? formatTime(group().found[s.id].elapsed) + " · " : ""}${foundCount()} von ${config.stations.length} Stationen</div><button id="continue" class="primary">${group().finished ? "Unsere Entdeckungen ansehen" : "Weiter ins Abenteuer"}${icon("arrow-right")}</button>`,
  );
  $("#continue").onclick = () => {
    closeDialog();
    if (group().finished) showView("team");
    else if (config.stationVisibility === "next" || passwordMode(config))
      focusNext();
  };
  experience.celebrate();
  navigator.vibrate?.([100, 50, 100]);
  return true;
}
async function openScanner() {
  const pending = config.stations.find(
    (s) => !group().found[s.id] && group().scanned?.[s.id],
  );
  if (passwordMode(config) && pending) return showChallenge(pending);
  if (!group().started) return start();
  if (group().finished) return showView("team");
  dialog(
    `<span class="eyebrow">DIE NÄCHSTE SPUR WARTET</span><h2>QR-Code scannen</h2><p>Haltet den gedruckten Code in den Rahmen.</p><div class="camera-box"><video id="camera" autoplay playsinline muted></video><div class="scan-frame"></div><span id="camera-status">Kamera wird gestartet …</span></div><p id="scan-error" role="alert"></p><details><summary>Code ohne Kamera eingeben</summary><form id="code-form"><label for="manual-code">Code auf der Stationskarte</label><input id="manual-code" autocomplete="off" placeholder="z. B. PINIE-7K3" required><button class="primary">Code prüfen</button></form></details>`,
  );
  $("#code-form").onsubmit = (e) => {
    e.preventDefault();
    acceptCode($("#manual-code").value);
  };
  const session = scannerSession;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
    const media = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false,
    });
    if (session !== scannerSession) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = media;
    const video = $("#camera");
    video.srcObject = media;
    await video.play();
    if (session !== scannerSession) return;
    $("#camera-status").hidden = true;
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    let last = 0;
    function scan(t) {
      if (session !== scannerSession) return;
      if (video.readyState >= 2 && t - last > 250) {
        last = t;
        canvas.width = 640;
        canvas.height = Math.round(
          (video.videoHeight / video.videoWidth) * 640,
        );
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height, {
          inversionAttempts: "attemptBoth",
        });
        if (code && acceptCode(code.data)) return;
      }
      scanFrame = requestAnimationFrame(scan);
    }
    scanFrame = requestAnimationFrame(scan);
  } catch {
    if (session === scannerSession) {
      $("#camera-status").textContent = "Kein Kamerazugriff";
      $("#scan-error").textContent =
        "Erlaube die Kamera im Browser oder gib den aufgedruckten Code ein.";
      $("details").open = true;
    }
  }
}
function showView(view) {
  if (view !== "map" && document.body.classList.contains("map-expanded"))
    toggleMap(false);
  activeView = view;
  $("#mobile-scan-dock").hidden =
    !group().started || !!group().finished || view === "team";
  document
    .querySelectorAll("[data-view]")
    .forEach(
      (b) => (
        b.classList.toggle("active", b.dataset.view === view),
        b.setAttribute(
          "aria-current",
          b.dataset.view === view ? "page" : "false",
        )
      ),
    );
  $("#main-content").hidden = view === "team";
  $("#alternate-view").hidden = view !== "team";
  $(".map-layout").hidden = view === "stations";
  if (view === "team") renderTeam();
  else {
    if (view === "map") setTimeout(() => map?.invalidateSize(), 30);
    if (view === "stations")
      $(".station-section").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }
}
function renderTeam() {
  const g = group();
  $("#alternate-view").innerHTML =
    `<section class="team-page"><div class="section-heading"><div><span class="eyebrow">ZUSAMMEN IST’S AM SCHÖNSTEN</span><h2>Unser Team & ${timingEnabled(config) ? "unsere Zeiten" : "unsere Entdeckungen"}</h2></div><button id="new-group" class="secondary">${icon("plus")}Neue Gruppe</button></div><p>Jede Gruppe hat ihren eigenen Fortschritt auf diesem Tablet. Andere Geräte speichern ihren Fortschritt separat.</p><div class="group-tabs">${state.groups.map((t) => `<button class="secondary ${t.id === g.id ? "selected" : ""}" data-group="${t.id}">${icon("users")}${esc(t.name)}</button>`).join("")}</div><div class="team-result ${g.finished ? "team-complete" : ""}"><div><span class="eyebrow">${esc(g.name)}</span><h2>${g.finished ? "Abenteuer geschafft!" : g.started ? "Mitten im Abenteuer" : "Bereit für den Wald"}</h2></div>${timingEnabled(config) ? `<strong class="team-clock">${formatTime(elapsed(g))}</strong>` : `<span class="team-pace">${icon("leaf")}In eurem Tempo</span>`}</div>${g.finished ? `<div class="certificate-callout"><span class="award-icon">${icon("award")}</span><div><strong>Ein Team voller Waldhelden.</strong><p>Alle Spuren gefunden. Diesen Tag nehmt ihr mit nach Hause.</p></div><button id="team-certificate" class="primary">${icon("download")}Eure Urkunde</button></div>` : ""}<div class="achievement-row">${[
      { icon: "footprints", name: "Erste Spur", done: foundCount() >= 1 },
      {
        icon: "compass",
        name: "Auf Schatzkurs",
        done: foundCount() >= Math.ceil(config.stations.length / 2),
      },
      { icon: "gem", name: "Waldhelden", done: !!g.finished },
    ]
      .map(
        (b) =>
          `<span class="achievement ${b.done ? "earned" : ""}" aria-label="${b.name}: ${b.done ? "geschafft" : "noch offen"}">${icon(b.icon)}${b.name}${b.done ? icon("check") : ""}</span>`,
      )
      .join(
        "",
      )}</div><div class="route-summary"><span>${icon("route")}<strong id="route-distance">${(trackDistance(g.track) / 1000).toFixed(2)} km</strong> aufgezeichnet</span><button id="show-route" class="secondary">${icon("map")}Unsere Route ansehen</button></div><p id="tracking-status" role="status">${esc(g.finished ? "Aufzeichnung beendet" : trackingStatus)}</p><p class="small-note">Für die Aufzeichnung die App im Vordergrund geöffnet lassen. GPS-Pausen und ungenaue Messungen können Lücken hinterlassen. Eure Route bleibt auf diesem Tablet.</p><div class="timeline">${visibleStations(
      config,
      g,
    )
      .map(
        (s, i) =>
          `<div><span class="timeline-num ${g.found[s.id] ? "complete" : ""}">${g.found[s.id] ? "✓" : i + 1}</span><strong>${esc(s.name)}</strong><span>${g.found[s.id] ? (timingEnabled(config) ? formatTime(g.found[s.id].elapsed) : "Entdeckt") : g.scanned?.[s.id] ? "Aufgabe offen" : "Noch zu entdecken"}</span></div>`,
      )
      .join(
        "",
      )}</div><button id="export-results" class="secondary">${icon("download")}Ergebnisse herunterladen</button></section>`;
  paintIcons();
  document.querySelectorAll("[data-group]").forEach(
    (b) =>
      (b.onclick = () => {
        state.active = b.dataset.group;
        save();
        update();
        renderTeam();
      }),
  );
  $("#show-route").onclick = showRoute;
  if ($("#team-certificate"))
    $("#team-certificate").onclick = experience.certificate;
  $("#new-group").onclick = () => {
    dialog(
      `<h2>Ein neues Entdeckerteam</h2><p>Alle bisherigen Gruppen und Zeiten bleiben gespeichert.</p><form id="new-group-form"><label for="new-name">Teamname</label><input id="new-name" maxlength="40" required placeholder="Die wilden Pinienzapfen"><button class="primary">Gruppe anlegen</button></form>`,
    );
    $("#new-group-form").onsubmit = (e) => {
      e.preventDefault();
      const g = newGroup($("#new-name").value);
      state.groups.push(g);
      state.active = g.id;
      save();
      closeDialog();
      update();
    };
  };
  $("#export-results").onclick = () =>
    download(
      "waldabenteuer-ergebnisse.json",
      JSON.stringify(
        {
          hunt: config.id,
          exported: new Date().toISOString(),
          groups: state.groups,
        },
        null,
        2,
      ),
      "application/json",
    );
}
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function install() {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
  } else
    dialog(
      `<div class="modal-symbol">${icon("download")}</div><h2>Euer Abenteuer zum Mitnehmen</h2><p><strong>iPad / iPhone:</strong> In Safari „Teilen“ öffnen und „Zum Home-Bildschirm“ auswählen.</p><p><strong>Android / Computer:</strong> Im Browser-Menü „App installieren“ oder „Zum Startbildschirm hinzufügen“ auswählen.</p><p>Wartet, bis „Offline bereit“ angezeigt wird. Öffnet die App anschließend zur Probe im Flugmodus.</p><button id="check-offline" class="primary">Offline-Status ansehen</button>`,
    );
  if ($("#check-offline")) $("#check-offline").onclick = offlineInfo;
}
function offlineInfo() {
  dialog(
    `<div class="modal-symbol">${icon(offlineReady ? "circle-check" : "download")}</div><h2>${offlineReady ? "Bereit für den Wald!" : "Offline-Paket vorbereiten"}</h2><p>${offlineReady ? "App, Karte und Stationen sind auf diesem Gerät gespeichert. QR-Scanner und Timer brauchen kein Internet." : "Lass die App mit Internet geöffnet. Karte und App werden vollständig gespeichert. Im Entwicklungsmodus ist die Offline-Funktion nicht aktiv."}</p><p>Der Standort benötigt ein Gerät mit GPS und deine Freigabe. Prüft vor dem Ausflug im Flugmodus, ob Karte und Kamera funktionieren.</p><button id="retry-offline" class="secondary">Speicherung erneut prüfen</button>`,
  );
  $("#retry-offline").onclick = async () => {
    closeDialog();
    await setupOffline();
    offlineInfo();
  };
}
async function setupOffline() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
    const registration = await navigator.serviceWorker.ready;
    const prefix =
      "waldabenteuer-" + new URL(registration.scope).pathname + "-";
    const keys = await caches.keys();
    const cache = await caches.open(
      keys.find((k) => k.startsWith(prefix)) || prefix + "pending",
    );
    const required = [
      "./index.html",
      "./hunt.json",
      `./${config.map.file}`,
      "./manifest.webmanifest",
    ];
    offlineReady = (
      await Promise.all(
        required.map((p) => cache.match(new URL(p, location.href))),
      )
    ).every(Boolean);
    if (offlineReady) {
      if ($("#offline-badge"))
        $("#offline-badge").innerHTML = `${icon("circle-check")}Offline bereit`;
      if ($("#offline-text"))
        $("#offline-text").textContent = "Für offline gespeichert";
      paintIcons();
      navigator.storage?.persist?.().catch(() => {});
    }
  } catch {
    toast(
      "Offline-Speicherung noch nicht vollständig. Bitte mit Internet erneut laden.",
    );
  }
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener("offline", () =>
  toast(
    offlineReady
      ? "Ihr seid offline. Euer Abenteuer geht weiter!"
      : "Keine Verbindung. Offline-Paket bitte später vollständig laden.",
  ),
);
setInterval(() => {
  if ($("#timer")) $("#timer").textContent = formatTime(elapsed(group()));
  if ($(".team-clock"))
    $(".team-clock").textContent = formatTime(elapsed(group()));
}, 1000);

function redrawTrail() {
  if (!liveTrail) return;
  liveTrail.clearLayers();
  trackSegments(group().track || []).forEach((segment) => {
    if (segment.length > 1)
      L.polyline(
        segment.map((p) => [p.lat, p.lng]),
        {
          pane: "trailPane",
          className: "live-trail",
          color: "#376e69",
          weight: 4,
          opacity: 0.9,
          interactive: false,
        },
      ).addTo(liveTrail);
  });
  const first = group().track?.[0];
  if (first)
    L.circleMarker([first.lat, first.lng], {
      pane: "trailPane",
      radius: 5,
      color: "#fff",
      weight: 2,
      fillColor: "#376e69",
      fillOpacity: 1,
      interactive: false,
    }).addTo(liveTrail);
  const el = document.querySelector("#map");
  if (el) el.dataset.trackPoints = String(group().track?.length || 0);
}
function showChallenge(station) {
  if (!passwordMode(config) || group().found[station.id]) return;
  const challenge = station.challenge;
  dialog(
    `<div class="modal-symbol">${icon("pencil")}</div><span class="eyebrow">QR GEFUNDEN · JETZT SEID IHR DRAN</span><h2>${esc(station.name)}: Euer Rätsel</h2><p class="challenge-prompt">${esc(challenge.prompt)}</p>${challenge.hint ? `<details class="answer-hint"><summary>Wir brauchen einen Tipp</summary><p>${esc(challenge.hint)}</p></details>` : ""}<form id="answer-form"><label for="answer-input">Euer Lösungswort / Passwort</label><input id="answer-input" required maxlength="150" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Eure Antwort"><p id="answer-error" role="alert"></p><button class="primary">${icon("key-round")}Lösung prüfen &amp; weiter</button></form><p class="small-note">Groß- und Kleinschreibung ist egal. Die nächste Station bleibt bis zur richtigen Lösung verborgen.</p>`,
  );
  $("#answer-form").onsubmit = (event) => {
    event.preventDefault();
    const result = solveStation(
      config,
      group(),
      station,
      $("#answer-input").value,
    );
    if (result === "success") finishFound(station);
    else
      $("#answer-error").textContent =
        "Das ist noch nicht das richtige Wort. Überlegt gemeinsam und versucht es nochmal.";
  };
}
function updateDistance() {
  const el = $("#next-distance");
  if (!el || !config || !state) return;
  const next = config.stations.find((s) => !group().found[s.id]);
  if (!next) return;
  if (!latestPosition || Date.now() - latestPosition.timestamp > 30000) {
    el.textContent = "Ziel auf der Karte zeigen";
    return;
  }
  const c = latestPosition.coords;
  if (c.accuracy > 50) {
    el.textContent = "GPS noch ungenau · Ziel anzeigen";
    return;
  }
  const metres = distance(
    { lat: c.latitude, lng: c.longitude },
    { lat: next.position[0], lng: next.position[1] },
  );
  el.textContent =
    metres < 30
      ? "Ganz in eurer Nähe · Luftlinie"
      : `Noch ca. ${metres >= 1000 ? (metres / 1000).toFixed(1) + " km" : Math.round(metres / 10) * 10 + " m"} Luftlinie`;
}
function focusNext(scroll = true) {
  const next = config.stations.find((s) => !group().found[s.id]);
  if (!next || !map) return;
  showView("map");
  map.invalidateSize();
  map.setView(next.position, Math.max(16, map.getZoom()), {
    animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  if (scroll && window.innerWidth < 700)
    $(".map-card").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
}
function toggleMap(force) {
  const card = $(".map-card");
  if (!card) return;
  const expanded =
    typeof force === "boolean"
      ? force
      : !card.classList.contains("is-expanded");
  card.classList.toggle("is-expanded", expanded);
  document.body.classList.toggle("map-expanded", expanded);
  document
    .querySelectorAll(
      "header.topbar, main>.hero, main>.adventure-bar, .journey-tools, .map-layout>aside, .station-section, #alternate-view, main>footer, #mobile-scan-dock, .demo-note",
    )
    .forEach((el) => (el.inert = expanded));
  $("#expand-map").innerHTML = icon(expanded ? "minimize-2" : "maximize-2");
  $("#expand-map").setAttribute("aria-expanded", String(expanded));
  $("#expand-map").setAttribute(
    "aria-label",
    expanded ? "Große Karte schließen" : "Karte groß anzeigen",
  );
  $("#expanded-scan").hidden = !expanded;
  paintIcons();
  requestAnimationFrame(() => map?.invalidateSize());
}
function howTo() {
  dialog(
    `<div class="modal-symbol">${icon("compass")}</div><span class="eyebrow">KLEINE ENTDECKER, GROSSE MISSION</span><h2>So findet ihr den Schatz.</h2><div class="howto-steps"><div><b>1</b><span><strong>Team schnappen & loslaufen</strong>Gebt euch einen Namen und startet euer Abenteuer. ${timingEnabled(config) ? "Ab jetzt läuft die Zeit!" : "Ganz entspannt in eurem eigenen Tempo."}</span></div><div><b>2</b><span><strong>Der Karte folgen</strong>Die orangefarbenen Punkte sind eure Ziele. Mit GPS seht ihr, wo ihr gerade seid.</span></div><div><b>3</b><span><strong>Code finden, Geheimnis lüften</strong>Scannen öffnet eure Kamera. ${passwordMode(config) ? "Hinter jedem Code wartet ein Rätsel. Das richtige Lösungswort öffnet die nächste Spur." : "Hinter jedem Code wartet eine Nachricht oder eine kleine Aufgabe."}</span></div></div><div class="howto-finale">${icon("award")}Alle Stationen entdeckt? Dann wartet eure Entdecker-Urkunde!</div><p class="small-note">Bleibt zusammen und auf den Wegen. Für die Offline-Nutzung vorher auf „Offline bereit“ warten.</p>`,
  );
}
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !$("dialog[open]") &&
    document.body.classList.contains("map-expanded")
  )
    toggleMap(false);
});
async function admin() {
  const { mountAdmin } = await import("./admin.js");
  await mountAdmin({
    config,
    icon,
    paintIcons,
    esc,
    toast,
    download,
    setupOffline,
  });
}
async function boot() {
  try {
    const r = await fetch("./hunt.json");
    if (!r.ok) throw new Error("Konfiguration konnte nicht geladen werden.");
    config = validateConfig(await r.json());
    try {
      state = JSON.parse(localStorage.getItem(`wald:${config.id}`));
    } catch {}
    if (
      !state?.groups?.length ||
      !state.groups.some((g) => g.id === state.active) ||
      !state.groups.every((g) => g.found && typeof g.name === "string")
    ) {
      const g = newGroup("Die Waldentdecker");
      state = { active: g.id, groups: [g] };
    }
    if (location.hash === "#/spielleitung") {
      document.body.classList.add("app-admin");
      await admin();
      return;
    }
    experience = createExperience({
      getGroup: group,
      config,
      icon,
      paintIcons,
      dialog,
      download,
      toast,
    });
    shell();
    setupOffline();
    syncTracking();
  } catch (e) {
    app.innerHTML = `<main class="error-page"><h1>Ein kleiner Umweg …</h1><p>${esc(e.message)}</p><button class="primary" onclick="location.reload()">Erneut versuchen</button></main>`;
  }
}
window.addEventListener("hashchange", () => location.reload());
boot();
