import Router      from '../engine/Router.js';
import SaveManager  from '../engine/SaveManager.js';
import GameState    from '../engine/GameState.js';

/* ═══════════════════════════════════════════════════════════════════
   MainMenu — CONFLUX v2036
   Design: temný pixel art
   Press Start 2P = titul + systémové labely
   VT323 = vše ostatní (čitelné, terminálové)
   Žádné border-radius, žádný blur — hard pixel estetika
═══════════════════════════════════════════════════════════════════ */

const factionColor = f =>
  ({synth:'#4fa3e0', organic:'#e04f6a', hybrid:'#50e0b8', corruption:'#b570e0'}[f] || '#607080');

const MainMenu = {
  _container:   null,
  _listeners:   [],
  _glitchTimer: null,
  _noiseRaf:    null,

  // ── INIT ──────────────────────────────────────────────────────────
  init(container, params = {}) {
    this._container = container;
    this._listeners = [];
    if(this._noiseRaf) cancelAnimationFrame(this._noiseRaf);

    const hasSave   = SaveManager.hasSave() || !!localStorage.getItem('conflux_save');
    const alignment = GameState.player?.alignment ?? 0;
    const accentColor = alignment > 30  ? '#4fa3e0'
                      : alignment < -30 ? '#e04f6a'
                      :                   '#607080';

    this._injectStyles();

    // Intro cutscene — zakázáno, logo sekvence je intro

    container.innerHTML = `
      <div class="m-wrap">
        <!-- Logo uvnitř m-wrap jako absolute -->
        <div class="m-logo-wrap" id="m-logo-wrap" style="opacity:0">
          <img src="assets/images/logo.png" class="m-logo-img" id="m-logo-img" alt="" />

        </div>

        <!-- Pozadí — background.jpg -->
        <div class="m-bg" id="m-bg"></div>

        <!-- Scanlines -->
        <div class="m-scanlines" aria-hidden="true"></div>

        <!-- Noise canvas -->
        <canvas id="m-noise" class="m-noise"></canvas>

        <!-- Hlavní obsah — skrytý do 21s -->
        <div class="m-content" id="m-content" style="opacity:0;pointer-events:none">

          <!-- Název -->
          <div class="m-title-wrap">
            <h1 class="m-title" id="m-title" data-text="CONFLUX">CONFLUX</h1>
            <p class="m-tagline" id="m-tagline">the endless dance of order and chaos</p>
          </div>

          <!-- Navigace -->
          <nav class="m-nav" role="navigation">
            <button class="m-btn" id="btn-campaign" data-accent="${accentColor}">
              <span class="m-btn-cur">▶</span><span class="m-btn-label">NOVÁ HRA</span>
            </button>
            ${hasSave ? `<button class="m-btn" id="btn-continue" data-accent="${accentColor}">
              <span class="m-btn-cur">▶</span><span class="m-btn-label">POKRAČOVAT</span>
            </button>` : ''}
            <button class="m-btn" id="btn-free" data-accent="${accentColor}">
              <span class="m-btn-cur">▶</span><span class="m-btn-label">VOLNÝ SOUBOJ</span>
            </button>
            <button class="m-btn" id="btn-deck" data-accent="${accentColor}">
              <span class="m-btn-cur">▶</span><span class="m-btn-label">KOLEKCE</span>
            </button>
            <button class="m-btn" id="btn-deckbuilder" data-accent="${accentColor}">
              <span class="m-btn-cur">▶</span><span class="m-btn-label">DECK BUILDER</span>
            </button>
            <button class="m-btn m-btn-dim" id="btn-save" data-accent="#3d4a5c">
              <span class="m-btn-cur">·</span><span class="m-btn-label">ULOŽIT</span>
            </button>
            <button class="m-btn m-btn-dim" id="btn-load" data-accent="#3d4a5c">
              <span class="m-btn-cur">·</span><span class="m-btn-label">NAČÍST</span>
            </button>
            <button class="m-btn m-btn-dim" id="btn-settings" data-accent="#3d4a5c">
              <span class="m-btn-cur">·</span><span class="m-btn-label">NASTAVENÍ</span>
            </button>
            <button class="m-btn m-btn-dev" id="btn-dev" data-accent="#b570e0" title="Dev menu">
              <span class="m-btn-cur">◈</span><span class="m-btn-label">DEV</span>
            </button>
          </nav>

          <div class="m-status-bar" id="m-status-bar"></div>
          <div class="m-version">CONFLUX  v2095</div>
        </div>

        <!-- Alignment indikátor -->
        <div class="m-align-bar" style="--ac:${accentColor}"></div>

      </div>
    `;

    this._bindEvents();
    this._startGlitch();
    this._startNoise();
    this._startIntroSequence(accentColor);
  },

  // ── INTRO SEKVENCE ───────────────────────────────────────────────────────
  _startIntroSequence(accentColor) {
    const logoWrap    = this._container.querySelector('#m-logo-wrap');
    const logoImg     = this._container.querySelector('#m-logo-img');
    const menuContent = this._container.querySelector('#m-content');
    const bg          = this._container.querySelector('#m-bg');

    // Spusť hudbu
    this._startMenuMusic();

    // Funkce pro okamžité zobrazení menu (skip)
    const showMenuNow = () => {
      this._introTimers?.forEach(t => clearTimeout(t));
      this._introTimers = [];
      if(logoWrap) {
        logoWrap.style.transition = 'transform 0.8s ease, opacity 0.5s ease';
        logoWrap.style.opacity = '1';
        logoWrap.classList.remove('logo-pulsing');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          logoWrap.style.transform = 'translate(-50%,-50%) scale(1)';
        }));
      }
      if(bg) { bg.style.transition = 'opacity 1s'; bg.style.opacity = '0.75'; }
      if(menuContent) {
        menuContent.style.transition = 'opacity 0.5s';
        menuContent.style.opacity = '1';
        menuContent.style.pointerEvents = '';
      }
      this._startLogoIdle();
      this._updateStatusBar();
      // Odstraň skip listener
      document.removeEventListener('click', this._skipIntroHandler);
      document.removeEventListener('keydown', this._skipIntroHandler);
    };

    this._skipIntroHandler = showMenuNow;
    this._introTimers = [];

    // Skip na klik/klávesa
    setTimeout(() => {
      document.addEventListener('click', this._skipIntroHandler, { once: true });
      document.addEventListener('keydown', this._skipIntroHandler, { once: true });
    }, 500);

    // FÁZE 1 (0.5s) — logo fade in, malé uprostřed
    this._introTimers.push(setTimeout(() => {
      if(!this._container) return;
      if(logoWrap) {
        logoWrap.style.transition = 'opacity 2s ease';
        logoWrap.style.opacity = '1';
      }
    }, 500));

    // FÁZE 2 (3s) — logo začne jemně pulzovat (bez rotace)
    this._introTimers.push(setTimeout(() => {
      if(!this._container) return;
      if(logoWrap) logoWrap.classList.add('logo-pulsing');
    }, 3000));

    // FÁZE 2b (10s) — bg se pomalu vynoří
    this._introTimers.push(setTimeout(() => {
      if(!this._container) return;
      if(bg) {
        bg.style.transition = 'opacity 6s ease';
        bg.style.opacity = '0.75';
      }
    }, 10000));

    // FÁZE 3 (18s) — logo plynule roste do finální velikosti
    this._introTimers.push(setTimeout(() => {
      if(!this._container) return;
      if(logoWrap) {
        logoWrap.classList.remove('logo-pulsing');
        // Nastav transition explicitně před změnou scale
        logoWrap.style.transition = 'transform 6s cubic-bezier(0.1,0,0.2,1), opacity 1s ease';
        // requestAnimationFrame zajistí že transition je aplikována před změnou
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            logoWrap.style.transform = 'translate(-50%,-50%) scale(1)';
          });
        });
      }
    }, 18000));

    // FÁZE 4 (21s) — zobraz menu s stagger animací
    this._introTimers.push(setTimeout(() => {
      if(!this._container) return;
      document.removeEventListener('click', this._skipIntroHandler);
      document.removeEventListener('keydown', this._skipIntroHandler);
      if(menuContent) {
        menuContent.style.transition = 'opacity 1s ease';
        menuContent.style.opacity = '1';
        menuContent.style.pointerEvents = '';
        const items = menuContent.querySelectorAll('.m-title-wrap, .m-btn');
        items.forEach((el, i) => {
          el.style.opacity = '0';
          el.style.transform = 'translateY(8px)';
          setTimeout(() => {
            if(!document.contains(el)) return;
            el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          }, i * 90);
        });
      }
      this._startLogoIdle();
      this._updateStatusBar();
    }, 21000));
  },
  _startMenuMusic() {
    if(this._menuAudio) return;
    console.log('[Menu] _startMenuMusic spuštěn');

    // Vytvoř audio element a přidej do DOM — obchází autoplay blokování
    const audio = document.createElement('audio');
    audio.src  = 'assets/audio/menu_theme.mp3';
    audio.loop = true;
    audio.volume = 0;
    audio.id   = 'menu-audio';
    audio.onerror = () => {
      console.error('[Menu] ✗ Audio error:', audio.src);
      // Safari + file:// blokuje audio — zkus fetch + blob URL
      this._loadAudioViaFetch();
    };
    audio.oncanplay = () => console.log('[Menu] ✓ Audio načteno, délka:', audio.duration?.toFixed(1), 's');
    document.body.appendChild(audio);
    this._menuAudio = audio;

    const fadeInAudio = () => {
      // Nejdřív unmute, pak fade in volume
      if(this._menuAudio) this._menuAudio.muted = false;
      let vol = 0;
      const fi = setInterval(() => {
        if(!this._menuAudio) { clearInterval(fi); return; }
        vol = Math.min(vol + 0.01, 0.65);
        this._menuAudio.volume = vol;
        if(vol >= 0.65) clearInterval(fi);
      }, 60);
    };

    const tryPlay = () => {
      console.log('[Menu] tryPlay: src=', audio.src, 'readyState=', audio.readyState);
      const p = audio.play();
      if(p && p.then) {
        p.then(() => {
          console.log('[Menu] ✓ Hudba hraje!');
          if(this._menuAudio) this._menuAudio.muted = false;
          fadeInAudio();
          this._initAudioAnalyser();
        }).catch(err => {
          console.log('[Menu] ✗ Play failed:', err.name, err.message);
        });
      }
    };

    // Čekej na první user gesture — prohlížeč to vyžaduje
    this._onGesture = () => {
      tryPlay();
      document.removeEventListener('click',      this._onGesture);
      document.removeEventListener('keydown',    this._onGesture);
      document.removeEventListener('touchstart', this._onGesture);
      this._onGesture = null;
    };
    document.addEventListener('click',      this._onGesture);
    document.addEventListener('keydown',    this._onGesture);
    document.addEventListener('touchstart', this._onGesture);

    // Zkus ihned — funguje pokud prohlížeč dovolí (většinou ne)
    tryPlay();
    // Pozn: prohlížeče blokují autoplay — hudba nastartuje při prvním kliku/skip
  },

  _loadAudioViaFetch() {
    // Fallback pro Safari/file:// — načti přes fetch a vytvoř blob URL
    fetch('assets/audio/menu_theme.mp3')
      .then(r => {
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(buf => {
        const blob = new Blob([buf], { type: 'audio/mpeg' });
        const url  = URL.createObjectURL(blob);
        if(this._menuAudio) {
          this._menuAudio.src = url;
          this._menuAudio.load();
          console.log('[Menu] Audio načteno přes fetch/blob');
          // Spusť po načtení
          this._menuAudio.addEventListener('canplay', () => {
            if(this._menuAudio) {
              this._menuAudio.play().then(() => {
                console.log('[Menu] ✓ Hudba hraje (blob)');
                let vol = 0;
                const fi = setInterval(() => {
                  if(!this._menuAudio) { clearInterval(fi); return; }
                  vol = Math.min(vol + 0.01, 0.65);
                  this._menuAudio.volume = vol;
                  if(vol >= 0.65) clearInterval(fi);
                }, 60);
                this._initAudioAnalyser();
              }).catch(e => console.log('[Menu] Blob play failed:', e.message));
            }
          }, { once: true });
        }
      })
      .catch(e => console.error('[Menu] Fetch audio selhalo:', e.message));
  },

  _initAudioAnalyser() {
    if(this._audioAnalyser || !this._menuAudio) return;
    try {
      const ctx      = new (window.AudioContext || window.webkitAudioContext)();
      const src      = ctx.createMediaElementSource(this._menuAudio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      this._audioAnalyser = analyser;
      this._audioBuf = new Uint8Array(analyser.frequencyBinCount);
      this._startLogoPulse();
      console.log('[Menu] AudioAnalyser připojen');
    } catch(e) {
      console.log('[Menu] AudioAnalyser error:', e.message);
    }
  },
  _startLogoPulse() {
    if(!this._audioAnalyser) return;
    const logoImg = this._container.querySelector('#m-logo-img');
    if(!logoImg) return;

    const draw = () => {
      if(!document.contains(logoImg)) return;
      this._audioAnalyser.getByteFrequencyData(this._audioBuf);
      const avg = this._audioBuf.reduce((a, b) => a + b, 0) / this._audioBuf.length;
      // Jemný scale podle hlasitosti — max +5%
      const scale = 1 + (avg / 255) * 0.05;
      logoImg.style.transform = `scale(${scale})`;
      this._logoPulseRaf = requestAnimationFrame(draw);
    };
    draw();
  },

  _startLogoIdle() {
    // Žádná rotace — jen glow animace přes CSS
    // CSS třída logo-settled na logo-wrap zajistí idle glow
  },

  _updateStatusBar() {
    const el = this._container.querySelector('#m-status-bar');
    if(!el) return;
    const gs = GameState;
    const chapter = gs.campaign?.actNumber || gs.campaign?.chapter || 0;
    const alignment = gs.player?.alignment || 0;
    const alignLabel = alignment > 20 ? 'vychýlen k řádu' : alignment < -20 ? 'vychýlen k chaosu' : 'neutrální';
    const lastNode = gs.campaign?.currentNode || '—';
    if(chapter > 0) {
      el.textContent = `cyklus: ${String(chapter).padStart(2,'0')} · alignment: ${alignLabel} · poslední stopa: ${lastNode}`;
    }
  },

  // ── GLITCH ────────────────────────────────────────────────────────
  _startGlitch() {
    const title = this._container.querySelector('#m-title');
    if(!title) return;

    const GLITCH_CHARS = '▓░▒█▌▐◈◆';

    const doGlitch = () => {
      if(!document.contains(title)) return;

      // Pixel-shift jeden znak
      const original = 'CONFLUX';
      const pos = Math.floor(Math.random() * original.length);
      const sub = Math.random() > 0.6
        ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        : original[pos];

      const parts = original.split('');
      parts[pos] = `<span class="m-glitch-char" style="color:${Math.random()>0.5?'#4fa3e0':'#e04f6a'}">${sub}</span>`;
      title.innerHTML = parts.join('');

      setTimeout(() => {
        if(document.contains(title)) title.textContent = original;
      }, 60 + Math.random() * 80);

      // Občas dvojitý glitch
      if(Math.random() > 0.55) {
        setTimeout(() => {
          if(!document.contains(title)) return;
          title.classList.add('m-title-shift');
          setTimeout(() => {
            if(document.contains(title)) title.classList.remove('m-title-shift');
          }, 40);
        }, 100);
      }

      this._glitchTimer = setTimeout(doGlitch, 2800 + Math.random() * 4500);
    };

    this._glitchTimer = setTimeout(doGlitch, 1800 + Math.random() * 2000);

    // Corruption tagline rozpad
    const alignment = GameState.player?.alignment ?? 0;
    if(alignment < -55) this._corruptTagline();
  },

  _corruptTagline() {
    const el = this._container.querySelector('#m-tagline');
    if(!el) return;
    const original = el.textContent.split('');
    let state = [...original];
    const tick = () => {
      if(!document.contains(el)) return;
      const i = Math.floor(Math.random() * state.length);
      state[i] = Math.random() > 0.6 ? '▓' : original[i];
      el.textContent = state.join('');
      setTimeout(tick, 250 + Math.random() * 400);
    };
    tick();
  },

  // ── NOISE ─────────────────────────────────────────────────────────
  _startNoise() {
    const canvas = this._container.querySelector('#m-noise');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const draw = () => {
      if(!document.contains(canvas)) return;
      const d = ctx.createImageData(canvas.width, canvas.height);
      const buf = d.data;
      for(let i = 0; i < buf.length; i += 4) {
        const v = Math.random() * 255;
        buf[i] = buf[i+1] = buf[i+2] = v;
        buf[i+3] = Math.random() * 6;
      }
      ctx.putImageData(d, 0, 0);
      this._noiseRaf = requestAnimationFrame(draw);
    };
    draw();
  },

  // ── BIND EVENTS ───────────────────────────────────────────────────
  _bindEvents() {
    const on = (id, fn) => {
      const el = this._container.querySelector(`#${id}`);
      if(!el) return;
      const handler = () => fn();
      el.addEventListener('click', handler);
      this._listeners.push({ el, fn: handler });
    };

    // Hover efekt — pixel shift + barva
    this._container.querySelectorAll('.m-btn:not(.m-btn-dim)').forEach(btn => {
      const accent = btn.dataset.accent || '#607080';
      btn.addEventListener('mouseenter', () => {
        btn.style.color = accent;
        btn.style.transform = 'translateX(4px)';
        btn.querySelector('.m-btn-cur').textContent = '▶';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.color = '';
        btn.style.transform = '';
        btn.querySelector('.m-btn-cur').textContent = '▶';
      });
    });

    this._container.querySelectorAll('.m-btn-dim').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.color = '#8090a0';
        btn.style.transform = 'translateX(2px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.color = '';
        btn.style.transform = '';
      });
    });

    on('btn-campaign', () => this._clickGo(() => {
      GameState.reset();
      Router.goto('story', { nodeId: 'act1_intro' });
    }));

    on('btn-continue', () => {
      const slots = SaveManager.listSlots?.() || [];
      const filled = slots.filter(s => !s.empty);
      if(filled.length === 1) {
        const ok = SaveManager.load(filled[0].slot);
        if(ok) {
          // Preferuj checkpoint, fallback na currentNode, pak act1_intro
          const nodeId = GameState.checkpoint?.nodeId
                      || GameState.campaign?.currentNode
                      || 'act1_intro';
          console.log('[Continue] nodeId:', nodeId, '| checkpoint:', GameState.checkpoint?.nodeId, '| currentNode:', GameState.campaign?.currentNode);
          this._clickGo(() => Router.goto('story', { nodeId }));
          return;
        }
      } else if(filled.length > 1) {
        this._showSlotPicker('load');
        return;
      }
      // Fallback: zkus legacy conflux_save
      try {
        const raw = localStorage.getItem('conflux_save');
        if(raw) {
          const data = JSON.parse(raw);
          GameState.fromSave(data);
          if(data.checkpoint) GameState.checkpoint = { ...data.checkpoint };
          const nodeId = data.checkpoint?.nodeId
                      || data.campaign?.currentNode
                      || data.currentNode
                      || 'act1_intro';
          this._clickGo(() => Router.goto('story', { nodeId }));
          return;
        }
      } catch(e) {}
      Router.goto('menu');
    });
    on('btn-free',     () => this._clickGo(() => Router.goto('freebattle')));
    on('btn-deck',        () => this._clickGo(() => Router.goto('collection')));
    on('btn-deckbuilder', () => this._clickGo(() => Router.goto('deck')));
    on('btn-save',     () => this._showSlotPicker('save'));
    on('btn-load',     () => this._showSlotPicker('load'));
    on('btn-settings', () => this._showSettings());
    on('btn-dev',      () => this._showDevMenu());
  },

  // Krátký glitch na titulu → pak přechod
  _clickGo(cb) {
    const title = this._container.querySelector('#m-title');
    if(title) {
      title.classList.add('m-title-shift');
      setTimeout(() => {
        if(document.contains(title)) title.classList.remove('m-title-shift');
      }, 120);
    }
    setTimeout(cb, 150);
  },

  // ── OVERLAYS ──────────────────────────────────────────────────────
  _overlay(innerHtml) {
    const ov = document.createElement('div');
    ov.className = 'm-overlay';
    ov.innerHTML = `<div class="m-dialog">${innerHtml}</div>`;
    this._container.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('m-overlay--visible'));
    ov.querySelector('#ov-cancel')?.addEventListener('click', () => {
      ov.classList.remove('m-overlay--visible');
      setTimeout(() => ov.remove(), 140);
    });
    return ov;
  },

  _showSettings() {
    const s = GameState.settings;
    const musicPct  = Math.round((s.musicVolume ?? 0.5) * 100);
    const sfxPct    = Math.round((s.sfxVolume   ?? 0.8) * 100);
    const speed     = s.textSpeed   ?? 'normal';
    const diff      = s.difficulty  ?? 0;
    const kbOn      = s.keyboardShortcuts !== false;
    const fsOn      = !!document.fullscreenElement;

    const speedOpts = [
      { val:'slow',    label:'POMALÁ'   },
      { val:'normal',  label:'NORMÁLNÍ' },
      { val:'fast',    label:'RYCHLÁ'   },
      { val:'instant', label:'OKAMŽITÁ' },
    ];
    const diffOpts = [
      { val:0, label:'NORMÁLNÍ'  },
      { val:1, label:'TĚŽKÁ'     },
      { val:2, label:'PERFEKTNÍ' },
    ];

    const speedBtns = speedOpts.map(o =>
      `<button class="m-tog m-set-btn${speed===o.val?' m-tog--on':''}" data-speed="${o.val}">${o.label}</button>`
    ).join('');
    const diffBtns = diffOpts.map(o =>
      `<button class="m-tog m-set-btn${diff===o.val?' m-tog--on':''}" data-diff="${o.val}">${o.label}</button>`
    ).join('');

    const ov = this._overlay(`
      <div class="m-dialog-title">NASTAVENÍ</div>

      <div class="m-row">
        <span class="m-row-label">HUDBA</span>
        <div class="m-slider-wrap">
          <input type="range" class="m-slider" id="sl-music" min="0" max="100" value="${musicPct}">
          <span class="m-slider-val" id="sl-music-val">${musicPct}%</span>
        </div>
      </div>

      <div class="m-row">
        <span class="m-row-label">ZVUKY</span>
        <div class="m-slider-wrap">
          <input type="range" class="m-slider" id="sl-sfx" min="0" max="100" value="${sfxPct}">
          <span class="m-slider-val" id="sl-sfx-val">${sfxPct}%</span>
        </div>
      </div>

      <div class="m-row m-row--col">
        <span class="m-row-label">RYCHLOST TEXTU</span>
        <div class="m-btn-group" id="grp-speed">${speedBtns}</div>
      </div>

      <div class="m-row m-row--col">
        <span class="m-row-label">OBTÍŽNOST AI</span>
        <div class="m-btn-group" id="grp-diff">${diffBtns}</div>
      </div>

      <div class="m-row">
        <span class="m-row-label">FULLSCREEN</span>
        <button class="m-tog${fsOn?' m-tog--on':''}" id="tog-fs">${fsOn?'ON':'OFF'}</button>
      </div>

      <div class="m-row">
        <span class="m-row-label">KLÁVESNICE</span>
        <button class="m-tog${kbOn?' m-tog--on':''}" id="tog-kb">${kbOn?'ON':'OFF'}</button>
      </div>
      <div class="m-row-hint">Enter · Mezerník · Esc</div>

      <div class="m-row m-row--danger" style="margin-top:16px">
        <span class="m-row-label" style="color:#3d4a5c">RESET</span>
        <button class="m-tog m-tog--danger" id="tog-reset">NOVÝ CYKLUS</button>
      </div>

      <button class="m-cancel-btn" id="ov-cancel">✕  ZAVŘÍT</button>
    `);

    const save = () => { try { SaveManager.save?.(0); } catch(e) {} };

    // Hudba slider
    ov.querySelector('#sl-music')?.addEventListener('input', e => {
      const v = Number(e.target.value) / 100;
      ov.querySelector('#sl-music-val').textContent = e.target.value + '%';
      s.musicVolume = v;
      AudioSystem?.setMusicVolume?.(v);
      save();
    });

    // SFX slider
    ov.querySelector('#sl-sfx')?.addEventListener('input', e => {
      const v = Number(e.target.value) / 100;
      ov.querySelector('#sl-sfx-val').textContent = e.target.value + '%';
      s.sfxVolume = v;
      AudioSystem?.setSfxVolume?.(v);
      save();
    });

    // Text speed group
    ov.querySelector('#grp-speed')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-speed]');
      if(!btn) return;
      s.textSpeed = btn.dataset.speed;
      ov.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('m-tog--on', b===btn));
      save();
    });

    // Difficulty group
    ov.querySelector('#grp-diff')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-diff]');
      if(!btn) return;
      s.difficulty = Number(btn.dataset.diff);
      ov.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('m-tog--on', b===btn));
      save();
    });

    // Fullscreen
    ov.querySelector('#tog-fs')?.addEventListener('click', e => {
      if(!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(()=>{});
        e.target.textContent = 'ON'; e.target.classList.add('m-tog--on');
      } else {
        document.exitFullscreen?.();
        e.target.textContent = 'OFF'; e.target.classList.remove('m-tog--on');
      }
    });

    // Klávesnice
    ov.querySelector('#tog-kb')?.addEventListener('click', e => {
      s.keyboardShortcuts = !s.keyboardShortcuts;
      e.target.textContent = s.keyboardShortcuts ? 'ON' : 'OFF';
      e.target.classList.toggle('m-tog--on', s.keyboardShortcuts);
      save();
    });

    // Reset
    ov.querySelector('#tog-reset')?.addEventListener('click', e => {
      if(e.target.dataset.confirm !== '1') {
        e.target.textContent = 'JISTĚ?';
        e.target.dataset.confirm = '1';
        setTimeout(() => {
          if(document.contains(e.target)) {
            e.target.textContent = 'NOVÝ CYKLUS';
            e.target.dataset.confirm = '';
          }
        }, 2500);
      } else {
        SaveManager.clearAll?.();
        GameState.reset?.();
        ov.remove();
        Router.goto('menu');
      }
    });
  },

  _showSlotPicker(mode) {
    const slots = SaveManager.listSlots?.() || [];
    const title = mode === 'save' ? 'ULOŽIT' : 'NAČÍST';

    const slotRows = slots.map(s => {
      if(s.empty) {
        return `<button class="m-slot-row ${mode==='load'?'m-slot-row--disabled':''}" data-slot="${s.slot}" data-empty="1">
          <span class="m-slot-num">0${s.slot+1}</span>
          <span class="m-slot-name" style="color:#3d4a5c">— prázdný —</span>
        </button>`;
      }
      const fc = s.faction ? factionColor(s.faction) : '#607080';
      return `<button class="m-slot-row" data-slot="${s.slot}" data-empty="0">
        <span class="m-slot-num">0${s.slot+1}</span>
        <span class="m-slot-info">
          <span class="m-slot-name">${s.playerName || '???'}</span>
          <span class="m-slot-meta">
            <span style="color:${fc}">${(s.faction||'neutral').toUpperCase()}</span>
            <span style="color:#3d4a5c">·</span>
            <span>KAP.${s.chapter||'?'}</span>
            <span style="color:#3d4a5c;margin-left:auto">${s.date||''}</span>
          </span>
        </span>
        ${mode==='save'?'<span class="m-slot-overwrite">přepsat</span>':''}
      </button>`;
    }).join('');

    const ov = this._overlay(`
      <div class="m-dialog-title">${title}</div>
      <div class="m-slot-list">${slotRows}</div>
      <button class="m-cancel-btn" id="ov-cancel">✕  ZRUŠIT</button>
    `);

    ov.querySelectorAll('.m-slot-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot  = parseInt(btn.dataset.slot);
        const empty = btn.dataset.empty === '1';
        if(mode === 'load' && empty) return;
        if(mode === 'save') {
          SaveManager.save(slot);
          const ow = btn.querySelector('.m-slot-overwrite');
          if(ow) ow.textContent = '✓';
          btn.style.color = '#50e0b8';
          setTimeout(() => ov.remove(), 800);
        }
        if(mode === 'load') {
          const ok = SaveManager.load(slot);
          ov.remove();
          // Zkus checkpoint z GameState, pak z SaveManager, pak act1_intro
          const nodeId = GameState.checkpoint?.nodeId
            || SaveManager.getCheckpointNodeId?.()
            || 'act1_intro';
          if(ok) {
            Router.goto('story', { nodeId });
          } else {
            Router.goto('menu');
          }
        }
      });
    });
  },

  // Čtení/zápis výsledků free battle z localStorage
  _fbRecord(enemyId) {
    try { return JSON.parse(localStorage.getItem('conflux_fb_' + enemyId) || '{"w":0,"l":0}'); }
    catch { return {w:0, l:0}; }
  },
  recordFreeBattleResult(enemyId, won) {
    const r = this._fbRecord(enemyId);
    if(won) r.w++; else r.l++;
    try { localStorage.setItem('conflux_fb_' + enemyId, JSON.stringify(r)); } catch {}
  },

  async _showFreeBattlePicker() {
    const BATTLE_MAP  = [{"num":1,"actId":"1","battles":[{"nodeId":"act1_tutorial","enemyId":"monyra_tutorial","name":"Monyra","boss":false},{"nodeId":"act1_battle_1","enemyId":"act1_01","name":"Hlídkový systém","boss":false},{"nodeId":"act1_battle_2","enemyId":"act1_02","name":"Správce zóny Kellner","boss":false},{"nodeId":"act1_battle_3_synth","enemyId":"act1_04","name":"Síťový operátor","boss":false},{"nodeId":"act1_battle_3_organic","enemyId":"act1_03","name":"Lesní stráž — Trojice","boss":false},{"nodeId":"act1_boss","enemyId":"act1_boss","name":"Vykonavatel","boss":true}]},{"num":2,"actId":"2","battles":[{"nodeId":"act2_battle_1","enemyId":"act2_01","name":"Pohraničník Řeka","boss":false},{"nodeId":"act2_battle_2","enemyId":"act2_02","name":"Lesní rada — Staří","boss":false},{"nodeId":"act2_battle_vanek","enemyId":"act2_03","name":"Systémový agent Vaněk","boss":false},{"nodeId":"act2_battle_marta","enemyId":"act2_04","name":"Hlídač komunity — Marta","boss":false},{"nodeId":"act2_battle_ruins","enemyId":"act2_01","name":"Pohraničník Řeka","boss":false},{"nodeId":"act2_boss","enemyId":"act2_boss","name":"Správce brány — Tichý","boss":true}]},{"num":3,"actId":"3","battles":[{"nodeId":"act3_battle_1","enemyId":"act3_01","name":"Přechodný strážce","boss":false},{"nodeId":"act3_battle_hana","enemyId":"act3_02","name":"Fúzní duelista Hana","boss":false},{"nodeId":"act3_boss","enemyId":"act3_boss","name":"Duelista — Bez jména","boss":true}]},{"num":4,"actId":"4","battles":[{"nodeId":"act4_battle_testovac","enemyId":"act4_01","name":"Testovač Nexu — Drak","boss":false},{"nodeId":"act4_battle_marta","enemyId":"act4_marta","name":"Marta","boss":false},{"nodeId":"act4_battle_vymahac_2","enemyId":"act4_02","name":"Syndikátní vymahač — Ocel","boss":false},{"nodeId":"act4_battle_vymahac_3","enemyId":"act4_03","name":"Syndikátní vymahač — Druhý","boss":false},{"nodeId":"act4_boss","enemyId":"act4_veritel","name":"Syndikátní věřitel","boss":true}]},{"num":5,"actId":"5","battles":[{"nodeId":"act5_battle_eli","enemyId":"act5_eli","name":"Eli","boss":false}]},{"num":6,"actId":"6","battles":[{"nodeId":"act6_battle_agent","enemyId":"act6_01","name":"Systémový agent — Ticho","boss":false}]},{"num":7,"actId":"7","battles":[{"nodeId":"act7_battle_rekalibrator","enemyId":"act7_01","name":"Rekalibrační agent","boss":false},{"nodeId":"act7_boss","enemyId":"act7_boss","name":"Správce přepisu","boss":true}]},{"num":8,"actId":"8","battles":[{"nodeId":"act8_battle_veritel","enemyId":"act8_veritel","name":"Syndikátní věřitel","boss":false}]},{"num":9,"actId":"9","battles":[{"nodeId":"act9_battle_pozorovatel","enemyId":"act9_pozorovatel","name":"Pozorovatel přechodu","boss":false}]},{"num":10,"actId":"10","battles":[{"nodeId":"act10_a_boss","enemyId":"act10_sigma","name":"Sigma","boss":true},{"nodeId":"act10_b_boss","enemyId":"act10_pramati","name":"Pramáti","boss":true},{"nodeId":"act10_c_boss","enemyId":"act10_paradox","name":"Paradox pozorovatele","boss":true},{"nodeId":"act10_d_battle","enemyId":"act10_protokol_core","name":"Přepisovací jádro","boss":false}]}];
    const ACT_LABELS  = ['','Začátek','Za hranicí','Nexus','Syndikát','Eli','Agent','Rekalibrátор','Věřitel','Pozorovatel','Finále'];
    const flags       = GameState.campaign?.flags || {};
    const chapter     = GameState.campaign?.actNumber || GameState.campaign?.chapter || 0;

    // Odemčeno = nepřítel byl poražen (flag beaten_ NEBO encountered_)
    const beaten = new Set(
      Object.keys(flags).filter(k => k.startsWith('beaten_') && flags[k]).map(k => k.replace('beaten_',''))
    );
    // Encountered = hráč se s ním potkal (i prohra) — jméno se odhalí
    const encountered = new Set([
      ...beaten,
      ...Object.keys(flags).filter(k => k.startsWith('encountered_') && flags[k]).map(k => k.replace('encountered_','')),
    ]);
    // Free battle record existuje = taky encountered
    const allEnemyIds = BATTLE_MAP.flatMap(act => act.battles.map(b => b.enemyId));
    allEnemyIds.forEach(eid => {
      const rec = this._fbRecord(eid);
      if(rec.w > 0 || rec.l > 0) encountered.add(eid);
    });

    // Akt je odemčen pokud hráč dosáhl jeho čísla nebo porazil bosse předchozího
    const unlockedAct = (num) => num === 1 || num <= (chapter + 1);
    // Bitva VIDITELNÁ pokud akt je odemčen (zobrazí se v seznamu)
    const battleVisible = (b, actNum) => unlockedAct(actNum);
    // Bitva HRATELNÁ pouze pokud encountered (hráč se s ním potkal)
    const battlePlayable = (b) => encountered.has(b.enemyId);
    // Jméno viditelné jen pokud encountered
    const nameRevealed = (b) => encountered.has(b.enemyId);

    // Globální W/L counter
    let totalW = 0, totalL = 0;
    allEnemyIds.forEach(eid => { const r = this._fbRecord(eid); totalW += r.w; totalL += r.l; });
    const selfRec = this._fbRecord('__self__');
    totalW += selfRec.w; totalL += selfRec.l;

    const actsHtml = BATTLE_MAP.map(act => {
      const anyVisible = act.battles.some(b => battleVisible(b, act.num));
      const allHidden  = !anyVisible;

      const battlesHtml = act.battles.map(b => {
        const visible  = battleVisible(b, act.num);
        if(!visible) return ''; // don't render battles from locked acts
        const playable = battlePlayable(b);
        const revealed = nameRevealed(b);
        const rec = this._fbRecord(b.enemyId);
        const scoreHtml = (rec.w > 0 || rec.l > 0)
          ? `<span style="font-size:9px;letter-spacing:0.5px"><span style="color:#50e0b8">✓${rec.w}</span> <span style="color:#e04f6a">✗${rec.l}</span></span>`
          : '';
        const displayName = revealed ? b.name : '???';
        return `<button class="fb-battle-btn" data-enemy="${b.enemyId}"
          style="display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px 7px 22px;
                 background:#060a0f;border:none;border-left:2px solid ${b.boss?'#b570e0':'#1a2535'};
                 color:${playable?(b.boss?'#b570e0':'#c8d6e5'):'#2a3545'};
                 font-family:monospace;font-size:11px;cursor:${playable?'pointer':'default'};text-align:left;"
          ${playable?'':'disabled'}>
          <span>${b.boss?'★':'·'}</span>
          <span style="flex:1">${displayName}</span>
          ${scoreHtml}
          ${!playable?'<span style="color:#2a3545;font-size:9px">🔒</span>':''}
        </button>`;
      }).join('');

      return `<div style="margin-bottom:4px;">
        <button class="fb-act-header" data-act="${act.num}"
          style="display:flex;justify-content:space-between;align-items:center;width:100%;
                 padding:7px 10px;background:${allHidden?'#060a0f':'#0a0f18'};
                 border:1px solid ${allHidden?'#0d1520':'#1a2535'};
                 color:${allHidden?'#2a3545':'#c8d6e5'};font-family:monospace;font-size:10px;
                 cursor:${allHidden?'default':'pointer'};margin-bottom:2px;">
          <span><span style="color:${allHidden?'#2a3545':'#b570e0'}">Akt ${act.num}</span> — ${ACT_LABELS[act.num]}</span>
          <span style="color:#3d4a5c">${allHidden?'🔒':act.battles.length+' bitev'}</span>
        </button>
        <div id="fb-battles-${act.num}" style="display:none;flex-direction:column;gap:2px;">
          ${battlesHtml}
        </div>
      </div>`;
    }).join('');

    const globalStatsHtml = (totalW > 0 || totalL > 0)
      ? `<div style="display:flex;justify-content:center;gap:16px;font-family:monospace;font-size:11px;padding:6px 0 10px;border-bottom:1px solid #1a2535;margin-bottom:8px;">
          <span style="color:#50e0b8">VÍTĚZSTVÍ: ${totalW}</span>
          <span style="color:#2a3545">|</span>
          <span style="color:#e04f6a">PORÁŽKY: ${totalL}</span>
          <span style="color:#2a3545">|</span>
          <span style="color:#c8d6e5">${totalW + totalL} celkem</span>
        </div>`
      : '';

    const ov = this._overlay(`
      <div class="m-dialog-title">⚔ VOLNÝ SOUBOJ</div>
      ${globalStatsHtml}
      <button class="m-slot-row" data-enemy="__self__" style="margin-bottom:10px">
        <span class="m-slot-num">🪞</span>
        <span class="m-slot-info">
          <span class="m-slot-name">Pozorovatel</span>
          <span class="m-slot-meta" style="color:#50e0b8">tvá kolekce vs tvá kolekce</span>
        </span>
      </button>
      <div style="max-height:55vh;overflow-y:auto;">${actsHtml}</div>
      <button class="m-cancel-btn" id="ov-cancel">✕  ZRUŠIT</button>
    `);

    // Rozbalení aktu
    ov.querySelectorAll('.fb-act-header').forEach(btn => {
      btn.addEventListener('click', () => {
        const actNum  = btn.dataset.act;
        const battles = ov.querySelector('#fb-battles-' + actNum);
        if(!battles) return;
        const isOpen  = battles.style.display !== 'none';
        ov.querySelectorAll('[id^="fb-battles-"]').forEach(b => b.style.display = 'none');
        if(!isOpen) battles.style.display = 'flex';
      });
    });

    // Pozorovatel
    ov.querySelector('[data-enemy="__self__"]')?.addEventListener('click', () => {
      ov.remove();
      Router.goto('battle', { enemyId:'__self__', mode:'free', selfBattle:true });
    });

    // Bitvy
    ov.querySelectorAll('.fb-battle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        ov.remove();
        Router.goto('battle', { enemyId: btn.dataset.enemy, mode:'free' });
      });
    });
  },


  _showDevMenu() {
    const BATTLE_MAP = [{"num":1,"actId":"1","battles":[{"nodeId":"act1_tutorial","enemyId":"monyra_tutorial","name":"Monyra","boss":false},{"nodeId":"act1_battle_1","enemyId":"act1_01","name":"Hlídkový systém","boss":false},{"nodeId":"act1_battle_2","enemyId":"act1_02","name":"Správce zóny Kellner","boss":false},{"nodeId":"act1_battle_3_synth","enemyId":"act1_04","name":"Síťový operátor","boss":false},{"nodeId":"act1_battle_3_organic","enemyId":"act1_03","name":"Lesní stráž — Trojice","boss":false},{"nodeId":"act1_boss","enemyId":"act1_boss","name":"Vykonavatel","boss":true}]},{"num":2,"actId":"2","battles":[{"nodeId":"act2_battle_1","enemyId":"act2_01","name":"Pohraničník Řeka","boss":false},{"nodeId":"act2_battle_2","enemyId":"act2_02","name":"Lesní rada — Staří","boss":false},{"nodeId":"act2_battle_vanek","enemyId":"act2_03","name":"Systémový agent Vaněk","boss":false},{"nodeId":"act2_battle_marta","enemyId":"act2_04","name":"Hlídač komunity — Marta","boss":false},{"nodeId":"act2_battle_ruins","enemyId":"act2_01","name":"Pohraničník Řeka","boss":false},{"nodeId":"act2_boss","enemyId":"act2_boss","name":"Správce brány — Tichý","boss":true}]},{"num":3,"actId":"3","battles":[{"nodeId":"act3_battle_1","enemyId":"act3_01","name":"Přechodný strážce","boss":false},{"nodeId":"act3_battle_hana","enemyId":"act3_02","name":"Fúzní duelista Hana","boss":false},{"nodeId":"act3_boss","enemyId":"act3_boss","name":"Duelista — Bez jména","boss":true}]},{"num":4,"actId":"4","battles":[{"nodeId":"act4_battle_testovac","enemyId":"act4_01","name":"Testovač Nexu — Drak","boss":false},{"nodeId":"act4_battle_marta","enemyId":"act4_marta","name":"Marta","boss":false},{"nodeId":"act4_battle_vymahac_2","enemyId":"act4_02","name":"Syndikátní vymahač — Ocel","boss":false},{"nodeId":"act4_battle_vymahac_3","enemyId":"act4_03","name":"Syndikátní vymahač — Druhý","boss":false},{"nodeId":"act4_boss","enemyId":"act4_veritel","name":"Syndikátní věřitel","boss":true}]},{"num":5,"actId":"5","battles":[{"nodeId":"act5_battle_eli","enemyId":"act5_eli","name":"Eli","boss":false}]},{"num":6,"actId":"6","battles":[{"nodeId":"act6_battle_agent","enemyId":"act6_01","name":"Systémový agent — Ticho","boss":false}]},{"num":7,"actId":"7","battles":[{"nodeId":"act7_battle_rekalibrator","enemyId":"act7_01","name":"Rekalibrační agent","boss":false},{"nodeId":"act7_boss","enemyId":"act7_boss","name":"Správce přepisu","boss":true}]},{"num":8,"actId":"8","battles":[{"nodeId":"act8_battle_veritel","enemyId":"act8_veritel","name":"Syndikátní věřitel","boss":false}]},{"num":9,"actId":"9","battles":[{"nodeId":"act9_battle_pozorovatel","enemyId":"act9_pozorovatel","name":"Pozorovatel přechodu","boss":false}]},{"num":10,"actId":"10","battles":[{"nodeId":"act10_a_boss","enemyId":"act10_sigma","name":"Sigma","boss":true},{"nodeId":"act10_b_boss","enemyId":"act10_pramati","name":"Pramáti","boss":true},{"nodeId":"act10_c_boss","enemyId":"act10_paradox","name":"Paradox pozorovatele","boss":true},{"nodeId":"act10_d_battle","enemyId":"act10_protokol_core","name":"Přepisovací jádro","boss":false}]}];
    const ACT_LABELS = ['','Začátek','Za hranicí','Nexus','Syndikát','Eli','Agent','Rekalibrátор','Věřitel','Pozorovatel','Finále'];
    const ACT_DECKS  = [null,'starter','starter','mid','mid','mid','mid','late','late','late','late'];

    const DECKS = {
      starter: [1,2,3,4,5,6,7,8,9,10,21,22,23,24,25,41,42,43,51,52,53,81,82,83,61,71],
      mid:     [1,2,3,4,5,6,7,8,9,10,21,22,23,24,25,41,42,43,51,52,53,81,82,83,61,71,11,12,26,27,44],
      late:    [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,21,22,23,24,25,26,27,28,41,42,43,44,45,51,52,53],
      max:     [525,523,524,624,623,621,379,377,378,333,332,331,525,523,379,333,332,624,523,379,331,624,525,377,332,51,52,53,80,201],
    };

    let devDeckMode = 'normal';

    // Renderuj akty s rozbalovacími bitvami
    const actsHtml = BATTLE_MAP.map(act => {
      const deckKey = ACT_DECKS[act.num] || 'starter';
      const battlesHtml = act.battles.map(b => `
        <button class="dev-battle-btn" data-node="${b.nodeId}" data-deck="${deckKey}" style="display:flex;align-items:center;gap:8px;width:100%;padding:5px 8px 5px 20px;background:#060a0f;border:none;border-left:2px solid ${b.boss?'#b570e0':'#1a2535'};color:${b.boss?'#b570e0':'#607080'};font-family:monospace;font-size:10px;cursor:pointer;text-align:left;">
          <span style="font-size:14px">${b.boss?'★':'·'}</span>
          <span>${b.name}</span>
        </button>`).join('');
      return `
        <div class="dev-act-group">
          <button class="dev-act-header" data-act="${act.num}" style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:7px 10px;background:#0a0f18;border:1px solid #1a2535;color:#c8d6e5;font-family:monospace;font-size:10px;cursor:pointer;margin-bottom:2px;">
            <span><span style="color:#b570e0">Akt ${act.num}</span> — ${ACT_LABELS[act.num]}</span>
            <span style="color:#3d4a5c">▶ intro</span>
          </button>
          <div class="dev-battles" id="dev-battles-${act.num}" style="display:none;flex-direction:column;gap:2px;margin-bottom:4px;">
            <button class="dev-battle-btn" data-node="act${act.num}_intro" data-deck="${deckKey}" style="display:flex;align-items:center;gap:8px;width:100%;padding:5px 8px 5px 20px;background:#060a0f;border:none;border-left:2px solid #4fa3e0;color:#4fa3e0;font-family:monospace;font-size:10px;cursor:pointer;text-align:left;">
              <span style="font-size:14px">▶</span><span>Začátek aktu (intro)</span>
            </button>
            ${battlesHtml}
          </div>
        </div>`;
    }).join('');

    const ov = this._overlay(`
      <div class="m-dialog-title" style="color:#b570e0">◈ DEV — PŘESKOČIT NA BITVU</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
        <span style="font-family:monospace;font-size:10px;color:#607080">Deck:</span>
        <button class="m-slot-row" id="dev-deck-toggle" style="padding:4px 10px;font-size:10px;border-color:#b570e0;color:#b570e0">NORMAL</button>
      </div>
      <div style="max-height:55vh;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">${actsHtml}</div>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <input id="dev-node-input" class="dev-input" placeholder="přímý nodeId..." style="flex:1" />
        <button class="m-slot-row" id="dev-node-go" style="flex-shrink:0;padding:6px 12px">▶</button>
      </div>
      <button class="m-cancel-btn" id="ov-cancel">✕  ZAVŘÍT</button>
    `);

    // Toggle NORMAL/MAX
    ov.querySelector('#dev-deck-toggle')?.addEventListener('click', e => {
      devDeckMode = devDeckMode === 'normal' ? 'max' : 'normal';
      e.target.textContent = devDeckMode === 'max' ? '⚡ MAX' : 'NORMAL';
      e.target.style.borderColor = devDeckMode === 'max' ? '#e8723a' : '#b570e0';
      e.target.style.color       = devDeckMode === 'max' ? '#e8723a' : '#b570e0';
    });

    // Rozbalení aktu
    ov.querySelectorAll('.dev-act-header').forEach(btn => {
      btn.addEventListener('click', () => {
        const actNum  = btn.dataset.act;
        const battles = ov.querySelector('#dev-battles-' + actNum);
        const isOpen  = battles.style.display !== 'none';
        // Zavři všechny
        ov.querySelectorAll('.dev-battles').forEach(b => b.style.display = 'none');
        if(!isOpen) battles.style.display = 'flex';
      });
    });

    // Klik na bitvu
    ov.querySelectorAll('.dev-battle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nodeId  = btn.dataset.node;
        const deckKey = devDeckMode === 'max' ? 'max' : btn.dataset.deck;
        ov.remove();
        GameState.reset();
        const deck = DECKS[deckKey] || DECKS.starter;
        GameState.player.deck = [...deck];
        GameState.player.collection = [...deck, ...new Set(deck)];
        const actNum = parseInt(nodeId.match(/act(\d+)/)?.[1] || '1');
        GameState.campaign.chapter   = actNum;
        GameState.campaign.actNumber = actNum;
        this._clickGo(() => Router.goto('story', { nodeId }));
      });
    });

    ov.querySelector('#dev-node-go')?.addEventListener('click', () => {
      const nodeId = ov.querySelector('#dev-node-input')?.value?.trim();
      if(!nodeId) return;
      ov.remove();
      GameState.reset();
      const deck = devDeckMode === 'max' ? DECKS.max : DECKS.starter;
      GameState.player.deck = [...deck];
      GameState.player.collection = [...deck, ...new Set(deck)];
      this._clickGo(() => Router.goto('story', { nodeId }));
    });
  },

  // ── STYLY ─────────────────────────────────────────────────────────
  _injectStyles() {
    if(document.getElementById('menu-styles')) return;

    // Načti fonty
    if(!document.getElementById('conflux-fonts')) {
      const l = document.createElement('link');
      l.id   = 'conflux-fonts';
      l.rel  = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Share+Tech+Mono&display=swap';
      document.head.appendChild(l);
    }

    const style = document.createElement('style');
    style.id = 'menu-styles';
    style.textContent = `

/* ── CSS vars ── */
:root {
  --px:   'Press Start 2P', monospace;
  --body: 'VT323', monospace;
  --mono: 'Share Tech Mono', monospace;
  --bg:   #06080a;
  --bg2:  #0b0f16;
  --text: #c8d6e5;
  --dim:  #607080;
  --muted:#1a2230;
  --gold: #c8a040;
  --synth:#4fa3e0;
  --org:  #e04f6a;
  --hyb:  #50e0b8;
  --corr: #b570e0;
}

/* ── WRAP ── */
.m-wrap {
  position: relative; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg); overflow: visible;
  image-rendering: pixelated;
}

/* ── SCANLINES ── */
.m-scanlines {
  position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 3px,
    rgba(0,0,0,0.18) 3px,
    rgba(0,0,0,0.18) 4px
  );
}

/* ── NOISE ── */
.m-noise {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; opacity: 1; z-index: 0;
}

/* ── GEO ── */
.m-geo {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 1;
  animation: m-geo-breathe 10s ease-in-out infinite;
}
@keyframes m-geo-breathe {
  0%,100% { transform:scale(1);     opacity:1; }
  50%     { transform:scale(1.012); opacity:0.7; }
}

/* ── CONTENT ── */
.m-content {
  position: relative; z-index: 10;
  display: flex; flex-direction: column;
  align-items: center;
  gap: 0;
  text-align: center;
}
/* Scrim za obsahem — čitelnost textu na malovaném pozadí (po redesignu) */
.m-content::before {
  content: '';
  position: absolute; z-index: -1;
  left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(700px, 94vw); height: min(700px, 92vh);
  background: radial-gradient(ellipse at center,
    rgba(4,7,11,0.74) 0%, rgba(4,7,11,0.48) 45%, rgba(4,7,11,0) 75%);
  pointer-events: none;
}
/* Emblém CONFLUXu — jemný designový watermark za obsahem menu */
.m-content::after {
  content: '';
  position: absolute; z-index: -2;
  left: 50%; top: 47%; transform: translate(-50%, -50%);
  width: min(460px, 74vw); height: min(460px, 74vw);
  background: url('assets/images/emblem.png') center/contain no-repeat;
  opacity: 0.12;
  pointer-events: none;
}

/* ── TITLE ── */
.m-title-wrap {
  margin-bottom: 48px;
  text-align: center;
}

.m-title {
  font-family: 'Press Start 2P', monospace;
  font-size: clamp(20px, 4vw, 38px);
  color: var(--text);
  letter-spacing: 6px;
  line-height: 1;
  cursor: default;
  user-select: none;
  text-shadow:
    3px 3px 0 rgba(79,163,224,0.15),
    -1px -1px 0 rgba(0,0,0,0.8),
    0 2px 14px rgba(0,0,0,0.9);
}

/* Pixel shift glitch — žádný blur, jen posun */
.m-title-shift {
  transform: translateX(-3px);
  color: #4fa3e0;
  text-shadow:
    3px 0 0 #e04f6a,
    -3px 0 0 #50e0b8;
}

.m-glitch-char {
  display: inline-block;
  transform: translateY(-1px);
}

/* ── TAGLINE ── */
.m-tagline {
  font-family: 'VT323', monospace;
  font-size: clamp(16px, 2vw, 22px);
  color: #9fb0c2;
  letter-spacing: 2px;
  margin-top: 12px;
  text-shadow: 0 1px 8px rgba(0,0,0,0.95);
  animation: m-tag-pulse 5s ease-in-out infinite;
}
@keyframes m-tag-pulse {
  0%,100% { opacity: 0.45; }
  50%     { opacity: 0.8;  }
}

/* ── NAV ── */
.m-nav {
  display: flex; flex-direction: column;
  align-items: center; gap: 0;
  min-width: 260px;
}
.m-nav-sep {
  height: 14px;
  width: 1px;
  border-left: 1px solid var(--muted);
  margin: 4px 0;
}

/* ── BUTTON ── */
.m-btn {
  background: transparent; border: none;
  font-family: 'VT323', monospace;
  font-size: clamp(18px, 2.2vw, 22px);
  color: #cdd8e6;
  cursor: pointer;
  padding: 5px 0;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  transition: color 0.08s, transform 0.08s;
  letter-spacing: 2px;
  width: 100%;
  text-shadow: 0 1px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9);
}
.m-btn:active  { transform: translateX(6px) !important; }
.m-btn-cur     { font-size: 14px; opacity: 0.6; transition: opacity 0.08s; }
.m-btn:hover .m-btn-cur { opacity: 1; }
.m-btn-dim     { font-size: clamp(15px, 1.8vw, 18px); color: #93a2b3; }
.m-btn-dev     { font-size: clamp(15px, 1.8vw, 18px); color: #c98bec; opacity: 0.85; }
.dev-input     { background:#0a0f18; border:1px solid #b570e040; color:#c8d6e5; font-family:monospace; font-size:11px; padding:6px 10px; flex:1; outline:none; }
.dev-input:focus { border-color:#b570e0; }
.m-btn-label   { }

/* ── LOGO INTRO ── */
.m-bg {
  position:absolute;inset:0;
  background-image:url('assets/images/backgrounds/menu_bg.jpg');
  background-size:cover;background-position:center;
  opacity:0;z-index:0;
}
.m-logo-wrap {
  position:absolute;
  top:50%;left:50%;
  transform:translate(-50%,-50%) scale(0.25);
  width:88vw;height:59vw;
  z-index:0;
  display:flex;align-items:center;justify-content:center;
  pointer-events:none;
  transition:opacity 2s ease;
}
.logo-settled {
  transform:translate(-50%,-50%) scale(1) !important;
}
.m-logo-img {
  width:100%;height:100%;
  object-fit:contain;
  display:block;
  position:relative;z-index:2;
  transform-origin:50% 50%;
  filter:drop-shadow(0 0 40px rgba(79,163,224,0.5)) drop-shadow(0 0 80px rgba(224,100,50,0.3));
  will-change:transform;
}

/* Jemná pulzace loga — glow efekt */
.logo-pulsing .m-logo-img {
  animation: logo-pulse-glow 2.5s ease-in-out infinite;
}
@keyframes logo-pulse-glow {
  0%,100% { filter: drop-shadow(0 0 30px rgba(79,163,224,0.3)) drop-shadow(0 0 60px rgba(224,100,50,0.15)); }
  50%      { filter: drop-shadow(0 0 60px rgba(79,163,224,0.7)) drop-shadow(0 0 100px rgba(224,100,50,0.4)); }
}
/* Po usazení — pomalejší idle pulzace */
.logo-settled .m-logo-img {
  animation: logo-idle-glow 4s ease-in-out infinite;
}
@keyframes logo-idle-glow {
  0%,100% { filter: drop-shadow(0 0 20px rgba(79,163,224,0.2)) drop-shadow(0 0 40px rgba(224,100,50,0.1)); }
  50%      { filter: drop-shadow(0 0 40px rgba(79,163,224,0.5)) drop-shadow(0 0 70px rgba(224,100,50,0.25)); }
}

.m-content { position:relative;z-index:3; }
.m-status-bar {
  font-family:'Share Tech Mono',monospace;font-size:9px;color:#2a3545;
  letter-spacing:2px;margin-top:16px;text-align:center;
}

/* ── VERSION ── */
.m-version {
  font-family: 'Press Start 2P', monospace;
  font-size: 7px;
  color: #2a3545;
  letter-spacing: 3px;
  margin-top: 48px;
  text-align: center;
}

/* ── ALIGN BAR ── */
.m-align-bar {
  position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--ac, #3d4a5c), transparent);
  opacity: 0.35;
  animation: m-align-scan 8s ease-in-out infinite;
}
@keyframes m-align-scan {
  0%,100% { opacity: 0.15; }
  50%     { opacity: 0.45; }
}

/* ── OVERLAY ── */
.m-overlay {
  position: absolute; inset: 0;
  background: rgba(6,8,10,0.96);
  display: flex; align-items: center; justify-content: center;
  z-index: 50;
  opacity: 0; transition: opacity 0.12s;
}
.m-overlay--visible { opacity: 1; }

/* Dialog box — pixel rámec */
.m-dialog {
  display: flex; flex-direction: column;
  min-width: 320px; max-width: 480px;
  border: 2px solid #1a2230;
  /* Pixel box-shadow místo blur */
  box-shadow: 4px 4px 0 #000, 6px 6px 0 #0f1520;
  background: #06080a;
  padding: 28px 32px;
  animation: m-dialog-in 0.12s ease;
}
@keyframes m-dialog-in {
  from { transform: translateY(6px); opacity:0; }
  to   { transform: translateY(0);   opacity:1; }
}

.m-dialog-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 9px; color: var(--text);
  letter-spacing: 4px;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid #1a2230;
}

/* ── SETTINGS ROWS ── */
.m-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #0f1218;
}
.m-row-label {
  font-family: 'Press Start 2P', monospace;
  font-size: 7px; color: var(--dim); letter-spacing: 2px;
}
.m-row--danger .m-row-label { color: #2a3040; }

.m-tog {
  background: transparent;
  border: 1px solid #1a2230;
  font-family: 'VT323', monospace;
  font-size: 18px; color: #3d4a5c;
  padding: 4px 14px; cursor: pointer;
  letter-spacing: 1px; min-width: 60px; text-align: center;
  transition: color 0.08s, border-color 0.08s;
}
.m-tog:hover:not([disabled]) { border-color: #3d4a5c; color: var(--text); }
.m-tog--on  { border-color: #4fa3e0; color: #4fa3e0; }
.m-tog--danger { border-color: #3d1520; color: #e04f6a; }
.m-row-hint {
  font-family: 'VT323', monospace; font-size: 13px; color: #2a3546;
  letter-spacing: 1.5px; padding: 0 0 4px 0; text-align: right;
}

/* ── SETTINGS — SLIDER ── */
.m-row--col {
  flex-direction: column; align-items: flex-start; gap: 10px;
}
.m-slider-wrap {
  display: flex; align-items: center; gap: 10px; width: 100%;
}
.m-slider {
  -webkit-appearance: none; appearance: none;
  flex: 1; height: 3px;
  background: #1a2230;
  outline: none; cursor: pointer;
}
.m-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px;
  background: #4fa3e0;
  border: none; cursor: pointer;
}
.m-slider::-moz-range-thumb {
  width: 12px; height: 12px;
  background: #4fa3e0;
  border: none; cursor: pointer;
}
.m-slider-val {
  font-family: 'VT323', monospace; font-size: 18px; color: #4fa3e0;
  min-width: 38px; text-align: right; letter-spacing: 1px;
}

/* ── SETTINGS — BTN GROUP ── */
.m-btn-group {
  display: flex; gap: 4px; flex-wrap: wrap;
}
.m-btn-group .m-tog {
  font-size: 15px; padding: 4px 10px; min-width: 0;
}

/* ── SLOT LIST ── */
.m-slot-list { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }

.m-slot-row {
  background: transparent; border: none;
  border-left: 2px solid #1a2230;
  font-family: 'VT323', monospace;
  font-size: 19px; color: var(--dim);
  cursor: pointer;
  padding: 10px 12px;
  display: flex; align-items: center; gap: 14px;
  width: 100%;
  transition: color 0.08s, transform 0.08s, border-color 0.08s;
  text-align: left;
}
.m-slot-row:hover:not(.m-slot-row--disabled) {
  color: var(--text);
  border-left-color: #4fa3e0;
  transform: translateX(4px);
}
.m-slot-row--disabled { opacity: 0.2; cursor: default; }

.m-slot-num  { font-family: 'Press Start 2P', monospace; font-size: 7px; color: #3d4a5c; flex-shrink:0; }
.m-slot-info { display:flex; flex-direction:column; gap:3px; flex:1; }
.m-slot-name { color: var(--text); font-size: 20px; }
.m-slot-meta { display:flex; gap:10px; font-size:17px; color:#3d4a5c; }
.m-slot-overwrite { font-family:'Press Start 2P',monospace; font-size:7px; color:#3d4a5c; flex-shrink:0; }

/* ── NOTE ── */
.m-note {
  font-family: 'VT323', monospace;
  font-size: 17px; color: #3d4a5c; padding: 6px 0 12px;
  letter-spacing: 1px;
}

/* ── CANCEL BTN ── */
.m-cancel-btn {
  background: transparent; border: none;
  font-family: 'Press Start 2P', monospace;
  font-size: 7px; color: #3d4a5c;
  cursor: pointer; margin-top: 20px;
  padding: 4px 0; letter-spacing: 2px;
  transition: color 0.08s;
}
.m-cancel-btn:hover { color: #8090a0; }

/* ── FADE IN ── */
@keyframes m-fade-in {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:none; }
}
/* m-content animaci řídí JS intro sekvence */

    `;
    document.head.appendChild(style);
  },

  // ── CLEANUP ───────────────────────────────────────────────────────
  destroy() {
    // Timery a animace
    if(this._glitchTimer)  clearTimeout(this._glitchTimer);
    if(this._noiseRaf)     cancelAnimationFrame(this._noiseRaf);
    if(this._logoPulseRaf) cancelAnimationFrame(this._logoPulseRaf);
    if(this._idleRaf)      cancelAnimationFrame(this._idleRaf);
    this._introTimers?.forEach(t => clearTimeout(t));
    this._introTimers = [];

    // Odstraň skip listenery
    if(this._skipIntroHandler) {
      document.removeEventListener('click',   this._skipIntroHandler);
      document.removeEventListener('keydown', this._skipIntroHandler);
      this._skipIntroHandler = null;
    }

    // Fade out menu hudby
    if(this._menuAudio) {
      const audio = this._menuAudio;
      this._menuAudio = null;
      this._audioAnalyser = null;
      const fadeOut = setInterval(() => {
        if(audio.volume > 0.05) {
          audio.volume = Math.max(0, audio.volume - 0.05);
        } else {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          audio.remove?.();
          clearInterval(fadeOut);
        }
      }, 50); // ~650ms fade out
    }
    if(this._audioCtx) {
      try { this._audioCtx.close(); } catch(e) {}
      this._audioCtx = null;
    }
    this._audioAnalyser = null;

    // Odstraň gesture listenery pro audio
    if(this._onGesture) {
      document.removeEventListener('click',      this._onGesture);
      document.removeEventListener('keydown',    this._onGesture);
      document.removeEventListener('touchstart', this._onGesture);
      this._onGesture = null;
    }

    this._listeners.forEach(({el, fn}) => el.removeEventListener('click', fn));
    this._listeners = [];
    this._container = null;
  },
};

export default MainMenu;
