type LogLevel = "info" | "warn" | "error";

export type LogData =
  | { rawOutput: string }
  | { themeId: string }
  | { shopifyUrl: string }
  | { shopifyUrl: string; themeId: string }
  | { code: string }
  | { exitCode: number | null }
  | { port: number }
  | { cwd: string }
  | { authUrl: string }
  | { timeoutMinutes: number };

interface LogEntry {
  level: LogLevel;
  component: string;
  msg: string;
  ts: string;
  data?: LogData;
}

function log(level: LogLevel, component: string, msg: string, data?: LogData): void {
  const entry: LogEntry = {
    level,
    component,
    msg,
    ts: new Date().toISOString(),
  };
  if (data) entry.data = data;
  process.stdout.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  info: (component: string, msg: string, data?: LogData): void => log("info", component, msg, data),
  warn: (component: string, msg: string, data?: LogData): void => log("warn", component, msg, data),
  error: (component: string, msg: string, data?: LogData): void => log("error", component, msg, data),
};
