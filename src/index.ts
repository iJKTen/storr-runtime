import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { handleHealth, getIdleSeconds, trackActivity } from "./health.js";
import { start as startOrchestrator } from "./lib/orchestrator.js";
import { sendError } from "./lib/http.js";
import { findRoute } from "./routes.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env["PORT"] ?? "8080");
const IDLE_TIMEOUT_MINUTES = Number(process.env["IDLE_TIMEOUT_MINUTES"] ?? "15");
const RUNTIME_AUTH_TOKEN = process.env["RUNTIME_AUTH_TOKEN"] ?? "";

function isAuthorized(req: IncomingMessage): boolean {
  if (!RUNTIME_AUTH_TOKEN) return true;
  const header = req.headers["authorization"] ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length !== RUNTIME_AUTH_TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(RUNTIME_AUTH_TOKEN));
}

function route(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/health") {
    handleHealth(res);
    return;
  }

  if (!isAuthorized(req)) {
    sendError(res, 401, "Unauthorized");
    return;
  }

  const handler = findRoute(method, url.pathname);
  if (handler) { handler(req, res); return; }

  trackActivity();
  sendError(res, 404, "Not found");
}

function startIdleTimer(): void {
  setInterval(() => {
    if (getIdleSeconds() > IDLE_TIMEOUT_MINUTES * 60) {
      logger.info("server", `Idle timeout reached (${IDLE_TIMEOUT_MINUTES}m). Shutting down...`);
      process.exit(0);
    }
  }, 60_000);
}

startIdleTimer();

const server = createServer(route);

server.listen(PORT, "0.0.0.0", () => {
  logger.info("server", `clerk-studio orchestrator listening on 0.0.0.0:${PORT}`, { timeoutMinutes: IDLE_TIMEOUT_MINUTES });
  startOrchestrator();
});
