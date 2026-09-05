import { resolveMap } from "./regions.js";
import { mountAdminSettings, loadAdminMap } from "./admin-settings.js";
import { renderMapData } from "./map-render.js";
import "./admin-polish.css";
import L from "leaflet";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { findStation, qrValue } from "./game.js";
import {
  createDraft,
  validateDraft,
  exportConfig,
  isPoint,
  applySurvey,
  placedStations,
  assignOrder,
  addCards,
  moveStation,
  returnToPool,
} from "./admin-model.js";

export async function mountAdmin({
  config,
  icon,
  paintIcons,
  esc,
  toast,
  download,
  setupOffline,
}) {
  const $ = (s) => document.querySelector(s),
    key = "waldabenteuer:admin:v1";
  let db = { drafts: [], active: null },
    map,
    layer,
    watch,
    gpsMarker,
    accuracyCircle,
    dialogEl,
    stream,
    frame,
    session = 0,
    saveOk = true,
    fieldMode = false,
    dirty = false,
    recovery = null,
    originalSaved = null,
    activeMeasurement = null,
    backgroundMap;
  try {
    originalSaved = localStorage.getItem(key);
    const saved = JSON.parse(originalSaved);
    if (saved) {
      if (!Array.isArray(saved.drafts)) throw Error();
      recovery = localStorage.getItem(`${key}:recovery`);
      const valid = saved.drafts.filter((d) => {
        try {
          validateDraft(d);
          return true;
        } catch {
          return false;
        }
      });
      if (valid.length !== saved.drafts.length) {
        // Keep the original bytes recoverable even after the next automatic save.
        recovery = JSON.stringify(saved);
        try {
          localStorage.setItem(`${key}:recovery`, recovery);
        } catch {
          /* Download remains available for this session. */
        }
        toast(
          "Ein Entwurf ist beschädigt. Die Originaldaten bleiben als Rettungssicherung verfügbar.",
        );
      }
      db = { ...saved, drafts: valid };
    }
  } catch {
    recovery = originalSaved;
    if (recovery) {
      try {
        localStorage.setItem(`${key}:recovery`, recovery);
      } catch {
        /* Keep raw data in memory for download. */
      }
    }
    toast(
      "Gespeicherte Entwürfe konnten nicht gelesen werden. Importiere bei Bedarf deine Sicherung.",
    );
  }
  const draft = () => db.drafts.find((d) => d.id === db.active);
  if (!draft() && db.drafts.length) db.active = db.drafts[0].id;
  function save() {
    if (draft()) draft().updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(key, JSON.stringify(db));
      saveOk = true;
    } catch {
      saveOk = false;
      toast(
        "Lokaler Speicher nicht verfügbar. Bitte den Entwurf sofort als Sicherung herunterladen.",
      );
    }
    if ($("#save-status"))
      $("#save-status").textContent = saveOk
        ? "Auf diesem Tablet gespeichert"
        : "Nicht gespeichert – Sicherung herunterladen";
  }
  function close(force = false) {
    if (
      dirty &&
      force !== true &&
      !window.confirm("Ungespeicherte Änderungen verwerfen?")
    )
      return false;
    dirty = false;
    ((activeMeasurement = null), backgroundMap);
    session++;
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    dialogEl?.close();
    dialogEl?.remove();
    dialogEl = null;
    return true;
  }
  function modal(html) {
    if (!close()) return;
    dialogEl = document.createElement("dialog");
    dialogEl.className = "admin-dialog";
    dialogEl.innerHTML = `<button class="dialog-close icon-button" aria-label="Schließen">${icon("x")}</button>${html}`;
    document.body.append(dialogEl);
    dialogEl.querySelector(".dialog-close").onclick = close;
    dialogEl.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    dialogEl.addEventListener("click", (e) => {
      if (e.target === dialogEl) close();
    });
    dialogEl.showModal();
    paintIcons();
  }
  function teardownMap() {
    if (watch !== undefined) navigator.geolocation?.clearWatch(watch);
    watch = undefined;
    backgroundMap?.remove();
    backgroundMap = null;
    map?.stop();
    map?.remove();
    map = null;
    gpsMarker = null;
    accuracyCircle = null;
  }
  function render(preserve = false) {
    const scrollY = window.scrollY;
    const oldMap = preserve && map ? $("#survey-map") : null;
    const gpsText = $("#gps-status")?.textContent;
    if (oldMap) oldMap.remove();
    else teardownMap();
    const d = draft(),
      count = d?.stations.filter((s) => isPoint(s.position)).length || 0;
    $("#app").innerHTML =
      `<header class="topbar admin-topbar"><a class="brand" href="#"><span class="brand-icon">${icon("trees")}</span><span>Waldabenteuer<small>DIE ABENTEUER-WERKSTATT</small></span></a><a class="secondary" href="#">${icon("map")}Zum Spiel</a></header><main class="admin editor ${fieldMode ? "field-mode" : ""}"><div class="editor-title"><div><span class="eyebrow">FÜR DIE SPIELLEITUNG</span><h1>Hier beginnt euer Abenteuer.</h1><p>Codes drucken. Draußen verstecken. Euren Wald zur Schatzkarte machen.</p></div><span id="offline-badge" class="badge">Offline-Paket wird geprüft</span></div><div class="workflow-steps"><div><b>1</b><span><strong>Vorbereiten</strong>QR-Codes erzeugen & drucken</span></div><div><b>2</b><span><strong>Raus in den Wald</strong>Aufhängen, scannen & GPS speichern</span></div><div><b>3</b><span><strong>Abenteuer teilen</strong>Fertiges Spiel exportieren</span></div></div><div class="editor-toolbar"><div class="draft-choice"><label for="draft-select">Euer Abenteuer</label><select id="draft-select"><option value="" ${d ? "hidden" : ""}>Entwurf auswählen</option>${db.drafts.map((a) => `<option value="${esc(a.id)}" ${a.id === d?.id ? "selected" : ""}>${esc(a.title)}</option>`).join("")}</select></div><button id="new-draft" class="primary">${icon("plus")}Neues Abenteuer</button><button id="import-draft" class="secondary">${icon("download")}Datei importieren</button><button id="copy-public" class="secondary">${icon("flag")}Aktuelles Spiel übernehmen</button>${recovery ? '<button id="recovery-backup" class="secondary">Rettungssicherung herunterladen</button>' : ""}<input id="import-file" type="file" accept="application/json,.json" hidden></div>
 ${
   d
     ? `<div class="field-mode-toolbar"><span>Werkstatt &amp; Wald</span><button id="field-mode" class="secondary" aria-pressed="${fieldMode}">${icon(fieldMode ? "pencil" : "trees")}${fieldMode ? "Zur Werkstatt" : "Feldmodus starten"}</button></div><div class="editor-layout"><section class="editor-workspace"><div class="editor-panel"><div class="section-heading"><div><span class="eyebrow">EUER PLAN FÜR DEN WALD</span><h2>Das Abenteuer</h2></div><span id="save-status" class="save-status" role="status">${saveOk ? "Auf diesem Tablet gespeichert" : "Nicht gespeichert – Sicherung herunterladen"}</span></div><div class="editor-fields"><label>Abenteuer-Titel<input data-field="title" maxlength="100" value="${esc(d.title)}"></label><div class="field-row"><label>Gebiet<input data-field="area" maxlength="100" value="${esc(d.area)}"></label><label>Region<input data-field="region" maxlength="100" value="${esc(d.region)}"></label></div><label class="visibility-label">Stationen auf der Schatzkarte<select data-field="stationVisibility"><option value="all" ${d.stationVisibility !== "next" ? "selected" : ""}>Alle Stationen direkt anzeigen</option><option value="next" ${d.stationVisibility === "next" ? "selected" : ""}>Nur die nächste Station anzeigen</option></select><span class="small-note">Bereits gefundene Stationen bleiben sichtbar. Die Reihenfolge entsteht beim Platzieren.</span></label><label>Einleitung für die Kinder<textarea data-field="description" rows="2" maxlength="1200">${esc(d.description)}</textarea></label><div id="adventure-settings"></div></div></div><div class="editor-panel survey-panel"><div class="section-heading"><div><span class="eyebrow">DRAUSSEN UNTERWEGS</span><h2>Aus Codes werden Orte</h2></div><span class="badge">${count} / ${d.stations.length} platziert</span></div><div id="survey-map" aria-label="Karte zur Erfassung der Stationen"></div><div class="survey-actions"><button id="admin-locate" class="secondary">${icon("locate-fixed")}GPS einschalten</button><button id="survey-scan" class="primary">${icon("scan-line")}Aufgehängten Code scannen</button></div><p id="gps-status" role="status">Nach dem Scannen wird eine frische GPS-Messung für diesen Code aufgenommen.</p></div><section class="editor-panel"><div class="section-heading"><div><span class="eyebrow">JEDE SPUR HAT EINE GESCHICHTE</span><h2>${count} Stationen · ${d.stations.length - count} freie Codes</h2></div></div><div class="editor-stations">${placedStations(
         d,
       )
         .map(
           (s, i) =>
             `<div class="station-edit-row"><button class="editor-station" data-edit="${esc(s.id)}"><span class="timeline-num complete">${i + 1}</span><span><strong>${esc(s.name)}</strong><small>${esc(s.code)} · GPS gespeichert${s.survey?.accuracy !== undefined ? " · ±" + s.survey.accuracy + " m" : ""}</small></span>${icon("pencil")}</button><div class="station-order"><button class="icon-button" data-move="${esc(s.id)}" data-offset="-1" aria-label="${esc(s.name)} nach oben" ${i === 0 ? "disabled" : ""}>${icon("arrow-up")}</button><button class="icon-button" data-move="${esc(s.id)}" data-offset="1" aria-label="${esc(s.name)} nach unten" ${i === count - 1 ? "disabled" : ""}>${icon("arrow-down")}</button></div></div>`,
         )
         .join(
           "",
         )}${!count ? '<p class="small-note">Noch keine Spur platziert. Hänge eine Karte auf und scanne sie direkt hier.</p>' : ""}<details class="pool-details"><summary>${d.stations.length - count} freie Vorratskarten anzeigen</summary>${d.stations
         .filter((s) => !s.position)
         .map(
           (s) =>
             `<button class="editor-station" data-edit="${esc(s.id)}"><span class="timeline-num">＋</span><span><strong>Freie Vorratskarte</strong><small>${esc(s.code)} · Noch frei</small></span>${icon("pencil")}</button>`,
         )
         .join(
           "",
         )}</details><button id="add-cards" class="secondary" ${d.stations.length >= 100 ? "disabled" : ""}>${icon("plus")}Weitere QR-Karten erzeugen</button></div></section></section><aside class="editor-aside"><div class="next-card"><div class="eyebrow">AB IN DEN PINIENWALD</div><div class="station-illustration">${icon("trees")}<span>✦</span></div><h2>Bereit zum Verstecken?</h2><p>Drucke den Stapel aus und nimm beliebige Karten mit. Die Reihenfolge entsteht erst beim Aufhängen und Scannen.</p><button id="show-print" class="primary">${icon("printer")}Vorratskarten drucken</button><button id="backup" class="secondary">${icon("download")}Entwurf sichern</button></div><div class="editor-panel export-panel"><span class="eyebrow">WENN EURE RUNDE FERTIG IST</span><h2>Euer fertiges Spiel</h2><p>${count ? `${count} platzierte Stationen sind bereit. ${d.stations.length - count} ungenutzte Codes bleiben im Vorrat und werden nicht exportiert.` : "Platziere eure erste Vorratskarte. Nur tatsächlich verwendete Codes werden Teil des Spiels."}</p><button id="export-hunt" class="primary">${icon("download")}Spiel exportieren</button><p class="small-note">Der Kartenausschnitt entsteht automatisch aus euren gespeicherten Punkten.</p></div><div class="tip-card"><span class="tip-icon">${icon("leaf")}</span><div><h3>Dein Tablet ist dein Notizbuch.</h3><p>Entwürfe bleiben lokal. Lade regelmäßig eine Sicherung herunter – besonders vor dem Löschen von Browserdaten.</p></div></div></aside></div>`
     : `<section class="empty-editor"><div class="modal-symbol">${icon("trees")}</div><h2>Ein Wald. Tausend Möglichkeiten.</h2><p>Lege ein Abenteuer an und entscheide, wie viele QR-Codes du mitnehmen möchtest. Die Positionen sammelst du später unterwegs.</p><button id="first-draft" class="primary">${icon("plus")}Mein erstes Abenteuer anlegen</button></section>`
 }
 <footer><span>${icon("mountain")}Deine Ideen bleiben auf diesem Gerät.</span><span id="offline-text">Vor dem Loslaufen einmal im Flugmodus testen.</span></footer><p class="demo-note">Spielleitung · Separater Zugang, ohne Passwortschutz. Kein Konto und kein Backend nötig.</p></main>`;
    paintIcons();
    $("#recovery-backup")?.addEventListener("click", () =>
      download("waldabenteuer-rettung.json", recovery, "application/json"),
    );
    $("#new-draft").onclick = newDraft;
    $("#first-draft")?.addEventListener("click", newDraft);
    $("#draft-select").onchange = (e) => {
      db.active = e.target.value;
      save();
      render();
    };
    $("#copy-public").onclick = () => {
      const existing = db.drafts.find((a) => a.id === config.id);
      if (existing) {
        db.active = existing.id;
      } else {
        db.drafts.push({
          ...structuredClone(config),
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
        });
        db.active = config.id;
      }
      save();
      render();
    };
    $("#import-draft").onclick = () => $("#import-file").click();
    $("#import-file").onchange = importFile;
    if (d) {
      mountAdminSettings({
        host: $("#adventure-settings"),
        draft: d,
        config,
        save,
        refresh: () => render(),
        esc,
        icon,
        paintIcons,
        toast,
      });
      document.querySelectorAll("[data-field]").forEach(
        (input) =>
          (input.oninput = () => {
            d[input.dataset.field] = input.value;
            save();
            if (input.dataset.field === "title")
              $("#draft-select").selectedOptions[0].textContent = input.value;
          }),
      );
      document
        .querySelectorAll("[data-edit]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              editStation(d.stations.find((s) => s.id === b.dataset.edit))),
        );
      $("#backup").onclick = () =>
        download(
          "waldabenteuer-entwurf.json",
          JSON.stringify(d, null, 2),
          "application/json",
        );
      $("#show-print").onclick = printCards;
      $("#export-hunt").onclick = exportHunt;
      $("#survey-scan").onclick = scan;
      $("#admin-locate").onclick = locate;
      $("#field-mode").onclick = () => {
        fieldMode = !fieldMode;
        render(true);
        if (fieldMode) {
          $(".survey-panel").scrollIntoView({
            block: "start",
            behavior: "smooth",
          });
          if (watch === undefined) locate();
        }
      };
      $("#add-cards").onclick = () => {
        modal(
          `<h2>Mehr Karten für euren Wald</h2><p>Alle bisherigen QR-Codes bleiben gültig. Es ist noch Platz für ${100 - d.stations.length} Karten.</p><form id="add-cards-form"><label for="extra-count">Zusätzliche Vorratskarten</label><input id="extra-count" type="number" min="1" max="${100 - d.stations.length}" value="${Math.min(10, 100 - d.stations.length)}" required><button class="primary">Karten hinzufügen</button></form>`,
        );
        $("#add-cards-form").onsubmit = (e) => {
          e.preventDefault();
          try {
            const cards = addCards(d, Number($("#extra-count").value));
            save();
            close();
            render(true);
            toast(`${cards.length} neue Karten erzeugt.`);
            printCards(cards);
          } catch (err) {
            toast(err.message);
          }
        };
      };
      document.querySelectorAll("[data-move]").forEach(
        (b) =>
          (b.onclick = () => {
            moveStation(
              d,
              d.stations.find((s) => s.id === b.dataset.move),
              Number(b.dataset.offset),
            );
            save();
            render(true);
          }),
      );
      if (oldMap) {
        $("#survey-map").replaceWith(oldMap);
        $("#gps-status").textContent = gpsText;
        refreshMarkers();
        requestAnimationFrame(() => map?.invalidateSize());
      } else initMap();
    }
    setupOffline();
    if (preserve) window.scrollTo(0, scrollY);
  }
  function newDraft() {
    modal(
      `<div class="modal-symbol">${icon("sprout")}</div><span class="eyebrow">EIN NEUES WALDABENTEUER</span><h2>Wie viele Karten nehmt ihr mit?</h2><p>Drucke einen Vorrat und nimm im Wald irgendeine Karte. Erst beim Scannen wird daraus eine Station. Jeder Code enthält nur eine Kennung – keine Position und keine Aufgabe. Beides legst du später fest.</p><form id="create-draft"><label for="draft-title">Abenteuer-Titel (später änderbar)</label><input id="draft-title" maxlength="100" value="Das Geheimnis der Pinien"><label for="draft-count">Anzahl der Vorratskarten</label><input id="draft-count" type="number" min="1" max="100" value="20" required><label for="draft-area">Gebiet</label><input id="draft-area" maxlength="100" value="${esc(config.area)}"><button id="create-and-print" class="primary" type="submit">Vorrat erzeugen &amp; drucken</button><button class="secondary" type="submit">QR-Codes erzeugen</button></form>`,
    );
    $("#create-draft").onsubmit = (e) => {
      e.preventDefault();
      const printNow = e.submitter?.id === "create-and-print";
      try {
        const d = createDraft(
          $("#draft-title").value,
          Number($("#draft-count").value),
          $("#draft-area").value,
        );
        db.drafts.push(d);
        db.active = d.id;
        save();
        close();
        render();
        if (printNow) printCards();
      } catch (err) {
        toast(err.message);
      }
    };
  }
  async function initMap() {
    const d = draft(),
      instance = L.map("survey-map", {
        minZoom: 3,
        maxZoom: 19,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        preferCanvas: true,
      }).setView(resolveMap(d.mapSelection, [], config.map).center, 15);
    map = instance;
    instance.attributionControl.setPrefix(false);
    instance.attributionControl.addAttribution(
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    );
    layer = L.featureGroup().addTo(instance);
    refreshMarkers();
    if (layer.getLayers().length)
      instance.fitBounds(layer.getBounds().pad(0.2), { maxZoom: 16 });
    else
      instance.fitBounds(resolveMap(d.mapSelection, [], config.map).bounds, {
        padding: [15, 15],
        maxZoom: 16,
      });
    try {
      const selected = resolveMap(d.mapSelection, [], config.map);
      const { geo, note } = await loadAdminMap(selected, config);
      if (map !== instance) return;
      backgroundMap = renderMapData(instance, geo);
      $("#gps-status").textContent = note;
    } catch (e) {
      if (map === instance) $("#gps-status").textContent = e.message;
    }
  }

  function refreshMarkers() {
    layer.clearLayers();
    placedStations(draft()).forEach((s, i) => {
      if (isPoint(s.position))
        L.marker(s.position, {
          icon: L.divIcon({
            className: "station-marker-wrap",
            html: `<span class="station-marker done">${i + 1}</span>`,
            iconSize: [35, 42],
          }),
        })
          .on("click", () => editStation(s))
          .addTo(layer);
    });
  }
  function locate() {
    if (!navigator.geolocation)
      return toast("Dieses Gerät unterstützt kein GPS.");
    if (watch !== undefined) navigator.geolocation.clearWatch(watch);
    $("#gps-status").textContent = "GPS-Signal wird gesucht …";
    watch = navigator.geolocation.watchPosition(
      (p) => {
        if (!map) return;
        activeMeasurement?.(p);
        const point = [p.coords.latitude, p.coords.longitude];
        if (gpsMarker) {
          gpsMarker.setLatLng(point);
          accuracyCircle.setLatLng(point).setRadius(p.coords.accuracy);
        } else {
          accuracyCircle = L.circle(point, {
            radius: p.coords.accuracy,
            color: "#438bc4",
            weight: 1,
            fillOpacity: 0.12,
          }).addTo(map);
          gpsMarker = L.marker(point, {
            icon: L.divIcon({ className: "gps-marker", iconSize: [22, 22] }),
          }).addTo(map);
          map.setView(point, 16);
        }
        $("#gps-status").textContent =
          `GPS aktiv · ±${Math.round(p.coords.accuracy)} m${L.latLngBounds(resolveMap(draft().mapSelection, [], config.map).bounds).contains(point) ? "" : " · Außerhalb der gespeicherten Hintergrundkarte. Punkte können trotzdem erfasst werden."}`;
      },
      (e) => {
        $("#gps-status").textContent = gpsError(e);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 25000 },
    );
  }
  function gpsError(e) {
    return e.code === 1
      ? "Standortzugriff fehlt. Bitte in den Browsereinstellungen freigeben."
      : "Noch kein GPS-Signal. Draußen erneut versuchen oder Koordinaten in der Station eintragen.";
  }
  function capture(s) {
    modal(
      `<div class="modal-symbol">${icon("map-pin")}</div><span class="eyebrow">${esc(s.code)}</span><h2>${esc(s.name)}</h2><p>${s.position ? "Dieser Code hat bereits eine Position. Eine neue Messung ersetzt sie erst, wenn du speicherst." : "Code erkannt! Bleib bei deinem aufgehängten QR-Code stehen."}</p><div id="measurement" class="measurement" role="status">Frische GPS-Position wird gesucht …</div><button id="retry-gps" class="secondary">${icon("locate-fixed")}Erneut messen</button><button id="save-position" class="primary" disabled>Position hier speichern</button><p class="small-note">Die Genauigkeit wird mitgespeichert. Bei ungenauem GPS erst etwas warten und erneut messen.</p>`,
    );
    let measurement = null,
      request = 0;
    const current = session;
    const measure = () => {
      measurement = null;
      $("#save-position").disabled = true;
      $("#measurement").textContent = "Frische GPS-Position wird gesucht …";
      const attempt = ++request;
      if (!navigator.geolocation) {
        $("#measurement").textContent = "Dieses Gerät unterstützt kein GPS.";
        return;
      }
      const requestedAt = Date.now();
      const receive = (p) => {
        if (current !== session || attempt !== request) return;
        measurement = p;
        $("#measurement").innerHTML =
          `<strong>±${Math.round(p.coords.accuracy)} m Genauigkeit</strong><span>${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}</span>${p.coords.accuracy > 35 ? '<b class="accuracy-warning">Noch recht ungenau – besser erneut messen.</b>' : ""}`;
        $("#save-position").disabled = false;
      };
      // A fresh fix from the running watch is equally useful; some devices
      // delay one-shot requests while a high-accuracy watch is already active.
      activeMeasurement = (p) => {
        if (p.timestamp >= requestedAt) receive(p);
      };
      navigator.geolocation.getCurrentPosition(
        receive,
        (e) => {
          if (current === session && attempt === request)
            $("#measurement").textContent = gpsError(e);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
      );
    };
    $("#retry-gps").onclick = measure;
    $("#save-position").onclick = () => {
      if (!measurement) return;
      try {
        applySurvey(s, measurement.coords, measurement.timestamp);
        assignOrder(draft(), s);
        save();
        close();
        render(true);
        toast(
          `${s.name}: Position gespeichert. Die nächste Karte kann kommen!`,
        );
      } catch (e) {
        toast(e.message);
        measure();
      }
    };
    measure();
  }
  async function scan() {
    modal(
      `<span class="eyebrow">ERST AUFHÄNGEN, DANN SCANNEN</span><h2>Welcher Code hängt hier?</h2><p>Scanne eine Karte dieses Entwurfs. Danach speichern wir den Ort mit GPS.</p><div class="camera-box"><video id="admin-camera" autoplay playsinline muted></video><div class="scan-frame"></div><span id="admin-camera-status">Kamera wird gestartet …</span></div><p id="admin-scan-error" role="alert"></p><details><summary>Code von Hand eingeben</summary><form id="admin-code-form"><label for="admin-code">Aufgedruckter Stationscode</label><input id="admin-code" required autocomplete="off"><button class="primary">Code zuordnen</button></form></details>`,
    );
    const accept = (value) => {
      const s = findStation(draft(), value);
      if (!s) {
        $("#admin-scan-error").textContent =
          "Dieser Code gehört nicht zum ausgewählten Entwurf.";
        return false;
      }
      capture(s);
      return true;
    };
    $("#admin-code-form").onsubmit = (e) => {
      e.preventDefault();
      accept($("#admin-code").value);
    };
    const current = session;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Error();
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (current !== session) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = media;
      const video = $("#admin-camera");
      video.srcObject = media;
      await video.play();
      if (current !== session) return;
      $("#admin-camera-status").hidden = true;
      const canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      let last = 0;
      function tick(t) {
        if (current !== session) return;
        if (video.readyState >= 2 && t - last > 250) {
          last = t;
          canvas.width = 640;
          canvas.height = Math.round(
            (640 * video.videoHeight) / video.videoWidth,
          );
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height),
            code = jsQR(data.data, data.width, data.height, {
              inversionAttempts: "attemptBoth",
            });
          if (code && accept(code.data)) return;
        }
        frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    } catch {
      if (current === session) {
        $("#admin-camera-status").textContent = "Kein Kamerazugriff";
        $("#admin-scan-error").textContent =
          "Kamera freigeben oder den aufgedruckten Code eingeben.";
        $("dialog details").open = true;
      }
    }
  }
  function editStation(s) {
    modal(
      `<span class="eyebrow">${esc(s.code)} · CODE BLEIBT UNVERÄNDERT</span><h2>Eure Station gestalten</h2><form id="edit-station"><label for="station-name">Name auf der Schatzkarte</label><input id="station-name" required maxlength="100" value="${esc(s.name)}"><label for="station-hint">Hinweis vor dem Fund</label><textarea id="station-hint" rows="2" maxlength="1000">${esc(s.hint)}</textarea><label for="station-title">Titel nach dem Scannen</label><input id="station-title" required maxlength="150" value="${esc(s.title)}"><label for="station-message">Erfolgstext / kleine Aufgabe</label><textarea id="station-message" required rows="4" maxlength="3000">${esc(s.message)}</textarea><fieldset class="challenge-fields"><legend>Aufgabe &amp; Lösungswort</legend><p class="small-note">${draft().progression === "password" ? "Erst die richtige Antwort öffnet die nächste Station." : "Optional vorbereiten. Aktiv wird das Rätsel im Spielmodus „Lösungswort“."}</p><label for="station-task">Aufgabe nach dem QR-Scan</label><textarea id="station-task" rows="3" maxlength="3000">${esc(s.challenge?.prompt || "")}</textarea><label for="station-answer">Richtiges Lösungswort / Passwort</label><input id="station-answer" maxlength="150" autocomplete="off" value="${esc(s.challenge?.answer || "")}"><label for="station-answer-hint">Tipp zur Lösung (optional)</label><input id="station-answer-hint" maxlength="500" value="${esc(s.challenge?.hint || "")}"></fieldset><details><summary>Position ansehen oder manuell eintragen</summary><div class="field-row"><label>Breitengrad<input id="station-lat" type="number" step="any" min="-84.999" max="84.999" value="${s.position?.[0] ?? ""}" placeholder="28.42047"></label><label>Längengrad<input id="station-lng" type="number" step="any" min="-180" max="180" value="${s.position?.[1] ?? ""}" placeholder="-16.37811"></label></div><p class="small-note">${s.survey?.accuracy !== undefined ? `GPS-Genauigkeit bei der Erfassung: ±${s.survey.accuracy} m` : "Noch keine GPS-Messung gespeichert."}</p></details><p id="edit-error" role="alert"></p><button class="primary">Änderungen speichern</button></form><button id="station-gps" class="secondary">${icon("locate-fixed")}Diese Station hier mit GPS erfassen</button>${s.position ? '<button id="return-pool" class="secondary return-pool">Position entfernen &amp; Karte in den Vorrat legen</button>' : ""}`,
    );
    $("#return-pool")?.addEventListener("click", () => {
      if (
        !window.confirm(
          "Position entfernen und diese Karte zurück in den Vorrat legen? Ungespeicherte Textänderungen werden verworfen. Der gedruckte QR-Code bleibt gültig.",
        )
      )
        return;
      returnToPool(draft(), s);
      dirty = false;
      save();
      close();
      render(true);
      toast("Karte ist wieder im Vorrat. Du kannst sie neu platzieren.");
    });
    $("#edit-station").addEventListener("input", () => {
      dirty = true;
    });
    const storeFields = () => {
      for (const [key, id] of Object.entries({
        name: "station-name",
        hint: "station-hint",
        title: "station-title",
        message: "station-message",
      }))
        s[key] = $("#" + id).value.trim();
      s.challenge = {
        prompt: $("#station-task").value.trim(),
        answer: $("#station-answer").value.trim(),
        hint: $("#station-answer-hint").value.trim(),
      };
    };
    $("#edit-station").onsubmit = (e) => {
      e.preventDefault();
      const lat = $("#station-lat").value,
        lng = $("#station-lng").value;
      if (
        (lat || lng) &&
        (!lat || !lng || !isPoint([Number(lat), Number(lng)]))
      ) {
        $("#edit-error").textContent =
          "Bitte beide Koordinaten gültig eintragen.";
        return;
      }
      if (
        !["station-name", "station-title", "station-message"].every((id) =>
          $("#" + id).value.trim(),
        )
      ) {
        $("#edit-error").textContent =
          "Name, Titel und Erfolgstext dürfen nicht leer sein.";
        return;
      }
      storeFields();
      const point = lat && lng ? [Number(lat), Number(lng)] : null;
      if (JSON.stringify(point) !== JSON.stringify(s.position)) {
        s.position = point;
        s.survey = point
          ? { method: "manual", capturedAt: new Date().toISOString() }
          : null;
        if (point) assignOrder(draft(), s);
        else delete s.order;
      }
      dirty = false;
      save();
      close();
      render(true);
    };
    $("#station-gps").onclick = () => {
      if (!$("#edit-station").reportValidity()) return;
      if (
        !["station-name", "station-title", "station-message"].every((id) =>
          $("#" + id).value.trim(),
        )
      ) {
        $("#edit-error").textContent =
          "Name, Titel und Erfolgstext dürfen nicht leer sein.";
        return;
      }
      storeFields();
      dirty = false;
      save();
      capture(s);
    };
  }
  async function printCards(cards) {
    const d = draft();
    modal(
      `<h2>Euer unsortierter QR-Vorrat</h2><p>Eine Karte pro DIN-A4-Seite. Keine Nummer, kein fester Ort: Nimm im Wald einfach irgendeine Karte. Die Stationsreihenfolge entsteht beim Scannen.</p><div class="admin-toolbar"><button id="print-now" class="primary" disabled>${icon("printer")}Drucken / als PDF speichern</button><button id="back-editor" class="secondary">Zurück zum Entwurf</button></div><p id="print-progress" class="print-progress" role="status">Druckkarten werden vorbereitet …</p><label class="print-selection">Welche Karten drucken?<select id="print-selection" disabled><option value="selection">${Array.isArray(cards) ? "Nur neue Karten" : "Alle Karten"}</option><option value="free">Nur freie Vorratskarten</option></select></label><div id="print-cards"></div>`,
    );
    dialogEl.classList.add("print-dialog");
    const current = session;
    const selection = Array.isArray(cards) ? cards : d.stations;
    $("#back-editor").onclick = close;
    $("#print-selection").onchange = () => {
      const free = $("#print-selection").value === "free";
      $("#print-cards")
        .querySelectorAll(".print-card")
        .forEach((card) => {
          card.hidden = free && card.dataset.placed === "true";
        });
      $("#print-now").disabled = !$("#print-cards .print-card:not([hidden])");
    };
    for (const [i, s] of selection.entries()) {
      const url = await QRCode.toDataURL(qrValue(d, s), {
        width: 800,
        margin: 4,
        errorCorrectionLevel: "M",
      });
      if (current !== session) return;
      const card = document.createElement("article");
      card.className = "print-card";
      card.dataset.placed = String(Boolean(s.position));
      card.hidden =
        $("#print-selection").value === "free" && Boolean(s.position);
      card.innerHTML = `<div class="eyebrow">WALDABENTEUER · ${esc(d.area)}</div><span class="print-number">EINE GEHEIME SPUR IM WALD</span><h2>Hier wartet ein Abenteuer!</h2><p>Hier wartet eure nächste Spur. Scannt den Code in eurer Schatzsuche-App!</p><img src="${url}" alt="Vorratskarte ${esc(s.code)}"><strong class="printed-code">${esc(s.code)}</strong><p class="print-coordinates">${esc(d.title)}</p><a class="secondary no-print" href="${url}" download="waldkarte-${s.code}.png">${icon("download")}QR-Code als PNG</a><p class="print-bottom">Der Wald steckt voller Geheimnisse. Entdeckt sie gemeinsam!</p>`;
      $("#print-cards").append(card);
      $("#print-progress").textContent =
        `${i + 1} von ${selection.length} Druckkarten vorbereitet`;
    }
    paintIcons();
    $("#print-now").disabled = !$("#print-cards .print-card:not([hidden])");
    $("#print-selection").disabled = false;
    $("#print-progress").textContent =
      "Deine Druckkarten sind bereit. Eine Karte pro DIN-A4-Seite.";
    $("#print-now").onclick = () => window.print();
    $("#back-editor").onclick = close;
  }
  function exportHunt() {
    let c;
    try {
      c = exportConfig(draft());
    } catch (e) {
      toast(e.message);
      return;
    }
    modal(
      `<div class="modal-symbol">${icon("circle-check")}</div><span class="eyebrow">EURE RUNDE IST BEREIT</span><h2>Das ist eure Schatzsuche!</h2><p>${c.stations.length} platzierte Stationen (${draft().stations.length - c.stations.length} freie Codes werden weggelassen), eure Texte und ein automatisch berechneter Kartenausschnitt. Eure gedruckten QR-Codes bleiben gültig.</p><button id="download-hunt" class="primary">${icon("download")}hunt.json herunterladen</button><ol class="deploy-instructions"><li>Die Datei im Repository als <code>public/hunt.json</code> ersetzen.</li><li>Änderung committen und auf <code>main</code> pushen.</li><li>GitHub Actions lädt die passenden OpenStreetMap-Daten und veröffentlicht eure fertige PWA.</li><li>Die Spiel-App auf jedem Tablet online öffnen und auf „Offline bereit“ warten.</li></ol><p class="small-note">Das Herunterladen veröffentlicht noch nichts. Die Veröffentlichung erfolgt erst durch deinen Commit. Eure lokalen Entwürfe bleiben auf diesem Tablet.</p>`,
    );
    $("#download-hunt").onclick = () =>
      download("hunt.json", JSON.stringify(c, null, 2), "application/json");
  }
  async function importFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2000000)
        throw Error(
          "Die Datei ist zu groß. Bitte eine JSON-Konfiguration oder Entwurfssicherung wählen.",
        );
      const imported = validateDraft(JSON.parse(await file.text()));
      const existing = db.drafts.find((d) => d.id === imported.id);
      const commit = () => {
        if (existing) db.drafts = db.drafts.filter((d) => d.id !== imported.id);
        db.drafts.push(imported);
        db.active = imported.id;
        save();
        close();
        render();
        toast("Entwurf importiert. Die QR-Codes bleiben unverändert.");
      };
      if (existing) {
        modal(
          `<h2>Lokalen Entwurf ersetzen?</h2><p>Ein Entwurf mit denselben QR-Codes ist bereits gespeichert. Sichere ihn bei Bedarf, bevor du den Dateistand übernimmst.</p><button id="backup-existing" class="secondary">Bisherigen Entwurf sichern</button><button id="replace-draft" class="primary">Durch importierte Datei ersetzen</button>`,
        );
        $("#backup-existing").onclick = () =>
          download(
            "bisheriger-entwurf.json",
            JSON.stringify(existing, null, 2),
            "application/json",
          );
        $("#replace-draft").onclick = commit;
      } else commit();
    } catch (err) {
      toast(`Import nicht möglich: ${err.message}`);
    }
  }
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () => {
    close(true);
    teardownMap();
  });
  render();
}
