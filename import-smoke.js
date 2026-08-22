import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && path.endsWith(".js")) files.push(path);
  }
  return files;
}

const root = new URL("./lib/", import.meta.url);
const files = (await collect(root.pathname)).sort();
const failures = [];
for (const file of files) {
  try {
    await import(pathToFileURL(file).href);
  } catch (error) {
    failures.push({ file: relative(process.cwd(), file), error: error?.stack || String(error) });
  }
}
if (failures.length) {
  for (const failure of failures) console.error(`IMPORT_FAIL ${failure.file}\n${failure.error}`);
  process.exitCode = 1;
} else {
  console.log(`import smoke passed: ${files.length} lib modules loaded without exceptions`);
}
