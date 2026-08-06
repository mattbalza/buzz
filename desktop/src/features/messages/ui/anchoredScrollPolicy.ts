import type { TimelineMessageDelta } from "@/features/messages/lib/timelineSnapshot";

export function getPinnedCenterDrift({
  contentTop,
  currentContentTop,
}: {
  contentTop: number;
  currentContentTop: number;
}): number | null {
  const drift = currentContentTop - contentTop;
  return Math.abs(drift) > 0.5 ? drift : null;
}

export function shouldIgnorePinnedCenterScroll({
  currentScrollTop,
  expectedScrollTop,
  isWritingScroll,
}: {
  currentScrollTop: number;
  expectedScrollTop: number | null;
  isWritingScroll: boolean;
}): boolean {
  return isWritingScroll || expectedScrollTop === currentScrollTop;
}

// Programmatic bottom pins require the physical floor, not merely the looser
// UI at-bottom threshold used for unread affordances.
const TRUE_BOTTOM_THRESHOLD_PX = 1;

type BottomSettleContainer = Pick<
  HTMLDivElement,
  "scrollHeight" | "clientHeight" | "scrollTop" | "scrollTo"
>;

export function settleProgrammaticBottomPin(
  container: BottomSettleContainer,
): boolean {
  container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
  return (
    container.scrollHeight - container.clientHeight - container.scrollTop <=
    TRUE_BOTTOM_THRESHOLD_PX
  );
}

// Sub-pixel jitter and rounding must not read as the reader taking control.
const SETTLE_RELEASE_THRESHOLD_PX = 2;

/**
 * Decide who moved the scroller while a programmatic bottom pin is settling.
 *
 * Settling grows `scrollHeight` under a held `scrollTop`, so our own pin never
 * moves the position it armed at. A reader who scrolls does move it — and must
 * win, or the settle pass drags them back to the floor and strands the anchor
 * at `at-bottom` for every later reflow to re-snap.
 *
 * A content *shrink* clamps `scrollTop` down without anyone scrolling. That
 * still leaves the view on the floor, so the floor check keeps it a settle.
 */
export function classifyProgrammaticBottomSettle({
  armedScrollTop,
  container,
}: {
  armedScrollTop: number | null;
  container: Omit<BottomSettleContainer, "scrollTo">;
}): "settle" | "user-scroll" {
  if (armedScrollTop === null) return "settle";
  if (
    Math.abs(container.scrollTop - armedScrollTop) <=
    SETTLE_RELEASE_THRESHOLD_PX
  ) {
    return "settle";
  }
  return container.scrollHeight - container.clientHeight - container.scrollTop >
    TRUE_BOTTOM_THRESHOLD_PX
    ? "user-scroll"
    : "settle";
}

export function shouldSettleForSplitPanel({
  isAtBottom,
  splitPanelOpen,
}: {
  isAtBottom: boolean;
  splitPanelOpen: boolean;
}): boolean {
  return isAtBottom && splitPanelOpen;
}

export function shouldSettleVirtualizedBottom({
  isAtBottom,
  messageDelta,
  messagesArrived,
  messagesChanged,
}: {
  isAtBottom: boolean;
  messageDelta: TimelineMessageDelta;
  messagesArrived: number;
  messagesChanged: boolean;
}): boolean {
  return (
    isAtBottom &&
    messageDelta !== "prepend" &&
    (messagesArrived > 0 || messagesChanged)
  );
}
