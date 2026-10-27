import type { IncomingMessage, ServerResponse } from "node:http";
import { trackActivity } from "./health.js";
import { runCommand } from "./lib/run.js";
import { getStatus, selectTheme, provideInput } from "./lib/orchestrator.js";
import { sendJson, sendError, parseJsonBody } from "./lib/http.js";

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void;

interface RouteEntry {
  method: string;
  path: string;
  handler: RouteHandler;
}

function handleStatus(_req: IncomingMessage, res: ServerResponse): void {
  trackActivity();
  sendJson(res, 200, getStatus());
}

function handleSelectTheme(req: IncomingMessage, res: ServerResponse): void {
  trackActivity();
  parseJsonBody(req, (raw) => {
    try {
      const { themeId, useExisting } = JSON.parse(raw) as { themeId: unknown; useExisting: unknown };
      if (typeof themeId !== "string" || !themeId) {
        sendError(res, 400, "themeId is required");
        return;
      }
      const result = selectTheme(themeId, !!useExisting);
      if (!result.ok) { sendError(res, 409, result.error ?? "Unknown error"); return; }
      sendJson(res, 200, getStatus());
    } catch {
      sendError(res, 400, "Invalid JSON body");
    }
  });
}

function handleProvideInput(req: IncomingMessage, res: ServerResponse): void {
  trackActivity();
  parseJsonBody(req, (raw) => {
    try {
      const { input } = JSON.parse(raw) as { input: unknown };
      if (typeof input !== "string") {
        sendError(res, 400, "input is required");
        return;
      }
      const result = provideInput(input);
      if (!result.ok) { sendError(res, 400, result.error ?? "Unknown error"); return; }
      sendJson(res, 200, { status: "ok" });
    } catch {
      sendError(res, 400, "Invalid JSON body");
    }
  });
}

function handleCommand(req: IncomingMessage, res: ServerResponse): void {
  trackActivity();
  parseJsonBody(req, (raw) => {
    (async () => {
      try {
        const { command, args, cwd } = JSON.parse(raw) as { command: string; args?: string[]; cwd?: string };
        const result = await runCommand(command, args ?? [], cwd ?? "/home/node/app");
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { type: "error", output: String(err) });
      }
    })();
  });
}

const routes: RouteEntry[] = [
  { method: "GET",  path: "/status",        handler: handleStatus },
  { method: "POST", path: "/select-theme",  handler: handleSelectTheme },
  { method: "POST", path: "/provide-input", handler: handleProvideInput },
  { method: "POST", path: "/command",       handler: handleCommand },
];

export function findRoute(method: string, path: string): RouteHandler | null {
  return routes.find((r) => r.method === method && r.path === path)?.handler ?? null;
}
