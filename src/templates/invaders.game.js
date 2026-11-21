// יריות מול מערך פולשים: החללית יורה לבד, מזיזים אותה ימינה ושמאלה, ומחסלים מערך אויבים שיורד ויורה בחזרה.
// וריאציות (S.variant):
//   classic - המערך זז מצד לצד ויורד שורה בכל פעם שהוא מגיע לקצה; יש מחסות שנשחקות
//   dive    - המערך מתנדנד למעלה, ואויבים צוללים לעברך במסלולים מעוגלים
//   boss    - בכל שלב שלישי מגיע בוס ענק עם פס חיים ויריות מפוצלות
const VAR = S.variant || 'classic';
let ship, shots, eshots, foes, shields, level, lives, dir, t, fireT, boss, ufo, ufoT, triple, cell, gx, gy, inv;

function isBossLevel() { return VAR === 'boss' && level % 3 === 0; }

function buildLevel() {
  shots = []; eshots = []; boss = null; ufo = null; ufoT = rand(8, 14);
  const cols = W < 420 ? 7 : 9, rows = isBossLevel() ? 2 : Math.min(5, 3 + Math.floor((level + 1) / 2));
  cell = Math.min(54, (W - 40) / (cols + 1.5));
  gx = (W - cols * cell) / 2; gy = 76 + Math.min(level - 1, 4) * cell * 0.25; dir = 1;
  foes = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tier = Math.max(0, Math.min(T.enemies.length - 1, rows - 1 - r));
    foes.push({ c, r, ox: c * cell, oy: r * cell * 0.9, e: T.enemies[tier], hp: 1 + (tier >= 2 && level >= 3 ? 1 : 0), pts: (tier + 1) * 10, dive: null, x: 0, y: 0 });
  }
  if (isBossLevel()) boss = { x: W / 2, y: 120, hp: 40 + level * 8, max: 40 + level * 8, vx: 90, fireT: 1.5, hit: 0 };
  shields = [];
  if (VAR !== 'dive') {
    // מחסות: גושים קטנים שנשחקים מפגיעות (גם של האויבים וגם שלך)
    const n = W < 420 ? 3 : 4, bw = 9, by = ship.y - 90;
    for (let k = 0; k < n; k++) {
      const cx = W * (k + 1) / (n + 1);
      for (let i = -3; i <= 3; i++) for (let j = 0; j < 3; j++) {
        if (j === 2 && Math.abs(i) < 2) continue;
        shields.push({ x: cx + i * bw, y: by + j * bw, s: bw, hp: 2 });
      }
    }
  }
}

function foePos(f) {
  if (f.dive) return [f.x, f.y];
  if (VAR === 'dive') return [gx + f.ox + Math.sin(t * 1.2) * 30, gy + f.oy];
  return [gx + f.ox, gy + f.oy];
}

function playerHit() {
  if (ship.inv > 0) return;
  lives--; ship.inv = 1.6; burst(ship.x, ship.y, P.danger, 30, 240); beep(110, 0.35, 'sawtooth', 0.06);
  if (lives <= 0) gameOver(G.score, `הגעת לשלב ${level}`);
}

function killFoe(f, i) {
  foes.splice(i, 1);
  const [x, y] = foePos(f);
  G.score += f.pts * level; burst(x, y, P.danger, 12, 170);
  beep(220 + Math.random() * 120, 0.08, 'square', 0.04);
}

function hitShield(x, y) {
  for (let i = shields.length - 1; i >= 0; i--) {
    const s = shields[i];
    if (Math.abs(x - s.x) < s.s / 2 + 2 && Math.abs(y - s.y) < s.s / 2 + 4) {
      if (--s.hp <= 0) shields.splice(i, 1);
      return true;
    }
  }
  return false;
}

function levelClear() {
  const bonus = 150 * level; G.score += bonus;
  floatText(W / 2, H / 2, `שלב ${level} הושלם! +${bonus}`, P.accent, 28);
  beep(880, 0.15, 'triangle'); setTimeout(() => beep(1320, 0.2, 'triangle'), 120);
  level++; buildLevel();
  if (isBossLevel()) floatText(W / 2, H / 2 + 40, '⚠️ בוס!', P.danger, 30);
}

