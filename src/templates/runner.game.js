// ריצה אינסופית. שלוש וריאציות חוקים (S.variant):
//   classic - קפיצה וקפיצה כפולה מעל מכשולים
//   flip    - לחיצה הופכת את הכבידה: רצים על הרצפה או על התקרה, מכשולים משני הצדדים
//   fly     - מחזיקים כדי לעלות ומשחררים כדי לרדת, עוברים בין עמודים
const VAR = S.variant || 'classic';
let hero, obs, coins, pillars, distRun, speed, nextObs, nextCoins, coinsGot, passed, groundY, ceilY, t, holding, lastSide, lastGapY, started;

function jump() {
  if (VAR === 'flip') {
    if (!hero.grounded) return;
    hero.g *= -1; hero.grounded = false; hero.vy = 0;
    beep(hero.g > 0 ? 420 : 640, 0.08, 'triangle');
    burst(hero.x, hero.cy, P.fg, 5, 80);
    return;
  }
  if (VAR === 'fly') return;
  if (hero.jumps < 2) {
    hero.vy = -S.jump * (hero.jumps ? 0.85 : 1); hero.jumps++;
    beep(hero.jumps === 1 ? 520 : 780, 0.08, 'triangle');
    burst(hero.x, groundY, P.fg, 5, 80);
  }
}
function die() {
  burst(hero.x, VAR === 'classic' ? hero.y - hero.size / 2 : hero.cy, P.danger, 30, 250);
  const extra = VAR === 'fly' ? `עברת ${passed} עמודים ואספת ${coinsGot} ${T.pickup}` : `רצת ${Math.floor(distRun / 10)} מטר ואספת ${coinsGot} ${T.pickup}`;
  gameOver(G.score, extra);
}

