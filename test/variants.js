// בדיקת וריאציות החוקים: כל ז'אנר × כל וריאציה נבנה, רץ בדפדפן בלי שגיאות,
// והמכניקה הייחודית של הווריאציה באמת קורית.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { plan, build } from '../src/forge.js';
import { VARIANTS } from '../src/variants.js';
import { playtest } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-var-'));
const browser = await chromium.launch();
let failed = 0;

// בדיקה ייעודית לכל וריאציה: מחזירה מחרוזת שגיאה, או null אם המכניקה עובדת
const CHECKS = {
  'survivors/zone': async p => {
    const r0 = await p.evaluate(() => zone && zone.r);
    await p.waitForTimeout(1200);
    const r1 = await p.evaluate(() => zone.r);
    await p.evaluate(() => { pl.x = zone.x + zone.r + 200; pl.y = zone.y; pl.hp = 9; pl.maxHp = 9; });
    await p.waitForTimeout(1900);
    const hp = await p.evaluate(() => pl.hp);
    return !(r1 < r0) ? 'האזור לא מתכווץ' : hp >= 9 ? 'אין נזק מחוץ לאזור' : null;
  },
  'survivors/orbiter': async p => {
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => ({ orbs: st.orbs, bullets: bullets.length }));
    return r.orbs < 3 ? 'אין מגינים' : r.bullets > 0 ? 'יש יריות למרות שאין נשק' : null;
  },
  'runner/flip': async p => {
    await p.waitForTimeout(400);
    await p.mouse.click(200, 400);
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({ g: hero.g, cy: hero.cy, ceil: ceilY + hero.size / 2 }));
    return r.g !== -1 ? 'הכבידה לא התהפכה' : Math.abs(r.cy - r.ceil) > 2 ? 'הגיבור לא הגיע לתקרה' : null;
  },
  'runner/fly': async p => {
    const mid = await p.evaluate(() => (groundY + ceilY) / 2);
    await p.waitForTimeout(800);
    const hover = await p.evaluate(() => hero.cy);
    if (Math.abs(hover - mid) > 10 || (await p.evaluate(() => G.state)) !== 'play') return 'הגיבור לא מרחף עד הלחיצה הראשונה';
    const y0 = await p.evaluate(() => hero.cy);
    await p.mouse.move(200, 400); await p.mouse.down(); await p.waitForTimeout(350); await p.mouse.up();
    const y1 = await p.evaluate(() => hero.cy);
    await p.evaluate(() => { hero.cy = (groundY + ceilY) / 2; hero.vy = 0; });
    await p.waitForTimeout(1500);
    const n = await p.evaluate(() => pillars.length);
    return !(y1 < y0) ? 'החזקה לא מעלה את הגיבור' : n === 0 && (await p.evaluate(() => G.state)) === 'play' ? 'אין עמודים' : null;
  },
  'merge/drop': async p => {
    const r = await p.evaluate(() => { const before = board.filter(v => v >= 0).length; const col = 2; place(landing(col)); return { before, bottom: board[(N - 1) * N + col] }; });
    return r.before !== 0 ? 'הלוח לא מתחיל ריק' : r.bottom < 0 ? 'הפריט לא נפל לתחתית העמודה' : null;
  },
  'merge/rocks': async p => {
    const n = await p.evaluate(() => {
      for (let k = 0; k < S.rockEvery; k++) { const e = board.indexOf(-1); nextT = (k % 2) + 4; place(e); }
      return board.filter(v => v === ROCK).length;
    });
    return n < 1 ? 'לא הופיע סלע' : null;
  },
  'blockpuzzle/bombs': async p => {
    const r = await p.evaluate(() => {
      // מניח 4 צורות של משבצת אחת כדי להפעיל את מנגנון הפצצות
      for (let k = 0; k < 4; k++) {
        const i = board.findIndex(c => !c); tray[0] = { sh: { cells: [[0, 0]], w: 1, h: 1 }, color: '#f00', e: null };
        drag = { i: 0, p: tray[0], x: bx + (i % N + 0.5) * cs, y: by + (((i / N) | 0) + 0.5) * cs }; game.up();
      }
      const b = board.find(c => c && c.bomb);
      const before = b && b.bomb;
      const i = board.findIndex(c => !c); tray[0] = { sh: { cells: [[0, 0]], w: 1, h: 1 }, color: '#f00', e: null };
      drag = { i: 0, p: tray[0], x: bx + (i % N + 0.5) * cs, y: by + (((i / N) | 0) + 0.5) * cs }; game.up();
      return { before, after: b && b.bomb };
    });
    return !r.before ? 'לא הופיעה פצצה' : r.after !== r.before - 1 ? 'הספירה לאחור לא יורדת' : null;
  },
  'blockpuzzle/stars': async p => {
    const n = await p.evaluate(() => ({ left: starsLeft, onBoard: board.filter(c => c && c.star).length }));
    return n.left !== 3 || n.onBoard !== 3 ? `צריכים להיות 3 כוכבים (יש ${n.onBoard})` : null;
  },
  'match3/ice': async p => {
    const r = await p.evaluate(() => ({ total: iceTotal, left: iceLeft() }));
    return r.total < 10 || r.left !== r.total ? 'אין קרח על הלוח' : null;
  },
  'match3/timed': async p => {
    const t0 = await p.evaluate(() => timeLeft);
    await p.waitForTimeout(1200);
    const t1 = await p.evaluate(() => timeLeft);
    return !(t0 > 20 && t1 < t0) ? 'השעון לא רץ' : null;
  },
  'arrows/timed': async p => {
    const t0 = await p.evaluate(() => timeLeft);
    await p.waitForTimeout(1100);
    const t1 = await p.evaluate(() => timeLeft);
    return !(t0 > 5 && t1 < t0) ? 'השעון לא רץ' : null;
  },
  'breakout/classic': async p => {
    const r0 = await p.evaluate(() => ({ bricks: bricks.length, launched }));
    await p.mouse.click(200, 600);
    await p.waitForTimeout(2500);
    const r1 = await p.evaluate(() => ({ bricks: bricks.length, launched, score: G.score, state: G.state }));
    return r0.bricks < 10 ? 'אין לבנים' : !r1.launched && r1.state === 'play' ? 'הכדור לא שוגר' : null;
  },
  'breakout/moving': async p => {
    const y0 = await p.evaluate(() => bricks[0].y);
    await p.mouse.click(200, 600); await p.waitForTimeout(1500);
    const y1 = await p.evaluate(() => bricks.length ? Math.min(...bricks.map(b => b.y)) : 999);
    return !(y1 > y0) ? 'הלבנים לא יורדות' : null;
  },
  'breakout/tough': async p => {
    const r = await p.evaluate(() => ({ multi: bricks.filter(b => !b.steel && b.max > 1).length }));
    return r.multi < 3 ? 'אין לבנים שצריכות כמה פגיעות' : null;
  },
  'invaders/classic': async p => {
    const r0 = await p.evaluate(() => ({ foes: foes.length, gx, gy, shields: shields.length }));
    await p.waitForTimeout(2000);
    const r1 = await p.evaluate(() => ({ foes: foes.length, gx, score: G.score }));
    return r0.foes < 15 ? 'אין מערך' : r0.shields < 10 ? 'אין מחסות' : r1.gx === r0.gx ? 'המערך לא זז' : r1.foes >= r0.foes ? 'הירי האוטומטי לא פוגע' : null;
  },
  'invaders/dive': async p => {
    await p.evaluate(() => { inv = 0; });
    await p.waitForTimeout(400);
    const n = await p.evaluate(() => foes.filter(f => f.dive).length);
    return n < 1 ? 'אף אויב לא צולל' : null;
  },
  'invaders/boss': async p => {
    const r = await p.evaluate(() => { level = 2; levelClear(); return { boss: !!boss, hp: boss && boss.hp, lvl: level }; });
    return !r.boss ? 'אין בוס בשלב 3' : null;
  },
  'idle/golden': async p => {
    await p.evaluate(() => { goldIn = 0; });
    await p.waitForTimeout(300);
    const btn = await p.$('button[aria-label="בונוס"]');
    if (!btn) return 'הבונוס לא הופיע';
    await btn.click();
    return (await p.evaluate(() => frenzy)) > 10 ? null : 'לחיצה על הבונוס לא הפעילה ייצור כפול';
  },
  'idle/combo': async p => {
    for (let k = 0; k < 6; k++) await p.click('#tap');
    const c = await p.evaluate(() => combo);
    return c >= 3 ? null : 'הקומבו לא עולה בלחיצות מהירות';
  },
};

