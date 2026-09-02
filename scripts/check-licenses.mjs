import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const allowed = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"]);
const packages = Object.entries(lock.packages ?? {}).filter(([path]) => path !== "");
const unknown = [];

for (const [path, metadata] of packages) {
  const license = metadata.license;
  if (license && !allowed.has(license)) unknown.push(`${path}: ${license}`);
}

if (unknown.length) {
  console.error("Unsupported or unreviewed dependency licenses found:");
  console.error(unknown.join("\n"));
  process.exit(1);
}

console.log(`License check passed: ${packages.length} locked packages reviewed.`);
