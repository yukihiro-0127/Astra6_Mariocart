import { CONFIG } from './config.js';

const arrow = '<svg viewBox="0 0 32 18" aria-hidden="true"><path d="M1 9h27M21 2l7 7-7 7"/></svg>';
const icons = {
  sound: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7h3l4-4v14l-4-4H3zM13 6c3 2 3 6 0 8M15 3c5 4 5 10 0 14"/></svg>',
  help: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 6a3 3 0 0 1 6 0c0 3-3 2-3 5M10 14v2"/></svg>',
  pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4v12M13 4v12" stroke-width="2.5"/></svg>',
  close: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>',
  pulse: '<svg viewBox="0 0 34 34" aria-hidden="true"><path d="m6 8 9 9-9 9M16 8l9 9-9 9M26 8l4 9-4 9"/></svg>',
  snare: '<svg viewBox="0 0 34 34" aria-hidden="true"><ellipse cx="17" cy="23" rx="12" ry="6"/><ellipse cx="17" cy="21" rx="6" ry="3"/><path d="M17 3v14M11 11l6 6 6-6M8 7l-3 7M26 7l3 7"/></svg>',
  shield: '<svg viewBox="0 0 34 34" aria-hidden="true"><path d="m17 3 12 5v9c0 7-12 14-12 14S5 24 5 17V8zM17 9v15M11 15l6-6 6 6"/></svg>',
  vector: '<svg viewBox="0 0 34 34" aria-hidden="true"><path d="M3 8v18M8 12v10M13 17h17M23 10l7 7-7 7M23 4h7v5M23 30h7v-5"/></svg>',
  empty: '<svg viewBox="0 0 34 34" aria-hidden="true"><path d="m17 3 12 7v14l-12 7-12-7V10zM11 17h12M17 11v12" stroke-dasharray="3 3"/></svg>',
};
const items = {
  pulse: {name:'PULSE BOOST', detail:'短時間の加速バースト'},
  snare: {name:'GRAVITY SNARE', detail:'後方に減速フィールドを設置'},
  shield: {name:'ARC SHIELD', detail:'妨害を1回だけ防ぐ'},
  vector: {name:'VECTOR SWAP', detail:'安全な前方へショートジャンプ'},
};
const clock = (value = 0, millis = true) => {
  const sec = Math.max(0, Number(value) || 0);
  const minutes = String(Math.floor(sec / 60)).padStart(2,'0');
  const seconds = String(Math.floor(sec % 60)).padStart(2,'0');
  return `${minutes}:${seconds}${millis ? `.${String(Math.floor((sec % 1) * 100)).padStart(2,'0')}` : ''}`;
};
const colorCss = value => typeof value === 'number' ? `#${value.toString(16).padStart(6,'0')}` : value || '#dcfa78';

