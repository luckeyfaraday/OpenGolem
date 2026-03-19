const fs = require("node:fs");
const path = require("node:path");

const targetFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "app-builder-lib",
  "out",
  "util",
  "appFileCopier.js"
);

const marker = "node module collection failed, trying fallback collector";

function main() {
  if (!fs.existsSync(targetFile)) {
    console.warn(`[patch:electron-builder] Skipping, file not found: ${targetFile}`);
    return;
  }

  const source = fs.readFileSync(targetFile, "utf8");
  if (source.includes(marker)) {
    console.log("[patch:electron-builder] Already patched.");
    return;
  }

  const search = `            const collector = (0, node_module_collector_1.getCollectorByPackageManager)(pm, dir, tempDirManager);
            deps = await collector.getNodeModules({ packageName: packager.metadata.name });
            if (deps.nodeModules.length > 0) {`;

  const replace = `            const collector = (0, node_module_collector_1.getCollectorByPackageManager)(pm, dir, tempDirManager);
            try {
                deps = await collector.getNodeModules({ packageName: packager.metadata.name });
            }
            catch (error) {
                builder_util_1.log.warn({ pm, searchDir: dir, error: error instanceof Error ? error.message : String(error) }, "${marker}");
                continue;
            }
            if (deps.nodeModules.length > 0) {`;

  if (!source.includes(search)) {
    throw new Error("[patch:electron-builder] Failed to find target snippet in appFileCopier.js");
  }

  fs.writeFileSync(targetFile, source.replace(search, replace), "utf8");
  console.log("[patch:electron-builder] Applied collector fallback patch.");
}

main();
