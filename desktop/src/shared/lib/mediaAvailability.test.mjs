import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyMediaErrorMessage,
  classifyMediaProbe,
  probeMediaAvailability,
} from "./mediaAvailability.ts";

test("gone means gone: 404 and 410 are the retention window closing", () => {
  assert.equal(classifyMediaProbe(404), "expired");
  assert.equal(classifyMediaProbe(410), "expired");
});

test("a range probe answers 206, and that is a file that still exists", () => {
  assert.equal(classifyMediaProbe(200), "available");
  assert.equal(classifyMediaProbe(206), "available");
  assert.equal(classifyMediaProbe(304), "available");
});

test("a fault is never expiry — a denied or broken read may come back", () => {
  assert.equal(classifyMediaProbe(403), "unavailable");
  assert.equal(classifyMediaProbe(429), "unavailable");
  assert.equal(classifyMediaProbe(500), "unavailable");
  assert.equal(classifyMediaProbe(502), "unavailable");
});

test("the status is read out of the relay's own error wording", () => {
  assert.equal(
    classifyMediaErrorMessage("relay returned 404 Not Found"),
    "expired",
  );
  assert.equal(classifyMediaErrorMessage("relay returned 410"), "expired");
  assert.equal(
    classifyMediaErrorMessage("relay returned 500: boom"),
    "unavailable",
  );
});

test("a message with no status in it says nothing about existence", () => {
  assert.equal(
    classifyMediaErrorMessage("relay rate-limited: retry in 30s"),
    null,
  );
  assert.equal(classifyMediaErrorMessage("hash mismatch: abc != def"), null);
  assert.equal(classifyMediaErrorMessage(""), null);
});

test("the probe asks for one byte, so a hit costs nothing to classify", async () => {
  let seen;
  const result = await probeMediaAvailability(
    "https://relay/media/x",
    async (url, init) => {
      seen = { init, url };
      return { status: 206 };
    },
  );
  assert.equal(result, "available");
  assert.equal(seen.url, "https://relay/media/x");
  assert.equal(seen.init.method, "GET");
  assert.equal(seen.init.headers.range, "bytes=0-0");
  assert.equal(seen.init.cache, "no-store");
});

test("a fetch that throws is offline, not expired", async () => {
  const result = await probeMediaAvailability("https://relay/media/x", () => {
    throw new Error("network down");
  });
  assert.equal(result, "unavailable");
});
