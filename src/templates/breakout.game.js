// שובר לבנים: מזיזים מחבט, מקפיצים כדור ושוברים את כל הלבנים. בונוסים נופלים מלבנים שבורות.
// וריאציות (S.variant):
//   classic - שלבים עם תבניות לבנים, חלק מהלבנים צריכות שתי פגיעות
//   moving  - הלבנים יורדות לאט; אם הן מגיעות למחבט המשחק נגמר
//   tough   - לבנים עם מספר פגיעות, ולבני מתכת שאי אפשר לשבור
const VAR = S.variant || 'classic';
const COLS = ['#ff5d73', '#ffb02e', '#ffe14d', '#4cd97b', '#3ec9ff', '#b77bff'];
const POWERS = [
  { id: 'wide', e: '↔️', w: 4 }, { id: 'multi', e: '✨', w: 3 }, { id: 'slow', e: '🐢', w: 3 }, { id: 'life', e: '❤️', w: 1 },
];
let pad, balls, bricks, drops, level, lives, launched, t, wideT, slowT, cols, bw, bh, topY, padY, lastX;

function speed() { return S.ballSpeed * (1 + (level - 1) * 0.06) * (slowT > 0 ? 0.7 : 1); }

function buildLevel() {
  cols = W < 420 ? 8 : 10;
  bw = (W - 20) / cols; bh = Math.min(30, Math.max(20, bw * 0.48)); topY = 64;
  const rows = Math.min(9, 4 + level);
  const shape = (level - 1) % 4;
  bricks = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    // תבניות שמתחלפות בין שלבים: מלא, שחמט, פירמידה, מסגרת
    if (shape === 1 && (r + c) % 2) continue;
    if (shape === 2 && Math.abs(c - (cols - 1) / 2) > rows - r + 0.5) continue;
    if (shape === 3 && r > 0 && r < rows - 1 && c > 0 && c < cols - 1 && r % 2) continue;
    let hp = 1;
    if (VAR === 'classic' && level >= 2 && r < 2) hp = 2;
    if (VAR === 'tough') hp = 1 + Math.floor((rows - r) / 3) + Math.floor(level / 3);
    const steel = VAR === 'tough' && level >= 2 && r === rows - 1 && c % 3 === 1;
    bricks.push({ x: 10 + c * bw, y: topY + r * bh, w: bw, h: bh, hp: steel ? Infinity : hp, max: hp, steel, color: COLS[r % COLS.length], e: T.gems[r % T.gems.length] });
  }
  drops = [];
  resetBall();
}
function resetBall() {
  launched = false;
  balls = [{ x: pad.x, y: padY - 14, vx: 0, vy: 0, r: 8, trail: [] }];
}
function launch() {
  if (launched) return;
  launched = true;
  const a = rand(-0.35, 0.35), sp = speed();
  balls[0].vx = Math.sin(a) * sp; balls[0].vy = -Math.cos(a) * sp;
  beep(520, 0.06, 'triangle');
}
function breakable() { return bricks.filter(b => !b.steel).length; }

function hitBrick(b, i) {
  if (b.steel) { beep(900, 0.03, 'square', 0.02); return; }
  b.hp--;
  if (b.hp > 0) { beep(380, 0.04, 'square', 0.03); return; }
  bricks.splice(i, 1);
  const pts = 10 * level * b.max; G.score += pts;
  burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 10, 160);
  beep(500 + Math.random() * 300, 0.05, 'triangle', 0.035);
  if (Math.random() < 0.13) {
    const tot = POWERS.reduce((a, p) => a + p.w, 0); let r = Math.random() * tot, pw = POWERS[0];
    for (const p of POWERS) { r -= p.w; if (r <= 0) { pw = p; break; } }
    drops.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, p: pw });
  }
  if (!breakable()) {
    const bonus = 100 * level + lives * 50; G.score += bonus;
    floatText(W / 2, H / 2, `שלב ${level} הושלם! +${bonus}`, P.accent, 28);
    beep(880, 0.15, 'triangle'); setTimeout(() => beep(1320, 0.2, 'triangle'), 120);
    level++; buildLevel();
  }
}

