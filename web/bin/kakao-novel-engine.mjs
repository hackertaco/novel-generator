#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const entrypoint = path.join(currentDir, "..", "scripts", "novel-engine.ts");

const result = spawnSync(
  "npx",
  ["--yes", "tsx", entrypoint, ...process.argv.slice(2)],
  {
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
