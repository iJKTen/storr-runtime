import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { runCommand } from "./run.js";
import { trackActivity } from "../health.js";
import { logger } from "./logger.js";
import { sanitizeError, extractJsonArray, parseThemeList } from "./parsers.js";
import {
  getState, setState, setAuthUrl, getThemes, setThemes,
  setExistingThemeIds,
  getSelectedThemeId, setSelectedThemeId,
  getStorePassword, setStorePassword,
  setCurrentChild, getCurrentChild, setError, buildStatus,
} from "./state.js";
import type { OperationResult, Child, Theme } from "./types.js";

const SHOPIFY_URL = process.env["SHOPIFY_URL"] ?? "";
const BASE_DIR = "/home/node/app";
const THEMES_DIR = `${BASE_DIR}/themes`;
const VERIFICATION_CODE_REGEX = /verification code:\s*([A-Z0-9]+-[A-Z0-9]+)/i;
const SHOPIFY_ACTIVATE_URL = "https://accounts.shopify.com/activate-with-code";
const PASSWORD_ERROR_REGEX = /Failed to prompt.*Enter your store password/is;
const LOCAL_URL_REGEX = /http:\/\/(?:127\.0\.0\.1|0\.0\.0\.0):9292/i;

const getThemeDir = (id: string): string => `${THEMES_DIR}/${id}`;

export function getStatus() { return buildStatus(); }

export function start(): void {
  if (!SHOPIFY_URL) return;
  authenticate();
}

export function selectTheme(themeId: string, useExisting = false): OperationResult {
  if (getState() !== "theme_selection") {
    return { ok: false, error: `Cannot select theme in state: ${getState()}` };
  }
  if (!getThemes()?.some((t) => t.id === themeId)) {
    return { ok: false, error: "Unknown theme ID" };
  }
  setSelectedThemeId(themeId);
  return useExisting ? handleExistingTheme(themeId) : handleFreshDownload(themeId);
}

function handleExistingTheme(themeId: string): OperationResult {
  if (!existsSync(getThemeDir(themeId))) {
    return { ok: false, error: "Theme directory does not exist" };
  }
  logger.info("orchestrator", "Using existing theme", { themeId });
  startDevServer();
  return { ok: true };
}

function handleFreshDownload(themeId: string): OperationResult {
  downloadTheme(themeId).catch((err) => {
    setError(sanitizeError(String(err)));
  });
  return { ok: true };
}

export function provideInput(input: string): OperationResult {
  if (getState() === "waiting_for_password") {
    setStorePassword(input);
    startDevServer();
    return { ok: true };
  }
  const child = getCurrentChild();
  if (!child?.stdin) {
    return { ok: false, error: "No active process accepting input" };
  }
  child.stdin.write(input + "\n");
  return { ok: true };
}

// -- Authentication --

function spawnShopify(args: string[], cwd: string): Child {
  return spawn("shopify", args, {
    cwd,
    env: { ...process.env, SHOPIFY_CLI_TTY: "0", FORCE_COLOR: "0" },
  });
}

function authenticate(): void {
  setState("authenticating");
  trackActivity();
  logger.info("orchestrator", "Starting Shopify authentication");

  const child = spawnShopify(["auth", "login"], BASE_DIR);
  setCurrentChild(child);
  const output = { value: "", codeCaptured: false };

  attachAuthOutputHandler(child, output);
  attachAuthCloseHandler(child, output);
  attachErrorHandler(child);
}

function attachAuthOutputHandler(child: Child, output: { value: string; codeCaptured: boolean }): void {
  const handleData = (data: Buffer): void => {
    const str = data.toString();
    output.value += str;
    logger.info("cli", str.trimEnd());
    captureVerificationCode(str, child, output);
  };
  child.stdout?.on("data", handleData);
  child.stderr?.on("data", handleData);
}

function captureVerificationCode(str: string, child: Child, output: { codeCaptured: boolean }): void {
  const codeMatch = str.match(VERIFICATION_CODE_REGEX);
  if (!codeMatch?.[1] || output.codeCaptured) return;

  output.codeCaptured = true;
  const code = codeMatch[1];
  setAuthUrl(`${SHOPIFY_ACTIVATE_URL}?device_code%5Buser_code%5D=${code}`);
  setState("waiting_for_auth");
  trackActivity();
  logger.info("orchestrator", "Verification code captured", { code });
  child.stdin?.write("\n");
}

function attachAuthCloseHandler(child: Child, output: { value: string }): void {
  child.on("close", (code) => {
    setCurrentChild(null);
    if (code === 0) {
      logger.info("orchestrator", "Authentication successful");
      listThemes().catch((err) => {
        setError(sanitizeError(String(err)));
      });
    } else {
      setError(sanitizeError(output.value));
      logger.error("orchestrator", "Authentication failed", { exitCode: code });
    }
  });
}

