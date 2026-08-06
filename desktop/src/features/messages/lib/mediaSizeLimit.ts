/**
 * The 10 MB attachment ceiling, and the copy shown when a file exceeds it.
 *
 * The relay enforces this for real (`BUZZ_MAX_{IMAGE,GIF,VIDEO,FILE}_BYTES`);
 * this module exists so the client can say something useful about it. Two
 * jobs, deliberately in one place:
 *
 *   - a pre-flight check, so a 400 MB video is refused instantly instead of
 *     after the user waits out a transfer the relay was always going to reject;
 *   - a mapper for the relay's rejection, as the backstop for the upload paths
 *     that hand their bytes straight to Rust and never see a `File`.
 *
 * Keep `MEDIA_MAX_BYTES` in step with the relay's env vars. A client ceiling
 * *below* the relay's is harmless (the relay simply never sees the request);
 * a client ceiling *above* it just falls through to the mapper below.
 */

/** 10 MiB — matches `BUZZ_MAX_{IMAGE,GIF,VIDEO,FILE}_BYTES` on the relay. */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export const MEDIA_TOO_LARGE_MESSAGE =
  "That file is over the 10 MB limit for Buzz attachments. Upload it to Google Drive and share the link here instead.";

/**
 * Two different 413s reach the client and both mean the same thing to a user:
 *
 *   - `MediaError::FileTooLarge` from the upload handler, which arrives as
 *     `relay returned 413 Payload Too Large: file too large: N bytes (max M)`;
 *   - tower-http's `RequestBodyLimitLayer` rejecting the request before the
 *     handler runs, which has no JSON body and so arrives as just
 *     `relay returned 413 Payload Too Large`.
 *
 * Matched on the status phrase rather than a bare `413`, which would also hit
 * a hash or a byte count that happens to contain those digits.
 */
const TOO_LARGE_PATTERNS: readonly RegExp[] = [
  /payload too large/i,
  /file too large/i,
];

export function isTooLargeError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  const text = err instanceof Error ? err.message : String(err);
  return TOO_LARGE_PATTERNS.some((pattern) => pattern.test(text));
}

/** The message to show for a failed upload — Drive copy if it was too large. */
export function formatUploadError(err: unknown): string {
  return isTooLargeError(err) ? MEDIA_TOO_LARGE_MESSAGE : String(err);
}

/** Split a batch into what may be uploaded and what is over the ceiling. */
export function partitionBySize<T extends { size: number }>(
  files: readonly T[],
): { accepted: T[]; oversize: T[] } {
  return {
    accepted: files.filter((file) => file.size <= MEDIA_MAX_BYTES),
    oversize: files.filter((file) => file.size > MEDIA_MAX_BYTES),
  };
}
