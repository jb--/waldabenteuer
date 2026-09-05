import { test, expect } from "@playwright/test";
test("offline unsorted QR pool survey, backup, export and print", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 28.421,
    longitude: -16.378,
    accuracy: 7,
  });
  await page.goto("/#/spielleitung");
  await page
    .getByRole("button", { name: "Neues Abenteuer", exact: true })
    .click();
  await page.locator("#draft-title").fill("Der wilde QR-Stapel");
  await page.locator("#draft-count").fill("12");
  await page
    .getByRole("button", { name: "QR-Codes erzeugen", exact: true })
    .click();
  await expect(page.locator(".editor-station")).toHaveCount(12);
  await expect(page.locator("#offline-badge")).toHaveText("Offline bereit", {
    timeout: 15000,
  });
  await page.locator('[data-field="stationVisibility"]').selectOption("next");
  await page.getByRole("button", { name: "Vorratskarten drucken" }).click();
  await expect(page.locator(".print-card")).toHaveCount(12);
  await expect(page.locator(".print-card h2").first()).toHaveText(
    "Hier wartet ein Abenteuer!",
  );
  const codes = await page.locator(".printed-code").allTextContents();
  expect(new Set(codes).size).toBe(12);
  await page.getByRole("button", { name: "Zurück zum Entwurf" }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-field="title"]')).toHaveValue(
    "Der wilde QR-Stapel",
  );
  const selected = [codes[8], codes[1]];
  for (const [i, code] of selected.entries()) {
    await context.setGeolocation({
      latitude: 28.421 + i * 0.001,
      longitude: -16.378,
      accuracy: 7,
    });
    await page
      .getByRole("button", { name: "Aufgehängten Code scannen" })
      .click();
    await page.locator("dialog details").evaluate((el) => (el.open = true));
    await page.locator("#admin-code").fill(code);
    await page.getByRole("button", { name: "Code zuordnen" }).click();
    await expect(page.locator("#measurement")).toContainText("7 m");
    await page.getByRole("button", { name: "Position hier speichern" }).click();
  }
  await expect(page.locator(".editor-station").first()).toContainText(
    selected[0],
  );
  await expect(page.locator(".editor-station").nth(1)).toContainText(
    selected[1],
  );
  await expect(page.locator(".survey-panel .badge")).toHaveText(
    "2 / 12 platziert",
  );
  await page.locator(".editor-station").first().click();
  await page.locator("#station-name").fill("Die geheime Pinie");
  await page.locator("#station-title").fill("Ihr habt die Pinie gefunden!");
  await page
    .locator("#station-message")
    .fill("Juhu, die erste Spur ist entdeckt.");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await page
    .getByRole("button", { name: "Spiel exportieren", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "hunt.json herunterladen" }).click();
  const downloaded = await pending;
  const fs = await import("node:fs/promises");
  const exported = JSON.parse(
    await fs.readFile(await downloaded.path(), "utf8"),
  );
  expect(exported.stations).toHaveLength(2);
  expect(exported.stations.map((s) => s.code)).toEqual(selected);
  expect(exported.stations[0].name).toBe("Die geheime Pinie");
  expect(exported.stationVisibility).toBe("next");
  expect(exported.map.bounds[0][0]).toBeLessThan(28.421);
  expect(exported.map.bounds[1][0]).toBeGreaterThan(28.422);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.reload();
  await expect(page.locator(".survey-panel .badge")).toHaveText(
    "2 / 12 platziert",
  );
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1100, height: 1200 });
  await page.screenshot({ path: "test-results/admin.png", fullPage: true });
});
test("admin GPS denial never assigns a false position", async ({ page }) => {
  await page.goto("/#/spielleitung");
  await page
    .getByRole("button", { name: "Neues Abenteuer", exact: true })
    .click();
  await page.locator("#draft-count").fill("1");
  await page.getByRole("button", { name: "QR-Codes erzeugen" }).click();
  await page.locator(".pool-details summary").click();
  await page.locator(".editor-station").click();
  await page
    .getByRole("button", { name: "Diese Station hier mit GPS erfassen" })
    .click();
  await expect(page.locator("#measurement")).toContainText(
    "Standortzugriff fehlt",
  );
  await expect(page.locator("#save-position")).toBeDisabled();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator(".survey-panel .badge")).toHaveText(
    "0 / 1 platziert",
  );
});
