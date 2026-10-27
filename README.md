# Clerk Studio Runtime

The **Clerk Studio Runtime** is the containerized Linux environment that powers the interactive building experience in Clerk. It provides a dedicated, isolated workspace for each store, equipped with all the necessary tools for theme development and automated coding agents.

## Features

- **Isolated Workspace**: Runs as an AWS Fargate task with a dedicated EFS mount for persistent theme files.
- **Shopify Tooling**: Pre-installed with the latest `Shopify CLI` and `@shopify/theme` package.
- **Idle Timer**: A built-in timer (`startIdleTimer`) monitors activity and automatically shuts down the environment after a period of inactivity (default 15 minutes) to optimize costs.
- **Orchestration API**: A lightweight Node.js server (on port 8080) that manages Shopify authentication, theme listing/selection, and the development server lifecycle.
- **Bearer Token Auth**: Optional API authentication via `RUNTIME_AUTH_TOKEN` using timing-safe comparison. When unset, auth is disabled.
- **Preview Support**: Exposes port 9292 for the Shopify development server, which is routed via an AWS Application Load Balancer.

## Technical Stack

- **Base Image**: `node:20-slim`
- **Dependencies**: `git`, `curl`, `@shopify/cli`, `@shopify/theme`
- **Language**: TypeScript (ES2024 target, NodeNext module resolution, compiled to ESM)

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | The port the orchestrator listens on. | `8080` |
| `IDLE_TIMEOUT_MINUTES` | Minutes of inactivity before auto-shutdown. | `15` |
| `RUNTIME_AUTH_TOKEN` | Bearer token for API authentication. When unset, auth is disabled. | _(none)_ |
| `SHOPIFY_URL` | Shopify store URL. Required for orchestration to auto-start on boot. | _(none)_ |

## API Endpoints

All endpoints return JSON. All endpoints except `/health` require a `Bearer` token in the `Authorization` header when `RUNTIME_AUTH_TOKEN` is set.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Returns uptime, idle seconds, and last activity timestamp. No auth required. |
| `GET` | `/status` | Returns the current orchestrator state (see state flow below). |
| `POST` | `/select-theme` | Selects a theme to work on. Body: `{ "themeId": string, "useExisting"?: boolean }` |
| `POST` | `/provide-input` | Sends input to the active CLI process (e.g. store password). Body: `{ "input": string }` |
| `POST` | `/command` | Runs an arbitrary command. Body: `{ "command": string, "args"?: string[], "cwd"?: string }` |

### Orchestrator State Flow

```
idle → authenticating → waiting_for_auth → listing_themes → theme_selection → downloading → starting_dev → running
                                                                                        ↘ waiting_for_password ↗
Any state may transition to → error
```

## Local Development

To run the orchestrator locally for testing:

```bash
npm install
npm run dev
```

To build and run the compiled output:

```bash
npm run build
npm start
```

Note: Set `SHOPIFY_URL` for orchestration to auto-start on boot. Without it, the server starts but skips authentication and theme listing.

## Deployment

This repository is automatically built and pushed to Amazon ECR via the pipeline defined in the `storr-runtime-infra` repository. Any push to the `main` branch will trigger a new build.

## Directory Structure

```
src/
├── index.ts              # HTTP server, auth middleware, idle timer
├── health.ts             # Activity tracking and /health endpoint
├── routes.ts             # Route definitions for /status, /select-theme, /provide-input, /command
└── lib/
    ├── orchestrator.ts   # Shopify auth, theme listing, download, and dev server lifecycle
    ├── state.ts          # Shared orchestrator state (current state, themes, auth URL, etc.)
    ├── types.ts          # TypeScript types (State, Theme, OrchestratorStatus, etc.)
    ├── run.ts            # Spawns CLI commands with timeout and output capture
    ├── http.ts           # JSON response helpers (sendJson, sendError, parseJsonBody)
    ├── parsers.ts        # CLI output parsing (error sanitization, theme list extraction)
    └── logger.ts         # Structured JSON logger
Dockerfile                # Multi-stage build for the production container
```
