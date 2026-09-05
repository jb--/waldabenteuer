import { elapsed, formatTime, timingEnabled } from "./game.js";

const xml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
function lines(text, limit = 44) {
  const result = [""];
  for (const word of String(text).split(/\s+/)) {
    const last = result.length - 1;
    if ((result[last] + " " + word).length > limit && result[last])
      result.push(word);
    else result[last] += (result[last] ? " " : "") + word;
  }
  return result.slice(0, 3);
}
export function certificateSvg(config, group) {
  if (!group.finished || !config.stations.every((s) => group.found[s.id]))
    throw new Error("Die Urkunde gibt es nach dem letzten Fund.");
  const date = new Date(group.finished).toLocaleDateString("de-DE");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 790" role="img" aria-label="Entdecker-Urkunde"><rect width="1120" height="790" fill="#faf6e9"/><rect x="25" y="25" width="1070" height="740" rx="20" fill="none" stroke="#b9c4a6" stroke-width="2"/><rect x="36" y="36" width="1048" height="718" rx="15" fill="none" stroke="#d9ddc9"/><path d="M0 730q140-160 270-45t260 60 330-55 260 15v85H0Z" fill="#e2e8d2"/><g fill="#476d50"><path d="m107 538-38 60h17l-29 46h37v38h26v-38h37l-29-46h17Z"/><path d="m1002 525-45 70h20l-35 53h45v42h28v-42h45l-35-53h20Z"/></g><circle cx="560" cy="160" r="71" fill="#e8eddc"/><circle cx="560" cy="160" r="58" fill="none" stroke="#b4c6a0" stroke-dasharray="3 6"/><path d="m560 110 12 31 33 2-26 22 8 33-27-18-27 18 8-33-26-22 33-2Z" fill="#d9a356"/><g text-anchor="middle" fill="#264f3c"><text x="560" y="265" font-family="sans-serif" font-size="13" letter-spacing="5">WALDABENTEUER · GEMEINSAM GESCHAFFT</text><text x="560" y="342" font-family="Georgia,serif" font-size="64">Ihr seid echte Waldhelden!</text><text x="560" y="404" font-family="sans-serif" font-size="16" fill="#78866a">DIESE ENTDECKER-URKUNDE GEHÖRT</text><text x="560" y="462" font-family="Georgia,serif" font-size="${group.name.length > 30 ? 34 : 43}">${xml(group.name)}</text><path d="M360 485h400" stroke="#d6c8a9"/><text x="560" y="530" font-family="sans-serif" font-size="16" fill="#6c7f61">Ihr habt alle ${config.stations.length} Stationen entdeckt und zusammen das Abenteuer</text>${lines(
    config.title,
  )
    .map(
      (line, i) =>
        `<text x="560" y="${562 + i * 25}" font-family="Georgia,serif" font-size="23">${xml(line)}</text>`,
    )
    .join(
      "",
    )}<text x="560" y="647" font-family="sans-serif" font-size="16" fill="#6c7f61">gemeistert. Mit offenen Augen, mutigen Schritten und ganz viel Teamgeist.</text><text x="560" y="714" font-family="sans-serif" font-size="14" letter-spacing="2">${xml(date)} · ${timingEnabled(config) ? formatTime(elapsed(group)) + " ABENTEUERZEIT" : "EIN TAG VOLLER ENTDECKUNGEN"}</text></g></svg>`;
}

export function createExperience({
  getGroup,
  config,
  icon,
  paintIcons,
  dialog,
  download,
  toast,
}) {
  let sound = false,
    awake = true,
    audio,
    wake,
    pending;
  try {
    sound = localStorage.getItem("wald:sound") === "on";
    awake = localStorage.getItem("wald:awake") !== "off";
  } catch {}
  function savePrefs() {
    try {
      localStorage.setItem("wald:sound", sound ? "on" : "off");
      localStorage.setItem("wald:awake", awake ? "on" : "off");
    } catch {}
  }
  function controls() {
    const soundButton = document.querySelector("#sound-toggle"),
      wakeButton = document.querySelector("#wake-toggle");
    if (soundButton) {
      soundButton.innerHTML = icon(sound ? "volume-2" : "volume-x");
      soundButton.setAttribute(
        "aria-label",
        sound ? "Erfolgston ausschalten" : "Erfolgston einschalten",
      );
      soundButton.setAttribute("aria-pressed", String(sound));
      soundButton.title = sound ? "Erfolgston an" : "Erfolgston aus";
    }
    if (wakeButton) {
      wakeButton.innerHTML = `${icon(wake ? "sun" : "moon")}<span>${!awake ? "Bildschirm normal" : wake ? "Bildschirm bleibt an" : "Bildschirm wach halten"}</span>`;
      wakeButton.setAttribute("aria-pressed", String(awake));
      wakeButton.setAttribute(
        "aria-label",
        awake ? "Bildschirm-Wachhalten ausschalten" : "Bildschirm wach halten",
      );
      wakeButton.title =
        "Während des Abenteuers automatisches Sperren verhindern, wenn dein Gerät es unterstützt.";
    }
    paintIcons();
  }
  async function sync() {
    const g = getGroup();
    const active =
      awake &&
      g?.started &&
      !g.finished &&
      document.visibilityState === "visible";
    if (!active) {
      if (wake) {
        const current = wake;
        wake = null;
        await current.release().catch(() => {});
      }
      controls();
      return;
    }
    if (wake || pending || !navigator.wakeLock) {
      controls();
      return;
    }
    pending = navigator.wakeLock.request("screen");
    try {
      const acquired = await pending;
      const current = getGroup();
      if (
        !awake ||
        !current?.started ||
        current.finished ||
        document.visibilityState !== "visible"
      ) {
        await acquired.release();
        return;
      }
      wake = acquired;
      wake.addEventListener("release", () => {
        if (wake === acquired) wake = null;
        controls();
      });
    } catch {
    } finally {
      pending = null;
      controls();
    }
  }
  function play() {
    if (!sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ??= new Audio();
      audio
        .resume()
        .then(() => {
          [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
            const oscillator = audio.createOscillator(),
              gain = audio.createGain(),
              t = audio.currentTime + i * 0.095;
            oscillator.type = "sine";
            oscillator.frequency.value = hz;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.07, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            oscillator.connect(gain);
            gain.connect(audio.destination);
            oscillator.start(t);
            oscillator.stop(t + 0.32);
          });
        })
        .catch(() => {});
    } catch {}
  }
  function bind() {
    const s = document.querySelector("#sound-toggle"),
      w = document.querySelector("#wake-toggle");
    if (s)
      s.onclick = () => {
        sound = !sound;
        savePrefs();
        controls();
        if (sound) play();
      };
    if (w)
      w.onclick = () => {
        awake = !awake;
        savePrefs();
        sync();
        if (awake && !navigator.wakeLock)
          toast(
            "Dieses Gerät kann das automatische Sperren nicht verhindern. Bitte den Bildschirm selbst geöffnet halten.",
          );
      };
    controls();
    sync();
  }
  function celebrate() {
    play();
    const d = document.querySelector("#dialog");
    if (!d) return;
    d.classList.add("success-dialog");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const confetti = document.createElement("div");
    confetti.className = "confetti";
    confetti.setAttribute("aria-hidden", "true");
    confetti.innerHTML = Array.from(
      { length: 24 },
      (_, i) =>
        `<b style="--x:${i * 4.3}%;--delay:${(i % 6) * 0.07}s;--rotation:${i * 67}deg;--color:${["#dca856", "#72925c", "#e69b71", "#cbd6b6"][i % 4]}"></b>`,
    ).join("");
    d.prepend(confetti);
    setTimeout(() => confetti.remove(), 2200);
  }
  function certificate() {
    let svg;
    try {
      svg = certificateSvg(config, getGroup());
    } catch (e) {
      toast(e.message);
      return;
    }
    const d = dialog(
      `<span class="eyebrow">EIN ANDENKEN AN EUREN TAG</span><h2>Eure Entdecker-Urkunde</h2><div class="certificate-preview">${svg}</div><button id="download-certificate" class="primary">${icon("download")}Urkunde herunterladen</button><p class="small-note">Als Bild speichern oder später am Computer ausdrucken.</p>`,
    );
    d.classList.add("certificate-dialog");
    document.querySelector("#download-certificate").onclick = () =>
      download("waldhelden-urkunde.svg", svg, "image/svg+xml");
  }
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", () => {
    wake?.release().catch(() => {});
  });
  return { bind, sync, celebrate, certificate };
}
