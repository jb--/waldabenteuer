import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import QRCode from "qrcode";
import { qrValue } from "../../src/game.js";
const config = JSON.parse(await readFile("public/hunt.json", "utf8"));
test("offline play, progress persistence, independent groups and admin cards", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Eure Schatzkarte" }),
  ).toBeVisible();
  await expect(page.locator(".station-marker")).toHaveCount(5);
  await expect(page.locator("#offline-badge")).toHaveText("Offline bereit", {
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Abenteuer starten" }).click();
  await page.locator("#group-input").fill("Die Zapfenbande");
  await page.getByRole("button", { name: "Jetzt loslaufen" }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#team-name")).toContainText("Die Zapfenbande");
  await expect(page.locator(".station-marker")).toHaveCount(5);
  for (const station of config.stations) {
    await page.locator("#scan").click();
    await page.locator("details").evaluate((e) => (e.open = true));
    await page.locator("#manual-code").fill(station.code);
    await page.getByRole("button", { name: "Code prüfen" }).click();
    await expect(
      page.getByRole("heading", { name: station.title }),
    ).toBeVisible();
    await page.locator("#continue").click();
  }
  await expect(page.locator(".team-result")).toContainText(
    "Abenteuer geschafft!",
  );
  await page.reload();
  await expect(page.locator("#progress-label")).toHaveText("5 / 5 gefunden");
  await page.getByRole("button", { name: "Unser Team", exact: true }).click();
  await page.getByRole("button", { name: "Neue Gruppe", exact: true }).click();
  await page.locator("#new-name").fill("Die Füchse");
  await page.getByRole("button", { name: "Gruppe anlegen" }).click();
  await expect(page.locator("#progress-label")).toHaveText("0 / 5 gefunden");
  await page.goto("/#/spielleitung");
  await page
    .getByRole("button", { name: "Aktuelles Spiel übernehmen" })
    .click();
  await page.getByRole("button", { name: "Vorratskarten drucken" }).click();
  await expect(page.locator(".print-card")).toHaveCount(5);
  await expect(page.locator(".print-card img").first()).toBeVisible();
  expect(errors).toEqual([]);
});
test("responsive map, location permission failure and invalid code feedback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".station-marker")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#locate").click();
  await expect(page.locator("#toast")).toContainText(/Standort|GPS/);
  await page.locator("#start").click();
  await page.getByRole("button", { name: "Jetzt loslaufen" }).click();
  await page.locator("#scan").click();
  await page.locator("details").evaluate((e) => (e.open = true));
  await page.locator("#manual-code").fill("FALSCH");
  await page.getByRole("button", { name: "Code prüfen" }).click();
  await expect(page.locator("#scan-error")).toContainText("gehört nicht");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("camera decoder reads actual QR pixels through mocked camera", async ({
  page,
}) => {
  const data = await QRCode.toDataURL(qrValue(config, config.stations[0]), {
    width: 640,
    margin: 8,
  });
  await page.addInitScript(
    ({ data }) => {
      navigator.mediaDevices.getUserMedia = async () => {
        const img = new Image();
        img.src = data;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 640;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const stream = c.captureStream(10);
        const timer = setInterval(() => ctx.drawImage(img, 0, 0), 100);
        stream
          .getVideoTracks()[0]
          .addEventListener("ended", () => clearInterval(timer));
        return stream;
      };
    },
    { data },
  );
  await page.goto("/");
  await page.locator("#start").click();
  await page.getByRole("button", { name: "Jetzt loslaufen" }).click();
  await page.locator("#scan").click();
  await expect(
    page.getByRole("heading", { name: config.stations[0].title }),
  ).toBeVisible({ timeout: 15000 });
});
test("desktop screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");
  await expect(page.locator(".station-marker")).toHaveCount(5);
  await expect(page.locator("#offline-badge")).toHaveText("Offline bereit");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});
test("next-only map reveals discoveries and GPS route starts with the game", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 28.4205,
    longitude: -16.3781,
    accuracy: 6,
  });
  await page.route("**/hunt.json", (route) =>
    route.fulfill({ json: { ...config, stationVisibility: "next" } }),
  );
  await page.goto("/");
  await expect(page.locator(".station-marker")).toHaveCount(1);
  await expect(page.locator(".station-tile")).toHaveCount(1);
  await page.locator("#start").click();
  await page.getByRole("button", { name: "Jetzt loslaufen" }).click();
  await context.setGeolocation({
    latitude: 28.4205,
    longitude: -16.3781,
    accuracy: 6,
  });
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem(`wald:${id}`)).groups[0].track.length,
        config.id,
      ),
    )
    .toBe(1);
  await page.waitForTimeout(5100);
  await context.setGeolocation({
    latitude: 28.421,
    longitude: -16.3782,
    accuracy: 6,
  });
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem(`wald:${id}`)).groups[0].track.length,
        config.id,
      ),
    )
    .toBe(2);
  await page.locator("#scan").click();
  await page.locator("details").evaluate((e) => (e.open = true));
  await page.locator("#manual-code").fill(config.stations[0].code);
  await page.getByRole("button", { name: "Code prüfen" }).click();
  await page.locator("#continue").click();
  await expect(page.locator(".station-marker")).toHaveCount(2);
  await expect(page.locator(".station-tile")).toHaveCount(2);
  await page.getByRole("button", { name: "Unser Team", exact: true }).click();
  await expect(page.locator("#route-distance")).not.toHaveText("0.00 km");
  await page.getByRole("button", { name: "Unsere Route ansehen" }).click();
  await expect(page.locator("#route-map")).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Route als GPX herunterladen" })
    .click();
  expect((await download).suggestedFilename()).toBe("waldabenteuer-route.gpx");
});
