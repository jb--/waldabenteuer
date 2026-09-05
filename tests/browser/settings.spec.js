import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const base = JSON.parse(await readFile("public/hunt.json", "utf8"));
async function useConfig(page, config) {
  await page.route("**/hunt.json", (r) => r.fulfill({ json: config }));
  await page.goto("/");
  await expect(page.locator("#offline-badge")).toHaveText("Offline bereit");
  await page.evaluate(async (c) => {
    const key = (await caches.keys()).find((k) =>
      k.startsWith("waldabenteuer-"),
    );
    await (
      await caches.open(key)
    ).put(
      new URL("./hunt.json", location.href),
      new Response(JSON.stringify(c), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }, config);
}
test("untimed password hunt survives offline restart and unlocks only after a correct solution", async ({
  page,
  context,
}) => {
  const config = {
    ...base,
    timing: false,
    progression: "password",
    stationVisibility: "all",
    stations: base.stations.slice(0, 2).map((s) => ({
      ...s,
      challenge: {
        prompt: "Wie heißt der Baum mit den langen Nadeln?",
        answer: "Grüne Pinie",
        hint: "Der Name steckt im Abenteuer.",
      },
    })),
  };
  await useConfig(page, config);
  await expect(page.locator("#timer")).toHaveCount(0);
  await expect(page.locator(".station-marker")).toHaveCount(1);
  await page.locator("#start").click();
  await page.getByRole("button", { name: "Jetzt loslaufen" }).click();
  await page.locator("#scan").click();
  await page.locator("details").evaluate((e) => (e.open = true));
  await page.locator("#manual-code").fill(config.stations[1].code);
  await page.getByRole("button", { name: "Code prüfen" }).click();
  await expect(page.locator("#scan-error")).toContainText("gesperrt");
  await page.locator("#manual-code").fill(config.stations[0].code);
  await page.getByRole("button", { name: "Code prüfen" }).click();
  await expect(page.locator(".challenge-prompt")).toContainText(
    "langen Nadeln",
  );
  await expect(page.locator("#progress-label")).toHaveText("0 / 2 gefunden");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".station-marker")).toHaveCount(1);
  await expect(page.locator("#scan")).toContainText("Aufgabe lösen");
  await page.locator("#scan").click();
  await page.locator("#answer-input").fill("Falsch");
  await page.locator("#answer-form button").click();
  await expect(page.locator("#answer-error")).toContainText("noch nicht");
  await expect(page.locator(".station-marker")).toHaveCount(1);
  await page.locator("#answer-input").fill("  GRÜNE  PINIE ");
  await page.locator("#answer-form button").click();
  await expect(page.locator(".success-dialog")).toBeVisible();
  await page.locator("#continue").click();
  await expect(page.locator(".station-marker")).toHaveCount(2);
  await expect(page.locator("#progress-label")).toHaveText("1 / 2 gefunden");
  await page.locator("#scan").click();
  await page.locator("details").evaluate((e) => (e.open = true));
  await page.locator("#manual-code").fill(config.stations[1].code);
  await page.getByRole("button", { name: "Code prüfen" }).click();
  await expect(page.locator("#progress-label")).toHaveText("1 / 2 gefunden");
  await page.locator("#answer-input").fill("Grüne Pinie");
  await page.locator("#answer-form button").click();
  await page.locator("#continue").click();
  await expect(page.locator(".team-complete")).toBeVisible();
  await expect(page.locator(".team-clock")).toHaveCount(0);
  await expect(page.locator(".team-pace")).toHaveText("In eurem Tempo");
});
test("whole-island option works without network and own region is downloaded and retained locally", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await page.goto("/#/spielleitung");
  await page.locator("#new-draft").click();
  await page.locator("#draft-count").fill("1");
  await page.getByRole("button", { name: "QR-Codes erzeugen" }).click();
  await expect(page.locator("#offline-badge")).toHaveText("Offline bereit");
  await expect(page.locator("#game-timing")).toHaveValue("off");
  await context.setOffline(true);
  await page.locator("#map-region").selectOption("tenerife");
  await expect(page.locator("#gps-status")).toContainText("Teneriffa-Karte", {
    timeout: 15000,
  });
  await page.reload();
  await expect(page.locator("#map-region")).toHaveValue("tenerife");
  await expect(page.locator("#gps-status")).toContainText("Teneriffa-Karte", {
    timeout: 15000,
  });
  await page.locator("#map-region").selectOption("custom");
  await page.locator("#region-lat").fill("52.52");
  await page.locator("#region-lng").fill("13.405");
  await page.locator("#region-radius").fill("2");
  await page.locator("#apply-region").click();
  await expect(page.locator("#region-status")).toContainText("fehlt");
  await context.setOffline(false);
  let requested = false;
  await page.route("https://overpass-api.de/api/interpreter", (route) => {
    requested = true;
    return route.fulfill({
      json: {
        elements: [
          {
            type: "way",
            id: 1,
            tags: { highway: "path" },
            geometry: [
              { lat: 52.51, lon: 13.4 },
              { lat: 52.53, lon: 13.41 },
            ],
          },
        ],
      },
    });
  });
  await page.locator("#prepare-region").click();
  await expect(page.locator("#region-status")).toContainText(
    "offline gespeichert",
  );
  expect(requested).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#region-status")).toContainText(
    "offline gespeichert",
  );
  await expect(page.locator("#map-region")).toHaveValue("custom");
  await page.locator("#game-progression").selectOption("password");
  await expect(page.locator('[data-field="stationVisibility"]')).toBeDisabled();
  await page.locator(".pool-details").evaluate((e) => (e.open = true));
  await page.locator(".pool-details .editor-station").click();
  await page.locator("#station-task").fill("Wie heißt der Baum?");
  await page.locator("#station-answer").fill("Pinie");
  await page
    .getByText("Position ansehen oder manuell eintragen", { exact: true })
    .click();
  await page.locator("#station-lat").fill("52.52");
  await page.locator("#station-lng").fill("13.405");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.locator("#export-hunt").click();
  const download = page.waitForEvent("download");
  await page.locator("#download-hunt").click();
  const out = JSON.parse(await readFile(await (await download).path(), "utf8"));
  expect(out.mapSelection.mode).toBe("custom");
  expect(out.map.center).toEqual([52.52, 13.405]);
  expect(out.timing).toBe(false);
  expect(out.progression).toBe("password");
  expect(out.stations[0].challenge.answer).toBe("Pinie");
});
test("time can be enabled explicitly and the walking trail is visible and restored without a timer", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await useConfig(page, { ...base, timing: false });
  await page.locator("#start").click();
  await page.getByRole("button", { name: "Jetzt loslaufen" }).click();
  await context.setGeolocation({
    latitude: 28.4205,
    longitude: -16.3781,
    accuracy: 5,
  });
  await expect(page.locator("#map")).toHaveAttribute("data-track-points", "1");
  await page.waitForTimeout(5100);
  await context.setGeolocation({
    latitude: 28.4215,
    longitude: -16.3788,
    accuracy: 5,
  });
  await expect(page.locator("#map")).toHaveAttribute("data-track-points", "2");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#map")).toHaveAttribute("data-track-points", "2");
  await expect(page.locator("#timer")).toHaveCount(0);
  await page.locator("#map canvas").first().waitFor();
  await page
    .locator(".map-card")
    .screenshot({ path: "test-results/live-trail.png" });
  await context.setOffline(false);
  await page.evaluate(
    async (c) => {
      c.timing = true;
      const cache = await caches.open(
        (await caches.keys()).find((k) => k.startsWith("waldabenteuer-")),
      );
      await cache.put(
        new URL("./hunt.json", location.href),
        new Response(JSON.stringify(c), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    },
    { ...base, timing: true },
  );
  await page.reload();
  await expect(page.locator("#timer")).toBeVisible();
});

test("print a neutral QR supply before assigning any places or tasks", async ({
  page,
}) => {
  await page.goto("/#/spielleitung");
  await page.locator("#new-draft").click();
  await page.locator("#draft-title").fill("");
  await page.locator("#draft-count").fill("3");
  await page.locator("#create-and-print").click();
  await expect(page.locator(".print-card")).toHaveCount(3);
  await expect(page.locator("#print-now")).toBeEnabled();
  const draft = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("waldabenteuer:admin:v1"));
    return db.drafts.find((d) => d.id === db.active);
  });
  expect(draft.stations.every((s) => s.position === null && !s.challenge)).toBe(
    true,
  );
  expect(new Set(draft.stations.map((s) => s.code)).size).toBe(3);
});
