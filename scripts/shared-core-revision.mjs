import { readFileSync } from "node:fs";

const manifest = readFileSync(
  new URL("../src-tauri/Cargo.toml", import.meta.url),
  "utf8",
);
const dependency = manifest.match(/^\s*danmaku-core\s*=\s*\{([^}]+)\}/m)?.[1];
const repository = dependency?.match(/\bgit\s*=\s*"([^"]+)"/)?.[1];
const revision = dependency?.match(/\brev\s*=\s*"([^"]+)"/)?.[1];

if (repository !== "https://github.com/sfqy211/danmaku-core.git") {
  throw new Error("Cargo.toml must reference the expected danmaku-core repository");
}
if (!revision || !/^[0-9a-f]{40}$/.test(revision)) {
  throw new Error("danmaku-core must use a full 40-character Git revision");
}

process.stdout.write(`${revision}\n`);
