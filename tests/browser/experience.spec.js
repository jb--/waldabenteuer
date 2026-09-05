import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile("public/hunt.json", "utf8"));
test("empty hint stays an active mission, large map closes with Escape and stale GPS is removed", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 28.421,
    longitude: -16.378,
    accuracy: 7,
  });
  const c = structuredClone(config);
  c.stations[0].hint = "";
  await page.route("**/hunt.json", (r) => r.fulfill({ json: c }));
  await page.goto("/");
  await expect(page.locator("#next-hint")).toContainText(
    "haltet nach einem QR-Code Ausschau",
  );
  await page.getByRole("button", { name: "Karte groß anzeigen" }).click();
  await expect(page.locator(".map-card")).toHaveClass(/is-expanded/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-card")).not.toHaveClass(/is-expanded/);
  await page.locator("#locate").click();
  await expect(page.locator(".gps-marker")).toHaveCount(1);
  await context.setGeolocation({
    latitude: 28.5,
    longitude: -16.4,
    accuracy: 7,
  });
  await expect(page.locator("#locate")).toContainText("Außerhalb");
  await expect(page.locator(".gps-marker")).toHaveCount(0);
  await page
    .getByRole("button", { name: "So funktioniert die Schatzsuche" })
    .click();
  await expect(
    page.getByRole("heading", { name: "So findet ihr den Schatz." }),
  ).toBeVisible();
});
test("celebration, screen wake lock and downloadable certificate work offline", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.wakeCount = 0;
    window.releaseCount = 0;
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: async () => {
          window.wakeCount++;
          const lock = new EventTarget();
          lock.release = async () => {
            window.releaseCount++;
            lock.dispatchEvent(new Event("release"));
          };
          return lock;
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#offline-badge")).toHaveText("Offline bereit");
  await context.setOffline(true);
  await page.locator("#start").click();
  await page.locator("#group-input").fill("Die wilden Waldhelden");
  await page.getByRole("button", { name: "Jetzt loslaufen" }).click();
  await expect.poll(() => page.evaluate(() => window.wakeCount)).toBe(1);
  for (const station of config.stations) {
    await page.locator("#scan").click();
    await page.locator("details").evaluate((e) => (e.open = true));
    await page.locator("#manual-code").fill(station.code);
    await page.getByRole("button", { name: "Code prüfen" }).click();
    await expect(page.locator(".success-dialog")).toBeVisible();
    await page.locator("#continue").click();
  }
  await expect.poll(() => page.evaluate(() => window.releaseCount)).toBe(1);
  await expect(page.locator(".achievement.earned")).toHaveCount(3);
  await page.getByRole("button", { name: "Eure Urkunde", exact: true }).click();
  await expect(page.locator(".certificate-preview")).toContainText(
    "Die wilden Waldhelden",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Urkunde herunterladen" }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe("waldhelden-urkunde.svg");
  expect(await readFile(await file.path(), "utf8")).toContain(
    "Die wilden Waldhelden",
  );
  await page.screenshot({
    path: "test-results/certificate.png",
    fullPage: true,
  });
});
test("mobile scan shortcut and success feedback remain accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#start").click();
  await page.getByRole("button", { name: "Jetzt loslaufen" }).click();
  await expect(page.locator("#mobile-scan-dock")).toBeVisible();
  await page.locator("#dock-scan").click();
  await expect(
    page.getByRole("heading", { name: "QR-Code scannen" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.screenshot({
    path: "test-results/mobile-adventure.png",
    fullPage: true,
  });
});
