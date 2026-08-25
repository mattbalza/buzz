/**
 * Search-param keys the home inbox owns in the URL.
 *
 * `useHistorySearchState` needs the full set so it can replace the inbox's own
 * params without disturbing anyone else's.
 */
export const INBOX_SEARCH_KEYS = [
  "item",
  "profile",
  "profileTab",
  "profileView",
] as const;
