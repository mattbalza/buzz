import * as React from "react";

import type { Channel } from "@/shared/api/types";
import type { ChannelSectionStore } from "./channelSectionsStorage";
import {
  buildScalarlyDefaultSectionStore,
  hasSeededScalarlyDefaultSections,
  markScalarlyDefaultSectionsSeeded,
} from "./scalarlyDefaultChannelSections";

type ScalarlyDefaultSectionOptions = {
  channels: readonly Channel[];
  pubkey: string | undefined;
  relayUrl: string | undefined;
  isReady: boolean;
  isLoading: boolean;
  sectionCount: number;
  seedEmptyStore: (next: ChannelSectionStore) => boolean;
};

export function useScalarlyDefaultChannelSections({
  channels,
  pubkey,
  relayUrl,
  isReady,
  isLoading,
  sectionCount,
  seedEmptyStore,
}: ScalarlyDefaultSectionOptions): void {
  React.useEffect(() => {
    if (!pubkey || !relayUrl || !isReady || isLoading) return;
    if (sectionCount > 0) {
      markScalarlyDefaultSectionsSeeded(pubkey, relayUrl);
      return;
    }
    if (hasSeededScalarlyDefaultSections(pubkey, relayUrl)) return;
    const defaults = buildScalarlyDefaultSectionStore(channels, relayUrl);
    if (defaults && seedEmptyStore(defaults)) {
      markScalarlyDefaultSectionsSeeded(pubkey, relayUrl);
    }
  }, [
    channels,
    isLoading,
    isReady,
    pubkey,
    relayUrl,
    sectionCount,
    seedEmptyStore,
  ]);
}
