// Prints NAME: SET|MISSING for every variable named in .env.example.
// Never prints values. Run with: npm run check-env
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(root, ".env.example"), "utf8");
const names = [
  ...new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/))
      .filter(Boolean)
      .map((m) => m[1]),
  ),
];

let missing = 0;
for (const name of names) {
  const set = typeof process.env[name] === "string" && process.env[name] !== "";
  if (!set) missing++;
  console.log(`${name}: ${set ? "SET" : "MISSING"}`);
}
console.log(`${names.length - missing}/${names.length} set`);
