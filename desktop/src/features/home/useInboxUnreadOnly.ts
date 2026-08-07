import * as React from "react";

/**
 * Whether the home inbox is filtered to unread, remembered across restarts.
 *
 * The inbox is a queue, so it opens on what is still owed: unread-only is the
 * default, not "all". It used to reset to "all" on every mount, which meant
 * re-flicking the filter on every launch and reading past everything already
 * handled to find the one thing that wasn't.
 *
 * `localStorage`, not `sessionStorage` — the list width next door is a
 * per-window layout preference, but which mail you consider outstanding is not
 * something to re-decide each time the app starts.
 */
const INBOX_UNREAD_ONLY_STORAGE_KEY = "buzz.desktop.home-inbox-unread-only";
const INBOX_UNREAD_ONLY_DEFAULT = true;

type ReadableStorage = Pick<Storage, "getItem">;

/**
 * The stored choice, or the default when there isn't one.
 *
 * Anything that is not exactly the string `"false"` reads as the default, so a
 * corrupt or half-written value can never silently hide unread mail.
 */
export function readStoredInboxUnreadOnly(
  storage: ReadableStorage | undefined,
): boolean {
  if (!storage) {
    return INBOX_UNREAD_ONLY_DEFAULT;
  }

  try {
    const raw = storage.getItem(INBOX_UNREAD_ONLY_STORAGE_KEY);
    if (raw === null) {
      return INBOX_UNREAD_ONLY_DEFAULT;
    }
    return raw !== "false";
  } catch {
    // Storage can throw outright (disabled, quota, a locked profile). An
    // unreadable preference is the same as an unset one.
    return INBOX_UNREAD_ONLY_DEFAULT;
  }
}

export function useInboxUnreadOnly() {
  const [unreadOnly, setUnreadOnly] = React.useState<boolean>(() =>
    readStoredInboxUnreadOnly(
      typeof window === "undefined" ? undefined : window.localStorage,
    ),
  );

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        INBOX_UNREAD_ONLY_STORAGE_KEY,
        String(unreadOnly),
      );
    } catch {
      // Ignore storage failures and keep the choice for this session.
    }
  }, [unreadOnly]);

  return [unreadOnly, setUnreadOnly] as const;
}
