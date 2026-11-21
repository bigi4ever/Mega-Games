// הליבה של מחולל המשחקים: בחירת ז'אנר לפי פופולריות, בחירת נושא, יצירת פרמטרים ושם, ובניית קובץ HTML.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENRES } from './trends.js';
import { THEMES } from './themes.js';
import { variantsFor } from './variants.js';
import { readLive } from './live-trends.js';
import { listInventions, scaleParams, INV_DIR } from './invent.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TPL = path.join(ROOT, 'src', 'templates');

// ---------- אקראיות עם seed, כדי שאותו seed ייתן אותו משחק ----------
export function makeRng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: arr => arr[Math.floor(next() * arr.length)],
    weighted(items, weightOf) {
      const ws = items.map(weightOf), total = ws.reduce((x, y) => x + y, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
      return items[items.length - 1];
    },
  };
}

// ---------- מגמות ----------
// סדר העדיפויות: ציון בסיס (trends.js) <- מחקר חי (trends.live.json) <- דריסה ידנית (trends.override.json)
export function loadGenres() {
  const live = readLive();
  const file = path.join(ROOT, 'trends.override.json');
  let override = {};
  if (fs.existsSync(file)) override = JSON.parse(fs.readFileSync(file, 'utf8'));
  return GENRES.map(g => {
    const l = live?.scores?.[g.id];
    const out = { ...g, source: 'בסיס' };
    if (l) Object.assign(out, { score: l.score, trend: l.trend, evidence: l.evidence, source: 'חי' });
    if (override[g.id] != null) Object.assign(out, { score: override[g.id], source: 'ידני' });
    return out;
  }).concat(inventionGenres()).sort((a, b) => b.score - a.score);
}

// המצאות של ה-AI מצטרפות למאגר כז'אנרים. אין להן עדיין נתוני שוק, אז הציון שלהן מוגבל ל-85.
function inventionGenres() {
  return listInventions().map(d => ({
    id: 'x-' + d.id, name: d.name, template: 'inv:' + d.id, score: Math.min(85, Math.max(30, d.appeal)),
    why: `${d.pitch} (הומצא ע"י ה-AI)`, tags: ['invented'], source: 'המצאה', invention: d,
  }));
}

function templatePath(name) {
  return name.startsWith('inv:') ? path.join(INV_DIR, name.slice(4), 'game.js') : path.join(TPL, `${name}.game.js`);
}

// ממלא מצייני מקום בטקסט של המצאה לפי הנושא
export function fillText(text, t) {
  const w = t.words;
  return String(text)
    .replaceAll('{in_place}', b(w.place)).replaceAll('{from_place}', 'מ' + w.place)
    .replaceAll('{hero}', w.hero).replaceAll('{place}', w.place).replaceAll('{thing}', w.thing)
    .replaceAll('{adj}', w.adj).replaceAll('{pickup}', t.pickup);
}

// משקל בחירה: פופולריות בריבוע (מעדיף בבירור את המובילים), עם קנס על ז'אנר שכבר נוצר הרבה, כדי לגוון.
export function genreWeight(g, made) {
  const count = made.filter(m => m.genre === g.id).length;
  return Math.pow(g.score / 100, 2) * Math.pow(0.45, count);
}

function themeWeight(t, genreId, made) {
  const sameCombo = made.filter(m => m.genre === genreId && m.theme === t.id).length;
  const sameTheme = made.filter(m => m.theme === t.id).length;
  return Math.pow(0.15, sameCombo) * Math.pow(0.7, sameTheme);
}

// ---------- פרמטרים לכל ז'אנר, לפי רמת קושי ----------
const DIFFICULTY = [
  { id: 'easy', name: 'קל', k: 0.82 },
  { id: 'normal', name: 'רגיל', k: 1 },
  { id: 'hard', name: 'קשה', k: 1.22 },
];

function paramsFor(genre, rng, k) {
  const r = (lo, hi) => Math.round(rng.range(lo, hi) * 100) / 100;
  switch (genre) {
    case 'survivors': return {
      enemySpeed: r(60, 80) * k, spawnRate: r(0.9, 1.3) * k, playerSpeed: r(190, 230),
      fireRate: r(1.6, 2.3) / Math.sqrt(k), hp: Math.round(6 / k), bossEvery: Math.round(rng.range(50, 70)),
    };
    case 'runner': return {
      speed: r(330, 400) * k, accel: r(6, 10) * k, gravity: r(2400, 2800), jump: r(820, 900), gapMul: r(1, 1.2) / k,
    };
    case 'merge': return { size: k > 1.1 ? 5 : 6 };
    case 'blockpuzzle': return { bigChance: r(0.35, 0.5) * k };
    case 'match3': return { kinds: k > 1.1 ? 6 : 5, moves: Math.round(rng.range(20, 26) / k), target: Math.round(rng.range(700, 900) * k) };
    case 'arrows': return { startSize: k > 1.1 ? 5 : 4, maxSize: 9, density: r(0.62, 0.72) * Math.min(1.1, k), hearts: k > 1.1 ? 2 : 3 };
    case 'idle': return { speed: r(0.9, 1.3) / k, click: 1 };
    default: return {};
  }
}

