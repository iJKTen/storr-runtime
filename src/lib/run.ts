import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { logger } from "./logger.js";
import type { ChildProcess } from "node:child_process";

export interface CommandResult {
  type: "success" | "auth" | "error";
  output: string;
  authUrl?: string;
}

interface OutputCollector {
  output: string;
  authUrl: string | undefined;
  resolved: boolean;
}

const SHOPIFY_AUTH_REGEX = /https:\/\/accounts\.shopify\.com\/oauth\/authorize\?[^\s\n]+/;

function spawnWithEnv(command: string, args: string[], cwd: string): ChildProcess {
  return spawn(command, args, {
    cwd,
    env: { ...process.env, SHOPIFY_CLI_TTY: "0", FORCE_COLOR: "0" },
  });
}

function attachOutputHandlers(child: ChildProcess, collector: OutputCollector, resolve: (r: CommandResult) => void): void {
  const handleData = (data: Buffer): void => {
    const str = data.toString();
    collector.output += str;
    logger.info("cli", str.trimEnd());

    const match = str.match(SHOPIFY_AUTH_REGEX);
    if (match && !collector.authUrl) {
      collector.authUrl = match[0];
      collector.resolved = true;
      logger.info("orchestrator", "Captured Auth URL", { authUrl: collector.authUrl });
      resolve({ type: "auth", output: collector.output, authUrl: collector.authUrl });
    }
  };
  child.stdout?.on("data", handleData);
  child.stderr?.on("data", handleData);
}

function attachLifecycleHandlers(child: ChildProcess, collector: OutputCollector, resolve: (r: CommandResult) => void, timeoutMs: number): void {
  child.on("close", (code) => {
    if (collector.resolved) return;
    collector.resolved = true;
    resolve(code === 0
      ? { type: "success", output: collector.output }
      : { type: "error", output: collector.output });
  });

  child.on("error", (err) => {
    if (collector.resolved) return;
    collector.resolved = true;
    resolve({ type: "error", output: err.message });
  });

  setTimeout(() => {
    if (collector.resolved) return;
    collector.resolved = true;
    child.kill();
    resolve({ type: "error", output: collector.output + "\nCommand timed out" });
  }, timeoutMs);
}

export async function runCommand(command: string, args: string[], cwd: string, timeoutMs = 60_000): Promise<CommandResult> {
  await mkdir(cwd, { recursive: true });
  return new Promise((resolve) => {
    logger.info("run", `Executing: ${command} ${args.join(" ")}`, { cwd });
    const child = spawnWithEnv(command, args, cwd);
    const collector: OutputCollector = { output: "", authUrl: undefined, resolved: false };
    attachOutputHandlers(child, collector, resolve);
    attachLifecycleHandlers(child, collector, resolve, timeoutMs);
  });
}
