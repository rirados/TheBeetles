import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useWebSocket - React hook that maintains a single WebSocket connection
 * per channel and dispatches events to subscribers.
 */
export function useWebSocket(channel = "admin") {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const listenersRef = useRef(new Map());
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/${channel}`;
    console.log(`[WS] connecting to ${url}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log(`[WS] connected on ${channel}`);
    };

    ws.onmessage = (msg) => {
      try {
        const envelope = JSON.parse(msg.data);
        setLastEvent(envelope);
        setEvents((prev) => [envelope, ...prev].slice(0, 200));
        // Dispatch to specific listeners
        const handlers = listenersRef.current.get(envelope.event) || new Set();
        handlers.forEach((h) => {
          try {
            h(envelope.payload, envelope);
          } catch (e) {
            console.error("[WS] handler error", e);
          }
        });
        // Wildcard listeners
        const wildcardHandlers = listenersRef.current.get("*") || new Set();
        wildcardHandlers.forEach((h) => h(envelope.payload, envelope));
      } catch (e) {
        console.error("[WS] parse error", e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log(`[WS] disconnected from ${channel}, reconnecting in 2s`);
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = (e) => {
      console.error("[WS] error", e);
    };
  }, [channel]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const on = useCallback((event, handler) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event).add(handler);
    return () => {
      const set = listenersRef.current.get(event);
      if (set) set.delete(handler);
    };
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(typeof data === "string" ? data : JSON.stringify(data));
    }
  }, []);

  return { connected, events, lastEvent, on, send };
}
