/**
 * Why an attachment failed to load.
 *
 * Blobs are content-addressed and kept for a bounded window, so a message from
 * last quarter can outlive its own attachment. The `<img>` `error` event says
 * only "this did not load" — it carries no status — and a viewer cannot tell an
 * expired blob from a flapping connection by looking at a broken frame. So on
 * failure we ask the media path directly and classify the answer.
 */
export type MediaAvailability = "available" | "expired" | "unavailable";

/**
 * Classify a media response status.
 *
 * 404 and 410 both mean the bytes are not coming back: the relay answers 404
 * for an absent blob and collapses a cross-tenant read into the same 404 by
 * design, and 410 is what a storage layer returns for something it deleted on
 * purpose. Everything else is either fine (2xx/3xx — a range probe answers
 * 206) or a fault worth retrying, and a retryable fault must never be shown as
 * expiry: telling someone their file is gone when the network merely blinked
 * is the one wrong answer here.
 */
export function classifyMediaProbe(status: number): MediaAvailability {
  if (status === 404 || status === 410) return "expired";
  if (status >= 200 && status < 400) return "available";
  return "unavailable";
}

/**
 * Classify a native media-fetch failure from the message it carries.
 *
 * The file path never loads through the webview — downloads go through the
 * Rust command so they traverse the tunnel — so there is no `<img>` error and
 * no status to read, only the rejection string. `relay_error_message` builds
 * every one of them as `relay returned {status}[: message]`, which is the one
 * stable thing in it; the human half is the relay's wording and may change.
 *
 * Returns `null` when the message carries no status at all: a refused
 * connection, a save-dialog cancellation, a hash mismatch. None of those say
 * anything about whether the file still exists, and guessing expiry from them
 * would retire a message's attachment over a bad minute of network.
 */
export function classifyMediaErrorMessage(
  message: string,
): MediaAvailability | null {
  const match = /relay returned (\d{3})/.exec(message);
  return match ? classifyMediaProbe(Number(match[1])) : null;
}

/**
 * Ask for the first byte of `url` and classify the answer.
 *
 * A one-byte range request rather than a HEAD: the media path is a GET route
 * on both the local proxy and the relay, and 206-or-404 is the same signal for
 * a fraction of the transfer. A thrown fetch (offline, proxy down) is
 * `unavailable`, never expiry.
 *
 * `fetchImpl` is injected for tests; production callers pass nothing.
 */
export async function probeMediaAvailability(
  url: string,
  fetchImpl: typeof fetch | undefined = globalThis.fetch,
): Promise<MediaAvailability> {
  if (!fetchImpl) return "unavailable";
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: { range: "bytes=0-0" },
      method: "GET",
    });
    return classifyMediaProbe(response.status);
  } catch {
    return "unavailable";
  }
}
