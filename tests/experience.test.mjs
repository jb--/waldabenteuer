import { test } from "node:test";
import assert from "node:assert/strict";
import { certificateSvg } from "../src/experience.js";
test("certificate requires completion and escapes team and hunt names", () => {
  const c = { title: "Pinien & <Wald>", stations: [{ id: "a" }] },
    g = {
      name: "<script>Team</script>",
      started: 1000,
      finished: null,
      found: {},
    };
  assert.throws(() => certificateSvg(c, g));
  g.finished = 60000;
  assert.throws(() => certificateSvg(c, g));
  g.found.a = {};
  const svg = certificateSvg(c, g);
  assert.ok(svg.includes("&lt;script&gt;Team&lt;/script&gt;"));
  assert.ok(svg.includes("Pinien &amp; &lt;Wald&gt;"));
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("00:00:59"));
});
