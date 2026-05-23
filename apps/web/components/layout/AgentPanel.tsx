"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import { api } from "@/lib/api";

export function AgentPanel({ projectId }: { projectId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
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
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await api<{ message: string }>(
        `/api/projects/${projectId}/agent/chat`,
        { method: "POST", body: JSON.stringify({ message: userMsg }) },
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.message },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-10 flex-col border-l border-[var(--border)] bg-[var(--card)]">
        <button onClick={toggle} className="p-3 hover:bg-zinc-800">
          <ChevronLeft size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 flex-col border-l border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <span className="text-sm font-medium">Agent</span>
        <button onClick={toggle} className="rounded p-1 hover:bg-zinc-800">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Ask about deployment status, detected services, or build failures.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              m.role === "user"
                ? "ml-4 bg-[var(--accent)]/20"
                : "mr-4 bg-zinc-800",
            )}
          >
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-[var(--border)] p-3">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the agent..."
          disabled={loading}
        />
        <Button onClick={send} disabled={loading}>
          <Send size={16} />
        </Button>
      </div>
    </aside>
  );
}