function power(p) {
  floatText(pad.x, padY - 30, p.e, P.accent, 26); beep(1000, 0.1, 'sine', 0.04);
  if (p.id === 'wide') wideT = 12;
  if (p.id === 'slow') slowT = 8;
  if (p.id === 'life') lives = Math.min(5, lives + 1);
  if (p.id === 'multi') {
    const extra = [];
    for (const b of balls.slice(0, 4)) for (const a of [-0.5, 0.5]) {
      const sp = Math.hypot(b.vx, b.vy) || speed(), ang = Math.atan2(b.vx, -b.vy) + a;
      extra.push({ x: b.x, y: b.y, vx: Math.sin(ang) * sp, vy: -Math.cos(ang) * sp, r: b.r, trail: [] });
    }
    if (launched) balls.push(...extra);
  }
}

function step(dt) {
  const pw = pad.w * (wideT > 0 ? 1.5 : 1);
  for (let k = balls.length - 1; k >= 0; k--) {
    const b = balls[k];
    if (!launched) { b.x = pad.x; b.y = padY - 14; continue; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y < 52 + b.r) { b.y = 52 + b.r; b.vy = Math.abs(b.vy); }
    // מחבט: זווית היציאה תלויה במקום הפגיעה
    if (b.vy > 0 && b.y + b.r >= padY - 7 && b.y - b.r <= padY + 7 && Math.abs(b.x - pad.x) <= pw / 2 + b.r) {
      const off = clamp((b.x - pad.x) / (pw / 2), -1, 1), ang = off * 1.05, sp = speed();
      b.vx = Math.sin(ang) * sp; b.vy = -Math.cos(ang) * sp; b.y = padY - 7 - b.r;
      beep(300, 0.04, 'triangle', 0.03);
    }
    // לבנים: מוצאים את הלבנה החופפת ומחזירים לפי צד החדירה הקטן
    for (let i = bricks.length - 1; i >= 0; i--) {
      const r = bricks[i];
      const nx = clamp(b.x, r.x, r.x + r.w), ny = clamp(b.y, r.y, r.y + r.h);
      if ((b.x - nx) ** 2 + (b.y - ny) ** 2 > b.r * b.r) continue;
      const ox = Math.min(b.x + b.r - r.x, r.x + r.w - (b.x - b.r)), oy = Math.min(b.y + b.r - r.y, r.y + r.h - (b.y - b.r));
      if (ox < oy) { b.vx = b.x < r.x + r.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); }
      else { b.vy = b.y < r.y + r.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); }
      hitBrick(r, i);
      break;
    }
    if (b.y - b.r > H) balls.splice(k, 1);
  }
}

