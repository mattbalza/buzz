import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHuddleAgentCandidates,
  huddleAllowsAgents,
} from "./huddleAgentCandidates.ts";

const PARENT = "channel-parent";
const OTHER = "channel-other";

function relayAgent(overrides) {
  return {
    pubkey: "a".repeat(64),
    name: "erp",
    agentType: "acp",
    channels: [],
    channelIds: [PARENT],
    capabilities: [],
    status: "online",
    respondTo: "anyone",
    respondToAllowlist: [],
    ...overrides,
  };
}

function managedAgent(overrides) {
  return {
    pubkey: "b".repeat(64),
    name: "alice",
    status: "stopped",
    avatar_url: null,
    backend: { type: "local" },
    ...overrides,
  };
}

test("huddleAllowsAgents follows the mention rule for channel types", () => {
  assert.equal(huddleAllowsAgents("stream"), true);
  assert.equal(huddleAllowsAgents("forum"), true);
  assert.equal(huddleAllowsAgents("dm"), false);
});

test("huddleAllowsAgents keeps the picker when the parent type is unknown", () => {
  // Cold start: the parent channel may not be in the local list yet. Hiding the
  // control on missing data would silently remove a working feature.
  assert.equal(huddleAllowsAgents(null), true);
  assert.equal(huddleAllowsAgents(undefined), true);
});

test("relay agents that may respond in the parent channel are offered", () => {
  const candidates = buildHuddleAgentCandidates({
    currentAgentPubkeys: [],
    currentPubkey: "c".repeat(64),
    managedAgents: [],
    parentChannelId: PARENT,
    relayAgents: [relayAgent()],
  });

  assert.deepEqual(
    candidates.map((candidate) => [candidate.name, candidate.managed]),
    [["erp", null]],
  );
});

test("relay agents from other channels are not offered", () => {
  const candidates = buildHuddleAgentCandidates({
    currentAgentPubkeys: [],
    currentPubkey: "c".repeat(64),
    managedAgents: [],
    parentChannelId: PARENT,
    relayAgents: [relayAgent({ channelIds: [OTHER] })],
  });

  assert.deepEqual(candidates, []);
});

test("an allowlisted relay agent is offered only to someone on its allowlist", () => {
  const viewer = "c".repeat(64);
  const agent = relayAgent({
    respondTo: "allowlist",
    respondToAllowlist: [viewer],
  });

  assert.equal(
    buildHuddleAgentCandidates({
      currentAgentPubkeys: [],
      currentPubkey: viewer,
      managedAgents: [],
      parentChannelId: PARENT,
      relayAgents: [agent],
    }).length,
    1,
  );

  assert.equal(
    buildHuddleAgentCandidates({
      currentAgentPubkeys: [],
      currentPubkey: "d".repeat(64),
      managedAgents: [],
      parentChannelId: PARENT,
      relayAgents: [agent],
    }).length,
    0,
  );
});

test("managed agents carry their lifecycle, relay agents carry none", () => {
  const candidates = buildHuddleAgentCandidates({
    currentAgentPubkeys: [],
    currentPubkey: "c".repeat(64),
    managedAgents: [managedAgent()],
    parentChannelId: PARENT,
    relayAgents: [relayAgent()],
  });

  const byName = new Map(candidates.map((c) => [c.name, c]));
  assert.deepEqual(byName.get("alice").managed, {
    status: "stopped",
    isLocal: true,
  });
  assert.equal(byName.get("erp").managed, null);
});

test("an agent that is both managed and in the relay directory is listed once, as managed", () => {
  const shared = "e".repeat(64);
  const candidates = buildHuddleAgentCandidates({
    currentAgentPubkeys: [],
    currentPubkey: "c".repeat(64),
    managedAgents: [managedAgent({ pubkey: shared, name: "codex" })],
    parentChannelId: PARENT,
    relayAgents: [relayAgent({ pubkey: shared, name: "codex" })],
  });

  assert.equal(candidates.length, 1);
  assert.notEqual(candidates[0].managed, null);
});

test("agents already in the huddle are dropped, whatever their case", () => {
  const managed = "b".repeat(64);
  const remote = "a".repeat(64);
  const candidates = buildHuddleAgentCandidates({
    currentAgentPubkeys: [managed.toUpperCase(), remote.toUpperCase()],
    currentPubkey: "c".repeat(64),
    managedAgents: [managedAgent({ pubkey: managed })],
    parentChannelId: PARENT,
    relayAgents: [relayAgent({ pubkey: remote })],
  });

  assert.deepEqual(candidates, []);
});

test("no parent channel still offers managed agents but no remote ones", () => {
  // `community` scope would offer agents that cannot speak in this huddle, so
  // the relay half is skipped rather than widened.
  const candidates = buildHuddleAgentCandidates({
    currentAgentPubkeys: [],
    currentPubkey: "c".repeat(64),
    managedAgents: [managedAgent()],
    parentChannelId: null,
    relayAgents: [relayAgent()],
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.name),
    ["alice"],
  );
});
