import type { Community } from "@/features/communities/types";
import type { Channel } from "@/shared/api/types";
import {
  useChannelSections,
  type ChannelSection,
} from "@/features/sidebar/lib/useChannelSections";
import { useScalarlyDefaultChannelSections } from "@/features/sidebar/lib/useScalarlyDefaultChannelSections";

export type { ChannelSection };

/**
 * `useChannelSections` with the Scalarly default sidebar sections seeded once
 * per relay, while the section store is still empty.
 *
 * Wrapping keeps the wiring out of `AppSidebar.tsx`, which sits on the
 * 1000-line ratchet — the call there stays a single line.
 */
export function useScalarlySections(
  pubkey: string | undefined,
  community: Community | null | undefined,
  channels: readonly Channel[],
  isLoading: boolean,
): ReturnType<typeof useChannelSections> {
  const store = useChannelSections(pubkey, community?.relayUrl);
  useScalarlyDefaultChannelSections({
    channels,
    pubkey,
    relayUrl: community?.relayUrl,
    isReady: store.isReady,
    isLoading,
    sectionCount: store.sections.length,
    seedEmptyStore: store.seedEmptyStore,
  });
  return store;
}
