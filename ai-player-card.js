/**
 * AI Player — Lovelace karta pro Home Assistant.
 *
 * Přehrává média z ai-player knihovny přímo v prohlížeči, kde je
 * dashboard otevřený. Podporuje procházení knihovny, hledání, playlisty,
 * frontu, shuffle/repeat a sleep timer.
 *
 * Konfigurace karty:
 *   type: custom:ai-player-card
 *   url: https://player.example.com
 *   token: apt_…          (vytvoříš: php artisan app:token create <email> "HA")
 *   title: Přehrávač     (volitelné)
 */
class AiPlayerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._queue = [];
    this._index = -1;
    this._repeat = 'off'; // off | all | one
    this._shuffle = false;
    this._sleep = { mode: 'off', deadline: null, interval: null, fadeSeconds: 20 };
    this._tab = 'library';
    this._page = 1;
    this._lastPage = 1;
    this._query = '';
    this._items = [];
    this._playlists = [];
    this._openPlaylist = null;
    this._reported = false;
    this._debounce = null;
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
    this._bindAudio();
    this._loadLibrary();
  }

  getCardSize() {
    return 6;
  }

  static getStubConfig() {
    return { url: 'https://player.example.com', token: '' };
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
      this._renderList();
    } catch (e) {
      this._showError(`Knihovna: ${e.message}`);
    }
  }

  async _loadPlaylists() {
    try {
      const data = await this._api('/api/v1/playlists');
      this._playlists = data.data;
      this._renderList();
    } catch (e) {
      this._showError(`Playlisty: ${e.message}`);
    }
  }

  async _openPlaylistItems(playlist) {
    try {
      const data = await this._api(`/api/v1/playlists/${playlist.id}/items`);
      this._openPlaylist = { ...playlist, items: data.data };
      this._renderList();
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
      this._audio.src = this._base + src.url;
      this._audio.play();
      this._reported = false;
      this._applySleepToNewTrack();
      this._renderPlayer();
      this._renderList();
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
    if (this._audio.currentTime > 3) {
      this._audio.currentTime = 0;
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
      this._audio.currentTime = 0;
      this._audio.play();
      return;
    }
    if (this._next()) {
      this._playCurrent();
    } else {
      this._renderPlayer();
    }
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
    this._renderPlayer();
  }

  _applySleepToNewTrack() {
    // „Konec skladby" se resetuje po každé skladbě, kterou uživatel
    // spustil ručně — jinak by timer přežil svůj smysl.
    if (this._sleep.mode === 'track_end' && !this._sleep.deadline) {
      this._sleep.mode = 'off';
    }
  }

  _sleepTick() {
    const left = Math.round((this._sleep.deadline - Date.now()) / 1000);
    if (left <= 0) {
      this._sleepFinished();
      return;
    }
    // Fade-out: posledních N sekund lineárně ztišujeme.
    if (left <= this._sleep.fadeSeconds) {
      const base = this._userVolume ?? 0.8;
      this._audio.volume = Math.max(0, base * (left / this._sleep.fadeSeconds));
    }
    const el = this.shadowRoot.querySelector('[data-sleep-left]');
    if (el) el.textContent = this._fmtDuration(left);
  }

  _sleepFinished() {
    clearInterval(this._sleep.interval);
    this._sleep.interval = null;
    this._sleep.mode = 'off';
    this._sleep.deadline = null;
    this._audio.pause();
    this._audio.volume = this._userVolume ?? 0.8;
    this._renderPlayer();
  }

  _sleepLabel() {
    if (this._sleep.mode === 'track_end') return 'konec skladby';
    if (this._sleep.mode === 'minutes') return 'za';
    return '';
  }

  /* ------------------------------ UI ------------------------------ */

  _bindAudio() {
    this._audio.volume = this._userVolume ?? 0.8;
    this._audio.addEventListener('ended', () => this._onEnded());
    this._audio.addEventListener('play', () => this._renderPlayer());
    this._audio.addEventListener('pause', () => this._renderPlayer());
    this._audio.addEventListener('timeupdate', () => {
      const pos = this._audio.currentTime;
      const dur = this._audio.duration || 0;
      const bar = this.shadowRoot.querySelector('[data-seek]');
      if (bar && document.activeElement !== bar) bar.value = dur ? (pos / dur) * 100 : 0;
      const t = this.shadowRoot.querySelector('[data-time]');
      if (t) t.textContent = `${this._fmtDuration(pos)} / ${this._fmtDuration(dur)}`;
      this._maybeReportPlay(pos, dur);
    });
  }

  _maybeReportPlay(position, duration) {
    if (this._reported || !this._queue[this._index]) return;
    // Polovina skladby nebo 4 minuty — stejné pravidlo jako web.
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
        ha-card { padding: 12px; overflow: hidden; }
        .title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
        .error { display: none; background: var(--error-color, #db4437); color: #fff;
                 padding: 6px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 8px; }
        .player { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
        .cover { width: 56px; height: 56px; border-radius: 8px; object-fit: cover;
                 background: var(--secondary-background-color, #eee); flex-shrink: 0; }
        .meta { min-width: 0; flex: 1; }
        .meta .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .meta .a { font-size: 12px; color: var(--secondary-text-color);
                   white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .meta .time { font-size: 11px; color: var(--secondary-text-color); }
        input[type=range] { width: 100%; accent-color: var(--primary-color); }
        .controls { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        button { background: none; border: none; cursor: pointer; color: var(--primary-text-color);
                 padding: 4px; border-radius: 6px; font-size: 13px; font-family: inherit; }
        button:hover { background: var(--secondary-background-color); }
        button.active { color: var(--primary-color); }
        button.big { font-size: 22px; }
        .vol { display: flex; align-items: center; gap: 4px; width: 110px; }
        .vol input { width: 100%; }
        select { background: var(--card-background-color); color: var(--primary-text-color);
                 border: 1px solid var(--divider-color, #ddd); border-radius: 6px; padding: 3px; }
        .sleep { font-size: 12px; color: var(--secondary-text-color); display: flex; gap: 6px; align-items: center; }
        .tabs { display: flex; gap: 4px; margin: 8px 0; border-bottom: 1px solid var(--divider-color, #ddd); }
        .tabs button { padding: 6px 12px; border-radius: 6px 6px 0 0; color: var(--secondary-text-color); }
        .tabs button.active { color: var(--primary-color); border-bottom: 2px solid var(--primary-color); }
        .search { width: 100%; box-sizing: border-box; padding: 6px 10px; margin-bottom: 6px;
                  border: 1px solid var(--divider-color, #ddd); border-radius: 8px;
                  background: var(--card-background-color); color: var(--primary-text-color); }
        .list { max-height: 320px; overflow-y: auto; }
        .row { display: flex; gap: 10px; align-items: center; padding: 5px 4px;
               border-radius: 6px; cursor: pointer; }
        .row:hover { background: var(--secondary-background-color); }
        .row.playing { background: var(--secondary-background-color); }
        .row.playing .t { color: var(--primary-color); }
        .row img { width: 36px; height: 36px; border-radius: 5px; object-fit: cover;
                   background: var(--secondary-background-color, #eee); flex-shrink: 0; }
        .row .meta2 { min-width: 0; flex: 1; }
        .row .t { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .s { font-size: 11px; color: var(--secondary-text-color);
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .d { font-size: 11px; color: var(--secondary-text-color); }
        .more, .back { font-size: 13px; color: var(--primary-color); padding: 8px; }
        .empty { padding: 16px; text-align: center; color: var(--secondary-text-color); font-size: 13px; }
        audio { display: none; }
      </style>
      <ha-card>
        <div class="error" data-error></div>
        <div class="title">${this._esc(this._title)}</div>
        <div class="player">
          <img class="cover" data-cover alt="">
          <div class="meta">
            <div class="t" data-title>—</div>
            <div class="a" data-artist></div>
            <input type="range" data-seek min="0" max="100" value="0">
            <div class="time" data-time>0:00 / 0:00</div>
          </div>
        </div>
        <div class="controls">
          <button class="big" data-prev title="Předchozí">⏮</button>
          <button class="big" data-play title="Přehrát/pauza">▶</button>
          <button class="big" data-next title="Další">⏭</button>
          <button data-shuffle title="Náhodně">🔀</button>
          <button data-repeat title="Opakovat">🔁</button>
          <div class="vol">🔊<input type="range" data-volume min="0" max="100" value="80"></div>
          <div class="sleep">
            😴
            <select data-sleep>
              <option value="off">Sleeper vypnutý</option>
              <option value="track_end">Konec skladby</option>
              <option value="5">5 min</option><option value="10">10 min</option>
              <option value="15">15 min</option><option value="30">30 min</option>
              <option value="45">45 min</option><option value="60">60 min</option>
              <option value="90">90 min</option><option value="120">120 min</option>
            </select>
            <span data-sleep-left-wrap style="display:none"><span data-sleep-label></span> <span data-sleep-left></span></span>
          </div>
        </div>
        <div class="tabs">
          <button data-tab="library" class="active">Knihovna</button>
          <button data-tab="playlists">Playlisty</button>
          <button data-tab="queue">Fronta</button>
        </div>
        <div data-list></div>
        <audio preload="none"></audio>
      </ha-card>
    `;

    const $ = (sel) => this.shadowRoot.querySelector(sel);

    $('[data-play]').addEventListener('click', () => {
      if (this._audio.paused) this._audio.play(); else this._audio.pause();
    });
    $('[data-prev]').addEventListener('click', () => this._prev());
    $('[data-next]').addEventListener('click', () => { if (this._next()) this._playCurrent(); });
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
      const dur = this._audio.duration || 0;
      if (dur) this._audio.currentTime = (e.target.value / 100) * dur;
    });
    $('[data-volume]').addEventListener('input', (e) => {
      this._userVolume = e.target.value / 100;
      this._audio.volume = this._userVolume;
    });
    $('[data-sleep]').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === 'off') this._setSleep('off');
      else if (v === 'track_end') this._setSleep('track_end');
      else this._setSleep('minutes', parseInt(v, 10));
    });
    this.shadowRoot.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this._tab = b.dataset.tab;
        this.shadowRoot.querySelectorAll('[data-tab]').forEach((x) =>
          x.classList.toggle('active', x === b));
        this._openPlaylist = null;
        this._renderList();
        if (this._tab === 'playlists' && !this._playlists.length) this._loadPlaylists();
      }),
    );
  }

  _renderPlayer() {
    if (!this.shadowRoot.querySelector('[data-title]')) return;
    const item = this._queue[this._index];
    const $ = (s) => this.shadowRoot.querySelector(s);
    $('[data-title]').textContent = item ? item.title : '—';
    $('[data-artist]').textContent = item ? [item.artist, item.album].filter(Boolean).join(' — ') : '';
    const cover = $('[data-cover]');
    cover.src = item && item.coverUrl ? this._base + item.coverUrl : '';
    cover.style.visibility = item && item.coverUrl ? 'visible' : 'hidden';
    $('[data-play]').textContent = this._audio.paused ? '▶' : '⏸';
    const wrap = $('[data-sleep-left-wrap]');
    if (this._sleep.mode !== 'off') {
      wrap.style.display = 'inline';
      $('[data-sleep-label]').textContent = this._sleepLabel();
      $('[data-sleep-left]').textContent = this._sleep.mode === 'minutes'
        ? this._fmtDuration((this._sleep.deadline - Date.now()) / 1000)
        : '';
    } else {
      wrap.style.display = 'none';
    }
  }

  _renderList() {
    const host = this.shadowRoot.querySelector('[data-list]');
    if (!host) return;
    const current = this._queue[this._index];

    if (this._tab === 'queue') {
      host.innerHTML = this._queue.length
        ? this._queue.map((i, n) => this._row(i, n === this._index, n)).join('')
        : '<div class="empty">Fronta je prázdná.</div>';
      this._bindRows((n) => { this._index = n; this._playCurrent(); });
      return;
    }

    if (this._tab === 'playlists') {
      if (this._openPlaylist) {
        host.innerHTML =
          `<button class="back" data-back>← Zpět na playlisty</button>` +
          (this._openPlaylist.items.length
            ? this._openPlaylist.items.map((i, n) => this._row(i, current && i.uuid === current.uuid, n)).join('')
            : '<div class="empty">Playlist je prázdný.</div>');
        host.querySelector('[data-back]').addEventListener('click', () => {
          this._openPlaylist = null;
          this._renderList();
        });
        this._bindRows((n) => this._playQueue(this._openPlaylist.items, n));
      } else {
        host.innerHTML = this._playlists.length
          ? this._playlists.map((p, n) => `
              <div class="row" data-pl="${n}">
                <div class="meta2"><div class="t">${this._esc(p.name)}</div>
                <div class="s">${p.items_count} položek</div></div>
                <div class="d">▶</div>
              </div>`).join('')
          : '<div class="empty">Žádné playlisty.</div>';
        host.querySelectorAll('[data-pl]').forEach((el) =>
          el.addEventListener('click', () =>
            this._openPlaylistItems(this._playlists[parseInt(el.dataset.pl, 10)])));
      }
      return;
    }

    // Knihovna
    host.innerHTML = `
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
    this._bindRows((n) => this._playQueue(this._items, n));
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

  _bindRows(onPick) {
    this.shadowRoot.querySelectorAll('[data-row]').forEach((el) =>
      el.addEventListener('click', () => onPick(parseInt(el.dataset.row, 10))));
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
  description: 'Přehrávač knihovny ai-player — knihovna, playlisty, fronta, sleeper.',
  preview: false,
});
