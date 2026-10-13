// Inscrit la version de package.json dans les liens CSS/JS (?v=…) et dans APP_VERSION,
// pour que les navigateurs rechargent les fichiers après chaque mise à jour du site.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));

const html = path.join(root, 'src', 'index.html');
let s = fs.readFileSync(html, 'utf8');
const count = (s.match(/\.(css|js)\?v=[^"]+"/g) || []).length;
s = s.replace(/\.(css|js)\?v=[^"]+"/g, (m, ext) => `.${ext}?v=${version}"`);
fs.writeFileSync(html, s);

const appJs = path.join(root, 'src', 'app.js');
const a = fs.readFileSync(appJs, 'utf8').replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${version}';`);
fs.writeFileSync(appJs, a);
console.log(`Version ${version} inscrite sur ${count} fichiers`);
