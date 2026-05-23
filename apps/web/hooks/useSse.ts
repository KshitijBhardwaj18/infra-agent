"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";

export function useSse<T>(url: string | null, enabled = true) {
  const [data, setData] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!url || !enabled) return;

    esRef.current?.close();
    setData([]);
    const es = new EventSource(apiUrl(url), { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T;
        setData((prev) => [...prev, parsed]);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError("Connection lost");
      es.close();
      setTimeout(connect, 3000);
    };
  }, [url, enabled]);

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, [connect]);

  return { data, connected, error, reset: () => setData([]) };
}
