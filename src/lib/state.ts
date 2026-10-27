import type { State, Theme, OrchestratorStatus, Child } from "./types.js";

let state: State = "idle";
let authUrl: string | undefined;
let themes: Theme[] | undefined;
let existingThemeIds: string[] = [];
let selectedThemeId: string | undefined;
let errorOutput: string | undefined;
let storePassword: string | undefined;
let currentChild: Child | null = null;

export function getState(): State { return state; }
export function setState(s: State): void { state = s; }

export function getAuthUrl(): string | undefined { return authUrl; }
export function setAuthUrl(url: string): void { authUrl = url; }

export function getThemes(): Theme[] | undefined { return themes; }
export function setThemes(t: Theme[]): void { themes = t; }

export function getExistingThemeIds(): string[] { return existingThemeIds; }
export function setExistingThemeIds(ids: string[]): void { existingThemeIds = ids; }

export function getSelectedThemeId(): string | undefined { return selectedThemeId; }
export function setSelectedThemeId(id: string): void { selectedThemeId = id; }

export function getStorePassword(): string | undefined { return storePassword; }
export function setStorePassword(pw: string): void { storePassword = pw; }

export function getCurrentChild(): Child | null { return currentChild; }
export function setCurrentChild(child: Child | null): void { currentChild = child; }

export function setError(output: string): void {
  state = "error";
  errorOutput = output;
}

export function buildStatus(): OrchestratorStatus {
  switch (state) {
    case "waiting_for_auth":
      return authUrl
        ? { status: "waiting_for_auth", authUrl }
        : { status: "authenticating" };
    case "theme_selection":
      return themes
        ? { status: "theme_selection", themes, existingThemeIds }
        : { status: "listing_themes" };
    case "error":
      return { status: "error", output: errorOutput ?? "" };
    case "running":
      return { status: "running", devServerPort: 9292 };
    case "waiting_for_password":
      return { status: "waiting_for_password" };
    default:
      return { status: state };
  }
}
