import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excluded = new Set(["dist", "release", "node_modules"]);
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else if (/\.(?:js|mjs)$/u.test(entry.name)) files.push(absolute);
  }
}

await collect(root);
for (const file of files.sort()) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) {
    process.stderr.write(check.stderr || check.stdout);
    process.exit(check.status || 1);
  }
}
console.log(`Syntax/type-shape check passed for ${files.length} JavaScript files.`);
