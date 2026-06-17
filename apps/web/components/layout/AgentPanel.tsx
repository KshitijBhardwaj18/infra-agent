"use client";

import { useEffect, useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Rocket,
  RotateCw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import Markdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import type { ProposedAction, ChatResponse } from "@heizen/shared";

type ActionState = "pending" | "running" | "confirmed" | "dismissed" | "error";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: ProposedAction;
  actionState?: ActionState;
  actionError?: string;
}

export function AgentPanel({ projectId }: { projectId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("heizen-agent-collapsed");
    if (stored) setCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("heizen-agent-collapsed", String(next));
  };

  const send = async () => {
    if (!message.trim() || loading) return;
    const userMsg = message.trim();
    setMessage("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: userMsg },
    ]);
    setLoading(true);

    try {
      const res = await api<ChatResponse>(
        `/api/projects/${projectId}/agent/chat`,
        {
          method: "POST",
          body: JSON.stringify({ message: userMsg, history }),
        },
      );
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.message,
          action: res.proposedAction ?? undefined,
          actionState: res.proposedAction ? "pending" : undefined,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const setActionState = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );

  const confirmAction = async (msg: ChatMessage) => {
    const action = msg.action;
    if (!action) return;
    setActionState(msg.id, { actionState: "running", actionError: undefined });
    const envBase = `/api/projects/${action.projectId}/environments/${action.envId}`;
    const request =
      action.kind === "deploy"
        ? { path: `${envBase}/deployments`, body: JSON.stringify({}) }
        : action.kind === "destroy"
          ? { path: `${envBase}/deployments/destroy`, body: undefined }
          : {
              path: `${envBase}/ops/restart`,
              body: JSON.stringify({ service: action.serviceName }),
            };
    try {
      await api(request.path, { method: "POST", body: request.body });
      setActionState(msg.id, { actionState: "confirmed" });
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            action.kind === "deploy"
              ? `Deploy queued for ${action.envType}. Track progress on the ${action.envType} environment page.`
              : action.kind === "destroy"
                ? `Destroy queued for ${action.envType}. Resources are being torn down.`
                : `Restarted "${action.serviceName}" on ${action.envType}.`,
        },
      ]);
    } catch (err) {
      setActionState(msg.id, {
        actionState: "error",
        actionError: err instanceof Error ? err.message : "Action failed",
      });
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col border-l border-border bg-background">
        <button
          onClick={toggle}
          className="flex h-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">SRE Agent</span>
        </div>
        <button
          onClick={toggle}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="leading-relaxed">
              Your ops copilot. Ask about environments, deployments, or
              incidents — or tell me to deploy.
            </p>
            <div className="space-y-1.5">
              {[
                "What's the status of staging?",
                "Any open incidents? Why?",
                "Scan staging for problems",
                "Deploy staging",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setMessage(s)}
                  className="block w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs text-foreground/80 transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="space-y-2">
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-6 whitespace-pre-wrap bg-muted text-foreground"
                    : "mr-6 border border-border bg-card text-foreground/90",
                )}
              >
                {m.role === "user" ? (
                  m.content
                ) : (
                  <div className="agent-markdown">
                    <Markdown>{m.content}</Markdown>
                  </div>
                )}
              </div>
              {m.action && (
                <ActionCard
                  msg={m}
                  onConfirm={() => confirmAction(m)}
                  onDismiss={() =>
                    setActionState(m.id, { actionState: "dismissed" })
                  }
                />
              )}
            </div>
          ))}
          {loading && (
            <div className="mr-6 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              <Loader2 size={13} className="animate-spin" /> Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <Separator />
      <div className="flex gap-2 p-3">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask or instruct the agent..."
          disabled={loading}
          className="h-8 text-sm"
        />
        <Button size="icon-sm" onClick={send} disabled={loading}>
          <Send size={14} />
        </Button>
      </div>
    </aside>
  );
}

function ActionCard({
  msg,
  onConfirm,
  onDismiss,
}: {
  msg: ChatMessage;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const action = msg.action!;
  const isDestroy = action.kind === "destroy";
  const isRestart = action.kind === "restart";
  const state = msg.actionState ?? "pending";

  return (
    <div
      className={cn(
        "mr-6 rounded-lg border p-3",
        isDestroy
          ? "border-destructive/30 bg-destructive/5"
          : "border-info/30 bg-info/5",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md",
            isDestroy
              ? "bg-destructive/15 text-destructive"
              : "bg-info/15 text-info",
          )}
        >
          {isDestroy ? (
            <Trash2 size={13} />
          ) : isRestart ? (
            <RotateCw size={13} />
          ) : (
            <Rocket size={13} />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{action.label}</p>
          <p className="text-[11px] text-muted-foreground">
            Requires your confirmation
          </p>
        </div>
      </div>

      {isDestroy && state === "pending" && (
        <p className="mt-2 text-[11px] leading-relaxed text-destructive">
          This permanently tears down all AWS resources and data for{" "}
          {action.envType}.
        </p>
      )}

      {state === "error" && (
        <p className="mt-2 text-[11px] text-destructive">{msg.actionError}</p>
      )}

      <div className="mt-2.5">
        {state === "confirmed" ? (
          <p className="text-xs font-medium text-success">
            {isDestroy
              ? "Destroy queued ✓"
              : isRestart
                ? "Service restarted ✓"
                : "Deploy queued ✓"}
          </p>
        ) : state === "dismissed" ? (
          <p className="text-xs text-muted-foreground">Dismissed</p>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isDestroy ? "destructive" : "default"}
              className="h-7 flex-1 text-xs"
              onClick={onConfirm}
              disabled={state === "running"}
            >
              {state === "running" ? (
                <Loader2 size={12} className="mr-1 animate-spin" />
              ) : null}
              {state === "running" && isRestart
                ? "Restarting…"
                : isDestroy
                  ? "Confirm destroy"
                  : isRestart
                    ? "Confirm restart"
                    : "Confirm deploy"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onDismiss}
              disabled={state === "running"}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
