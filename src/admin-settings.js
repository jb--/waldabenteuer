import { REGIONS, resolveMap, mapKey, contains, isPoint } from "./regions.js";
import { readRegionMap, saveRegionMap } from "./map-storage.js";
import { downloadMapData, fetchMapGeoJSON } from "./map-data.js";
export const TENERIFE_MAP = {
  ...REGIONS.find((r) => r.id === "tenerife"),
  file: "regions/tenerife.geojson",
};
export async function loadAdminMap(map, config) {
  try {
    const cached = await readRegionMap(map);
    if (cached)
      return {
        geo: cached.geo,
        note: "Gewähltes Gebiet ist offline gespeichert.",
      };
  } catch {}
  if (mapKey(map) === mapKey(config.map)) {
    return {
      geo: await fetchMapGeoJSON(config.map.file),
      note: "Karte aus eurem gespeicherten Spiel.",
    };
  }
  if (
    contains(TENERIFE_MAP.bounds, map.bounds[0]) &&
    contains(TENERIFE_MAP.bounds, map.bounds[1])
  ) {
    return {
      geo: await fetchMapGeoJSON(TENERIFE_MAP.file),
      note: "Dieses Gebiet ist in der mitgelieferten Teneriffa-Karte enthalten.",
    };
  }
  throw Error(
    "Für dieses Gebiet fehlt die Offline-Karte. Bitte „Gebiet offline laden“ wählen. GPS-Punkte lassen sich auch ohne Hintergrundkarte speichern.",
  );
}
export function mountAdminSettings({
  host,
  draft,
  config,
  save,
  refresh,
  esc,
  icon,
  paintIcons,
  toast,
}) {
  const selection = draft.mapSelection || { mode: "auto" },
    selected = resolveMap(selection, [], config.map);
  host.innerHTML = `<div class="settings-section"><span class="eyebrow">SO SOLL EUER ABENTEUER SEIN</span><div class="field-row"><label>Mit oder ohne Zeit?<select id="game-timing"><option value="off" ${draft.timing === false ? "selected" : ""}>Ohne Zeit · in eurem Tempo</option><option value="on" ${draft.timing !== false ? "selected" : ""}>Mit Zeitmessung</option></select></label><label>Wann geht die nächste Spur auf?<select id="game-progression"><option value="scan" ${draft.progression !== "password" ? "selected" : ""}>Nach dem QR-Scan</option><option value="password" ${draft.progression === "password" ? "selected" : ""}>Nach dem richtigen Lösungswort</option></select></label></div><p class="small-note">Die GPS-Route wird in beiden Zeitmodi aufgezeichnet. Im Lösungswort-Modus erscheint immer nur die nächste freigeschaltete Station.</p></div><div class="settings-section"><span class="eyebrow">EUER KARTENGEBIET</span><label>Region auswählen<select id="map-region"><option value="auto" ${selection.mode === "auto" ? "selected" : ""}>Automatisch um die Stationen</option>${REGIONS.map((r) => `<option value="${r.id}" ${selection.mode === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}<option value="custom" ${selection.mode === "custom" ? "selected" : ""}>Eigene Region / anderer Ort</option></select></label>${selection.mode === "custom" ? `<div class="custom-region"><p class="small-note">Lege eine beliebige Region über ihren Mittelpunkt und Radius fest.</p><div class="field-row"><label>Breitengrad<input id="region-lat" type="number" step="any" value="${selection.center[0]}"></label><label>Längengrad<input id="region-lng" type="number" step="any" value="${selection.center[1]}"></label><label>Radius in km<input id="region-radius" type="number" step=".1" min=".2" max="70" value="${selection.radiusKm}"></label></div><div class="region-actions"><button id="region-here" class="secondary">${icon("locate-fixed")}Meine Position als Mitte</button><button id="apply-region" class="secondary">Kartengebiet übernehmen</button></div></div>` : ""}<div class="region-actions"><button id="prepare-region" class="secondary">${icon("download")}Gebiet offline laden</button><button id="cancel-region-download" class="secondary" hidden>Abbrechen</button></div><p id="region-status" class="small-note" role="status">Region wird geprüft …</p></div>`;
  const $ = (s) => host.querySelector(s);
  const visibility = document.querySelector('[data-field="stationVisibility"]');
  if (visibility) {
    visibility.disabled = draft.progression === "password";
    if (draft.progression === "password") visibility.value = "next";
  }
  $("#game-timing").onchange = () => {
    draft.timing = $("#game-timing").value === "on";
    save();
  };
  $("#game-progression").onchange = () => {
    draft.progression = $("#game-progression").value;
    if (draft.progression === "password") draft.stationVisibility = "next";
    save();
    refresh();
  };
  $("#map-region").onchange = () => {
    const mode = $("#map-region").value;
    draft.mapSelection =
      mode === "custom"
        ? { mode, center: [...selected.center], radiusKm: 3 }
        : { mode };
    const preset = REGIONS.find((r) => r.id === mode);
    if (preset) {
      draft.area = preset.name;
      draft.region = "Teneriffa";
    }
    save();
    refresh();
  };
  const apply = () => {
    try {
      const next = {
        mode: "custom",
        center: [
          Number($("#region-lat").value),
          Number($("#region-lng").value),
        ],
        radiusKm: Number($("#region-radius").value),
      };
      if (!$("#region-lat").value || !$("#region-lng").value)
        throw Error("Bitte beide Koordinaten eintragen.");
      resolveMap(next);
      draft.mapSelection = next;
      save();
      refresh();
    } catch (e) {
      toast(e.message);
    }
  };
  if ($("#apply-region")) $("#apply-region").onclick = apply;
  if ($("#region-here"))
    $("#region-here").onclick = () => {
      if (!navigator.geolocation)
        return toast("Dieses Gerät unterstützt kein GPS.");
      $("#region-status").textContent = "GPS-Position wird gesucht …";
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (!host.isConnected) return;
          $("#region-lat").value = p.coords.latitude;
          $("#region-lng").value = p.coords.longitude;
          $("#region-status").textContent =
            "Position übernommen. Mit „Kartengebiet übernehmen“ bestätigen.";
        },
        () => {
          if (host.isConnected)
            $("#region-status").textContent =
              "Standort nicht verfügbar. Bitte Koordinaten manuell eintragen.";
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 },
      );
    };
  let controller;
  $("#cancel-region-download").onclick = () => controller?.abort();
  $("#prepare-region").onclick = async () => {
    controller = new AbortController();
    $("#prepare-region").disabled = true;
    $("#cancel-region-download").hidden = false;
    try {
      let geo;
      try {
        geo = (await loadAdminMap(selected, config)).geo;
      } catch {
        geo = await downloadMapData(selected, {
          signal: controller.signal,
          onProgress: (message) => {
            if (host.isConnected) $("#region-status").textContent = message;
          },
        });
      }
      if (controller.signal.aborted) return;
      await saveRegionMap(selected, geo);
      if (host.isConnected) {
        toast("Kartengebiet ist auf diesem Tablet gespeichert.");
        refresh();
      }
    } catch (e) {
      if (host.isConnected)
        $("#region-status").textContent = controller.signal.aborted
          ? "Download abgebrochen. Die bisherige Karte bleibt erhalten."
          : `${e.message} Bitte mit Internet erneut versuchen.`;
    } finally {
      if (host.isConnected) {
        $("#prepare-region").disabled = false;
        $("#cancel-region-download").hidden = true;
      }
    }
  };
  loadAdminMap(selected, config)
    .then((result) => {
      if (host.isConnected) $("#region-status").textContent = result.note;
    })
    .catch((e) => {
      if (host.isConnected) $("#region-status").textContent = e.message;
    });
  paintIcons();
}
