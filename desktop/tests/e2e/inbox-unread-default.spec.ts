/**
 * The inbox is a queue, so it opens on what is still owed.
 *
 * `unreadOnly` was `React.useState(false)`: every launch reset to "all", so the
 * one thing not yet handled had to be found by reading past everything that
 * already was, and the filter had to be re-flicked each time.
 *
 * Note the bridge helper seeds this preference as explicitly off for every
 * other spec — they assert on specific fixture rows, most of which are read.
 * This spec is the one that opts out and exercises the shipped default.
 */
import { expect, type Page, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

const STORAGE_KEY = "buzz.desktop.home-inbox-unread-only";

async function openInboxOptions(page: Page) {
  await page.getByTestId("inbox-options-trigger").click();
  return page.getByTestId("inbox-unread-only-toggle");
}

test("a first launch shows unread only", async ({ page }) => {
  await installMockBridge(page, undefined, { seedInboxUnreadOnly: false });
  await page.goto("/");

  const toggle = await openInboxOptions(page);
  await expect(toggle).toHaveAttribute("data-state", "checked");
});

test("turning it off is still off after a reload", async ({ page }) => {
  await installMockBridge(page, undefined, { seedInboxUnreadOnly: false });
  await page.goto("/");

  const toggle = await openInboxOptions(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "unchecked");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBe("false");

  await page.reload();

  const toggleAfterReload = await openInboxOptions(page);
  await expect(toggleAfterReload).toHaveAttribute("data-state", "unchecked");
});

test("a stored preference of on survives a reload too", async ({ page }) => {
  await installMockBridge(page, undefined, { seedInboxUnreadOnly: false });
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "true"),
    STORAGE_KEY,
  );
  await page.goto("/");

  const toggle = await openInboxOptions(page);
  await expect(toggle).toHaveAttribute("data-state", "checked");
});