// ---------- שמות והוראות ----------
function b(w) { return 'ב' + (w.startsWith('ה') ? w.slice(1) : w); } // "החלל" -> "בחלל"

function titleFor(genre, t, rng) {
  const w = t.words;
  const opts = {
    survivors: [`${w.hero} נגד כולם`, `הישרדות ${b(w.place)}`, `הלילה האחרון ${b(w.place)}`, `המצור על ${w.place}`, `${w.hero} האחרון`],
    runner: [`בריחה מ${w.place}`, `המרוץ ${b(w.place)}`, `ריצה ${b(w.place)}`, `${w.hero} במנוסה`, `דהירה ${b(w.place)}`],
    merge: [`סדנת ${w.thing}`, `מיזוג ${w.adj}`, `${w.thing} מתמזגים`, `מעבדת ${w.thing}`],
    blockpuzzle: [`בלוקים ${b(w.place)}`, `פאזל ${w.place}`, `לבנים ${b(w.place)}`, `בלוק אחרי בלוק ${b(w.place)}`],
    match3: [`התאמות ${b(w.place)}`, `שלוש ${b(w.place)}`, `${w.thing} בשורה`, `קסם ${w.adj}`],
    arrows: [`חצים ${b(w.place)}`, `היציאה מ${w.place}`, `מבוך החצים`, `פקק ${b(w.place)}`],
    idle: [`אימפריית ${w.thing}`, `${w.thing} בלי סוף`, `טייקון ${w.place}`, `מכרה ${w.thing}`],
  };
  return rng.pick(opts[genre]);
}

function howtoFor(genre, t) {
  return {
    survivors: `שרוד מול גלי ${t.enemies.join('')} ככל שתוכל! הנשק יורה לבד. זוז עם החיצים או WASD, או גרור באצבע. אסוף את היהלומים הזוהרים כדי לעלות שלב ולבחור שדרוג.`,
    runner: `${t.hero} רץ בלי הפסקה. לחץ על המסך או על רווח כדי לקפוץ, ולחץ שוב באוויר לקפיצה כפולה. התחמק מ-${t.obstacle.join('')} ואסוף ${t.pickup}.`,
    merge: `לחץ על משבצת ריקה כדי להניח את הפריט הבא. 3 פריטים זהים צמודים מתמזגים לפריט הבא בסדרה: ${t.tiers.slice(0, 4).join('→')}… אפשר לשמור פריט בצד. נגמר כשהלוח מלא.`,
    blockpuzzle: `גרור צורות אל הלוח. שורה או עמודה מלאה מתנקות ונותנות נקודות, וניקוי ברצף נותן קומבו. נגמר כשאין מקום לאף צורה.`,
    match3: `החלף שני פריטים צמודים (גרירה או שתי לחיצות) כדי ליצור שורה של 3 ומעלה. 4 ברצף יוצרים פריט פס שמנקה שורה, 5 יוצרים פצצת צבע 💥. הגע ליעד הניקוד לפני שנגמרים המהלכים.`,
    arrows: `לחץ על חץ, והוא יחליק החוצה בכיוון שלו אם הדרך פנויה. חץ שנתקע בחץ אחר עולה בלב ❤️. נקה את כל החצים כדי לעבור שלב. כל לוח פתיר, צריך רק למצוא את הסדר.`,
    idle: `לחץ על ${t.clickable} כדי לאסוף ${t.currency}, וקנה מחוללים שמייצרים בשבילך. ההתקדמות נשמרת.`,
  }[genre];
}

