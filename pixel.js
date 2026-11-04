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
  //  PALETTE
  // ---------------------------------------------------------------
  const OUTLINE = '#1a1410';
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
    merc:'#58a030', mercD:'#386818', ice:'#c8f0ff',
  };

  // ---------------------------------------------------------------
  //  SPRITES
  //  Each art has a front head, a back head (drawn, not derived, so the
  //  back of a helmet never turns into a dark "visor" band) and body rows;
  //  the back of the body is the front mirrored.
  //  Key: r crest, R crest shade, h helmet/cap, H helmet shade, n highlight,
  //       s skin, k eye, c coat, C coat dark, m armour, M armour dark,
  //       b shield, B shield edge, y boss/trim, g hair, l legs, f feet, w white
  //  Eyes always sit on a row of skin, never between helmet pixels.
  // ---------------------------------------------------------------
  const LEGS = [
    ["..l..l..", "..f..f.."],
    [".l...l..", ".f....f."],
  ];
  const ART = {
    // crested helmet: dome with a highlight, crest ridge front to back, cheek guards below the eyes
    legionary: {
      head: ["...r....","..rRr...",".hnhhH..",".sksks..",".HsssHbB"],
      back: ["....r...","...rRr..","..HhRnh.","..hhRhh.","BbHhhhH."],
      body: [".cmmmcbB",".cmmmcyB",".cmMmcbB","..CCC.bB"],
    },
    // a centurion's crest runs side to side
    centurion: {
      head: ["rrrrrr..",".RRRRR..",".hnhhH..",".sksks..",".HsssHbB"],
      back: ["..rrrrrr","..RRRRR.","..Hhhnh.","..hhhhh.","BbHhhhH."],
      body: [".cmymcbB",".cmmmcyB",".cmymcbB","..CCC.bB"],
    },
    // wolf-skin hood
    velite: {
      head: ["..H.H...",".hhhhh..",".hnhhH..",".sksks..","hhsssh.."],
      back: ["...H.H..","..hhhhh.","..Hhhnh.","..hhhhh.",".hhhhhhh"],
      body: [".cccccbb",".CCCCCyb",".ccccc..","..CCC..."],
    },
    // no helmet: wild hair all round
    gaul: {
      head: ["..gg.g..",".ggggg..","gskskg.."],
      back: ["..g.gg..","..ggggg.","..ggggg."],
      body: [".ssssbb.",".sssbbbB",".cyccbyB",".ccccbbB","..CCC.b."],
    },
    // sinew cap
    spaniard: {
      head: ["..hhh...",".hnhhH..",".sksks..","..sss.bb"],
      back: ["...hhh..","..Hhhnh.","..hhhhh.","bb.sss.."],
      body: [".cwwwcbB",".cwwwcyB",".ccccc.B","..CCC..."],
    },
    // bronze helmet with a knob on top
    libyan: {
      head: ["...h....","..hnh...",".hhhhH..",".sksks..",".HsssHbb"],
      back: ["....h...","...hnh..","..Hhhhh.","..hhhhh.","bbHhhhH."],
      body: [".mmmmmby",".MMMMMbb",".mmmmm.b","..ccc..."],
    },
    levy: {
      head: ["...h....","..hnh...",".hhhhH..",".sksks..",".HsssHbb"],
      back: ["....h...","...hnh..","..Hhhhh.","..hhhhh.","bbHhhhH."],
      body: [".wwwwwby",".CCCCCbb",".ccccc.b","..CCC..."],
    },
    // leather cap
    merc: {
      head: ["..hhh...",".hnhhH..",".sksks..","..sss.b."],
      back: ["...hhh..","..Hhhnh.","..hhhhh.",".b.sss.."],
      body: [".ccccbbb",".CCCCbyb",".ccccbbb","..CCC.b."],
    },
    forager: {
      head: ["........",".gggg...",".sksk...","..ss.ww."],
      back: ["........","...gggg.","...gggg.",".ww.ss.."],
      body: [".cccwwww",".cCcwwww",".ccc.ww.","..CC...."],
    },
  };
  for(const [name, A] of Object.entries(ART)){
    if(A.head.length !== A.back.length) console.error('pixel.js: head/back rows differ', name);
    for(const r of A.head.concat(A.back, A.body)) if(r.length !== 8) console.error('pixel.js: bad art row', name, r);
  }

  // Colour maps per unit kind (what each art key means for that kind)
  const ROMAN_CREST = '#c8303c', ROMAN_CREST_D = '#7a1a2a';
  const KINDS = {
    roman:    { art:'legionary', map:{ r:ROMAN_CREST, R:ROMAN_CREST_D, h:C.iron, H:C.ironD, c:C.rRed, C:C.rRedD, m:C.iron, M:C.ironD, b:C.rRed, B:C.rRedD, y:C.gold } },
    triarii:  { art:'legionary', map:{ r:'#3a2a3a', R:'#1a1014', h:C.iron, H:C.ironD, c:C.rRedD, C:'#5a1810', m:C.iron, M:C.ironD, b:C.rRedD, B:'#5a1810', y:C.gold } },
    yours:    { art:'centurion', map:{ r:C.white, R:'#b8b0a0', h:C.iron, H:C.ironD, c:C.green, C:C.greenD, m:C.iron, M:C.ironD, b:C.green, B:C.greenD, y:C.gold } },
    hannibal: { art:'libyan',    map:{ h:C.gold, H:C.bronzeD, n:'#fff4b0', m:C.bronze, M:C.bronzeD, c:C.black, b:C.rRedD, B:'#5a1810', y:C.gold } },
    velite:   { art:'velite',    map:{ h:C.fur, H:C.leatherD, n:'#9a7a52', c:'#d8c090', C:'#a89060', b:C.leather, y:C.gold } },
    gaul:     { art:'gaul',      map:{ g:C.gaulHair, c:C.tartan, C:'#6a3018', y:C.gaulHair, b:C.gaulCloth, B:C.gaulClothD } },
    spaniard: { art:'spaniard',  map:{ h:C.leatherD, H:C.black, n:'#8a6a44', c:C.spanRed, C:'#701828', b:C.leather, B:C.leatherD, y:C.bronze } },
    libyan:   { art:'libyan',    map:{ h:C.bronze, H:C.bronzeD, n:'#f4d890', m:C.iron, M:C.ironD, c:C.cBlue, b:C.bronze, B:C.bronzeD, y:C.gold } },
    mago:     { art:'libyan',    map:{ h:C.leatherD, H:C.black, n:'#8a6a44', m:C.leather, M:C.leatherD, c:'#3a4a2a', b:'#4a5a32', B:'#2a3a1e', y:C.bronze } },
    levy:     { art:'levy',      map:{ h:C.bronze, H:C.bronzeD, n:'#f4d890', c:C.cBlue, C:C.cBlueD, b:C.cBlue, B:C.cBlueD, y:C.gold } },
    veteran:  { art:'libyan',    map:{ h:C.gold, H:C.bronzeD, n:'#fff4b0', m:C.bronze, M:C.bronzeD, c:C.purple, b:C.purple, B:C.purpleD, y:C.gold } },
    merc:     { art:'merc',      map:{ h:C.leather, H:C.leatherD, n:'#b08050', c:C.merc, C:C.mercD, b:C.leather, y:C.gold } },
    forager:  { art:'forager',   map:{ g:C.black, c:C.leather, C:C.leatherD } },
  };
  // Defaults for every art key, so a kind that doesn't define one still gets a sensible colour
  const BASE = { s:C.skin, k:C.eye, l:C.skinD, f:C.black, w:C.white, n:'#f0f4f8',
                 r:C.rRed, R:C.rRedD, h:C.leather, H:C.leatherD, c:C.leather, C:C.leatherD, m:C.iron, M:C.ironD,
                 b:C.leather, B:C.leatherD, y:C.gold, g:C.black };

  // ---------------------------------------------------------------
  //  SPRITE CACHE: build, outline, mirror, flash
  // ---------------------------------------------------------------
  const cache = new Map();
  function mk(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // Paint a pixel grid (rows of colour strings / null) with a 1px outline into a new canvas.
  function bake(grid, flash){
    const h = grid.length, w = grid[0].length;
    const cv = mk(w + 2, h + 2), g = cv.getContext('2d');
    const solid = (x,y) => y>=0 && y<h && x>=0 && x<w && !!grid[y][x];
    g.fillStyle = OUTLINE;
    for(let y=-1; y<=h; y++) for(let x=-1; x<=w; x++){
      if(solid(x,y)) continue;
      if(solid(x-1,y)||solid(x+1,y)||solid(x,y-1)||solid(x,y+1)) g.fillRect(x+1, y+1, 1, 1);
    }
    for(let y=0; y<h; y++) for(let x=0; x<w; x++){
      if(!grid[y][x]) continue;
      g.fillStyle = flash ? '#ffffff' : grid[y][x];
      g.fillRect(x+1, y+1, 1, 1);
    }
    return cv;
  }
  function mapPic(pic, map){ return pic.map(r => r.split('').map(ch => ch==='.' ? null : (map[ch] || BASE[ch] || '#000'))); }

  function artGrid(kind, back, frame){
    const K = KINDS[kind] || KINDS.roman, A = ART[K.art];
    const mirrorBody = r => r.split('').reverse().join('').replace(/m/g,'c').replace(/M/g,'C').replace(/y/g,'B');
    const rows = (back ? A.back.concat(A.body.map(mirrorBody)) : A.head.concat(A.body)).concat(LEGS[frame]);
    return mapPic(rows, Object.assign({}, BASE, K.map));
  }

  function sprite(kind, back, frame, flip, flash){
    const key = kind+'|'+(back?1:0)+'|'+frame+'|'+(flip?1:0)+'|'+(flash?1:0);
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
  const RIDERS = {
    romcav:    { r:C.rRed, R:C.iron },
    numid:     { r:'#d8b070', R:C.skin },
    carcav:    { r:C.cBlue, R:C.bronze },
    carthGaul: { r:C.tartan, R:C.gaulHair },
  };
  function mounted(kind, frame, flip, flash){
    const key = 'm|'+kind+'|'+frame+'|'+(flip?1:0)+'|'+(flash?1:0);
    let cv = cache.get(key);
    if(!cv){
      const rc = RIDERS[kind] || RIDERS.carcav;
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

  // Buildings and props
  const PICS = {
    house: { art:[
      "......rrrr......",
      "....rrrrrrrr....",
      "..rrrrrrrrrrrr..",
      "rrrrrrrrrrrrrrrr",
      ".wwwwwwwwwwwwww.",
      ".wwkkwwwwwwkkww.",
      ".wwkkwwwwwwkkww.",
      ".wwwwwwddwwwwww.",
      ".wwwwwwddwwwwww.",
      ".wwwwwwddwwwwww.",
    ], map:{ r:'#b8442c', w:'#e8dcc0', k:'#3a2a1a', d:'#6a4a2a' } },
    ruin: { art:[
      "................",
      "................",
      "....kk......k...",
      "..kkkkk...kkk...",
      ".gggkggg..gggg..",
      ".ggkkgggggggkg..",
      ".gggggg.ggggggg.",
      ".gggggg.kggggg..",
      ".ggggggkkgggggg.",
      ".gggggggggggggg.",
    ], map:{ k:'#2a2420', g:'#6a625a' } },
    tent: { art:[
      ".....r.....",
      "....wwk....",
      "...wwwkk...",
      "..wwwwkkk..",
      ".wwwwwkkkk.",
      "wwwwwdkkkkk",
    ], map:{ r:C.rRed, w:'#e0d4b0', k:'#a89870', d:'#3a2a1a' } },
    standard: { art:[
      ".yyy.",
      "yrrry",
      "yrrry",
      ".yyy.",
      "..x..",
      "..x..",
      "..x..",
      "..x..",
    ], map:{ y:C.gold, r:C.rRed, x:'#7a5a34' } },
  };
  function picCanvas(name, recolor){
    const key = 'p|'+name+'|'+(recolor ? JSON.stringify(recolor) : '');
    let cv = cache.get(key);
    if(!cv){
      const P = PICS[name];
      cv = bake(mapPic(P.art, Object.assign({}, P.map, recolor || {})), false);
      cache.set(key, cv);
    }
    return cv;
  }

  // ---------------------------------------------------------------
  //  TILES (8x8, procedurally varied, cached)
  // ---------------------------------------------------------------
  const hash = (x,y,s=0) => { let h = (x*374761393 + y*668265263 + s*982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0); };
  const TILES = {
    plain:    { base:'#b8a060', dots:['#a08a4c','#c8b478','#7e8a3c'], tuft:'#6e7a34' },
    grass:    { base:'#5a8c34', dots:['#4c7a2c','#6ea040','#7eb04a'], tuft:'#3e6a24' },
    road:     { base:'#8a6e48', dots:['#7a603e','#a08458'] },
    sand:     { base:'#d4a870', dots:['#c49660','#e0b880','#b88a54'] },
    sandLane: { base:'#c49a64', dots:['#b48a56','#d0a874'] },
    snow:     { base:'#c8ccd0', dots:['#b4b8bc','#dadee2','#9ea2a6'] },
    frozen:   { base:'#6a6e6a', dots:['#5a5e5a','#7a7e7a','#c8ccd0'] },
    snowGround:{ base:'#c2c6c4', dots:['#b0b4b2','#d4d8d6','#a4a8a6'], tuft:'#8a8466' },
    deep:     { base:'#1a2c5c', dots:['#14244c','#24387a'], wave:'#5a7ab8', anim:true },
    ford:     { base:'#3a6a9a', dots:['#305a88','#4a7aac'], wave:'#a8c8e8', reed:'#5a8a4a', anim:true },
    lake:     { base:'#1c3c6c', dots:['#183460','#24487c'], wave:'#6a8ac0', anim:true },
    brush:    { base:'#3a5a28', dots:['#2c4a1e','#4a6a32'], reed:'#6a8a3a' },
    woods:    { base:'#2a5a30', canopy:['#1e4a26','#3a7040','#4a8048'] },
    woodsHigh:{ base:'#1e4426', canopy:['#163a1c','#2a5a30','#3a6a3a'] },
    forest:   { base:'#24502a', canopy:['#1a4020','#346a3a','#448a48'] },
    hill:     { base:'#8c7c66', dots:['#7c6c58','#a0907a','#6e8a4a'], rock:'#5e5246', light:'#b8a890' },
  };
  function tileCanvas(name, v, frame){
    const key = 't|'+name+'|'+v+'|'+frame;
    let cv = cache.get(key);
    if(cv) return cv;
    const D = TILES[name] || TILES.plain;
    cv = mk(T, T); const g = cv.getContext('2d');
    g.fillStyle = D.base; g.fillRect(0,0,T,T);
    const r = (i) => hash(v, i, 7);
    if(D.dots) for(let i=0;i<4;i++){ g.fillStyle = D.dots[r(i)%D.dots.length]; g.fillRect(r(i+10)%T, r(i+20)%T, 1, 1); }
    if(D.tuft && v%3===0){ g.fillStyle = D.tuft; const x=r(30)%6+1, y=r(31)%5+2; g.fillRect(x,y,1,2); g.fillRect(x+1,y-1,1,3); g.fillRect(x+2,y+1,1,1); }
    if(D.wave){ g.fillStyle = D.wave; const y = (r(40) + frame*2) % T; const x = (r(41) + frame) % 5; g.fillRect(x, y, 3, 1); }
    if(D.reed && v%2===0){ g.fillStyle = D.reed; const x=r(50)%6+1; g.fillRect(x,2,1,5); g.fillRect(x+2,3,1,4); }
    if(D.canopy){
      for(let i=0;i<3;i++){ g.fillStyle = D.canopy[i]; const cx=r(60+i)%6+1, cy=r(70+i)%6+1; g.fillRect(cx-1,cy-1,3,3); g.fillRect(cx,cy-2,1,1); }
    }
    if(D.rock && v%3 !== 1){
      // a scattered boulder with a lit top edge, in a different place on each tile
      const rx = r(80)%4, ry = r(81)%4 + 2, rw = 2 + r(82)%3;
      g.fillStyle = D.rock; g.fillRect(rx, ry, rw, 2);
      g.fillStyle = D.light; g.fillRect(rx, ry-1, rw-1, 1);
    }
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
  function text(str, x, y, col, center=true){
    str = String(str).toUpperCase();
    const w = str.length*4 - 1;
    const px0 = Math.round(center ? x - w/2 : x), py = Math.round(y);
    for(const pass of [0,1]){
      ctx.fillStyle = pass ? col : OUTLINE;
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
    scale = opts.scale || 3;
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    resize();
  }
  function resize(){
    if(!canvas) return;
    const box = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, Math.ceil(box.width / scale)); H = Math.max(1, Math.ceil(box.height / scale));
    canvas.width = W; canvas.height = H;
    canvas.style.width = (W*scale)+'px'; canvas.style.height = (H*scale)+'px';
    canvas.style.imageRendering = 'pixelated';
    ctx.imageSmoothingEnabled = false;
  }
  function setScale(s){ scale = s; resize(); }

  // Cutscenes: draw into a fixed-size buffer (no automatic resizing; the page scales the canvas)
  function useCanvas(cv, w, h){
    canvas = null;
    ctx = cv.getContext('2d', { alpha:false });
    cv.width = w; cv.height = h; W = w; H = h;
    ctx.imageSmoothingEnabled = false;
  }
  function getScale(){ return scale; }

  // camTileX/Y: the world point (in tiles) to centre on
  function begin(camTileX, camTileY, bg='#000'){
    t++;
    camX = Math.round(camTileX*T - W/2);
    camY = Math.round(camTileY*T - H/2);
    if(shakeT > 0){ shakeT--; camX += (t%2 ? 1 : -1); }
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
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

  const MOUNTED = ['romcav','numid','carcav','carthGaul'];

  // Draw one sprite with its feet at buffer point (bx + T/2, by + T).
  // opts: { back, face, frame, flash, lunge, panic, icy }
  function figure(kind, bx, by, opts={}){
    const face = opts.face || 1, frame = opts.frame || 0, flash = !!opts.flash;
    let img, oy;
    if(kind === 'elephant'){
      img = elephant(face < 0, flash, opts.panic);
      oy = by + T - img.height + 1;
    } else if(MOUNTED.includes(kind)){
      img = mounted(kind, frame, face < 0, flash);
      oy = by + T - img.height + 1;
    } else {
      img = sprite(kind, !!opts.back, frame, face < 0, flash);
      oy = by + T - img.height + 1 - (opts.bob ? 1 : 0);
      if(opts.lunge) oy += opts.back ? -1 : 1;
    }
    const ox = Math.round(bx + T/2 - img.width/2);
    ctx.drawImage(img, ox, Math.round(oy));
    if(opts.icy && !MOUNTED.includes(kind) && kind !== 'elephant'){
      // soaked and freezing: frost on the shoulders
      ctx.fillStyle = C.ice;
      ctx.fillRect(ox+2, Math.round(oy)+5, 1, 1); ctx.fillRect(ox+6, Math.round(oy)+5, 1, 1); ctx.fillRect(ox+4, Math.round(oy)+1, 1, 1);
    }
    return { ox, oy: Math.round(oy), w: img.width, h: img.height };
  }

  // Draw one unit. kind: an infantry kind, 'romcav'|'numid'|'carcav'|'carthGaul', or 'elephant'.
  // opts: { back, face, hp, maxHp, bar, barCol, marker, panic, icy }
  function unit(u, kind, opts={}){
    const moving = glide(u);
    const flash = u._hitT !== undefined && t - u._hitT < 5;
    const frame = moving ? (Math.floor(t/8) % 2) : 0;
    const bx = Math.round(u._rx*T), by = Math.round(u._ry*T);
    const face = opts.face !== undefined ? opts.face : (u._face || 1);
    const lunge = u._atkT !== undefined && t - u._atkT < 6;
    // facing: explicit, else from movement, else the side's default
    const back = opts.back !== undefined ? opts.back : (u._back !== undefined ? u._back : !!opts.defaultBack);

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(bx+1, by+T-1, T-2, 1);

    const f = figure(kind, bx, by, { back, face, frame, flash, lunge, bob: moving && frame, panic: opts.panic, icy: opts.icy });

    if(opts.bar && opts.maxHp && opts.hp < opts.maxHp){
      const w = Math.max(0, Math.round((opts.hp/opts.maxHp)*T));
      ctx.fillStyle = OUTLINE; ctx.fillRect(bx-1, f.oy-3, T+2, 3);
      ctx.fillStyle = opts.barCol || '#e04030'; ctx.fillRect(bx, f.oy-2, w, 1);
    }
    if(opts.marker){
      const bob = Math.floor(t/12) % 2;
      ctx.fillStyle = OUTLINE; ctx.fillRect(bx+2, f.oy-7+bob, 5, 3); ctx.fillRect(bx+3, f.oy-4+bob, 3, 1);
      ctx.fillStyle = C.gold; ctx.fillRect(bx+3, f.oy-6+bob, 3, 1); ctx.fillRect(bx+4, f.oy-5+bob, 1, 1);
    }
  }

  // A named picture (house, ruin, tent, standard) with its bottom-left at tile (tx, ty+1)
  function pic(name, tx, ty, recolor){
    const cv = picCanvas(name, recolor);
    ctx.drawImage(cv, Math.round(tx*T + T/2 - cv.width/2), Math.round((ty+1)*T - cv.height + 1));
  }

  // Particles & floats given in tile coordinates
  function dot(tx, ty, c, size=1){ ctx.fillStyle = c; ctx.fillRect(Math.round(tx*T), Math.round(ty*T), size, size); }
  function label(str, tx, ty, c){ text(str, tx*T + T/2, ty*T, c); }

  // Overlay drawn in screen space over the whole view (e.g. fog, mist)
  function overlay(fn){
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); fn(ctx, W, H); ctx.restore();
  }
  function rectWorld(tx, ty, tw, th, c){ ctx.fillStyle = c; ctx.fillRect(tx*T, ty*T, tw*T, th*T); }

  // If a tile is off-screen, draw a pulsing pixel arrow at the screen edge pointing to it, with a label
  function pointer(tx, ty, col, str){
    const sx = tx*T + T/2 - camX, sy = ty*T + T/2 - camY;
    if(sx >= 0 && sx < W && sy >= 0 && sy < H) return;
    const cx = W/2, cy = H/2, a = Math.atan2(sy - cy, sx - cx);
    const R = Math.min(W, H)/2 - 14;
    const ax = Math.round(cx + Math.cos(a)*R), ay = Math.round(cy + Math.sin(a)*R);
    overlay(g => {
        // rasterise a small triangle pointing along a, pixel by pixel (stays crisp)
        const tip = [ax + Math.cos(a)*5, ay + Math.sin(a)*5];
        const l = [ax + Math.cos(a+2.4)*5, ay + Math.sin(a+2.4)*5];
        const r = [ax + Math.cos(a-2.4)*5, ay + Math.sin(a-2.4)*5];
        const inside = (px, py) => {
          const s = (p1, p2) => (px-p2[0])*(p1[1]-p2[1]) - (p1[0]-p2[0])*(py-p2[1]);
          const d1 = s(tip,l), d2 = s(l,r), d3 = s(r,tip);
          return !((d1<0||d2<0||d3<0) && (d1>0||d2>0||d3>0));
        };
        const pulse = Math.floor(t/10) % 2;
        for(let y=-7; y<=7; y++) for(let x=-7; x<=7; x++){
          const px0 = ax+x, py0 = ay+y;
          if(inside(px0+0.5, py0+0.5)){ g.fillStyle = pulse ? col : '#ffffff'; g.fillRect(px0, py0, 1, 1); }
          else if(inside(px0+1.5,py0+0.5)||inside(px0-0.5,py0+0.5)||inside(px0+0.5,py0+1.5)||inside(px0+0.5,py0-0.5)){ g.fillStyle = OUTLINE; g.fillRect(px0, py0, 1, 1); }
        }
        if(str) text(str, ax, ay + 8, col);
    });
  }

  return { T, C, init, useCanvas, bake, resize, setScale, getScale, begin, ground, glide, unit, figure, pic, dot, label, text, overlay, rectWorld, pointer, shake,
           get ctx(){ return ctx; }, get t(){ return t; }, get W(){ return W; }, get H(){ return H; },
           get camX(){ return camX; }, get camY(){ return camY; } };
})();
