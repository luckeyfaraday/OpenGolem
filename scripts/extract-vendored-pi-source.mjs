import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const packageRoot = path.join(projectRoot, 'packages', 'pi-coding-agent');
const distRoot = path.join(packageRoot, 'dist');
const srcRoot = path.join(packageRoot, 'src');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.map')) {
      extractSourceMap(fullPath);
    }
  }
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function extractSourceMap(mapPath) {
  const raw = fs.readFileSync(mapPath, 'utf8');
  const map = JSON.parse(raw);
  if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) {
    return;
  }

  for (let i = 0; i < map.sources.length; i += 1) {
    const sourcePath = map.sources[i];
    const sourceContent = map.sourcesContent[i];
    if (typeof sourcePath !== 'string' || typeof sourceContent !== 'string') {
      continue;
    }
    const outputPath = path.resolve(path.dirname(mapPath), sourcePath);
    if (!outputPath.startsWith(srcRoot)) {
      continue;
    }
    ensureParent(outputPath);
    fs.writeFileSync(outputPath, sourceContent, 'utf8');
  }
}

function copyFile(relativeFromDist, relativeToSrc = relativeFromDist) {
  const fromPath = path.join(distRoot, relativeFromDist);
  const toPath = path.join(srcRoot, relativeToSrc);
  ensureParent(toPath);
  fs.copyFileSync(fromPath, toPath);
}

walk(distRoot);

copyFile('modes/interactive/theme/dark.json', 'modes/interactive/theme/dark.json');
copyFile('modes/interactive/theme/light.json', 'modes/interactive/theme/light.json');
copyFile('modes/interactive/theme/theme-schema.json', 'modes/interactive/theme/theme-schema.json');
copyFile('core/export-html/template.html', 'core/export-html/template.html');
copyFile('core/export-html/template.css', 'core/export-html/template.css');
copyFile('core/export-html/template.js', 'core/export-html/template.js');
copyFile('core/export-html/vendor/highlight.min.js', 'core/export-html/vendor/highlight.min.js');
copyFile('core/export-html/vendor/marked.min.js', 'core/export-html/vendor/marked.min.js');

console.log('Extracted vendored pi sources into packages/pi-coding-agent/src');
