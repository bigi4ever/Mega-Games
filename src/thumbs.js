// תמונות לפורטל: צילום מסך אמיתי של כל משחק באמצע משחק (games/<slug>/thumb.jpg).
// דורש Playwright. בלעדיו הפורטל מציג את האימוג'י של המשחק במקום תמונה.
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright } from './validate.js';

export const THUMB = 'thumb.jpg';

// מה עושים בכל ז'אנר לפני הצילום, כדי שהתמונה תראה משחק "חי" ולא מסך ריק
const SHOWCASE = {
  async survivors(p) { await p.waitForTimeout(3200); },
  async runner(p, v) {
    if (v === 'fly') { for (let k = 0; k < 4; k++) { await p.mouse.down(); await p.waitForTimeout(160); await p.mouse.up(); await p.waitForTimeout(260); } }
    else await p.waitForTimeout(1100);
  },
  async merge(p) {
    await p.evaluate(() => {
      for (let k = 0; k < 9; k++) {
        const empty = board.map((x, i) => (x === -1 ? i : -1)).filter(i => i >= 0);
        if (!empty.length) break;
        nextT = k % 4;
        place(S.variant === 'drop' ? landing(randi(0, N - 1)) : pick(empty));
      }
    });
    await p.waitForTimeout(500);
  },
  async blockpuzzle(p) {
    await p.evaluate(() => {
      for (let k = 0; k < 6; k++) {
        const pc = tray.find(Boolean); if (!pc) refill();
        const i0 = tray.findIndex(Boolean), pz = tray[i0];
        for (let tries = 0; tries < 40; tries++) {
          const gx = randi(0, N - pz.sh.w), gy = randi(0, N - pz.sh.h);
          if (fits(pz.sh, gx, gy)) {
            drag = { i: i0, p: pz, x: bx + (gx + pz.sh.w / 2) * cs, y: by + (gy + pz.sh.h / 2) * cs }; game.up(); break;
          }
        }
      }
    });
    await p.waitForTimeout(500);
  },
  async match3(p) { await p.waitForTimeout(1300); },
  async arrows(p) { await p.waitForTimeout(500); },
  async breakout(p) { await p.mouse.click(195, 450); await p.waitForTimeout(1600); },
  async invaders(p) { await p.waitForTimeout(1800); },
  async idle(p) { for (let k = 0; k < 12; k++) await p.click('#tap').catch(() => {}); await p.waitForTimeout(400); },
};

/**
 * מצלם תמונה לכל משחק במניפסט שאין לו (או לכולם, עם all=true). מעדכן את m.thumb.
 * מחזיר את מספר התמונות שנוצרו, או -1 אם Playwright לא זמין.
 */
export async function makeThumbs(manifest, outDir, { all = false, log = () => {} } = {}) {
  const todo = manifest.filter(m => all || !m.thumb || !fs.existsSync(path.join(outDir, m.slug, THUMB)));
  if (!todo.length) return 0;
  const pw = loadPlaywright();
  if (!pw) { log('⚠️  Playwright לא מותקן: דילגתי על תמונות המשחקים (npm i -D playwright)'); return -1; }
  const browser = await pw.chromium.launch();
  let n = 0;
  try {
    for (const m of todo) {
      const file = path.join(outDir, m.slug, 'index.html');
      if (!fs.existsSync(file)) continue;
      const page = await browser.newPage({ viewport: { width: 390, height: 560 }, deviceScaleFactor: 1 });
      try {
        await page.goto('file://' + path.resolve(file));
        await page.waitForTimeout(400);
        const play = await page.$('#play'); if (play) await play.click();
        await page.waitForTimeout(250);
        await (SHOWCASE[m.genre] || (p => p.waitForTimeout(1500)))(page, m.variant || 'classic').catch(() => {});
        // מסתירים כרטיסים (למשל "המשחק נגמר") כדי שבתמונה יופיע המשחק עצמו
        await page.addStyleTag({ content: '#ov{display:none!important}' });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(outDir, m.slug, THUMB), type: 'jpeg', quality: 72 });
        m.thumb = THUMB; n++;
        log(`📸 ${m.title}`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  return n;
}
