/**
 * AI Player — Lovelace karta pro Home Assistant.
 *
 * Přehrává média z ai-player knihovny přímo v prohlížeči, kde je
 * dashboard otevřený.
 *
 * Pohledy (překlápění záložkami nebo tažením prstem/myší do stran):
 *   Přehrávač → Knihovna → Playlisty → Fronta
 * Mimo přehrávač se hudba ovládá kompaktní lištou na spodku karty.
 *
 * Konfigurace karty:
 *   type: custom:ai-player-card
 *   url: https://player.example.com
 *   token: apt_…          (vytvoříš: php artisan app:token create <email> "HA")
 *   title: Přehrávač     (volitelné)
 */
const VIEWS = ['player', 'library', 'playlists', 'queue'];
const VIEW_TITLES = { player: 'Přehrávač', library: 'Knihovna', playlists: 'Playlisty', queue: 'Fronta' };
const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60, 90, 120];

class AiPlayerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._queue = [];
    this._index = -1;
    this._repeat = 'off'; // off | all | one
    this._shuffle = false;
    this._sleep = { mode: 'off', deadline: null, interval: null, fadeSeconds: 20 };
    this._view = 0;
    this._page = 1;
    this._lastPage = 1;
    this._query = '';
    this._items = [];
    this._playlists = [];
    this._openPlaylist = null;
    this._reported = false;
    this._debounce = null;
    this._drag = null;
    // Vizualizace: real = Web Audio analyser (vyžaduje CORS na /media/),
    // fake = animované pásy, když CORS chybí.
    this._viz = { ctx: null, analyser: null, sourceFor: null, raf: null, real: null };
  }

  setConfig(config) {
    if (!config.url || !config.token) {
      throw new Error('ai-player-card: nastav "url" a "token"');
    }
    this._config = config;
    this._base = config.url.replace(/\/+$/, '');
    this._title = config.title || 'Přehrávač';
    this._render();
    this._audio = this.shadowRoot.querySelector('audio');
    this._video = this.shadowRoot.querySelector('video');
    this._bindMedia(this._audio);
    this._bindMedia(this._video);
    this._bindSwipe();
    this._loadLibrary();
  }

  getCardSize() {
    return 8;
  }

  static getStubConfig() {
    return { url: 'https://player.example.com', token: '' };
  }

  _media() {
    const item = this._queue[this._index];
    return item && item.type === 'video' ? this._video : this._audio;
  }

  /* ----------------------------- API ----------------------------- */

  async _api(path, options = {}) {
    const res = await fetch(this._base + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${this._config.token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.status === 204 ? null : res.json();
  }

  async _loadLibrary(append = false) {
    try {
      const q = this._query ? `&q=${encodeURIComponent(this._query)}` : '';
      const data = await this._api(`/api/v1/media?per_page=50&page=${this._page}${q}`);
      this._items = append ? [...this._items, ...data.data] : data.data;
      this._lastPage = data.meta.last_page;
      this._renderView('library');
    } catch (e) {
      this._showError(`Knihovna: ${e.message}`);
    }
  }

  async _loadPlaylists() {
    try {
      const data = await this._api('/api/v1/playlists');
      this._playlists = data.data;
      this._renderView('playlists');
    } catch (e) {
      this._showError(`Playlisty: ${e.message}`);
    }
  }

  async _openPlaylistItems(playlist) {
    try {
      const data = await this._api(`/api/v1/playlists/${playlist.id}/items`);
      this._openPlaylist = { ...playlist, items: data.data };
      this._renderView('playlists');
    } catch (e) {
      this._showError(`Playlist: ${e.message}`);
    }
  }

  /* ---------------------------- přehrávání ---------------------------- */

  _playQueue(items, index) {
    this._queue = items.filter((i) => i.playable !== false);
    const offset = items.length - this._queue.length;
    this._index = Math.max(0, index - offset);
    this._playCurrent();
  }

  async _playCurrent() {
    const item = this._queue[this._index];
    if (!item) return;
    try {
      const src = await this._api(`/api/v1/media/${item.uuid}/playback-url`);
      const url = this._base + src.url;
      const media = this._media();
      const other = media === this._audio ? this._video : this._audio;
      other.pause();
      other.removeAttribute('src');

      await this._setupVisualizer(media, url);
      media.src = url;
      media.play();
      this._reported = false;
      this._refreshPlayer();
      this._refreshLists();
    } catch (e) {
      this._showError(`Nelze přehrát „${item.title}“: ${e.message}`);
    }
  }

  _next() {
    if (this._shuffle && this._queue.length > 1) {
      this._index = Math.floor(Math.random() * this._queue.length);
    } else if (this._index < this._queue.length - 1) {
      this._index++;
    } else if (this._repeat === 'all') {
      this._index = 0;
    } else {
      return false;
    }
    return true;
  }

  _prev() {
    if (this._media().currentTime > 3) {
      this._media().currentTime = 0;
      return;
    }
    if (this._index > 0) {
      this._index--;
      this._playCurrent();
    }
  }

  _onEnded() {
    if (this._sleep.mode === 'track_end') {
      this._sleepFinished();
      return;
    }
    if (this._repeat === 'one') {
      const m = this._media();
      m.currentTime = 0;
      m.play();
      return;
    }
    if (this._next()) {
      this._playCurrent();
    } else {
      this._refreshPlayer();
    }
  }

  _toggleFullscreen() {
    const v = this._video;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (v.requestFullscreen) {
      v.requestFullscreen();
    } else if (v.webkitEnterFullscreen) {
      v.webkitEnterFullscreen(); // iOS Safari
    }
  }

  /* --------------------------- vizualizace --------------------------- */

  /**
   * Web Audio analyser potřebuje, aby stream měl CORS hlavičky — jinak
   * createMediaElementSource ztiší výstup. Zkusíme HEAD na podepsané URL:
   * projde-li, zapneme skutečnou vizualizaci; neprojde-li, jedou
   * simulované pásy a zvuk hraje normálně.
   */
  async _setupVisualizer(media, url) {
    if (this._viz.real === null) {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        this._viz.real = res.ok;
      } catch {
        this._viz.real = false;
      }
    }

    if (this._viz.real) {
      media.crossOrigin = 'anonymous';
      try {
        this._ensureAudioGraph(media);
        return;
      } catch {
        this._viz.real = false;
        media.crossOrigin = null;
      }
    }
    this._ensureFakeViz();
  }

  _ensureAudioGraph(media) {
    if (this._viz.sourceFor === media) return;
    if (!this._viz.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this._viz.ctx = new AC();
      this._viz.analyser = this._viz.ctx.createAnalyser();
      this._viz.analyser.fftSize = 128;
      this._viz.analyser.smoothingTimeConstant = 0.8;
      this._viz.analyser.connect(this._viz.ctx.destination);
    }
    this._viz.ctx.createMediaElementSource(media).connect(this._viz.analyser);
    this._viz.sourceFor = media;
    if (this._viz.ctx.state === 'suspended') this._viz.ctx.resume();
  }

  _ensureFakeViz() { /* fake režim běží přes rAF smyčku, setup není třeba */ }

  _startViz() {
    if (this._viz.raf) return;
    const canvas = this.shadowRoot.querySelector('[data-viz]');
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    const data = new Uint8Array(64);
    let t = 0;

    const draw = () => {
      this._viz.raf = requestAnimationFrame(draw);
      const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
      const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
      ctx2d.clearRect(0, 0, w, h);
      const bars = 48;
      const gap = w / bars;

      let levels;
      if (this._viz.real && this._viz.analyser) {
        this._viz.analyser.getByteFrequencyData(data);
        levels = (i) => data[Math.floor((i / bars) * data.length * 0.7)] / 255;
      } else {
        const playing = this._media() && !this._media().paused;
        t += playing ? 0.06 : 0;
        levels = (i) =>
          playing
            ? 0.15 + 0.55 * Math.abs(Math.sin(t + i * 0.55) * Math.sin(t * 0.63 + i * 0.21))
            : 0.04;
      }

      const accent = getComputedStyle(this).getPropertyValue('--primary-color').trim() || '#03a9f4';
      ctx2d.fillStyle = accent;
      for (let i = 0; i < bars; i++) {
        const bh = Math.max(2, levels(i) * h);
        const x = i * gap + gap * 0.2;
        ctx2d.beginPath();
        ctx2d.roundRect(x, h - bh, gap * 0.6, bh, gap * 0.3);
        ctx2d.fill();
      }
    };
    draw();
  }

  /* ---------------------------- sleep timer ---------------------------- */

  _setSleep(mode, minutes = null) {
    clearInterval(this._sleep.interval);
    this._sleep.interval = null;
    this._sleep.mode = mode;
    this._sleep.deadline = mode === 'minutes' ? Date.now() + minutes * 60000 : null;
    if (mode === 'minutes') {
      this._sleep.interval = setInterval(() => this._sleepTick(), 1000);
    }
    this._refreshPlayer();
  }

  _sleepTick() {
    const left = Math.round((this._sleep.deadline - Date.now()) / 1000);
    if (left <= 0) {
      this._sleepFinished();
      return;
    }
    if (left <= this._sleep.fadeSeconds) {
      const base = this._userVolume ?? 0.8;
      this._media().volume = Math.max(0, base * (left / this._sleep.fadeSeconds));
    }
    const el = this.shadowRoot.querySelector('[data-sleep-left]');
    if (el) el.textContent = this._fmtDuration(left);
  }

  _sleepFinished() {
    clearInterval(this._sleep.interval);
    this._sleep.interval = null;
    this._sleep.mode = 'off';
    this._sleep.deadline = null;
    this._media().pause();
    this._media().volume = this._userVolume ?? 0.8;
    this._refreshPlayer();
  }

  /* ------------------------------ swipe ------------------------------ */

  _bindSwipe() {
    const viewport = this.shadowRoot.querySelector('[data-viewport]');
    const track = this.shadowRoot.querySelector('[data-track]');

    viewport.addEventListener('pointerdown', (e) => {
      this._drag = { x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
    });

    viewport.addEventListener('pointermove', (e) => {
      const d = this._drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.active) {
        // Aktivujeme drag jen když je pohyb výrazně vodorovný — svislý
        // necháme pro scroll seznamů.
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        d.active = true;
        viewport.setPointerCapture(e.pointerId);
        track.style.transition = 'none';
      }
      d.dx = dx;
      const w = viewport.clientWidth;
      const shift = (-this._view * w) + dx;
      track.style.transform = `translateX(${shift}px)`;
    });

    const end = (e) => {
      const d = this._drag;
      if (!d || e.pointerId !== d.id) return;
      this._drag = null;
      track.style.transition = '';
      track.style.transform = '';
      if (!d.active) return;
      // Po swipu následuje i click event — bez potlačení by drag na
      // seznamu rovnou spustil přehrání řádku pod prstem.
      this._suppressClick = true;
      setTimeout(() => { this._suppressClick = false; }, 50);
      const w = viewport.clientWidth;
      if (d.dx < -w * 0.18 && this._view < VIEWS.length - 1) this._setView(this._view + 1);
      else if (d.dx > w * 0.18 && this._view > 0) this._setView(this._view - 1);
      else this._setView(this._view); // snap zpět
    };
    viewport.addEventListener('pointerup', end);
    viewport.addEventListener('pointercancel', end);
  }

  _setView(i) {
    this._view = Math.max(0, Math.min(VIEWS.length - 1, i));
    const name = VIEWS[this._view];
    this._applyViewTransform();

    this.shadowRoot.querySelectorAll('[data-tabbtn]').forEach((b) =>
      b.classList.toggle('active', b.dataset.tabbtn === name));

    const mini = this.shadowRoot.querySelector('[data-mini]');
    mini.style.display = this._view === 0 ? 'none' : 'flex';

    if (name === 'playlists' && !this._playlists.length) this._loadPlaylists();
    if (name === 'queue') this._renderView('queue');
  }

  /**
   * Posuv o celou šířku pohledu v pixelech. Procenta ne — transform %
   * se počítá ze šířky .track, která je jen 1× viewport (položky mají
   * flex-basis 100 % a přetékají), takže -25 % posune jen o čtvrtinu.
   */
  _applyViewTransform() {
    const viewport = this.shadowRoot.querySelector('[data-viewport]');
    const track = this.shadowRoot.querySelector('[data-track]');
    if (!viewport || !track) return;
    track.style.transform = `translateX(${-this._view * viewport.clientWidth}px)`;
  }

  /* ------------------------------ UI ------------------------------ */

  _bindMedia(media) {
    media.volume = this._userVolume ?? 0.8;
    media.addEventListener('ended', () => this._onEnded());
    media.addEventListener('play', () => this._refreshPlayer());
    media.addEventListener('pause', () => this._refreshPlayer());
    media.addEventListener('timeupdate', () => {
      const pos = media.currentTime;
      const dur = media.duration || 0;
      const bar = this.shadowRoot.querySelector('[data-seek]');
      if (bar && !bar.matches(':active')) bar.value = dur ? (pos / dur) * 100 : 0;
      const t = this.shadowRoot.querySelector('[data-time]');
      if (t) t.textContent = `${this._fmtDuration(pos)} / ${this._fmtDuration(dur)}`;
      this._maybeReportPlay(pos, dur);
    });
  }

  _maybeReportPlay(position, duration) {
    if (this._reported || !this._queue[this._index]) return;
    if (position >= Math.min(duration * 0.5, 240)) {
      this._reported = true;
      this._api(`/api/v1/media/${this._queue[this._index].uuid}/plays`, {
        method: 'POST',
        body: JSON.stringify({ position_seconds: position, completed: position >= duration - 1 }),
      }).catch(() => {});
    }
  }

  _fmtDuration(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  _showError(msg) {
    const el = this.shadowRoot.querySelector('[data-error]');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 6000);
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        * { -webkit-tap-highlight-color: transparent; }
        ha-card { overflow: hidden; position: relative; }
        .error { display: none; background: var(--error-color, #db4437); color: #fff;
                 padding: 8px 12px; font-size: 13px; }

        /* ------- posuvné pohledy ------- */
        .viewport { overflow: hidden; touch-action: pan-y; user-select: none;
                    -webkit-user-select: none; }
        .track { display: flex; transition: transform .28s cubic-bezier(.33,1,.68,1); }
        .view { flex: 0 0 100%; min-width: 0; height: 460px; overflow-y: auto;
                overscroll-behavior: contain; padding: 14px 14px 6px; box-sizing: border-box; }

        /* ------- přehrávač ------- */
        .hero { position: relative; border-radius: 14px; overflow: hidden;
                background: var(--secondary-background-color, #1c1c1e);
                aspect-ratio: 16/10; display: flex; align-items: center; justify-content: center; }
        .hero img.cover { width: 100%; height: 100%; object-fit: cover; display: block; }
        .hero .no-cover { font-size: 46px; opacity: .4; }
        .hero video { width: 100%; height: 100%; object-fit: contain; background: #000; }
        .hero .fs { position: absolute; top: 8px; right: 8px; z-index: 2;
                    background: rgba(0,0,0,.45); border-radius: 10px; }
        canvas.viz { position: absolute; left: 0; right: 0; bottom: 0; width: 100%;
                     height: 56px; opacity: .9; pointer-events: none;
                     background: linear-gradient(transparent, rgba(0,0,0,.35)); }

        .p-meta { text-align: center; margin: 12px 4px 4px; }
        .p-meta .t { font-size: 17px; font-weight: 600; white-space: nowrap;
                     overflow: hidden; text-overflow: ellipsis; }
        .p-meta .a { font-size: 13px; color: var(--secondary-text-color); margin-top: 2px;
                     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .seek-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        .seek-row .time { font-size: 11px; color: var(--secondary-text-color); min-width: 74px; }

        input[type=range] { -webkit-appearance: none; appearance: none; width: 100%;
                            height: 28px; background: transparent; margin: 0; }
        input[type=range]::-webkit-slider-runnable-track {
          height: 4px; border-radius: 2px; background: var(--divider-color, #ccc); }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%;
          background: var(--primary-color); margin-top: -8px; }
        input[type=range]::-moz-range-track { height: 4px; border-radius: 2px;
          background: var(--divider-color, #ccc); }
        input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border: none;
          border-radius: 50%; background: var(--primary-color); }

        .controls { display: flex; align-items: center; justify-content: center;
                    gap: 4px; margin-top: 2px; }
        button { background: none; border: none; cursor: pointer; padding: 10px;
                 color: var(--primary-text-color); border-radius: 12px;
                 min-width: 44px; min-height: 44px; font-size: 18px; font-family: inherit;
                 display: inline-flex; align-items: center; justify-content: center; }
        button:active { background: var(--secondary-background-color); }
        button.active { color: var(--primary-color); }
        button.big { font-size: 30px; }
        button.play { font-size: 34px; }

        .row2 { display: flex; align-items: center; justify-content: space-between;
                gap: 8px; margin-top: 4px; flex-wrap: wrap; }
        .vol { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 130px;
               color: var(--secondary-text-color); }
        .sleep { display: flex; align-items: center; gap: 6px;
                 color: var(--secondary-text-color); font-size: 12px; }
        select { background: var(--card-background-color); color: var(--primary-text-color);
                 border: 1px solid var(--divider-color, #ddd); border-radius: 8px;
                 padding: 6px 8px; font-size: 13px; min-height: 36px; }

        /* ------- seznamy ------- */
        .list-header { font-size: 15px; font-weight: 600; margin-bottom: 8px;
                       display: flex; align-items: center; gap: 8px; }
        .search { width: 100%; box-sizing: border-box; padding: 10px 14px; margin-bottom: 8px;
                  border: 1px solid var(--divider-color, #ddd); border-radius: 12px;
                  background: var(--card-background-color); color: var(--primary-text-color);
                  font-size: 15px; min-height: 44px; }
        .row { display: flex; gap: 12px; align-items: center; padding: 8px 6px;
               border-radius: 10px; cursor: pointer; min-height: 44px; }
        .row:active { background: var(--secondary-background-color); }
        .row.playing { background: var(--secondary-background-color); }
        .row.playing .t { color: var(--primary-color); }
        .row img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover;
                   background: var(--secondary-background-color, #eee); flex-shrink: 0; }
        .row .meta2 { min-width: 0; flex: 1; }
        .row .t { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .s { font-size: 12px; color: var(--secondary-text-color);
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .d { font-size: 12px; color: var(--secondary-text-color); }
        .more, .back { font-size: 14px; color: var(--primary-color); }
        .empty { padding: 24px; text-align: center; color: var(--secondary-text-color); font-size: 14px; }

        /* ------- mini přehrávač + záložky ------- */
        .mini { display: none; align-items: center; gap: 10px; padding: 6px 12px;
                border-top: 1px solid var(--divider-color, #e0e0e0);
                background: var(--card-background-color); cursor: pointer; }
        .mini img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover;
                    background: var(--secondary-background-color, #eee); }
        .mini .m { min-width: 0; flex: 1; }
        .mini .t { font-size: 13px; font-weight: 600; white-space: nowrap;
                   overflow: hidden; text-overflow: ellipsis; }
        .mini .a { font-size: 11px; color: var(--secondary-text-color); white-space: nowrap;
                   overflow: hidden; text-overflow: ellipsis; }
        .mini button { min-width: 40px; min-height: 40px; padding: 6px; font-size: 20px; }

        .tabs { display: flex; border-top: 1px solid var(--divider-color, #e0e0e0); }
        .tabs button { flex: 1; flex-direction: column; gap: 2px; font-size: 11px;
                       color: var(--secondary-text-color); border-radius: 0; padding: 8px 4px; }
        .tabs button .ic { font-size: 19px; }
        .tabs button.active { color: var(--primary-color); }

        audio { display: none; }
      </style>
      <ha-card>
        <div class="error" data-error></div>

        <div class="viewport" data-viewport>
          <div class="track" data-track>

            <section class="view" data-view="player">
              <div class="hero">
                <img class="cover" data-cover alt="" style="display:none">
                <div class="no-cover" data-nocover>♪</div>
                <video data-video playsinline style="display:none"></video>
                <button class="fs" data-fs style="display:none" title="Fullscreen">⛶</button>
                <canvas class="viz" data-viz></canvas>
              </div>
              <div class="p-meta">
                <div class="t" data-title>—</div>
                <div class="a" data-artist></div>
              </div>
              <div class="seek-row">
                <input type="range" data-seek min="0" max="100" value="0" step="0.1">
                <span class="time" data-time>0:00 / 0:00</span>
              </div>
              <div class="controls">
                <button data-shuffle title="Náhodně">🔀</button>
                <button class="big" data-prev title="Předchozí">⏮</button>
                <button class="big play" data-play title="Přehrát/pauza">▶</button>
                <button class="big" data-next title="Další">⏭</button>
                <button data-repeat title="Opakovat">�</button>
              </div>
              <div class="row2">
                <div class="vol">🔊<input type="range" data-volume min="0" max="100" value="80"></div>
                <div class="sleep">
                  😴
                  <select data-sleep>
                    <option value="off">Sleeper</option>
                    <option value="track_end">Konec skladby</option>
                    ${SLEEP_MINUTES.map((m) => `<option value="${m}">${m} min</option>`).join('')}
                  </select>
                  <span data-sleep-wrap style="display:none"><span data-sleep-left></span></span>
                </div>
              </div>
            </section>

            <section class="view" data-view="library"></section>
            <section class="view" data-view="playlists"></section>
            <section class="view" data-view="queue"></section>

          </div>
        </div>

        <div class="mini" data-mini>
          <img data-mini-cover alt="">
          <div class="m">
            <div class="t" data-mini-title>—</div>
            <div class="a" data-mini-artist></div>
          </div>
          <button data-mini-play>▶</button>
          <button data-mini-next>⏭</button>
        </div>

        <div class="tabs">
          <button data-tabbtn="player"><span class="ic">🎵</span>Přehrávač</button>
          <button data-tabbtn="library"><span class="ic">📚</span>Knihovna</button>
          <button data-tabbtn="playlists"><span class="ic">📋</span>Playlisty</button>
          <button data-tabbtn="queue"><span class="ic">≡</span>Fronta</button>
        </div>

        <audio preload="none"></audio>
      </ha-card>
    `;

    const $ = (sel) => this.shadowRoot.querySelector(sel);

    $('[data-play]').addEventListener('click', () => this._togglePlay());
    $('[data-mini-play]').addEventListener('click', (e) => { e.stopPropagation(); this._togglePlay(); });
    $('[data-mini-next]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._next()) this._playCurrent();
    });
    $('[data-mini]').addEventListener('click', () => this._setView(0));
    $('[data-prev]').addEventListener('click', () => this._prev());
    $('[data-next]').addEventListener('click', () => { if (this._next()) this._playCurrent(); });
    $('[data-fs]').addEventListener('click', () => this._toggleFullscreen());
    $('[data-shuffle]').addEventListener('click', (e) => {
      this._shuffle = !this._shuffle;
      e.currentTarget.classList.toggle('active', this._shuffle);
    });
    $('[data-repeat]').addEventListener('click', (e) => {
      this._repeat = { off: 'all', all: 'one', one: 'off' }[this._repeat];
      e.currentTarget.classList.toggle('active', this._repeat !== 'off');
      e.currentTarget.textContent = this._repeat === 'one' ? '🔂' : '🔁';
    });
    $('[data-seek]').addEventListener('input', (e) => {
      const dur = this._media().duration || 0;
      if (dur) this._media().currentTime = (e.target.value / 100) * dur;
    });
    $('[data-volume]').addEventListener('input', (e) => {
      this._userVolume = e.target.value / 100;
      this._media().volume = this._userVolume;
    });
    $('[data-sleep]').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === 'off') this._setSleep('off');
      else if (v === 'track_end') this._setSleep('track_end');
      else this._setSleep('minutes', parseInt(v, 10));
    });
    this.shadowRoot.querySelectorAll('[data-tabbtn]').forEach((b) =>
      b.addEventListener('click', () => this._setView(VIEWS.indexOf(b.dataset.tabbtn))));

    // Po zmenšení/zvětšení karty se přepočítá pixelový posuv.
    if (window.ResizeObserver) {
      new ResizeObserver(() => this._applyViewTransform())
        .observe(this.shadowRoot.querySelector('[data-viewport]'));
    }

    this._setView(0);
    this._renderView('library');
    this._renderView('queue');
    this._startViz();
  }

  _togglePlay() {
    const m = this._media();
    if (!m.src) {
      if (this._queue.length) this._playCurrent();
      return;
    }
    if (m.paused) m.play(); else m.pause();
    this._refreshPlayer();
  }

  _refreshPlayer() {
    const item = this._queue[this._index];
    const $ = (s) => this.shadowRoot.querySelector(s);
    const isVideo = item && item.type === 'video';
    const paused = this._media().paused;

    $('[data-title]').textContent = item ? item.title : '—';
    $('[data-artist]').textContent = item
      ? [item.artist, item.album].filter(Boolean).join(' — ')
      : '';
    $('[data-play]').textContent = paused ? '▶' : '⏸';

    const cover = item && item.coverUrl ? this._base + item.coverUrl : '';
    $('[data-cover]').style.display = !isVideo && cover ? 'block' : 'none';
    if (cover) $('[data-cover]').src = cover;
    $('[data-nocover]').style.display = !isVideo && !cover ? 'flex' : 'none';
    this._video.style.display = isVideo ? 'block' : 'none';
    $('[data-fs]').style.display = isVideo ? 'inline-flex' : 'none';

    $('[data-mini-title]').textContent = item ? item.title : '—';
    $('[data-mini-artist]').textContent = item ? (item.artist || '') : '';
    const mc = $('[data-mini-cover]');
    mc.src = cover || '';
    mc.style.visibility = cover ? 'visible' : 'hidden';
    $('[data-mini-play]').textContent = paused ? '▶' : '⏸';

    const wrap = $('[data-sleep-wrap]');
    if (this._sleep.mode !== 'off') {
      wrap.style.display = 'inline';
      $('[data-sleep-left]').textContent = this._sleep.mode === 'minutes'
        ? this._fmtDuration((this._sleep.deadline - Date.now()) / 1000)
        : 'konec skladby';
    } else {
      wrap.style.display = 'none';
    }
  }

  _renderView(name) {
    const host = this.shadowRoot.querySelector(`[data-view="${name}"]`);
    if (!host) return;
    const current = this._queue[this._index];

    if (name === 'queue') {
      host.innerHTML =
        `<div class="list-header">${VIEW_TITLES.queue}</div>` +
        (this._queue.length
          ? this._queue.map((i, n) => this._row(i, n === this._index, n)).join('')
          : '<div class="empty">Fronta je prázdná.</div>');
      this._bindRows(host, (n) => { this._index = n; this._playCurrent(); });
      return;
    }

    if (name === 'playlists') {
      if (this._openPlaylist) {
        host.innerHTML =
          `<div class="list-header"><button class="back" data-back>←</button>${this._esc(this._openPlaylist.name)}</div>` +
          (this._openPlaylist.items.length
            ? this._openPlaylist.items.map((i, n) => this._row(i, current && i.uuid === current.uuid, n)).join('')
            : '<div class="empty">Playlist je prázdný.</div>');
        host.querySelector('[data-back]').addEventListener('click', () => {
          this._openPlaylist = null;
          this._renderView('playlists');
        });
        this._bindRows(host, (n) => this._playQueue(this._openPlaylist.items, n));
      } else {
        host.innerHTML =
          `<div class="list-header">${VIEW_TITLES.playlists}</div>` +
          (this._playlists.length
            ? this._playlists.map((p, n) => `
                <div class="row" data-pl="${n}">
                  <div class="meta2"><div class="t">${this._esc(p.name)}</div>
                  <div class="s">${p.items_count} položek</div></div>
                  <div class="d">›</div>
                </div>`).join('')
            : '<div class="empty">Žádné playlisty.</div>');
        host.querySelectorAll('[data-pl]').forEach((el) =>
          el.addEventListener('click', () =>
            this._openPlaylistItems(this._playlists[parseInt(el.dataset.pl, 10)])));
      }
      return;
    }

    if (name === 'library') {
      host.innerHTML =
        `<div class="list-header">${VIEW_TITLES.library}</div>
         <input class="search" placeholder="Hledat v knihovně…" value="${this._esc(this._query)}">` +
        (this._items.length
          ? this._items.map((i, n) => this._row(i, current && i.uuid === current.uuid, n)).join('')
          : '<div class="empty">Nic tu není.</div>') +
        (this._page < this._lastPage ? '<button class="more" data-more>Načíst další…</button>' : '');

      const search = host.querySelector('.search');
      search.addEventListener('input', (e) => {
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => {
          this._query = e.target.value;
          this._page = 1;
          this._loadLibrary();
        }, 350);
      });
      const more = host.querySelector('[data-more]');
      if (more) more.addEventListener('click', () => { this._page++; this._loadLibrary(true); });
      this._bindRows(host, (n) => this._playQueue(this._items, n));
    }
  }

  _refreshLists() {
    ['library', 'playlists', 'queue'].forEach((v) => this._renderView(v));
  }

  _row(item, playing, n) {
    const cover = item.coverUrl ? this._base + item.coverUrl : '';
    return `
      <div class="row ${playing ? 'playing' : ''}" data-row="${n}">
        ${cover ? `<img src="${cover}" loading="lazy" alt="">` : '<img alt="" style="visibility:hidden">'}
        <div class="meta2">
          <div class="t">${this._esc(item.title)}</div>
          <div class="s">${this._esc([item.artist, item.album].filter(Boolean).join(' — ') || item.filename || '')}</div>
        </div>
        <div class="d">${this._fmtDuration(item.durationSeconds)}</div>
      </div>`;
  }

  _bindRows(host, onPick) {
    host.querySelectorAll('[data-row]').forEach((el) =>
      el.addEventListener('click', () => {
        // Klik jen když neprobíhal swipe — jinak by drag spustil i přehrání.
        if (this._suppressClick) return;
        onPick(parseInt(el.dataset.row, 10));
      }));
  }

  _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}

customElements.define('ai-player-card', AiPlayerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ai-player-card',
  name: 'AI Player',
  description: 'Přehrávač knihovny ai-player — knihovna, playlisty, fronta, sleeper, vizualizace.',
  preview: false,
});
