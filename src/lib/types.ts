import type { ChildProcess } from "node:child_process";

export type State =
  | "idle"
  | "authenticating"
  | "waiting_for_auth"
  | "listing_themes"
  | "theme_selection"
  | "downloading"
  | "starting_dev"
  | "waiting_for_password"
  | "running"
  | "error";

export interface Theme {
  id: string;
  name: string;
  role: string;
}

export interface RawThemeEntry {
  id: string;
  name: string;
  role: string;
}

export type OrchestratorStatus =
  | StatusIdle
  | StatusWaitingForAuth
  | StatusThemeSelection
  | StatusError
  | StatusRunning
  | StatusWaitingForPassword;

interface StatusIdle {
  status: "idle" | "authenticating" | "listing_themes" | "downloading" | "starting_dev";
}

interface StatusWaitingForAuth {
  status: "waiting_for_auth";
  authUrl: string;
}

interface StatusThemeSelection {
  status: "theme_selection";
  themes: Theme[];
  existingThemeIds: string[];
}

interface StatusError {
  status: "error";
  output: string;
}

interface StatusRunning {
  status: "running";
  devServerPort: number;
}

interface StatusWaitingForPassword {
  status: "waiting_for_password";
}

export interface OperationResult {
  ok: boolean;
  error?: string;
}

export type Child = ChildProcess;
