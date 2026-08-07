import { invoke } from "@tauri-apps/api/core";
import { LoaderCircle } from "lucide-react";
import * as React from "react";

import { useRelayAgentsQuery } from "@/features/agents/hooks";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { useIdentityQuery } from "@/shared/api/hooks";
import { Dialog } from "@/shared/ui/dialog";
import { ChooserDialogContent } from "@/shared/ui/chooser-dialog-content";
import type { ManagedAgentBackend } from "@/shared/api/types";

import {
  buildHuddleAgentCandidates,
  type HuddleAgentCandidate,
} from "../lib/huddleAgentCandidates";

type ManagedAgentSummary = {
  pubkey: string;
  name: string;
  status: string;
  avatar_url: string | null;
  backend: ManagedAgentBackend;
};

type AgentAddResult = {
  ephemeral_added: boolean;
  parent_added: boolean;
  parent_error: string | null;
};

type AddAgentDialogProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (pubkey: string) => Promise<AgentAddResult>;
  currentAgentPubkeys: string[];
  /**
   * The huddle's parent channel. Scopes which of the team's server-side agents
   * (@erp, @codex, @claude, @seek) may be offered — exactly the set that could
   * be @mentioned in that channel. `null` narrows the picker to managed agents.
   */
  parentChannelId: string | null;
};

export function AddAgentDialog({
  open,
  onClose,
  onAdd,
  currentAgentPubkeys,
  parentChannelId,
}: AddAgentDialogProps) {
  const [managedAgents, setManagedAgents] = React.useState<
    ManagedAgentSummary[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);

  const identityQuery = useIdentityQuery();
  const relayAgentsQuery = useRelayAgentsQuery({ enabled: open });

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setManagedAgents([]);
    setLoading(true);
    setAdding(null);
    setError(null);
    setWarning(null);

    invoke<ManagedAgentSummary[]>("list_managed_agents")
      .then((nextAgents) => {
        if (!cancelled) setManagedAgents(nextAgents);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("Failed to load agents:", e);
        setError("Could not load agents.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const availableAgents = React.useMemo(
    () =>
      buildHuddleAgentCandidates({
        currentAgentPubkeys,
        currentPubkey: identityQuery.data?.pubkey,
        managedAgents,
        parentChannelId,
        relayAgents: relayAgentsQuery.data,
      }),
    [
      currentAgentPubkeys,
      identityQuery.data?.pubkey,
      managedAgents,
      parentChannelId,
      relayAgentsQuery.data,
    ],
  );

  async function handleAdd(agent: HuddleAgentCandidate) {
    if (adding) return;
    setAdding(agent.pubkey);
    setError(null);
    setWarning(null);
    let startedForAdd = false;
    try {
      // Remote agents run on the server under their own identity. Adding one is
      // a membership event addressed to its pubkey; nothing here owns its
      // process, so there is no start, no stop and no rollback to attempt.
      const managed = agent.managed;
      const needsStart = managed
        ? managed.isLocal
          ? managed.status !== "running"
          : managed.status !== "deployed"
        : false;
      if (needsStart && managed?.isLocal) {
        await invoke("start_managed_agent", { pubkey: agent.pubkey });
        startedForAdd = true;
      }
      const result = await onAdd(agent.pubkey);
      if (needsStart && managed && !managed.isLocal) {
        try {
          await invoke("start_managed_agent", { pubkey: agent.pubkey });
        } catch (startError: unknown) {
          const msg =
            startError instanceof Error
              ? startError.message
              : String(startError);
          setWarning(`Added to huddle, but could not start agent: ${msg}`);
          console.error("Failed to start agent after huddle add:", startError);
          return;
        }
      }
      if (result.parent_error) {
        // Agent was added to the ephemeral channel but parent channel add failed.
        // Show as a warning — don't close the dialog so the user can see it.
        setWarning(
          `Added to huddle, but parent channel failed: ${result.parent_error}`,
        );
      } else {
        onClose();
      }
    } catch (e: unknown) {
      if (startedForAdd) {
        try {
          await invoke("stop_managed_agent", { pubkey: agent.pubkey });
        } catch (rollbackError: unknown) {
          console.error(
            "Failed to stop agent after huddle add failed:",
            rollbackError,
          );
        }
      }
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to add agent: ${msg}`);
      console.error("Failed to add agent to huddle:", e);
    } finally {
      setAdding(null);
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={open}
    >
      <ChooserDialogContent
        className="max-w-xl"
        data-testid="add-huddle-agent-dialog"
        headerSubtitle="Choose an agent to join this huddle."
        scrollAreaClassName="space-y-5"
        title="Add agents"
      >
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {warning ? (
          <p className="rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning">
            {warning}
          </p>
        ) : null}

        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Loading agents…
          </p>
        ) : availableAgents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            All available agents are already in this huddle.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {availableAgents.map((agent) => {
              const isAdding = adding === agent.pubkey;
              return (
                <li key={agent.pubkey}>
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    data-agent-source={agent.managed ? "managed" : "remote"}
                    disabled={adding !== null}
                    onClick={() => void handleAdd(agent)}
                    type="button"
                  >
                    <ProfileAvatar
                      avatarUrl={agent.avatarUrl}
                      className="h-9 w-9 shrink-0 text-xs"
                      label={agent.name}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {agent.name}
                    </span>
                    {agent.managed ? null : (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                        Team
                      </span>
                    )}
                    {isAdding ? (
                      <LoaderCircle
                        aria-label={`Adding ${agent.name}`}
                        className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ChooserDialogContent>
    </Dialog>
  );
}

export type { AgentAddResult };
