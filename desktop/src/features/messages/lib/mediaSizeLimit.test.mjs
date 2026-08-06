import assert from "node:assert/strict";
import test from "node:test";

import {
  MEDIA_MAX_BYTES,
  MEDIA_TOO_LARGE_MESSAGE,
  formatUploadError,
  isTooLargeError,
  partitionBySize,
} from "./mediaSizeLimit.ts";

// ── The ceiling itself ────────────────────────────────────────────────

test("the ceiling is 10 MB, matching the relay's BUZZ_MAX_*_BYTES", () => {
  assert.equal(MEDIA_MAX_BYTES, 10_485_760);
});

test("the message names both the limit and where to put the file instead", () => {
  assert.match(MEDIA_TOO_LARGE_MESSAGE, /10 MB/);
  assert.match(MEDIA_TOO_LARGE_MESSAGE, /Google Drive/);
});

// ── Detecting the relay's rejection ───────────────────────────────────
// Two different 413s reach the client and both must map to the same copy:
// the handler's typed error, and tower-http's body-limit layer rejecting
// the request before the handler ever runs (no JSON body, status only).

test("detects the handler's typed FileTooLarge error", () => {
  assert.equal(
    isTooLargeError(
      "relay returned 413 Payload Too Large: file too large: 12582912 bytes (max 10485760)",
    ),
    true,
  );
});

test("detects the body-limit layer's status-only rejection", () => {
  assert.equal(isTooLargeError("relay returned 413 Payload Too Large"), true);
});

test("detects a thrown Error, not just a string", () => {
  assert.equal(
    isTooLargeError(new Error("relay returned 413 Payload Too Large")),
    true,
  );
});

test("does not fire on unrelated relay failures", () => {
  for (const err of [
    "relay returned 401 Unauthorized: authentication failed",
    "relay returned 415 Unsupported Media Type: disallowed content type",
    "relay rate-limited: retry in 30s",
    "relay unreachable: connection refused",
    "empty upload",
  ]) {
    assert.equal(isTooLargeError(err), false, err);
  }
});

test("does not fire on a hash or byte count that merely contains 413", () => {
  assert.equal(
    isTooLargeError("relay returned 500: upload 413ab9 failed"),
    false,
  );
});

test("survives a null or undefined error without throwing", () => {
  assert.equal(isTooLargeError(null), false);
  assert.equal(isTooLargeError(undefined), false);
});

// ── formatUploadError ─────────────────────────────────────────────────

test("substitutes the Drive copy for a too-large rejection", () => {
  assert.equal(
    formatUploadError("relay returned 413 Payload Too Large"),
    MEDIA_TOO_LARGE_MESSAGE,
  );
});

test("passes every other failure through unchanged", () => {
  assert.equal(
    formatUploadError("relay unreachable: connection refused"),
    "relay unreachable: connection refused",
  );
});

// ── partitionBySize ───────────────────────────────────────────────────

test("splits files at the ceiling, keeping order within each side", () => {
  const files = [
    { name: "a", size: 1 },
    { name: "b", size: MEDIA_MAX_BYTES + 1 },
    { name: "c", size: MEDIA_MAX_BYTES },
    { name: "d", size: MEDIA_MAX_BYTES * 2 },
  ];
  const { accepted, oversize } = partitionBySize(files);
  assert.deepEqual(
    accepted.map((f) => f.name),
    ["a", "c"],
  );
  assert.deepEqual(
    oversize.map((f) => f.name),
    ["b", "d"],
  );
});

test("a file exactly at the ceiling is accepted", () => {
  const { accepted, oversize } = partitionBySize([{ size: MEDIA_MAX_BYTES }]);
  assert.equal(accepted.length, 1);
  assert.equal(oversize.length, 0);
});

test("returns new arrays and never mutates the caller's list", () => {
  const files = [{ size: 1 }, { size: MEDIA_MAX_BYTES + 1 }];
  const snapshot = [...files];
  const { accepted, oversize } = partitionBySize(files);
  assert.deepEqual(files, snapshot);
  assert.notEqual(accepted, files);
  assert.notEqual(oversize, files);
});

test("an empty list yields two empty lists", () => {
  const { accepted, oversize } = partitionBySize([]);
  assert.deepEqual(accepted, []);
  assert.deepEqual(oversize, []);
});
