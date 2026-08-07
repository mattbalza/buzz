/**
 * The shared emoji picker had no background and swallowed the wheel.
 *
 * `EmojiPicker` renders emoji-mart into a bare unclassed `<div>`. Two things
 * that make the picker usable — the `--rgb-background` custom property, and the
 * wheel handler that scrolls the shadow-root list — come from
 * `useEmojiMartThemeVars` and `useEmojiMartStyles`, and only
 * `ProfileAvatarEditor` and `AgentCreationPreview` ever applied them. Those two
 * render emoji-mart directly, so the component that calls itself "the one emoji
 * picker for the whole app" was the only one without them.
 *
 * Unset, `--rgb-background` leaves emoji-mart on its own `theme="auto"`
 * palette, which follows `prefers-color-scheme` rather than Buzz's theme class.
 * Measured here before the fix: a white panel on a white app, inside popovers
 * that deliberately carry `bg-transparent border-0 shadow-none` on the
 * assumption that the picker paints itself. Hence "no background". And a wheel
 * event over a shadow-root list is retargeted to the host, so the browser does
 * not reliably scroll `.scroll`; without the handler the list is stuck on its
 * first category.
 *
 * The panel's height was never the problem — emoji-mart sizes itself — so the
 * height assertion only guards the chain the surface styles introduce.
 *
 * These assertions read the rendered result, not the class list, so they stay
 * true if the styling moves.
 */
import { expect, type Page, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

test.beforeEach(async ({ page }) => {
  await installMockBridge(page);
});

/** The picker element, once emoji-mart has mounted its shadow content. */
async function pickerElement(page: Page) {
  const picker = page.locator("em-emoji-picker").first();
  await picker.waitFor({ state: "attached" });
  await expect
    .poll(async () =>
      picker.evaluate((el) => Boolean(el.shadowRoot?.querySelector(".scroll"))),
    )
    .toBe(true);
  return picker;
}

/** Computed facts about the picker as the user sees it, read through the shadow root. */
async function readPickerSurface(page: Page) {
  const picker = await pickerElement(page);

  return picker.evaluate((el) => {
    const root = el.shadowRoot?.querySelector("#root");
    const rootStyle = root ? getComputedStyle(root) : null;
    return {
      hostHeight: el.getBoundingClientRect().height,
      rootBackground: rootStyle?.backgroundColor ?? "",
      rgbBackground: getComputedStyle(el)
        .getPropertyValue("--rgb-background")
        .trim(),
    };
  });
}

async function openChannel(page: Page) {
  await page.goto("/");
  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
}

test("the composer emoji picker is a panel with a background", async ({
  page,
}) => {
  await openChannel(page);
  await page.getByTestId("composer-emoji-button").click();

  const surface = await readPickerSurface(page);

  expect(surface.hostHeight).toBeGreaterThan(200);
  expect(surface.rgbBackground).not.toBe("");
  expect(surface.rootBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(surface.rootBackground).not.toBe("transparent");
});

test("the composer emoji picker scrolls on the wheel", async ({ page }) => {
  await openChannel(page);
  await page.getByTestId("composer-emoji-button").click();

  const picker = await pickerElement(page);

  // A synthetic wheel event never triggers the browser's own scrolling, so
  // this measures the handler and nothing else — which is the thing that was
  // missing, and what the user felt as "it doesn't scroll".
  const scrolled = await picker.evaluate((el) => {
    const scroll = el.shadowRoot?.querySelector<HTMLElement>(".scroll");
    if (!scroll || scroll.scrollHeight <= scroll.clientHeight) return null;
    scroll.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        composed: true,
        deltaY: 120,
      }),
    );
    return scroll.scrollTop;
  });

  expect(scrolled).not.toBeNull();
  expect(scrolled).toBeGreaterThan(0);
});

test("the reaction emoji picker gets the same panel as the composer's", async ({
  page,
}) => {
  await openChannel(page);

  const message = page.getByTestId("message-row").last();
  await message.hover();
  await message.getByRole("button", { name: "Open reactions" }).click();

  const surface = await readPickerSurface(page);

  expect(surface.hostHeight).toBeGreaterThan(200);
  expect(surface.rootBackground).not.toBe("rgba(0, 0, 0, 0)");
});
