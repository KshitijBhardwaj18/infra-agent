"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiUrl } from "@/lib/api";

const MAX_RETRIES = 10;

export function useSse<T>(url: string | null, enabled = true) {
  const [data, setData] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);

  const connect = useCallback(() => {
    if (!url || !enabled) return;

    esRef.current?.close();
    setData([]);
    const es = new EventSource(apiUrl(url), { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      retriesRef.current = 0;
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
      es.close();
      setConnected(false);
      const retry = retriesRef.current;
      if (retry >= MAX_RETRIES) {
        setError("Connection lost (max retries exceeded)");
        return;
      }
      retriesRef.current = retry + 1;
      const delay = Math.min(30000, 1000 * Math.pow(2, retry));
      setError(`Connection lost — retrying in ${Math.ceil(delay / 1000)}s`);
      setTimeout(connect, delay);
    };
  }, [url, enabled]);

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, [connect]);

  const reset = () => {
    retriesRef.current = 0;
    setData([]);
  };

  return { data, connected, error, reset };
}
