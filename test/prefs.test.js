const assert = require('node:assert');
const P = require('../src/prefs.js');
const { checksum } = require('../src/store.js');

// Valeurs bornées et inconnues ignorées
const p = P.sanitize({ mode: 'neon', preset: 'ocean', colors: { primary: '#ABCDEF', danger: 'red', bg: '' }, text: { size: 99, font: 'comic', density: 'airy', radius: -5 }, motion: 'off',
  nav: { order: ['vat', 3], hidden: ['settings', 'vat'] }, favorites: [{ type: 'tool', id: 'loan', label: 'Emprunt' }, { type: 'evil', id: 'x' }],
  dashboards: [{ id: 'd1', name: 'Direction', widgets: [{ id: 'treso', size: 7 }, { id: 'kpi_ca', size: 4, tall: true }] }], extra: 1 });
assert.strictEqual(p.mode, 'auto');
assert.strictEqual(p.preset, 'ocean');
assert.strictEqual(p.colors.primary, '#abcdef');
assert.strictEqual(p.colors.danger, P.DEFAULTS.colors.danger);
assert.strictEqual(p.text.size, 20); assert.strictEqual(p.text.font, 'system'); assert.strictEqual(p.text.density, 'airy'); assert.strictEqual(p.text.radius, 0);
assert.strictEqual(p.motion, 'off');
assert.deepStrictEqual(p.nav, { order: ['vat'], hidden: ['vat'] });
assert.deepStrictEqual(p.favorites, [{ type: 'tool', id: 'loan', label: 'Emprunt' }]);
assert.deepStrictEqual(p.dashboards[0].widgets, [{ id: 'treso', size: 6, tall: false }, { id: 'kpi_ca', size: 4, tall: true }]);
assert.strictEqual(p.extra, undefined);
assert.deepStrictEqual(P.sanitize(null), P.DEFAULTS);

// Stockage : aller-retour, et stockage corrompu => valeurs par défaut
const mem = { v: {}, getItem(k) { return this.v[k] ?? null; }, setItem(k, x) { this.v[k] = x; } };
P.save(p, mem);
assert.deepStrictEqual(P.load(mem), p);
mem.v[P.KEY] = '{cassé';
assert.deepStrictEqual(P.load(mem), P.DEFAULTS);

// Export / import avec empreinte
const file = P.exportJSON(p, checksum);
assert.deepStrictEqual(P.importJSON(file, checksum), p);
const bad = JSON.parse(file); bad.data.text.size = 18;
assert.throws(() => P.importJSON(JSON.stringify(bad), checksum), /Empreinte/);
assert.throws(() => P.importJSON('{"app":"compta-elina","kind":"dossier"}', checksum), /pas un export de préférences/);

// Application au document : attributs et variables
const doc = { documentElement: { dataset: {}, style: { v: {}, setProperty(k, x) { this.v[k] = x; }, removeProperty(k) { delete this.v[k]; } } } };
P.apply(P.sanitize({ mode: 'auto', preset: 'emeraude' }), doc, true);
assert.strictEqual(doc.documentElement.dataset.mode, 'dark');
assert.strictEqual(doc.documentElement.style.v['--accent'], P.PRESETS.emeraude.primary);
P.apply(P.sanitize({ mode: 'light', preset: 'custom', colors: { primary: '#123456', bg: '#fafafa' }, text: { size: 16 } }), doc, true);
assert.strictEqual(doc.documentElement.dataset.mode, 'light');
assert.strictEqual(doc.documentElement.style.v['--accent'], '#123456');
assert.strictEqual(doc.documentElement.style.v['--bg'], '#fafafa');
assert.strictEqual(doc.documentElement.style.v['--fs'], '16px');
P.apply(P.sanitize({}), doc, false);
assert.strictEqual(doc.documentElement.style.v['--bg'], undefined);
console.log('OK prefs - validation, stockage, export/import, application');