const game = {
  resize() { padY = H - Math.max(70, H * 0.1); if (pad) pad.y = padY; },
  reset() {
    padY = H - Math.max(70, H * 0.1);
    pad = { x: W / 2, w: Math.min(W * 0.3, S.padW) };
    level = 1; lives = 3; t = 0; wideT = 0; slowT = 0; lastX = null;
    buildLevel();
  },
  down(x) { pad.x = clamp(x, 0, W); lastX = x; launch(); },
  move(x) { pad.x = clamp(x, 0, W); },
  key(code) { if (code === 'Space' || code === 'ArrowUp') launch(); },
  update(dt) {
    t += dt; wideT -= dt; slowT -= dt;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) pad.x -= 720 * dt;
    if (keys.has('ArrowRight') || keys.has('KeyD')) pad.x += 720 * dt;
    pad.x = clamp(pad.x, 0, W);
    // צעדים קטנים כדי שכדור מהיר לא יעבור דרך לבנים
    const n = Math.ceil(dt * speed() / 5);
    for (let s = 0; s < n; s++) step(dt / n);
    for (const b of balls) { b.trail.push([b.x, b.y]); if (b.trail.length > 6) b.trail.shift(); }
    if (!balls.length) {
      lives--; beep(150, 0.3, 'sawtooth', 0.05);
      if (lives <= 0) { gameOver(G.score, `הגעת לשלב ${level}`); return; }
      floatText(W / 2, H / 2, 'נשארו ' + lives + ' ❤️', P.danger, 26); resetBall();
    }
    const pw = pad.w * (wideT > 0 ? 1.5 : 1);
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.y += 170 * dt;
      if (d.y > padY - 12 && d.y < padY + 16 && Math.abs(d.x - pad.x) < pw / 2 + 14) { power(d.p); drops.splice(i, 1); }
      else if (d.y > H + 20) drops.splice(i, 1);
    }
    if (VAR === 'moving' && launched) {
      for (const b of bricks) b.y += S.descend * (1 + level * 0.08) * dt;
      if (bricks.some(b => !b.steel && b.y + b.h > padY - 24)) { gameOver(G.score, `הלבנים הגיעו אליך · שלב ${level}`); return; }
    }
  },
  draw() {
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    if (!pad) return;
    ctx.fillStyle = P.grid + '55';
    for (let x = 0; x < W; x += 40) ctx.fillRect(x, 0, 1, H);
    for (const b of bricks) {
      const m = 2;
      if (b.steel) { ctx.fillStyle = '#8a93a6'; roundRect(b.x + m, b.y + m, b.w - 2 * m, b.h - 2 * m, 5); ctx.fill(); ctx.strokeStyle = '#d5dbe6'; ctx.lineWidth = 2; ctx.stroke(); continue; }
      const fade = b.max > 1 ? 0.45 + 0.55 * (b.hp / b.max) : 1;
      ctx.globalAlpha = fade;
      ctx.fillStyle = b.color; roundRect(b.x + m, b.y + m, b.w - 2 * m, b.h - 2 * m, 6); ctx.fill();
      ctx.fillStyle = '#ffffff44'; roundRect(b.x + m + 2, b.y + m + 2, b.w - 2 * m - 4, (b.h - 2 * m) * 0.35, 4); ctx.fill();
      ctx.globalAlpha = 1;
      if (b.w > 34) drawEmoji(b.e, b.x + b.w / 2, b.y + b.h / 2, b.h * 0.62);
      if (b.hp > 1) {
        ctx.fillStyle = '#000'; ctx.font = `900 ${b.h * 0.45}px system-ui`; ctx.textAlign = 'center';
        ctx.fillText(b.hp, b.x + b.w - 9, b.y + b.h * 0.45);
      }
    }
    for (const d of drops) {
      ctx.fillStyle = P.bg2; ctx.beginPath(); ctx.arc(d.x, d.y, 15, 0, 7); ctx.fill();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.stroke();
      drawEmoji(d.p.e, d.x, d.y, 18);
    }
    const pw = pad.w * (wideT > 0 ? 1.5 : 1);
    ctx.shadowColor = P.accent; ctx.shadowBlur = 14;
    ctx.fillStyle = P.accent; roundRect(pad.x - pw / 2, padY - 7, pw, 14, 7); ctx.fill();
    ctx.shadowBlur = 0;
    for (const b of balls) {
      b.trail.forEach(([x, y], i) => { ctx.globalAlpha = i / 12; ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(x, y, b.r * 0.8, 0, 7); ctx.fill(); });
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    }
    if (!launched && G.state === 'play') {
      ctx.fillStyle = P.fg; ctx.font = '800 18px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('לחץ כדי לשגר', W / 2, padY - 60);
    }
    drawFx();
    const fx2 = (wideT > 0 ? ' ↔️' : '') + (slowT > 0 ? ' 🐢' : '');
    hud(`${'❤️'.repeat(Math.max(0, lives))}`, `שלב ${level} · ⭐ ${fmt(G.score)}${fx2}`);
  },
};