// ---------- הבנייה ----------
export function plan({ seed = Date.now(), genre, theme, difficulty, variant, made = [] } = {}) {
  const rng = makeRng(seed);
  const genres = loadGenres();
  const g = genre ? genres.find(x => x.id === genre) : rng.weighted(genres, x => genreWeight(x, made));
  if (!g) throw new Error(`ז'אנר לא מוכר: ${genre}. אפשרויות: ${genres.map(x => x.id).join(', ')}`);
  const t = theme ? THEMES.find(x => x.id === theme) : rng.weighted(THEMES, x => themeWeight(x, g.id, made));
  if (!t) throw new Error(`נושא לא מוכר: ${theme}. אפשרויות: ${THEMES.map(x => x.id).join(', ')}`);
  const d = difficulty ? DIFFICULTY.find(x => x.id === difficulty) : rng.weighted(DIFFICULTY, x => (x.id === 'normal' ? 2 : 1));
  if (!d) throw new Error(`רמת קושי לא מוכרת: ${difficulty}`);

  const inv = g.invention;
  // וריאציית חוקים: מעדיפים צירוף ז'אנר+וריאציה שעוד לא נבנה
  const vs = variantsFor(g.id);
  const v = variant ? vs.find(x => x.id === variant) : rng.weighted(vs, x => Math.pow(0.3, made.filter(m => m.genre === g.id && (m.variant || 'classic') === x.id).length));
  if (!v) throw new Error(`וריאציה לא מוכרת: ${variant}. אפשרויות: ${vs.map(x => x.id).join(', ')}`);
  const params = inv ? scaleParams(inv, d.k) : { ...paramsFor(g.id, rng, d.k), ...(v.params ? v.params(rng, d.k) : {}), variant: v.id };
  const title = inv ? fillText(rng.pick(inv.titles.length ? inv.titles : [inv.name]), t)
    : v.titles && rng.next() < 0.7 ? rng.pick(v.titles(t.words, b)) : titleFor(g.id, t, rng);
  const id = Math.floor(rng.next() * 0xffffff).toString(16).padStart(6, '0');
  const totalW = genres.reduce((a, x) => a + genreWeight(x, made), 0);
  return {
    slug: `${g.id}-${t.id}-${id}`,
    seed: String(seed),
    title,
    icon: inv ? (t[inv.icon] && typeof t[inv.icon] === 'string' ? t[inv.icon] : inv.icon) : g.id === 'idle' ? t.clickable : g.id === 'merge' ? t.tiers[5] : g.id === 'match3' ? t.gems[0] : g.id === 'arrows' ? '➡️' : t.hero,
    genre: g.id, genreName: g.name, template: g.template,
    theme: t.id, themeName: t.name,
    difficulty: d.id, difficultyName: d.name,
    howto: inv ? fillText(inv.howto, t) : v.howto ? v.howto(t) : howtoFor(g.id, t),
    variant: v.id, variantName: v.name,
    params,
    reason: genre ? 'נבחר ידנית' :
      `${g.name}: פופולריות ${g.score}/100 (${g.source === 'חי' ? 'מחקר חי' : g.source === 'ידני' ? 'דריסה ידנית' : 'ציון בסיס'}), נוצרו כבר ${made.filter(m => m.genre === g.id).length}, ` +
      `סיכוי בחירה ${Math.round(genreWeight(g, made) / totalW * 100)}%. ${g.evidence || g.why}`,
    themeObj: t,
  };
}

export function build(p) {
  const base = fs.readFileSync(path.join(TPL, 'base.html'), 'utf8');
  const code = p.code ?? fs.readFileSync(templatePath(p.template), 'utf8');
  const cssFile = path.join(TPL, `${p.template}.css`);
  const css = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, 'utf8') : '';
  const cfg = {
    slug: p.slug, title: p.title, icon: p.icon, howto: p.howto,
    genreName: p.variant && p.variant !== 'classic' ? `${p.genreName} · ${p.variantName}` : p.genreName,
    theme: p.themeObj, params: p.params,
  };
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // פונקציות החלפה, כדי ש-$ בתוך הקוד לא יתפרש כתבנית
  return base
    .replace('__TITLE__', () => esc(p.title))
    .replace('__EXTRA_CSS__', () => css)
    .replace('__CONFIG__', () => json)
    .replace('__TEMPLATE__', () => p.template)
    .replace('__GAME__', () => code);
}

// ---------- מאגר המשחקים שנוצרו ----------
export function saveManifest(manifest, outDir) {
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeGallery(manifest, outDir);
}

export function readManifest(outDir) {
  const f = path.join(outDir, 'manifest.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
}

export function writeGame(p, outDir) {
  const dir = path.join(outDir, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), build(p));
  const manifest = readManifest(outDir).filter(m => m.slug !== p.slug);
  const { themeObj, ...meta } = p;
  manifest.push({ ...meta, created: new Date().toISOString() });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeGallery(manifest, outDir);
  return path.join(dir, 'index.html');
}

// הגלריה נכתבת גם ל-games/index.html וגם לשורש הפרויקט (index.html): זה דף הבית של הפורטל ב-GitHub Pages
export function writeGallery(manifest, outDir) {
  fs.writeFileSync(path.join(outDir, 'index.html'), renderGallery(manifest, ''));
  if (path.resolve(outDir) === path.join(ROOT, 'games')) {
    fs.writeFileSync(path.join(ROOT, 'index.html'), renderGallery(manifest, 'games/'));
  }
}

