import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(res: ServerResponse, status: number, data: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function sendError(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { error });
}

export function parseJsonBody(req: IncomingMessage, callback: (raw: string) => void): void {
  let body = "";
  req.on("data", (chunk: Buffer) => { body += chunk; });
  req.on("end", () => callback(body));
}
