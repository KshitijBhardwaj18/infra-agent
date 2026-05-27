"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  DeploymentStatusPayload,
  EnvironmentStatusPayload,
  IndexingCompletePayload,
  GithubDisconnectedPayload,
} from "@heizen/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { withCredentials: true, transports: ["websocket"] });
  }
  return socket;
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    return () => {
      s.off("connect");
      s.off("disconnect");
    };
  }, []);

  return { connected, socket: getSocket() };
}

export function useDeploymentStatus(
  onUpdate: (payload: DeploymentStatusPayload) => void,
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const s = getSocket();
    const handler = (payload: DeploymentStatusPayload) =>
      callbackRef.current(payload);
    s.on("deployment:status", handler);
    return () => {
      s.off("deployment:status", handler);
    };
  }, []);
}

export function useEnvironmentStatus(
  onUpdate: (payload: EnvironmentStatusPayload) => void,
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const s = getSocket();
    const handler = (payload: EnvironmentStatusPayload) =>
      callbackRef.current(payload);
    s.on("environment:status", handler);
    return () => {
      s.off("environment:status", handler);
    };
  }, []);
}

export function useIndexingComplete(
  onComplete: (payload: IndexingCompletePayload) => void,
) {
  const callbackRef = useRef(onComplete);
  callbackRef.current = onComplete;

  useEffect(() => {
    const s = getSocket();
    const handler = (payload: IndexingCompletePayload) =>
      callbackRef.current(payload);
    s.on("indexing:complete", handler);
    return () => {
      s.off("indexing:complete", handler);
    };
  }, []);
}

export function useGithubDisconnected(
  onDisconnected: (payload: GithubDisconnectedPayload) => void,
) {
  const callbackRef = useRef(onDisconnected);
  callbackRef.current = onDisconnected;

  useEffect(() => {
    const s = getSocket();
    const handler = (payload: GithubDisconnectedPayload) =>
      callbackRef.current(payload);
    s.on("github:disconnected", handler);
    return () => {
      s.off("github:disconnected", handler);
    };
  }, []);
}
