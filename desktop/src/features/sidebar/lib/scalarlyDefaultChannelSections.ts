import type { Channel } from "@/shared/api/types";
import type { ChannelSectionStore } from "./channelSectionsStorage";

const SCALARLY_RELAY_HOST = "buzz.scalarly.org";
const CLIENT_CHANNEL_MARKER = "client conversation, inbound email and calls";
const SEED_KEY_PREFIX = "buzz-scalarly-default-sections.v1";

type SectionChannel = Pick<Channel, "id" | "description" | "channelType">;

function scalarlyRelayScope(relayUrl: string | undefined): string | null {
  if (!relayUrl) return null;
  try {
    const url = new URL(relayUrl);
    return url.hostname.toLowerCase() === SCALARLY_RELAY_HOST
      ? `${url.protocol.toLowerCase()}//${SCALARLY_RELAY_HOST}`
      : null;
  } catch {
    return null;
  }
}

export function buildScalarlyDefaultSectionStore(
  channels: readonly SectionChannel[],
  relayUrl: string | undefined,
): ChannelSectionStore | null {
  if (!scalarlyRelayScope(relayUrl)) return null;

  const sections = [
    { id: "scalarly-internal", name: "Internal", order: 0 },
    { id: "scalarly-clients", name: "Clients", order: 1 },
  ];
  const assignments = Object.fromEntries(
    channels
      .filter((channel) => channel.channelType === "stream")
      .map((channel) => [
        channel.id,
        channel.description.toLowerCase().includes(CLIENT_CHANNEL_MARKER)
          ? "scalarly-clients"
          : "scalarly-internal",
      ]),
  );

  return { version: 1, sections, assignments };
}

function seedKey(pubkey: string, relayScope: string): string {
  return `${SEED_KEY_PREFIX}:${pubkey}:${encodeURIComponent(relayScope)}`;
}

export function hasSeededScalarlyDefaultSections(
  pubkey: string,
  relayUrl: string | undefined,
): boolean {
  const relayScope = scalarlyRelayScope(relayUrl);
  if (!relayScope) return true;
  try {
    return window.localStorage.getItem(seedKey(pubkey, relayScope)) === "1";
  } catch {
    return false;
  }
}

export function markScalarlyDefaultSectionsSeeded(
  pubkey: string,
  relayUrl: string | undefined,
): void {
  const relayScope = scalarlyRelayScope(relayUrl);
  if (!relayScope) return;
  try {
    window.localStorage.setItem(seedKey(pubkey, relayScope), "1");
  } catch {
    // A failed marker only means the idempotent seed check may run again.
  }
}
