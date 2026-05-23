"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col border-l border-zinc-800/50 bg-zinc-950">
        <button
          onClick={toggle}
          className="flex h-12 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
        >
          <ChevronLeft size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800/50 bg-zinc-950">
      <div className="flex h-12 items-center justify-between border-b border-zinc-800/50 px-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-zinc-400" />
          <span className="text-sm font-medium">Agent</span>
        </div>
        <button
          onClick={toggle}
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        {messages.length === 0 && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ask about deployment status, detected services, or build failures.
          </p>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "ml-6 bg-zinc-800 text-white"
                  : "mr-6 border border-zinc-800 bg-zinc-900 text-zinc-200",
              )}
            >
              {m.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <Separator />
      <div className="flex gap-2 p-3">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the agent..."
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
