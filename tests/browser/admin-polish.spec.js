import { test, expect } from "@playwright/test";

test("field mode preserves map and GPS, protects text and extends printed pool", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 28.421,
    longitude: -16.378,
    accuracy: 7,
  });
  await page.goto("/#/spielleitung");
  await page.locator("#new-draft").click();
  await page.locator("#draft-count").fill("3");
  await page
    .getByRole("button", { name: "QR-Codes erzeugen", exact: true })
    .click();
  await expect(page.locator(".pool-details")).not.toHaveAttribute("open");
  const original = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("waldabenteuer:admin:v1"),
    ).drafts[0].stations.map((s) => s.code),
  );
  await page.locator("#field-mode").click();
  await expect(page.locator("#gps-status")).toContainText("GPS aktiv");
  await page
    .locator("#survey-map")
    .evaluate((el) => (el.dataset.retained = "yes"));
  await page.locator("#survey-scan").click();
  await page.locator("dialog details").evaluate((el) => (el.open = true));
  await page.locator("#admin-code").fill(original[1]);
  await page.locator("#admin-code-form button").click();
  await context.setGeolocation({
    latitude: 28.4211,
    longitude: -16.378,
    accuracy: 7,
  });
  await expect(page.locator("#save-position")).toBeEnabled();
  await page.locator("#save-position").click();
  await expect(page.locator("#survey-map")).toHaveAttribute(
    "data-retained",
    "yes",
  );
  await expect(page.locator("#gps-status")).toContainText("GPS aktiv");
  await page.locator(".station-edit-row .editor-station").click();
  await page.locator("#station-title").fill("Mein Geheimnis");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator(".dialog-close").click();
  await expect(page.locator("#station-title")).toHaveValue("Mein Geheimnis");
  await page.locator("#station-name").fill("   ");
  await page.locator("#station-gps").click();
  await expect(page.locator("#edit-error")).toContainText(
    "dürfen nicht leer sein",
  );
  await page.locator("#station-name").fill("Pinie");
  await page.locator("#edit-station button").click();
  await page.locator("#add-cards").click();
  await page.locator("#extra-count").fill("2");
  await page.locator("#add-cards-form button").click();
  await expect(page.locator(".print-card")).toHaveCount(2);
  await expect(page.locator("#print-now")).toBeEnabled();
  const codes = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("waldabenteuer:admin:v1"),
    ).drafts[0].stations.map((s) => s.code),
  );
  expect(codes.slice(0, 3)).toEqual(original);
  expect(codes).toHaveLength(5);
});

test("reorder and return-to-pool are explicit, and damaged drafts stay recoverable", async ({
  page,
}) => {
  const { createDraft, assignOrder } = await import("../../src/admin-model.js");
  const d = createDraft("Testwald", 3);
  for (const s of d.stations.slice(0, 2)) {
    s.position = [28.42, -16.38];
    assignOrder(d, s);
  }
  const damaged = { ...structuredClone(d), id: "broken", title: "Kaputt" };
  damaged.stations[0].name = "";
  await page.addInitScript(
    (data) => {
      if (!localStorage.getItem("waldabenteuer:admin:v1"))
        localStorage.setItem("waldabenteuer:admin:v1", JSON.stringify(data));
    },
    { active: d.id, drafts: [d, damaged] },
  );
  await page.goto("/#/spielleitung");
  await expect(page.locator("#recovery-backup")).toBeVisible();
  await page
    .locator(`[data-move="${d.stations[1].id}"][data-offset="-1"]`)
    .click();
  await expect(page.locator(".station-edit-row").first()).toContainText(
    d.stations[1].code,
  );
  await page.locator(".station-edit-row .editor-station").first().click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#return-pool").click();
  await expect(page.locator("#edit-station")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#return-pool").click();
  await expect(page.locator(".survey-panel .badge")).toHaveText(
    "1 / 3 platziert",
  );
  await page.locator("#show-print").click();
  await expect(page.locator("#print-now")).toBeEnabled();
  await page.locator("#print-selection").selectOption("free");
  await expect(page.locator(".print-card:not([hidden])")).toHaveCount(2);
  await page.locator("#back-editor").click();
  await page.reload();
  await expect(page.locator("#recovery-backup")).toBeVisible();
  await expect(page.locator(".survey-panel .badge")).toHaveText(
    "1 / 3 platziert",
  );
});