export class UI {
  constructor(callbacks = {}, track) {
    this.callbacks = callbacks;
    this.track = track;
    this.state = '';
    this.helpOpen = false;
    this.soundOn = true;
    this.toastUntil = 0;
    this.lastMap = 0;
    this.lastDebug = 0;
    this.lastItem = null;
    this.root = document.getElementById('ui-root');
    this.root.innerHTML = this.markup();
    this.el = Object.fromEntries([...this.root.querySelectorAll('[data-ui]')].map(el => [el.dataset.ui, el]));
    this.root.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'help') this.toggleHelp();
      else if (action === 'sound') {
        const result = this.callbacks.sound?.();
        this.soundOn = typeof result === 'boolean' ? result : !this.soundOn;
        this.el.sound.setAttribute('aria-pressed', String(this.soundOn));
        this.el.sound.setAttribute('aria-label', this.soundOn ? 'サウンドをオフにする' : 'サウンドをオンにする');
      } else {
        this.helpOpen = false;
        this.el.help.hidden = true;
        this.callbacks[action]?.();
      }
    });
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.helpOpen) {
        event.stopPropagation();
        this.toggleHelp();
      }
      if (event.key === 'Tab') {
        const modal = this.helpOpen ? this.el.help : this.state === 'paused' ? this.el.pause : this.state === 'finished' ? this.el.finish : null;
        if (!modal) return;
        const buttons = [...modal.querySelectorAll('button:not([disabled])')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    this.prepareMap();
    this.setState('menu');
  }

  markup() {
    return `<div class="ui-shell" data-ui="shell">
      <div class="menu-shade"></div>
      <header class="topbar">
        <div class="topbar-left"><div class="brand"><span class="brand-mark"><svg viewBox="0 0 40 36" fill="none" aria-hidden="true"><path d="M2 31 17 5h11L13 31H2Z" fill="#dcfa78"/><path d="m23 15 5-9h10l-5 9H23ZM17 26l4-7h10l-4 7H17Z" fill="#f1f0e9"/></svg></span><span>AEROFORGE</span></div><span class="header-status"><i class="status-dot"></i> CIRCUIT SYSTEMS ONLINE</span></div>
        <div class="topbar-actions"><span class="topbar-tag">BUILT FOR THE SKY<span aria-hidden="true">.</span></span><button class="icon-btn" data-action="pause" data-ui="pauseButton" aria-label="レースをポーズ" hidden>${icons.pause}</button><button class="icon-btn sound-btn" data-action="sound" data-ui="sound" aria-label="サウンドをオフにする" aria-pressed="true">${icons.sound}</button><button class="icon-btn" data-action="help" aria-label="操作方法を表示">${icons.help}</button></div>
      </header>
      <main class="hero menu-only" aria-label="レースメニュー">
        <div class="eyebrow">INDEPENDENT HOVER RACING / VOL. 01</div>
        <h1 class="hero-title"><span>AERO</span><span class="title-outline">FORGE</span></h1>
        <p class="hero-tagline">THE CITY IS YOUR CIRCUIT.</p>
        <div class="circuit-caption"><span class="circuit-number">01</span><span class="section-label">THE FOUNDRY COLLECTION</span></div>
        <h2 class="circuit-title">Skyline Foundry Circuit</h2>
        <p class="circuit-description">夕暮れの工業都市、その空を走れ。<br>浮遊するストリート、火花を散らすドリフト。<br>自分だけのラインで、頂点へ。</p>
        <div class="race-facts"><span><strong data-ui="menuLaps">3</strong> LAPS</span><span><strong data-ui="menuPilots">4</strong> PILOTS</span><span><strong>1</strong> SKYLINE</span></div>
        <div class="hero-actions"><button class="primary-btn" data-action="start" data-ui="start">START RACING ${arrow}</button><button class="controls-link" data-action="help"><span>操作方法を見る</span></button></div>
        <div class="hero-note"><span class="keycap">W A S D</span> KEYBOARD DRIVEN. ADRENALINE FUELED.</div>
      </main>
      <div class="scene-callout menu-only" aria-hidden="true"><span class="callout-line"></span><div><div class="callout-title">SKYLINE FOUNDRY</div><div class="callout-sub">ELEVATED INDUSTRIAL DISTRICT / 07</div></div></div>
      <footer class="menu-footer menu-only"><div class="footer-location"><span class="footer-cross"></span><div><div class="footer-main">SF—01 / SKYLINE FOUNDRY CIRCUIT</div><div class="footer-sub">ALT. 480 M &nbsp; · &nbsp; GOLDEN HOUR &nbsp; · &nbsp; OPEN CLASS</div></div></div><div class="footer-right"><div class="weather"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M5 20h14M7 14a5 5 0 0 1 10 0M12 2v4M3 7l3 3M21 7l-3 3"/></svg> 24° &nbsp; CLEAR SKIES</div><span class="footer-vertical"></span><span class="version">AN ORIGINAL RACING EXPERIENCE &nbsp; / &nbsp; V.01</span></div></footer>
      <div class="hud" data-ui="hud" hidden>
        <div class="race-position"><div><div class="hud-kicker">POSITION</div><div class="position-value"><strong data-ui="rank">1</strong><span data-ui="field">/ 4</span></div></div><span class="hud-divider"></span><div><div class="hud-kicker">LAP</div><div class="lap-value"><b data-ui="lap">1</b> <span>/ <span data-ui="totalLaps">3</span></span></div></div></div>
        <div class="race-time"><div class="hud-kicker">RACE TIME</div><div class="time-value" data-ui="time">00:00.00</div><div class="lap-time" data-ui="lapTime">LAP 00:00.00</div></div>
        <div class="countdown" data-ui="countdown" hidden></div><div class="countdown-label" data-ui="countdownLabel" hidden>FIND YOUR LINE.</div>
        <div class="minimap-wrap"><div class="minimap-topline"><span>SF—01</span><span>TRACK RADAR</span></div><canvas class="minimap-canvas" data-ui="minimap" width="452" height="300" aria-label="コースと車両位置のミニマップ"></canvas><div class="minimap-legend"><span class="legend-dot"></span> YOU <span style="margin-left:8px;color:#8da99c">●</span> OTHER PILOTS</div></div>
        <div class="mini-controls"><span><kbd class="keycap">SPACE</kbd> DRIFT</span><span><kbd class="keycap">SHIFT</kbd> ITEM</span><span><kbd class="keycap">R</kbd> RECOVER</span><span><kbd class="keycap">ESC</kbd> PAUSE</span></div>
        <div class="speed-cluster"><div class="item-slot is-empty" data-ui="itemSlot"><div class="item-heading"><span>ENERGY SLOT</span><kbd class="keycap">SHIFT</kbd></div><div class="item-symbol" data-ui="itemSymbol">${icons.empty}</div><div class="item-name" data-ui="itemName">AWAITING ENERGY</div><div class="item-description" data-ui="itemDescription">Energy Gate でアイテム獲得</div></div><div class="speed-display"><div class="speed-value" data-ui="speed">000</div><div class="speed-unit">KM / H</div><div class="speed-bar"><span data-ui="speedBar"></span></div></div></div>
        <div class="drift-meter" data-ui="drift" hidden><div class="drift-label" data-ui="driftLabel">DRIFT CHARGING</div><div class="drift-track"><span data-ui="driftBar"></span></div></div>
        <div class="effect-labels"><span class="effect-tag shield" data-ui="shieldEffect" hidden>ARC SHIELD ACTIVE</span><span class="effect-tag" data-ui="boostEffect" hidden>BOOST ACTIVE</span></div>
        <div class="race-warning" data-ui="warning" hidden></div>
      </div>
      <div class="toast" data-ui="toast" role="status" hidden></div>
      <div class="modal-backdrop" data-ui="pause" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><p class="modal-label">TAKE A BREATHER</p><h2 class="modal-title" id="pause-title">RACE PAUSED.</h2><p class="modal-subtitle">街は、あなたを待っている。<br>準備ができたら、サーキットへ戻ろう。</p><button class="primary-btn" data-action="resume">RESUME RACING ${arrow}</button><button class="secondary-btn" data-action="restart">RESTART RACE</button><button class="controls-link" data-action="help" style="margin-top:14px"><span>操作方法を見る</span></button></section></div>
      <div class="modal-backdrop" data-ui="finish" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="finish-title"><p class="modal-label">SKYLINE FOUNDRY / RACE COMPLETE</p><div class="results-head"><h2 class="modal-title" id="finish-title">LINE<br>COMPLETE.</h2><div class="result-position"><span data-ui="finishRank">1</span><small data-ui="finishOrdinal">ST</small></div></div><div class="result-total">YOUR RACE <strong data-ui="finishTime">00:00.00</strong></div><ol class="results-list" data-ui="results"></ol><button class="primary-btn" data-action="restart">RACE AGAIN ${arrow}</button></section></div>
      <div class="modal-backdrop" data-ui="help" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="icon-btn modal-close" data-action="help" aria-label="操作説明を閉じる">${icons.close}</button><p class="modal-label">PILOT'S FIELD GUIDE</p><h2 class="modal-title" id="help-title">FIND YOUR LINE.</h2><table class="control-table"><tbody><tr><th>アクセル</th><td><kbd class="keycap">W</kbd><kbd class="keycap">↑</kbd></td></tr><tr><th>ブレーキ / バック</th><td><kbd class="keycap">S</kbd><kbd class="keycap">↓</kbd></td></tr><tr><th>ステアリング</th><td><kbd class="keycap">A</kbd><kbd class="keycap">D</kbd><kbd class="keycap">←</kbd><kbd class="keycap">→</kbd></td></tr><tr><th>ドリフト → 離して加速</th><td><kbd class="keycap">SPACE</kbd></td></tr><tr><th>所持アイテムを使用</th><td><kbd class="keycap">SHIFT</kbd></td></tr><tr><th>コースに復帰</th><td><kbd class="keycap">R</kbd></td></tr><tr><th>ポーズ / 再開</th><td><kbd class="keycap">ESC</kbd></td></tr></tbody></table><p class="help-tip"><strong>曲がりながら Space を押してドリフト。</strong><br>チャージが満タンになったら離して、短い加速へ。<br>光る Energy Gate をくぐるとアイテムを1つ獲得。</p><div class="help-footer">3周を走り抜けて、1位を目指そう。<br>F3 : DEBUG DISPLAY &nbsp; / &nbsp; DESKTOP + KEYBOARD RECOMMENDED</div></section></div>
      <pre class="debug-panel" data-ui="debug" hidden></pre>
    </div>`;
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    const menu = state === 'menu';
    this.el.shell.classList.toggle('race-view', !menu);
    this.el.hud.hidden = menu || state === 'finished';
    this.el.pause.hidden = state !== 'paused';
    this.el.finish.hidden = state !== 'finished';
    this.el.pauseButton.hidden = menu || state === 'finished' || state === 'paused';
    if (state === 'paused' && !this.helpOpen) this.el.pause.querySelector('button')?.focus({preventScroll:true});
    if (state === 'finished') this.el.finish.querySelector('button')?.focus({preventScroll:true});
  }

  toggleHelp() {
    this.helpOpen = !this.helpOpen;
    if (this.helpOpen) {
      this.focusBeforeHelp = document.activeElement;
      if (this.state === 'racing' || this.state === 'countdown') this.callbacks.pause?.();
    }
    this.el.help.hidden = !this.helpOpen;
    if (this.helpOpen) this.el.help.querySelector('button')?.focus({preventScroll:true});
    else this.focusBeforeHelp?.focus?.({preventScroll:true});
  }

  notify(message) {
    this.el.toast.textContent = message;
    this.toastUntil = performance.now() + 2600;
    this.el.toast.hidden = false;
  }

  update(game, frameStats = {}) {
    if (!game) return;
    if (!this.loadingDone) {
      this.loadingDone = true;
      const loading = document.getElementById('loading-screen');
      if (loading) { loading.classList.add('is-loaded'); setTimeout(() => { loading.hidden = true; }, 450); }
    }
    this.game = game;
    const wasFinished = this.state === 'finished';
    this.setState(game.state || 'menu');
    const player = game.racers?.[0];
    const laps = game.laps || 3;
    const racers = game.racers || [];
    this.el.menuLaps.textContent = laps;
    this.el.menuPilots.textContent = racers.length || 4;
    if (!player) return;
    this.el.rank.textContent = player.rank || 1;
    this.el.field.textContent = `/ ${racers.length}`;
    this.el.lap.textContent = Math.min(laps, Math.max(1, player.lap || 1));
    this.el.totalLaps.textContent = laps;
    this.el.time.textContent = clock(game.elapsed);
    this.el.lapTime.textContent = `LAP ${clock(game.lapTime ?? 0)}`;
    const speed = Math.round(Math.abs(player.speed || 0) * 3.6);
    this.el.speed.textContent = String(speed).padStart(3,'0');
    this.el.speedBar.style.width = `${Math.min(100, speed / 2)}%`;
    const isCountdown = game.state === 'countdown';
    const go = game.state === 'racing' && game.elapsed < .85;
    this.el.countdown.hidden = !isCountdown && !go;
    this.el.countdownLabel.hidden = !isCountdown;
    if (isCountdown) this.el.countdown.textContent = Math.max(1, Math.ceil(game.countdown || 0));
    else if (go) this.el.countdown.textContent = 'GO';
    const item = typeof player.item === 'object' ? player.item?.type || player.item?.id : player.item;
    if (item !== this.lastItem) {
      this.lastItem = item;
      const itemInfo = items[item];
      this.el.itemSlot.classList.toggle('is-empty', !itemInfo);
      this.el.itemSymbol.innerHTML = icons[item] || icons.empty;
      this.el.itemName.textContent = itemInfo?.name || 'AWAITING ENERGY';
      this.el.itemDescription.textContent = itemInfo?.detail || 'Energy Gate でアイテム獲得';
    }
    this.el.drift.hidden = !player.drifting;
    const charge = Math.min(1, Math.max(0, (player.driftCharge || 0) / CONFIG.drift.chargeTime));
    this.el.driftBar.style.width = `${charge * 100}%`;
    this.el.drift.classList.toggle('is-charged', charge >= 1);
    this.el.driftLabel.textContent = charge >= 1 ? 'CHARGED — RELEASE TO BOOST' : 'DRIFT CHARGING';
    this.el.boostEffect.hidden = !(player.boostTimer > 0);
    this.el.shieldEffect.hidden = !(player.shieldTimer > 0);
    this.el.warning.hidden = !player.wrongWay && !player.falling;
    this.el.warning.textContent = player.falling ? 'RECOVERING / コースへ復帰' : 'WRONG WAY / 逆走中';
    const now = performance.now();
    if (now > this.toastUntil) this.el.toast.hidden = true;
    if (now - this.lastMap > 40) { this.drawMap(racers); this.lastMap = now; }
    if (game.state === 'finished' && (!wasFinished || now - (this.lastResults || 0) > 500)) {
      this.showResults(game);
      this.lastResults = now;
    }
    this.el.debug.hidden = !game.debug;
    if (game.debug && now - this.lastDebug > 250) {
      const snapshot = game.snapshot?.() || {state:game.state,elapsed:game.elapsed,lap:player.lap,speed:player.speed,x:player.x,z:player.z,rank:player.rank};
      this.el.debug.textContent = `AEROFORGE / DEBUG [F3]\n${JSON.stringify({...frameStats,...snapshot},null,2)}`;
      this.lastDebug = now;
    }
  }

  showResults(game) {
    const player = game.racers[0];
    const rank = player.rank || 1;
    this.el.finishRank.textContent = rank;
    this.el.finishOrdinal.textContent = ['ST','ND','RD'][rank - 1] || 'TH';
    this.el.finishTime.textContent = clock(player.finishTime || game.elapsed);
    document.getElementById('finish-title').innerHTML = rank === 1 ? 'SKYLINE<br>IS YOURS.' : 'LINE<br>COMPLETE.';
    const standings = [...game.racers].sort((a,b) => (a.rank || 99) - (b.rank || 99));
    this.el.results.replaceChildren(...standings.map((racer, index) => {
      const row = document.createElement('li');
      row.className = `result-row${racer === player ? ' is-player' : ''}`;
      const place = document.createElement('span');
      place.className = 'result-place';
      place.textContent = String(index + 1).padStart(2,'0');
      const dot = document.createElement('span');
      dot.className = 'pilot-dot';
      dot.style.backgroundColor = colorCss(racer.color);
      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = racer.name?.replace(/^YOU\s*·\s*/, '') || `PILOT ${index + 1}`;
      if (racer === player) {
        const you = document.createElement('small'); you.textContent = 'YOU'; name.append(you);
      }
      const time = document.createElement('span');
      time.className = 'result-time';
      time.textContent = racer.finished ? clock(racer.finishTime) : 'ON TRACK';
      row.append(place,dot,name,time);
      return row;
    }));
  }

  prepareMap() {
    const samples = this.track?.samples || [];
    if (!samples.length) return;
    const xs = samples.map(p => p.x), zs = samples.map(p => p.z);
    const minX = Math.min(...xs), minZ = Math.min(...zs), maxX = Math.max(...xs), maxZ = Math.max(...zs);
    const canvas = this.el.minimap;
    const width = canvas.width, height = canvas.height;
    const scale = Math.min((width - 60) / Math.max(1,maxX - minX),(height - 40) / Math.max(1,maxZ - minZ));
    this.mapPoint = p => ({x:width/2 + (p.x - (minX + maxX)/2) * scale,y:height/2 + (p.z - (minZ + maxZ)/2) * scale});
    this.mapPath = new Path2D();
    samples.forEach((point, index) => {
      const p = this.mapPoint(point);
      if (index === 0) this.mapPath.moveTo(p.x,p.y); else this.mapPath.lineTo(p.x,p.y);
    });
    this.mapPath.closePath();
    if (this.track.shortcut?.samples?.length) {
      this.shortcutPath = new Path2D();
      this.track.shortcut.samples.forEach((point, index) => {
        const p = this.mapPoint(point);
        if (index === 0) this.shortcutPath.moveTo(p.x,p.y); else this.shortcutPath.lineTo(p.x,p.y);
      });
    }
  }

  drawMap(racers) {
    if (!this.mapPath) return;
    const canvas = this.el.minimap, ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(15,30,34,.7)'; ctx.lineWidth = 15; ctx.stroke(this.mapPath);
    ctx.strokeStyle = 'rgba(198,220,204,.43)'; ctx.lineWidth = 5; ctx.stroke(this.mapPath);
    if (this.shortcutPath) {
      ctx.strokeStyle = 'rgba(220,250,120,.64)'; ctx.lineWidth = 3; ctx.setLineDash([4,5]); ctx.stroke(this.shortcutPath); ctx.setLineDash([]);
    }
    const start = this.mapPoint(this.track.samples[0]);
    ctx.fillStyle = '#f4eee4'; ctx.fillRect(start.x-4,start.y-5,8,10);
    [...racers].reverse().forEach(racer => {
      const p = this.mapPoint(racer), player = racer === racers[0];
      ctx.beginPath(); ctx.arc(p.x,p.y,player ? 8 : 5,0,Math.PI*2);
      ctx.fillStyle = colorCss(racer.color); ctx.fill();
      ctx.lineWidth = player ? 3 : 2; ctx.strokeStyle = player ? '#f7ffe1' : '#1a3033'; ctx.stroke();
      if (player) {ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.lineWidth=1;ctx.strokeStyle='rgba(220,250,120,.4)';ctx.stroke();}
    });
  }
}
