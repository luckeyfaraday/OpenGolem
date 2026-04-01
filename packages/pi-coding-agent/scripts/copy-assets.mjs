import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(packageRoot, 'src');
const distRoot = path.join(packageRoot, 'dist');

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copy(relativePath) {
  const fromPath = path.join(srcRoot, relativePath);
  const toPath = path.join(distRoot, relativePath);
  ensureParent(toPath);
  fs.copyFileSync(fromPath, toPath);
}

copy('modes/interactive/theme/dark.json');
copy('modes/interactive/theme/light.json');
copy('modes/interactive/theme/theme-schema.json');
copy('core/export-html/template.html');
copy('core/export-html/template.css');
copy('core/export-html/template.js');
copy('core/export-html/vendor/highlight.min.js');
copy('core/export-html/vendor/marked.min.js');

const cliPath = path.join(distRoot, 'cli.js');
if (fs.existsSync(cliPath)) {
  fs.chmodSync(cliPath, 0o755);
}

console.log('Copied vendored pi assets into dist');