for (const [genre, list] of Object.entries(VARIANTS)) {
  for (const v of list) {
    const pl = plan({ seed: `var-${genre}-${v.id}`, genre, variant: v.id, theme: 'candy' });
    const html = build(pl);
    // 1. משחק אקראי: בלי שגיאות
    const t = await playtest(html, { seconds: 4 });
    const errs = [...t.errors];
    // 2. המכניקה הייחודית
    const key = `${genre}/${v.id}`;
    if (CHECKS[key]) {
      const file = path.join(dir, pl.slug + '.html');
      fs.writeFileSync(file, html);
      const page = await browser.newPage({ viewport: { width: 400, height: 760 } });
      page.on('pageerror', e => errs.push(e.message));
      await page.goto('file://' + file);
      await page.waitForTimeout(300);
      const play = await page.$('#play'); if (play) await play.click();
      await page.waitForTimeout(300);
      const msg = await CHECKS[key](page).catch(e => 'החריגה בבדיקה: ' + e.message);
      if (msg) errs.push(msg);
      await page.close();
    }
    const ok = errs.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? '✅' : '❌'} ${key.padEnd(20)} ${pl.title}${ok ? '' : '\n   ' + errs.join('\n   ')}`);
  }
}
await browser.close();
fs.rmSync(dir, { recursive: true, force: true });
if (failed) { console.log(`\n${failed} כשלונות`); process.exit(1); }
console.log('\n✅ כל הווריאציות עובדות');
