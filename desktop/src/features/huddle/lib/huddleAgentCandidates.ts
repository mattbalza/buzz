import {
  getMentionableAgentPubkeys,
  isAgentMentionChannelType,
} from "@/features/agents/lib/agentAutocompleteEligibility";
import type { RelayAgent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

/**
 * An agent the huddle picker may offer.
 *
 * `managed` agents are ones this desktop owns a process (or deployment) for, so
 * it can start and stop them. `remote` agents are the team's server-side
 * identities — @erp, @codex, @claude, @seek — which the relay's agent directory
 * (kind:10100) advertises. We can add a remote agent to a huddle because that
 * is a kind:9000 membership event addressed to its pubkey, but we cannot start,
 * stop or roll one back: nothing here owns its lifecycle.
 */
export type HuddleAgentCandidate = {
  pubkey: string;
  name: string;
  avatarUrl: string | null;
  /** Present only for managed agents; drives start/stop and rollback. */
  managed: ManagedHuddleAgent | null;
};

export type ManagedHuddleAgent = {
  status: string;
  isLocal: boolean;
};

type ManagedAgentInput = {
  pubkey: string;
  name: string;
  status: string;
  avatar_url: string | null;
  backend: { type: string };
};

/**
 * Whether the huddle's parent channel is one where agents may be summoned at
 * all. Huddles started from a DM are excluded for the same reason DM threads
 * are: an agent has to already be a member of the conversation, and there is no
 * way to add one to a DM after the fact.
 *
 * A huddle with no parent channel (`null`, e.g. a huddle whose parent is not in
 * the local channel list yet) keeps the picker — the backend still validates
 * the add, and hiding the control on missing data would silently remove a
 * working feature during a cold start.
 */
export function huddleAllowsAgents(
  parentChannelType: string | null | undefined,
) {
  if (parentChannelType === null || parentChannelType === undefined)
    return true;
  return isAgentMentionChannelType(parentChannelType);
}

/**
 * The agents this huddle may add, as one list: everything this desktop manages,
 * plus every relay agent that is allowed to respond in the huddle's parent
 * channel. Already-present agents are removed.
 *
 * The relay half is gated by exactly the same eligibility rule as an @mention
 * in that channel (`getMentionableAgentPubkeys` with a `channel` scope), so the
 * picker can never offer an agent the user could not have summoned by typing.
 */
export function buildHuddleAgentCandidates({
  currentAgentPubkeys,
  currentPubkey,
  managedAgents,
  parentChannelId,
  relayAgents,
}: {
  currentAgentPubkeys: readonly string[];
  currentPubkey?: string | null;
  managedAgents: readonly ManagedAgentInput[];
  parentChannelId: string | null;
  relayAgents: readonly RelayAgent[] | undefined;
}): HuddleAgentCandidate[] {
  const already = new Set(currentAgentPubkeys.map(normalizePubkey));
  const candidates = new Map<string, HuddleAgentCandidate>();

  for (const agent of managedAgents) {
    const pubkey = normalizePubkey(agent.pubkey);
    if (already.has(pubkey)) continue;
    candidates.set(pubkey, {
      pubkey: agent.pubkey,
      name: agent.name,
      avatarUrl: agent.avatar_url,
      managed: {
        status: agent.status,
        isLocal: agent.backend.type === "local",
      },
    });
  }

  // Without a parent channel there is no channel to scope eligibility to, and
  // `community` scope would offer agents that cannot speak here. Managed agents
  // still stand on their own.
  if (!parentChannelId) return [...candidates.values()];

  const eligible = getMentionableAgentPubkeys({
    currentPubkey,
    eligibilityScope: { type: "channel", channelId: parentChannelId },
    managedAgentPubkeys: [],
    relayAgents,
    sharedChannelIds: new Set([parentChannelId]),
  });

  for (const agent of relayAgents ?? []) {
    const pubkey = normalizePubkey(agent.pubkey);
    if (already.has(pubkey) || candidates.has(pubkey)) continue;
    if (!eligible.has(pubkey)) continue;
    candidates.set(pubkey, {
      pubkey: agent.pubkey,
      name: agent.name,
      avatarUrl: null,
      managed: null,
    });
  }

  return [...candidates.values()];
}
