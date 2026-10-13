// Préférences d'interface, séparées des données comptables : thème, couleurs, texte, effets, menu, favoris, tableaux de bord.
(function () {
  const KEY = 'compta-elina-prefs';
  const HEX = /^#[0-9a-f]{6}$/i;

  const PRESETS = {
    indigo: { label: 'Indigo', primary: '#4f46e5', secondary: '#ec4899' },
    ocean: { label: 'Océan', primary: '#0369a1', secondary: '#06b6d4' },
    emeraude: { label: 'Émeraude', primary: '#047857', secondary: '#84cc16' },
    graphite: { label: 'Graphite', primary: '#374151', secondary: '#64748b' },
    framboise: { label: 'Framboise', primary: '#be185d', secondary: '#f97316' },
    ambre: { label: 'Ambre', primary: '#b45309', secondary: '#eab308' }
  };
  const FONTS = {
    system: { label: 'Système (par défaut)', css: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    verdana: { label: 'Verdana (très lisible)', css: 'Verdana, Geneva, sans-serif' },
    arial: { label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
    tahoma: { label: 'Tahoma', css: 'Tahoma, "Segoe UI", sans-serif' },
    trebuchet: { label: 'Trebuchet MS', css: '"Trebuchet MS", "Segoe UI", sans-serif' },
    georgia: { label: 'Georgia (avec empattements)', css: 'Georgia, "Times New Roman", serif' }
  };

  const DEFAULTS = {
    schema: 1,
    mode: 'auto',
    preset: 'indigo',
    colors: { primary: '#4f46e5', secondary: '#ec4899', success: '#15803d', danger: '#b91c1c', warning: '#b45309', info: '#0369a1', bg: '', card: '', border: '', tableHead: '', chart1: '', chart2: '', chart3: '' },
    effects: { glass: true, opacity: 66, blur: 16, shadows: 1, gradients: true, halos: true },
    text: { size: 14, font: 'system', lineHeight: 1.45, density: 'comfortable', radius: 12, contrast: false },
    motion: 'auto',
    nav: { order: [], hidden: [] },
    favorites: [],
    dashboards: [],
    activeDash: ''
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const pick = (v, list, d) => list.includes(v) ? v : d;
  const str = (v, max) => String(v ?? '').slice(0, max);

  // Toute préférence lue (stockage, import) passe ici : valeurs bornées, inconnues ignorées
  function sanitize(raw) {
    const p = clone(DEFAULTS), r = raw && typeof raw === 'object' ? raw : {};
    p.mode = pick(r.mode, ['auto', 'light', 'dark'], 'auto');
    p.preset = pick(r.preset, [...Object.keys(PRESETS), 'custom'], 'indigo');
    for (const k of Object.keys(p.colors)) { const v = r.colors && r.colors[k]; if (typeof v === 'string' && (HEX.test(v) || (v === '' && DEFAULTS.colors[k] === ''))) p.colors[k] = v.toLowerCase(); }
    const e = r.effects || {};
    p.effects = { glass: e.glass !== false, opacity: num(e.opacity, 30, 100, 66), blur: num(e.blur, 0, 30, 16), shadows: num(e.shadows, 0, 2, 1), gradients: e.gradients !== false, halos: e.halos !== false };
    const t = r.text || {};
    p.text = { size: num(t.size, 12, 20, 14), font: pick(t.font, Object.keys(FONTS), 'system'), lineHeight: num(t.lineHeight, 1.2, 2, 1.45), density: pick(t.density, ['compact', 'comfortable', 'airy'], 'comfortable'), radius: num(t.radius, 0, 24, 12), contrast: t.contrast === true };
    p.motion = pick(r.motion, ['auto', 'full', 'reduced', 'off'], 'auto');
    const n = r.nav || {};
    p.nav = { order: Array.isArray(n.order) ? n.order.filter(x => typeof x === 'string').slice(0, 50) : [], hidden: Array.isArray(n.hidden) ? n.hidden.filter(x => typeof x === 'string' && x !== 'settings').slice(0, 50) : [] };
    p.favorites = Array.isArray(r.favorites) ? r.favorites.filter(f => f && ['view', 'tool'].includes(f.type) && typeof f.id === 'string').slice(0, 12).map(f => ({ type: f.type, id: str(f.id, 40), label: str(f.label, 60) })) : [];
    p.dashboards = Array.isArray(r.dashboards) ? r.dashboards.filter(d => d && typeof d.id === 'string' && Array.isArray(d.widgets)).slice(0, 10).map(d => ({
      id: str(d.id, 30), name: str(d.name, 40) || 'Tableau de bord', profile: str(d.profile, 20),
      widgets: d.widgets.filter(w => w && typeof w.id === 'string').slice(0, 40).map(w => ({ id: str(w.id, 30), size: pick(Number(w.size), [3, 4, 6, 8, 12], 6), tall: w.tall === true }))
    })) : [];
    p.activeDash = str(r.activeDash, 30);
    return p;
  }

  function load(storage) {
    try { return sanitize(JSON.parse((storage || localStorage).getItem(KEY) || '{}')); } catch { return clone(DEFAULTS); }
  }
  function save(p, storage) { (storage || localStorage).setItem(KEY, JSON.stringify(sanitize(p))); }

  // Applique les préférences au document : attributs pour les variantes, variables CSS pour les valeurs
  function apply(p, doc, systemDark) {
    const root = doc.documentElement, st = root.style;
    const dark = p.mode === 'dark' || (p.mode === 'auto' && systemDark);
    root.dataset.mode = dark ? 'dark' : 'light';
    root.dataset.density = p.text.density;
    root.dataset.motion = p.motion;
    root.dataset.contrast = p.text.contrast ? 'high' : 'normal';
    root.dataset.glass = p.effects.glass ? 'on' : 'off';
    root.dataset.halos = p.effects.halos ? 'on' : 'off';
    root.dataset.gradients = p.effects.gradients ? 'on' : 'off';
    const c = p.preset === 'custom' ? p.colors : { ...p.colors, ...PRESETS[p.preset] };
    const set = (k, v) => v ? st.setProperty(k, v) : st.removeProperty(k);
    set('--accent', c.primary); set('--accent2', c.secondary);
    set('--good', c.success); set('--bad', c.danger); set('--warn', c.warning); set('--info', c.info);
    set('--bg', c.bg); set('--panel', c.card); set('--line', c.border); set('--th', c.tableHead);
    set('--c0', c.chart1); set('--charges', c.chart2); set('--c2', c.chart3);
    set('--fs', p.text.size + 'px'); set('--lh', String(p.text.lineHeight)); set('--radius', p.text.radius + 'px');
    set('--font', FONTS[p.text.font].css);
    set('--glass-opacity', p.effects.opacity + '%'); set('--blur', p.effects.blur + 'px'); set('--shadow-k', String(p.effects.shadows));
    return dark;
  }

  // Fichier d'export des préférences, distinct d'une sauvegarde de dossier
  function exportJSON(p, checksum) {
    const data = sanitize(p);
    return JSON.stringify({ app: 'compta-elina', kind: 'preferences', schema: 1, createdAt: new Date().toISOString(), checksum: checksum(JSON.stringify(data)), data }, null, 1);
  }
  function importJSON(text, checksum) {
    let raw;
    try { raw = JSON.parse(text); } catch { throw new Error('Fichier illisible'); }
    if (!raw || raw.app !== 'compta-elina' || raw.kind !== 'preferences') throw new Error('Ce fichier n\'est pas un export de préférences Compta Elina');
    if (checksum(JSON.stringify(raw.data)) !== raw.checksum) throw new Error('Empreinte incorrecte : fichier modifié ou incomplet');
    return sanitize(raw.data);
  }

  const P = { KEY, PRESETS, FONTS, DEFAULTS, sanitize, load, save, apply, exportJSON, importJSON, clone };
  if (typeof module !== 'undefined') module.exports = P; else window.Prefs = P;
})();