const game = {
  resize() { groundY = H * 0.76; ceilY = Math.max(70, H * 0.18); },
  reset() {
    game.resize();
    hero = { x: Math.min(W * 0.22, 160), y: groundY, vy: 0, jumps: 0, size: 44, g: 1, grounded: true, cy: groundY - 22 };
    if (VAR === 'fly') hero.cy = (groundY + ceilY) / 2;
    obs = []; coins = []; pillars = []; distRun = 0; passed = 0; coinsGot = 0; t = 0; holding = false;
    speed = VAR === 'fly' ? S.speed * 0.7 : S.speed;
    nextObs = 1.2; nextCoins = 2; lastSide = 1; lastGapY = (groundY + ceilY) / 2;
    started = VAR !== 'fly'; // בטיסה: מרחפים במקום עד הלחיצה הראשונה
  },
  down() {
    holding = true;
    if (VAR === 'fly') { started = true; hero.vy = Math.min(hero.vy, -180); } // תגובה מיידית ללחיצה
    jump();
  },
  up() { holding = false; },
  key(code) {
    if (VAR === 'fly' && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW')) { started = true; hero.vy = Math.min(hero.vy, -180); }
    if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') jump();
  },
  update(dt) {
    if (!started) { hero.cy = (groundY + ceilY) / 2 + Math.sin(performance.now() / 300) * 8; return; }
    t += dt;
    const maxSpeed = (VAR === 'fly' ? 0.7 : 1) * S.speed * 2.4;
    speed = Math.min(maxSpeed, speed + S.accel * (VAR === 'fly' ? 0.6 : 1) * dt);
    distRun += speed * dt;

    // ---- תנועת הגיבור ----
    if (VAR === 'classic') {
      hero.vy += S.gravity * dt; hero.y += hero.vy * dt;
      if (hero.y >= groundY) { hero.y = groundY; hero.vy = 0; hero.jumps = 0; }
    } else if (VAR === 'flip') {
      hero.vy += S.gravity * hero.g * dt; hero.cy += hero.vy * dt;
      const floor = groundY - hero.size / 2, ceil = ceilY + hero.size / 2;
      if (hero.cy >= floor) { hero.cy = floor; hero.vy = 0; hero.grounded = true; }
      if (hero.cy <= ceil) { hero.cy = ceil; hero.vy = 0; hero.grounded = true; }
    } else {
      const up = holding || keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW');
      hero.vy += (up ? -S.gravity * 0.7 : S.gravity * 0.4) * dt;
      hero.vy = clamp(hero.vy, -460, 430);
      hero.cy += hero.vy * dt;
      if (hero.cy + hero.size * 0.4 > groundY || hero.cy - hero.size * 0.4 < ceilY) { die(); return; }
    }

    // ---- יצירת מכשולים ----
    nextObs -= dt;
    if (nextObs <= 0) {
      const size = rand(36, 50);
      if (VAR === 'classic') {
        const fly = t > 12 && Math.random() < 0.22;
        obs.push({ x: W + 60, y: fly ? groundY - hero.size - 70 : groundY - size / 2 + 4, e: pick(T.obstacle), s: size, fly });
        if (!fly && t > 20 && Math.random() < 0.3) obs.push({ x: W + 60 + size * 0.95, y: groundY - size / 2 + 4, e: pick(T.obstacle), s: size, fly: false });
        nextObs = rand(0.75, 1.5) * Math.sqrt(S.speed / speed) * S.gapMul + 0.35;
      } else if (VAR === 'flip') {
        const side = Math.random() < 0.5 ? 1 : -1;
        obs.push({ x: W + 60, y: side > 0 ? groundY - size / 2 + 4 : ceilY + size / 2 - 4, e: pick(T.obstacle), s: size, flipY: side < 0 });
        // מעבר בין צדדים לוקח זמן, לכן מרווח גדול יותר כשהצד מתחלף
        nextObs = rand(0.7, 1.35) * Math.sqrt(S.speed / speed) * S.gapMul + (side !== lastSide ? 0.6 : 0.3);
        lastSide = side;
      } else {
        const gapH = Math.max(hero.size * 3.1, (groundY - ceilY) * 0.5 - t * 1.2);
        const lo = ceilY + gapH / 2 + 16, hi = groundY - gapH / 2 - 16;
        const gapY = clamp(lastGapY + rand(-150, 150), lo, hi);
        lastGapY = gapY;
        pillars.push({ x: W + 50, gapY, gapH, w: 58, passed: false, e: pick(T.obstacle) });
        if (Math.random() < 0.6) coins.push({ x: W + 50, y: gapY });
        nextObs = 290 / speed;
      }
    }
    if (VAR !== 'fly') {
      nextCoins -= dt;
      if (nextCoins <= 0) {
        const n = randi(3, 6);
        if (VAR === 'classic') {
          const h = rand(40, 150);
          for (let i = 0; i < n; i++) coins.push({ x: W + 40 + i * 38, y: groundY - 30 - h - Math.sin(i / (n - 1) * Math.PI) * 30 });
        } else {
          const top = Math.random() < 0.5;
          for (let i = 0; i < n; i++) coins.push({ x: W + 40 + i * 38, y: top ? ceilY + 26 : groundY - 26 });
        }
        nextCoins = rand(1.5, 3.5);
      }
    }
    for (const o of obs) o.x -= speed * dt * (o.fly ? 1.15 : 1);
    for (const p of pillars) p.x -= speed * dt;
    for (const c of coins) c.x -= speed * dt;
    obs = obs.filter(o => o.x > -80);
    pillars = pillars.filter(p => p.x > -80);
    coins = coins.filter(c => c.x > -40);

    // ---- התנגשויות ----
    const hx = hero.x, hy = VAR === 'classic' ? hero.y - hero.size / 2 : hero.cy;
    for (const o of obs) {
      if (Math.abs(o.x - hx) < (o.s + hero.size) * 0.36 && Math.abs(o.y - hy) < (o.s + hero.size) * 0.36) { die(); return; }
    }
    for (const p of pillars) {
      const r = hero.size * 0.34;
      if (Math.abs(p.x - hx) < p.w / 2 + r && (hy - r < p.gapY - p.gapH / 2 || hy + r > p.gapY + p.gapH / 2)) { die(); return; }
      if (!p.passed && p.x < hx) { p.passed = true; passed++; beep(660, 0.04, 'triangle', 0.02); }
    }
    for (let i = coins.length - 1; i >= 0; i--) {
      if (dist(coins[i].x, coins[i].y, hx, hy) < 34) {
        floatText(coins[i].x, coins[i].y, '+10'); coins.splice(i, 1); coinsGot++; beep(1100, 0.05, 'sine', 0.03);
      }
    }
    G.score = Math.floor(distRun / 10) + coinsGot * 10 + passed * 10;
  },
  draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.bg); g.addColorStop(1, P.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const d = distRun || 0;
    // שכבות פרלקסה
    const layer = (k, amp, base, color, step) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W + step; x += step) {
        const wx = x + d * k;
        ctx.lineTo(x, base - Math.abs(Math.sin(wx / step * 1.3) * amp) - Math.abs(Math.sin(wx / (step * 2.7))) * amp * 0.6);
      }
      ctx.lineTo(W, H); ctx.fill();
    };
    ctx.globalAlpha = 0.5; layer(0.15, 90, groundY - 40, P.grid, 120);
    ctx.globalAlpha = 0.8; layer(0.4, 50, groundY - 5, P.bg2, 80);
    ctx.globalAlpha = 1;
    // קרקע (ובווריאציות flip/fly גם תקרה)
    ctx.fillStyle = P.grid; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = P.accent; ctx.fillRect(0, groundY, W, 4);
    if (VAR !== 'classic') {
      ctx.fillStyle = P.grid; ctx.fillRect(0, 0, W, ceilY);
      ctx.fillStyle = P.accent; ctx.fillRect(0, ceilY - 4, W, 4);
    }
    ctx.fillStyle = '#ffffff14';
    for (let x = -(d % 60); x < W; x += 60) {
      ctx.fillRect(x, groundY + 18, 30, 6);
      if (VAR !== 'classic') ctx.fillRect(x, ceilY - 24, 30, 6);
    }

    if (!hero) return;
    for (const p of pillars) {
      const top = p.gapY - p.gapH / 2, bot = p.gapY + p.gapH / 2;
      ctx.fillStyle = P.bg2; ctx.strokeStyle = P.accent; ctx.lineWidth = 3;
      roundRect(p.x - p.w / 2, ceilY - 10, p.w, top - ceilY + 10, 10); ctx.fill(); ctx.stroke();
      roundRect(p.x - p.w / 2, bot, p.w, groundY - bot + 10, 10); ctx.fill(); ctx.stroke();
      drawEmoji(p.e, p.x, top - 18, 30); drawEmoji(p.e, p.x, bot + 18, 30);
    }
    for (const c of coins) drawEmoji(T.pickup, c.x, c.y + Math.sin(performance.now() / 200 + c.x / 50) * 3, 28);
    for (const o of obs) {
      if (o.flipY) { ctx.save(); ctx.translate(o.x, o.y); ctx.scale(1, -1); drawEmoji(o.e, 0, 0, o.s); ctx.restore(); }
      else drawEmoji(o.e, o.x, o.y, o.s);
    }
    if (VAR === 'classic') {
      const bob = hero.jumps ? 0 : Math.abs(Math.sin(distRun / 30)) * 4;
      ctx.fillStyle = '#0005'; ctx.beginPath();
      ctx.ellipse(hero.x, groundY + 4, Math.max(2, 18 * (1 - (groundY - hero.y) / 400)), 5, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(hero.x, hero.y - hero.size / 2 - bob);
      if (hero.jumps) ctx.rotate(hero.vy / 2500);
      drawEmoji(T.hero, 0, 0, hero.size, true);
      ctx.restore();
    } else {
      const bob = VAR === 'flip' && hero.grounded ? Math.abs(Math.sin(distRun / 30)) * 4 * hero.g : 0;
      ctx.save(); ctx.translate(hero.x, hero.cy - bob);
      if (VAR === 'flip' && hero.g < 0) ctx.scale(1, -1);
      if (VAR === 'fly') ctx.rotate(clamp(hero.vy / 1400, -0.4, 0.4));
      drawEmoji(T.hero, 0, 0, hero.size, true);
      ctx.restore();
    }
    drawFx();
    if (VAR === 'fly' && !started) {
      ctx.fillStyle = P.fg; ctx.font = '800 20px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('החזק כדי לעוף', W / 2, (groundY + ceilY) / 2 + 70);
    }
    if (VAR === 'fly') hud(`${T.pickup} ${coinsGot}`, `🏛️ ${passed} · ⭐ ${G.score}`);
    else hud(`${T.pickup} ${coinsGot}`, `📏 ${Math.floor(distRun / 10)} מ' · ⭐ ${G.score}`);
  },
};
