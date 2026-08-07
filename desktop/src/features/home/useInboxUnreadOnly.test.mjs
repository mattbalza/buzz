import assert from "node:assert/strict";
import test from "node:test";

import { readStoredInboxUnreadOnly } from "./useInboxUnreadOnly.ts";

const KEY = "buzz.desktop.home-inbox-unread-only";

function storage(values) {
  return {
    getItem(key) {
      return key in values ? values[key] : null;
    },
  };
}

test("a first launch opens on unread, not on everything", () => {
  assert.equal(readStoredInboxUnreadOnly(storage({})), true);
});

test("turning the filter off is remembered", () => {
  assert.equal(readStoredInboxUnreadOnly(storage({ [KEY]: "false" })), false);
});

test("turning it back on is remembered", () => {
  assert.equal(readStoredInboxUnreadOnly(storage({ [KEY]: "true" })), true);
});

test("a corrupt value falls back to unread rather than hiding mail", () => {
  assert.equal(readStoredInboxUnreadOnly(storage({ [KEY]: "" })), true);
  assert.equal(readStoredInboxUnreadOnly(storage({ [KEY]: "nope" })), true);
});

test("storage that throws is the same as storage with nothing in it", () => {
  const hostile = {
    getItem() {
      throw new Error("storage is disabled");
    },
  };
  assert.equal(readStoredInboxUnreadOnly(hostile), true);
});

test("no storage at all (SSR, locked profile) still yields a usable default", () => {
  assert.equal(readStoredInboxUnreadOnly(undefined), true);
});
