// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money,
// alive counts, kill feed, round banner, buy menu, plant/defuse progress and
// a live minimap. It never touches the simulation; main.js pushes numbers in
// and reads the play / buy callbacks out.
const COPY = {
  start: {
    title: 'Ember Yard',
    copy: 'Five against five. Plant the spike at Site A or B — or eliminate the Crimson team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Ember Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const timerEl = $('timer');
  const scoreA = $('score-attack');
  const scoreD = $('score-defend');
  const roundLabel = $('round-label');
  const moneyEl = $('money-value');
  const aliveA = $('alive-attack');
  const aliveD = $('alive-defend');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buymenu');
  const buyMoney = $('buy-money');
  const buyList = $('buy-list');
  const damageEl = $('damage-flash');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const progressWrap = $('progress-wrap');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const minimap = $('minimap');
  const hint = $('hint');
  const mapCtx = minimap ? minimap.getContext('2d') : null;

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { mag: -1, reserve: -1, hp: -1, money: -1, timer: '', a: -1, d: -1, aa: -1, ad: -1, weapon: '', nades: -1 };

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve) {
      if (mag === last.mag && reserve === last.reserve) return;
      last.mag = mag;
      last.reserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name, grenades) {
      if (name === last.weapon && grenades === last.nades) return;
      last.weapon = name;
      last.nades = grenades;
      weaponName.textContent = name;
      grenadeCount.textContent = grenades > 0 ? `◉ ${grenades} frag` : 'no frag';
    },
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      if (v === last.hp) return;
      last.hp = v;
      healthValue.textContent = String(v);
      healthFill.style.width = `${v}%`;
      healthFill.classList.toggle('low', v <= 30);
    },
    setTimer(seconds, phase) {
      const t = fmtTime(seconds);
      const label = phase === 'buy' ? `BUY ${t}` : phase === 'planted' ? `SPIKE ${t}` : t;
      if (label === last.timer) return;
      last.timer = label;
      timerEl.textContent = label;
      timerEl.classList.toggle('urgent', seconds <= 10 && phase !== 'buy');
    },
    setScore(a, d, round) {
      if (a === last.a && d === last.d) return;
      last.a = a;
      last.d = d;
      scoreA.textContent = String(a);
      scoreD.textContent = String(d);
      roundLabel.textContent = `ROUND ${round}`;
    },
    setMoney(money) {
      if (money === last.money) return;
      last.money = money;
      moneyEl.textContent = `$${money}`;
      if (buyMoney) buyMoney.textContent = `$${money}`;
    },
    setAlive(a, d) {
      if (a === last.aa && d === last.ad) return;
      last.aa = a;
      last.ad = d;
      aliveA.textContent = `VAN ${a}`;
      aliveD.textContent = `CRI ${d}`;
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageEl.classList.remove('show');
      void damageEl.offsetWidth;
      damageEl.classList.add('show');
    },
    killfeed(text, good) {
      const line = document.createElement('div');
      line.className = `feed-line${good ? ' good' : ' bad'}`;
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => { line.classList.add('fade'); }, 4200);
    },
    banner(titleText, subText, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText || '';
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() { banner.hidden = true; },
    setHint(text) { if (hint) hint.textContent = text || ''; },
    setProgress(label, frac) {
      if (frac == null) { progressWrap.hidden = true; return; }
      progressWrap.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(frac * 100)}%`;
    },
    showOverlay(mode, scoreText) {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = mode === 'roundEnd' || mode === 'matchEnd' ? scoreText || text.copy : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    showBuy(items, money, onBuy, onDeploy) {
      buyMenu.hidden = false;
      buyMoney.textContent = `$${money}`;
      buyList.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = item.owned || money < item.price;
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-stat">${item.stat}</span><span class="buy-price">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
        row.addEventListener('click', () => onBuy(item.id));
        buyList.appendChild(row);
      }
      const deploy = document.createElement('button');
      deploy.type = 'button';
      deploy.className = 'buy-deploy';
      deploy.textContent = 'Deploy — close buy menu (B)';
      deploy.addEventListener('click', onDeploy);
      buyList.appendChild(deploy);
    },
    hideBuy() { buyMenu.hidden = true; },
    buyVisible() { return !buyMenu.hidden; },
    drawMinimap(solids, sites, actors, spike) {
      if (!mapCtx) return;
      const W = minimap.width;
      const H = minimap.height;
      const sx = W / 48;
      const sz = H / 40;
      const px = (x) => (x + 24) * sx;
      const pz = (z) => (z + 20) * sz;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = '#22262e';
      mapCtx.fillRect(0, 0, W, H);
      mapCtx.fillStyle = '#3a3f47';
      for (const s of solids) mapCtx.fillRect(px(s.x - s.w / 2), pz(s.z - s.d / 2), s.w * sx, s.d * sz);
      for (const site of sites) {
        mapCtx.fillStyle = site.letter === 'A' ? 'rgba(45,212,191,0.35)' : 'rgba(240,168,48,0.35)';
        mapCtx.fillRect(px(site.center.x - site.half.x), pz(site.center.z - site.half.z), site.half.x * 2 * sx, site.half.z * 2 * sz);
        mapCtx.fillStyle = '#ece7db';
        mapCtx.font = 'bold 11px sans-serif';
        mapCtx.fillText(site.letter, px(site.center.x) - 4, pz(site.center.z) + 4);
      }
      if (spike) {
        mapCtx.fillStyle = '#f0a830';
        mapCtx.beginPath();
        mapCtx.arc(px(spike.x), pz(spike.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const a of actors) {
        if (!a.alive) continue;
        mapCtx.fillStyle = a.team === 'attack' ? '#2dd4bf' : '#f43f5e';
        if (a.isPlayer) {
          mapCtx.beginPath();
          mapCtx.arc(px(a.pos.x), pz(a.pos.z), 4, 0, Math.PI * 2);
          mapCtx.fill();
          mapCtx.strokeStyle = '#ece7db';
          mapCtx.stroke();
        } else {
          mapCtx.fillRect(px(a.pos.x) - 2.5, pz(a.pos.z) - 2.5, 5, 5);
        }
      }
    },
  };
}
