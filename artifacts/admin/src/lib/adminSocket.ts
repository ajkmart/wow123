import { io, type Socket } from "socket.io-client";

let _socket: Socket | null = null;
let _currentToken: string | null = null;

export function getAdminSocket(accessToken: string): Socket {
  if (_socket && _currentToken === accessToken && _socket.connected) {
    return _socket;
  }

  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }

  _currentToken = accessToken;
  _socket = io(window.location.origin, {
    path: "/api/socket.io",
    query: { rooms: "admin-fleet" },
    auth: (cb: (d: Record<string, string>) => void) => cb({ token: accessToken }),
    transports: ["websocket", "polling"],
  });

  _socket.on("connect", () => {
    _socket?.emit("join", "admin-fleet");
  });

  return _socket;
}

export function disconnectAdminSocket(): void {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
    _currentToken = null;
  }
}
