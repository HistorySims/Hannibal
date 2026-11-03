// =====================================================================
//  pixel.js: shared Game Boy-style renderer for the battles.
//
//  The world is drawn into a small low-resolution canvas (8 px per tile)
//  and scaled up by a whole number, so every pixel sits on one grid.
//  Sprites are tiny string-art pictures, auto-outlined, recoloured per
//  faction, and cached. Game logic stays in grid coordinates; the
//  renderer interpolates positions so units glide between tiles.
// =====================================================================
const PX = (() => {
  const T = 8;                 // buffer pixels per tile
  let canvas, ctx, scale = 3, W = 0, H = 0;
  let camX = 0, camY = 0;      // top-left of view, in buffer pixels
  let t = 0;                   // frame counter for animation
  let shakeT = 0;

  // ---------------------------------------------------------------
  //  STYLES (pick with ?style=name; used to compare looks)
  // ---------------------------------------------------------------
  const STYLES = {
    classic: { palette:'full',  outline:'dark', ground:1.0, scale:3 },
    muted:   { palette:'muted', outline:'soft', ground:0.25, scale:3 },
    gameboy: { palette:'dmg',   outline:'dark', ground:0.25, scale:3 },
    big:     { palette:'muted', outline:'soft', ground:0.25, scale:4 },
    flat:    { palette:'full',  outline:'none', ground:0.0, scale:3 },
  };
  let styleName = 'classic';
  try { const q = new URLSearchParams(location.search).get('style'); if(q && STYLES[q]) styleName = q; } catch(e){}
  const style = STYLES[styleName];

  const DMG = ['#0f380f','#306230','#8bac0f','#9bbc0f'];
  const colCache = new Map();
  // Map any '#rrggbb' through the current style's palette
  function col(c){
    if(typeof c !== 'string' || c[0] !== '#' || c.length !== 7 || style.palette === 'full') return c;
    if(colCache.has(c)) return colCache.get(c);
    let r = parseInt(c.slice(1,3),16)/255, g = parseInt(c.slice(3,5),16)/255, b = parseInt(c.slice(5,7),16)/255;
    let out;
    if(style.palette === 'dmg'){
      const lum = 0.299*r + 0.587*g + 0.114*b;
      out = DMG[Math.max(0, Math.min(3, Math.floor(lum*4.2)))];
    } else {
      // muted: pull saturation down and compress contrast toward a warm mid-tone
      const avg = (r+g+b)/3;
      const k = 0.5;
      r = avg + (r-avg)*k; g = avg + (g-avg)*k; b = avg + (b-avg)*k;
      const lift = (v, t) => v*0.78 + t*0.22;
      r = lift(r, 0.62); g = lift(g, 0.56); b = lift(b, 0.46);
      const h = v => Math.round(Math.max(0, Math.min(1, v))*255).toString(16).padStart(2,'0');
      out = '#'+h(r)+h(g)+h(b);
    }
    colCache.set(c, out);
    return out;
  }

  // ---------------------------------------------------------------
  //  PALETTE
  // ---------------------------------------------------------------
  const OUTLINE = style.palette === 'dmg' ? '#0f380f' : '#1a1410';
  const SPRITE_OUTLINE = style.outline === 'soft' ? 'rgba(40,30,20,0.45)' : OUTLINE;
  const C = {
    skin:'#e0a878', skinD:'#b07850', eye:'#2a1a12',
    iron:'#b8c0c8', ironD:'#6f7a86', bronze:'#d8a040', bronzeD:'#9a6a28', gold:'#f8d048',
    white:'#f0ece0', black:'#201810',
    rRed:'#c83828', rRedD:'#882018', plume:'#e04030',
    green:'#38a848', greenD:'#207030',
    cBlue:'#3868c8', cBlueD:'#24448a', purple:'#8048b0', purpleD:'#56307a',
    gaulHair:'#d07a30', gaulCloth:'#5a8a3a', gaulClothD:'#3a5a28', tartan:'#a85030',
    spanWhite:'#ece6d4', spanRed:'#b02838',
    leather:'#8a5a30', leatherD:'#5a3a20', fur:'#7a5a3a',
    horse:'#7a4a28', horseD:'#4a2c18', horseLight:'#b88a58',
    eleph:'#8a8a90', elephD:'#5a5a62', tusk:'#f4f0e0',
    merc:'#58a030', mercD:'#386818',
  };

  // ---------------------------------------------------------------
  //  SPRITES (front view; back views are derived by mirroring)
  //  Key: r crest, h helmet, H helmet dark, s skin, k eye, c coat, C coat dark,
  //       m armour, M armour dark, b shield, B shield edge, y boss/trim,
  //       g hair, l legs, f feet, w white, x spear
  // ---------------------------------------------------------------
  const LEGS = [
    ["..l..l..", "..f..f.."],
    [".l...l..", ".f....f."],
  ];
  const ART = {
    legionary: { head:3, rows:[
      "..rrr...",
      ".hhhhh..",
      ".hkskh..",
      "..sss.bB",
      ".cmmmcbB",
      ".cmmmcyB",
      ".cmMmcbB",
      "..CCC.bB",
    ]},
    centurion: { head:3, rows:[
      "rrrrrrr.",
      ".hhhhh..",
      ".hkskh..",
      "..sss.bB",
      ".cmymcbB",
      ".cmmmcyB",
      ".cmymcbB",
      "..CCC.bB",
    ]},
    velite: { head:3, rows:[
      ".hhhhh..",
      "hhHHHhh.",
      ".hkskh..",
      "..sss...",
      ".cccccbb",
      ".cCcCcyb",
      ".ccccc..",
      "..CCC...",
    ]},
    gaul: { head:3, rows:[
      "..gg.g..",
      ".ggggg..",
      "gskskg..",
      ".ssssbb.",
      ".sssbbbB",
      ".cyccbyB",
      ".ccccbbB",
      "..CCC.b.",
    ]},
    spaniard: { head:3, rows:[
      "..hhh...",
      ".hhhhh..",
      ".hkskh..",
      "..sss.bb",
      ".cwwwcbB",
      ".cwwwcyB",
      ".ccccc.B",
      "..CCC...",
    ]},
    libyan: { head:3, rows:[
      "..hhh...",
      ".hhhhH..",
      ".Hkskh..",
      "..sss.bb",
      ".mmmmmby",
      ".mMmMmbb",
      ".mmmmm.b",
      "..ccc...",
    ]},
    levy: { head:3, rows:[
      "..hhh...",
      ".hhhhH..",
      ".hkskh..",
      "..sss.bb",
      ".wwwwwby",
      ".cwcwcbb",
      ".ccccc.b",
      "..CCC...",
    ]},
    merc: { head:3, rows:[
      "..hhh...",
      ".hhhhh..",
      ".hkskh..",
      "..sss.b.",
      ".ccccbbb",
      ".cCcCbyb",
      ".ccccbbb",
      "..CCC.b.",
    ]},
    forager: { head:3, rows:[
      "........",
      ".gggg...",
      ".gksk...",
      "..ss.ww.",
      ".cccwwww",
      ".cCcwwww",
      ".ccc.ww.",
      "..CC....",
    ]},
  };

  // ---------------------------------------------------------------
  //  ALTERNATIVE SPRITE SETS (pick with ?sprites=name)
  //  Each art entry: front rows, optional back rows, optional alt walk rows
  //  ({rowIndex: string}) for front/back. Sets with `vflip` draw the back
  //  (facing up the screen) and get the front by flipping it vertically.
  //  x/X (spear shaft/tip) never cast an outline, so weapons stay thin.
  // ---------------------------------------------------------------
  const SETS = {
    spear: { shadow:true, art:{
      legionary: {
        front:[".X..r...",".x.hhh..",".x.sks..",".xbbbbb.",".sbbybb.","..bbbbb.","..BbbbB.","...l.l..","...f.f.."],
        frontAlt:{7:"....ll..",8:"....ff.."},
        back:["...r..X.","..hhh.x.","..HsH.x.",".BmmmBs.",".BmMmBx.",".BcccB..","..CcC...","..l.l...","..f.f..."],
        backAlt:{7:"...ll...",8:"...ff..."},
      },
      centurion: {
        front:["..rrrrr.","...hhh..",".X.sks..",".Xbbbbb.",".sbbybb.","..bbbbb.","..BbbbB.","...l.l..","...f.f.."],
        frontAlt:{7:"....ll..",8:"....ff.."},
        back:[".rrrrr..","..hhh...","..HsH.X.",".BmymBX.",".BmmmBs.",".BcccB..","..CcC...","..l.l...","..f.f..."],
        backAlt:{7:"...ll...",8:"...ff..."},
      },
      gaul: {
        front:[".X.g.gg.",".x.gggg.",".x.sks..",".xsbbbs.",".s.byb..","...bbb..","...cbc..","...c.c..","...f.f.."],
        frontAlt:{7:"....cc..",8:"....ff.."},
        back:["..g.g.X.",".gggg.x.","..gsg.x.","..sss.s.",".BsssB..","..ccc...","..cCc...","..c.c...","..f.f..."],
        backAlt:{7:"...cc...",8:"...ff..."},
      },
      spaniard: {
        front:["...rr...","..Xhhh..","..Xsks..","..swwwbb","...wrwbb","...www..","...rrr..","...l.l..","...f.f.."],
        frontAlt:{7:"....ll..",8:"....ff.."},
        back:["...rr...","..hhhX..","..HsHX..","bbwwws..","bbwrw...","..www...","..rrr...","..l.l...","..f.f..."],
        backAlt:{7:"...ll...",8:"...ff..."},
      },
      libyan: {
        front:[".X..h...",".x.hhh..",".x.sks..",".x.bbb..",".sbbybb.","..bbbbb.","...bbb..","...l.l..","...f.f.."],
        frontAlt:{7:"....ll..",8:"....ff.."},
        back:["...h..X.","..hhh.x.","..HsH.x.","..mmm.s.",".BmMmB..",".BmmmB..","..ccc...","..l.l...","..f.f..."],
        backAlt:{7:"...ll...",8:"...ff..."},
      },
    }},

    topdown: { shadow:false, vflip:true, art:{
      legionary: { back:[".......X","bbbbbb.x","BbbybB.x",".mhrhm.s","..hhh...","...m....","........","........"] },
      centurion: { back:["........","bbbbbb..","BbbybB..",".mrrrm..","..hhh...","...m....","........","........"] },
      gaul:      { back:["X.......","x.bbb...","xbbybb..","ssgggss.","..ggg...","...s....","........","........"] },
      spaniard:  { back:["......X.",".bb...X.","bbbwwws.",".bwrrw..","..whhw..","...ww...","........","........"] },
      libyan:    { back:["X.......","x.bbbb..","xbbbybb.","x.bbbb..","..mhm...","...h....","........","........"] },
    }},

    chibi: { shadow:true, head:5, art:{
      legionary: { front:["...rr...","..hhhh..",".hhhhhh.",".hksskh.","..ssss..","bbccccs.","bbcmmc..","..l..l..","..f..f.."], frontAlt:{7:"...ll...",8:"...ff..."} },
      centurion: { front:[".rrrrrr.","..hhhh..",".hhhhhh.",".hksskh.","..ssss..","bbcyycs.","bbcmmc..","..l..l..","..f..f.."], frontAlt:{7:"...ll...",8:"...ff..."} },
      gaul:      { front:[".g.gg.g.",".gggggg.","gggggggg","ggksskgg","..ssss..","bbssss..","bbcccc..","..c..c..","..f..f.."], frontAlt:{7:"...cc...",8:"...ff..."} },
      spaniard:  { front:["...rr...","..hhhh..",".hhhhhh.",".hksskh.","..ssss..",".wwwwbb.",".wrrwbb.","..l..l..","..f..f.."], frontAlt:{7:"...ll...",8:"...ff..."} },
      libyan:    { front:["...hh...","..hhhh..",".hhhhhh.",".Hksskh.","..ssss..","bbmmmm..","bbmmmm..","..l..l..","..f..f.."], frontAlt:{7:"...ll...",8:"...ff..."} },
    }},

    tiny: { shadow:true, head:5, art:{
      legionary: { front:["........","........","...r....","..hhh...","..sss...",".bccc...",".bccc...","..l.l...","..f.f..."], frontAlt:{7:"..ll....",8:"..ff...."} },
      centurion: { front:["........","........",".rrrrr..","..hhh...","..sss...",".bccc...",".bccc...","..l.l...","..f.f..."], frontAlt:{7:"..ll....",8:"..ff...."} },
      gaul:      { front:["........","........","..g.g...","..ggg...","..sss...",".bsss...",".bccc...","..c.c...","..f.f..."], frontAlt:{7:"..cc....",8:"..ff...."} },
      spaniard:  { front:["........","........","...r....","..hhh...","..sss...","..wwwb..","..rrrb..","..l.l...","..f.f..."], frontAlt:{7:"..ll....",8:"..ff...."} },
      libyan:    { front:["........","........","...h....","..hhh...","..sss...",".bmmm...",".bmmm...","..l.l...","..f.f..."], frontAlt:{7:"..ll....",8:"..ff...."} },
    }},
  };
  // which art each other kind borrows in the new sets
  const ART_FALLBACK = { velite:'spaniard', levy:'libyan', merc:'gaul', forager:'spaniard' };
  let spriteSet = null;
  try { const q = new URLSearchParams(location.search).get('sprites'); if(q && SETS[q]) spriteSet = q; } catch(e){}
  // catch typos in the art while developing
  for(const [sn, S] of Object.entries(SETS)) for(const [an, A] of Object.entries(S.art)){
    for(const part of ['front','back']) if(A[part]) A[part].forEach((r,i)=>{ if(r.length!==8) console.error('pixel.js art', sn, an, part, i, r); });
  }

  function setRows(A, S, back, frame){
    if(S.vflip){
      const base = A.back;
      return back ? base.slice() : base.slice().reverse();
    }
    let rows, alt;
    if(back && A.back){ rows = A.back.slice(); alt = A.backAlt; }
    else if(back){
      // derive the back by mirroring the front and covering the face
      const head = S.head || 3;
      rows = A.front.map((r, i) => {
        let m = r.split('').reverse().join('');
        if(i < head) m = m.replace(/[sk]/g, 'H');
        else m = m.replace(/y/g,'B');
        return m;
      });
      alt = A.frontAlt && Object.fromEntries(Object.entries(A.frontAlt).map(([k,v]) => [k, v.split('').reverse().join('')]));
    } else { rows = A.front.slice(); alt = A.frontAlt; }
    if(frame && alt) for(const [k,v] of Object.entries(alt)) rows[+k] = v;
    return rows;
  }

  // Colour maps per unit kind (what each art key means for that kind)
  const KINDS = {
    roman:     { art:'legionary', map:{ r:C.plume, h:C.iron, H:C.ironD, c:C.rRed, C:C.rRedD, m:C.iron, M:C.ironD, b:C.rRed, B:C.rRedD, y:C.gold } },
    triarii:   { art:'legionary', map:{ r:C.black, h:C.iron, H:C.ironD, c:C.rRedD, C:'#5a1810', m:C.iron, M:C.ironD, b:C.rRedD, B:'#5a1810', y:C.gold } },
    yours:     { art:'centurion', map:{ r:C.white, h:C.iron, H:C.ironD, c:C.green, C:C.greenD, m:C.iron, M:C.ironD, b:C.green, B:C.greenD, y:C.gold } },
    velite:    { art:'velite',    map:{ h:C.fur, H:C.leatherD, c:'#d8c090', C:'#a89060', b:C.leather, y:C.gold } },
    gaul:      { art:'gaul',      map:{ g:C.gaulHair, c:C.tartan, C:'#6a3018', y:C.gaulHair, b:C.gaulCloth, B:C.gaulClothD } },
    spaniard:  { art:'spaniard',  map:{ h:C.leatherD, H:C.black, r:C.spanRed, c:C.spanRed, C:'#701828', b:C.leather, B:C.leatherD, y:C.bronze } },
    libyan:    { art:'libyan',    map:{ h:C.bronze, H:C.bronzeD, m:C.iron, M:C.ironD, c:C.cBlue, b:C.bronze, B:C.bronzeD, y:C.gold } },
    levy:      { art:'levy',      map:{ h:C.bronze, H:C.bronzeD, c:C.cBlue, C:C.cBlueD, b:C.cBlue, y:C.gold } },
    veteran:   { art:'libyan',    map:{ h:C.gold, H:C.bronzeD, m:C.bronze, M:C.bronzeD, c:C.purple, b:C.purple, B:C.purpleD, y:C.gold } },
    merc:      { art:'merc',      map:{ h:C.leather, c:C.merc, C:C.mercD, b:C.leather, y:C.gold } },
    forager:   { art:'forager',   map:{ g:C.black, c:C.leather, C:C.leatherD } },
  };
  // Defaults for every art key, so a kind that doesn't define one still gets a sensible colour
  const BASE = { s:C.skin, k:C.eye, l:C.skinD, f:C.black, w:C.white, x:'#7a5a34', X:C.iron,
                 r:C.rRed, h:C.leather, H:C.leatherD, c:C.leather, C:C.leatherD, m:C.iron, M:C.ironD,
                 b:C.leather, B:C.leatherD, y:C.gold, g:C.black };
  const NO_OUTLINE = 'xX';

  // ---------------------------------------------------------------
  //  SPRITE CACHE: build, outline, mirror, flash
  // ---------------------------------------------------------------
  const cache = new Map();
  function mk(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // Paint a pixel grid (rows of colour strings / null) with a 1px outline into a new canvas.
  function bake(grid, flash){
    const h = grid.length, w = grid[0].length;
    const cv = mk(w + 2, h + 2), g = cv.getContext('2d');
    const at = (x,y) => (y>=0 && y<h && x>=0 && x<w) ? grid[y][x] : null;
    const solid = (x,y) => { const e = at(x,y); return !!e && !(Array.isArray(e) && !e[1]); };
    g.fillStyle = SPRITE_OUTLINE;
    if(style.outline !== 'none') for(let y=-1; y<=h; y++) for(let x=-1; x<=w; x++){
      if(solid(x,y)) continue;
      if(solid(x-1,y)||solid(x+1,y)||solid(x,y-1)||solid(x,y+1)) g.fillRect(x+1, y+1, 1, 1);
    }
    for(let y=0; y<h; y++) for(let x=0; x<w; x++){
      const e = grid[y][x];
      if(!e) continue;
      g.fillStyle = flash ? '#ffffff' : col(Array.isArray(e) ? e[0] : e);
      g.fillRect(x+1, y+1, 1, 1);
    }
    return cv;
  }

  function artGrid(kind, back, frame){
    const K = KINDS[kind] || KINDS.roman;
    if(spriteSet){
      const S = SETS[spriteSet];
      const A = S.art[K.art] || S.art[ART_FALLBACK[K.art]] || S.art.legionary;
      const rows = setRows(A, S, back, frame);
      const map = Object.assign({}, BASE, K.map);
      return rows.map(r => r.split('').map(ch => ch==='.' ? null : [map[ch] || '#ff00ff', !NO_OUTLINE.includes(ch)]));
    }
    const A = ART[K.art];
    let rows = A.rows.concat(LEGS[frame]);
    if(back){
      rows = rows.map((r, i) => {
        let m = r.split('').reverse().join('');
        if(i < A.head) m = m.replace(/[sk]/g, i===0 ? 'h' : 'H').replace(/g/g,'g');
        else m = m.replace(/m/g,'c').replace(/M/g,'C').replace(/y/g,'B');
        return m;
      });
    }
    const map = Object.assign({}, BASE, K.map);
    return rows.map(r => r.split('').map(ch => ch==='.' ? null : (map[ch] || '#ff00ff')));
  }

  function sprite(kind, back, frame, flip, flash){
    const key = (spriteSet||'blocky')+'|'+kind+'|'+(back?1:0)+'|'+frame+'|'+(flip?1:0)+'|'+(flash?1:0);
    let cv = cache.get(key);
    if(!cv){
      let grid = artGrid(kind, back, frame);
      if(flip) grid = grid.map(r => r.slice().reverse());
      cv = bake(grid, flash);
      cache.set(key, cv);
    }
    return cv;
  }

  // Horses and elephants are drawn side-on, from pixel maps
  const HORSE = [
    "......rr....",
    "......RR....",
    ".....rRRr...",
    "hh...hhhhh..",
    "hHh.hhhhhhhh",
    ".hhhhhhhhhhh",
    "..hhhhhhhhh.",
    "..h.h...h.h.",
    "..f.f...f.f.",
  ];
  const HORSE2 = HORSE.slice(0,7).concat(["...hh...hh..", "...ff...ff.."]);
  const ELEPHANT = [
    "......tttt......",
    ".....tTTTTt.....",
    "...eeeeeeeeee...",
    "..eeeeeeeeeeeee.",
    ".eEeeeeeeeeeeeee",
    "eEEeeeeeeeeeeeee",
    "eEe.eeeeeeeeeeee",
    "eEw.eeeeeeeeeeee",
    "eE.wweeeeeeeeee.",
    "eE...eeeeeeeeee.",
    "e....ee.ee.ee.ee",
    ".....ee.ee.ee.ee",
    ".....ff.ff.ff.ff",
  ];
  function mapPic(pic, map){ return pic.map(r => r.split('').map(ch => ch==='.' ? null : (map[ch] || '#ff00ff'))); }
  function mounted(kind, frame, flip, flash){
    const key = 'm|'+kind+'|'+frame+'|'+(flip?1:0)+'|'+(flash?1:0);
    let cv = cache.get(key);
    if(!cv){
      const riders = {
        romcav:  { r:C.rRed, R:C.iron },
        numid:   { r:'#d8b070', R:C.skin },
        carcav:  { r:C.cBlue, R:C.bronze },
        carthGaul:{ r:C.tartan, R:C.gaulHair },
      };
      const rc = riders[kind] || riders.carcav;
      const map = { h: kind==='numid' ? C.horseLight : C.horse, H:C.horseD, f:C.black, r:rc.r, R:rc.R };
      let grid = mapPic(frame ? HORSE2 : HORSE, map);
      if(flip) grid = grid.map(r => r.slice().reverse());
      cv = bake(grid, flash);
      cache.set(key, cv);
    }
    return cv;
  }
  function elephant(flip, flash, panic){
    const key = 'e|'+(flip?1:0)+'|'+(flash?1:0)+'|'+(panic?1:0);
    let cv = cache.get(key);
    if(!cv){
      const map = { e: panic ? '#a0a0a8' : C.eleph, E:C.elephD, w:C.tusk, t:C.rRed, T:C.gold, f:C.black };
      let grid = mapPic(ELEPHANT, map);
      if(flip) grid = grid.map(r => r.slice().reverse());
      cv = bake(grid, flash);
      cache.set(key, cv);
    }
    return cv;
  }

  // ---------------------------------------------------------------
  //  TILES (8x8, procedurally varied, cached)
  // ---------------------------------------------------------------
  const hash = (x,y,s=0) => { let h = (x*374761393 + y*668265263 + s*982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0); };
  const TILES = {
    plain:  { base:'#b8a060', dots:['#a08a4c','#c8b478','#7e8a3c'], tuft:'#6e7a34' },
    grass:  { base:'#5a8c34', dots:['#4c7a2c','#6ea040','#7eb04a'], tuft:'#3e6a24' },
    dirt:   { base:'#8a6a44', dots:['#7a5c3a','#9a7a50'] },
    road:   { base:'#8a6e48', dots:['#7a603e','#a08458'] },
    sand:   { base:'#d4a870', dots:['#c49660','#e0b880','#b88a54'] },
    snow:   { base:'#c8ccd0', dots:['#b4b8bc','#dadee2','#9ea2a6'] },
    frozen: { base:'#6a6e6a', dots:['#5a5e5a','#7a7e7a','#c8ccd0'] },
    water:  { base:'#284c8c', dots:['#20407a','#3a64a8'], wave:'#7aa0d8', anim:true },
    deep:   { base:'#1a2c5c', dots:['#14244c','#24387a'], wave:'#5a7ab8', anim:true },
    ford:   { base:'#3a6a9a', dots:['#305a88','#4a7aac'], wave:'#a8c8e8', reed:'#5a8a4a', anim:true },
    lake:   { base:'#1c3c6c', dots:['#183460','#24487c'], wave:'#6a8ac0', anim:true },
    brush:  { base:'#3a5a28', dots:['#2c4a1e','#4a6a32'], reed:'#6a8a3a' },
    woods:  { base:'#2a5a30', canopy:['#1e4a26','#3a7040','#4a8048'] },
    woodsHigh:{ base:'#1e4426', canopy:['#163a1c','#2a5a30','#3a6a3a'] },
    forest: { base:'#24502a', canopy:['#1a4020','#346a3a','#448a48'] },
    hill:   { base:'#8a7a68', dots:['#7a6a58','#9a8a78'], rock:'#5e5246', light:'#b0a08a' },
  };
  function tileCanvas(name, v, frame){
    const key = 't|'+name+'|'+v+'|'+frame;
    let cv = cache.get(key);
    if(cv) return cv;
    const D = TILES[name] || TILES.plain;
    cv = mk(T, T); const g = cv.getContext('2d');
    g.fillStyle = col(D.base); g.fillRect(0,0,T,T);
    const r = (i) => hash(v, i, 7);
    const nDots = Math.round(4*style.ground);
    if(D.dots) for(let i=0;i<nDots;i++){ g.fillStyle = col(D.dots[r(i)%D.dots.length]); g.fillRect(r(i+10)%T, r(i+20)%T, 1, 1); }
    if(D.tuft && v%3===0 && style.ground > 0.6){ g.fillStyle = col(D.tuft); const x=r(30)%6+1, y=r(31)%5+2; g.fillRect(x,y,1,2); g.fillRect(x+1,y-1,1,3); g.fillRect(x+2,y+1,1,1); }
    if(D.wave){ g.fillStyle = col(D.wave); const y = (r(40) + frame*2) % T; const x = (r(41) + frame) % 5; g.fillRect(x, y, 3, 1); }
    if(D.reed && v%2===0){ g.fillStyle = col(D.reed); const x=r(50)%6+1; g.fillRect(x,2,1,5); g.fillRect(x+2,3,1,4); }
    if(D.canopy){
      for(let i=0;i<3;i++){ g.fillStyle = col(D.canopy[i]); const cx=r(60+i)%6+1, cy=r(70+i)%6+1; g.fillRect(cx-1,cy-1,3,3); g.fillRect(cx,cy-2,1,1); }
    }
    if(D.rock){ g.fillStyle = col(D.rock); g.fillRect(1,5,6,2); g.fillStyle = col(D.light); g.fillRect(2,4,3,1); }
    cache.set(key, cv);
    return cv;
  }

  // ---------------------------------------------------------------
  //  PIXEL FONT (3x5)
  // ---------------------------------------------------------------
  const F = {
    A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',
    F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',
    K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',
    P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',
    U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',
    Z:'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110',
    '4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111',
    '9':'111101111001110','+':'000010111010000','-':'000000111000000','!':'010010010000010','.':'000000000000010',
    '?':'110001010000010',"'":'010010000000000',',':'000000000010100',':':'000010000010000','/':'001001010100100',' ':'000000000000000',
  };
  function text(str, x, y, colIn, center=true){
    const colr = col(colIn);
    str = String(str).toUpperCase();
    const w = str.length*4 - 1;
    let px0 = Math.round(center ? x - w/2 : x), py = Math.round(y);
    for(const pass of [0,1]){
      ctx.fillStyle = pass ? colr : OUTLINE;
      for(let i=0;i<str.length;i++){
        const g = F[str[i]] || F[' '];
        for(let j=0;j<15;j++){
          if(g[j] !== '1') continue;
          const gx = px0 + i*4 + (j%3), gy = py + Math.floor(j/3);
          if(pass) ctx.fillRect(gx, gy, 1, 1);
          else { ctx.fillRect(gx+1, gy, 1, 1); ctx.fillRect(gx, gy+1, 1, 1); ctx.fillRect(gx-1, gy, 1, 1); ctx.fillRect(gx, gy-1, 1, 1); }
        }
      }
    }
  }

  // ---------------------------------------------------------------
  //  API
  // ---------------------------------------------------------------
  function init(cv, opts={}){
    canvas = cv; ctx = canvas.getContext('2d', { alpha:false });
    scale = style.scale || opts.scale || 3;
    window.addEventListener('resize', resize);
    resize();
  }
  function resize(){
    const box = canvas.parentElement.getBoundingClientRect();
    W = Math.ceil(box.width / scale); H = Math.ceil(box.height / scale);
    canvas.width = W; canvas.height = H;
    canvas.style.width = (W*scale)+'px'; canvas.style.height = (H*scale)+'px';
    canvas.style.imageRendering = 'pixelated';
    ctx.imageSmoothingEnabled = false;
  }
  function setScale(s){ scale = s; resize(); }
  function getScale(){ return scale; }

  // camTileX/Y: the world point (in tiles) to centre on
  function begin(camTileX, camTileY, bg='#000'){
    t++;
    camX = Math.round(camTileX*T - W/2);
    camY = Math.round(camTileY*T - H/2);
    if(shakeT > 0){ shakeT--; camX += (t%2 ? 1 : -1); }
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = col(bg); ctx.fillRect(0,0,W,H);
    ctx.setTransform(1,0,0,1,-camX,-camY);
  }
  function shake(n=6){ shakeT = n; }

  // tileFn(x,y) -> tile name or null
  function ground(gw, gh, tileFn){
    const x0 = Math.max(0, Math.floor(camX/T)), x1 = Math.min(gw-1, Math.floor((camX+W)/T));
    const y0 = Math.max(0, Math.floor(camY/T)), y1 = Math.min(gh-1, Math.floor((camY+H)/T));
    const frame = Math.floor(t/20) % 4;
    for(let y=y0; y<=y1; y++) for(let x=x0; x<=x1; x++){
      const name = tileFn(x,y);
      if(!name) continue;
      const D = TILES[name];
      ctx.drawImage(tileCanvas(name, hash(x,y)%8, D && D.anim ? frame : 0), x*T, y*T);
    }
  }

  // Smoothly glide a unit's drawn position toward its grid cell
  function glide(u){
    if(u._rx === undefined){ u._rx = u.x; u._ry = u.y; }
    const dx = u.x - u._rx, dy = u.y - u._ry;
    if(Math.abs(dx) > 3 || Math.abs(dy) > 3){ u._rx = u.x; u._ry = u.y; }   // teleports: snap
    u._rx += dx*0.25; u._ry += dy*0.25;
    if(Math.abs(dx) > 0.02) u._face = dx < 0 ? -1 : 1;
    if(Math.abs(dy) > 0.02) u._back = dy < 0;
    return Math.abs(dx) + Math.abs(dy) > 0.05;
  }

  // Draw one unit. kind: an infantry kind, 'romcav'|'numid'|'carcav', or 'elephant'.
  // opts: { back, face, hp, maxHp, bar, marker, panic }
  function unit(u, kind, opts={}){
    const moving = glide(u);
    const flash = u._hitT !== undefined && t - u._hitT < 5;
    const frame = moving ? (Math.floor(t/8) % 2) : 0;
    const bx = Math.round(u._rx*T), by = Math.round(u._ry*T);
    const face = opts.face !== undefined ? opts.face : (u._face || 1);
    const lunge = (u._atkT !== undefined && t - u._atkT < 6) ? 1 : 0;

    // shadow
    if(!spriteSet || SETS[spriteSet].shadow || kind==='elephant'){
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(bx+2, by+T-1, T-4, 1);
    }

    let img, ox, oy;
    if(kind === 'elephant'){
      img = elephant(face < 0, flash, opts.panic);
      ox = bx + T/2 - img.width/2; oy = by + T - img.height + 1;
    } else if(kind === 'romcav' || kind === 'numid' || kind === 'carcav' || kind === 'carthGaul'){
      img = mounted(kind, frame, face < 0, flash);
      ox = bx + T/2 - img.width/2; oy = by + T - img.height + 1;
    } else {
      const back = opts.back !== undefined ? opts.back : !!u._back;
      img = sprite(kind, back, frame, face < 0, flash);
      ox = bx + T/2 - img.width/2; oy = by + T - img.height + 1 - (moving && frame ? 1 : 0);
      if(lunge) oy += back ? -1 : 1;
    }
    ctx.drawImage(img, ox, oy);

    if(opts.bar && opts.maxHp && opts.hp < opts.maxHp){
      const w = Math.max(0, Math.round((opts.hp/opts.maxHp)*(T)));
      ctx.fillStyle = OUTLINE; ctx.fillRect(bx-1, oy-3, T+2, 3);
      ctx.fillStyle = col(opts.barCol || '#e04030'); ctx.fillRect(bx, oy-2, w, 1);
    }
    if(opts.marker){
      const bob = Math.floor(t/12) % 2;
      ctx.fillStyle = OUTLINE; ctx.fillRect(bx+2, oy-7+bob, 5, 3); ctx.fillRect(bx+3, oy-4+bob, 3, 1);
      ctx.fillStyle = col(C.gold); ctx.fillRect(bx+3, oy-6+bob, 3, 1); ctx.fillRect(bx+4, oy-5+bob, 1, 1);
    }
  }

  // Generic small pictures (huts, tents, flags) as string art
  function pic(name, grid, map, x, y){
    const key = 'p|'+name;
    let cv = cache.get(key);
    if(!cv){ cv = bake(mapPic(grid, map), false); cache.set(key, cv); }
    ctx.drawImage(cv, Math.round(x), Math.round(y));
  }

  // Particles & floats given in tile coordinates
  function dot(tx, ty, c, size=1){ ctx.fillStyle = col(c); ctx.fillRect(Math.round(tx*T), Math.round(ty*T), size, size); }
  function label(str, tx, ty, c){ text(str, tx*T + T/2, ty*T, c); }

  // Overlay drawn in screen space over the whole view (e.g. fog, mist)
  function overlay(fn){
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); fn(ctx, W, H); ctx.restore();
  }
  function rectWorld(tx, ty, tw, th, c){ ctx.fillStyle = col(c); ctx.fillRect(tx*T, ty*T, tw*T, th*T); }

  return { T, C, style: styleName, sprites: spriteSet || 'blocky', init, resize, setScale, getScale, begin, ground, unit, pic, dot, label, text, overlay, rectWorld, shake,
           get ctx(){ return ctx; }, get t(){ return t; }, get W(){ return W; }, get H(){ return H; } };
})();