function attachErrorHandler(child: Child): void {
  child.on("error", (err) => {
    setCurrentChild(null);
    setError(sanitizeError(err.message));
  });
}

// -- Theme Listing --

async function listThemes(): Promise<void> {
  setState("listing_themes");
  trackActivity();
  logger.info("orchestrator", "Listing themes", { shopifyUrl: SHOPIFY_URL });

  const result = await runCommand(
    "shopify",
    ["theme", "list", "--store", SHOPIFY_URL, "--json"],
    BASE_DIR,
  );

  if (result.type !== "success") {
    setError(sanitizeError(result.output));
    return;
  }
  processThemeListResult(result.output);
}

function processThemeListResult(output: string): void {
  const parsed = extractJsonArray(output);
  if (!parsed) {
    setError(sanitizeError(output));
    return;
  }
  const themeList = parseThemeList(parsed);
  if (themeList.length === 0) {
    setError("No themes found for this store");
    return;
  }
  applyThemeSelection(themeList);
}

function applyThemeSelection(themeList: Theme[]): void {
  const existing = themeList
    .filter((t) => existsSync(getThemeDir(t.id)))
    .map((t) => t.id);
  setExistingThemeIds(existing);

  if (themeList.length === 1) {
    const singleTheme = themeList[0]!;
    if (existing.includes(singleTheme.id)) {
      setThemes(themeList);
      setState("theme_selection");
      trackActivity();
      return;
    }
    downloadTheme(singleTheme.id).catch((err) => {
      setError(sanitizeError(String(err)));
    });
    return;
  }

  setThemes(themeList);
  setState("theme_selection");
  trackActivity();
}

// -- Theme Download --

async function downloadTheme(themeId: string): Promise<void> {
  setState("downloading");
  setSelectedThemeId(themeId);
  trackActivity();
  logger.info("orchestrator", "Downloading theme", { shopifyUrl: SHOPIFY_URL, themeId });

  const result = await runCommand(
    "shopify",
    ["theme", "pull", "--store", SHOPIFY_URL, "--theme", themeId],
    getThemeDir(themeId),
    300_000,
  );

  if (result.type !== "success") {
    setError(sanitizeError(result.output));
    return;
  }
  logger.info("orchestrator", "Theme downloaded successfully");
  startDevServer();
}

// -- Dev Server --

function buildDevServerArgs(): string[] {
  const args = ["theme", "dev", "--store", SHOPIFY_URL, "--port", "9292", "--host", "0.0.0.0", "--poll"];
  const password = getStorePassword();
  if (password) args.push("--store-password", password);
  return args;
}

function startDevServer(): void {
  const themeId = getSelectedThemeId();
  if (!themeId) {
    setError("No theme selected for dev server");
    return;
  }

  setState("starting_dev");
  trackActivity();
  logger.info("orchestrator", "Starting dev server", { shopifyUrl: SHOPIFY_URL, themeId });

  const child = spawnShopify(buildDevServerArgs(), getThemeDir(themeId));
  setCurrentChild(child);
  const output = { value: "" };

  attachDevServerOutputHandler(child, output);
  attachDevServerCloseHandler(child, output);
  attachErrorHandler(child);
}

function attachDevServerOutputHandler(child: Child, output: { value: string }): void {
  const handleData = (data: Buffer): void => {
    const str = data.toString();
    output.value += str;
    logger.info("cli", str.trimEnd());
    if (LOCAL_URL_REGEX.test(str)) {
      setState("running");
      trackActivity();
      logger.info("orchestrator", "Dev server is running", { port: 9292 });
    }
  };
  child.stdout?.on("data", handleData);
  child.stderr?.on("data", handleData);
}

function attachDevServerCloseHandler(child: Child, output: { value: string }): void {
  child.on("close", (code) => {
    setCurrentChild(null);
    if (code !== 0 && getState() !== "running") {
      handleDevServerFailure(code, output.value);
    } else if (code !== 0) {
      logger.error("orchestrator", "Dev server exited unexpectedly", { exitCode: code });
      setError("Dev server crashed");
    }
  });
}

function handleDevServerFailure(code: number | null, output: string): void {
  if (PASSWORD_ERROR_REGEX.test(output) && !getStorePassword()) {
    setState("waiting_for_password");
    trackActivity();
    logger.info("orchestrator", "Store password required (detected from CLI error)");
  } else {
    setError(sanitizeError(output));
    logger.error("orchestrator", "Dev server failed to start", { exitCode: code });
  }
}
