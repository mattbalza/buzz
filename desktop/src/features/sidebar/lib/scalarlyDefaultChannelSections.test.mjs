import assert from "node:assert/strict";
import test from "node:test";

import { buildScalarlyDefaultSectionStore } from "./scalarlyDefaultChannelSections.ts";

function channel(id, description, channelType = "stream") {
  return { id, description, channelType };
}

test("seeds visible Scalarly streams into Internal and Clients", () => {
  const store = buildScalarlyDefaultSectionStore(
    [
      channel("general", "Team coordination"),
      channel("client", "Acme — client conversation, inbound email and calls"),
      channel("forum", "Client conversation, inbound email and calls", "forum"),
    ],
    "wss://buzz.scalarly.org",
  );

  assert.deepEqual(store?.sections, [
    { id: "scalarly-internal", name: "Internal", order: 0 },
    { id: "scalarly-clients", name: "Clients", order: 1 },
  ]);
  assert.deepEqual(store?.assignments, {
    general: "scalarly-internal",
    client: "scalarly-clients",
  });
});

test("does not seed another Buzz community", () => {
  assert.equal(
    buildScalarlyDefaultSectionStore(
      [channel("general", "Team coordination")],
      "wss://relay.example.com",
    ),
    null,
  );
});
