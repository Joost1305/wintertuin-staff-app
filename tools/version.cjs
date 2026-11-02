// Gives every script a version number so phones load the new code after an update.
// Usage: node tools/version.cjs <folder with index.html> <version>
const fs = require('fs'); const path = require('path');
const [dir, v] = process.argv.slice(2);
const files = []; (function walk(d) { for (const f of fs.readdirSync(path.join(dir, d))) { const p = path.join(d, f);
  if (fs.statSync(path.join(dir, p)).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } })('js');
const map = Object.fromEntries(files.sort().map((f) => [`./${f}`, `./${f}?v=${v}`]));
const tag = `<script type="importmap" id="versions">${JSON.stringify({ imports: map })}</script>`;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap" id="versions">.*?<\/script>\n?\s*/s, '');
html = html.replace(/(\s*)<script type="module" src="js\/app\.js\?v=[^"]*"><\/script>/, `$1${tag}$1<script type="module" src="js/app.js?v=${v}"></script>`);
fs.writeFileSync(path.join(dir, 'index.html'), html);
// the app checks this file (never cached) and loads a newer build by itself
fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ build: v }) + '\n');
// the build name in the app itself
const cfg = path.join(dir, 'js', 'config.js');
if (fs.existsSync(cfg)) fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(/export const BUILD = '[^']*'/, `export const BUILD = '${v}'`));
console.log(files.length, 'scripts at', v);
