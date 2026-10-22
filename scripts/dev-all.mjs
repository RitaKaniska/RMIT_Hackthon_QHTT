import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const viteBin = resolve("node_modules/vite/bin/vite.js");
if (!existsSync(viteBin)) {
  console.error("[dev-all] Vite is not installed; run npm install first");
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function spawnChild(name, args) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    detached: false,
    env: process.env,
  });
  child.name = name;
  child.on("error", (error) => {
    console.error(`[dev-all] ${name} could not start`, error && error.code ? error.code : "unknown");
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[dev-all] ${name} exited (${detail})`);
    shutdown(code === 0 ? 0 : code || 1);
  });
  children.push(child);
  return child;
}

function stopChild(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill(signal);
  } catch {
    // The process may already be gone.
  }
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stopChild(child, "SIGTERM");
  const force = setTimeout(() => {
    for (const child of children) stopChild(child, "SIGKILL");
  }, 3000);
  force.unref();
  const finish = () => process.exit(exitCode);
  const pending = children.filter((child) => child.exitCode === null && child.signalCode === null);
  if (pending.length === 0) {
    finish();
    return;
  }
  let remaining = pending.length;
  for (const child of pending) {
    child.once("exit", () => {
      remaining -= 1;
      if (remaining === 0) {
        clearTimeout(force);
        finish();
      }
    });
  }
  setTimeout(() => {
    clearTimeout(force);
    for (const child of children) stopChild(child, "SIGKILL");
    finish();
  }, 4000).unref();
}

spawnChild("api", ["--env-file-if-exists=.env", "server/index.mjs"]);
spawnChild("web", [viteBin]);

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown(signal === "SIGINT" ? 130 : 143));
}

process.on("exit", () => {
  for (const child of children) stopChild(child, "SIGKILL");
});
