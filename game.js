/* ============================================================================
   KARHUTLA RESCUE — 8-Bit Pixel Art Physics Slingshot Game
   Tech Stack: Pure HTML5 Canvas, Vanilla JS (ES6+), Web Audio API
   Zero external assets: procedural 2D pixel sprite matrices & chiptune synth
   ============================================================================ */

(() => {
  'use strict';

  // ==========================================================================
  // 1. CONSTANTS & GAME CONFIGURATION
  // ==========================================================================
  const LOGICAL_W = 480;
  const LOGICAL_H = 270;

  const PHYSICS = {
    GRAVITY: 280,         // px / s^2
    MAX_PULL: 44,         // max slingshot pull distance in logical px
    MIN_PULL: 7,          // pull deadzone (cancels shot if released closer)
    POWER_SCALE: 8.6,     // velocity multiplier per px of pull
    SPLASH_RADIUS: 36,    // blast radius of water balloon splash
    SUBSTEPS: 4           // physics substeps per frame to prevent tunneling
  };

  const SLING_ANCHOR = { x: 104, y: 178 };
  const HERO_LEDGE_Y = 204;

  const STATE = {
    TITLE: 'TITLE',
    CUTSCENE: 'CUTSCENE',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    VICTORY: 'VICTORY',
    GAMEOVER: 'GAMEOVER'
  };

  // ==========================================================================
  // 2. 8-BIT BITMAP PIXEL FONT (3x5 / 5x5 CRISP GLYPHS FOR IN-CANVAS TEXT)
  // ==========================================================================
  const PIXEL_FONT = {
    A: ['010', '101', '111', '101', '101'],
    B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'],
    D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'],
    F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'],
    H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'],
    J: ['001', '001', '001', '101', '010'],
    K: ['101', '101', '110', '101', '101'],
    L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'],
    N: ['110', '101', '101', '101', '101'],
    O: ['010', '101', '101', '101', '010'],
    P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '111', '011'],
    R: ['110', '101', '110', '101', '101'],
    S: ['011', '100', '010', '001', '110'],
    T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'],
    V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'],
    X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'],
    Z: ['111', '001', '010', '100', '111'],
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['110', '001', '010', '100', '111'],
    '3': ['110', '001', '010', '001', '110'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '110', '001', '110'],
    '6': ['011', '100', '111', '101', '111'],
    '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '110'],
    '!': ['010', '010', '010', '000', '010'],
    '?': ['110', '001', '010', '000', '010'],
    '.': ['000', '000', '000', '000', '010'],
    ',': ['000', '000', '000', '010', '100'],
    ':': ['000', '010', '000', '010', '000'],
    '-': ['000', '000', '111', '000', '000'],
    '+': ['000', '010', '111', '010', '000'],
    '/': ['001', '001', '010', '100', '100'],
    '%': ['101', '001', '010', '100', '101'],
    '&': ['010', '101', '010', '101', '011'],
    ' ': ['000', '000', '000', '000', '000']
  };

  function drawPixelText(ctx, text, x, y, scale = 1, color = '#f7f1e3', align = 'left', shadowColor = '#140814') {
    const str = String(text).toUpperCase();
    const charW = 4 * scale;
    const totalW = str.length * charW - scale;
    let startX = Math.round(x);
    if (align === 'center') startX = Math.round(x - totalW / 2);
    else if (align === 'right') startX = Math.round(x - totalW);
    const startY = Math.round(y);

    const drawPass = (ox, oy, fill) => {
      ctx.fillStyle = fill;
      for (let i = 0; i < str.length; i++) {
        const glyph = PIXEL_FONT[str[i]] || PIXEL_FONT[' '];
        const gx = startX + i * charW + ox;
        for (let r = 0; r < glyph.length; r++) {
          const row = glyph[r];
          for (let c = 0; c < row.length; c++) {
            if (row[c] === '1') {
              ctx.fillRect(gx + c * scale, startY + r * scale + oy, scale, scale);
            }
          }
        }
      }
    };

    if (shadowColor) drawPass(scale, scale, shadowColor);
    drawPass(0, 0, color);
  }

  // Bresenham 8-bit stepped pixel line (zero anti-aliased blur!)
  function drawPixelLine(ctx, x0, y0, x1, y1, color, thickness = 2) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const half = Math.floor(thickness / 2);
    ctx.fillStyle = color;

    while (true) {
      ctx.fillRect(x0 - half, y0 - half, thickness, thickness);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  // ==========================================================================
  // 3. DEDICATED 8-BIT PIXEL SPRITE PALETTE, MATRICES & OFFSCREEN CACHE
  // ==========================================================================
  const PALETTE = {
    '.': null,
    // Outlines & Neutrals
    'k': '#16101c', // deep pixel outline
    'w': '#f7f4eb', // bright white / muzzle / specular
    // Rhino Slate & Horn & Ranger Bandana
    's': '#7f8d9c', // rhino mid slate
    'S': '#525e6e', // rhino dark slate
    'h': '#b4c2cf', // rhino highlight
    'i': '#f2e8cf', // ivory horn
    'I': '#c4b38e', // horn shadow
    'r': '#e63946', // hero red bandana / ember red
    'R': '#9e1925', // bandana shadow / deep red
    // Monkey Browns
    'm': '#8c4b27', // monkey fur mid
    'M': '#542a14', // monkey fur dark
    't': '#e8b682', // tan face & belly
    'T': '#c48b56', // tan shadow
    // Tiger Oranges
    'o': '#f27d24', // tiger bright orange
    'O': '#c25211', // tiger deep orange
    'y': '#ffd24a', // gold / fire core / tiger highlight
    'Y': '#fff5b8', // hot white-yellow flame core
    // Forest & Trees
    'g': '#3b9444', // leaf mid green
    'G': '#1d5932', // leaf dark green
    'l': '#7ad152', // bright sprout green
    'b': '#6e3d24', // bark / wood mid
    'B': '#402114', // bark / wood dark
    'u': '#9c5d38', // bark / wood highlight
    // Water Balloon & Drops
    'c': '#39a7ff', // bright water cyan
    'C': '#1b5bbf', // deep water cobalt
    'q': '#a8e8ff', // water highlight
    // Arsonist Villain
    'v': '#3d344d', // cloak mid
    'V': '#231c2e', // cloak dark
    'p': '#d6a17a', // villain face / hands
    // Fire extra
    'f': '#ff5b1c'  // bright flame orange
  };

  const SPRITES = {
    // ------------------------------------------------------------------------
    // HERO PIXEL RHINO (22 x 17) — Facing Right
    // ------------------------------------------------------------------------
    rhino_idle_0: [
      '..................i...',
      '.................ii...',
      '.....kk..kk.....iIk...',
      '....khhkkhhk...kii....',
      '...khhhhhhhhkkksskk...',
      '..khhssssssssssssshk..',
      '.kshssssssssssskwsshk.',
      '.kssrrssssssskssssssik',
      'kRrrrrrrssssssssssssk.',
      'krrkSssssssssssSSsskk.',
      '.kk.kSSsssssssSSkkkk..',
      '....kSSsssssssSSk.....',
      '....kSskkssskkSSk.....',
      '....kSsk.kkk.kSSk.....',
      '....kSsk.....kSSk.....',
      '....kSSk.....kSSk.....',
      '....kkkk.....kkkk.....'
    ],
    rhino_idle_1: [
      '......................',
      '..................i...',
      '.....kk..kk......ii...',
      '....khhkkhhk....iIk...',
      '...khhhhhhhhkkksskk...',
      '..khhssssssssssssshk..',
      '.kshssssssssssskwsshk.',
      'kRrrrrssssssssssssssik',
      'krrkrrrrssssssssssssk.',
      '.kk.kSsssssssssSSsskk.',
      '....kSSsssssssSSkkkk..',
      '....kSSsssssssSSk.....',
      '....kSskkssskkSSk.....',
      '....kSsk.kkk.kSSk.....',
      '....kSsk.....kSSk.....',
      '....kSSk.....kSSk.....',
      '....kkkk.....kkkk.....'
    ],
    rhino_aim: [
      '.................i....',
      '................ii....',
      '....kk..kk.....iIk....',
      '...khhkkhhk...kii.....',
      '..khhhhhhhhkkksskk....',
      '.khhssssssssssssshk...',
      'kRrrssssssssssskwsshk.',
      'krrkrrssssssssssssssik',
      '.kk.kSssssssssssssssk.',
      '....kSSssssssSSsskkkk.',
      '...kSSsssssssSSsk.....',
      '...kSskkssskkSsk......',
      '...kSsk.kkk.kSsk......',
      '..kSsk.......kSSk.....',
      '..kSsk.......kSSk.....',
      '..kSSk.......kSSk.....',
      '..kkkk.......kkkk.....'
    ],
    rhino_throw: [
      '...................i..',
      '..................ii..',
      '......kk..kk.....iIk..',
      '.....khhkkhhk...kii...',
      '....khhhhhhhhkkksskk..',
      '...khhssssssssssssshk.',
      '.kRrrssssssssssskwsshk',
      'krrkrrssssssssssssssik',
      '.kk..kSsssssssssssssk.',
      '.....kSSsssssssSSsskk.',
      '.....kSSsssssssSSkkk..',
      '.....kSskkssskkSSk....',
      '....kSsk..kkk..kSSk...',
      '....kSsk.......kSSk...',
      '...kSsk.........kSSk..',
      '...kSSk.........kSSk..',
      '...kkkk.........kkkk..'
    ],
    rhino_cheer: [
      '.................i..y.',
      '................ii.yYy',
      '....kk..kk.....iIk..y.',
      '...khhkkhhk...kii.....',
      '..khhhhhhhhkkksskk....',
      '.khhssssssssssssshk...',
      'kRrrssssssssssskwsshk.',
      'krrkrrsssssssssskkssik',
      '.kk.kSssssssssssssssk.',
      '....kSSsssssssSSsskk..',
      '....kSSsssssssSSkkk...',
      '...kSskkssssskkSSk....',
      '...kSsk..kkk..kSSk....',
      '..kSsk.........kSSk...',
      '..kSSk.........kSSk...',
      '..kkkk.........kkkk...',
      '......................'
    ],
    rhino_worried: [
      '......................',
      '..................i...',
      '....kk...kk......ii...',
      '...kSSk.kSSk....iIk...',
      '...khhhhhhhhkkksskk...',
      '..khhssssssssssssshk..',
      '.kshssssssssssskwsshk.',
      '.kssrrssssssssssssssik',
      'kRrrrrrrssssssssksssk.',
      '.kk.kSssssssssssSSkkk.',
      '....kSSsssssssSSk.....',
      '....kSSsssssssSSk.....',
      '....kSskkssskkSSk.....',
      '....kSsk.kkk.kSSk.....',
      '....kSsk.....kSSk.....',
      '....kSSk.....kSSk.....',
      '....kkkk.....kkkk.....'
    ],

    // ------------------------------------------------------------------------
    // PIXEL MONKEY BUDDY (13 x 15)
    // ------------------------------------------------------------------------
    monkey_idle_0: [
      '....kkkkk....',
      '..kkmmmmmkk..',
      '.kmtmtttmtmk.',
      '.kmmtkwktmmk.',
      '..kmmtttmmk..',
      '...kktttkk...',
      '..kmmtttmmk..',
      '.kMmtttttmMk.',
      'kM.kmmttmmk..',
      'k..kmmttmmk..',
      '.kk.kmmmmk...',
      '....kmkkmk...',
      '....kmkkmk...',
      '...kMMkkMMk..',
      '...kkk..kkk..'
    ],
    monkey_idle_1: [
      '.............',
      '....kkkkk....',
      '..kkmmmmmkk..',
      '.kmtmtttmtmk.',
      '.kmmtkwktmmk.',
      '..kmmtttmmk..',
      '...kktttkk...',
      '..kmmtttmmk..',
      'kMkmmtttmMk..',
      'k..kmmttmmk..',
      '.kk.kmmmmk...',
      '....kmkkmk...',
      '....kmkkmk...',
      '...kMMkkMMk..',
      '...kkk..kkk..'
    ],
    monkey_cheer_0: [
      '.kk.kkkkk.kk.',
      'kmmkmmmmmkmmk',
      'kmtmtmttmtmtk',
      '.kmmtkwktmmk.',
      '..kmmtkkmmk..',
      '...kktttkk...',
      '...kmmttmmk..',
      'kM.kmmttmmk..',
      'k..kmmttmmk..',
      '.kk.kmmmmk...',
      '...kmk..kmk..',
      '..kMMk..kMMk.',
      '..kkk....kkk.',
      '.............',
      '.............'
    ],
    monkey_cheer_1: [
      '....kkkkk....',
      '.kkkmmmmmkkk.',
      'kmmtmtttmtmmk',
      'kmmmtkwktmmmk',
      '.kkmmtkkmmkk.',
      '...kktttkk...',
      '..kmmtttmmk..',
      'kM.kmmttmmk..',
      '.kk.kmmmmk...',
      '...kmk..kmk..',
      '..kMMk..kMMk.',
      '..kkk....kkk.',
      '.............',
      '.............',
      '.............'
    ],
    monkey_worried: [
      '.............',
      '....kkkkk....',
      '..kkmmmmmkk..',
      '.kmtmtttmtmk.',
      '.kmmtkwktmmk.',
      '..kmmtktmmk..',
      '..kmmtttmmk..',
      '.kmkmtttmkMk.',
      '.kk.kmmmmk.k.',
      '....kmmmmk.kk',
      '....kmkkmk...',
      '....kmkkmk...',
      '...kMMkkMMk..',
      '...kkk..kkk..',
      '.............'
    ],

    // ------------------------------------------------------------------------
    // PIXEL TIGER BUDDY (18 x 14) — Sumatran Striped Tiger
    // ------------------------------------------------------------------------
    tiger_idle_0: [
      '.........kk...kk..',
      '........koOkkkoOk.',
      '.......koookooook.',
      '......kokookwkook.',
      'k.....koowwwwwwok.',
      'ko...kkokowkkwook.',
      '.ko.kookoowwwwok..',
      '..kkooookookkkk...',
      '..kookokooook.....',
      '..koooooookok.....',
      '..kowwwwwoook.....',
      '..kookk.kook......',
      '..kwwk..kwwk......',
      '..kkkk..kkkk......'
    ],
    tiger_idle_1: [
      '..................',
      '.........kk...kk..',
      '........koOkkkoOk.',
      'k......koookooook.',
      'ko....kokookwkook.',
      '.ko..kkoowwwwwwok.',
      '..k.kookokwkkwook.',
      '..kkooookowwwwok..',
      '..kookokooookkk...',
      '..koooooookok.....',
      '..kowwwwwoook.....',
      '..kookk.kook......',
      '..kwwk..kwwk......',
      '..kkkk..kkkk......'
    ],
    tiger_cheer_0: [
      '.........kk...kk..',
      '........koOkkkoOk.',
      '.......koookooook.',
      '......kokookwkook.',
      'k.....koowwwwwwok.',
      'ko...kkokowkkwook.',
      '.ko.kookoowwwwokk.',
      '..kkooookookkkwwk.',
      '..kookokooook.kkk.',
      '..koooooookok.....',
      '..kowwwwwoook.....',
      '.kookk...kook.....',
      '.kwwk....kwwk.....',
      '.kkkk....kkkk.....'
    ],
    tiger_cheer_1: [
      '.........kk...kk..',
      '........koOkkkoOk.',
      '.......koookooook.',
      '......kokookwkook.',
      '......koowwwwwwok.',
      'k....kkokowkkwook.',
      'ko..kookoowwwwok..',
      '.k.kkooookookkk...',
      '..kkookokooook....',
      '..koooooookok.....',
      '..kowwwwwoook.....',
      '.kook....kook.....',
      '.kwwk....kwwk.....',
      '.kkkk....kkkk.....'
    ],
    tiger_worried: [
      '..................',
      '..................',
      '.........kk...kk..',
      '........koOkkkoOk.',
      '.......koookooook.',
      '......kokookwkook.',
      '.....kkoowwwwwwok.',
      'k...kookokwkkwook.',
      'ko.kkooookowwwok..',
      '.kkookokooookkk...',
      '..koooooookok.....',
      '..kowwwwwoook.....',
      '..kwwkk.kwwk......',
      '..kkkk..kkkk......'
    ],

    // ------------------------------------------------------------------------
    // CUTSCENE ARSONIST VILLAIN (14 x 17) — Facing Left with Lit Torch
    // ------------------------------------------------------------------------
    arsonist_walk_0: [
      '.y............',
      'yYy...........',
      'fYf....kkkk...',
      '.f....kvvvvk..',
      '.b...kvVVVVvk.',
      '.b...kvkppkvk.',
      '.b...kvppppvk.',
      '.b..kkvvvvvvkk',
      '.bkkppvvvvvvvk',
      '..kk..kvvvvvk.',
      '......kvVVvvk.',
      '......kvvvvvk.',
      '......kvvkvvk.',
      '.....kvvk.kvvk',
      '.....kVVk.kVVk',
      '.....kkkk.kkkk',
      '..............'
    ],
    arsonist_walk_1: [
      'y.............',
      'fYy...........',
      '.fy....kkkk...',
      '.f....kvvvvk..',
      '.b...kvVVVVvk.',
      '.b...kvkppkvk.',
      '.b...kvppppvk.',
      '.b..kkvvvvvvkk',
      '.bkkppvvvvvvvk',
      '..kk..kvvvvvk.',
      '......kvVVvvk.',
      '......kvvvvvk.',
      '......kvvkvvk.',
      '......kvvkvvk.',
      '......kVVkVVk.',
      '......kkkkkkk.',
      '..............'
    ],
    arsonist_ignite: [
      '..............',
      '.......kkkk...',
      '......kvvvvk..',
      '.....kvVVVVvk.',
      '.....kvkppkvk.',
      '.....kvppppvk.',
      '....kkvvvvvvkk',
      'y..kppvvvvvvvk',
      'fYyk..kvvvvvk.',
      'yYfb..kvVVvvk.',
      '.ffb..kvvvvvk.',
      '..b...kvvkvvk.',
      '.....kvvk.kvvk',
      '.....kVVk.kVVk',
      '.....kkkk.kkkk',
      '..............',
      '..............'
    ],

    // ------------------------------------------------------------------------
    // WOODEN VINE SLINGSHOT (16 x 28) — Back & Front Layers
    // ------------------------------------------------------------------------
    slingshot_back: [
      '..........kkk...',
      '.........kbuuk..',
      '.........kgluk..',
      '........kbguk...',
      '........kbbk....',
      '.......kbguk....',
      '.......kbbk.....',
      '......kbbk......',
      '......kBbk......',
      '.....kBBbk......',
      '.....kBbk.......',
      '.....kBglk......',
      '.....kBbbk......',
      '.....kBbbk......',
      '.....kBbbk......',
      '.....kBglk......',
      '.....kBbbk......',
      '.....kBbbk......',
      '.....kBbbk......',
      '.....kBbbk......',
      '.....kBbbk......',
      '.....kBbbk......',
      '.....kBbbk......',
      '....kBBbbBk.....',
      '....kBBbbBk.....',
      '...kBBBbbBBk....',
      '...kglBBBBgk....',
      '...kkkkkkkkk....'
    ],
    slingshot_front: [
      '..kkk...........',
      '.kuubk..........',
      '.kuglk..........',
      '..kugbk.........',
      '...kbbk.........',
      '...kugbk........',
      '....kbbk........',
      '....kbbk........',
      '.....kBbk.......',
      '.....kBbk.......',
      '......kk........',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................'
    ],

    // ------------------------------------------------------------------------
    // 8-BIT WATER BALLOON (10 x 10) — Wobble Frames
    // ------------------------------------------------------------------------
    balloon_0: [
      '....kk....',
      '...kCCk...',
      '..kkcckk..',
      '.kcqqccCk.',
      'kcqqccccCk',
      'kcqcccccCk',
      'kccccccCCk',
      '.kccccCCk.',
      '..kCCCCk..',
      '...kkkk...'
    ],
    balloon_1: [
      '..........',
      '....kk....',
      '..kkCCkk..',
      '.kcqqccCk.',
      'kcqqccccCk',
      'kccccccCCk',
      'kccccccCCk',
      '.kCCCCCCCk',
      '..kkkkkkk.',
      '..........'
    ],
    balloon_2: [
      '....kk....',
      '...kCCk...',
      '..kcqcck..',
      '.kcqqccCk.',
      '.kcqcccCk.',
      '.kccccCCk.',
      '.kccccCCk.',
      '..kcCCCk..',
      '...kCCk...',
      '....kk....'
    ],

    // ------------------------------------------------------------------------
    // RAINFOREST PIXEL TREES (24 x 32)
    // ------------------------------------------------------------------------
    tree_lush: [
      '........kkkkkkkk........',
      '......kkllllllllkk......',
      '.....klllgggggglllk.....',
      '....kllggggggggggllk....',
      '...kllgggllllgggggglk...',
      '..kllggllllllllggggggk..',
      '..klgggggllllggggggggk..',
      '.kllggggggggggggggggGGk.',
      '.klggggggGGGGgggggggGGk.',
      '.kggggggGGGGGGgggggGGGk.',
      'kllggggggGGGGggggggGGGGk',
      'klgggggggggggggggggGGGGk',
      'klggggggggggggggggGGGGGk',
      '.kggggGGGGggggggggGGGGk.',
      '.kGGGGGGGGggggggGGGGGGk.',
      '..kGGGGGGGGGGGGGGGGGGk..',
      '...kkGGGGGGGGGGGGGGkk...',
      '.....kkkGGGGGGGGkkk.....',
      '........kkbBBbkk........',
      '.........kbBBbk.........',
      '.........kubBBk.........',
      '.........kubBBk.........',
      '.........kbbBBk.........',
      '.........kubBBk.........',
      '.........kubBBk.........',
      '.........kbbBBk.........',
      '.........kubBBk.........',
      '........kkubBBkk........',
      '.......kBbuubBBBk.......',
      '......kBBbuubBBBBk......',
      '.....kBBBBBBBBBBBBk.....',
      '.....kkkkkkkkkkkkkk.....'
    ],
    tree_burning: [
      '........kkkkkkkk........',
      '......kkGGGGGGGGkk......',
      '.....kGGGrRGGGGrGGk.....',
      '....kGGggrGGGGggGGVk....',
      '...kGGggggGGGGggggVVk...',
      '..kGGgggggGGGggggggVVk..',
      '..kGggggggGGGggggggVVk..',
      '.kGGgggggGGGGGgggggVVVk.',
      '.kGgggggGGGGGGgggggVVVk.',
      '.kGgggggGGGGGGggggVVVVk.',
      'kGGggggggGGGGgggggVVVVVk',
      'kGggggggggggggggggVVVVVk',
      'kGgggggggggggggggVVVVVVk',
      '.kGgggGGGGgggggggVVVVVk.',
      '.kGGGGGGGGggggggVVVVVVk.',
      '..kGGGGGGGGGGGGVVVVVVk..',
      '...kkGGGGGGGGVVVVVVkk...',
      '.....kkkGGGGGVVVkkk.....',
      '........kkBBBBkk........',
      '.........kBbbBk.........',
      '.........kBbbBk.........',
      '.........kBBbBk.........',
      '.........kBbbBk.........',
      '.........kBBbBk.........',
      '.........kBbbBk.........',
      '.........kBBbBk.........',
      '.........kBbbBk.........',
      '........kkBBBBkk........',
      '.......kBBBBBBBBk.......',
      '......kBBBBBBBBBBk......',
      '.....kBBBBBBBBBBBBk.....',
      '.....kkkkkkkkkkkkkk.....'
    ],
    tree_saved: [
      '........kkkkkkkk........',
      '......kkllllllllkk......',
      '.....klllqllllglllk.....',
      '....kllggqgggggglllk....',
      '...kllgggllllgggggglk...',
      '..kllggllllllllggqgggk..',
      '..klgggggllllggggqgggk..',
      '.kllggggggggggggggggGGk.',
      '.klggqgggGGGGgggggggGGk.',
      '.kggqgggGGGGGGgggggGGGk.',
      'kllggggggGGGGggggggGGGGk',
      'klggggggggggggggqggGGGGk',
      'klggggggggggggggggGGGGGk',
      '.kggggGGGGggggggggGGGGk.',
      '.kGGGGGGGGggggggGGGGGGk.',
      '..kGGGGGGGGGGGGGGGGGGk..',
      '...kkGGGGGGGGGGGGGGkk...',
      '.....kkkGGGGGGGGkkk.....',
      '........kkbBBbkk........',
      '.........kbBBbk.........',
      '.........kubBBk.........',
      '.........kubBBk.........',
      '.........kbbBBk.........',
      '.........kubBBk.........',
      '.........kubBBk.........',
      '.........kbbBBk.........',
      '.........kubBBk.........',
      '........kkubBBkk........',
      '.......kBbuubBBBk.......',
      '......kBBbuubBBBBk......',
      '.....kBBBBBBBBBBBBk.....',
      '.....kkkkkkkkkkkkkk.....'
    ],

    // ------------------------------------------------------------------------
    // ANIMATED 8-BIT FIRE OVERLAYS (14 x 16)
    // ------------------------------------------------------------------------
    fire_0: [
      '......r.......',
      '.....rf.......',
      '.....rf...r...',
      '....rff..rf...',
      '..r.rffy.ff...',
      '..ffrfyyfff...',
      '.rffyyyyfffr..',
      '.rfyyYYyyffr..',
      'rffyyYYyyfffr.',
      'rfyyYYYYyyffr.',
      'rfyyYYYYyyffr.',
      'rffyYYYYyyffr.',
      '.rfyyYYyyffr..',
      '..rffyyyffr...',
      '...rrfffrr....',
      '.....rrr......'
    ],
    fire_1: [
      '........r.....',
      '...r...fr.....',
      '...fr..ffr....',
      '..rff..ffr....',
      '..rffy.fffr...',
      '..ffyyfffyr...',
      '.rffyyyyyffr..',
      'rffyyYYyyfffr.',
      'rfyyYYYYyyffr.',
      'rfyyYYYYyyffr.',
      'rfyyYYYYyyffr.',
      '.rfyYYYYyffr..',
      '.rfyyYYyyffr..',
      '..rffyyyffr...',
      '...rrfffrr....',
      '.....rrr......'
    ],
    fire_2: [
      '.....r........',
      '....rfr.......',
      '....fff..r....',
      '...rffyrff....',
      '.r.ffyyfffr...',
      '.ffrfyyyffr...',
      '.rfyyYYyfffr..',
      'rffyyYYyyffr..',
      'rfyyYYYYyyffr.',
      'rfyyYYYYyyffr.',
      'rfyyYYYYyyffr.',
      'rffyyYYyyfffr.',
      '.rfyyYYyyffr..',
      '..rffyyyffr...',
      '...rrfffrr....',
      '.....rrr......'
    ],

    // Small pixel emote icons (6 x 7)
    sweat: [
      '..kk..',
      '.kqqk.',
      'kqqcck',
      'kqcccK',
      'kcccck',
      '.kCCk.',
      '..kk..'
    ],
    spark: [
      '..y...',
      '..y...',
      'yyYyy.',
      '..y...',
      '..y...'
    ]
  };

  // Pre-compile all sprite matrices into offscreen canvases for locked 60 FPS
  class SpriteRenderer {
    constructor() {
      this.cache = new Map();
      this.buildAll();
    }

    buildAll() {
      for (const [name, rows] of Object.entries(SPRITES)) {
        this.cache.set(name, this.bakeSprite(rows, false));
        this.cache.set(name + '_flip', this.bakeSprite(rows, true));
      }
    }

    bakeSprite(rows, flipX) {
      const h = rows.length;
      const w = rows[0].length;
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = false;

      for (let y = 0; y < h; y++) {
        const line = rows[y];
        for (let x = 0; x < w; x++) {
          const ch = line[x];
          const color = PALETTE[ch] || (ch === 'K' ? PALETTE['k'] : null);
          if (!color) continue;
          octx.fillStyle = color;
          const drawX = flipX ? (w - 1 - x) : x;
          octx.fillRect(drawX, y, 1, 1);
        }
      }
      return off;
    }

    draw(ctx, name, x, y, flipX = false, scale = 1) {
      const key = flipX ? name + '_flip' : name;
      const img = this.cache.get(key);
      if (!img) return;
      ctx.drawImage(
        img,
        Math.round(x),
        Math.round(y),
        img.width * scale,
        img.height * scale
      );
    }

    size(name) {
      const img = this.cache.get(name);
      return img ? { w: img.width, h: img.height } : { w: 0, h: 0 };
    }
  }

  // ==========================================================================
  // 4. 8-BIT CHIPTUNE AUDIO SYNTHESIZER (PURE WEB AUDIO API)
  // ==========================================================================
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuffer = null;
      this.muted = false;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.28;
        this.master.connect(this.ctx.destination);

        // Pre-generate 1 second of 8-bit crunchy white noise
        const sampleRate = this.ctx.sampleRate;
        const buffer = this.ctx.createBuffer(1, sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        // Quantized step noise for authentic NES-style grit
        let hold = 0;
        for (let i = 0; i < sampleRate; i++) {
          if (i % 3 === 0) hold = Math.random() * 2 - 1;
          data[i] = hold;
        }
        this.noiseBuffer = buffer;
      } catch (_) {
        this.ctx = null;
      }
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.28, this.ctx.currentTime, 0.01);
      }
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    tone(type, freqStart, freqEnd, duration, volume = 0.4, delay = 0) {
      if (this.muted) return;
      this.init();
      if (!this.ctx || !this.master) return;

      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(30, freqStart), t0);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + duration);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }

    noise(duration, filterType, freqStart, freqEnd, volume = 0.45, delay = 0) {
      if (this.muted) return;
      this.init();
      if (!this.ctx || !this.master || !this.noiseBuffer) return;

      const t0 = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(freqStart, t0);
      if (freqEnd !== freqStart) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(60, freqEnd), t0 + duration);
      }

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t0);
      src.stop(t0 + duration + 0.02);
    }

    playButton() {
      this.tone('square', 580, 880, 0.055, 0.28);
    }

    playStretch(step) {
      const base = 140 + step * 28;
      this.tone('square', base, base + 22, 0.032, 0.16);
    }

    playLaunch() {
      this.tone('triangle', 190, 560, 0.12, 0.42);
      this.tone('square', 320, 170, 0.14, 0.22, 0.06);
    }

    playSplash() {
      this.noise(0.22, 'bandpass', 2000, 380, 0.55);
      this.tone('square', 520, 260, 0.06, 0.18, 0.02);
      this.tone('square', 680, 340, 0.06, 0.15, 0.07);
    }

    playExtinguish(combo = 1) {
      // Steam sizzle
      this.noise(0.32, 'highpass', 2400, 850, 0.48);
      // Celebratory 8-bit rising arpeggio (higher pitch on combo!)
      const shift = combo > 1 ? 1.18 : 1.0;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, idx) => {
        this.tone('square', n * shift, n * shift, 0.09, 0.25, 0.05 + idx * 0.055);
      });
    }

    playWoodBreak() {
      this.noise(0.14, 'bandpass', 720, 200, 0.48);
      this.tone('square', 180, 62, 0.11, 0.34);
    }

    playRockHit() {
      this.tone('triangle', 135, 58, 0.09, 0.36);
    }

    playMiss() {
      this.tone('square', 311, 277, 0.12, 0.2);
      this.tone('square', 247, 196, 0.18, 0.2, 0.12);
    }

    playFireIgnite() {
      this.noise(0.28, 'lowpass', 1400, 320, 0.45);
      this.tone('sawtooth', 120, 260, 0.16, 0.22);
    }

    playHeroAppear() {
      const notes = [392, 523.25, 659.25, 783.99];
      notes.forEach((n, i) => {
        this.tone('square', n, n, 0.11, 0.24, i * 0.08);
        this.tone('triangle', n / 2, n / 2, 0.12, 0.26, i * 0.08);
      });
    }

    playVictoryFanfare() {
      // Authentic 8-bit NES victory jingle (melody + triangle bass)
      const melody = [
        [523.25, 0.10, 0.00],
        [659.25, 0.10, 0.11],
        [783.99, 0.10, 0.22],
        [1046.5, 0.22, 0.33],
        [783.99, 0.10, 0.56],
        [1046.5, 0.38, 0.67]
      ];
      const bass = [
        [261.63, 0.20, 0.00],
        [329.63, 0.20, 0.22],
        [392.00, 0.20, 0.44],
        [523.25, 0.40, 0.67]
      ];
      melody.forEach(([f, d, t]) => this.tone('square', f, f, d, 0.26, t));
      bass.forEach(([f, d, t]) => this.tone('triangle', f, f, d, 0.32, t));
    }

    playGameOver() {
      const notes = [
        [392.00, 0.16, 0.00],
        [349.23, 0.16, 0.18],
        [311.13, 0.16, 0.36],
        [261.63, 0.42, 0.54]
      ];
      notes.forEach(([f, d, t]) => {
        this.tone('square', f, f * 0.98, d, 0.24, t);
        this.tone('triangle', f / 2, f / 2, d, 0.28, t);
      });
    }
  }

  // ==========================================================================
  // 5. LEVEL DEFINITIONS (4 ESCALATING CONSERVATION MISSIONS)
  // ==========================================================================
  const LEVELS = [
    {
      id: 1,
      name: 'FOREST EDGE',
      ammo: 6,
      starThresholds: [1, 2, 3], // unused balloons >= threshold for 1/2/3 stars (1 star always on win)
      platforms: [
        { x: 0,   y: HERO_LEDGE_Y, w: 132, h: 66, type: 'grass' },
        { x: 132, y: 244,          w: 348, h: 26, type: 'rock' },
        { x: 218, y: 214,          w: 120, h: 30, type: 'rock' },
        { x: 356, y: 184,          w: 108, h: 60, type: 'rock' }
      ],
      obstacles: [
        { x: 190, y: 228, w: 18, h: 16, material: 'stone' }
      ],
      trees: [
        { x: 252, y: 214 },
        { x: 308, y: 214 },
        { x: 410, y: 184 }
      ]
    },
    {
      id: 2,
      name: 'TIMBER RIDGE',
      ammo: 6,
      starThresholds: [0, 1, 2],
      platforms: [
        { x: 0,   y: HERO_LEDGE_Y, w: 132, h: 66, type: 'grass' },
        { x: 132, y: 244,          w: 348, h: 26, type: 'rock' },
        { x: 208, y: 216,          w: 106, h: 28, type: 'rock' },
        { x: 332, y: 176,          w: 136, h: 68, type: 'rock' }
      ],
      obstacles: [
        { x: 216, y: 188, w: 14, h: 28, material: 'wood' },
        { x: 314, y: 220, w: 18, h: 24, material: 'wood' },
        { x: 342, y: 146, w: 14, h: 30, material: 'wood' }
      ],
      trees: [
        { x: 256, y: 216 },
        { x: 294, y: 216 },
        { x: 384, y: 176 },
        { x: 438, y: 176 }
      ]
    },
    {
      id: 3,
      name: 'STONE CANYON',
      ammo: 7,
      starThresholds: [0, 1, 2],
      platforms: [
        { x: 0,   y: HERO_LEDGE_Y, w: 132, h: 66, type: 'grass' },
        { x: 132, y: 244,          w: 348, h: 26, type: 'rock' },
        { x: 202, y: 172,          w: 74,  h: 72, type: 'rock' },
        { x: 374, y: 158,          w: 96,  h: 86, type: 'rock' }
      ],
      obstacles: [
        { x: 284, y: 184, w: 18, h: 60, material: 'stone' },
        { x: 302, y: 196, w: 72, h: 10, material: 'wood' },
        { x: 378, y: 134, w: 14, h: 24, material: 'stone' }
      ],
      trees: [
        { x: 239, y: 172 },
        { x: 320, y: 244 },
        { x: 356, y: 244 },
        { x: 412, y: 158 },
        { x: 448, y: 158 }
      ]
    },
    {
      id: 4,
      name: 'INFERNO PEAK',
      ammo: 8,
      starThresholds: [0, 1, 2],
      platforms: [
        { x: 0,   y: HERO_LEDGE_Y, w: 132, h: 66, type: 'grass' },
        { x: 132, y: 244,          w: 348, h: 26, type: 'rock' },
        { x: 182, y: 216,          w: 66,  h: 28, type: 'rock' },
        { x: 262, y: 184,          w: 94,  h: 60, type: 'rock' },
        { x: 394, y: 144,          w: 78,  h: 100, type: 'rock' }
      ],
      obstacles: [
        { x: 186, y: 188, w: 12, h: 28, material: 'wood' },
        { x: 266, y: 148, w: 16, h: 36, material: 'stone' },
        { x: 342, y: 156, w: 12, h: 28, material: 'wood' },
        { x: 396, y: 116, w: 12, h: 28, material: 'wood' }
      ],
      trees: [
        { x: 222, y: 216 },
        { x: 300, y: 184 },
        { x: 326, y: 184 },
        { x: 375, y: 244 },
        { x: 422, y: 144 },
        { x: 454, y: 144 }
      ]
    }
  ];

  // ==========================================================================
  // 6. PARTICLE & FLOATING TEXT SYSTEM
  // ==========================================================================
  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.rings = [];
      this.popups = [];
      this.bgEmbers = [];
      this.initBgEmbers();
    }

    initBgEmbers() {
      this.bgEmbers = [];
      for (let i = 0; i < 36; i++) {
        this.bgEmbers.push({
          x: Math.random() * LOGICAL_W,
          y: Math.random() * LOGICAL_H,
          vx: -6 - Math.random() * 14,
          vy: -10 - Math.random() * 18,
          size: Math.random() < 0.7 ? 1 : 2,
          phase: Math.random() * Math.PI * 2,
          color: Math.random() < 0.5 ? '#ff7b29' : '#ffd147'
        });
      }
    }

    clearLevelEffects() {
      this.particles = [];
      this.rings = [];
      this.popups = [];
    }

    spawnWaterSplash(x, y, radius = PHYSICS.SPLASH_RADIUS) {
      const colors = ['#a8e8ff', '#39a7ff', '#1b5bbf', '#f7f4eb'];
      for (let i = 0; i < 26; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 115;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 4,
          y: y + (Math.random() - 0.5) * 4,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          gravity: 250,
          size: Math.random() < 0.55 ? 3 : 2,
          life: 0.35 + Math.random() * 0.35,
          maxLife: 0.7,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
      this.rings.push({
        x, y,
        r: 4,
        maxR: radius,
        life: 0.28,
        maxLife: 0.28,
        color: '#a8e8ff'
      });
    }

    spawnSteamBurst(x, y) {
      const colors = ['#f7f4eb', '#d8effa', '#a8e8ff', '#b9c6d1'];
      for (let i = 0; i < 18; i++) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 18,
          y: y - Math.random() * 20,
          vx: (Math.random() - 0.5) * 28,
          vy: -24 - Math.random() * 34,
          gravity: -12,
          size: Math.random() < 0.6 ? 4 : 3,
          life: 0.5 + Math.random() * 0.45,
          maxLife: 0.95,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    }

    spawnFireSmoke(x, y) {
      const isEmber = Math.random() < 0.38;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y - 10 - Math.random() * 14,
        vx: (Math.random() - 0.5) * 12 - 4,
        vy: isEmber ? (-28 - Math.random() * 26) : (-16 - Math.random() * 16),
        gravity: 0,
        size: isEmber ? (Math.random() < 0.6 ? 1 : 2) : (Math.random() < 0.5 ? 3 : 4),
        life: isEmber ? 0.45 : 0.75,
        maxLife: isEmber ? 0.45 : 0.75,
        color: isEmber
          ? (Math.random() < 0.5 ? '#ffd147' : '#ff5b1c')
          : (Math.random() < 0.5 ? '#3b3345' : '#63596e')
      });
    }

    spawnWoodSplinters(x, y, w, h) {
      const colors = ['#9c5d38', '#6e3d24', '#402114', '#ffd147'];
      for (let i = 0; i < 16; i++) {
        this.particles.push({
          x: x + Math.random() * w,
          y: y + Math.random() * h,
          vx: (Math.random() - 0.3) * 110,
          vy: -30 - Math.random() * 90,
          gravity: 290,
          size: Math.random() < 0.5 ? 3 : 2,
          life: 0.45 + Math.random() * 0.35,
          maxLife: 0.8,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    }

    spawnRockChips(x, y) {
      const colors = ['#7e8a97', '#55606e', '#aebbc7'];
      for (let i = 0; i < 7; i++) {
        this.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 70,
          vy: -20 - Math.random() * 55,
          gravity: 260,
          size: 2,
          life: 0.32,
          maxLife: 0.32,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    }

    spawnWaterTrail(x, y) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 3,
        y: y + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 14,
        vy: 8 + Math.random() * 14,
        gravity: 90,
        size: 2,
        life: 0.22,
        maxLife: 0.22,
        color: Math.random() < 0.5 ? '#a8e8ff' : '#39a7ff'
      });
    }

    spawnPopup(text, x, y, color = '#ffd147', scale = 1) {
      this.popups.push({
        text,
        x: Math.max(40, Math.min(LOGICAL_W - 40, x)),
        y,
        vy: -22,
        life: 1.15,
        maxLife: 1.15,
        color,
        scale
      });
    }

    update(dt, time, wildfireIntensity = 1) {
      // Background embers
      for (const e of this.bgEmbers) {
        e.x += (e.vx + Math.sin(time * 2 + e.phase) * 8) * dt;
        e.y += e.vy * dt;
        if (e.y < -4) {
          e.y = LOGICAL_H + 4;
          e.x = Math.random() * LOGICAL_W;
        }
        if (e.x < -4) e.x = LOGICAL_W + 4;
      }

      // Active particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // Expanding pixel splash rings
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= dt;
        if (r.life <= 0) {
          this.rings.splice(i, 1);
          continue;
        }
        const prog = 1 - r.life / r.maxLife;
        r.r = 4 + (r.maxR - 4) * prog;
      }

      // Floating pixel score popups
      for (let i = this.popups.length - 1; i >= 0; i--) {
        const pop = this.popups[i];
        pop.life -= dt;
        if (pop.life <= 0) {
          this.popups.splice(i, 1);
          continue;
        }
        pop.y += pop.vy * dt;
        pop.vy *= Math.pow(0.25, dt);
      }
    }

    drawBgEmbers(ctx, alpha = 1) {
      if (alpha <= 0.02) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      for (const e of this.bgEmbers) {
        ctx.fillStyle = e.color;
        ctx.fillRect(Math.round(e.x), Math.round(e.y), e.size, e.size);
      }
      ctx.restore();
    }

    drawForeground(ctx) {
      // Pixelated splash blast rings (stepped points on circumference)
      for (const ring of this.rings) {
        const steps = 20;
        const alpha = Math.max(0, ring.life / ring.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ring.color;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const px = Math.round(ring.x + Math.cos(a) * ring.r);
          const py = Math.round(ring.y + Math.sin(a) * ring.r);
          ctx.fillRect(px - 1, py - 1, 2, 2);
        }
        ctx.restore();
      }

      // Chunky square particles
      for (const p of this.particles) {
        const ratio = p.life / p.maxLife;
        const sz = ratio < 0.25 ? Math.max(1, p.size - 1) : p.size;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
      }

      // Floating score text popups
      for (const pop of this.popups) {
        const blink = pop.life < 0.25 && Math.floor(pop.life * 20) % 2 === 0;
        if (blink) continue;
        drawPixelText(ctx, pop.text, pop.x, pop.y, pop.scale, pop.color, 'center', '#140814');
      }
    }
  }

  // ==========================================================================
  // 7. LAYERED 8-BIT PARALLAX BACKGROUND RENDERER
  // ==========================================================================
  class BackgroundRenderer {
    constructor() {
      // Pre-generate deterministic silhouette hills & pixel trees
      this.farTrees = [];
      this.midTrees = [];
      for (let x = -16; x < LOGICAL_W + 40; x += 14) {
        const seed = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1;
        this.farTrees.push({
          x,
          h: 22 + Math.floor(seed * 26),
          w: 10 + Math.floor(seed * 8)
        });
      }
      for (let x = -20; x < LOGICAL_W + 40; x += 19) {
        const seed = Math.abs(Math.sin(x * 78.233 + 1.7) * 23421.631) % 1;
        this.midTrees.push({
          x,
          h: 34 + Math.floor(seed * 34),
          w: 14 + Math.floor(seed * 10)
        });
      }
    }

    // mood: 0 = peaceful lush forest (cutscene start), 1 = burning wildfire
    draw(ctx, time, parallaxX = 0, mood = 1) {
      // Discrete 8-bit sky color bands
      const burningBands = ['#240916', '#4a1320', '#802022', '#bd3e26', '#e36f2e', '#f5ad42'];
      const lushBands    = ['#2466a8', '#3988c9', '#5aaee0', '#8bd1eb', '#c6ebc9', '#f2e8b3'];
      const bandHeights  = [34, 38, 42, 46, 52, 58];

      let y = 0;
      for (let i = 0; i < burningBands.length; i++) {
        const col = mood >= 0.99
          ? burningBands[i]
          : (mood <= 0.01 ? lushBands[i] : this.lerpHex(lushBands[i], burningBands[i], mood));
        const h = bandHeights[i];
        ctx.fillStyle = col;
        ctx.fillRect(0, y, LOGICAL_W, h);

        // Authentic 8-bit checkerboard dithering strip between sky bands
        if (i < burningBands.length - 1) {
          const nextCol = mood >= 0.99
            ? burningBands[i + 1]
            : (mood <= 0.01 ? lushBands[i + 1] : this.lerpHex(lushBands[i + 1], burningBands[i + 1], mood));
          ctx.fillStyle = nextCol;
          for (let dx = 0; dx < LOGICAL_W; dx += 4) {
            ctx.fillRect(dx, y + h - 2, 2, 2);
            ctx.fillRect(dx + 2, y + h - 4, 2, 2);
          }
        }
        y += h;
      }

      // Smokey Red Sun / Warm Peaceful Sun
      const sunX = Math.round(354 - parallaxX * 0.06);
      const sunY = 58;
      ctx.fillStyle = mood > 0.5 ? '#ff9f38' : '#fff5b8';
      ctx.fillRect(sunX - 14, sunY - 10, 28, 20);
      ctx.fillRect(sunX - 10, sunY - 14, 20, 28);
      ctx.fillStyle = mood > 0.5 ? '#ffd86b' : '#ffffff';
      ctx.fillRect(sunX - 8, sunY - 8, 16, 16);

      // Drifting 8-bit smoke clouds / peaceful clouds
      const cloudCol = mood > 0.5 ? '#59202a' : '#eaf7ff';
      const cloudHi  = mood > 0.5 ? '#7a2e33' : '#ffffff';
      for (let i = 0; i < 4; i++) {
        const cx = Math.round(((i * 135 - time * (6 + i * 1.5) - parallaxX * 0.12) % (LOGICAL_W + 90) + LOGICAL_W + 90) % (LOGICAL_W + 90) - 45);
        const cy = 32 + (i % 2) * 24;
        ctx.fillStyle = cloudCol;
        ctx.fillRect(cx, cy + 4, 44, 10);
        ctx.fillRect(cx + 8, cy, 26, 6);
        ctx.fillStyle = cloudHi;
        ctx.fillRect(cx + 10, cy + 2, 20, 3);
      }

      // Far mountain / ridge silhouette
      const farCol = mood > 0.5 ? '#4d1823' : '#2a6b5e';
      ctx.fillStyle = farCol;
      for (let x = 0; x < LOGICAL_W; x += 8) {
        const wx = x + Math.round(parallaxX * 0.18);
        const ridgeH = 82 + Math.round(Math.sin(wx * 0.018) * 18 + Math.cos(wx * 0.042) * 8);
        ctx.fillRect(x, LOGICAL_H - ridgeH, 8, ridgeH);
      }

      // Far silhouette pixel forest treeline
      const farTreeCol = mood > 0.5 ? '#36111c' : '#1f5443';
      ctx.fillStyle = farTreeCol;
      const farShift = Math.round(parallaxX * 0.3);
      for (const t of this.farTrees) {
        const tx = ((t.x - farShift) % (LOGICAL_W + 40) + (LOGICAL_W + 40)) % (LOGICAL_W + 40) - 20;
        const base = LOGICAL_H - 52;
        ctx.fillRect(tx, base - t.h, t.w, t.h + 52);
        ctx.fillRect(tx + 2, base - t.h - 6, Math.max(4, t.w - 4), 6);
      }

      // Distant flickering wildfire horizon glow (when burning)
      if (mood > 0.2) {
        const flicker = Math.floor(Math.sin(time * 11) * 3);
        ctx.save();
        ctx.globalAlpha = 0.25 * mood;
        ctx.fillStyle = '#ff6d1f';
        ctx.fillRect(0, LOGICAL_H - 72 + flicker, LOGICAL_W, 24);
        ctx.restore();
      }

      // Midground pixel tree silhouettes
      const midTreeCol = mood > 0.5 ? '#210b15' : '#143d2b';
      ctx.fillStyle = midTreeCol;
      const midShift = Math.round(parallaxX * 0.55);
      for (const t of this.midTrees) {
        const tx = ((t.x - midShift) % (LOGICAL_W + 48) + (LOGICAL_W + 48)) % (LOGICAL_W + 48) - 24;
        const base = LOGICAL_H - 30;
        ctx.fillRect(tx, base - t.h, t.w, t.h + 30);
        ctx.fillRect(tx + 2, base - t.h - 8, Math.max(4, t.w - 4), 8);
        ctx.fillRect(tx + 4, base - t.h - 13, Math.max(2, t.w - 8), 5);
      }
    }

    lerpHex(hexA, hexB, t) {
      const a = parseInt(hexA.slice(1), 16);
      const b = parseInt(hexB.slice(1), 16);
      const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
      const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t);
      const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
      return `rgb(${r},${g},${bl})`;
    }
  }

  // ==========================================================================
  // 8. TERRAIN & OBSTACLE RENDERERS (CRISP 8-BIT TILES)
  // ==========================================================================
  function drawPlatform(ctx, plat) {
    const { x, y, w, h, type } = plat;
    if (type === 'grass') {
      // Rich dirt cliff body
      ctx.fillStyle = '#5c3420';
      ctx.fillRect(x, y + 6, w, h - 6);
      // Pixel dirt stones & shading
      ctx.fillStyle = '#402114';
      ctx.fillRect(x, y + 6, w, 3);
      for (let py = y + 12; py < y + h - 4; py += 10) {
        for (let px = x + 6; px < x + w - 8; px += 16) {
          const offset = ((py / 10) % 2) * 8;
          ctx.fillRect(px + offset, py, 6, 4);
        }
      }
      // Vibrant pixel grass cap with stepped hanging tufts
      ctx.fillStyle = '#3b9444';
      ctx.fillRect(x, y, w, 7);
      ctx.fillStyle = '#7ad152';
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = '#1d5932';
      for (let gx = x + 2; gx < x + w - 2; gx += 8) {
        ctx.fillRect(gx, y + 6, 4, 3);
      }
      // Crisp 8-bit outline on top & right cliff edge
      ctx.fillStyle = '#16101c';
      ctx.fillRect(x, y - 1, w + 1, 1);
      ctx.fillRect(x + w, y, 1, h);
    } else {
      // Rocky cliff / mountain plateau
      ctx.fillStyle = '#4f5a69';
      ctx.fillRect(x, y, w, h);
      // Top rock highlight slab
      ctx.fillStyle = '#7e8c9c';
      ctx.fillRect(x + 1, y + 1, w - 2, 5);
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(x + 2, y + 1, w - 4, 2);
      // Deep shadow strata & pixel rock blocks
      ctx.fillStyle = '#313945';
      for (let py = y + 9; py < y + h - 2; py += 10) {
        ctx.fillRect(x, py, w, 1);
        const shift = ((py - y) % 20 === 9) ? 0 : 8;
        for (let px = x + shift; px < x + w - 6; px += 18) {
          ctx.fillRect(px, py + 1, 1, 9);
          ctx.fillRect(px + 2, py + 4, 5, 3);
        }
      }
      // Scorched grass tufts on cliff top edges
      ctx.fillStyle = '#3b5c37';
      for (let gx = x + 4; gx < x + w - 8; gx += 14) {
        ctx.fillRect(gx, y, 6, 2);
      }
      // Outer pixel border
      ctx.fillStyle = '#16101c';
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y, 1, h);
      ctx.fillRect(x + w - 1, y, 1, h);
    }
  }

  function drawObstacle(ctx, obs) {
    const { x, y, w, h, material } = obs;
    if (material === 'wood') {
      // Dry timber barricade / plank (destructible!)
      ctx.fillStyle = '#16101c';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#7a4526';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#a8653b';
      ctx.fillRect(x + 1, y + 1, w - 2, Math.min(3, h - 2));
      ctx.fillStyle = '#4a2614';
      if (w >= h) {
        // Horizontal wooden beam grain
        for (let px = x + 4; px < x + w - 3; px += 10) {
          ctx.fillRect(px, y + 2, 6, 1);
          ctx.fillRect(px + 2, y + h - 3, 5, 1);
        }
        // Iron nail studs
        ctx.fillStyle = '#d8dee6';
        ctx.fillRect(x + 2, y + 2, 2, 2);
        ctx.fillRect(x + w - 4, y + 2, 2, 2);
      } else {
        // Vertical stacked logs
        for (let py = y + 6; py < y + h - 2; py += 7) {
          ctx.fillRect(x, py, w, 2);
        }
        ctx.fillStyle = '#a8653b';
        ctx.fillRect(x + 2, y + 1, 2, h - 2);
      }
    } else {
      // Indestructible Stone Rock Block
      ctx.fillStyle = '#16101c';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#626f80';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(x + 1, y + 1, w - 3, 3);
      ctx.fillRect(x + 1, y + 1, 3, h - 3);
      ctx.fillStyle = '#363f4d';
      ctx.fillRect(x + w - 3, y + 2, 3, h - 2);
      ctx.fillRect(x + 1, y + h - 3, w - 1, 3);
      // Cracked stone detail
      ctx.fillStyle = '#252b36';
      ctx.fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2) - 2, 2, 5);
      ctx.fillRect(x + Math.floor(w / 2) + 2, y + Math.floor(h / 2) + 1, 3, 2);
    }
  }

  // ==========================================================================
  // 9. OPENING 8-BIT CUTSCENE CONTROLLER (SKIPPABLE, 3 ACTS)
  // ==========================================================================
  class CutsceneController {
    constructor(sprites, bg, particles, audio) {
      this.sprites = sprites;
      this.bg = bg;
      this.particles = particles;
      this.audio = audio;
      this.reset();
    }

    reset() {
      this.t = 0;
      this.duration = 9.8;
      this.ignitedFlags = [false, false, false, false];
      this.heroFanfarePlayed = false;
      this.smokeAccum = 0;
      this.trees = [
        { x: 165, y: 214, burning: false },
        { x: 235, y: 214, burning: false },
        { x: 308, y: 214, burning: false },
        { x: 382, y: 214, burning: false }
      ];
    }

    update(dt) {
      this.t += dt;

      // Trigger sequential tree ignitions in Act 2
      const igniteTimes = [3.1, 3.65, 4.15, 4.65];
      for (let i = 0; i < this.trees.length; i++) {
        if (!this.ignitedFlags[i] && this.t >= igniteTimes[i]) {
          this.ignitedFlags[i] = true;
          this.trees[i].burning = true;
          this.audio.playFireIgnite();
          for (let k = 0; k < 10; k++) {
            this.particles.spawnFireSmoke(this.trees[i].x, this.trees[i].y - 10);
          }
        }
      }

      // Hero step-forward chime in Act 3
      if (!this.heroFanfarePlayed && this.t >= 6.8) {
        this.heroFanfarePlayed = true;
        this.audio.playHeroAppear();
      }

      // Continuous smoke on burning cutscene trees
      this.smokeAccum += dt;
      if (this.smokeAccum >= 0.08) {
        this.smokeAccum = 0;
        for (const tr of this.trees) {
          if (tr.burning) {
            this.particles.spawnFireSmoke(tr.x, tr.y - 12);
          }
        }
      }

      return this.t >= this.duration;
    }

    draw(ctx, time) {
      // Mood transitions smoothly from 0 (peaceful lush) to 1 (burning red-orange) between t=3.1..5.6
      const mood = Math.max(0, Math.min(1, (this.t - 3.1) / 2.4));

      // Camera pan: starts focused on forest (x=0), pans smoothly left/right into hero showcase at t=6.2..7.2
      const act3 = this.t >= 6.2;

      if (!act3) {
        // ACT 1 & ACT 2: Forest & Arsonists
        this.bg.draw(ctx, time, this.t * 8, mood);
        this.particles.drawBgEmbers(ctx, mood * 0.85);

        // Lush/scorched forest ground
        drawPlatform(ctx, { x: 0, y: 214, w: LOGICAL_W, h: 56, type: 'grass' });

        // Draw cutscene trees
        const fireFrame = Math.floor(time * 9) % 3;
        for (let i = 0; i < this.trees.length; i++) {
          const tr = this.trees[i];
          const sprite = tr.burning ? 'tree_burning' : 'tree_lush';
          this.sprites.draw(ctx, sprite, tr.x - 12, tr.y - 32);
          if (tr.burning) {
            const f1 = `fire_${(fireFrame + i) % 3}`;
            const f2 = `fire_${(fireFrame + i + 1) % 3}`;
            this.sprites.draw(ctx, f1, tr.x - 11, tr.y - 33);
            this.sprites.draw(ctx, f2, tr.x - 2, tr.y - 26);
          }
        }

        // Two Pixelated Arsonists sneaking in, torching trees, then fleeing right
        const walkFrame = Math.floor(time * 7) % 2;
        const arsonists = [
          { enterEnd: 2.8, targetX: 256, fleeStart: 4.5 },
          { enterEnd: 3.1, targetX: 398, fleeStart: 4.75 }
        ];

        arsonists.forEach((a, idx) => {
          let ax;
          let flip = false; // default sprite faces left
          let spriteName = `arsonist_walk_${walkFrame}`;

          if (this.t < a.enterEnd) {
            const p = Math.min(1, this.t / a.enterEnd);
            ax = 490 - (490 - a.targetX) * p;
          } else if (this.t < a.fleeStart) {
            ax = a.targetX + (idx === 0 ? Math.sin(this.t * 4) * 14 : 0);
            spriteName = 'arsonist_ignite';
          } else {
            const p = (this.t - a.fleeStart) / 1.4;
            ax = a.targetX + p * 230;
            flip = true;
          }

          if (ax < LOGICAL_W + 20) {
            this.sprites.draw(ctx, spriteName, ax, 214 - 17, flip);
          }
        });

        this.particles.drawForeground(ctx);
      } else {
        // ACT 3: Hero Pixel Rhino stepping forward with Monkey & Tiger cheering!
        const localT = this.t - 6.2;
        this.bg.draw(ctx, time, 20 + localT * 6, 1);
        this.particles.drawBgEmbers(ctx, 0.9);

        // Hero grassy cliff & distant burning skyline
        drawPlatform(ctx, { x: 0, y: HERO_LEDGE_Y, w: 220, h: 66, type: 'grass' });
        drawPlatform(ctx, { x: 220, y: 244, w: 260, h: 26, type: 'rock' });
        drawPlatform(ctx, { x: 320, y: 204, w: 150, h: 40, type: 'rock' });

        // Distant burning trees on right cliff
        const fireFrame = Math.floor(time * 9) % 3;
        [356, 412].forEach((tx, idx) => {
          this.sprites.draw(ctx, 'tree_burning', tx - 12, 204 - 32);
          this.sprites.draw(ctx, `fire_${(fireFrame + idx) % 3}`, tx - 9, 204 - 32);
        });

        // Wooden Vine Slingshot ready on the hero ledge
        this.sprites.draw(ctx, 'slingshot_back', 166, HERO_LEDGE_Y - 27);
        this.sprites.draw(ctx, 'slingshot_front', 166, HERO_LEDGE_Y - 27);

        // Rhino marches heroically forward from x = 36 -> 122
        const stepProgress = Math.min(1, localT / 1.0);
        const rhinoX = 36 + (122 - 36) * stepProgress;
        const stompHop = stepProgress < 1 ? Math.abs(Math.sin(localT * 14)) * 3 : 0;
        const rhinoSprite = stepProgress >= 1 ? 'rhino_cheer' : `rhino_idle_${Math.floor(time * 8) % 2}`;
        this.sprites.draw(ctx, rhinoSprite, rhinoX, HERO_LEDGE_Y - 17 - stompHop);

        // Sparkle near Rhino's horn once posed
        if (stepProgress >= 1 && Math.floor(time * 8) % 2 === 0) {
          this.sprites.draw(ctx, 'spark', rhinoX + 20, HERO_LEDGE_Y - 22);
        }

        // Cheering Monkey & Tiger beside Rhino!
        const cheerFrame = Math.floor(time * 8) % 2;
        const hopM = Math.abs(Math.sin(time * 9)) * 5;
        const hopT = Math.abs(Math.sin(time * 9 + 1.4)) * 4;
        this.sprites.draw(ctx, `monkey_cheer_${cheerFrame}`, 44, HERO_LEDGE_Y - 15 - hopM);
        this.sprites.draw(ctx, `tiger_cheer_${cheerFrame}`, 76, HERO_LEDGE_Y - 14 - hopT);

        // Cheer sparks
        if (Math.floor(time * 6) % 2 === 0) {
          this.sprites.draw(ctx, 'spark', 48, HERO_LEDGE_Y - 24 - hopM);
          this.sprites.draw(ctx, 'spark', 86, HERO_LEDGE_Y - 22 - hopT);
        }
      }

      // Classic NES Cutscene Letterbox Bars & Crisp Pixel Caption
      ctx.fillStyle = '#0c050d';
      ctx.fillRect(0, 0, LOGICAL_W, 18);
      ctx.fillRect(0, LOGICAL_H - 34, LOGICAL_W, 34);
      ctx.fillStyle = '#f7c548';
      ctx.fillRect(0, LOGICAL_H - 34, LOGICAL_W, 2);

      let caption = '';
      if (this.t < 2.9) {
        caption = 'ARSONISTS SNEAK INTO THE PEACEFUL RAINFOREST...';
      } else if (this.t < 6.2) {
        caption = 'WILDFIRES ERUPT! KARHUTLA THREATENS THE FOREST!';
      } else {
        caption = 'HERO RHINO, MONKEY & TIGER STEP UP TO FIGHT BACK!';
      }
      drawPixelText(ctx, caption, LOGICAL_W / 2, LOGICAL_H - 21, 1, '#f7f1e3', 'center', '#140814');

      // Pixel flash transition at scene cut (t=6.2) and finish (t=9.5..9.8)
      if (Math.abs(this.t - 6.2) < 0.14) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 1 - Math.abs(this.t - 6.2) / 0.14;
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.globalAlpha = 1;
      } else if (this.t > 9.45) {
        ctx.fillStyle = '#140a14';
        ctx.globalAlpha = Math.min(1, (this.t - 9.45) / 0.35);
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ==========================================================================
  // 10. MAIN GAME ENGINE
  // ==========================================================================
  class KarhutlaRescueGame {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.ctx.imageSmoothingEnabled = false;

      // Subsystems
      this.sprites = new SpriteRenderer();
      this.audio = new SoundEngine();
      this.particles = new ParticleSystem();
      this.bg = new BackgroundRenderer();
      this.cutscene = new CutsceneController(this.sprites, this.bg, this.particles, this.audio);

      // DOM References
      this.dom = {
        hudLevel: document.getElementById('hud-level'),
        hudAmmo: document.getElementById('hud-ammo'),
        hudFires: document.getElementById('hud-fires'),
        hudScore: document.getElementById('hud-score'),
        btnPause: document.getElementById('btn-pause'),
        btnRestart: document.getElementById('btn-restart'),
        btnMute: document.getElementById('btn-mute'),
        btnPlay: document.getElementById('btn-play'),
        btnSkip: document.getElementById('btn-skip'),
        btnResume: document.getElementById('btn-resume'),
        btnPauseRestart: document.getElementById('btn-pause-restart'),
        btnPauseTitle: document.getElementById('btn-pause-title'),
        btnNextLevel: document.getElementById('btn-next-level'),
        btnVictoryReplay: document.getElementById('btn-victory-replay'),
        btnTryAgain: document.getElementById('btn-try-again'),
        btnGameoverTitle: document.getElementById('btn-gameover-title'),
        overlays: {
          title: document.getElementById('overlay-title'),
          cutscene: document.getElementById('overlay-cutscene'),
          pause: document.getElementById('overlay-pause'),
          victory: document.getElementById('overlay-victory'),
          gameover: document.getElementById('overlay-gameover')
        },
        pauseLevelName: document.getElementById('pause-level-name'),
        victoryHeading: document.getElementById('victory-heading'),
        victorySub: document.getElementById('victory-sub'),
        victoryStars: document.querySelectorAll('#victory-stars .pixel-star'),
        valFiresScore: document.getElementById('val-fires-score'),
        valAmmoBonus: document.getElementById('val-ammo-bonus'),
        valTotalScore: document.getElementById('val-total-score'),
        valFiresLeft: document.getElementById('val-fires-left'),
        valGameoverScore: document.getElementById('val-gameover-score')
      };

      // Game State
      this.state = STATE.TITLE;
      this.time = 0;
      this.lastFrame = 0;
      this.levelIndex = 0;
      this.totalScore = 0;
      this.levelScore = 0;
      this.lastWonLevelTotal = 0;
      this.ammo = 0;
      this.platforms = [];
      this.obstacles = [];
      this.trees = [];

      // Slingshot & Projectile State
      this.isDragging = false;
      this.activePointerId = null;
      this.pullX = SLING_ANCHOR.x;
      this.pullY = SLING_ANCHOR.y;
      this.lastStretchStep = 0;
      this.projectile = null;
      this.hasFiredOnce = false;

      // Reaction Timers & Juice
      this.cheerTimer = 0;
      this.worriedTimer = 0;
      this.throwPoseTimer = 0;
      this.levelBannerTimer = 0;
      this.settleTimer = 0; // wait beat before Victory/GameOver trigger
      this.shakeTimer = 0;
      this.shakeMag = 0;
      this.smokeAccum = 0;

      // Load Level 1 preview data so Title Screen shows live animated scene behind overlay
      this.loadLevel(0, true);
      this.setState(STATE.TITLE);

      this.bindEvents();
      requestAnimationFrame((ts) => this.loop(ts));
    }

    // ------------------------------------------------------------------------
    // STATE & OVERLAY MANAGEMENT
    // ------------------------------------------------------------------------
    setState(nextState) {
      this.state = nextState;
      Object.values(this.dom.overlays).forEach((el) => el.classList.remove('active'));

      if (nextState === STATE.TITLE) this.dom.overlays.title.classList.add('active');
      else if (nextState === STATE.CUTSCENE) this.dom.overlays.cutscene.classList.add('active');
      else if (nextState === STATE.PAUSED) {
        const lvl = LEVELS[this.levelIndex];
        this.dom.pauseLevelName.textContent = `LEVEL ${lvl.id} - ${lvl.name}`;
        this.dom.overlays.pause.classList.add('active');
      }
      else if (nextState === STATE.VICTORY) this.dom.overlays.victory.classList.add('active');
      else if (nextState === STATE.GAMEOVER) this.dom.overlays.gameover.classList.add('active');

      // Update Pause button label
      this.dom.btnPause.textContent = nextState === STATE.PAUSED ? 'RESUME' : 'PAUSE';
    }

    loadLevel(index, isPreview = false) {
      this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
      const def = LEVELS[this.levelIndex];

      this.ammo = def.ammo;
      this.levelScore = 0;
      this.platforms = def.platforms.map((p) => ({ ...p }));
      this.obstacles = def.obstacles.map((o) => ({ ...o, alive: true }));
      this.trees = def.trees.map((t, idx) => ({
        id: idx,
        x: t.x,
        y: t.y,
        burning: true,
        savedTimer: 0
      }));

      this.isDragging = false;
      this.activePointerId = null;
      this.pullX = SLING_ANCHOR.x;
      this.pullY = SLING_ANCHOR.y;
      this.projectile = null;
      this.cheerTimer = 0;
      this.worriedTimer = 0;
      this.throwPoseTimer = 0;
      this.settleTimer = 0;
      this.shakeTimer = 0;
      this.levelBannerTimer = isPreview ? 0 : 2.1;
      this.particles.clearLevelEffects();

      this.updateHUD();
    }

    startCutscene() {
      this.audio.init();
      this.audio.playButton();
      this.totalScore = 0;
      this.cutscene.reset();
      this.particles.clearLevelEffects();
      this.setState(STATE.CUTSCENE);
    }

    finishCutscene() {
      this.loadLevel(0, false);
      this.setState(STATE.PLAYING);
    }

    updateHUD() {
      const firesLeft = this.countFiresRemaining();
      this.dom.hudLevel.textContent = `${this.levelIndex + 1}/${LEVELS.length}`;
      this.dom.hudAmmo.textContent = String(this.ammo);
      this.dom.hudFires.textContent = String(firesLeft);
      this.dom.hudScore.textContent = String(this.totalScore + this.levelScore).padStart(5, '0');
    }

    countFiresRemaining() {
      let count = 0;
      for (const t of this.trees) if (t.burning) count++;
      return count;
    }

    // ------------------------------------------------------------------------
    // INPUT HANDLING (DESKTOP MOUSE + MOBILE TOUCH VIA POINTER EVENTS)
    // ------------------------------------------------------------------------
    bindEvents() {
      // UI Buttons
      this.dom.btnPlay.addEventListener('click', () => this.startCutscene());
      this.dom.btnSkip.addEventListener('click', () => {
        this.audio.playButton();
        this.finishCutscene();
      });

      this.dom.btnPause.addEventListener('click', () => {
        this.audio.playButton();
        if (this.state === STATE.PLAYING) this.setState(STATE.PAUSED);
        else if (this.state === STATE.PAUSED) this.setState(STATE.PLAYING);
      });

      this.dom.btnResume.addEventListener('click', () => {
        this.audio.playButton();
        this.setState(STATE.PLAYING);
      });

      const restartCurrentLevel = () => {
        this.audio.playButton();
        if (this.state === STATE.TITLE || this.state === STATE.CUTSCENE) {
          this.finishCutscene();
          return;
        }
        if (this.state === STATE.VICTORY) {
          this.totalScore = Math.max(0, this.totalScore - this.lastWonLevelTotal);
        }
        this.loadLevel(this.levelIndex, false);
        this.setState(STATE.PLAYING);
      };

      this.dom.btnRestart.addEventListener('click', restartCurrentLevel);
      this.dom.btnPauseRestart.addEventListener('click', restartCurrentLevel);
      this.dom.btnVictoryReplay.addEventListener('click', () => {
        // Replaying from victory shouldn't double-count the just-won level's score
        this.audio.playButton();
        this.totalScore = Math.max(0, this.totalScore - this.lastWonLevelTotal);
        this.loadLevel(this.levelIndex, false);
        this.setState(STATE.PLAYING);
      });
      this.dom.btnTryAgain.addEventListener('click', restartCurrentLevel);

      const goToTitle = () => {
        this.audio.playButton();
        this.totalScore = 0;
        this.loadLevel(0, true);
        this.setState(STATE.TITLE);
      };
      this.dom.btnPauseTitle.addEventListener('click', goToTitle);
      this.dom.btnGameoverTitle.addEventListener('click', goToTitle);

      this.dom.btnNextLevel.addEventListener('click', () => {
        this.audio.playButton();
        if (this.levelIndex + 1 < LEVELS.length) {
          this.loadLevel(this.levelIndex + 1, false);
          this.setState(STATE.PLAYING);
        } else {
          // Beat all levels -> play again from Level 1!
          this.totalScore = 0;
          this.loadLevel(0, false);
          this.setState(STATE.PLAYING);
        }
      });

      this.dom.btnMute.addEventListener('click', () => {
        const muted = this.audio.toggleMute();
        this.dom.btnMute.textContent = muted ? 'SFX:OFF' : 'SFX:ON';
        if (!muted) this.audio.playButton();
      });

      // Keyboard shortcuts
      window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (this.state === STATE.CUTSCENE && (key === ' ' || key === 'escape' || key === 'enter')) {
          e.preventDefault();
          this.audio.playButton();
          this.finishCutscene();
        } else if (this.state === STATE.TITLE && (key === ' ' || key === 'enter')) {
          e.preventDefault();
          this.startCutscene();
        } else if (key === 'p' || key === 'escape') {
          if (this.state === STATE.PLAYING) {
            this.audio.playButton();
            this.setState(STATE.PAUSED);
          } else if (this.state === STATE.PAUSED) {
            this.audio.playButton();
            this.setState(STATE.PLAYING);
          }
        } else if (key === 'r' && (this.state === STATE.PLAYING || this.state === STATE.PAUSED || this.state === STATE.GAMEOVER)) {
          restartCurrentLevel();
        } else if (key === 'm') {
          const muted = this.audio.toggleMute();
          this.dom.btnMute.textContent = muted ? 'SFX:OFF' : 'SFX:ON';
        }
      });

      // Pointer Events for Slingshot Aim & Launch (Unified Desktop Mouse + Mobile Touch)
      this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      window.addEventListener('pointermove', (e) => this.onPointerMove(e));
      window.addEventListener('pointerup', (e) => this.onPointerUp(e));
      window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    }

    clientToLogical(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * LOGICAL_W,
        y: ((clientY - rect.top) / rect.height) * LOGICAL_H
      };
    }

    onPointerDown(e) {
      this.audio.init();
      if (this.state !== STATE.PLAYING) return;
      if (this.projectile || this.ammo <= 0 || this.settleTimer > 0) return;

      const pt = this.clientToLogical(e.clientX, e.clientY);
      const dist = Math.hypot(pt.x - SLING_ANCHOR.x, pt.y - SLING_ANCHOR.y);

      // Generous grab area on the left slingshot zone so desktop & touch feel effortless
      if (dist <= 62 || (pt.x <= 175 && pt.y >= 115 && pt.y <= 250)) {
        this.isDragging = true;
        this.activePointerId = e.pointerId;
        this.lastStretchStep = 0;
        if (this.canvas.setPointerCapture) {
          try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
        }
        this.updatePullPosition(pt.x, pt.y);
      }
    }

    onPointerMove(e) {
      if (!this.isDragging || e.pointerId !== this.activePointerId) return;
      const pt = this.clientToLogical(e.clientX, e.clientY);
      this.updatePullPosition(pt.x, pt.y);
    }

    onPointerUp(e) {
      if (!this.isDragging || e.pointerId !== this.activePointerId) return;
      this.isDragging = false;
      this.activePointerId = null;

      const dx = SLING_ANCHOR.x - this.pullX;
      const dy = SLING_ANCHOR.y - this.pullY;
      const pullDist = Math.hypot(dx, dy);

      if (pullDist >= PHYSICS.MIN_PULL) {
        this.launchBalloon(dx * PHYSICS.POWER_SCALE, dy * PHYSICS.POWER_SCALE);
      }

      // Snap pouch back
      this.pullX = SLING_ANCHOR.x;
      this.pullY = SLING_ANCHOR.y;
    }

    updatePullPosition(lx, ly) {
      let dx = lx - SLING_ANCHOR.x;
      let dy = ly - SLING_ANCHOR.y;
      const dist = Math.hypot(dx, dy);
      if (dist > PHYSICS.MAX_PULL) {
        const ratio = PHYSICS.MAX_PULL / dist;
        dx *= ratio;
        dy *= ratio;
      }

      // Keep pouch comfortably inside canvas bounds while allowing steep high-arc pulls
      const clampedY = Math.max(24, Math.min(LOGICAL_H - 12, SLING_ANCHOR.y + dy));
      const clampedX = Math.max(12, Math.min(LOGICAL_W - 12, SLING_ANCHOR.x + dx));
      this.pullX = clampedX;
      this.pullY = clampedY;

      // Retro stretch tick SFX as tension rises
      const finalDist = Math.hypot(SLING_ANCHOR.x - this.pullX, SLING_ANCHOR.y - this.pullY);
      const step = Math.floor(finalDist / 10);
      if (step > this.lastStretchStep) {
        this.audio.playStretch(step);
      }
      this.lastStretchStep = step;
    }

    launchBalloon(vx, vy) {
      this.ammo--;
      this.hasFiredOnce = true;
      this.throwPoseTimer = 0.42;
      this.worriedTimer = 0;

      this.projectile = {
        x: SLING_ANCHOR.x,
        y: SLING_ANCHOR.y,
        vx,
        vy,
        r: 4.5,
        flightTime: 0,
        trailAccum: 0
      };

      this.audio.playLaunch();
      this.updateHUD();
    }

    // ------------------------------------------------------------------------
    // PHYSICS, COLLISION & WATER SPLASH EXTINGUISH LOGIC
    // ------------------------------------------------------------------------
    updateProjectile(dt) {
      const p = this.projectile;
      if (!p) return;

      const subDt = dt / PHYSICS.SUBSTEPS;
      let impacted = false;
      let directTree = null;
      let hitWood = null;
      let hitRock = false;

      for (let s = 0; s < PHYSICS.SUBSTEPS; s++) {
        p.flightTime += subDt;
        p.vy += PHYSICS.GRAVITY * subDt;
        p.x += p.vx * subDt;
        p.y += p.vy * subDt;

        // Water droplet trail
        p.trailAccum += subDt;
        if (p.trailAccum >= 0.032) {
          p.trailAccum = 0;
          this.particles.spawnWaterTrail(p.x, p.y);
        }

        // 1. Check direct collision with BURNING trees (saved trees don't block shots!)
        for (const tree of this.trees) {
          if (!tree.burning) continue;
          const box = { x: tree.x - 10, y: tree.y - 30, w: 20, h: 30 };
          if (this.circleIntersectsRect(p.x, p.y, p.r, box)) {
            impacted = true;
            directTree = tree;
            break;
          }
        }
        if (impacted) break;

        // 2. Check collision with living obstacles (wood & stone)
        for (const obs of this.obstacles) {
          if (!obs.alive) continue;
          if (this.circleIntersectsRect(p.x, p.y, p.r, obs)) {
            impacted = true;
            if (obs.material === 'wood') hitWood = obs;
            else hitRock = true;
            break;
          }
        }
        if (impacted) break;

        // 3. Check collision with terrain platforms (skip hero ledge immediately after launch)
        for (let i = 0; i < this.platforms.length; i++) {
          if (i === 0 && p.flightTime < 0.14) continue;
          if (this.circleIntersectsRect(p.x, p.y, p.r, this.platforms[i])) {
            impacted = true;
            hitRock = true;
            break;
          }
        }
        if (impacted) break;

        // 4. Out-of-bounds cleanup (allow soaring high above top edge y < 0!)
        if (p.x > LOGICAL_W + 45 || p.x < -45 || p.y > LOGICAL_H + 30) {
          this.projectile = null;
          this.onShotMiss();
          return;
        }
      }

      if (impacted) {
        this.detonateBalloon(p.x, p.y, directTree, hitWood, hitRock);
      }
    }

    circleIntersectsRect(cx, cy, r, rect) {
      const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
      const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy <= r * r;
    }

    detonateBalloon(x, y, directTree, hitWood, hitRock) {
      this.projectile = null;
      this.audio.playSplash();
      this.particles.spawnWaterSplash(x, y, PHYSICS.SPLASH_RADIUS);
      this.triggerShake(2.2, 0.16);

      // Destructible wooden obstacle shatters on direct hit!
      if (hitWood) {
        hitWood.alive = false;
        this.audio.playWoodBreak();
        this.particles.spawnWoodSplinters(hitWood.x, hitWood.y, hitWood.w, hitWood.h);
        this.levelScore += 100;
        this.particles.spawnPopup('WOOD SMASH! +100', hitWood.x + hitWood.w / 2, hitWood.y - 6, '#ffd147', 1);
        this.triggerShake(3.2, 0.2);
      } else if (hitRock) {
        this.audio.playRockHit();
        this.particles.spawnRockChips(x, y);
      }

      // Check all burning trees within blast/splash radius (plus guaranteed direct hit)
      const extinguished = [];
      for (const tree of this.trees) {
        if (!tree.burning) continue;
        const treeCenterX = tree.x;
        const treeCenterY = tree.y - 16;
        const dist = Math.hypot(treeCenterX - x, treeCenterY - y);
        // Also check distance to tree bounding box for fair splash edge detection
        const nearBox = this.circleIntersectsRect(x, y, PHYSICS.SPLASH_RADIUS, {
          x: tree.x - 10,
          y: tree.y - 30,
          w: 20,
          h: 30
        });
        if (tree === directTree || dist <= PHYSICS.SPLASH_RADIUS || nearBox) {
          tree.burning = false;
          tree.savedTimer = 0.01;
          extinguished.push(tree);
        }
      }

      if (extinguished.length > 0) {
        this.audio.playExtinguish(extinguished.length);
        this.cheerTimer = 1.65;
        this.worriedTimer = 0;

        extinguished.forEach((tr, idx) => {
          this.particles.spawnSteamBurst(tr.x, tr.y - 12);
          const isDirect = tr === directTree;
          const pts = isDirect ? 500 : 400;
          const comboBonus = idx > 0 ? 250 : 0;
          this.levelScore += pts + comboBonus;
          const label = idx > 0
            ? `COMBO! +${pts + comboBonus}`
            : (isDirect ? `DIRECT HIT! +${pts}` : `SAVED! +${pts}`);
          this.particles.spawnPopup(label, tr.x, tr.y - 38 - idx * 10, idx > 0 ? '#ffd147' : '#80e062', 1);
        });
      } else if (!hitWood) {
        this.onShotMiss();
      } else {
        // Smashed wood without putting out a fire — still check end-of-ammo!
        this.checkRoundResolution();
      }

      if (extinguished.length > 0) {
        this.checkRoundResolution();
      }

      this.updateHUD();
    }

    onShotMiss() {
      this.audio.playMiss();
      this.worriedTimer = 1.4;
      this.cheerTimer = 0;
      this.checkRoundResolution();
    }

    checkRoundResolution() {
      const firesLeft = this.countFiresRemaining();
      if (firesLeft === 0 || this.ammo <= 0) {
        this.settleTimer = 0.95; // Give player a moment to enjoy the splash & cheering
      }
    }

    triggerVictory() {
      const def = LEVELS[this.levelIndex];
      const ammoBonus = this.ammo * 300;
      const wonLevelTotal = this.levelScore + ammoBonus;
      this.lastWonLevelTotal = wonLevelTotal;
      this.totalScore += wonLevelTotal;
      this.updateHUD();

      // Calculate 1 to 3 stars based on unused balloons
      let stars = 1;
      if (this.ammo >= def.starThresholds[1]) stars = 2;
      if (this.ammo >= def.starThresholds[2]) stars = 3;

      const isFinalLevel = this.levelIndex === LEVELS.length - 1;
      this.dom.victoryHeading.textContent = isFinalLevel ? 'ALL FORESTS SAVED!' : 'FOREST SAVED!';
      this.dom.victorySub.textContent = isFinalLevel
        ? 'CONGRATULATIONS! RHINO & FRIENDS ARE TRUE HEROES!'
        : `LEVEL ${def.id} (${def.name}) CLEARED!`;
      this.dom.btnNextLevel.textContent = isFinalLevel ? 'PLAY AGAIN' : 'NEXT LEVEL';

      this.dom.valFiresScore.textContent = `+${this.levelScore}`;
      this.dom.valAmmoBonus.textContent = `+${ammoBonus} (${this.ammo}x300)`;
      this.dom.valTotalScore.textContent = String(this.totalScore).padStart(5, '0');

      this.dom.victoryStars.forEach((starEl, idx) => {
        starEl.classList.remove('earned');
        if (idx < stars) {
          // Force animation restart cleanly
          void starEl.offsetWidth;
          starEl.classList.add('earned');
        }
      });

      this.audio.playVictoryFanfare();
      this.setState(STATE.VICTORY);
    }

    triggerGameOver() {
      const firesLeft = this.countFiresRemaining();
      this.dom.valFiresLeft.textContent = String(firesLeft);
      this.dom.valGameoverScore.textContent = String(this.totalScore + this.levelScore).padStart(5, '0');
      this.audio.playGameOver();
      this.setState(STATE.GAMEOVER);
    }

    triggerShake(mag, duration) {
      this.shakeMag = Math.max(this.shakeMag, mag);
      this.shakeTimer = Math.max(this.shakeTimer, duration);
    }

    // ------------------------------------------------------------------------
    // MAIN 60 FPS GAME LOOP (DELTA-TIME)
    // ------------------------------------------------------------------------
    loop(timestamp) {
      if (!this.lastFrame) this.lastFrame = timestamp;
      const rawDt = (timestamp - this.lastFrame) / 1000;
      this.lastFrame = timestamp;
      // Clamp dt to protect physics when switching browser tabs
      const dt = Math.min(0.05, Math.max(0, rawDt));

      this.update(dt);
      this.render();

      requestAnimationFrame((ts) => this.loop(ts));
    }

    update(dt) {
      if (this.state === STATE.PAUSED) return;

      this.time += dt;

      if (this.state === STATE.CUTSCENE) {
        const done = this.cutscene.update(dt);
        this.particles.update(dt, this.time);
        if (done) this.finishCutscene();
        return;
      }

      // Update background embers, active particles & tree fire smoke in TITLE / PLAYING / VICTORY / GAMEOVER
      this.particles.update(dt, this.time);

      this.smokeAccum += dt;
      if (this.smokeAccum >= 0.09) {
        this.smokeAccum = 0;
        for (const tree of this.trees) {
          if (tree.burning) {
            this.particles.spawnFireSmoke(tree.x, tree.y - 12);
          }
        }
      }

      if (this.state !== STATE.PLAYING) return;

      // Update timers
      if (this.cheerTimer > 0) this.cheerTimer = Math.max(0, this.cheerTimer - dt);
      if (this.worriedTimer > 0) this.worriedTimer = Math.max(0, this.worriedTimer - dt);
      if (this.throwPoseTimer > 0) this.throwPoseTimer = Math.max(0, this.throwPoseTimer - dt);
      if (this.levelBannerTimer > 0) this.levelBannerTimer = Math.max(0, this.levelBannerTimer - dt);
      if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

      for (const tree of this.trees) {
        if (!tree.burning && tree.savedTimer > 0) {
          tree.savedTimer += dt;
        }
      }

      // Active water balloon physics
      if (this.projectile) {
        this.updateProjectile(dt);
      }

      // Wait beat before Victory / Game Over modal appears
      if (this.settleTimer > 0 && !this.projectile) {
        this.settleTimer -= dt;
        if (this.settleTimer <= 0) {
          if (this.countFiresRemaining() === 0) {
            this.triggerVictory();
          } else if (this.ammo <= 0) {
            this.triggerGameOver();
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // RENDERING PIPELINE (CRISP 8-BIT PIXELS)
    // ------------------------------------------------------------------------
    render() {
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;

      if (this.state === STATE.CUTSCENE) {
        this.cutscene.draw(ctx, this.time);
        return;
      }

      ctx.save();
      // Pixel-snapped screen shake
      if (this.shakeTimer > 0) {
        const sx = Math.round((Math.random() * 2 - 1) * this.shakeMag);
        const sy = Math.round((Math.random() * 2 - 1) * this.shakeMag);
        ctx.translate(sx, sy);
      }

      // Dynamic sky mood: shifts slightly clearer when all fires are extinguished!
      const firesLeft = this.countFiresRemaining();
      const skyMood = firesLeft === 0 ? 0.35 : 1;
      const parallaxShift = this.projectile ? Math.min(28, Math.max(0, (this.projectile.x - 100) * 0.08)) : 0;

      // 1. Layered 8-bit parallax burning forest background + floating embers
      this.bg.draw(ctx, this.time, parallaxShift, skyMood);
      this.particles.drawBgEmbers(ctx, firesLeft === 0 ? 0.2 : 0.85);

      // 2. Terrain cliffs & grassy hero ledge
      for (const plat of this.platforms) {
        drawPlatform(ctx, plat);
      }

      // 3. Obstacles (wooden barricades & stone boulders)
      for (const obs of this.obstacles) {
        if (obs.alive) drawObstacle(ctx, obs);
      }

      // 4. Target Trees (burning with animated 8-bit flames, or saved lush green!)
      const fireFrame = Math.floor(this.time * 9) % 3;
      for (let i = 0; i < this.trees.length; i++) {
        const tree = this.trees[i];
        const sprite = tree.burning ? 'tree_burning' : 'tree_saved';
        this.sprites.draw(ctx, sprite, tree.x - 12, tree.y - 32);

        if (tree.burning) {
          const fA = `fire_${(fireFrame + i) % 3}`;
          const fB = `fire_${(fireFrame + i + 1) % 3}`;
          const sway = (fireFrame === 1 ? 1 : 0);
          this.sprites.draw(ctx, fA, tree.x - 11 + sway, tree.y - 33);
          this.sprites.draw(ctx, fB, tree.x - 1 - sway, tree.y - 25);
        } else if (tree.savedTimer < 2.2 && Math.floor(this.time * 8) % 2 === 0) {
          // Subtle glistening sparkle on freshly saved trees
          this.sprites.draw(ctx, 'spark', tree.x - 8, tree.y - 32);
        }
      }

      // 5. Cheering Squad (Monkey & Tiger) + Hero Pixel Rhino
      this.drawCharacters(ctx);

      // 6. Slingshot Back Fork, Back Elastic Vine Band, Loaded Balloon, Front Elastic Band, Front Fork
      this.drawSlingshot(ctx);

      // 7. Dotted Parabolic Trajectory & Retro Power Meter (when aiming)
      if (this.isDragging) {
        this.drawAimTrajectoryAndMeter(ctx);
      }

      // 8. In-flight wobbling 8-bit Water Balloon
      if (this.projectile) {
        const wobbleIdx = Math.floor(this.projectile.flightTime * 16) % 3;
        const bSprite = `balloon_${wobbleIdx}`;
        this.sprites.draw(ctx, bSprite, this.projectile.x - 5, this.projectile.y - 5);
      }

      // 9. Foreground Particles (Water Splash, Steam, Splinters) & Score Popups
      this.particles.drawForeground(ctx);

      // 10. In-Canvas Level Intro Banner & First-Shot Aim Prompt
      if (this.state === STATE.PLAYING) {
        this.drawInCanvasPrompts(ctx);
      }

      ctx.restore();
    }

    drawCharacters(ctx) {
      const idleFrame = Math.floor(this.time * 3.5) % 2;
      const cheerFrame = Math.floor(this.time * 9) % 2;
      const isCheering = this.cheerTimer > 0 || this.state === STATE.VICTORY;
      const isWorried = this.worriedTimer > 0 && !isCheering;

      // --- Pixel Monkey (far left) ---
      const monkeyX = 11;
      const monkeyHop = isCheering ? Math.round(Math.abs(Math.sin(this.time * 10)) * 6) : 0;
      const monkeySprite = isCheering
        ? `monkey_cheer_${cheerFrame}`
        : (isWorried ? 'monkey_worried' : `monkey_idle_${idleFrame}`);
      this.sprites.draw(ctx, monkeySprite, monkeyX, HERO_LEDGE_Y - 15 - monkeyHop);

      // --- Pixel Tiger (between Monkey & Rhino) ---
      const tigerX = 32;
      const tigerHop = isCheering ? Math.round(Math.abs(Math.sin(this.time * 10 + 1.3)) * 5) : 0;
      const tigerSprite = isCheering
        ? `tiger_cheer_${cheerFrame}`
        : (isWorried ? 'tiger_worried' : `tiger_idle_${idleFrame}`);
      this.sprites.draw(ctx, tigerSprite, tigerX, HERO_LEDGE_Y - 14 - tigerHop);

      // --- Hero Pixel Rhino (standing right behind the slingshot) ---
      const rhinoX = 64;
      const rhinoHop = isCheering ? Math.round(Math.abs(Math.sin(this.time * 8 + 0.6)) * 3) : 0;
      let rhinoSprite = `rhino_idle_${idleFrame}`;
      if (this.isDragging) rhinoSprite = 'rhino_aim';
      else if (this.throwPoseTimer > 0) rhinoSprite = 'rhino_throw';
      else if (isCheering) rhinoSprite = 'rhino_cheer';
      else if (isWorried) rhinoSprite = 'rhino_worried';

      this.sprites.draw(ctx, rhinoSprite, rhinoX, HERO_LEDGE_Y - 17 - rhinoHop);

      // Expressive 8-bit emotes above cheering/worried buddies
      if (isCheering && Math.floor(this.time * 8) % 2 === 0) {
        this.sprites.draw(ctx, 'spark', monkeyX + 4, HERO_LEDGE_Y - 24 - monkeyHop);
        this.sprites.draw(ctx, 'spark', tigerX + 8, HERO_LEDGE_Y - 22 - tigerHop);
      } else if (isWorried) {
        const dropBob = Math.floor(this.time * 6) % 2;
        this.sprites.draw(ctx, 'sweat', monkeyX + 10, HERO_LEDGE_Y - 21 + dropBob);
        this.sprites.draw(ctx, 'sweat', tigerX + 14, HERO_LEDGE_Y - 20 + dropBob);
      }

      // Small stack of spare water balloons resting beside the slingshot!
      const spareCount = Math.min(4, Math.max(0, this.ammo - (this.projectile ? 0 : 1)));
      for (let i = 0; i < spareCount; i++) {
        const bx = 88 - i * 6;
        const by = HERO_LEDGE_Y - 8 + (i % 2);
        this.sprites.draw(ctx, 'balloon_0', bx, by);
      }
    }

    drawSlingshot(ctx) {
      const sx = SLING_ANCHOR.x - 8;
      const sy = HERO_LEDGE_Y - 27;

      // Back wooden fork
      this.sprites.draw(ctx, 'slingshot_back', sx, sy);

      const pouchX = this.isDragging ? this.pullX : SLING_ANCHOR.x;
      const pouchY = this.isDragging ? this.pullY : SLING_ANCHOR.y;
      const backForkX = SLING_ANCHOR.x + 3;
      const backForkY = SLING_ANCHOR.y + 1;
      const frontForkX = SLING_ANCHOR.x - 5;
      const frontForkY = SLING_ANCHOR.y + 1;

      const hasLoadedBalloon = !this.projectile && this.ammo > 0 && this.state !== STATE.VICTORY;

      // Back vine elastic band
      if (this.isDragging || hasLoadedBalloon) {
        drawPixelLine(ctx, backForkX, backForkY, pouchX, pouchY, '#1d5932', 2);
      }

      // Water balloon nestled in pouch
      if (hasLoadedBalloon) {
        const idleBob = this.isDragging ? 0 : Math.round(Math.sin(this.time * 5) * 0.6);
        this.sprites.draw(ctx, 'balloon_0', pouchX - 5, pouchY - 5 + idleBob);
      }

      // Front vine elastic band
      if (this.isDragging || hasLoadedBalloon) {
        drawPixelLine(ctx, frontForkX, frontForkY, pouchX, pouchY, '#7ad152', 2);
      } else {
        // Slack vine band when waiting
        drawPixelLine(ctx, frontForkX, frontForkY, backForkX, backForkY, '#3b9444', 2);
      }

      // Front wooden fork
      this.sprites.draw(ctx, 'slingshot_front', sx, sy);
    }

    drawAimTrajectoryAndMeter(ctx) {
      const dx = SLING_ANCHOR.x - this.pullX;
      const dy = SLING_ANCHOR.y - this.pullY;
      const pullDist = Math.hypot(dx, dy);
      if (pullDist < PHYSICS.MIN_PULL) return;

      const vx = dx * PHYSICS.POWER_SCALE;
      const vy = dy * PHYSICS.POWER_SCALE;

      // Blocky pixel dotted parabolic trajectory (exact physics match!)
      const dotCount = 15;
      const dtStep = 0.068;
      for (let i = 1; i <= dotCount; i++) {
        const t = i * dtStep;
        const px = SLING_ANCHOR.x + vx * t;
        const py = SLING_ANCHOR.y + vy * t + 0.5 * PHYSICS.GRAVITY * t * t;
        if (px > LOGICAL_W || py > LOGICAL_H) break;

        const size = i <= 6 ? 3 : 2;
        const half = Math.floor(size / 2);
        // Dark pixel border around bright cyan/white trajectory dot for instant visibility
        ctx.fillStyle = '#16101c';
        ctx.fillRect(Math.round(px) - half - 1, Math.round(py) - half - 1, size + 2, size + 2);
        ctx.fillStyle = i % 2 === 0 ? '#a8e8ff' : '#ffffff';
        ctx.fillRect(Math.round(px) - half, Math.round(py) - half, size, size);
      }

      // Retro Segmented 8-Bit Power Meter above Hero Ledge
      const powerRatio = Math.min(1, pullDist / PHYSICS.MAX_PULL);
      const powerPct = Math.round(powerRatio * 100);
      const meterX = 24;
      const meterY = 148;
      const segs = 10;
      const filledSegs = Math.max(1, Math.round(powerRatio * segs));

      // Frame
      ctx.fillStyle = '#16101c';
      ctx.fillRect(meterX - 2, meterY - 2, segs * 6 + 4, 12);
      ctx.fillStyle = '#2d1c2e';
      ctx.fillRect(meterX, meterY, segs * 6, 8);

      for (let i = 0; i < segs; i++) {
        if (i < filledSegs) {
          ctx.fillStyle = i < 4 ? '#7ad152' : (i < 7 ? '#ffd147' : '#ff5b1c');
          ctx.fillRect(meterX + i * 6 + 1, meterY + 1, 4, 6);
        } else {
          ctx.fillStyle = '#1b111c';
          ctx.fillRect(meterX + i * 6 + 1, meterY + 1, 4, 6);
        }
      }
      drawPixelText(ctx, `PWR ${powerPct}%`, meterX, meterY - 9, 1, '#ffd147', 'left', '#16101c');
    }

    drawInCanvasPrompts(ctx) {
      // Level start banner
      if (this.levelBannerTimer > 0) {
        const def = LEVELS[this.levelIndex];
        const alpha = Math.min(1, this.levelBannerTimer * 1.4);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#16101c';
        ctx.fillRect(LOGICAL_W / 2 - 96, 22, 192, 26);
        ctx.fillStyle = '#f7c548';
        ctx.fillRect(LOGICAL_W / 2 - 94, 24, 188, 2);
        ctx.fillRect(LOGICAL_W / 2 - 94, 44, 188, 2);
        drawPixelText(ctx, `LEVEL ${def.id}: ${def.name}`, LOGICAL_W / 2, 31, 1, '#f7f1e3', 'center', '#000000');
        ctx.restore();
      }

      // Gentle blinking aim hint before the very first shot
      if (!this.hasFiredOnce && !this.isDragging && !this.projectile && this.levelBannerTimer <= 0.4) {
        const bob = Math.round(Math.sin(this.time * 6) * 2);
        drawPixelText(ctx, 'DRAG BACK TO AIM!', 88, 152 + bob, 1, '#a8e8ff', 'center', '#16101c');
      }
    }
  }

  // Boot the game once DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    window.karhutlaGame = new KarhutlaRescueGame();
  });
})();
