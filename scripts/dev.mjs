#!/usr/bin/env node
// Local dev runner: starts the API (embedded PGlite by default) and the web app
// together. Values in apps/api/.env and the shell always win over the defaults
// below, so pointing at a real Supabase/Postgres just means filling in .env.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

// Background jobs pull hundreds of MB from MTGJSON/Scryfall; keep dev boots light.
const API_DEV_DEFAULTS = {
  PORT: "3001",
  INITIAL_INGEST_SET: "fdn",
  ENABLE_PRICE_REFRESH: "false",
  ENABLE_WATCHLIST_CHECK: "false",
  ENABLE_META_SNAPSHOT: "false",
};

function run(args, label) {
  const result = spawnSync(npm, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[dev] ${label} failed`);
    process.exit(result.status ?? 1);
  }
}

// First-run prep: shared packages and the Prisma client are build outputs.
if (!existsSync(join(root, "packages/engine/dist")) || !existsSync(join(root, "packages/mtg-adapter/dist"))) {
  run(["run", "build:packages"], "Building shared packages");
}
if (!existsSync(join(root, "apps/api/src/generated/prisma"))) {
  run(["run", "db:generate"], "Generating Prisma client");
}

const apiEnvPath = join(root, "apps/api/.env");
const apiEnvFile = existsSync(apiEnvPath) ? dotenv.parse(readFileSync(apiEnvPath)) : {};
const apiEnv = { ...process.env };
for (const [key, value] of Object.entries(API_DEV_DEFAULTS)) {
  if (apiEnv[key] === undefined && apiEnvFile[key] === undefined) apiEnv[key] = value;
}

const children = [];
function start(name, color, args, env) {
  const child = spawn(npm, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let buffered = "";
    stream.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  }
  child.on("exit", (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((iface) => iface && iface.family === "IPv4" && !iface.internal)?.address;

const apiPort = apiEnv.PORT;
console.log(`
  Web     http://localhost:3000
  API     http://localhost:${apiPort}   (health: /health)
  Mobile  set EXPO_PUBLIC_API_URL=http://${lanIp ?? "YOUR-LAN-IP"}:${apiPort} in apps/mobile/.env
`);

start("api", "36", ["run", "dev", "--workspace=apps/api"], apiEnv);
// The web app defaults NEXT_PUBLIC_API_URL to http://localhost:3001; override it in apps/web/.env.local.
start("web", "35", ["run", "dev", "--workspace=apps/web", "--", "--port", "3000"], process.env);
