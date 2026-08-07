import { expect, test } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const HUDDLE_CHANNEL_ID = "11111111-1111-4111-8111-111111111111";
/** The `general` stream fixture — a channel where agents may be mentioned. */
const HUDDLE_PARENT_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
/** The `alice-tyler` DM fixture. */
const DM_PARENT_ID = "f48efb06-0c93-5025-aac9-2e646bb6bfa8";

const ERP_PUBKEY = "a".repeat(64);
const SEEK_PUBKEY = "b".repeat(64);
const MANAGED_PUBKEY = "c".repeat(64);

const ADD_RESULT = {
  ephemeral_added: true,
  parent_added: true,
  parent_error: null,
};

function huddleSeed(parentChannelId: string) {
  return {
    parentChannelId,
    ephemeralChannelId: HUDDLE_CHANNEL_ID,
    members: [
      { pubkey: TEST_IDENTITIES.tyler.pubkey, role: "member" as const },
    ],
    transcriptionEnabled: false,
  };
}

/** @erp: a server-side team agent that may answer in the huddle's parent. */
const ERP_AGENT = {
  pubkey: ERP_PUBKEY,
  name: "erp",
  agentType: "acp",
  channelNames: ["general"],
  respondTo: "anyone" as const,
};

/** @seek: same kind of agent, but scoped to a channel this huddle is not in. */
const SEEK_AGENT = {
  pubkey: SEEK_PUBKEY,
  name: "seek",
  agentType: "acp",
  channelNames: ["random"],
  respondTo: "anyone" as const,
};

async function commandLog(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __BUZZ_E2E_COMMAND_LOG__?: Array<{ command: string }>;
        }
      ).__BUZZ_E2E_COMMAND_LOG__ ?? [],
  );
}

test("the team's server-side agents can be added to a channel huddle", async ({
  page,
}) => {
  await installMockBridge(page, {
    addAgentToHuddleResult: ADD_RESULT,
    huddle: huddleSeed(HUDDLE_PARENT_ID),
    managedAgents: [
      { pubkey: MANAGED_PUBKEY, name: "scribe", status: "running" },
    ],
    relayAgents: [ERP_AGENT, SEEK_AGENT],
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Add agent to huddle" }).click();

  const dialog = page.getByTestId("add-huddle-agent-dialog");
  await expect(dialog).toBeVisible();

  const erp = dialog.getByRole("button", { name: /erp/ });
  await expect(erp).toBeVisible();
  await expect(erp).toHaveAttribute("data-agent-source", "remote");
  await expect(erp).toContainText(/team/i);

  // A managed agent is still offered, and still carries its own lifecycle.
  await expect(dialog.getByRole("button", { name: /scribe/ })).toHaveAttribute(
    "data-agent-source",
    "managed",
  );

  // @seek can only respond in `random`, so this huddle must not offer it —
  // the picker may never surface an agent the user could not have @mentioned
  // in the parent channel.
  await expect(dialog.getByRole("button", { name: /seek/ })).toHaveCount(0);
});

test("adding a server-side agent never tries to start a process", async ({
  page,
}) => {
  await installMockBridge(page, {
    addAgentToHuddleResult: ADD_RESULT,
    huddle: huddleSeed(HUDDLE_PARENT_ID),
    relayAgents: [ERP_AGENT],
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Add agent to huddle" }).click();

  const dialog = page.getByTestId("add-huddle-agent-dialog");
  await dialog.getByRole("button", { name: /erp/ }).click();
  await expect(dialog).toBeHidden();

  // Nothing on this desktop owns @erp's process: it runs on the server under
  // its own identity. Adding it is a membership event and nothing more, so a
  // start (or a rollback stop) would be addressing a process that isn't ours.
  const commands = (await commandLog(page)).map((entry) => entry.command);
  expect(commands).toContain("add_agent_to_huddle");
  expect(commands).not.toContain("start_managed_agent");
  expect(commands).not.toContain("stop_managed_agent");
});

test("a huddle started from a DM offers no agents at all", async ({ page }) => {
  await installMockBridge(page, {
    addAgentToHuddleResult: ADD_RESULT,
    huddle: huddleSeed(DM_PARENT_ID),
    relayAgents: [{ ...ERP_AGENT, channelIds: [DM_PARENT_ID] }],
  });

  await page.goto("/");

  // Same rule as DM threads: an agent has to already be a member of the
  // conversation, and there is no way to add one after the fact.
  await expect(
    page.getByRole("button", { name: "Add agent to huddle" }),
  ).toHaveCount(0);
});
