import type { ServerResponse } from "node:http";

let lastActivityAt = Date.now();

export function trackActivity(): void {
  lastActivityAt = Date.now();
}

export function getIdleSeconds(): number {
  return Math.floor((Date.now() - lastActivityAt) / 1000);
}

export function handleHealth(res: ServerResponse): void {
  const idleSeconds = getIdleSeconds();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      lastActivityAt: new Date(lastActivityAt).toISOString(),
      idleSeconds,
    }),
  );
}