function renderGallery(manifest, prefix) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const list = [...manifest].reverse();
  const genres = [...new Set(list.map(m => m.genreName))];
  const cards = list.map((m, i) => {
    const t = THEMES.find(x => x.id === m.theme) || THEMES[0];
    return `<a class="g" data-genre="${esc(m.genreName)}" href="${prefix}${m.slug}/index.html" style="--a:${t.palette.accent};--b:${t.palette.bg};--b2:${t.palette.bg2}">
      ${i < 3 ? '<span class="new">חדש</span>' : ''}${m.thumb
        ? `<div class="th"><img src="${prefix}${m.slug}/${m.thumb}" alt="" loading="lazy" width="390" height="560"><span class="ic sm">${m.icon}</span></div>`
        : `<div class="ic">${m.icon}</div>`}<div class="tt">${esc(m.title)}</div>
      <div class="tags"><span>${esc(m.genreName)}</span>${m.variant && m.variant !== 'classic' ? `<span>${esc(m.variantName)}</span>` : ''}<span>${esc(m.themeName)}</span><span>${esc(m.difficultyName)}</span></div></a>`;
  }).join('\n');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Mega Games</title>
<meta name="description" content="פורטל משחקי דפדפן חינמיים בעברית, שנוצרים אוטומטית לפי הז'אנרים הפופולריים">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎮</text></svg>">
<style>
:root{--bg:#0e0f14;--fg:#f1f2f6;--mut:#9aa0b4;--line:#262a36;--chip:#1b1e28;--acc:#ffcc33}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f6f6f9;--fg:#15161c;--mut:#5d6275;--line:#dcdde5;--chip:#e8e9f0;--acc:#b8860b}}
:root[data-theme="dark"]{--bg:#0e0f14;--fg:#f1f2f6;--mut:#9aa0b4;--line:#262a36;--chip:#1b1e28;--acc:#ffcc33}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,"Segoe UI",Arial,sans-serif;-webkit-tap-highlight-color:transparent}
.wrap{max-width:1040px;margin:0 auto;padding:28px 16px 60px}
h1{margin:0;font-size:36px}.sub{color:var(--mut);margin:6px 0 18px;line-height:1.5}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.chips button{font:inherit;font-size:14px;font-weight:700;padding:7px 14px;border-radius:99px;border:1px solid var(--line);background:var(--chip);color:var(--fg);cursor:pointer}
.chips button.on{background:var(--acc);color:#111;border-color:var(--acc)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.g{position:relative;display:flex;flex-direction:column;gap:8px;padding:18px;border-radius:18px;text-decoration:none;color:#fff;
background:linear-gradient(160deg,var(--b2),var(--b));border:2px solid transparent;transition:transform .15s,border-color .15s}
.g:hover,.g:focus-visible{transform:translateY(-3px);border-color:var(--a);outline:none}
.g.hide{display:none}
.ic{font-size:52px}.tt{font-size:20px;font-weight:800}
.tags{display:flex;flex-wrap:wrap;gap:6px}.tags span{font-size:12px;padding:3px 8px;border-radius:99px;background:#ffffff1f;white-space:nowrap}
.th{position:relative;margin:-18px -18px 2px;aspect-ratio:4/5;overflow:hidden;border-radius:16px 16px 0 0;background:var(--b)}
.th img{width:100%;height:100%;object-fit:cover;object-position:center 60%;display:block}
.ic.sm{position:absolute;bottom:8px;right:8px;font-size:30px;line-height:1;background:#0008;border-radius:12px;padding:6px}
.new{z-index:1;position:absolute;top:12px;left:12px;font-size:11px;font-weight:900;padding:3px 8px;border-radius:99px;background:var(--a);color:#111}
footer{margin-top:36px;color:var(--mut);font-size:13px}
@media (max-width:480px){.grid{grid-template-columns:1fr 1fr;gap:10px}.g{padding:14px}.th{margin:-14px -14px 2px}.ic{font-size:42px}.ic.sm{font-size:22px}.tt{font-size:16px}h1{font-size:30px}}
</style></head><body><div class="wrap">
<h1>🎮 Mega Games</h1>
<div class="sub">${manifest.length} משחקים חינמיים שנוצרו אוטומטית לפי הז'אנרים הפופולריים. בלי הורדה, בלי הרשמה: בוחרים ומשחקים, גם בנייד.</div>
<div class="chips" id="chips"><button class="on" data-g="">הכול</button>${genres.map(g => `<button data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
<div class="grid">${cards}</div>
<footer>נוצר ע"י Game Forge</footer>
</div>
<script>
document.getElementById('chips').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.g').forEach(c => c.classList.toggle('hide', !!b.dataset.g && c.dataset.genre !== b.dataset.g));
});
</script></body></html>`;
}
