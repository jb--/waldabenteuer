import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
test("GitHub Pages subdirectory works offline including direct admin entry", async ({
  page,
  context,
}) => {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".geojson": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith("/birthday/")) throw Error();
      const name = url.pathname.slice("/birthday/".length) || "index.html";
      if (name.includes("..")) throw Error();
      res.setHeader(
        "Content-Type",
        types[extname(name)] || "application/octet-stream",
      );
      res.end(await readFile(resolve("dist", name)));
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/birthday/`;
  try {
    await page.goto(url);
    await expect(page.locator("#offline-badge")).toHaveText("Offline bereit");
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".station-marker")).toHaveCount(5);
    await page.goto(url + "#/spielleitung");
    await expect(
      page.getByRole("heading", { name: "Hier beginnt euer Abenteuer." }),
    ).toBeVisible();
    await expect(page.locator("#offline-badge")).toHaveText("Offline bereit");
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("generic QR cards print as exactly one A4 page per card", async ({
  page,
}) => {
  await page.goto("/#/spielleitung");
  await page
    .getByRole("button", { name: "Neues Abenteuer", exact: true })
    .click();
  await page.locator("#draft-count").fill("2");
  await page.getByRole("button", { name: "QR-Codes erzeugen" }).click();
  await page.getByRole("button", { name: "Vorratskarten drucken" }).click();
  await expect(page.locator(".print-card")).toHaveCount(2);
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    path: "test-results/qr-vorrat.pdf",
  });
  expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length).toBe(
    2,
  );
  await page.getByRole("button", { name: "Zurück zum Entwurf" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/admin-mobile.png",
    fullPage: true,
  });
});
