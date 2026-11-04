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

/**
 * Inline SVG ikony (Material Design cesty, fill=currentColor → přeberou
 * barvu aktivního tématu HA). Žádné emoji — vypadají jednotně napříč
 * platformami a nasvícené barvě i ve světlém/tmavém režimu.
 */
const ICONS = {
  play: 'M8,5.14V19.14L19,12.14L8,5.14Z',
  pause: 'M14,19H18V5H14M6,19H10V5H6V19Z',
  prev: 'M6,18L14.5,12L6,6V18M8,6H6V18H8V6Z',
  next: 'M16,18H18V6H16M6,18L14.5,12L6,6V18Z',
  shuffle: 'M14.83,13.41L13.42,14.82L16.55,17.95L14.5,20H20V14.5L17.96,16.54L14.83,13.41M14.5,4L16.54,6.04L4,18.59L5.41,20L17.96,7.46L20,9.5V4M10.59,9.17L5.41,4L4,5.41L9.17,10.58L10.59,9.17Z',
  repeat: 'M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z',
  repeat_one: 'M13,15V9H12L10,10V11H11.5V15M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z',
  volume: 'M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z',
  sleep: 'M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M15,16H9V14L12.39,10H9V8H15V10L11.62,14H15V16M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z',
  fullscreen: 'M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z',
  back: 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  grid: 'M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3H13Z',
  list: 'M9,5V7H21V5M9,13H21V11H9M9,19H21V17H9M5,5V7H7V5M5,13H7V11H5M5,19H7V17H5Z',
  note: 'M12,3V13.55A4,4 0 0,0 10,13C7.79,13 6,14.79 6,17S7.79,21 10,21 14,19.21 14,17V7H18V3H12Z',
  music: 'M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z',
  bookshelf: 'M9,3V18H11V3H9M5,3V18H7V3H5M13,3V18H15V3H13M17,3V18H19V3H17M20,21H4V19H20V21Z',
  playlist: 'M15,6H3V8H15V6M15,10H3V12H15V10M3,16H11V14H3V16M17,6V14.18C16.69,14.07 16.35,14 16,14A3,3 0 0,0 13,17A3,3 0 0,0 16,20A3,3 0 0,0 19,17V8H22V6H17Z',
  queue: 'M7,5H21V7H7V5M7,13V11H21V13H7M4,4.5A1.5,1.5 0 0,1 5.5,6A1.5,1.5 0 0,1 4,7.5A1.5,1.5 0 0,1 2.5,6A1.5,1.5 0 0,1 4,4.5M4,10.5A1.5,1.5 0 0,1 5.5,12A1.5,1.5 0 0,1 4,13.5A1.5,1.5 0 0,1 2.5,12A1.5,1.5 0 0,1 4,10.5M7,19V17H21V19H7M4,16.5A1.5,1.5 0 0,1 5.5,18A1.5,1.5 0 0,1 4,19.5A1.5,1.5 0 0,1 2.5,18A1.5,1.5 0 0,1 4,16.5Z',
};
function icon(name, size = 22) {
  const wh = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${wh} fill="currentColor" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

/**
 * Sdílený stav na window — přežije zničení a znovuvytvoření karty.
 * HA dashboard při přepnutí pohledu kartu z DOMu odebere; <audio> v
 * document.body a fronta/index/timery mimo kartu → hudba hraje dál
 * a karta po návratu jen naváže UI.
 */
const STORE_KEY = '__aipStore';
function store() {
  if (!window[STORE_KEY]) {
    window[STORE_KEY] = {
      audio: null,          // singleton <audio> v document.body
      queue: [], index: -1, repeat: 'off', shuffle: false,
      userVolume: 0.8,
      sleep: { mode: 'off', deadline: null, interval: null, fadeSeconds: 20 },
      deviceId: null,
      beatTimer: null, pollTimer: null,
      takenOver: false,
      lastCard: null,        // poslední živá instance karty (pro delegaci)
      // Vizualizace: real = Web Audio analyser (vyžaduje CORS na /media/),
      // fake = animované pásy, když CORS chybí.
      viz: { ctx: null, analyser: null, sourceFor: null, raf: null, real: null },
    };
  }
  const s = window[STORE_KEY];
  if (!s.deviceId) {
    s.deviceId = localStorage.getItem('ai-player-device');
    if (!s.deviceId) {
      s.deviceId = 'ha-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('ai-player-device', s.deviceId);
    }
  }
  return s;
}

class AiPlayerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._s = store();
    // UI-stav konkrétní instance karty (při odpojení zaniká).
    this._view = 0;
    this._page = 1;
    this._lastPage = 1;
    this._query = '';
    this._items = [];
    this._playlists = [];
    this._openPlaylist = null;
    this._plGrid = true;
    this._reported = false;
    this._debounce = null;
    this._drag = null;
    this._resumePos = null;
    this._resumeOffer = null;
  }

  connectedCallback() {
    // Nově připojená karta přebírá delegaci událostí přehrávače.
    this._s.lastCard = this;
    if (this.shadowRoot.querySelector('[data-title]')) {
      this._refreshPlayer();
      this._refreshLists();
      this._applyViewTransform();
      this._startViz();
    }
  }

  disconnectedCallback() {
    if (this._s.lastCard === this) this._s.lastCard = null;
  }

  setConfig(config) {
    if (!config.url || !config.token) {
      throw new Error('ai-player-card: nastav "url" a "token"');
    }
    this._config = config;
    this._base = config.url.replace(/\/+$/, '');
    this._title = config.title || 'Přehrávač';
    this._render();
    this._video = this.shadowRoot.querySelector('video');
    this._bindMedia(this._video);

    // Singleton <audio> v body — přežije odpojení karty z DOMu.
    if (!this._s.audio) {
      const el = document.createElement('audio');
      el.preload = 'none';
      el.style.display = 'none';
      document.body.appendChild(el);
      this._s.audio = el;
      this._bindMedia(el);
    }

    this._s.lastCard = this;
    this._bindSwipe();
    this._loadLibrary();
    this._refreshPlayer();
    // Sledujeme sdílený stav — když přehrávání převezme jiné zařízení,
    // ztišíme se a ukážeme to (stejné pravidlo jako webový přehrávač).
    // Interval žije na storu → běží i když je karta dočasně mimo DOM.
    if (!this._s.pollTimer) {
      this._s.pollTimer = setInterval(
        () => (this._s.lastCard || this)._pollState(), 4000);
    }
  }

  getCardSize() {
    return 8;
  }

  static getStubConfig() {
    return { url: 'https://player.example.com', token: '' };
  }

  _media() {
    const item = this._s.queue[this._s.index];
    return item && item.type === 'video' ? this._video : this._s.audio;
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
      const [data, stateRes] = await Promise.all([
        this._api(`/api/v1/playlists/${playlist.id}/items`),
        this._api('/api/v1/player/state').catch(() => null),
      ]);
      this._openPlaylist = { ...playlist, items: data.data };

      // Nabídka pokračování: poslední sdílený stav ukazuje na skladbu,
      // která je v tomto playlistu → můžeme navázat tam, kde jiné
      // zařízení (nebo tahle karta) skončilo.
      this._resumeOffer = null;
      const s = stateRes && stateRes.state;
      if (s && s.current_uuid && s.position_seconds > 0) {
        const idx = data.data.findIndex((i) => i.uuid === s.current_uuid);
        if (idx >= 0) {
          this._resumeOffer = { index: idx, position: s.position_seconds, item: data.data[idx] };
        }
      }

      this._renderView('playlists');
    } catch (e) {
      this._showError(`Playlist: ${e.message}`);
    }
  }

  /* ---------------------------- přehrávání ---------------------------- */

  _playQueue(items, index) {
    this._s.queue = items.filter((i) => i.playable !== false);
    const offset = items.length - this._s.queue.length;
    this._s.index = Math.max(0, index - offset);
    this._playCurrent();
  }

  async _playCurrent() {
    const item = this._s.queue[this._s.index];
    if (!item) return;
    try {
      const src = await this._api(`/api/v1/media/${item.uuid}/playback-url`);
      const url = this._base + src.url;
      const media = this._media();
      const other = media === this._s.audio ? this._video : this._s.audio;
      other.pause();
      other.removeAttribute('src');

      await this._setupVisualizer(media, url);
      media.src = url;
      media.play();
      this._reported = false;
      this._beat();
      this._refreshPlayer();
      this._refreshLists();
    } catch (e) {
      this._showError(`Nelze přehrát „${item.title}“: ${e.message}`);
    }
  }

  _next() {
    if (this._s.shuffle && this._s.queue.length > 1) {
      this._s.index = Math.floor(Math.random() * this._s.queue.length);
    } else if (this._s.index < this._s.queue.length - 1) {
      this._s.index++;
    } else if (this._s.repeat === 'all') {
      this._s.index = 0;
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
    if (this._s.index > 0) {
      this._s.index--;
      this._playCurrent();
    }
  }

  _onEnded() {
    if (this._s.sleep.mode === 'track_end') {
      this._sleepFinished();
      return;
    }
    if (this._s.repeat === 'one') {
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
    if (this._s.viz.real === null) {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        this._s.viz.real = res.ok;
      } catch {
        this._s.viz.real = false;
      }
    }

    if (this._s.viz.real) {
      media.crossOrigin = 'anonymous';
      try {
        this._ensureAudioGraph(media);
        return;
      } catch {
        this._s.viz.real = false;
        media.crossOrigin = null;
      }
    }
    this._ensureFakeViz();
  }

  _ensureAudioGraph(media) {
    if (this._s.viz.sourceFor === media) return;
    if (!this._s.viz.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this._s.viz.ctx = new AC();
      this._s.viz.analyser = this._s.viz.ctx.createAnalyser();
      this._s.viz.analyser.fftSize = 128;
      this._s.viz.analyser.smoothingTimeConstant = 0.8;
      this._s.viz.analyser.connect(this._s.viz.ctx.destination);
    }
    this._s.viz.ctx.createMediaElementSource(media).connect(this._s.viz.analyser);
    this._s.viz.sourceFor = media;
    if (this._s.viz.ctx.state === 'suspended') this._s.viz.ctx.resume();
  }

  _ensureFakeViz() { /* fake režim běží přes rAF smyčku, setup není třeba */ }

  _startViz() {
    if (this._s.viz.raf) return;
    const canvas = this.shadowRoot.querySelector('[data-viz]');
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    const data = new Uint8Array(64);
    let t = 0;

    const draw = () => {
      // Mrtvá karta (mimo DOM) nekreslí — rAF se zastaví a na
      // reconnect ho spustí connectedCallback znovu.
      if (!this.isConnected) {
        this._s.viz.raf = null;
        return;
      }
      this._s.viz.raf = requestAnimationFrame(draw);
      const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
      const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
      ctx2d.clearRect(0, 0, w, h);
      const bars = 48;
      const gap = w / bars;

      let levels;
      if (this._s.viz.real && this._s.viz.analyser) {
        this._s.viz.analyser.getByteFrequencyData(data);
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
    clearInterval(this._s.sleep.interval);
    this._s.sleep.interval = null;
    this._s.sleep.mode = mode;
    this._s.sleep.deadline = mode === 'minutes' ? Date.now() + minutes * 60000 : null;
    if (mode === 'minutes') {
      this._s.sleep.interval = setInterval(() => this._sleepTick(), 1000);
    }
    this._refreshPlayer();
  }

  _sleepTick() {
    const left = Math.round((this._s.sleep.deadline - Date.now()) / 1000);
    if (left <= 0) {
      this._sleepFinished();
      return;
    }
    if (left <= this._s.sleep.fadeSeconds) {
      const base = this._s.userVolume ?? 0.8;
      this._media().volume = Math.max(0, base * (left / this._s.sleep.fadeSeconds));
    }
    const el = this.shadowRoot.querySelector('[data-sleep-left]');
    if (el) el.textContent = this._fmtDuration(left);
  }

  _sleepFinished() {
    clearInterval(this._s.sleep.interval);
    this._s.sleep.interval = null;
    this._s.sleep.mode = 'off';
    this._s.sleep.deadline = null;
    this._media().pause();
    this._media().volume = this._s.userVolume ?? 0.8;
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
      // Transform znovu nastavit — smazání by vizuálně skočilo na pohled 0
      // i když _view zůstal jinde (klik na položky se pak "poslal na Přehrávač").
      this._applyViewTransform();
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
    media.volume = this._s.userVolume ?? 0.8;
    // Události delegujeme na aktuálně živou kartu — element může
    // přežít několik jejích zničení a znovuvytvoření.
    const live = () => this._s.lastCard || this;
    media.addEventListener('ended', () => live()._onEnded());
    media.addEventListener('play', () => {
      live()._refreshPlayer();
      live()._startHeartbeat();
    });
    media.addEventListener('pause', () => {
      live()._refreshPlayer();
      live()._stopHeartbeat();
      live()._beat(); // jeden uvolňující tik — ostatní zařízení vědí, že jsme ztichli
    });
    media.addEventListener('loadedmetadata', () => {
      // Pokračování: skočíme tam, kde se naposledy skončilo.
      if (live()._resumePos !== null && isFinite(media.duration)) {
        media.currentTime = Math.min(live()._resumePos, Math.max(0, media.duration - 1));
        live()._resumePos = null;
      }
    });
    media.addEventListener('timeupdate', () => {
      const pos = media.currentTime;
      const dur = media.duration || 0;
      const card = live();
      const bar = card.shadowRoot.querySelector('[data-seek]');
      if (bar && !bar.matches(':active')) bar.value = dur ? (pos / dur) * 100 : 0;
      const t = card.shadowRoot.querySelector('[data-time]');
      if (t) t.textContent = `${this._fmtDuration(pos)} / ${this._fmtDuration(dur)}`;
      card._maybeReportPlay(pos, dur);
    });
  }

  _maybeReportPlay(position, duration) {
    if (this._reported || !this._s.queue[this._s.index]) return;
    if (position >= Math.min(duration * 0.5, 240)) {
      this._reported = true;
      this._api(`/api/v1/media/${this._s.queue[this._s.index].uuid}/plays`, {
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

  /* --------------------- sdílený stav (resume) --------------------- */

  _startHeartbeat() {
    if (this._s.beatTimer) return;
    // Interval na storu — běží i když je karta dočasně mimo DOM,
    // takže pozice zůstává napříč zařízeními aktuální.
    this._s.beatTimer = setInterval(
      () => (this._s.lastCard || this)._beat(), 5000);
  }

  _stopHeartbeat() {
    clearInterval(this._s.beatTimer);
    this._s.beatTimer = null;
  }

  /**
   * Srdeční tik do sdíleného stavu přehrávače. Posíláme frontu i pozici —
   * jiné zařízení (web, další HA karta) tak může nabídnout pokračování
   * přesně tam, kde tato karta skončila.
   */
  _beat() {
    const item = this._s.queue[this._s.index];
    if (!item) return;
    const media = this._media();
    this._api('/api/v1/player/state', {
      method: 'PUT',
      body: JSON.stringify({
        device_id: this._s.deviceId,
        current_uuid: item.uuid,
        position_seconds: media.currentTime || 0,
        volume: this._s.userVolume ?? 0.8,
        is_playing: !media.paused,
        repeat_mode: this._s.repeat,
        shuffle: this._s.shuffle,
        queue: this._s.queue.map((i) => i.uuid),
      }),
    }).catch(() => {});
  }

  /**
   * Dotaz na sdílený stav — převzalo přehrávání jiné zařízení?
   * `taken_over` spočítá server (cizí čerstvý vlastník, který hraje).
   * My se pak podřídíme: zastavíme vlastní zvuk i heartbeat a ukážeme,
   * kdo hraje místo nás.
   */
  async _pollState() {
    try {
      const res = await this._api('/api/v1/player/state', {
        headers: { 'X-Player-Device': this._s.deviceId },
      });
      const taken = !!res.taken_over;
      if (taken === this._s.takenOver) {
        if (taken) this._renderTakenOver(res.state);
        return;
      }
      this._s.takenOver = taken;
      if (taken) {
        this._media().pause();
        this._stopHeartbeat();
        this._renderTakenOver(res.state);
      } else {
        this._renderTakenOver(null);
      }
    } catch { /* síťové výpadky ignorujeme */ }
  }

  _renderTakenOver(state) {
    const el = this.shadowRoot.querySelector('[data-takenover]');
    if (!el) return;
    if (this._s.takenOver && state) {
      const who = state.device_id && state.device_id.startsWith('ha-')
        ? 'jiná karta'
        : 'webový přehrávač';
      el.textContent = `Přehrává ${who}`;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  _resumePlaylist() {
    const offer = this._resumeOffer;
    if (!offer || !this._openPlaylist) return;
    this._resumePos = offer.position;
    this._resumeOffer = null;
    this._playQueue(this._openPlaylist.items, offer.index);
    this._setView(0);
  }

  _dismissResume() {
    this._resumeOffer = null;
    this._renderView('playlists');
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
        .view { flex: 0 0 100%; min-width: 0; height: 480px; overflow-y: auto;
                overscroll-behavior: contain; padding: 14px 14px 6px; box-sizing: border-box; }
        .view[data-view="player"] { display: flex; flex-direction: column; }

        /* ------- přehrávač ------- */
        .hero { border-radius: 14px; overflow: hidden;
                background: var(--secondary-background-color, #1c1c1e);
                flex: 1 1 auto; min-height: 130px; display: flex; }
        /* Cover vlevo ~1/3, vizualizace vpravo ~2/3 */
        .cover-pane { position: relative; flex: 1; min-width: 0;
                      display: flex; align-items: center; justify-content: center; }
        .cover-pane img.cover { position: absolute; inset: 0; width: 100%; height: 100%;
                                object-fit: cover; display: block; }
        .cover-pane .no-cover { font-size: 46px; opacity: .4; }
        .cover-pane video { width: 100%; height: 100%; object-fit: contain; background: #000; }
        .cover-pane .fs { position: absolute; top: 8px; left: 8px; z-index: 2;
                          color: #fff; background: rgba(0,0,0,.45); border-radius: 10px; }
        canvas.viz { flex: 2; min-width: 0; height: 100%; pointer-events: none; }

        .p-meta { text-align: center; margin: 8px 4px 2px; flex-shrink: 0; }
        .p-meta .t { font-size: 17px; font-weight: 600; white-space: nowrap;
                     overflow: hidden; text-overflow: ellipsis; }
        .p-meta .a { font-size: 13px; color: var(--secondary-text-color); margin-top: 2px;
                     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .seek-row { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
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
                    gap: 4px; flex-shrink: 0; }
        button { background: none; border: none; cursor: pointer; padding: 10px;
                 color: var(--primary-text-color); border-radius: 12px;
                 min-width: 44px; min-height: 44px; font-size: 18px; font-family: inherit;
                 display: inline-flex; align-items: center; justify-content: center; }
        button:active { background: var(--secondary-background-color); }
        button.active { color: var(--primary-color); }
        button.big { font-size: 30px; }
        button.play { font-size: 34px; }

        .row2 { display: flex; align-items: center; justify-content: space-between;
                gap: 8px; margin-top: 2px; flex-wrap: wrap; flex-shrink: 0; }
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
        .pl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
                   gap: 10px; }
        .tile { border-radius: 10px; overflow: hidden; cursor: pointer; min-height: 44px;
                position: relative;
                background: var(--secondary-background-color, #f2f2f2); }
        .tile:active { opacity: .7; }
        .tile.playing { outline: 2px solid var(--primary-color); }
        .tile img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
        .tile-nocover, .tile-cover { width: 100%; aspect-ratio: 1; }
        .tile .tile-play { position: absolute; top: 6px; right: 6px; min-width: 40px;
                           min-height: 40px; padding: 4px; font-size: 16px; color: #fff;
                           background: rgba(0,0,0,.5); border-radius: 50%; }

        /* LP deska jako placeholder, když médium/playlist nemá cover */
        .disc { position: relative; width: 100%; height: 100%; border-radius: 50%;
                background: #141414; overflow: hidden;
                display: flex; align-items: center; justify-content: center;
                box-shadow: inset 0 0 0 1px #000; }
        .disc::before { content: ''; position: absolute; inset: 7%; border-radius: 50%;
                background: repeating-radial-gradient(circle,
                  #0d0d0d 0 2px, #1f1f1f 2px 4px); }
        .disc .label { position: relative; width: 36%; aspect-ratio: 1; border-radius: 50%;
                background: var(--primary-color, #03a9f4); color: #fff;
                display: flex; align-items: center; justify-content: center;
                font-size: 13px; }
        .tile .disc .label { font-size: 24px; }
        .disc .label::after { content: ''; position: absolute; width: 16%; aspect-ratio: 1;
                border-radius: 50%; background: #141414; }
        .disc .label span { position: relative; z-index: 1; display: flex;
                transform: translateY(-30%); }
        .disc .label svg { width: 60%; height: 60%; }
        .row .ph, .mini .ph { width: 44px; height: 44px; border-radius: 8px; flex-shrink: 0; }
        .mini .ph { width: 40px; height: 40px; }
        .tile-t { font-size: 12px; font-weight: 600; padding: 6px 8px 0;
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tile-s { font-size: 11px; color: var(--secondary-text-color); padding: 0 8px 6px;
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .more, .back { font-size: 14px; color: var(--primary-color); }
        .resume { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
                  margin-bottom: 8px; border-radius: 12px;
                  background: var(--secondary-background-color, #f2f2f2); }
        .resume .r-m { flex: 1; min-width: 0; font-size: 13px; }
        .resume .r-yes { background: var(--primary-color); color: #fff;
                         padding: 8px 14px; font-size: 13px; }
        .takenover { display: none; text-align: center; font-size: 12px;
                     color: var(--secondary-text-color); padding: 4px 0 8px; }
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
                <div class="cover-pane">
                  <img class="cover" data-cover alt="" style="display:none">
                  <div class="no-cover" data-nocover>${icon('note', 48)}</div>
                  <video data-video playsinline style="display:none"></video>
                  <button class="fs" data-fs style="display:none" title="Fullscreen">${icon('fullscreen', 20)}</button>
                </div>
                <canvas class="viz" data-viz></canvas>
              </div>
              <div class="takenover" data-takenover></div>
              <div class="p-meta">
                <div class="t" data-title>—</div>
                <div class="a" data-artist></div>
              </div>
              <div class="seek-row">
                <input type="range" data-seek min="0" max="100" value="0" step="0.1">
                <span class="time" data-time>0:00 / 0:00</span>
              </div>
              <div class="controls">
                <button data-shuffle title="Náhodně">${icon('shuffle', 22)}</button>
                <button class="big" data-prev title="Předchozí">${icon('prev', 32)}</button>
                <button class="big play" data-play title="Přehrát/pauza">${icon('play', 40)}</button>
                <button class="big" data-next title="Další">${icon('next', 32)}</button>
                <button data-repeat title="Opakovat">${icon('repeat', 22)}</button>
              </div>
              <div class="row2">
                <div class="vol">${icon('volume', 18)}<input type="range" data-volume min="0" max="100" value="80"></div>
                <div class="sleep">
                  ${icon('sleep', 18)}
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
          <button data-mini-play>${icon('play', 22)}</button>
          <button data-mini-next>${icon('next', 22)}</button>
        </div>

        <div class="tabs">
          <button data-tabbtn="player"><span class="ic">${icon('music', 20)}</span>Přehrávač</button>
          <button data-tabbtn="library"><span class="ic">${icon('bookshelf', 20)}</span>Knihovna</button>
          <button data-tabbtn="playlists"><span class="ic">${icon('playlist', 20)}</span>Playlisty</button>
          <button data-tabbtn="queue"><span class="ic">${icon('queue', 20)}</span>Fronta</button>
        </div>

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
      this._s.shuffle = !this._s.shuffle;
      e.currentTarget.classList.toggle('active', this._s.shuffle);
    });
    $('[data-repeat]').addEventListener('click', (e) => {
      this._s.repeat = { off: 'all', all: 'one', one: 'off' }[this._s.repeat];
      e.currentTarget.classList.toggle('active', this._s.repeat !== 'off');
      e.currentTarget.innerHTML = this._s.repeat === 'one' ? icon('repeat_one', 22) : icon('repeat', 22);
    });
    $('[data-seek]').addEventListener('input', (e) => {
      const dur = this._media().duration || 0;
      if (dur) this._media().currentTime = (e.target.value / 100) * dur;
    });
    $('[data-volume]').addEventListener('input', (e) => {
      this._s.userVolume = e.target.value / 100;
      this._media().volume = this._s.userVolume;
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
      if (this._s.queue.length) this._playCurrent();
      return;
    }
    if (m.paused) m.play(); else m.pause();
    this._refreshPlayer();
  }

  _refreshPlayer() {
    const item = this._s.queue[this._s.index];
    const $ = (s) => this.shadowRoot.querySelector(s);
    const isVideo = item && item.type === 'video';
    const paused = this._media().paused;

    $('[data-title]').textContent = item ? item.title : '—';
    $('[data-artist]').textContent = item
      ? [item.artist, item.album].filter(Boolean).join(' — ')
      : '';
    $('[data-play]').innerHTML = paused ? icon('play', 40) : icon('pause', 40);

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
    $('[data-mini-play]').innerHTML = paused ? icon('play', 22) : icon('pause', 22);

    const wrap = $('[data-sleep-wrap]');
    if (this._s.sleep.mode !== 'off') {
      wrap.style.display = 'inline';
      $('[data-sleep-left]').textContent = this._s.sleep.mode === 'minutes'
        ? this._fmtDuration((this._s.sleep.deadline - Date.now()) / 1000)
        : 'konec skladby';
    } else {
      wrap.style.display = 'none';
    }
  }

  _renderView(name) {
    const host = this.shadowRoot.querySelector(`[data-view="${name}"]`);
    if (!host) return;
    const current = this._s.queue[this._s.index];

    if (name === 'queue') {
      host.innerHTML =
        `<div class="list-header">${VIEW_TITLES.queue}</div>` +
        (this._s.queue.length
          ? this._s.queue.map((i, n) => this._row(i, n === this._s.index, n)).join('')
          : '<div class="empty">Fronta je prázdná.</div>');
      this._bindRows(host, (n) => { this._s.index = n; this._playCurrent(); });
      return;
    }

    if (name === 'playlists') {
      if (this._openPlaylist) {
        const items = this._openPlaylist.items;
        const tiles = items.length
          ? `<div class="pl-grid">${items.map((i, n) => `
              <div class="tile ${current && i.uuid === current.uuid ? 'playing' : ''}" data-row="${n}">
                ${i.coverUrl
                  ? `<img src="${this._base + i.coverUrl}" loading="lazy" alt="">`
                  : `<div class="tile-nocover">${this._vinyl()}</div>`}
                <div class="tile-t">${this._esc(i.title)}</div>
                <div class="tile-s">${this._esc(i.artist || '')}</div>
              </div>`).join('')}</div>`
          : '<div class="empty">Playlist je prázdný.</div>';
        const list = items.length ? items.map((i, n) => this._row(i, current && i.uuid === current.uuid, n)).join('') : '';
        const resume = this._resumeOffer
          ? `<div class="resume">
               <div class="r-m">Pokračovat od ${this._fmtDuration(this._resumeOffer.position)}<br>
               <b>${this._esc(this._resumeOffer.item.title)}</b></div>
               <button class="r-yes" data-resume>Pokračovat</button>
               <button class="r-no" data-dismiss-resume title="Zavřít">${icon('close', 16)}</button>
             </div>`
          : '';

        host.innerHTML =
          `<div class="list-header"><button class="back" data-back>${icon('back', 18)}</button>${this._esc(this._openPlaylist.name)}
            <button class="more" data-toggleview style="margin-left:auto">${this._plGrid ? icon('list', 18) : icon('grid', 18)}</button></div>` +
          resume +
          (this._plGrid ? tiles : list || '<div class="empty">Playlist je prázdný.</div>');

        const resumeBtn = host.querySelector('[data-resume]');
        if (resumeBtn) resumeBtn.addEventListener('click', () => this._resumePlaylist());
        const dismissBtn = host.querySelector('[data-dismiss-resume]');
        if (dismissBtn) dismissBtn.addEventListener('click', () => this._dismissResume());
        host.querySelector('[data-back]').addEventListener('click', () => {
          this._openPlaylist = null;
          this._renderView('playlists');
        });
        host.querySelector('[data-toggleview]').addEventListener('click', () => {
          this._plGrid = !this._plGrid;
          this._renderView('playlists');
        });
        this._bindRows(host, (n) => this._playQueue(this._openPlaylist.items, n));
      } else {
        host.innerHTML =
          `<div class="list-header">${VIEW_TITLES.playlists}</div>` +
          (this._playlists.length
            ? `<div class="pl-grid">${this._playlists.map((p, n) => `
                <div class="tile" data-pl="${n}">
                  ${p.cover_url
                    ? `<img src="${this._base + p.cover_url}" loading="lazy" alt="">`
                    : `<div class="tile-cover">${this._vinyl()}</div>`}
                  <button class="tile-play" data-plplay="${n}" title="Přehrát playlist">${icon('play', 16)}</button>
                  <div class="tile-t">${this._esc(p.name)}</div>
                  <div class="tile-s">${p.items_count} položek</div>
                </div>`).join('')}</div>`
            : '<div class="empty">Žádné playlisty.</div>');
        host.querySelectorAll('[data-pl]').forEach((el) =>
          el.addEventListener('click', (e) => {
            // Klik na ▶ přehrává, ne otevírá detail.
            if (e.target.closest('[data-plplay]')) return;
            this._openPlaylistItems(this._playlists[parseInt(el.dataset.pl, 10)]);
          }));
        host.querySelectorAll('[data-plplay]').forEach((el) =>
          el.addEventListener('click', () =>
            this._playPlaylist(this._playlists[parseInt(el.dataset.plplay, 10)])));
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

  _vinyl() {
    return `<div class="disc"><div class="label"><span>${icon('note', 0)}</span></div></div>`;
  }

  async _playPlaylist(playlist) {
    try {
      const data = await this._api(`/api/v1/playlists/${playlist.id}/items`);
      if (!data.data.length) {
        this._showError(`Playlist „${playlist.name}“ je prázdný.`);
        return;
      }
      this._playQueue(data.data, 0);
      this._setView(0);
    } catch (e) {
      this._showError(`Playlist: ${e.message}`);
    }
  }

  _row(item, playing, n) {
    const cover = item.coverUrl ? this._base + item.coverUrl : '';
    return `
      <div class="row ${playing ? 'playing' : ''}" data-row="${n}">
        ${cover ? `<img src="${cover}" loading="lazy" alt="">` : `<div class="ph">${this._vinyl()}</div>`}
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
