import { io, Socket } from "socket.io-client";

export function connectSocket(
  roomId: string,
  role = "controller",
  name = "FaithCity Stageflow",
  port?: number,
): Socket {
  const queryPort = Number(new URLSearchParams(location.search).get("port"));
  const serverPort = port ?? (Number.isInteger(queryPort) && queryPort > 0 ? queryPort : 3000);
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
  const host = local
    ? `http://${location.hostname || "127.0.0.1"}:${serverPort}`
    : location.origin;
  return io(host, {
    query: { roomId, role, name },
    transports: ["websocket", "polling"],
    reconnection: true,
  });
}