const game = {
  resize() { if (ship) ship.y = H - Math.max(80, H * 0.11); },
  reset() {
    ship = { x: W / 2, y: H - Math.max(80, H * 0.11), inv: 0 };
    level = 1; lives = 3; t = 0; fireT = 0; triple = 0; inv = 0;
    buildLevel();
  },
  down(x) { ship.x = clamp(x, 24, W - 24); },
  move(x) { ship.x = clamp(x, 24, W - 24); },
  update(dt) {
    t += dt; ship.inv -= dt; triple -= dt;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) ship.x -= 420 * dt;
    if (keys.has('ArrowRight') || keys.has('KeyD')) ship.x += 420 * dt;
    ship.x = clamp(ship.x, 24, W - 24);

    // ירי אוטומטי
    fireT -= dt;
    if (fireT <= 0) {
      fireT = S.reload;
      const spread = triple > 0 ? [-0.18, 0, 0.18] : [0];
      for (const a of spread) shots.push({ x: ship.x, y: ship.y - 22, vx: Math.sin(a) * 620, vy: -Math.cos(a) * 620 });
      beep(880, 0.03, 'square', 0.012);
    }

    // תנועת המערך
    const alive = foes.filter(f => !f.dive).length, total = Math.max(1, alive + foes.filter(f => f.dive).length);
    if (VAR !== 'dive') {
      const sp = S.speed * (1 + (level - 1) * 0.12) * (1 + (1 - foes.length / Math.max(1, foes.length + 1)) * 0.2) * (foes.length < 6 ? 1.8 : 1);
      gx += dir * sp * dt;
      const xs = foes.map(f => gx + f.ox);
      if (xs.length && (Math.min(...xs) < 20 || Math.max(...xs) > W - 20)) {
        dir *= -1; gx += dir * sp * dt * 2; gy += cell * 0.45; beep(90, 0.06, 'square', 0.03);
      }
    } else if (foes.length) {
      // צוללים: כל כמה שניות אויב יוצא מהמערך ומסתער במסלול מעוגל
      inv -= dt;
      if (inv <= 0) {
        const pool = foes.filter(f => !f.dive);
        if (pool.length) {
          const f = pick(pool), [x, y] = foePos(f);
          f.dive = { t: 0, sx: x, sy: y, tx: ship.x, side: x < W / 2 ? 1 : -1 }; f.x = x; f.y = y;
          beep(300, 0.2, 'sawtooth', 0.025);
        }
        inv = Math.max(0.6, S.diveEvery - level * 0.15);
      }
      for (const f of foes) {
        if (!f.dive) continue;
        const d = f.dive; d.t += dt * (0.55 + level * 0.04);
        const k = d.t;
        f.x = d.sx + Math.sin(k * Math.PI) * 120 * d.side + (d.tx - d.sx) * Math.min(1, k);
        f.y = d.sy + k * (H - d.sy + 60);
        if (Math.random() < dt * 0.9) eshots.push({ x: f.x, y: f.y + 16, vx: 0, vy: 280 });
        if (f.y > H + 40) { f.dive = null; } // חוזר לעמדה במערך
        else if (dist(f.x, f.y, ship.x, ship.y) < cell * 0.55) { playerHit(); f.dive = null; }
      }
    }

    // ירי האויבים: מהאויב התחתון בעמודה אקראית
    if (foes.length && Math.random() < dt * S.enemyFire * (1 + level * 0.15)) {
      const cols = [...new Set(foes.filter(f => !f.dive).map(f => f.c))];
      if (cols.length) {
        const c = pick(cols), f = foes.filter(x => x.c === c && !x.dive).sort((a, b) => b.r - a.r)[0], [x, y] = foePos(f);
        eshots.push({ x, y: y + 16, vx: 0, vy: 260 + level * 12 });
      }
    }

    if (boss) {
      boss.x += boss.vx * dt; if (boss.x < 80 || boss.x > W - 80) boss.vx *= -1;
      boss.hit -= dt; boss.fireT -= dt;
      if (boss.fireT <= 0) {
        boss.fireT = Math.max(0.7, 1.6 - level * 0.05);
        for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) eshots.push({ x: boss.x, y: boss.y + 40, vx: Math.sin(a) * 240, vy: Math.cos(a) * 240 });
        beep(140, 0.15, 'sawtooth', 0.04);
      }
    }

    // צלחת בונוס שחוצה את המסך: פגיעה בה נותנת ירי משולש
    ufoT -= dt;
    if (!ufo && ufoT <= 0) { ufo = { x: -30, y: 58, vx: 150 }; }
    if (ufo) { ufo.x += ufo.vx * dt; if (ufo.x > W + 40) { ufo = null; ufoT = rand(10, 18); } }

    // קליעים שלך
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.x += s.vx * dt; s.y += s.vy * dt;
      let gone = s.y < 40; // הקליעים שלך עוברים דרך המחסות; רק יריות האויבים שוחקות אותן
      if (!gone && ufo && dist(s.x, s.y, ufo.x, ufo.y) < 22) {
        gone = true; triple = 10; G.score += 100 * level; burst(ufo.x, ufo.y, P.accent, 25, 200);
        floatText(ufo.x, ufo.y + 20, '🔱 ירי משולש!', P.accent, 20); beep(1200, 0.2, 'triangle', 0.05); ufo = null; ufoT = rand(12, 20);
      }
      if (!gone && boss && Math.abs(s.x - boss.x) < 46 && Math.abs(s.y - boss.y) < 40) {
        gone = true; boss.hp--; boss.hit = 0.08; beep(160, 0.03, 'square', 0.02);
        if (boss.hp <= 0) { burst(boss.x, boss.y, P.danger, 70, 320); G.score += 1000 * level; boss = null; floatText(W / 2, 140, 'הבוס הובס!', P.accent, 30); }
      }
      for (let j = foes.length - 1; j >= 0 && !gone; j--) {
        const f = foes[j], [x, y] = foePos(f);
        if (Math.abs(s.x - x) < cell * 0.42 && Math.abs(s.y - y) < cell * 0.42) {
          gone = true;
          if (--f.hp <= 0) killFoe(f, j); else beep(500, 0.03, 'square', 0.02);
        }
      }
      if (gone) shots.splice(i, 1);
    }
    // קליעי אויבים
    for (let i = eshots.length - 1; i >= 0; i--) {
      const s = eshots[i]; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > H + 10 || hitShield(s.x, s.y)) { eshots.splice(i, 1); continue; }
      if (Math.abs(s.x - ship.x) < 18 && Math.abs(s.y - ship.y) < 18) { eshots.splice(i, 1); playerHit(); if (G.state !== 'play') return; }
    }
    // המערך הגיע למטה
    if (VAR !== 'dive' && foes.some(f => gy + f.oy > ship.y - 40)) { gameOver(G.score, `הפולשים נחתו · שלב ${level}`); return; }
    if (!foes.length && !boss) levelClear();
  },
  draw() {
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    // כוכבים ברקע
    ctx.fillStyle = P.fg + '55';
    for (let i = 0; i < 60; i++) { const x = (i * 97) % W, y = ((i * 53) % H + (t || 0) * (10 + i % 5 * 8)) % H; ctx.fillRect(x, y, 2, 2); }
    if (!ship) return;
    for (const s of shields) { ctx.fillStyle = s.hp > 1 ? P.accent : P.accent + '88'; ctx.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s - 1, s.s - 1); }
    for (const f of foes) {
      const [x, y] = foePos(f);
      const bob = Math.sin(t * 6 + f.c) * 2;
      drawEmoji(f.e, x, y + bob, cell * 0.72, f.dive ? f.x < ship.x : false);
    }
    if (boss) {
      if (boss.hit > 0) { ctx.fillStyle = '#fff6'; ctx.beginPath(); ctx.arc(boss.x, boss.y, 52, 0, 7); ctx.fill(); }
      drawEmoji(T.boss, boss.x, boss.y, 96);
      ctx.fillStyle = '#0008'; ctx.fillRect(W * 0.15, 54, W * 0.7, 8);
      ctx.fillStyle = P.danger; ctx.fillRect(W * 0.15, 54, W * 0.7 * boss.hp / boss.max, 8);
    }
    if (ufo) drawEmoji(T.pickup, ufo.x, ufo.y, 30);
    ctx.fillStyle = P.accent; ctx.shadowColor = P.accent; ctx.shadowBlur = 8;
    for (const s of shots) ctx.fillRect(s.x - 2, s.y - 8, 4, 14);
    ctx.shadowBlur = 0; ctx.fillStyle = P.danger;
    for (const s of eshots) { ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, 7); ctx.fill(); }
    if (!(ship.inv > 0 && Math.floor(ship.inv * 10) % 2)) {
      ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(-Math.PI / 4 * (T.hero === '🚀' ? 1 : 0));
      drawEmoji(T.hero, 0, 0, 42); ctx.restore();
    }
    drawFx();
    hud(`${'❤️'.repeat(Math.max(0, lives))}`, `שלב ${level}${triple > 0 ? ' · 🔱' : ''} · ⭐ ${fmt(G.score)}`);
  },
};
