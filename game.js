/* ============================================================================
 * KARHUTLA RESCUE — 8-Bit Retro Slingshot Forest Conservation Game
 * Pure HTML5 Canvas, CSS3 & Vanilla ES6+ JavaScript (Zero External Assets)
 * ============================================================================ */

(() => {
  'use strict';

  // ==========================================================================
  // 1. CONSTANTS, VIEWPORT & COLOR PALETTE
  // ==========================================================================
  const SAFE_W = 480;
  const SAFE_H = 270;

  const GRAVITY = 390;          // px/s^2
  const MAX_PULL = 54;          // max slingshot pullback distance (logical px)
  const MAX_LAUNCH_SPEED = 425; // max water balloon launch speed (px/s)
  const SPLASH_RADIUS = 54;     // extinguish blast radius (logical px)
  const BALLOON_RADIUS = 7;

  const SLING_ANCHOR = { x: 151, y: 156 };
  const SLING_REST = { x: 130, y: 175 }; // Loaded pouch resting right by Rhino's horn
  const LEFT_LEDGE_X = 176;
  const LEFT_LEDGE_Y = 222;

  const PALETTE = {
    outline: '#0c090c',
    skyBands: [
      '#240606',
      '#3f0c08',
      '#61150c',
      '#89220f',
      '#b23613',
      '#d45518',
      '#ea7a22',
    ],
    peaceSky: [
      '#1e62a8',
      '#2e80c8',
      '#4aa3e0',
      '#78c4f0',
      '#a8def8',
      '#d4f0c8',
    ],
    grassLight: '#68df39',
    grassMid: '#3eb224',
    grassDark: '#207a17',
    grassDeep: '#114710',
    dirtLight: '#854b23',
    dirtMid: '#633517',
    dirtDark: '#42200d',
    dirtDeep: '#281106',
    rockHighlight: '#b0a89f',
    rockMid: '#807870',
    rockDark: '#544d47',
    rockDeep: '#332e2a',
    rhinoHL: '#c2c7cf',
    rhinoMidL: '#9ca1ab',
    rhinoBase: '#7a808a',
    rhinoDark: '#595e68',
    rhinoDeep: '#3d4149',
    hornLight: '#f7f3e4',
    hornShadow: '#cfc6b0',
    woodLight: '#b37138',
    woodMid: '#8a5022',
    woodDark: '#5c3111',
    woodDeep: '#381c08',
    ropeLight: '#dcc489',
    ropeDark: '#99824f',
    waterHL: '#ffffff',
    waterCyan: '#8be8ff',
    waterLight: '#45b6ff',
    waterMid: '#1c7ef2',
    waterDark: '#124ca6',
    fireWhite: '#fff9c4',
    fireYellow: '#ffd724',
    fireOrange: '#ff6e08',
    fireRed: '#d9220d',
    fireDeep: '#8c1008',
  };

  // ==========================================================================
  // 2. CANVAS & ADAPTIVE FULL-SCREEN SAFE-AREA SCALING
  // ==========================================================================
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  const view = {
    vw: window.innerWidth,
    vh: window.innerHeight,
    scale: 1,
    canvasW: SAFE_W,
    canvasH: SAFE_H,
    offsetX: 0,
    offsetY: 0,
    hudTop: 0,
  };

  function resizeViewport() {
    view.vw = Math.max(1, window.innerWidth);
    view.vh = Math.max(1, window.innerHeight);
    view.scale = Math.min(view.vw / SAFE_W, view.vh / SAFE_H);
    view.canvasW = Math.ceil(view.vw / view.scale);
    view.canvasH = Math.ceil(view.vh / view.scale);

    // Center horizontally; anchor playfield to bottom so taller screens extend sky cleanly upward
    view.offsetX = Math.floor((view.canvasW - SAFE_W) / 2);
    view.offsetY = Math.floor(view.canvasH - SAFE_H);
    view.hudTop = -view.offsetY; // keep HUD tucked cleanly near top of viewport

    if (canvas.width !== view.canvasW || canvas.height !== view.canvasH) {
      canvas.width = view.canvasW;
      canvas.height = view.canvasH;
    }
    ctx.imageSmoothingEnabled = false;
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cx = ((clientX - rect.left) / rect.width) * view.canvasW;
    const cy = ((clientY - rect.top) / rect.height) * view.canvasH;
    return {
      x: cx - view.offsetX,
      y: cy - view.offsetY,
    };
  }

  window.addEventListener('resize', resizeViewport);
  resizeViewport();

  // ==========================================================================
  // 3. 8-BIT CHIPTUNE AUDIO SYNTHESIZER & AMBIENT ENGINE (WEB AUDIO API)
  // ==========================================================================
  const SoundFX = (() => {
    let audioCtx = null;
    let masterGain = null;
    let ambientBedGain = null;
    let ambientBedStarted = false;
    let noiseBuffer = null;
    let muted = false;
    let lastStretchTick = 0;
    let crackleTimer = 0.25;
    let wildlifeTimer = 2.6;

    function ensureContext() {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        audioCtx = new AudioCtx();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = muted ? 0 : 1;
        masterGain.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended' && !muted) {
        audioCtx.resume().catch(() => {});
      }
      if (!noiseBuffer && audioCtx) {
        const sr = audioCtx.sampleRate;
        const len = Math.floor(sr * 1.5);
        noiseBuffer = audioCtx.createBuffer(1, len, sr);
        const data = noiseBuffer.getChannelData(0);
        // Quantized 8-bit LFSR-style stepped noise
        let hold = 0;
        for (let i = 0; i < len; i++) {
          if (i % 4 === 0) hold = Math.random() * 2 - 1;
          data[i] = hold;
        }
      }
      if (audioCtx && noiseBuffer && !ambientBedStarted) {
        startAmbientBed();
      }
      return muted ? null : audioCtx;
    }

    // Subtle continuous low-level 8-bit campfire/wildfire bed routed through masterGain
    function startAmbientBed() {
      if (!audioCtx || !noiseBuffer || ambientBedStarted) return;
      ambientBedStarted = true;
      const src = audioCtx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;

      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 340;

      ambientBedGain = audioCtx.createGain();
      ambientBedGain.gain.value = 0.0;

      src.connect(lowpass);
      lowpass.connect(ambientBedGain);
      ambientBedGain.connect(masterGain);
      src.start();
    }

    function playTone(type, freqStart, freqEnd, duration, gainVal, delay = 0) {
      const ac = ensureContext();
      if (!ac || !masterGain) return;
      const now = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freqStart), now);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainVal, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    function playNoise(duration, filterType, freqStart, freqEnd, gainVal, delay = 0, qVal = 1.0) {
      const ac = ensureContext();
      if (!ac || !noiseBuffer || !masterGain) return;
      const now = ac.currentTime + delay;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ac.createBiquadFilter();
      filter.type = filterType;
      filter.Q.value = qVal;
      filter.frequency.setValueAtTime(freqStart, now);
      if (freqEnd !== freqStart) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(60, freqEnd), now + duration);
      }
      const gain = ac.createGain();
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      src.start(now, Math.random() * 0.4);
      src.stop(now + duration + 0.02);
    }

    // Subtle twig-snap / wood-crackle micro-bursts for fire ambience
    function playFireCracklePop() {
      const ac = audioCtx;
      if (!ac || muted || ac.state !== 'running') return;
      const freq = 1600 + Math.random() * 2600;
      const dur = 0.014 + Math.random() * 0.026;
      const vol = 0.024 + Math.random() * 0.036;
      playNoise(dur, 'bandpass', freq, freq * 0.65, vol, 0, 2.5);
      // Occasional deeper snapping twig pop
      if (Math.random() < 0.35) {
        playTone('triangle', 520 + Math.random() * 420, 140, 0.024, 0.026, 0.006);
      }
    }

    // Occasional distant 8-bit forest animal chirps & jungle bird calls
    function playDistantAnimalCall() {
      const ac = audioCtx;
      if (!ac || muted || ac.state !== 'running') return;
      const kind = Math.floor(Math.random() * 3);
      if (kind === 0) {
        // Distant tropical songbird two-note chirp
        const base = 1280 + Math.random() * 320;
        playTone('triangle', base, base * 1.32, 0.075, 0.028, 0);
        playTone('triangle', base * 1.12, base * 1.44, 0.085, 0.024, 0.11);
      } else if (kind === 1) {
        // Soft distant jungle cricket / cicada 8-bit trill
        const base = 2250 + Math.random() * 450;
        for (let i = 0; i < 4; i++) {
          playTone('square', base, base * 0.96, 0.022, 0.012, i * 0.045);
        }
      } else {
        // Distant forest gibbon / bird glide call
        playTone('sine', 740, 560, 0.14, 0.026, 0);
        playTone('sine', 560, 820, 0.12, 0.022, 0.15);
      }
    }

    return {
      isMuted: () => muted,
      toggleMute() {
        muted = !muted;
        if (masterGain && audioCtx) {
          const now = audioCtx.currentTime;
          masterGain.gain.cancelScheduledValues(now);
          masterGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.015);
        }
        if (!muted) {
          ensureContext();
          this.playClick();
        }
        return muted;
      },
      unlock() {
        ensureContext();
      },
      /**
       * Updates continuous 8-bit burning-wood crackle & distant forest wildlife ambience.
       */
      updateAmbient(dt, isBurning, isPaused) {
        if (!audioCtx || audioCtx.state !== 'running') return;
        const now = audioCtx.currentTime;
        const targetBed = muted || isPaused ? 0 : (isBurning ? 0.032 : 0.008);
        if (ambientBedGain) {
          ambientBedGain.gain.setTargetAtTime(targetBed, now, 0.08);
        }
        if (muted || isPaused) return;

        // Random burning twigs / wood crackling pops
        if (isBurning) {
          crackleTimer -= dt;
          if (crackleTimer <= 0) {
            playFireCracklePop();
            crackleTimer = 0.09 + Math.random() * 0.32;
          }
        }

        // Occasional distant forest bird/animal chirps
        wildlifeTimer -= dt;
        if (wildlifeTimer <= 0) {
          playDistantAnimalCall();
          wildlifeTimer = 3.2 + Math.random() * 4.4;
        }
      },
      playClick() {
        playTone('square', 660, 880, 0.06, 0.11);
      },
      playStretch(ratio) {
        const now = performance.now();
        if (now - lastStretchTick < 75) return;
        lastStretchTick = now;
        const base = 140 + ratio * 180;
        playTone('triangle', base, base * 1.12, 0.045, 0.08);
      },
      playLaunch() {
        playTone('square', 220, 640, 0.13, 0.12, 0);
        playTone('triangle', 600, 190, 0.18, 0.12, 0.09);
      },
      playSplash() {
        // Water burst noise + bubbly 8-bit droplets
        playNoise(0.24, 'bandpass', 1800, 480, 0.22, 0);
        playTone('triangle', 520, 260, 0.07, 0.11, 0.02);
        playTone('triangle', 740, 420, 0.06, 0.09, 0.06);
        playTone('sine', 960, 520, 0.05, 0.07, 0.11);
      },
      playExtinguish() {
        // Fire sizzle steam hiss + bright conservation chime
        playNoise(0.32, 'highpass', 2400, 1100, 0.16, 0);
        playTone('square', 523.25, 523.25, 0.08, 0.09, 0.03);
        playTone('square', 659.25, 659.25, 0.08, 0.09, 0.10);
      },
      /**
       * Monkey cheering SFX: rapid high-pitched 8-bit chiptune chatter/chirps.
       */
      playMonkeyCheer() {
        playTone('square', 880, 1280, 0.055, 0.085, 0.03);
        playTone('triangle', 980, 1440, 0.055, 0.09, 0.10);
        playTone('square', 1120, 1620, 0.065, 0.085, 0.17);
        playTone('triangle', 1260, 1780, 0.085, 0.09, 0.25);
      },
      /**
       * Tiger cheering SFX: energetic low-pitched retro growl/roar chime.
       */
      playTigerCheer() {
        // Gritty low-pitched retro growl sweep + breath rumble
        playTone('sawtooth', 148, 218, 0.12, 0.09, 0.05);
        playTone('sawtooth', 218, 118, 0.16, 0.085, 0.16);
        playTone('square', 96, 142, 0.14, 0.075, 0.05);
        playNoise(0.22, 'bandpass', 460, 220, 0.11, 0.06, 1.8);
        // Energetic triumphant chime tail
        playTone('square', 392.0, 523.25, 0.11, 0.075, 0.27);
      },
      playCheer() {
        this.playMonkeyCheer();
        this.playTigerCheer();
      },
      playMiss() {
        playTone('triangle', 310, 260, 0.14, 0.12, 0.08);
        playTone('triangle', 250, 175, 0.22, 0.12, 0.22);
      },
      playWoodHit() {
        playNoise(0.11, 'lowpass', 720, 180, 0.22, 0);
        playTone('square', 160, 75, 0.09, 0.14, 0);
      },
      playRockHit() {
        playNoise(0.08, 'bandpass', 500, 200, 0.18, 0);
        playTone('triangle', 120, 60, 0.08, 0.15, 0);
      },
      playIgnite() {
        playNoise(0.28, 'bandpass', 900, 2400, 0.16, 0);
        playTone('sawtooth', 140, 280, 0.18, 0.08, 0);
      },
      playHeroStep() {
        playTone('square', 196, 196, 0.07, 0.09, 0);
        playTone('square', 261.6, 261.6, 0.07, 0.09, 0.09);
        playTone('square', 329.6, 329.6, 0.14, 0.11, 0.18);
      },
      playVictoryFanfare() {
        const notes = [
          [523.25, 0.10, 0.00],
          [659.25, 0.10, 0.11],
          [783.99, 0.10, 0.22],
          [1046.5, 0.20, 0.33],
          [783.99, 0.10, 0.56],
          [1046.5, 0.36, 0.68],
        ];
        for (const [freq, dur, delay] of notes) {
          playTone('square', freq, freq, dur, 0.11, delay);
          playTone('triangle', freq * 0.5, freq * 0.5, dur, 0.10, delay);
        }
      },
      playGameOver() {
        const notes = [
          [392.0, 0.16, 0.00],
          [349.2, 0.16, 0.18],
          [329.6, 0.16, 0.36],
          [261.6, 0.42, 0.54],
        ];
        for (const [freq, dur, delay] of notes) {
          playTone('square', freq, freq * 0.96, dur, 0.10, delay);
          playTone('triangle', freq * 0.5, freq * 0.48, dur, 0.09, delay);
        }
      },
    };
  })();

  // ==========================================================================
  // 4. CRISP 8-BIT BITMAP PIXEL FONT & DOUBLE-LAYERED LOGO RENDERER
  // ==========================================================================
  const FONT_5X7 = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
    ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
    '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
    '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
    '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
    '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
    '<': ['00001', '00010', '00100', '01000', '00100', '00010', '00001'],
    '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
    '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  };

  function measurePixelText(text, scale = 1, bold = false) {
    const stride = (bold ? 7 : 6) * scale;
    return Math.max(0, text.length * stride - scale);
  }

  function drawPixelText(targetCtx, text, x, y, scale = 1, fill = '#ffffff', outline = '#0c090c', align = 'left', bold = false) {
    const str = String(text).toUpperCase();
    const stride = (bold ? 7 : 6) * scale;
    const totalW = measurePixelText(str, scale, bold);
    let startX = Math.round(x);
    if (align === 'center') startX = Math.round(x - totalW / 2);
    else if (align === 'right') startX = Math.round(x - totalW);
    const startY = Math.round(y);

    const drawGlyphs = (ox, oy, colorOrArr) => {
      for (let i = 0; i < str.length; i++) {
        const glyph = FONT_5X7[str[i]] || FONT_5X7[' '];
        const gx = startX + i * stride + ox;
        for (let row = 0; row < 7; row++) {
          const rowStr = glyph[row];
          const fillStyle = Array.isArray(colorOrArr)
            ? colorOrArr[Math.min(row, colorOrArr.length - 1)]
            : colorOrArr;
          targetCtx.fillStyle = fillStyle;
          for (let col = 0; col < 5; col++) {
            if (rowStr[col] === '1') {
              targetCtx.fillRect(gx + col * scale, startY + row * scale + oy, scale, scale);
              if (bold) {
                targetCtx.fillRect(gx + (col + 1) * scale, startY + row * scale + oy, scale, scale);
              }
            }
          }
        }
      }
    };

    if (outline) {
      const o = Math.max(1, Math.round(scale * 0.75));
      drawGlyphs(-o, 0, outline);
      drawGlyphs(o, 0, outline);
      drawGlyphs(0, -o, outline);
      drawGlyphs(0, o, outline);
      drawGlyphs(-o, -o, outline);
      drawGlyphs(o, -o, outline);
      drawGlyphs(-o, o, outline);
      drawGlyphs(o, o, outline);
      // Retro arcade drop shadow
      drawGlyphs(o, o + 1, outline);
    }
    drawGlyphs(0, 0, fill);
  }

  /**
   * Renders the iconic double-layered chunky pixel title logo:
   * "KARHUTLA" in fiery yellow-orange gradient over "RESCUE" in crisp white-blue.
   */
  function drawLogo(targetCtx, x, y, scale = 2, align = 'left') {
    const topColors = ['#fff259', '#ffe033', '#ffc21a', '#ff9b12', '#f5720c', '#e34e0a', '#c93408'];
    const botColors = ['#ffffff', '#ffffff', '#eef6ff', '#d8e9fa', '#b7d0e8', '#98b4d1', '#7d98b8'];
    const lineH = 7 * scale + Math.round(scale * 2.5);
    const subOffset = align === 'left' ? Math.round(scale * 7) : 0;
    drawPixelText(targetCtx, 'KARHUTLA', x, y, scale, topColors, '#0b0709', align, true);
    drawPixelText(targetCtx, 'RESCUE', x + subOffset, y + lineH, scale, botColors, '#0b0709', align, true);
  }

  // ==========================================================================
  // 5. PIXEL-PERFECT RASTERIZER & SPRITE BUILDER (ZERO ANTI-ALIASING)
  // ==========================================================================
  function createPixelSprite(w, h, drawFn, outlineColor = PALETTE.outline) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    const px = (x, y, color) => {
      g.fillStyle = color;
      g.fillRect(x | 0, y | 0, 1, 1);
    };

    const rect = (x, y, rw, rh, color) => {
      g.fillStyle = color;
      g.fillRect(x | 0, y | 0, rw | 0, rh | 0);
    };

    const ell = (cx, cy, rx, ry, color) => {
      g.fillStyle = color;
      const x0 = Math.floor(cx - rx);
      const x1 = Math.ceil(cx + rx);
      const y0 = Math.floor(cy - ry);
      const y1 = Math.ceil(cy + ry);
      for (let py = y0; py <= y1; py++) {
        for (let px0 = x0; px0 <= x1; px0++) {
          const dx = (px0 + 0.5 - cx) / rx;
          const dy = (py + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1.0) {
            g.fillRect(px0, py, 1, 1);
          }
        }
      }
    };

    const line = (x0, y0, x1, y1, color, thickness = 1) => {
      g.fillStyle = color;
      let ix0 = x0 | 0, iy0 = y0 | 0, ix1 = x1 | 0, iy1 = y1 | 0;
      const dx = Math.abs(ix1 - ix0);
      const dy = Math.abs(iy1 - iy0);
      const sx = ix0 < ix1 ? 1 : -1;
      const sy = iy0 < iy1 ? 1 : -1;
      let err = dx - dy;
      const half = Math.floor(thickness / 2);
      while (true) {
        g.fillRect(ix0 - half, iy0 - half, thickness, thickness);
        if (ix0 === ix1 && iy0 === iy1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; ix0 += sx; }
        if (e2 < dx) { err += dx; iy0 += sy; }
      }
    };

    drawFn({ px, rect, ell, line, g, w, h });

    // Apply crisp 1px 4-neighbor pixel outline around opaque pixels
    if (outlineColor) {
      const img = g.getImageData(0, 0, w, h);
      const data = img.data;
      const out = new Uint8ClampedArray(data);
      const or = parseInt(outlineColor.slice(1, 3), 16);
      const og = parseInt(outlineColor.slice(3, 5), 16);
      const ob = parseInt(outlineColor.slice(5, 7), 16);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          if (data[idx + 3] === 0) {
            const hasNeighbor =
              (x > 0 && data[idx - 4 + 3] > 0) ||
              (x < w - 1 && data[idx + 4 + 3] > 0) ||
              (y > 0 && data[idx - w * 4 + 3] > 0) ||
              (y < h - 1 && data[idx + w * 4 + 3] > 0);
            if (hasNeighbor) {
              out[idx] = or;
              out[idx + 1] = og;
              out[idx + 2] = ob;
              out[idx + 3] = 255;
            }
          }
        }
      }
      img.data.set(out);
      g.putImageData(img, 0, 0);
    }

    return c;
  }

  // Integer pixel line helper on main canvas (zero AA)
  function drawPixelLine(targetCtx, x0, y0, x1, y1, color, thickness = 1) {
    targetCtx.fillStyle = color;
    let ix0 = Math.round(x0), iy0 = Math.round(y0);
    const ix1 = Math.round(x1), iy1 = Math.round(y1);
    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;
    const half = Math.floor(thickness / 2);
    while (true) {
      targetCtx.fillRect(ix0 - half, iy0 - half, thickness, thickness);
      if (ix0 === ix1 && iy0 === iy1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; ix0 += sx; }
      if (e2 < dx) { err += dx; iy0 += sy; }
    }
  }

  // ==========================================================================
  // 6. PRE-BAKED MULTI-COLOR 8-BIT SPRITE LIBRARY
  // ==========================================================================
  const Sprites = {};

  function buildSprites() {
    // --- RHINO (3 poses: idle, pull, cheer) — 64x46, 5+ shades of grey ---
    const makeRhino = (pose) => createPixelSprite(66, 48, ({ px, rect, ell, line }) => {
      const lean = pose === 'pull' ? -2 : 0;
      const headTilt = pose === 'cheer' ? -2 : (pose === 'pull' ? -1 : 0);

      // Back legs (darker shadow)
      rect(14, 30, 8, 14, PALETTE.rhinoDeep);
      rect(15, 31, 6, 11, PALETTE.rhinoDark);
      rect(35, 30, 8, 14, PALETTE.rhinoDeep);
      rect(36, 31, 6, 11, PALETTE.rhinoDark);
      // Back toes
      rect(14, 43, 3, 2, PALETTE.hornShadow);
      rect(18, 43, 3, 2, PALETTE.hornShadow);
      rect(36, 43, 3, 2, PALETTE.hornShadow);
      rect(40, 43, 3, 2, PALETTE.hornShadow);

      // Cute short tail
      line(7, 25, 4, 32, PALETTE.rhinoDark, 2);
      px(3, 33, PALETTE.rhinoDeep);
      px(4, 34, PALETTE.rhinoDeep);

      // Main heavy torso (layered 5-shade grey)
      ell(25 + lean, 24, 18, 12, PALETTE.rhinoDark);
      ell(25 + lean, 23, 17, 11, PALETTE.rhinoBase);
      ell(24 + lean, 20, 14, 7, PALETTE.rhinoMidL);
      ell(23 + lean, 16, 10, 3, PALETTE.rhinoHL);

      // Armor-like skin folds across shoulder & hip
      line(16 + lean, 16, 15 + lean, 31, PALETTE.rhinoDark, 1);
      line(17 + lean, 16, 16 + lean, 30, PALETTE.rhinoMidL, 1);
      line(34 + lean, 15, 33 + lean, 32, PALETTE.rhinoDark, 1);
      line(35 + lean, 16, 34 + lean, 31, PALETTE.rhinoMidL, 1);

      // Belly shadow
      ell(25 + lean, 33, 13, 3, PALETTE.rhinoDeep);

      // Front legs (brighter foreground)
      rect(9 + lean, 29, 9, 15, PALETTE.rhinoDark);
      rect(10 + lean, 29, 7, 13, PALETTE.rhinoBase);
      rect(11 + lean, 29, 3, 10, PALETTE.rhinoMidL);
      rect(30 + lean, 29, 9, 15, PALETTE.rhinoDark);
      rect(31 + lean, 29, 7, 13, PALETTE.rhinoBase);
      rect(32 + lean, 29, 3, 10, PALETTE.rhinoMidL);
      // Front toenails
      rect(10 + lean, 43, 2, 2, PALETTE.hornLight);
      rect(14 + lean, 43, 2, 2, PALETTE.hornLight);
      rect(31 + lean, 43, 2, 2, PALETTE.hornLight);
      rect(35 + lean, 43, 2, 2, PALETTE.hornLight);

      // Neck & Head
      const hx = 44 + lean;
      const hy = 21 + headTilt;
      ell(hx - 2, hy + 1, 10, 9, PALETTE.rhinoDark);
      ell(hx - 2, hy, 9, 8, PALETTE.rhinoBase);
      ell(hx - 3, hy - 3, 7, 4, PALETTE.rhinoMidL);
      ell(hx - 3, hy - 5, 4, 2, PALETTE.rhinoHL);

      // Snout / Jaw
      ell(hx + 7, hy + 3, 8, 6, PALETTE.rhinoDark);
      ell(hx + 7, hy + 2, 7, 5, PALETTE.rhinoBase);
      ell(hx + 7, hy, 5, 2, PALETTE.rhinoMidL);

      // Ears (two pointed rhino ears)
      rect(hx - 8, hy - 11, 4, 6, PALETTE.rhinoDark);
      rect(hx - 7, hy - 10, 2, 4, PALETTE.rhinoMidL);
      rect(hx - 2, hy - 12, 4, 6, PALETTE.rhinoDark);
      rect(hx - 1, hy - 11, 2, 4, PALETTE.rhinoHL);

      // Small rear horn
      rect(hx + 5, hy - 6, 3, 4, PALETTE.hornShadow);
      px(hx + 6, hy - 7, PALETTE.hornLight);

      // Iconic curved large ivory front horn
      rect(hx + 10, hy - 3, 5, 5, PALETTE.hornShadow);
      rect(hx + 11, hy - 6, 4, 4, PALETTE.hornLight);
      rect(hx + 12, hy - 9, 3, 4, PALETTE.hornLight);
      rect(hx + 14, hy - 11, 2, 3, PALETTE.hornLight);
      px(hx + 15, hy - 12, '#ffffff');
      px(hx + 11, hy - 2, PALETTE.hornShadow);
      px(hx + 12, hy - 5, PALETTE.hornShadow);

      // Expressive Eye & Brow
      rect(hx + 2, hy - 2, 3, 3, '#111116');
      px(hx + 3, hy - 2, '#ffffff'); // eye glint
      if (pose === 'pull') {
        // Determined aiming brow
        line(hx + 1, hy - 4, hx + 5, hy - 3, PALETTE.rhinoDeep, 1);
      } else if (pose === 'cheer') {
        // Happy smiling cheek
        line(hx + 6, hy + 6, hx + 11, hy + 5, PALETTE.rhinoDeep, 1);
      } else {
        line(hx + 6, hy + 6, hx + 11, hy + 6, PALETTE.rhinoDeep, 1);
      }
      // Nostril
      px(hx + 12, hy + 2, PALETTE.rhinoDeep);
      px(hx + 13, hy + 2, PALETTE.rhinoDeep);
    });

    Sprites.rhinoIdle = makeRhino('idle');
    Sprites.rhinoPull = makeRhino('pull');
    Sprites.rhinoCheer = makeRhino('cheer');

    // --- TIGER (idle, cheer, worry) — 36x42, orange + black stripes + white belly ---
    const makeTiger = (mood) => createPixelSprite(38, 44, ({ px, rect, ell, line }) => {
      const orange = '#f58216';
      const orangeHL = '#ffab38';
      const orangeDk = '#c9530a';
      const stripe = '#171110';
      const white = '#f7f3eb';
      const cream = '#ded5c5';

      // Striped Tail curving on left
      line(10, 32, 4, 28, orangeDk, 3);
      line(4, 28, 3, 22, orange, 3);
      px(4, 27, stripe);
      px(3, 24, stripe);
      px(3, 21, stripe);

      // Legs standing upright
      const legLift = mood === 'cheer' ? -2 : 0;
      rect(12, 31 + legLift, 6, 10, orangeDk);
      rect(13, 31 + legLift, 4, 9, orange);
      rect(20, 31 + legLift, 6, 10, orangeDk);
      rect(21, 31 + legLift, 4, 9, orange);
      // White paws
      rect(11, 39 + legLift, 6, 3, white);
      rect(21, 39 + legLift, 6, 3, white);

      // Torso
      ell(19, 25, 8, 9, orangeDk);
      ell(19, 25, 7, 8, orange);
      // White chest & belly
      ell(19, 26, 4, 6, white);
      rect(16, 30, 6, 2, cream);
      // Body stripes
      rect(12, 22, 3, 1, stripe);
      rect(12, 26, 3, 1, stripe);
      rect(23, 22, 3, 1, stripe);
      rect(23, 26, 3, 1, stripe);

      // Arms (pose-dependent)
      if (mood === 'cheer') {
        line(13, 21, 6, 11, orange, 3);
        line(25, 21, 32, 11, orange, 3);
        rect(4, 9, 4, 4, white);
        rect(30, 9, 4, 4, white);
        px(9, 16, stripe);
        px(28, 16, stripe);
      } else if (mood === 'worry') {
        line(13, 22, 11, 16, orange, 3);
        line(25, 22, 27, 16, orange, 3);
        rect(10, 14, 3, 3, white);
        rect(25, 14, 3, 3, white);
      } else {
        line(13, 22, 8, 17, orange, 3);
        line(25, 22, 30, 17, orange, 3);
        rect(6, 15, 4, 3, white);
        rect(28, 15, 4, 3, white);
      }

      // Ears
      ell(12, 8, 3, 3, orange);
      px(12, 8, '#f0a69b');
      ell(26, 8, 3, 3, orange);
      px(26, 8, '#f0a69b');

      // Tiger Head
      ell(19, 13, 8, 7, orangeDk);
      ell(19, 12, 7, 6, orange);
      ell(19, 9, 5, 2, orangeHL);
      // White cheeks & muzzle
      ell(15, 15, 3, 2, white);
      ell(23, 15, 3, 2, white);
      ell(19, 16, 4, 3, white);

      // Forehead & cheek stripes
      rect(18, 7, 2, 3, stripe);
      rect(15, 8, 1, 2, stripe);
      rect(22, 8, 1, 2, stripe);
      rect(12, 12, 2, 1, stripe);
      rect(24, 12, 2, 1, stripe);

      // Eyes
      rect(15, 11, 2, 2, '#111');
      rect(21, 11, 2, 2, '#111');
      px(15, 11, '#fff');
      px(21, 11, '#fff');
      // Nose
      rect(18, 14, 2, 1, '#d44c59');
      // Mouth
      if (mood === 'cheer') {
        rect(17, 16, 4, 3, '#a61c28');
        px(17, 16, '#fff');
        px(20, 16, '#fff');
      } else if (mood === 'worry') {
        rect(17, 17, 4, 1, '#5c1f1a');
      } else {
        rect(17, 16, 4, 2, '#a61c28');
      }
    });

    Sprites.tigerIdle = makeTiger('idle');
    Sprites.tigerCheer = makeTiger('cheer');
    Sprites.tigerWorry = makeTiger('worry');

    // --- MONKEY (idle, cheer/jump, worry) — 36x36 ---
    const makeMonkey = (mood) => createPixelSprite(38, 36, ({ px, rect, ell, line }) => {
      const fur = '#8c4e24';
      const furHL = '#b56e39';
      const furDk = '#5c3012';
      const tan = '#ebbf8f';
      const tanDk = '#cf9c67';

      // Curled monkey tail on left
      line(13, 23, 6, 22, furDk, 2);
      line(6, 22, 4, 17, fur, 2);
      line(4, 17, 7, 14, fur, 2);
      px(8, 15, furHL);

      // Legs
      if (mood === 'cheer') {
        // Jumping mid-air pose (just like reference image!)
        line(16, 25, 12, 31, furDk, 3);
        line(22, 25, 26, 30, furDk, 3);
        rect(10, 30, 4, 3, tan);
        rect(25, 29, 4, 3, tan);
      } else {
        rect(15, 25, 4, 7, furDk);
        rect(21, 25, 4, 7, furDk);
        rect(14, 31, 5, 3, tan);
        rect(21, 31, 5, 3, tan);
      }

      // Body
      ell(19, 22, 6, 6, furDk);
      ell(19, 21, 5, 5, fur);
      ell(19, 22, 3, 4, tan);

      // Arms
      if (mood === 'cheer') {
        line(14, 19, 6, 12, fur, 3);
        line(24, 19, 32, 13, fur, 3);
        rect(4, 10, 3, 3, tan);
        rect(31, 11, 3, 3, tan);
      } else if (mood === 'worry') {
        line(14, 19, 13, 12, fur, 3);
        line(24, 19, 25, 12, fur, 3);
        rect(12, 10, 3, 3, tan);
        rect(23, 10, 3, 3, tan);
      } else {
        line(14, 19, 9, 15, fur, 3);
        line(24, 19, 29, 15, fur, 3);
        rect(7, 13, 3, 3, tan);
        rect(28, 13, 3, 3, tan);
      }

      // Big round monkey ears
      ell(11, 11, 3, 3, fur);
      ell(11, 11, 2, 2, tan);
      ell(27, 11, 3, 3, fur);
      ell(27, 11, 2, 2, tan);

      // Head
      ell(19, 11, 7, 6, furDk);
      ell(19, 10, 6, 5, fur);
      ell(19, 7, 4, 2, furHL);
      // Tan face mask
      ell(17, 10, 3, 3, tan);
      ell(21, 10, 3, 3, tan);
      ell(19, 13, 5, 3, tan);
      px(19, 15, tanDk);

      // Eyes
      rect(16, 10, 2, 2, '#111');
      rect(20, 10, 2, 2, '#111');
      px(16, 10, '#fff');
      px(20, 10, '#fff');

      // Mouth
      if (mood === 'cheer') {
        rect(17, 13, 4, 2, '#a12525');
      } else if (mood === 'worry') {
        rect(18, 14, 2, 1, '#542218');
      } else {
        line(17, 13, 21, 13, '#542218', 1);
      }
    });

    Sprites.monkeyIdle = makeMonkey('idle');
    Sprites.monkeyCheer = makeMonkey('cheer');
    Sprites.monkeyWorry = makeMonkey('worry');

    // --- FLEEING ARSONISTS CARRYING TORCH (2 outfits x 2 run frames) — 28x32 ---
    const makeArsonist = (variant, frame) => createPixelSprite(28, 32, ({ px, rect, ell, line }) => {
      const skin = '#f2c197';
      const skinDk = '#cf966b';
      const shirt = variant === 0 ? '#c9b38f' : '#cc3328';
      const shirtDk = variant === 0 ? '#9c8663' : '#8f1c14';
      const pants = variant === 0 ? '#2f5885' : '#2d3240';
      const hair = variant === 0 ? '#5c3317' : '#3d2210';

      // Running legs (soles reach y=29..30, bottom outline at y=31)
      if (frame === 0) {
        line(10, 22, 6, 29, pants, 3);
        line(12, 22, 16, 28, pants, 3);
        rect(4, 28, 4, 2, '#241812');
        rect(15, 28, 4, 2, '#241812');
      } else {
        line(10, 22, 13, 29, pants, 3);
        line(11, 22, 8, 28, pants, 3);
        rect(12, 28, 4, 2, '#241812');
        rect(6, 28, 4, 2, '#241812');
      }

      // Torso / shirt
      rect(7, 14, 8, 9, shirtDk);
      rect(8, 14, 6, 8, shirt);

      // Back arm swinging + front arm raised holding the fire torch!
      const torchBob = frame === 0 ? 0 : 1;
      if (frame === 0) {
        line(8, 16, 4, 20, shirtDk, 2);
        rect(3, 19, 2, 2, skin);
      } else {
        line(8, 16, 5, 18, shirtDk, 2);
        rect(4, 17, 2, 2, skin);
      }

      // Forward arm extended holding torch handle
      line(14, 16, 20, 15 + torchBob, shirt, 2);
      rect(19, 14 + torchBob, 3, 2, skin);

      // Detailed pixel wooden torch in hand (tip bowl at x=21, y=9+torchBob)
      rect(20, 11 + torchBob, 2, 9, PALETTE.woodDark);
      rect(20, 11 + torchBob, 1, 8, PALETTE.woodMid);
      // Cloth-wrapped charred torch head
      rect(19, 9 + torchBob, 4, 3, '#3b2416');
      rect(20, 9 + torchBob, 2, 2, PALETTE.ropeLight);
      px(20, 8 + torchBob, PALETTE.fireOrange);
      px(21, 8 + torchBob, PALETTE.fireYellow);

      // Head
      ell(11, 9, 4, 4, skinDk);
      ell(11, 9, 3, 3, skin);
      // Hair or Red Cap
      if (variant === 0) {
        // Red baseball cap facing right
        rect(7, 5, 7, 3, '#d9281c');
        rect(11, 6, 6, 2, '#b31b12');
        rect(8, 5, 4, 1, '#ff594d');
      } else {
        rect(7, 5, 8, 3, hair);
        rect(7, 7, 2, 3, hair);
      }
      // Panicked eyes & open mouth
      px(11, 9, '#111');
      px(13, 9, '#111');
      rect(11, 11, 2, 2, '#7a1c1c');
    });

    Sprites.arsonist0A = makeArsonist(0, 0);
    Sprites.arsonist0B = makeArsonist(0, 1);
    Sprites.arsonist1A = makeArsonist(1, 0);
    Sprites.arsonist1B = makeArsonist(1, 1);

    // --- WATER BALLOON SPRITE (16x19) ---
    Sprites.balloon = createPixelSprite(16, 19, ({ px, rect, ell }) => {
      // Knotted tie at bottom-left
      rect(6, 15, 4, 2, PALETTE.waterDark);
      px(7, 16, PALETTE.waterMid);
      // Plump water balloon body
      ell(8, 8, 6, 7, PALETTE.waterDark);
      ell(8, 8, 5, 6, PALETTE.waterMid);
      ell(7, 7, 4, 4, PALETTE.waterLight);
      ell(6, 5, 2, 2, PALETTE.waterCyan);
      // Gleaming specular pixel highlight
      rect(5, 4, 2, 2, PALETTE.waterHL);
      px(5, 7, PALETTE.waterHL);
    });

    // --- HUD SMALL WATER BALLOON ICON (10x12) ---
    Sprites.iconBalloon = createPixelSprite(10, 12, ({ px, rect, ell }) => {
      rect(4, 9, 2, 2, PALETTE.waterDark);
      ell(5, 5, 3, 4, PALETTE.waterMid);
      ell(4, 4, 2, 2, PALETTE.waterLight);
      px(3, 3, PALETTE.waterHL);
    });

    // --- HUD SMALL FLAME ICON (10x12, 2 frames) ---
    const makeFlameIcon = (f) => createPixelSprite(10, 12, ({ px, ell }) => {
      ell(5, 7, 3, 4, PALETTE.fireRed);
      ell(5, 8, 2, 3, PALETTE.fireOrange);
      ell(5, 8, 1, 2, PALETTE.fireYellow);
      px(5, 9, PALETTE.fireWhite);
      px(f === 0 ? 5 : 4, 3, PALETTE.fireRed);
      px(f === 0 ? 5 : 6, 2, PALETTE.fireOrange);
    });
    Sprites.iconFlame0 = makeFlameIcon(0);
    Sprites.iconFlame1 = makeFlameIcon(1);

    // --- PIXEL STAR (16x16, gold & empty) ---
    const makeStar = (filled) => createPixelSprite(18, 18, ({ rect, px }) => {
      const main = filled ? '#ffd724' : '#4a4340';
      const hi = filled ? '#fff8a8' : '#635b57';
      const sh = filled ? '#d9880b' : '#2e2927';
      // 5-point pixel star
      rect(8, 2, 2, 3, main);
      rect(7, 4, 4, 3, main);
      rect(2, 6, 14, 3, main);
      rect(4, 9, 10, 2, main);
      rect(5, 11, 8, 2, main);
      rect(4, 13, 3, 3, main);
      rect(11, 13, 3, 3, main);
      // Shading & shine
      rect(8, 3, 1, 4, hi);
      rect(4, 7, 5, 1, hi);
      rect(11, 13, 2, 2, sh);
      rect(5, 13, 1, 2, sh);
      px(9, 11, sh);
    });
    Sprites.starGold = makeStar(true);
    Sprites.starEmpty = makeStar(false);

    // --- TREE CANOPY & TRUNK BUILDERS (Saved vs Scorched/Burning) ---
    const makeTreeSprite = (isHealthy, seedOffset) => createPixelSprite(66, 86, ({ px, rect, ell }) => {
      // Gnarled trunk & roots
      rect(27, 42, 12, 41, PALETTE.woodDark);
      rect(29, 42, 8, 41, PALETTE.woodMid);
      rect(30, 44, 3, 36, PALETTE.woodLight);
      // Bark crevices
      rect(34, 52, 2, 9, PALETTE.woodDeep);
      rect(29, 64, 2, 8, PALETTE.woodDeep);
      // Flared roots
      rect(23, 79, 5, 4, PALETTE.woodDark);
      rect(24, 80, 3, 3, PALETTE.woodMid);
      rect(38, 79, 5, 4, PALETTE.woodDark);
      rect(38, 80, 3, 3, PALETTE.woodMid);
      // Upper branches
      rect(23, 44, 6, 4, PALETTE.woodDark);
      rect(37, 43, 6, 4, PALETTE.woodDark);

      // Foliage palette (healthy lush green vs stressed/scorched warm-green when on fire)
      const cDeep = isHealthy ? '#124a12' : '#174012';
      const cDark = isHealthy ? '#1e7518' : '#266917';
      const cMid = isHealthy ? '#39a823' : '#409420';
      const cLight = isHealthy ? '#65db37' : '#6dc22d';

      // Multi-lobed organic pixel canopy clusters
      const lobes = [
        [20, 34, 15, 13],
        [46, 34, 15, 13],
        [33, 24, 19, 16],
        [18, 22, 12, 11],
        [48, 22, 12, 11],
        [33, 38, 17, 10],
      ];

      for (const [lx, ly, rx, ry] of lobes) {
        ell(lx + seedOffset, ly, rx, ry, cDeep);
      }
      for (const [lx, ly, rx, ry] of lobes) {
        ell(lx + seedOffset, ly - 1, rx - 1, ry - 1, cDark);
      }
      for (const [lx, ly, rx, ry] of lobes) {
        ell(lx + seedOffset - 1, ly - 3, Math.max(3, rx - 3), Math.max(3, ry - 4), cMid);
      }
      // Sunlit top pixel leaf clusters
      ell(24 + seedOffset, 16, 8, 5, cLight);
      ell(40 + seedOffset, 15, 7, 5, cLight);
      ell(15 + seedOffset, 27, 6, 4, cLight);
      ell(47 + seedOffset, 27, 6, 4, cLight);

      // Crisp pixel leaf texture dots
      for (let i = 0; i < 18; i++) {
        const lx = 13 + ((i * 19 + seedOffset * 7) % 40);
        const ly = 13 + ((i * 13) % 28);
        px(lx, ly, i % 3 === 0 ? cLight : cDeep);
      }

      // If burning, add subtle scorched ember patches on top crown
      if (!isHealthy) {
        ell(34, 19, 11, 5, '#592914');
        ell(34, 20, 8, 3, '#8f3f19');
      } else {
        // Tiny joyful jungle blossoms on saved trees
        px(22, 22, '#fff275');
        px(42, 26, '#ff9ec4');
        px(31, 16, '#fff275');
      }
    });

    Sprites.treeHealthy = makeTreeSprite(true, 0);
    Sprites.treeBurning = makeTreeSprite(false, 0);
    Sprites.treeDecor = makeTreeSprite(true, 1);
  }

  buildSprites();

  // ==========================================================================
  // 7. LEVEL DEFINITIONS (4 ESCALATING CONSERVATION LEVELS)
  // ==========================================================================
  const LEVELS = [
    {
      name: 'LEVEL 1: EDGE OF THE BLAZE',
      ammo: 5,
      cliffs: [
        { x: 252, y: 198, w: 300, isRightEdge: true },
      ],
      trees: [
        { x: 294, y: 198, burning: true, baseFire: false },
        { x: 384, y: 198, burning: true, baseFire: true },
        { x: 454, y: 198, burning: true, baseFire: false },
      ],
      groundFires: [
        // Extra roaring ground blaze matching reference image
        { x: 318, y: 198 },
      ],
      obstacles: [],
      arsonists: [
        { x: 422, y: 198, variant: 0 },
        { x: 456, y: 198, variant: 1 },
      ],
    },
    {
      name: 'LEVEL 2: TIMBER BARRICADE',
      ammo: 6,
      cliffs: [
        { x: 244, y: 204, w: 124, isRightEdge: false },
        { x: 368, y: 170, w: 190, isRightEdge: true },
      ],
      trees: [
        { x: 306, y: 204, burning: true, baseFire: false },
        { x: 350, y: 204, burning: true, baseFire: false },
        { x: 404, y: 170, burning: true, baseFire: true },
        { x: 456, y: 170, burning: true, baseFire: false },
      ],
      groundFires: [],
      obstacles: [
        { type: 'wood', x: 256, y: 168, w: 18, h: 36, hp: 1 },
        { type: 'rock', x: 372, y: 148, w: 18, h: 22, hp: 99 },
      ],
      arsonists: [
        { x: 428, y: 170, variant: 0 },
        { x: 460, y: 170, variant: 1 },
      ],
    },
    {
      name: 'LEVEL 3: TWIN RIDGES',
      ammo: 6,
      cliffs: [
        { x: 236, y: 162, w: 62, isRightEdge: false },
        { x: 298, y: 214, w: 86, isRightEdge: false },
        { x: 384, y: 166, w: 180, isRightEdge: true },
      ],
      trees: [
        { x: 267, y: 162, burning: true, baseFire: false },
        { x: 342, y: 214, burning: true, baseFire: true },
        { x: 414, y: 166, burning: true, baseFire: false },
        { x: 460, y: 166, burning: true, baseFire: false },
      ],
      groundFires: [],
      obstacles: [
        { type: 'wood', x: 308, y: 180, w: 16, h: 34, hp: 1 },
        { type: 'rock', x: 386, y: 142, w: 18, h: 24, hp: 99 },
      ],
      arsonists: [
        { x: 356, y: 214, variant: 1 },
        { x: 432, y: 166, variant: 0 },
        { x: 462, y: 166, variant: 1 },
      ],
    },
    {
      name: 'LEVEL 4: INFERNO PEAK',
      ammo: 7,
      cliffs: [
        { x: 234, y: 206, w: 82, isRightEdge: false },
        { x: 316, y: 174, w: 84, isRightEdge: false },
        { x: 400, y: 142, w: 160, isRightEdge: true },
      ],
      trees: [
        { x: 278, y: 206, burning: true, baseFire: false },
        { x: 358, y: 174, burning: true, baseFire: true },
        { x: 428, y: 142, burning: true, baseFire: false },
        { x: 464, y: 142, burning: true, baseFire: true },
      ],
      groundFires: [
        { x: 248, y: 206 },
      ],
      obstacles: [
        { type: 'rock', x: 238, y: 186, w: 16, h: 20, hp: 99 },
        { type: 'wood', x: 320, y: 136, w: 16, h: 38, hp: 1 },
        { type: 'wood', x: 402, y: 112, w: 14, h: 30, hp: 1 },
      ],
      arsonists: [
        { x: 380, y: 174, variant: 0 },
        { x: 444, y: 142, variant: 1 },
        { x: 466, y: 142, variant: 0 },
      ],
    },
  ];

  // ==========================================================================
  // 8. GAME STATE & PARTICLES
  // ==========================================================================
  const State = {
    mode: 'TITLE', // TITLE | CUTSCENE | PLAYING | PAUSED | VICTORY | GAMEOVER
    time: 0,
    cutsceneTime: 0,
    levelIndex: 0,
    score: 0,
    levelScore: 0,
    ammo: 5,
    maxAmmo: 5,
    totalFires: 0,
    firesRemaining: 0,
    starsEarned: 0,

    // Entities
    trees: [],
    fires: [],
    obstacles: [],
    arsonists: [],
    cliffs: [],

    // Slingshot & Balloon
    aiming: false,
    pullX: SLING_ANCHOR.x,
    pullY: SLING_ANCHOR.y,
    balloon: null, // { x, y, vx, vy, active, wobble }
    settleTimer: 0,
    shotExtinguishedCount: 0,

    // Squad Mood
    squadMood: 'idle', // idle | cheer | worry
    moodTimer: 0,
    cheerTime: 0,

    // Effects
    particles: [],
    splashes: [],
    popups: [],
    embers: [],
    smokeClouds: [],
    screenShake: 0,
    levelBannerTimer: 0,

    // Interactive UI Button Hitboxes (updated each render frame in world coords)
    buttons: [],
    hoverButtonId: null,
  };

  // Pre-seed floating atmospheric embers across the burning sky
  function initAmbientEmbers() {
    State.embers = [];
    for (let i = 0; i < 42; i++) {
      State.embers.push({
        x: Math.random() * (SAFE_W + 160) - 80,
        y: Math.random() * (SAFE_H + 80) - 60,
        vx: (Math.random() - 0.35) * 14,
        vy: -12 - Math.random() * 24,
        size: Math.random() < 0.35 ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  initAmbientEmbers();

  function loadLevel(index, keepScore = true) {
    State.levelIndex = Math.max(0, Math.min(index, LEVELS.length - 1));
    const def = LEVELS[State.levelIndex];
    if (!keepScore) State.score = 0;
    State.levelScore = 0;
    State.ammo = def.ammo;
    State.maxAmmo = def.ammo;
    State.aiming = false;
    State.pullX = SLING_ANCHOR.x;
    State.pullY = SLING_ANCHOR.y;
    State.balloon = null;
    State.settleTimer = 0;
    State.shotExtinguishedCount = 0;
    State.squadMood = 'idle';
    State.moodTimer = 0;
    State.particles = [];
    State.splashes = [];
    State.popups = [];
    State.smokeClouds = [];
    State.screenShake = 0;

    State.cliffs = def.cliffs.map((c) => ({ ...c }));
    State.trees = def.trees.map((t, idx) => ({
      id: idx,
      x: t.x,
      y: t.y,
      burning: t.burning,
      savedFlash: 0,
    }));

    State.fires = [];
    def.trees.forEach((t, idx) => {
      if (t.burning) {
        State.fires.push({
          type: 'crown',
          treeId: idx,
          x: t.x,
          y: t.y - 62,
          radius: 22,
          active: true,
          seed: idx * 1.7,
        });
      }
      if (t.baseFire) {
        State.fires.push({
          type: 'base',
          treeId: idx,
          x: t.x + 2,
          y: t.y - 8,
          radius: 16,
          active: true,
          seed: idx * 2.9 + 1.1,
        });
      }
    });

    def.groundFires.forEach((gf, idx) => {
      State.fires.push({
        type: 'ground',
        treeId: -1,
        x: gf.x,
        y: gf.y - 8,
        radius: 16,
        active: true,
        seed: idx * 3.1 + 4.2,
      });
    });

    State.totalFires = State.fires.length;
    State.firesRemaining = State.fires.length;

    State.obstacles = def.obstacles.map((o) => ({ ...o, alive: true, hitFlash: 0 }));
    State.arsonists = def.arsonists.map((a, idx) => {
      const groundY = getTerrainSurfaceY(a.x);
      return {
        x: a.x,
        y: groundY !== null ? groundY : a.y,
        vy: 0,
        onGround: true,
        homeX: a.x,
        variant: a.variant,
        vx: 26 + idx * 6,
        dir: 1,
        panicTimer: 0,
        fled: false,
        animPhase: idx * 1.5,
      };
    });

    // Pre-seed billowing pixel smoke columns rising above burning trees from frame 0
    for (const f of State.fires) {
      if (f.type !== 'crown') continue;
      for (let k = 0; k < 5; k++) {
        State.smokeClouds.push({
          x: f.x + k * 5 + (Math.random() - 0.5) * 10,
          y: f.y - 16 - k * 20,
          vx: 3 + Math.random() * 8,
          vy: -16 - Math.random() * 14,
          radius: 7 + k * 3,
          shade: k % 2 === 0 ? '#3b3332' : '#524947',
          life: 2.6 - k * 0.4,
          maxLife: 2.9,
        });
      }
    }
    State.levelBannerTimer = 2.4;
  }

  function startCutscene() {
    State.mode = 'CUTSCENE';
    State.cutsceneTime = 0;
    State.particles = [];
    State.smokeClouds = [];
    State.popups = [];
    SoundFX.playClick();
  }

  function finishCutscene() {
    loadLevel(0, false);
    State.mode = 'PLAYING';
    SoundFX.playHeroStep();
  }

  // ==========================================================================
  // 9. PARTICLE & VFX SPAWNERS
  // ==========================================================================
  function spawnWaterSplash(x, y) {
    // Crisp radial 8-bit cyan/white splash star (matching reference image!)
    State.splashes.push({
      x,
      y,
      age: 0,
      duration: 0.30,
    });

    const colors = [PALETTE.waterHL, PALETTE.waterCyan, PALETTE.waterLight, PALETTE.waterMid];
    for (let i = 0; i < 36; i++) {
      const angle = (Math.PI * 2 * i) / 36 + (Math.random() - 0.5) * 0.35;
      const speed = 55 + Math.random() * 145;
      State.particles.push({
        kind: 'water',
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        gravity: 320,
        size: Math.random() < 0.45 ? 3 : 2,
        color: colors[i % colors.length],
        life: 0.35 + Math.random() * 0.38,
        maxLife: 0.73,
      });
    }
  }

  function spawnSteamBurst(x, y) {
    const colors = ['#ffffff', '#e4ecf2', '#c3d0d9', '#9ba8b0'];
    for (let i = 0; i < 18; i++) {
      State.particles.push({
        kind: 'steam',
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 26,
        vy: -24 - Math.random() * 38,
        gravity: -12,
        size: 3 + Math.floor(Math.random() * 4),
        color: colors[i % colors.length],
        life: 0.55 + Math.random() * 0.45,
        maxLife: 1.0,
      });
    }
  }

  function spawnWoodSplinters(x, y, w, h) {
    const colors = [PALETTE.woodLight, PALETTE.woodMid, PALETTE.woodDark];
    for (let i = 0; i < 16; i++) {
      State.particles.push({
        kind: 'wood',
        x: x + Math.random() * w,
        y: y + Math.random() * h,
        vx: (Math.random() - 0.3) * 110,
        vy: -50 - Math.random() * 90,
        gravity: 340,
        size: 3,
        color: colors[i % colors.length],
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
      });
    }
  }

  function addPopup(text, x, y, color = '#fff259') {
    State.popups.push({
      text,
      x,
      y,
      vy: -28,
      color,
      life: 1.1,
      maxLife: 1.1,
    });
  }

  // ==========================================================================
  // 10. DEDICATED MULTI-COLOR 8-BIT RENDERING ROUTINES
  // ==========================================================================

  /**
   * Renders the multi-band dithered burning sky, 3-layer parallax jungle
   * silhouettes, billowing pixel smoke clouds, and floating glowing embers.
   */
  function drawBackground(targetCtx, time, skyBlend = 1.0) {
    const minX = -view.offsetX;
    const maxX = view.canvasW - view.offsetX;
    const minY = -view.offsetY;
    const maxY = view.canvasH - view.offsetY;
    const totalW = maxX - minX;

    // 1) Fiery sunset / wildfire banded sky with retro checkerboard dithering
    const bands = skyBlend > 0.5 ? PALETTE.skyBands : PALETTE.peaceSky;
    const bandCount = bands.length;
    const skyStartY = minY;
    const skyEndY = 212;
    const bandH = Math.max(16, Math.ceil((skyEndY - skyStartY) / bandCount));

    for (let b = 0; b < bandCount; b++) {
      const y0 = skyStartY + b * bandH;
      targetCtx.fillStyle = bands[b];
      targetCtx.fillRect(minX, y0, totalW, bandH + 2);

      // Authentic 8-bit 2x2 checkerboard dithering band between sky layers
      if (b < bandCount - 1) {
        targetCtx.fillStyle = bands[b + 1];
        const ditherY = y0 + bandH - 4;
        for (let dy = 0; dy < 4; dy += 2) {
          const shift = (dy / 2) % 2 === 0 ? 0 : 2;
          for (let dx = minX - (minX % 4) + shift; dx < maxX; dx += 4) {
            targetCtx.fillRect(dx, ditherY + dy, 2, 2);
          }
        }
      }
    }

    // Dark chasm backdrop below horizon
    targetCtx.fillStyle = skyBlend > 0.5 ? '#1c0504' : '#163820';
    targetCtx.fillRect(minX, skyEndY, totalW, maxY - skyEndY + 4);

    // Subtle aiming parallax shift
    const aimShift = State.aiming ? (SLING_ANCHOR.x - State.pullX) * 0.08 : Math.sin(time * 0.4) * 2;

    // 2) Parallax Layer 1 (Far jungle canopy & pine peaks)
    drawJungleSilhouetteLayer(
      targetCtx,
      minX,
      maxX,
      154,
      skyBlend > 0.5 ? '#6e190d' : '#2a6b48',
      aimShift * 0.35,
      1.0,
      11
    );

    // 3) Parallax Layer 2 (Mid burning jungle silhouettes)
    drawJungleSilhouetteLayer(
      targetCtx,
      minX,
      maxX,
      176,
      skyBlend > 0.5 ? '#450f09' : '#1d4f32',
      aimShift * 0.65,
      1.25,
      27
    );

    // 4) Parallax Layer 3 (Near dark forest treeline behind chasm)
    drawJungleSilhouetteLayer(
      targetCtx,
      minX,
      maxX,
      202,
      skyBlend > 0.5 ? '#260806' : '#12331f',
      aimShift * 1.0,
      1.5,
      53
    );

    // 5) Billowing pixel smoke clouds behind burning trees
    if (skyBlend > 0.5) {
      for (const s of State.smokeClouds) {
        const alpha = Math.max(0, Math.min(0.72, (s.life / s.maxLife) * 0.78));
        targetCtx.globalAlpha = alpha;
        const r = Math.max(4, Math.round(s.radius));
        const sx = Math.round(s.x);
        const sy = Math.round(s.y);
        // Layered organic 8-bit pixel cloud puff (overlapping stepped pixel circles)
        drawPixelCloudPuff(targetCtx, sx, sy, r, s.shade);
        drawPixelCloudPuff(targetCtx, sx - Math.round(r * 0.55), sy + 2, Math.round(r * 0.72), s.shade);
        drawPixelCloudPuff(targetCtx, sx + Math.round(r * 0.55), sy + 1, Math.round(r * 0.68), '#2b2524');
      }
      targetCtx.globalAlpha = 1;

      // 6) Floating glowing pixel embers across the burning sky
      for (const e of State.embers) {
        const flicker = Math.sin(time * 9 + e.phase);
        targetCtx.fillStyle = flicker > 0.35 ? '#fff259' : (flicker > -0.35 ? '#ff7b14' : '#d92814');
        targetCtx.fillRect(Math.round(e.x), Math.round(e.y), e.size, e.size);
        if (e.size === 2 && flicker > 0.2) {
          targetCtx.fillStyle = '#ff4400';
          targetCtx.fillRect(Math.round(e.x), Math.round(e.y) + 2, 1, 2);
        }
      }
    }
  }

  function drawPixelCloudPuff(targetCtx, cx, cy, r, color) {
    targetCtx.fillStyle = color;
    const step = 2;
    for (let dy = -r; dy <= r; dy += step) {
      const span = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      const snappedSpan = Math.max(2, Math.floor(span / 2) * 2);
      targetCtx.fillRect(cx - snappedSpan, cy + dy, snappedSpan * 2, step);
    }
  }

  function drawJungleSilhouetteLayer(targetCtx, minX, maxX, baseY, color, shiftX, scaleH, seed) {
    targetCtx.fillStyle = color;
    const step = 16;
    const startIdx = Math.floor((minX - shiftX - 36) / step);
    const endIdx = Math.ceil((maxX - shiftX + 36) / step);

    // Solid forest floor underlayer (seamless into chasm backdrop)
    targetCtx.fillRect(Math.floor(minX), baseY - 4, Math.ceil(maxX - minX) + 4, 150);

    for (let i = startIdx; i <= endIdx; i++) {
      const cx = Math.round(i * step + shiftX);
      const h1 = Math.abs(Math.sin(i * 12.9898 + seed) * 43758.5453) % 1;
      const h2 = Math.abs(Math.sin((i + 3) * 78.233 + seed) * 19283.12) % 1;
      const treeH = Math.round((18 + h1 * 30 + (h2 > 0.65 ? 14 : 0)) * scaleH);
      const topY = baseY - treeH;

      if (h2 > 0.32) {
        // Jagged layered 8-bit pine / conifer tree silhouette (matches reference background!)
        const tiers = 5;
        const tierH = Math.max(4, Math.floor(treeH / tiers));
        for (let t = 0; t < tiers; t++) {
          const ty = topY + t * tierH;
          const halfW = Math.round(2 + (t + 1) * 3.1 * (0.85 + h1 * 0.35));
          // Stepped triangular pine bough
          targetCtx.fillRect(cx - Math.max(1, Math.floor(halfW * 0.3)), ty, Math.max(2, Math.floor(halfW * 0.6)), 2);
          targetCtx.fillRect(cx - Math.max(2, Math.floor(halfW * 0.65)), ty + 2, Math.max(4, Math.floor(halfW * 1.3)), 2);
          targetCtx.fillRect(cx - halfW, ty + 4, halfW * 2, Math.max(3, tierH - 2));
        }
        // Trunk into forest floor
        targetCtx.fillRect(cx - 4, baseY - 4, 8, 18);
      } else {
        // Broad leafy tropical jungle canopy silhouette
        const r = Math.round((9 + h1 * 7) * Math.min(1.25, scaleH));
        drawPixelCloudPuff(targetCtx, cx, topY + r, r, color);
        drawPixelCloudPuff(targetCtx, cx - Math.round(r * 0.6), topY + r + 4, Math.round(r * 0.7), color);
        drawPixelCloudPuff(targetCtx, cx + Math.round(r * 0.6), topY + r + 3, Math.round(r * 0.7), color);
        targetCtx.fillRect(cx - 5, topY + r, 10, baseY - (topY + r) + 12);
      }
    }
  }

  /**
   * Dedicated natural layered terrain renderer:
   * Lush pixel grass cap + hanging blades, textured dark-brown soil with pebbles,
   * jagged grey/brown rock blocks with highlights & shadows, plus chasm boulders.
   */
  function drawTerrain(targetCtx, cliffs) {
    const minX = -view.offsetX;
    const maxX = view.canvasW - view.offsetX;
    const bottomY = view.canvasH - view.offsetY + 4;

    // 1) Left Hero Ledge (extends seamlessly to far-left viewport edge)
    drawNaturalCliffBlock(targetCtx, minX, LEFT_LEDGE_Y, LEFT_LEDGE_X - minX, bottomY - LEFT_LEDGE_Y, false, true);

    // Decorative lush pixel tree & bushes on far-left edge behind Tiger/Monkey
    targetCtx.drawImage(Sprites.treeDecor, -22, LEFT_LEDGE_Y - 82);
    drawPixelBush(targetCtx, 12, LEFT_LEDGE_Y);
    drawPixelBush(targetCtx, 42, LEFT_LEDGE_Y);

    // 2) Chasm Boulders sloping up against the first right cliff wall
    if (cliffs.length > 0) {
      const firstCliff = cliffs[0];
      drawChasmRocks(targetCtx, firstCliff.x, firstCliff.y, bottomY);
    }

    // 3) Right Target Cliff(s)
    for (let i = 0; i < cliffs.length; i++) {
      const c = cliffs[i];
      const cw = c.isRightEdge ? Math.max(c.w, maxX - c.x + 8) : c.w;
      const isLeftExposed = i === 0 || cliffs[i - 1].y > c.y;
      const isRightExposed = !c.isRightEdge && i < cliffs.length - 1 && cliffs[i + 1].y > c.y;
      drawNaturalCliffBlock(targetCtx, c.x, c.y, cw, bottomY - c.y, isLeftExposed, isRightExposed);
    }
  }

  function drawPixelBush(targetCtx, cx, groundY) {
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(cx - 13, groundY - 12, 26, 12);
    targetCtx.fillRect(cx - 9, groundY - 16, 18, 4);

    targetCtx.fillStyle = PALETTE.grassDeep;
    targetCtx.fillRect(cx - 12, groundY - 11, 24, 11);
    targetCtx.fillStyle = PALETTE.grassDark;
    targetCtx.fillRect(cx - 11, groundY - 11, 22, 8);
    targetCtx.fillRect(cx - 8, groundY - 15, 16, 6);
    targetCtx.fillStyle = PALETTE.grassMid;
    targetCtx.fillRect(cx - 9, groundY - 13, 14, 5);
    targetCtx.fillStyle = PALETTE.grassLight;
    targetCtx.fillRect(cx - 7, groundY - 14, 6, 2);
    targetCtx.fillRect(cx + 1, groundY - 11, 5, 2);
  }

  function drawChasmRocks(targetCtx, cliffX, cliffY, bottomY) {
    const boulders = [
      { x: cliffX - 18, y: Math.max(cliffY + 26, 228), w: 20, h: 16 },
      { x: cliffX - 28, y: Math.max(cliffY + 40, 242), w: 24, h: 18 },
      { x: cliffX - 36, y: Math.max(cliffY + 52, 254), w: 28, h: Math.max(18, bottomY - 254) },
    ];
    for (const b of boulders) {
      drawRockTile(targetCtx, b.x, b.y, b.w, b.h, true);
    }
  }

  function drawNaturalCliffBlock(targetCtx, x, y, w, h, leftJagged, rightJagged) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iw = Math.ceil(w);
    const ih = Math.ceil(h);

    // Base rich dark soil fill
    targetCtx.fillStyle = PALETTE.dirtDeep;
    targetCtx.fillRect(ix, iy + 6, iw, ih - 6);

    // Textured pixelated soil strata with organic soil clumps & pebbles
    const tile = 12;
    for (let ty = iy + 8; ty < iy + ih; ty += tile) {
      const rowIdx = Math.floor((ty - iy) / tile);
      for (let tx = ix; tx < ix + iw; tx += tile) {
        const colIdx = Math.floor(tx / tile);
        const hash = Math.abs(Math.sin(colIdx * 17.3 + rowIdx * 41.7) * 9999) % 1;

        // Embedded chunky grey/brown cliff rocks in deeper layers (matches reference image!)
        if (rowIdx >= 2 && hash > 0.56 && tx > ix + 6 && tx < ix + iw - 18) {
          drawRockTile(targetCtx, tx, ty, 20, 14, false);
        } else {
          // Layered dark-brown soil block
          targetCtx.fillStyle = hash > 0.5 ? PALETTE.dirtMid : PALETTE.dirtDark;
          targetCtx.fillRect(tx, ty, Math.min(tile, ix + iw - tx), tile);
          // Soil highlight clod
          targetCtx.fillStyle = PALETTE.dirtLight;
          targetCtx.fillRect(tx + 2, ty + 2, 4, 3);
          targetCtx.fillRect(tx + 7, ty + 6, 3, 2);
          // Soil crevice shadow & tiny pebble
          targetCtx.fillStyle = PALETTE.dirtDeep;
          targetCtx.fillRect(tx + 1, ty + 8, 5, 2);
          if (hash < 0.25) {
            targetCtx.fillStyle = PALETTE.rockMid;
            targetCtx.fillRect(tx + 6, ty + 3, 3, 2);
          }
        }
      }
    }

    // Jagged rocky side borders facing the chasm
    if (leftJagged) {
      for (let ry = iy + 6; ry < iy + ih; ry += 6) {
        const jut = (Math.floor(ry / 6) % 3) === 0 ? 2 : 0;
        targetCtx.fillStyle = PALETTE.outline;
        targetCtx.fillRect(ix - 1 - jut, ry, 2 + jut, 6);
        targetCtx.fillStyle = PALETTE.dirtLight;
        targetCtx.fillRect(ix + 1, ry + 1, 2, 4);
      }
    }
    if (rightJagged) {
      for (let ry = iy + 6; ry < iy + ih; ry += 6) {
        const jut = (Math.floor(ry / 6) % 2) === 0 ? 2 : 0;
        targetCtx.fillStyle = PALETTE.outline;
        targetCtx.fillRect(ix + iw - 1, ry, 2 + jut, 6);
        targetCtx.fillStyle = PALETTE.dirtDeep;
        targetCtx.fillRect(ix + iw - 3, ry, 2, 6);
      }
    }

    // Top lush 8-bit grass layer with crisp black outline & overhanging pixel tufts
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(ix - 1, iy - 1, iw + 2, 9);

    targetCtx.fillStyle = PALETTE.grassDark;
    targetCtx.fillRect(ix, iy + 3, iw, 4);

    targetCtx.fillStyle = PALETTE.grassMid;
    targetCtx.fillRect(ix, iy + 1, iw, 3);

    targetCtx.fillStyle = PALETTE.grassLight;
    targetCtx.fillRect(ix, iy, iw, 2);

    // Repeating pixel grass blades & hanging overhangs
    for (let gx = ix + 2; gx < ix + iw - 3; gx += 6) {
      const hMod = ((gx * 7) % 5);
      // Little upward pixel grass blades
      targetCtx.fillStyle = PALETTE.outline;
      targetCtx.fillRect(gx, iy - 3, 2, 2);
      targetCtx.fillStyle = PALETTE.grassLight;
      targetCtx.fillRect(gx, iy - 2, 2, 2);

      // Overhanging green pixel tufts dropping over dark soil
      const drop = 2 + (hMod % 3);
      targetCtx.fillStyle = PALETTE.outline;
      targetCtx.fillRect(gx - 1, iy + 7, 5, drop + 1);
      targetCtx.fillStyle = PALETTE.grassDark;
      targetCtx.fillRect(gx, iy + 6, 3, drop);
      targetCtx.fillStyle = PALETTE.grassMid;
      targetCtx.fillRect(gx, iy + 5, 2, Math.max(1, drop - 1));
    }
  }

  function drawRockTile(targetCtx, x, y, w, h, jaggedTop) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(ix, iy + (jaggedTop ? 2 : 0), w, h - (jaggedTop ? 2 : 0));
    if (jaggedTop) {
      targetCtx.fillRect(ix + 3, iy, w - 6, 3);
    }

    targetCtx.fillStyle = PALETTE.rockDeep;
    targetCtx.fillRect(ix + 1, iy + 2, w - 2, h - 3);

    targetCtx.fillStyle = PALETTE.rockDark;
    targetCtx.fillRect(ix + 2, iy + 2, w - 4, h - 4);

    targetCtx.fillStyle = PALETTE.rockMid;
    targetCtx.fillRect(ix + 2, iy + 2, w - 6, Math.max(3, h - 7));

    // Crisp bevel highlight on upper-left facet
    targetCtx.fillStyle = PALETTE.rockHighlight;
    targetCtx.fillRect(ix + 3, iy + 2, Math.max(4, Math.floor(w * 0.45)), 2);
    targetCtx.fillRect(ix + 2, iy + 3, 2, Math.max(3, Math.floor(h * 0.35)));

    // Pixel crack detail
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(ix + Math.floor(w * 0.55), iy + Math.floor(h * 0.45), 3, 1);
    targetCtx.fillRect(ix + Math.floor(w * 0.55) + 2, iy + Math.floor(h * 0.45) + 1, 2, 2);
  }

  /**
   * Dedicated Hero Pixel Rhino renderer.
   */
  function drawRhino(targetCtx, x, y, pose, time) {
    const sprite =
      pose === 'pull' ? Sprites.rhinoPull :
      pose === 'cheer' ? Sprites.rhinoCheer :
      Sprites.rhinoIdle;
    const breath = pose === 'cheer'
      ? Math.round(Math.abs(Math.sin(time * 10)) * -4)
      : Math.round(Math.sin(time * 3.2) * 0.6);
    targetCtx.drawImage(sprite, Math.round(x - sprite.width / 2), Math.round(y - sprite.height + breath));
  }

  /**
   * Dedicated Cheering Pixel Tiger renderer (jump synced to cheerTime on extinguish).
   */
  function drawTiger(targetCtx, x, y, mood, time) {
    const sprite =
      mood === 'cheer' ? Sprites.tigerCheer :
      mood === 'worry' ? Sprites.tigerWorry :
      Sprites.tigerIdle;
    const cheerPhase = State.mode === 'PLAYING' ? State.cheerTime : time;
    const bounce =
      mood === 'cheer' ? Math.round(Math.abs(Math.sin(cheerPhase * 12)) * -12) :
      mood === 'worry' ? Math.round(Math.sin(time * 16) * 1) :
      Math.round(Math.abs(Math.sin(time * 4.5)) * -2);
    targetCtx.drawImage(sprite, Math.round(x - sprite.width / 2), Math.round(y - sprite.height + bounce));
  }

  /**
   * Dedicated Lively Pixel Monkey renderer (jump synced to cheerTime on extinguish).
   */
  function drawMonkey(targetCtx, x, y, mood, time) {
    const sprite =
      mood === 'cheer' ? Sprites.monkeyCheer :
      mood === 'worry' ? Sprites.monkeyWorry :
      Sprites.monkeyIdle;
    const cheerPhase = State.mode === 'PLAYING' ? State.cheerTime : time;
    // Monkey jumps enthusiastically high on cheers (like the reference image!)
    const jumpY =
      mood === 'cheer' ? Math.round(-22 - Math.abs(Math.sin(cheerPhase * 13.5)) * 20) :
      mood === 'worry' ? 0 :
      Math.round(-16 - Math.abs(Math.sin(time * 5.2 + 0.8)) * 14);
    const swayX = mood === 'cheer' ? Math.round(Math.sin(cheerPhase * 8) * 4) : 0;
    targetCtx.drawImage(sprite, Math.round(x - sprite.width / 2 + swayX), Math.round(y - sprite.height + jumpY));
  }

  /**
   * Y-Shaped Wooden Vine Slingshot (split into back & front passes for depth!).
   */
  function drawSlingshotBack(targetCtx, pouchX, pouchY, hasBalloon) {
    const baseX = 152;
    const baseY = LEFT_LEDGE_Y;
    const forkY = 178;
    const backProngX = 163;
    const backProngY = 150;

    // Back wooden prong (with crisp dark outline & wood shading)
    drawPixelLine(targetCtx, baseX, forkY, backProngX, backProngY, PALETTE.outline, 8);
    drawPixelLine(targetCtx, baseX, forkY, backProngX, backProngY, PALETTE.woodDark, 6);
    drawPixelLine(targetCtx, baseX - 1, forkY, backProngX - 1, backProngY, PALETTE.woodMid, 3);

    // Rope lashing on back prong tip
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(backProngX - 4, backProngY + 1, 9, 6);
    targetCtx.fillStyle = PALETTE.ropeDark;
    targetCtx.fillRect(backProngX - 3, backProngY + 2, 7, 4);
    targetCtx.fillStyle = PALETTE.ropeLight;
    targetCtx.fillRect(backProngX - 3, backProngY + 2, 7, 1);
    targetCtx.fillRect(backProngX - 3, backProngY + 4, 7, 1);

    // Back elastic vine/rubber band
    if (hasBalloon) {
      drawPixelLine(targetCtx, backProngX, backProngY + 4, pouchX, pouchY, PALETTE.outline, 4);
      drawPixelLine(targetCtx, backProngX, backProngY + 4, pouchX, pouchY, '#593317', 2);
    }

    // Slingshot main vertical wooden post planted in grass
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(baseX - 5, forkY - 2, 10, baseY - forkY + 4);
    targetCtx.fillStyle = PALETTE.woodDark;
    targetCtx.fillRect(baseX - 4, forkY - 1, 8, baseY - forkY + 3);
    targetCtx.fillStyle = PALETTE.woodMid;
    targetCtx.fillRect(baseX - 3, forkY - 1, 5, baseY - forkY + 3);
    targetCtx.fillStyle = PALETTE.woodLight;
    targetCtx.fillRect(baseX - 3, forkY + 2, 2, baseY - forkY - 2);
  }

  function drawSlingshotFront(targetCtx, pouchX, pouchY, hasBalloon) {
    const baseX = 152;
    const baseY = LEFT_LEDGE_Y;
    const forkY = 178;
    const frontProngX = 140;
    const frontProngY = 152;

    // Front elastic band (drawn in front of balloon!)
    if (hasBalloon) {
      drawPixelLine(targetCtx, frontProngX, frontProngY + 4, pouchX, pouchY, PALETTE.outline, 4);
      drawPixelLine(targetCtx, frontProngX, frontProngY + 4, pouchX, pouchY, '#754621', 2);
    }

    // Front wooden prong
    drawPixelLine(targetCtx, baseX, forkY, frontProngX, frontProngY, PALETTE.outline, 8);
    drawPixelLine(targetCtx, baseX, forkY, frontProngX, frontProngY, PALETTE.woodDark, 6);
    drawPixelLine(targetCtx, baseX - 1, forkY, frontProngX - 1, frontProngY, PALETTE.woodMid, 3);
    drawPixelLine(targetCtx, baseX - 2, forkY, frontProngX - 2, frontProngY, PALETTE.woodLight, 1);

    // Rope lashing on front prong tip
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(frontProngX - 4, frontProngY + 1, 9, 6);
    targetCtx.fillStyle = PALETTE.ropeDark;
    targetCtx.fillRect(frontProngX - 3, frontProngY + 2, 7, 4);
    targetCtx.fillStyle = PALETTE.ropeLight;
    targetCtx.fillRect(frontProngX - 3, frontProngY + 2, 7, 1);
    targetCtx.fillRect(frontProngX - 3, frontProngY + 4, 7, 1);

    // Spiraling green jungle vines around post & prongs (matches reference image!)
    const vineCoords = [
      [148, 214], [150, 211], [154, 208], [156, 205],
      [153, 202], [148, 199], [146, 195], [149, 191],
      [154, 187], [157, 183], [144, 174], [141, 168],
      [162, 168], [164, 173],
    ];
    for (let i = 0; i < vineCoords.length; i++) {
      const [vx, vy] = vineCoords[i];
      targetCtx.fillStyle = PALETTE.outline;
      targetCtx.fillRect(vx - 1, vy - 1, 4, 4);
      targetCtx.fillStyle = i % 2 === 0 ? PALETTE.grassMid : PALETTE.grassLight;
      targetCtx.fillRect(vx, vy, 2, 2);
    }
    // Small hanging vine leaf
    targetCtx.fillStyle = PALETTE.grassLight;
    targetCtx.fillRect(157, 203, 3, 2);
    targetCtx.fillRect(143, 194, 3, 2);
    targetCtx.fillRect(163, 174, 3, 2);
  }

  /**
   * Dedicated Burning / Saved Pixel Tree renderer with roaring animated 8-bit flames.
   */
  function drawBurningTree(targetCtx, tree, time) {
    const hasActiveFire = State.fires.some((f) => f.treeId === tree.id && f.active);
    const sprite = hasActiveFire ? Sprites.treeBurning : Sprites.treeHealthy;
    const tx = Math.round(tree.x - sprite.width / 2);
    const ty = Math.round(tree.y - sprite.height + 3);
    targetCtx.drawImage(sprite, tx, ty);

    // Subtle sparkle on recently extinguished saved tree
    if (!hasActiveFire && tree.savedFlash > 0) {
      const a = Math.min(1, tree.savedFlash);
      targetCtx.globalAlpha = a;
      targetCtx.fillStyle = '#fff9c4';
      const sx = Math.round(tree.x + Math.sin(time * 14) * 14);
      const sy = Math.round(tree.y - 58 + Math.cos(time * 12) * 10);
      targetCtx.fillRect(sx - 3, sy, 7, 1);
      targetCtx.fillRect(sx, sy - 3, 1, 7);
      targetCtx.globalAlpha = 1;
    }
  }

  /**
   * Animated multi-layered 8-bit roaring pixel fire (red -> orange -> yellow -> white core)
   * with organic tapering flame tongues and rising spark pixels.
   */
  function drawPixelFire(targetCtx, cx, cy, scale, time, seed) {
    const tongues = 5;
    const baseY = Math.round(cy);

    // Glowing fire base connecting all flame tongues
    const baseW = Math.round(28 * scale);
    targetCtx.fillStyle = PALETTE.fireRed;
    targetCtx.fillRect(Math.round(cx - baseW / 2), baseY - 5, baseW, 6);
    targetCtx.fillStyle = PALETTE.fireOrange;
    targetCtx.fillRect(Math.round(cx - baseW * 0.4), baseY - 4, Math.round(baseW * 0.8), 4);

    for (let i = 0; i < tongues; i++) {
      const spread = (i - 2) * (6 * scale);
      const wave = Math.sin(time * 12 + seed + i * 2.1);
      const sway = Math.sin(time * 15 + seed + i * 1.4);
      const totalH = Math.round((16 + (2 - Math.abs(i - 2)) * 6 + wave * 5) * scale);
      const maxW = Math.round((9 + (2 - Math.abs(i - 2)) * 2) * scale);
      const fx = Math.round(cx + spread);

      // Build organic tapering pixel layers from bottom to curling tip
      const slices = Math.max(5, Math.floor(totalH / 2));
      for (let s = 0; s < slices; s++) {
        const frac = s / slices; // 0 = base, 1 = tip
        const sy = baseY - s * 2;
        const curveX = Math.round(sway * frac * frac * 4 * scale);
        const w = Math.max(2, Math.round(maxW * (1 - frac * 0.88)));

        // Outer red edge
        targetCtx.fillStyle = PALETTE.fireRed;
        targetCtx.fillRect(fx + curveX - Math.floor(w / 2), sy - 2, w, 2);

        // Mid bright orange
        if (frac < 0.80) {
          const ow = Math.max(2, Math.round(w * 0.72));
          targetCtx.fillStyle = PALETTE.fireOrange;
          targetCtx.fillRect(fx + curveX - Math.floor(ow / 2), sy - 2, ow, 2);
        }
        // Inner yellow flame
        if (frac < 0.56) {
          const yw = Math.max(2, Math.round(w * 0.48));
          targetCtx.fillStyle = PALETTE.fireYellow;
          targetCtx.fillRect(fx + curveX - Math.floor(yw / 2), sy - 2, yw, 2);
        }
        // White-hot core at base center
        if (frac < 0.28 && Math.abs(i - 2) <= 1) {
          const ww = Math.max(2, Math.round(w * 0.28));
          targetCtx.fillStyle = PALETTE.fireWhite;
          targetCtx.fillRect(fx + curveX - Math.floor(ww / 2), sy - 2, ww, 2);
        }
      }

      // Detached floating pixel spark above flame tip
      if ((i + Math.floor(time * 8)) % 2 === 0) {
        const sparkX = fx + Math.round(sway * 5 * scale);
        const sparkY = baseY - totalH - 3 - Math.round((Math.sin(time * 10 + i) + 1) * 3);
        targetCtx.fillStyle = i % 2 === 0 ? PALETTE.fireYellow : PALETTE.fireOrange;
        targetCtx.fillRect(sparkX, sparkY, 2, 2);
      }
    }
  }

  /**
   * Renders obstacles (wooden timber barricades & mossy jagged rock boulders).
   */
  function drawObstacle(targetCtx, obs) {
    if (!obs.alive) return;
    const ix = Math.round(obs.x);
    const iy = Math.round(obs.y);

    if (obs.type === 'wood') {
      // Stacked timber logs / wooden barricade
      targetCtx.fillStyle = PALETTE.outline;
      targetCtx.fillRect(ix - 1, iy - 1, obs.w + 2, obs.h + 2);
      const logH = 9;
      for (let ly = iy; ly < iy + obs.h; ly += logH) {
        const lh = Math.min(logH, iy + obs.h - ly);
        targetCtx.fillStyle = PALETTE.woodDark;
        targetCtx.fillRect(ix, ly, obs.w, lh);
        targetCtx.fillStyle = PALETTE.woodMid;
        targetCtx.fillRect(ix + 1, ly + 1, obs.w - 2, Math.max(1, lh - 3));
        targetCtx.fillStyle = PALETTE.woodLight;
        targetCtx.fillRect(ix + 2, ly + 1, obs.w - 4, 2);
        // Horizontal seam between logs
        targetCtx.fillStyle = PALETTE.outline;
        targetCtx.fillRect(ix, ly + lh - 1, obs.w, 1);
        // Log end grain circles / nails
        targetCtx.fillStyle = PALETTE.ropeLight;
        targetCtx.fillRect(ix + 3, ly + 3, 2, 2);
        targetCtx.fillRect(ix + obs.w - 5, ly + 3, 2, 2);
      }
    } else {
      // Jagged mossy rock boulder
      drawRockTile(targetCtx, ix, iy, obs.w, obs.h, true);
      // Moss cap on boulder
      targetCtx.fillStyle = PALETTE.grassDark;
      targetCtx.fillRect(ix + 3, iy + 1, obs.w - 6, 3);
      targetCtx.fillStyle = PALETTE.grassLight;
      targetCtx.fillRect(ix + 4, iy + 1, Math.max(3, obs.w - 10), 1);
    }
  }

  /**
   * Computes the exact world coordinates of an arsonist's lit torch tip.
   */
  function getArsonistTorchTip(a, time) {
    const frame = Math.floor(time * (a.panicTimer > 0 ? 12 : 7) + (a.animPhase || 0)) % 2;
    const torchBob = frame === 0 ? 0 : 1;
    // Character body center is at local x=11; torch bowl center is at local x=21 (dx = +10)
    const dir = a.dir >= 0 ? 1 : -1;
    return {
      x: Math.round(a.x + dir * 10),
      y: Math.round(a.y - 23 + torchBob),
    };
  }

  /**
   * Spawns tiny glowing flickering pixel flame sparks from a torch tip.
   */
  function spawnTorchSpark(tx, ty) {
    const colors = [PALETTE.fireWhite, PALETTE.fireYellow, PALETTE.fireOrange, PALETTE.fireRed];
    State.particles.push({
      kind: 'torchSpark',
      x: tx + (Math.random() - 0.5) * 4,
      y: ty - 1 + (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.5) * 18,
      vy: -20 - Math.random() * 24,
      gravity: -8,
      size: Math.random() < 0.4 ? 2 : 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.22 + Math.random() * 0.22,
      maxLife: 0.44,
    });
  }

  /**
   * Renders fleeing pixel arsonists carrying a lit flickering fire torch,
   * anchored cleanly on top of the terrain surface (a.y).
   */
  function drawArsonist(targetCtx, a, time) {
    if (a.fled) return;
    const frame = Math.floor(time * (a.panicTimer > 0 ? 12 : 7) + (a.animPhase || 0)) % 2;
    const sprite =
      a.variant === 0
        ? (frame === 0 ? Sprites.arsonist0A : Sprites.arsonist0B)
        : (frame === 0 ? Sprites.arsonist1A : Sprites.arsonist1B);

    // Body center is at x=11 inside the 28x32 sprite; bottom boot sole outline rests cleanly on a.y
    const pivotX = 11;
    const drawY = Math.round(a.y - sprite.height + 1);
    if (a.dir >= 0) {
      targetCtx.drawImage(sprite, Math.round(a.x - pivotX), drawY);
    } else {
      targetCtx.save();
      targetCtx.translate(Math.round(a.x), drawY);
      targetCtx.scale(-1, 1);
      targetCtx.drawImage(sprite, -pivotX, 0);
      targetCtx.restore();
    }

    // Animated flickering 8-bit flame on top of the torch tip!
    const tip = getArsonistTorchTip(a, time);
    const flicker = Math.sin(time * 24 + (a.animPhase || 0) * 3);
    const sway = Math.round(Math.sin(time * 18 + (a.animPhase || 0)) * 1.2);
    const flameH = flicker > 0 ? 7 : 5;

    // Subtle warm pixel glow behind torch tip
    targetCtx.globalAlpha = 0.28;
    targetCtx.fillStyle = PALETTE.fireOrange;
    targetCtx.fillRect(tip.x - 4, tip.y - 6, 8, 8);
    targetCtx.globalAlpha = 1;

    // Outer red pixel flame
    targetCtx.fillStyle = PALETTE.fireRed;
    targetCtx.fillRect(tip.x - 2, tip.y - flameH + 2, 5, flameH - 1);
    targetCtx.fillRect(tip.x - 1 + sway, tip.y - flameH, 3, 2);
    targetCtx.fillRect(tip.x + sway, tip.y - flameH - 1, 1, 1);
    // Mid bright orange flame
    targetCtx.fillStyle = PALETTE.fireOrange;
    targetCtx.fillRect(tip.x - 1, tip.y - flameH + 3, 3, Math.max(2, flameH - 2));
    // Inner bright yellow & white-hot core
    targetCtx.fillStyle = PALETTE.fireYellow;
    targetCtx.fillRect(tip.x - 1, tip.y - 2, 3, 2);
    targetCtx.fillStyle = PALETTE.fireWhite;
    targetCtx.fillRect(tip.x, tip.y - 1, 1, 1);

    // Panic exclamation mark when water splashes nearby
    if (a.panicTimer > 0) {
      drawPixelText(targetCtx, '!', a.x, drawY - 8, 1, '#fff259', '#0c090c', 'center');
    }
  }

  /**
   * Renders the gleaming blue water balloon with subtle wobble in mid-air.
   */
  function drawWaterBalloon(targetCtx, x, y, vx, vy, time, inFlight) {
    const sprite = Sprites.balloon;
    if (!inFlight) {
      targetCtx.drawImage(sprite, Math.round(x - sprite.width / 2), Math.round(y - sprite.height / 2));
      return;
    }
    // Subtle pixel wobble stretch during flight
    const wobble = Math.sin(time * 26) * 0.1;
    const sx = 1 + wobble;
    const sy = 1 - wobble;
    targetCtx.save();
    targetCtx.translate(Math.round(x), Math.round(y));
    targetCtx.scale(sx, sy);
    targetCtx.drawImage(sprite, Math.round(-sprite.width / 2), Math.round(-sprite.height / 2));
    targetCtx.restore();
  }

  /**
   * Renders the crisp glowing white/light-blue pixel dotted parabolic trajectory arc
   * and retro power gauge while aiming.
   */
  function drawTrajectoryArc(targetCtx) {
    const dx = SLING_ANCHOR.x - State.pullX;
    const dy = SLING_ANCHOR.y - State.pullY;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return;

    const ratio = Math.min(1, dist / MAX_PULL);
    const speed = ratio * MAX_LAUNCH_SPEED;
    const angle = Math.atan2(dy, dx);
    let simX = State.pullX;
    let simY = State.pullY;
    let simVx = Math.cos(angle) * speed;
    let simVy = Math.sin(angle) * speed;
    const dt = 1 / 60;

    // Step exact physics so dots accurately predict impact!
    for (let step = 1; step <= 96; step++) {
      simVy += GRAVITY * dt;
      simX += simVx * dt;
      simY += simVy * dt;

      if (simX > SAFE_W + 40 || simY > SAFE_H + 10) break;

      if (step % 2 === 0) {
        const dotIndex = step / 2;
        const alpha = Math.max(0.22, 1 - dotIndex / 52);
        const px = Math.round(simX);
        const py = Math.round(simY);

        // Glowing light-blue pixel halo + bright white center (matches reference image!)
        targetCtx.globalAlpha = alpha * 0.58;
        targetCtx.fillStyle = PALETTE.waterCyan;
        targetCtx.fillRect(px - 2, py - 2, 5, 5);
        targetCtx.globalAlpha = alpha;
        targetCtx.fillStyle = '#ffffff';
        targetCtx.fillRect(px - 1, py - 1, 3, 3);
      }

      // Stop preview if hitting cliff terrain
      if (hitTestTerrain(simX, simY, 2)) break;
    }
    targetCtx.globalAlpha = 1;

    // Retro pixel power bar below slingshot
    const barW = 40;
    const barH = 6;
    const bx = SLING_ANCHOR.x - Math.floor(barW / 2);
    const by = SLING_ANCHOR.y + 72;
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    targetCtx.fillStyle = '#241818';
    targetCtx.fillRect(bx, by, barW, barH);
    const fillW = Math.round(ratio * barW);
    const barColor = ratio > 0.8 ? '#ff4f24' : (ratio > 0.45 ? '#ffd724' : '#45b6ff');
    targetCtx.fillStyle = barColor;
    targetCtx.fillRect(bx, by, fillW, barH);
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fillRect(bx, by, fillW, 1);
    drawPixelText(targetCtx, Math.round(ratio * 100) + '%', bx + barW / 2, by - 9, 1, '#ffffff', PALETTE.outline, 'center');
  }

  /**
   * Renders radial pixel splash burst stars (matches big cyan/white splash in reference image).
   */
  function drawSplashes(targetCtx) {
    for (const s of State.splashes) {
      const t = s.age / s.duration;
      const r = Math.round(8 + t * 22);
      const sx = Math.round(s.x);
      const sy = Math.round(s.y);
      const alpha = Math.max(0, 1 - t * 0.9);

      targetCtx.globalAlpha = alpha;
      // 8-ray pixel splash star burst
      const rays = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72],
      ];
      for (const [rx, ry] of rays) {
        drawPixelLine(targetCtx, sx, sy, sx + rx * r, sy + ry * r, PALETTE.outline, 5);
        drawPixelLine(targetCtx, sx, sy, sx + rx * r, sy + ry * r, PALETTE.waterLight, 3);
        drawPixelLine(targetCtx, sx, sy, sx + rx * (r * 0.72), sy + ry * (r * 0.72), PALETTE.waterCyan, 2);
      }
      // Bright white center splash core
      const core = Math.max(2, Math.round((1 - t) * 9));
      targetCtx.fillStyle = PALETTE.waterHL;
      targetCtx.fillRect(sx - core, sy - core, core * 2, core * 2);
      targetCtx.globalAlpha = 1;
    }
  }

  // ==========================================================================
  // 11. RETRO ARCADE HUD & CLICKABLE PIXEL BUTTONS
  // ==========================================================================
  function registerButton(id, x, y, w, h, action) {
    State.buttons.push({ id, x, y, w, h, action });
  }

  function drawPixelButton(targetCtx, id, x, y, w, h, label, bgColor = '#8f5425', hlColor = '#b8763e') {
    const hovered = State.hoverButtonId === id;
    const ix = Math.round(x);
    const iy = Math.round(y);
    const shift = hovered ? -1 : 0;

    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(ix - 1, iy - 1 + shift, w + 2, h + 2);
    // Drop shadow
    targetCtx.fillStyle = '#090607';
    targetCtx.fillRect(ix, iy + h + 1 + shift, w + 1, 2);

    targetCtx.fillStyle = hovered ? hlColor : bgColor;
    targetCtx.fillRect(ix, iy + shift, w, h);

    // Top bevel highlight & bottom bevel shadow
    targetCtx.fillStyle = hovered ? '#ffe099' : hlColor;
    targetCtx.fillRect(ix + 1, iy + 1 + shift, w - 2, 2);
    targetCtx.fillStyle = '#4a260c';
    targetCtx.fillRect(ix + 1, iy + h - 3 + shift, w - 2, 2);

    if (label) {
      drawPixelText(targetCtx, label, ix + w / 2, iy + Math.floor((h - 7) / 2) + shift, 1, '#ffffff', PALETTE.outline, 'center', true);
    }
  }

  function drawHUD(targetCtx, time) {
    const topY = view.hudTop + 6;

    // 1) Top-left double-layered "KARHUTLA RESCUE" logo
    drawLogo(targetCtx, 8, topY, 2, 'left');

    // 2) Level & Ammo (with pixel blue balloon icon)
    drawPixelText(targetCtx, 'LEVEL ' + (State.levelIndex + 1), 138, topY + 3, 1, '#ffffff', PALETTE.outline, 'left', false);
    const ammoStr = 'AMMO: ' + State.ammo + '/' + State.maxAmmo;
    drawPixelText(targetCtx, ammoStr, 138, topY + 17, 1, '#ffffff', PALETTE.outline, 'left', false);
    targetCtx.drawImage(Sprites.iconBalloon, 138 + measurePixelText(ammoStr, 1, false) + 5, topY + 14);

    // 3) Fires Remaining (with animated pixel flame icon)
    const firesStr = 'FIRES: ' + State.firesRemaining + '/' + State.totalFires;
    drawPixelText(targetCtx, firesStr, 224, topY + 3, 1, '#ffffff', PALETTE.outline, 'left', false);
    const flameIcon = Math.floor(time * 8) % 2 === 0 ? Sprites.iconFlame0 : Sprites.iconFlame1;
    targetCtx.drawImage(flameIcon, 224 + measurePixelText(firesStr, 1, false) + 4, topY);

    // 4) Score
    drawPixelText(targetCtx, 'SCORE: ' + State.score, 314, topY + 3, 1, '#fff259', PALETTE.outline, 'left', false);

    // 5) Pixel-styled Mute, Pause, and Restart buttons (top-right)
    const btnY = topY + 2;
    const btnSize = 20;

    // Mute / Audio button
    const muteX = 408;
    drawPixelButton(targetCtx, 'hud_mute', muteX, btnY, btnSize, btnSize, '');
    registerButton('hud_mute', muteX, btnY, btnSize, btnSize, () => SoundFX.toggleMute());
    // Draw crisp speaker pixel icon
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fillRect(muteX + 4, btnY + 8, 3, 4);
    targetCtx.fillRect(muteX + 7, btnY + 6, 2, 8);
    targetCtx.fillRect(muteX + 9, btnY + 4, 2, 12);
    if (SoundFX.isMuted()) {
      drawPixelLine(targetCtx, muteX + 13, btnY + 7, muteX + 17, btnY + 13, '#ff4d4d', 2);
      drawPixelLine(targetCtx, muteX + 17, btnY + 7, muteX + 13, btnY + 13, '#ff4d4d', 2);
    } else {
      targetCtx.fillStyle = '#8be8ff';
      targetCtx.fillRect(muteX + 13, btnY + 7, 1, 6);
      targetCtx.fillRect(muteX + 15, btnY + 5, 1, 10);
    }

    // Pause button (||)
    const pauseX = 432;
    drawPixelButton(targetCtx, 'hud_pause', pauseX, btnY, btnSize, btnSize, '');
    registerButton('hud_pause', pauseX, btnY, btnSize, btnSize, () => {
      SoundFX.playClick();
      State.mode = State.mode === 'PAUSED' ? 'PLAYING' : 'PAUSED';
    });
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(pauseX + 5, btnY + 4, 4, 12);
    targetCtx.fillRect(pauseX + 11, btnY + 4, 4, 12);
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fillRect(pauseX + 6, btnY + 5, 2, 10);
    targetCtx.fillRect(pauseX + 12, btnY + 5, 2, 10);

    // Restart button (pixel circular arrow)
    const restartX = 456;
    drawPixelButton(targetCtx, 'hud_restart', restartX, btnY, btnSize, btnSize, '');
    registerButton('hud_restart', restartX, btnY, btnSize, btnSize, () => {
      SoundFX.playClick();
      State.score = Math.max(0, State.score - State.levelScore);
      loadLevel(State.levelIndex, true);
      State.mode = 'PLAYING';
    });
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fillRect(restartX + 6, btnY + 5, 8, 2);
    targetCtx.fillRect(restartX + 13, btnY + 7, 2, 6);
    targetCtx.fillRect(restartX + 6, btnY + 13, 8, 2);
    targetCtx.fillRect(restartX + 5, btnY + 9, 2, 4);
    // Arrowhead
    targetCtx.fillRect(restartX + 5, btnY + 4, 3, 4);
    targetCtx.fillRect(restartX + 4, btnY + 6, 2, 2);
  }

  // ==========================================================================
  // 12. TITLE SCREEN, OPENING CUTSCENE & MODAL OVERLAYS
  // ==========================================================================
  function drawTitleScreen(targetCtx, time) {
    drawBackground(targetCtx, time, 1.0);
    drawTerrain(targetCtx, LEVELS[0].cliffs);

    // Live burning jungle diorama in background
    for (const t of LEVELS[0].trees) {
      targetCtx.drawImage(Sprites.treeBurning, Math.round(t.x - 33), Math.round(t.y - 83));
      drawPixelFire(targetCtx, t.x, t.y - 54, 1.0, time, t.x);
    }
    drawPixelFire(targetCtx, 318, 198, 0.9, time, 4.2);

    // Fleeing arsonists on the right cliff (carrying lit torches with sparks)
    const runOffset = Math.sin(time * 1.4) * 14;
    const titleArsonists = [
      { x: 422 + runOffset, y: 198, variant: 0, dir: 1, panicTimer: 0, fled: false, animPhase: 0 },
      { x: 454 + runOffset * 0.8, y: 198, variant: 1, dir: 1, panicTimer: 0, fled: false, animPhase: 1.4 },
    ];
    for (const ta of titleArsonists) {
      drawArsonist(targetCtx, ta, time);
      if (Math.random() < 0.25) {
        const tip = getArsonistTorchTip(ta, time);
        spawnTorchSpark(tip.x, tip.y);
      }
    }
    // Render torch flame sparks on Title Screen
    for (const p of State.particles) {
      const a = Math.min(1, p.life / (p.maxLife * 0.45));
      targetCtx.globalAlpha = Math.max(0, a);
      targetCtx.fillStyle = p.color;
      targetCtx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    targetCtx.globalAlpha = 1;

    // Hero Rhino & cheering friends in foreground
    drawTiger(targetCtx, 34, LEFT_LEDGE_Y, 'cheer', time);
    drawMonkey(targetCtx, 62, LEFT_LEDGE_Y, 'cheer', time);
    drawSlingshotBack(targetCtx, SLING_REST.x, SLING_REST.y, true);
    drawRhino(targetCtx, 102, LEFT_LEDGE_Y, 'idle', time);
    drawWaterBalloon(targetCtx, SLING_REST.x, SLING_REST.y, 0, 0, time, false);
    drawSlingshotFront(targetCtx, SLING_REST.x, SLING_REST.y, true);

    // Subtle dark vignette behind center logo for crisp readability
    targetCtx.fillStyle = 'rgba(18, 5, 5, 0.48)';
    targetCtx.fillRect(94, 24, 292, 132);
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(94, 24, 292, 2);
    targetCtx.fillRect(94, 154, 292, 2);
    targetCtx.fillRect(94, 24, 2, 132);
    targetCtx.fillRect(384, 24, 2, 132);

    // Giant chunky double-layered "KARHUTLA RESCUE" logo
    const logoBob = Math.round(Math.sin(time * 3) * 2);
    drawLogo(targetCtx, SAFE_W / 2, 34 + logoBob, 3, 'center');

    drawPixelText(targetCtx, 'SAVE THE FOREST FROM WILDFIRES!', SAFE_W / 2, 92, 1, '#ffdd88', PALETTE.outline, 'center');

    // Pulsing "PLAY" arcade button
    const pulse = Math.sin(time * 6) > 0;
    const btnW = 112;
    const btnH = 26;
    const btnX = Math.round(SAFE_W / 2 - btnW / 2);
    const btnY = 110;
    drawPixelButton(
      targetCtx,
      'title_play',
      btnX,
      btnY,
      btnW,
      btnH,
      '',
      pulse ? '#2da820' : '#248f19',
      '#46cf36'
    );
    drawPixelText(targetCtx, 'PLAY', SAFE_W / 2, btnY + 6, 2, '#ffffff', PALETTE.outline, 'center', true);
    registerButton('title_play', btnX, btnY, btnW, btnH, () => startCutscene());

    drawPixelText(targetCtx, 'DRAG & RELEASE TO LAUNCH WATER BALLOONS', SAFE_W / 2, 142, 1, '#d8e9fa', PALETTE.outline, 'center');

    // Mute button on title screen too
    const muteX = 452;
    const muteY = view.hudTop + 8;
    drawPixelButton(targetCtx, 'title_mute', muteX, muteY, 20, 20, '');
    registerButton('title_mute', muteX, muteY, 20, 20, () => SoundFX.toggleMute());
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fillRect(muteX + 4, muteY + 8, 3, 4);
    targetCtx.fillRect(muteX + 7, muteY + 6, 2, 8);
    targetCtx.fillRect(muteX + 9, muteY + 4, 2, 12);
    if (SoundFX.isMuted()) {
      drawPixelLine(targetCtx, muteX + 13, muteY + 7, muteX + 17, muteY + 13, '#ff4d4d', 2);
      drawPixelLine(targetCtx, muteX + 17, muteY + 7, muteX + 13, muteY + 13, '#ff4d4d', 2);
    } else {
      targetCtx.fillStyle = '#8be8ff';
      targetCtx.fillRect(muteX + 13, muteY + 7, 1, 6);
      targetCtx.fillRect(muteX + 15, muteY + 5, 1, 10);
    }
  }

  /**
   * Skippable 3-Act 8-Bit Opening Cutscene (~10.5 seconds):
   * Act 1 (0..3.4s): Peaceful lush jungle, arsonists sneak in with torches.
   * Act 2 (3.4..7.0s): Arsonists ignite the trees, flames spread & sky turns fiery red!
   * Act 3 (7.0..10.5s): Hero Rhino steps forward with determination as Monkey & Tiger cheer!
   */
  function updateCutscene(dt) {
    const prevT = State.cutsceneTime;
    State.cutsceneTime += dt;
    const t = State.cutsceneTime;

    // Trigger cutscene SFX cues at key moments
    if (prevT < 3.4 && t >= 3.4) SoundFX.playIgnite();
    if (prevT < 4.5 && t >= 4.5) SoundFX.playIgnite();
    if (prevT < 7.2 && t >= 7.2) SoundFX.playHeroStep();
    if (prevT < 8.4 && t >= 8.4) SoundFX.playCheer();

    // Spawn rising smoke during burning acts
    if (t >= 3.5 && Math.random() < dt * 10) {
      State.smokeClouds.push({
        x: 295 + Math.random() * 140,
        y: 120 + Math.random() * 20,
        vx: -8 + Math.random() * 14,
        vy: -22 - Math.random() * 16,
        radius: 6 + Math.random() * 6,
        shade: '#3d3635',
        life: 2.2,
        maxLife: 2.2,
      });
    }

    if (t >= 10.6) {
      finishCutscene();
    }
  }

  function drawCutscene(targetCtx, time) {
    const t = State.cutsceneTime;
    const isBurning = t >= 3.5;

    // Sky transitions from peaceful forest blue to burning wildfire red
    drawBackground(targetCtx, time, isBurning ? 1.0 : 0.0);
    drawTerrain(targetCtx, LEVELS[0].cliffs);

    // Trees on right cliff
    const treeXs = [294, 384, 454];
    for (let i = 0; i < treeXs.length; i++) {
      const igniteAt = 3.4 + i * 0.75;
      const lit = t >= igniteAt;
      const spr = lit ? Sprites.treeBurning : Sprites.treeHealthy;
      targetCtx.drawImage(spr, Math.round(treeXs[i] - 33), Math.round(198 - 83));
      if (lit) {
        const grow = Math.min(1.05, (t - igniteAt) * 1.4);
        drawPixelFire(targetCtx, treeXs[i], 198 - 54, grow, time, i * 2.1);
      }
    }
    if (t >= 4.4) {
      drawPixelFire(targetCtx, 318, 198, Math.min(0.95, (t - 4.4) * 1.2), time, 9.1);
    }

    // Arsonists sneaking in (Act 1), igniting (Act 2), fleeing (Act 2-3) — always carrying lit torches!
    if (t < 3.4) {
      const p = t / 3.4;
      const ax1 = 472 - p * 145;
      const ax2 = 505 - p * 115;
      const c1 = { x: ax1, y: 198, variant: 0, dir: -1, panicTimer: 0, fled: false, animPhase: 0 };
      const c2 = { x: ax2, y: 198, variant: 1, dir: -1, panicTimer: 0, fled: false, animPhase: 1 };
      drawArsonist(targetCtx, c1, time);
      drawArsonist(targetCtx, c2, time);
      if (Math.random() < 0.35) {
        const tip1 = getArsonistTorchTip(c1, time);
        const tip2 = getArsonistTorchTip(c2, time);
        spawnTorchSpark(tip1.x, tip1.y);
        spawnTorchSpark(tip2.x, tip2.y);
      }
    } else if (t < 6.8) {
      const p = (t - 3.4) / 3.4;
      const ax1 = 327 + p * 130;
      const ax2 = 390 + p * 110;
      const c1 = { x: ax1, y: 198, variant: 0, dir: 1, panicTimer: 1, fled: false, animPhase: 0 };
      const c2 = { x: ax2, y: 198, variant: 1, dir: 1, panicTimer: 1, fled: false, animPhase: 1 };
      drawArsonist(targetCtx, c1, time);
      drawArsonist(targetCtx, c2, time);
      if (Math.random() < 0.35) {
        const tip1 = getArsonistTorchTip(c1, time);
        const tip2 = getArsonistTorchTip(c2, time);
        spawnTorchSpark(tip1.x, tip1.y);
        spawnTorchSpark(tip2.x, tip2.y);
      }
    }

    // Torch flame spark particles during cutscene
    for (const p of State.particles) {
      const a = Math.min(1, p.life / (p.maxLife * 0.45));
      targetCtx.globalAlpha = Math.max(0, a);
      targetCtx.fillStyle = p.color;
      targetCtx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    targetCtx.globalAlpha = 1;

    // Slingshot stands ready on left ledge
    drawSlingshotBack(targetCtx, SLING_REST.x, SLING_REST.y, t >= 8.2);

    // Act 3: Hero Pixel Rhino steps forward with determination while Tiger & Monkey cheer!
    if (t >= 6.4) {
      const march = Math.min(1, (t - 6.4) / 1.8);
      const rhinoX = -32 + march * 134; // marches in to x = 102
      const tigerX = -65 + march * 99;  // marches in to x = 34
      const monkeyX = -50 + march * 112; // leaps in to x = 62
      const squadMood = t >= 8.2 ? 'cheer' : 'idle';

      drawTiger(targetCtx, tigerX, LEFT_LEDGE_Y, squadMood, time);
      drawMonkey(targetCtx, monkeyX, LEFT_LEDGE_Y, squadMood, time);
      drawRhino(targetCtx, rhinoX, LEFT_LEDGE_Y, t >= 8.4 ? 'pull' : 'idle', time);
      if (t >= 8.2) {
        drawWaterBalloon(targetCtx, SLING_REST.x, SLING_REST.y, 0, 0, time, false);
      }
    }

    drawSlingshotFront(targetCtx, SLING_REST.x, SLING_REST.y, t >= 8.2);

    // Retro cinematic letterbox caption bar at top
    const barY = view.hudTop + 6;
    targetCtx.fillStyle = 'rgba(12, 8, 10, 0.78)';
    targetCtx.fillRect(10, barY, 376, 26);
    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(10, barY, 376, 1);
    targetCtx.fillRect(10, barY + 25, 376, 1);

    let caption = 'ARSONISTS SNEAK INTO THE PEACEFUL JUNGLE...';
    if (t >= 3.4 && t < 6.8) caption = 'OH NO! THEY SET THE FOREST ABLAZE!';
    else if (t >= 6.8) caption = 'HERO RHINO & FRIENDS STEP UP TO SAVE THE FOREST!';
    drawPixelText(targetCtx, caption, 198, barY + 9, 1, '#fff259', PALETTE.outline, 'center');

    // Crisp "SKIP >>" button top-right
    const skipX = 398;
    const skipY = barY + 2;
    drawPixelButton(targetCtx, 'cutscene_skip', skipX, skipY, 74, 22, 'SKIP >>', '#8f5425', '#c47a3b');
    registerButton('cutscene_skip', skipX, skipY, 74, 22, () => finishCutscene());
  }

  function drawModalOverlay(targetCtx, time) {
    // Dark translucent retro screen dim
    const minX = -view.offsetX;
    const minY = -view.offsetY;
    targetCtx.fillStyle = 'rgba(10, 4, 6, 0.70)';
    targetCtx.fillRect(minX, minY, view.canvasW, view.canvasH);

    // Wooden-framed retro arcade panel
    const pw = 250;
    const ph = 158;
    const px = Math.round(SAFE_W / 2 - pw / 2);
    const py = Math.round(SAFE_H / 2 - ph / 2);

    targetCtx.fillStyle = PALETTE.outline;
    targetCtx.fillRect(px - 3, py - 3, pw + 6, ph + 6);
    targetCtx.fillStyle = '#5c3111';
    targetCtx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
    targetCtx.fillStyle = '#241410';
    targetCtx.fillRect(px + 3, py + 3, pw - 6, ph - 6);
    targetCtx.fillStyle = '#b37138';
    targetCtx.fillRect(px, py, pw, 2);

    if (State.mode === 'PAUSED') {
      drawPixelText(targetCtx, 'PAUSED', SAFE_W / 2, py + 18, 2, '#fff259', PALETTE.outline, 'center', true);
      drawPixelText(targetCtx, LEVELS[State.levelIndex].name, SAFE_W / 2, py + 44, 1, '#d8e9fa', PALETTE.outline, 'center');

      drawPixelButton(targetCtx, 'modal_resume', SAFE_W / 2 - 58, py + 62, 116, 22, 'RESUME', '#2da820', '#46cf36');
      registerButton('modal_resume', SAFE_W / 2 - 58, py + 62, 116, 22, () => {
        SoundFX.playClick();
        State.mode = 'PLAYING';
      });

      drawPixelButton(targetCtx, 'modal_restart', SAFE_W / 2 - 58, py + 92, 116, 22, 'RESTART LEVEL', '#8f5425', '#b8763e');
      registerButton('modal_restart', SAFE_W / 2 - 58, py + 92, 116, 22, () => {
        SoundFX.playClick();
        State.score = Math.max(0, State.score - State.levelScore);
        loadLevel(State.levelIndex, true);
        State.mode = 'PLAYING';
      });

      drawPixelButton(targetCtx, 'modal_title', SAFE_W / 2 - 58, py + 122, 116, 22, 'TITLE SCREEN', '#6b2820', '#963b30');
      registerButton('modal_title', SAFE_W / 2 - 58, py + 122, 116, 22, () => {
        SoundFX.playClick();
        State.mode = 'TITLE';
      });
    } else if (State.mode === 'VICTORY') {
      const isFinal = State.levelIndex >= LEVELS.length - 1;
      const heading = isFinal ? 'ALL FORESTS SAVED!' : 'FOREST SAVED!';
      drawPixelText(targetCtx, heading, SAFE_W / 2, py + 14, 2, '#68df39', PALETTE.outline, 'center', true);

      // 3 Pixel Stars
      for (let i = 0; i < 3; i++) {
        const starSprite = i < State.starsEarned ? Sprites.starGold : Sprites.starEmpty;
        const bounce = i < State.starsEarned ? Math.round(Math.sin(time * 6 + i) * 2) : 0;
        targetCtx.drawImage(starSprite, SAFE_W / 2 - 36 + i * 28, py + 40 + bounce);
      }

      drawPixelText(targetCtx, 'LEVEL SCORE: ' + State.levelScore, SAFE_W / 2, py + 68, 1, '#ffffff', PALETTE.outline, 'center');
      drawPixelText(targetCtx, 'WATER BONUS: +' + (State.ammo * 150), SAFE_W / 2, py + 82, 1, '#8be8ff', PALETTE.outline, 'center');
      drawPixelText(targetCtx, 'TOTAL SCORE: ' + State.score, SAFE_W / 2, py + 98, 1, '#fff259', PALETTE.outline, 'center', true);

      const btnLabel = isFinal ? 'PLAY AGAIN' : 'NEXT LEVEL';
      drawPixelButton(targetCtx, 'modal_next', SAFE_W / 2 - 64, py + 120, 128, 24, btnLabel, '#2da820', '#46cf36');
      registerButton('modal_next', SAFE_W / 2 - 64, py + 120, 128, 24, () => {
        SoundFX.playClick();
        if (isFinal) {
          loadLevel(0, false);
        } else {
          loadLevel(State.levelIndex + 1, true);
        }
        State.mode = 'PLAYING';
      });
    } else if (State.mode === 'GAMEOVER') {
      drawPixelText(targetCtx, 'OUT OF WATER!', SAFE_W / 2, py + 18, 2, '#ff5938', PALETTE.outline, 'center', true);
      drawPixelText(
        targetCtx,
        State.firesRemaining + (State.firesRemaining === 1 ? ' FIRE STILL BURNING!' : ' FIRES STILL BURNING!'),
        SAFE_W / 2,
        py + 52,
        1,
        '#ffd724',
        PALETTE.outline,
        'center'
      );
      drawPixelText(targetCtx, 'SCORE: ' + State.score, SAFE_W / 2, py + 72, 1, '#ffffff', PALETTE.outline, 'center', true);

      drawPixelButton(targetCtx, 'modal_retry', SAFE_W / 2 - 60, py + 94, 120, 24, 'TRY AGAIN', '#c94318', '#eb6328');
      registerButton('modal_retry', SAFE_W / 2 - 60, py + 94, 120, 24, () => {
        SoundFX.playClick();
        State.score = Math.max(0, State.score - State.levelScore);
        loadLevel(State.levelIndex, true);
        State.mode = 'PLAYING';
      });

      drawPixelButton(targetCtx, 'modal_title2', SAFE_W / 2 - 60, py + 124, 120, 20, 'TITLE SCREEN', '#633517', '#8a4c23');
      registerButton('modal_title2', SAFE_W / 2 - 60, py + 124, 120, 20, () => {
        SoundFX.playClick();
        State.mode = 'TITLE';
      });
    }
  }

  // ==========================================================================
  // 13. COLLISION DETECTION & PHYSICS UPDATE
  // ==========================================================================
  /**
   * Returns the top grass Y coordinate of solid terrain directly at world X,
   * or null if X is over the open chasm.
   */
  function getTerrainSurfaceY(x) {
    if (x <= LEFT_LEDGE_X) {
      return LEFT_LEDGE_Y;
    }
    let bestY = null;
    for (const c of State.cliffs) {
      const rightEdge = c.isRightEdge ? SAFE_W + 400 : c.x + c.w;
      if (x >= c.x && x <= rightEdge) {
        if (bestY === null || c.y < bestY) bestY = c.y;
      }
    }
    return bestY;
  }

  /**
   * Returns the highest supporting surface Y (terrain grass or solid obstacle top)
   * across a human character's footprint [x - halfW, x + halfW].
   */
  function getHumanSupportY(x, footY) {
    const samples = [x - 5, x, x + 5];
    let supportY = null;

    for (const sx of samples) {
      const ty = getTerrainSurfaceY(sx);
      if (ty !== null && footY <= ty + 8) {
        if (supportY === null || ty < supportY) supportY = ty;
      }
      // Also allow standing on top of solid obstacles without clipping through them
      for (const obs of State.obstacles) {
        if (!obs.alive) continue;
        if (sx >= obs.x && sx <= obs.x + obs.w && footY <= obs.y + 8) {
          if (supportY === null || obs.y < supportY) supportY = obs.y;
        }
      }
    }

    // Hard safety floor: if a foot sample is somehow already below solid terrain, push back onto surface!
    if (supportY === null) {
      for (const sx of samples) {
        const ty = getTerrainSurfaceY(sx);
        if (ty !== null) {
          if (supportY === null || ty < supportY) supportY = ty;
        }
      }
    }
    return supportY;
  }

  /**
   * Updates human arsonists with full ground/wall collision physics so they
   * stay firmly on top of terrain surfaces, never clip through dirt/rock blocks,
   * and continuously emit flickering flame sparks from their lit torches.
   */
  function updateArsonists(dt) {
    const HALF_W = 6;
    const STEP_UP_MAX = 4;

    for (const a of State.arsonists) {
      if (a.fled) continue;
      if (a.panicTimer > 0) a.panicTimer = Math.max(0, a.panicTimer - dt);

      const isFleeing = a.panicTimer > 0 || State.firesRemaining <= 1;
      const speed = isFleeing ? 60 : 22;

      if (isFleeing) {
        a.dir = 1;
      } else {
        if (a.x > Math.min(SAFE_W - 10, a.homeX + 20)) a.dir = -1;
        if (a.x < a.homeX - 18) a.dir = 1;
      }

      // 1) Horizontal movement with solid cliff-wall & obstacle collision
      const nextX = a.x + a.dir * speed * dt;
      const leadX = nextX + a.dir * HALF_W;
      const leadGroundY = getTerrainSurfaceY(leadX);

      let blockedHorizontally = false;

      // Prevent walking off into the open chasm
      if (leadGroundY === null) {
        blockedHorizontally = true;
        a.dir = 1;
      } else if (leadGroundY < a.y - STEP_UP_MAX) {
        // Solid higher cliff / dirt / rock wall ahead — NEVER pass through dirt/rock!
        blockedHorizontally = true;
        if (isFleeing && a.onGround) {
          // Scramble/leap upward cleanly onto the higher cliff ridge
          a.vy = -225;
          a.onGround = false;
        } else if (!isFleeing) {
          a.dir *= -1;
        }
      }

      // Check solid rock boulders & wooden barricades
      if (!blockedHorizontally) {
        for (const obs of State.obstacles) {
          if (!obs.alive) continue;
          const overlapsX = nextX + HALF_W > obs.x && nextX - HALF_W < obs.x + obs.w;
          const overlapsY = a.y > obs.y + STEP_UP_MAX && a.y - 26 < obs.y + obs.h;
          if (overlapsX && overlapsY) {
            blockedHorizontally = true;
            if (isFleeing && a.onGround) {
              a.vy = -210;
              a.onGround = false;
            } else if (!isFleeing) {
              a.dir *= -1;
            }
            break;
          }
        }
      }

      if (!blockedHorizontally) {
        a.x = nextX;
      }

      // 2) Vertical gravity & strict ground collision clamping
      const prevY = a.y;
      a.vy = (a.vy || 0) + GRAVITY * 1.2 * dt;
      a.y += a.vy * dt;

      const supportY = getHumanSupportY(a.x, prevY);
      if (supportY !== null && a.y >= supportY) {
        a.y = supportY;
        a.vy = 0;
        a.onGround = true;
      } else if (supportY !== null && a.onGround && Math.abs(a.y - supportY) <= 6) {
        a.y = supportY;
        a.vy = 0;
      } else {
        a.onGround = false;
      }

      // Emit flickering pixel flame sparks from their lit torch tip
      if (Math.random() < dt * 14) {
        const tip = getArsonistTorchTip(a, State.time);
        spawnTorchSpark(tip.x, tip.y);
      }

      // Remove arsonist once they sprint safely past the right screen edge
      if (isFleeing && a.x > SAFE_W + view.offsetX + 34) {
        a.fled = true;
      }
    }
  }

  function hitTestTerrain(x, y, r) {
    // Left player ledge
    if (x - r <= LEFT_LEDGE_X && y + r >= LEFT_LEDGE_Y) {
      return true;
    }
    // Right target cliffs
    for (const c of State.cliffs) {
      const cw = c.isRightEdge ? 400 : c.w;
      if (x + r >= c.x && x - r <= c.x + cw && y + r >= c.y) {
        return true;
      }
    }
    return false;
  }

  function burstBalloon(bx, by) {
    if (!State.balloon) return;
    State.balloon = null;
    State.screenShake = 0.22;
    SoundFX.playSplash();
    spawnWaterSplash(bx, by);

    let extinguishedNow = 0;

    // Extinguish every active fire within blast splash radius
    for (const f of State.fires) {
      if (!f.active) continue;
      const dist = Math.hypot(f.x - bx, f.y - by);
      if (dist <= SPLASH_RADIUS + f.radius * 0.5) {
        f.active = false;
        extinguishedNow++;
        State.firesRemaining--;
        State.score += 100;
        State.levelScore += 100;
        spawnSteamBurst(f.x, f.y);
        addPopup('+100', f.x, f.y - 16, '#8be8ff');

        if (f.treeId >= 0) {
          const tree = State.trees[f.treeId];
          if (tree && !State.fires.some((other) => other.treeId === tree.id && other.active)) {
            tree.burning = false;
            tree.savedFlash = 1.6;
          }
        }
      }
    }

    // Panic nearby arsonists when water explodes near them!
    for (const a of State.arsonists) {
      if (!a.fled && Math.hypot(a.x - bx, a.y - 14 - by) < 120) {
        a.panicTimer = 2.4;
        a.dir = 1;
      }
    }

    if (extinguishedNow > 0) {
      SoundFX.playExtinguish();
      SoundFX.playCheer(); // Synced Monkey chatter chirps + Tiger retro growl/roar chime
      State.squadMood = 'cheer';
      State.moodTimer = 2.2;
      State.cheerTime = 0;

      if (extinguishedNow >= 2) {
        const bonus = extinguishedNow * 50;
        State.score += bonus;
        State.levelScore += bonus;
        addPopup('COMBO +' + bonus + '!', bx, by - 28, '#fff259');
      }
    } else {
      SoundFX.playMiss();
      State.squadMood = 'worry';
      State.moodTimer = 1.4;
    }

    State.settleTimer = 0.72;
  }

  function updateGameplay(dt) {
    // Update active water balloon projectile
    if (State.balloon) {
      const b = State.balloon;
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Subtle trailing water droplets
      if (Math.random() < dt * 28) {
        State.particles.push({
          kind: 'water',
          x: b.x + (Math.random() - 0.5) * 4,
          y: b.y + (Math.random() - 0.5) * 4,
          vx: -b.vx * 0.08,
          vy: 15,
          gravity: 160,
          size: 2,
          color: PALETTE.waterCyan,
          life: 0.25,
          maxLife: 0.25,
        });
      }

      // Check collision with active fires
      let impacted = false;
      for (const f of State.fires) {
        if (!f.active) continue;
        if (Math.hypot(b.x - f.x, b.y - f.y) <= f.radius + BALLOON_RADIUS) {
          impacted = true;
          break;
        }
      }

      // Check collision with obstacles (wood barricades & rocks)
      if (!impacted) {
        for (const obs of State.obstacles) {
          if (!obs.alive) continue;
          if (
            b.x + BALLOON_RADIUS >= obs.x &&
            b.x - BALLOON_RADIUS <= obs.x + obs.w &&
            b.y + BALLOON_RADIUS >= obs.y &&
            b.y - BALLOON_RADIUS <= obs.y + obs.h
          ) {
            impacted = true;
            if (obs.type === 'wood') {
              obs.hp--;
              SoundFX.playWoodHit();
              spawnWoodSplinters(obs.x, obs.y, obs.w, obs.h);
              if (obs.hp <= 0) {
                obs.alive = false;
                State.score += 30;
                State.levelScore += 30;
                addPopup('+30', obs.x + obs.w / 2, obs.y, '#ffd724');
              }
            } else {
              SoundFX.playRockHit();
            }
            break;
          }
        }
      }

      // Check collision with terrain cliffs
      if (!impacted && hitTestTerrain(b.x, b.y, BALLOON_RADIUS)) {
        impacted = true;
      }

      // Out of bounds (fell into cavern or flew way off-screen)
      const outRight = b.x > SAFE_W + view.offsetX + 40;
      const outBottom = b.y > SAFE_H + 35;
      const outLeft = b.x < -view.offsetX - 40;

      if (impacted) {
        burstBalloon(b.x, b.y);
      } else if (outRight || outBottom || outLeft) {
        State.balloon = null;
        SoundFX.playMiss();
        State.squadMood = 'worry';
        State.moodTimer = 1.2;
        State.settleTimer = 0.55;
      }
    } else if (State.settleTimer > 0) {
      State.settleTimer -= dt;
      if (State.settleTimer <= 0) {
        if (State.firesRemaining <= 0) {
          // Victory!
          const bonus = State.ammo * 150;
          State.score += bonus;
          State.levelScore += bonus;
          State.starsEarned = State.ammo >= 2 ? 3 : (State.ammo >= 1 ? 2 : 1);
          State.squadMood = 'cheer';
          State.moodTimer = 99;
          State.mode = 'VICTORY';
          SoundFX.playVictoryFanfare();
        } else if (State.ammo <= 0) {
          // Game Over!
          State.squadMood = 'worry';
          State.moodTimer = 99;
          State.mode = 'GAMEOVER';
          SoundFX.playGameOver();
        }
      }
    }

    // Update squad mood timer & synced cheer jump clock
    if (State.squadMood === 'cheer') {
      State.cheerTime += dt;
    }
    if (State.moodTimer > 0 && State.mode === 'PLAYING') {
      State.moodTimer -= dt;
      if (State.moodTimer <= 0) {
        State.squadMood = 'idle';
      }
    }

    // Update saved tree sparkles
    for (const tree of State.trees) {
      if (tree.savedFlash > 0) tree.savedFlash = Math.max(0, tree.savedFlash - dt);
    }

    // Update fleeing arsonists with full ground & terrain collision physics
    updateArsonists(dt);

    // Emit billowing pixel smoke from active fires
    for (const f of State.fires) {
      if (!f.active) continue;
      if (Math.random() < dt * 4.5) {
        State.smokeClouds.push({
          x: f.x + (Math.random() - 0.5) * 14,
          y: f.y - 12,
          vx: -6 + Math.random() * 14,
          vy: -18 - Math.random() * 18,
          radius: 5 + Math.random() * 6,
          shade: Math.random() < 0.5 ? '#3b3332' : '#524947',
          life: 1.8 + Math.random() * 1.1,
          maxLife: 2.9,
        });
      }
    }
  }

  function updateAmbientAndParticles(dt) {
    // Embers drift upward across sky
    const minX = -view.offsetX - 20;
    const maxX = view.canvasW - view.offsetX + 20;
    const minY = -view.offsetY - 10;
    for (const e of State.embers) {
      e.x += e.vx * dt + Math.sin(State.time * 2 + e.phase) * 6 * dt;
      e.y += e.vy * dt;
      if (e.y < minY) {
        e.y = SAFE_H - 10;
        e.x = minX + Math.random() * (maxX - minX);
      }
      if (e.x < minX) e.x = maxX;
      if (e.x > maxX) e.x = minX;
    }

    // Smoke clouds rise and expand
    for (let i = State.smokeClouds.length - 1; i >= 0; i--) {
      const s = State.smokeClouds[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.radius += dt * 4.2;
      s.life -= dt;
      if (s.life <= 0) State.smokeClouds.splice(i, 1);
    }

    // Splash stars
    for (let i = State.splashes.length - 1; i >= 0; i--) {
      const sp = State.splashes[i];
      sp.age += dt;
      if (sp.age >= sp.duration) State.splashes.splice(i, 1);
    }

    // Water, steam & wood particles
    for (let i = State.particles.length - 1; i >= 0; i--) {
      const p = State.particles[i];
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) State.particles.splice(i, 1);
    }

    // Floating score popups
    for (let i = State.popups.length - 1; i >= 0; i--) {
      const pop = State.popups[i];
      pop.y += pop.vy * dt;
      pop.life -= dt;
      if (pop.life <= 0) State.popups.splice(i, 1);
    }

    // Screen shake & level banner decay
    if (State.screenShake > 0) {
      State.screenShake = Math.max(0, State.screenShake - dt);
    }
    if (State.levelBannerTimer > 0 && State.mode === 'PLAYING') {
      State.levelBannerTimer = Math.max(0, State.levelBannerTimer - dt);
    }

    // Continuous billowing pixel smoke on Title Screen diorama
    if (State.mode === 'TITLE' && Math.random() < dt * 7) {
      const tx = LEVELS[0].trees[Math.floor(Math.random() * LEVELS[0].trees.length)].x;
      State.smokeClouds.push({
        x: tx + (Math.random() - 0.5) * 16,
        y: 128,
        vx: -4 + Math.random() * 12,
        vy: -18 - Math.random() * 16,
        radius: 6 + Math.random() * 6,
        shade: Math.random() < 0.5 ? '#3b3332' : '#524947',
        life: 2.2,
        maxLife: 2.2,
      });
    }
  }

  // ==========================================================================
  // 14. MAIN RENDER PIPELINE
  // ==========================================================================
  function render() {
    ctx.imageSmoothingEnabled = false;
    State.buttons = []; // rebuilt cleanly each frame

    ctx.save();
    let shakeX = 0;
    let shakeY = 0;
    if (State.screenShake > 0) {
      const mag = State.screenShake * 14;
      shakeX = Math.round((Math.random() - 0.5) * mag);
      shakeY = Math.round((Math.random() - 0.5) * mag);
    }
    ctx.translate(view.offsetX + shakeX, view.offsetY + shakeY);

    if (State.mode === 'TITLE') {
      drawTitleScreen(ctx, State.time);
    } else if (State.mode === 'CUTSCENE') {
      drawCutscene(ctx, State.time);
    } else {
      // Gameplay World (also rendered live behind PAUSED / VICTORY / GAMEOVER)
      drawBackground(ctx, State.time, 1.0);
      drawTerrain(ctx, State.cliffs);

      // Obstacles (wood barricades & boulders)
      for (const obs of State.obstacles) {
        drawObstacle(ctx, obs);
      }

      // Burning & saved trees
      for (const tree of State.trees) {
        drawBurningTree(ctx, tree, State.time);
      }

      // Roaring pixel fires
      for (const f of State.fires) {
        if (!f.active) continue;
        const scale = f.type === 'crown' ? 1.05 : 0.9;
        drawPixelFire(ctx, f.x, f.y + (f.type === 'crown' ? 8 : 6), scale, State.time, f.seed);
      }

      // Fleeing arsonists
      for (const a of State.arsonists) {
        drawArsonist(ctx, a, State.time);
      }

      // Hero squad (Tiger, Monkey, Rhino) + Slingshot with proper 3D layering
      const hasLoadedBalloon = !State.balloon && State.ammo > 0 && State.settleTimer <= 0 && State.mode === 'PLAYING';
      const pouchX = State.aiming ? State.pullX : SLING_REST.x;
      const pouchY = State.aiming ? State.pullY : SLING_REST.y;
      const rhinoPose = State.aiming ? 'pull' : (State.squadMood === 'cheer' ? 'cheer' : 'idle');

      drawTiger(ctx, 34, LEFT_LEDGE_Y, State.squadMood, State.time);
      drawMonkey(ctx, 62, LEFT_LEDGE_Y, State.squadMood, State.time);
      drawSlingshotBack(ctx, pouchX, pouchY, hasLoadedBalloon);
      drawRhino(ctx, 102, LEFT_LEDGE_Y, rhinoPose, State.time);

      // Trajectory preview dots while aiming
      if (State.aiming && State.mode === 'PLAYING') {
        drawTrajectoryArc(ctx);
      }

      // Loaded water balloon inside slingshot pouch
      if (hasLoadedBalloon) {
        drawWaterBalloon(ctx, pouchX, pouchY, 0, 0, State.time, false);
      }

      drawSlingshotFront(ctx, pouchX, pouchY, hasLoadedBalloon);

      // Flying water balloon
      if (State.balloon) {
        drawWaterBalloon(ctx, State.balloon.x, State.balloon.y, State.balloon.vx, State.balloon.vy, State.time, true);
      }

      // Water splash burst stars
      drawSplashes(ctx);

      // Particles (water droplets, steam puffs, wood splinters)
      for (const p of State.particles) {
        const a = Math.min(1, p.life / (p.maxLife * 0.45));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // Floating pixel score popups
      for (const pop of State.popups) {
        const a = Math.min(1, pop.life / 0.35);
        ctx.globalAlpha = Math.max(0, a);
        drawPixelText(ctx, pop.text, pop.x, pop.y, 1, pop.color, PALETTE.outline, 'center', true);
      }
      ctx.globalAlpha = 1;

      // Aiming prompt on Level 1 before first shot
      if (State.mode === 'PLAYING' && State.levelIndex === 0 && State.ammo === State.maxAmmo && !State.aiming && !State.balloon) {
        const bob = Math.round(Math.sin(State.time * 5) * 2);
        drawPixelText(ctx, 'DRAG BACK TO AIM!', 130, 118 + bob, 1, '#fff259', PALETTE.outline, 'center');
      }

      // Level start banner toast
      if (State.mode === 'PLAYING' && State.levelBannerTimer > 0) {
        const alpha = Math.min(1, State.levelBannerTimer * 1.4);
        ctx.globalAlpha = alpha;
        drawPixelText(ctx, LEVELS[State.levelIndex].name, SAFE_W / 2, 54, 1, '#fff259', PALETTE.outline, 'center', true);
        ctx.globalAlpha = 1;
      }

      // Retro Arcade HUD Bar
      drawHUD(ctx, State.time);

      // Modal overlays (Paused, Victory, Game Over)
      if (State.mode === 'PAUSED' || State.mode === 'VICTORY' || State.mode === 'GAMEOVER') {
        drawModalOverlay(ctx, State.time);
      }
    }

    ctx.restore();
  }

  // ==========================================================================
  // 15. POINTER (DESKTOP MOUSE + MOBILE TOUCH) & KEYBOARD INPUT
  // ==========================================================================
  function findButtonAt(wx, wy) {
    for (let i = State.buttons.length - 1; i >= 0; i--) {
      const b = State.buttons[i];
      if (wx >= b.x - 3 && wx <= b.x + b.w + 3 && wy >= b.y - 3 && wy <= b.y + b.h + 3) {
        return b;
      }
    }
    return null;
  }

  function clampPull(wx, wy) {
    let dx = wx - SLING_ANCHOR.x;
    let dy = wy - SLING_ANCHOR.y;
    // Prevent awkward forward pull past the front prong
    if (dx > 12) dx = 12;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_PULL) {
      dx = (dx / dist) * MAX_PULL;
      dy = (dy / dist) * MAX_PULL;
    }
    return { x: SLING_ANCHOR.x + dx, y: SLING_ANCHOR.y + dy, ratio: Math.min(1, dist / MAX_PULL) };
  }

  function handlePointerDown(clientX, clientY) {
    SoundFX.unlock();
    const pt = screenToWorld(clientX, clientY);

    // Check UI buttons first
    const btn = findButtonAt(pt.x, pt.y);
    if (btn) {
      btn.action();
      return;
    }

    // Slingshot grab during active gameplay
    if (State.mode === 'PLAYING' && !State.balloon && State.ammo > 0 && State.settleTimer <= 0) {
      const nearSlingshot =
        Math.hypot(pt.x - SLING_ANCHOR.x, pt.y - SLING_ANCHOR.y) <= 78 ||
        (pt.x >= 55 && pt.x <= 205 && pt.y >= 115 && pt.y <= 240);
      if (nearSlingshot) {
        State.aiming = true;
        const clamped = clampPull(pt.x, pt.y);
        State.pullX = clamped.x;
        State.pullY = clamped.y;
        SoundFX.playStretch(clamped.ratio);
      }
    }
  }

  function handlePointerMove(clientX, clientY) {
    const pt = screenToWorld(clientX, clientY);
    const btn = findButtonAt(pt.x, pt.y);
    State.hoverButtonId = btn ? btn.id : null;
    canvas.style.cursor = btn || State.aiming ? 'pointer' : 'crosshair';

    if (State.aiming && State.mode === 'PLAYING') {
      const clamped = clampPull(pt.x, pt.y);
      State.pullX = clamped.x;
      State.pullY = clamped.y;
      if (clamped.ratio > 0.15) {
        SoundFX.playStretch(clamped.ratio);
      }
    }
  }

  function handlePointerUp() {
    if (!State.aiming) return;
    State.aiming = false;

    const dx = SLING_ANCHOR.x - State.pullX;
    const dy = SLING_ANCHOR.y - State.pullY;
    const dist = Math.hypot(dx, dy);

    // Cancel shot if barely pulled
    if (dist < 8 || State.mode !== 'PLAYING' || State.ammo <= 0) {
      State.pullX = SLING_ANCHOR.x;
      State.pullY = SLING_ANCHOR.y;
      return;
    }

    const ratio = Math.min(1, dist / MAX_PULL);
    const speed = ratio * MAX_LAUNCH_SPEED;
    const angle = Math.atan2(dy, dx);

    State.ammo--;
    State.balloon = {
      x: State.pullX,
      y: State.pullY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
    State.pullX = SLING_ANCHOR.x;
    State.pullY = SLING_ANCHOR.y;
    SoundFX.playLaunch();
  }

  // Unified Pointer Events (smooth on both desktop mouse and mobile touch)
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    handlePointerDown(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    handlePointerMove(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    handlePointerUp();
  });

  canvas.addEventListener('pointercancel', () => {
    State.aiming = false;
    State.pullX = SLING_ANCHOR.x;
    State.pullY = SLING_ANCHOR.y;
  });

  // Keyboard shortcuts for extra polish
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      SoundFX.toggleMute();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (State.mode === 'PLAYING') State.mode = 'PAUSED';
      else if (State.mode === 'PAUSED') State.mode = 'PLAYING';
      else if (State.mode === 'CUTSCENE') finishCutscene();
    } else if (e.key === 'r' || e.key === 'R') {
      if (State.mode === 'PLAYING' || State.mode === 'PAUSED' || State.mode === 'GAMEOVER') {
        State.score = Math.max(0, State.score - State.levelScore);
        loadLevel(State.levelIndex, true);
        State.mode = 'PLAYING';
      }
    } else if (e.key === ' ' || e.key === 'Enter') {
      SoundFX.unlock();
      if (State.mode === 'TITLE') startCutscene();
      else if (State.mode === 'CUTSCENE') finishCutscene();
    }
  });

  // ==========================================================================
  // 16. 60 FPS DELTA-TIME ANIMATION LOOP
  // ==========================================================================
  let lastTimestamp = performance.now();

  function gameLoop(timestamp) {
    const rawDt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    const isPaused = State.mode === 'PAUSED';
    const isBurning =
      State.mode === 'TITLE' ||
      (State.mode === 'CUTSCENE' && State.cutsceneTime >= 3.4) ||
      ((State.mode === 'PLAYING' || State.mode === 'GAMEOVER') && State.firesRemaining > 0);
    SoundFX.updateAmbient(dt, isBurning, isPaused);

    if (!isPaused) {
      State.time += dt;
      updateAmbientAndParticles(dt);

      if (State.mode === 'CUTSCENE') {
        updateCutscene(dt);
      } else if (State.mode === 'PLAYING') {
        updateGameplay(dt);
      }
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  // Boot directly onto the retro Title Screen
  loadLevel(0, false);
  State.mode = 'TITLE';
  requestAnimationFrame(gameLoop);
})();
