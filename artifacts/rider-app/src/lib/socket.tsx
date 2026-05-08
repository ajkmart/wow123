import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { api, getApiBase } from "./api";
import { useAuth } from "./auth";
import { getRiderSocketOrigin } from "./envValidation";
import { syncQueue } from "./offline/queueManager";

type SocketContextType = {
  socket: Socket | null;
  connected: boolean;
  setRiderPosition: (lat: number, lng: number) => void;
  batteryLevel: number | undefined;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  setRiderPosition: () => {},
  batteryLevel: undefined,
});

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  /* Cached position fed by Home.tsx / Active.tsx watchPosition — no separate GPS listener here */
  const lastLatRef = useRef<number | undefined>(undefined);
  const lastLngRef = useRef<number | undefined>(undefined);

  /* Called from watchPosition callbacks in Home.tsx and Active.tsx */
  const setRiderPosition = useCallback((lat: number, lng: number) => {
    lastLatRef.current = lat;
    lastLngRef.current = lng;
  }, []);

  useEffect(() => {
    const token = api.getToken();
    if (!token || !user?.id) return;

    const socketOrigin = getRiderSocketOrigin() ?? window.location.origin;

    const s = io(socketOrigin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: 20,
      /* withCredentials lets the browser attach the HttpOnly refresh cookie
         to the polling-transport handshake. The websocket transport does
         not require it but enabling here is harmless and keeps both
         transports symmetric for any cookie-aware server middleware. */
      withCredentials: true,
    });
    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => {
      setConnected(true);
      syncQueue().catch(() => {});
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", () => setConnected(false));

    /* S1 / T4: On token refresh, reconnect the socket so the new auth token
       is sent on the next handshake. socket.io's typings model `auth` as
       `string | object`, so we narrow once via a typed local rather than
       re-casting at every read site. The cast is kept inside one helper so a
       future socket.io upgrade only needs to delete this block. */
    type AuthBag = { token?: string };
    const readSocketAuth = (): AuthBag => {
      const a = (s as { auth?: unknown }).auth;
      return (a && typeof a === "object" ? (a as AuthBag) : {}) as AuthBag;
    };
    const writeSocketAuth = (next: AuthBag) => { (s as { auth?: unknown }).auth = next; };
    const tokenRefreshInterval = setInterval(async () => {
      const freshToken = api.getToken();
      const current = readSocketAuth().token;
      if (freshToken && freshToken !== current) {
        writeSocketAuth({ ...readSocketAuth(), token: freshToken });
        /* Reconnect to send new token on next handshake */
        s.disconnect();
        s.connect();
      }
    }, 10_000);

    return () => {
      clearInterval(tokenRefreshInterval);
      s.removeAllListeners(); /* S4: Remove all listeners on cleanup (COMPLETED) */
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id]);

  /* Shared battery source for Home.tsx and heartbeat pings */
  const batteryLevelRef = useRef<number | undefined>(undefined);

  /* Initialize battery listener once at mount */
  useEffect(() => {
    type BatteryManager = { level: number; addEventListener: (event: string, cb: () => void) => void; removeEventListener: (event: string, cb: () => void) => void };
    let batt: BatteryManager | undefined;
    const onLevelChange = () => { if (batt) batteryLevelRef.current = batt.level; };
    (navigator as unknown as { getBattery?: () => Promise<BatteryManager> }).getBattery?.()
      .then((b) => {
        batt = b;
        batteryLevelRef.current = batt.level;
        batt.addEventListener("levelchange", onLevelChange);
      }).catch(() => {});
    return () => { batt?.removeEventListener("levelchange", onLevelChange); };
  }, []);

  /* Heartbeat effect - keyed on the socket instance so connect listeners rebind */
  useEffect(() => {
    const s = socket;
    if (!s || !user?.isOnline) return;

    const emitHeartbeat = () => {
      if (!s?.connected) return;
      s.emit("rider:heartbeat", {
        batteryLevel: batteryLevelRef.current,
        isOnline: true,
        timestamp: new Date().toISOString(),
        /* Use position cached from the page-level watchPosition — no duplicate GPS listener */
        ...(lastLatRef.current !== undefined && lastLngRef.current !== undefined
          ? { latitude: lastLatRef.current, longitude: lastLngRef.current }
          : {}),
      });
    };

    s.off("connect", emitHeartbeat);
    s.on("connect", emitHeartbeat);
    emitHeartbeat();
    const heartbeatInterval = setInterval(emitHeartbeat, 10_000);

    return () => {
      clearInterval(heartbeatInterval);
      s.off("connect", emitHeartbeat);
    };
  }, [socket, user?.isOnline]);

  return (
    <SocketContext.Provider value={{ socket, connected, setRiderPosition, batteryLevel: batteryLevelRef.current }}>
      {children}
    </SocketContext.Provider>
  );
}
