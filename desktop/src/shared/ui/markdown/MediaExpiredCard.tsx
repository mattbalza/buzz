import { FileX2 } from "lucide-react";

/**
 * What a message shows once its attachment is past the retention window.
 *
 * Stored blobs are kept for a bounded time, so an old message can outlive its
 * own file. Left alone that reads as a bug — a broken frame, or a download
 * button that fails every time it is pressed. This says what actually
 * happened, keeps the filename so the message still records what was shared,
 * and offers no action, because there is nothing left to fetch.
 */
export function MediaExpiredCard({ filename }: { filename?: string }) {
  return (
    <span
      className="my-1 inline-flex max-w-sm items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-left align-top"
      data-testid="media-expired"
      style={{ borderRadius: "1rem" }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
        <FileX2 className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-muted-foreground">
          Attachment expired
        </span>
        {filename ? (
          <span className="block truncate text-xs text-muted-foreground/80">
            {filename}
          </span>
        ) : null}
      </span>
    </span>
  );
}
