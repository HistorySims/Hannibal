// =====================================================================
//  scene.js: cutscene renderer built on pixel.js.
//
//  Every cutscene draws into the same small 128x160 picture, scaled up by
//  a whole number to fit above the text box, so cutscenes share the
//  battles' crisp pixel grid. Armies use the same sprites and tiles as
//  the battles. Speakers get pixel portraits built from parts (head,
//  shading, eyes, brows and mouth per mood, hair or helmet, armour or
//  toga) that talk while their line is typing and blink now and then.
// =====================================================================
const SCENE = (() => {
  const W = 128, H = 160, T = 8;
  let canvas = null, ctx = null;
  let lastKey = null, fadeT = 0, keyStart = 0;

  // ---------------------------------------------------------------
  //  SETUP: fixed buffer, whole-number scaling above the text box
  // ---------------------------------------------------------------
  function init(cv){
    canvas = cv;
    PX.useCanvas(cv, W, H);
    ctx = PX.ctx;
    cv.classList.add('px-scene');
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    // the text box can change height between lines
    if(window.ResizeObserver){
      const box = document.getElementById('dialogue-box');
      if(box) new ResizeObserver(fit).observe(box);
    }
  }
  // Two layouts (boot.css): the text box under the picture (a phone held
  // upright), or beside it (a laptop, a tablet, a phone held sideways).
  // Whichever lets the picture be scaled up more wins.
  const PAD = 16, GAP = 24;
  function fit(){
    if(!canvas) return;
    const stage = canvas.parentElement;
    const box = document.getElementById('dialogue-box');
    const vw = window.innerWidth, vh = window.innerHeight;
    const boxW = Math.round(Math.min(440, Math.max(320, vw*0.3)));
    const kCol = Math.min(Math.floor(Math.min(vw, 600) / W), Math.floor((vh - 158) / H));
    const kRow = Math.min(Math.floor((vw - PAD*2 - GAP - boxW) / W), Math.floor((vh - PAD*2) / H));
    const row = kRow > kCol;
    stage.classList.toggle('row', row);
    let k;
    if(row){
      k = kRow;
      stage.style.setProperty('--boxw', boxW + 'px');
      stage.style.setProperty('width', (W*k + GAP + boxW + PAD*2) + 'px', 'important');
    } else {
      stage.style.removeProperty('width');
      const boxH = (box && getComputedStyle(box).display !== 'none') ? box.offsetHeight : 0;
      const availW = stage.clientWidth, availH = Math.max(H, stage.clientHeight - boxH);
      k = Math.min(Math.floor(availW / W), Math.floor(availH / H));
    }
    k = Math.max(1, k);
    // beside a big picture, bigger text
    stage.style.setProperty('--txt', (row && k >= 5 ? 14 : row && k >= 4 ? 12 : 11) + 'px');
    canvas.style.setProperty('--sw', (W*k)+'px');
    canvas.style.setProperty('--sh', (H*k)+'px');
  }

  // Draw one frame. When `key` changes, the new scene fades in from black.
  function frame(key, draw){
    PX.begin(W/2/T, H/2/T, '#000');
    draw(ctx, PX.t);
    if(key !== lastKey){ lastKey = key; fadeT = 12; keyStart = PX.t; }
    if(fadeT > 0){
      // stepped, Game Boy-style fade
      ctx.fillStyle = `rgba(0,0,0,${Math.ceil(fadeT/3)/4})`;
      ctx.fillRect(0, 0, W, H);
      fadeT--;
    }
  }

  // ---------------------------------------------------------------
  //  DRAWING PRIMITIVES (buffer pixels)
  // ---------------------------------------------------------------
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
  // checkerboard of two colours (classic dithering)
  function dither(x, y, w, h, c1, c2){
    rect(x, y, w, h, c1);
    ctx.fillStyle = c2;
    for(let j=0; j<h; j++) for(let i=(j+x+y)%2; i<w; i+=2) ctx.fillRect(x+i, y+j, 1, 1);
  }
  // horizontal colour bands with a dithered row between each pair
  function sky(bands){
    for(let i=0; i<bands.length; i++){
      const [y0, c] = bands[i];
      const y1 = i+1 < bands.length ? bands[i+1][0] : H;
      rect(0, y0, W, y1-y0, c);
      if(i+1 < bands.length) dither(0, y1-1, W, 2, c, bands[i+1][1]);
    }
  }
  const rand = (seed) => { let s = seed >>> 0; return () => { s = (s*1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  function stars(n, y0, y1, seed=7){
    const r = rand(seed);
    for(let i=0;i<n;i++){
      const x = Math.floor(r()*W), y = Math.floor(y0 + r()*(y1-y0));
      const tw = (PX.t + i*37) % 90 < 6;
      px(x, y, tw ? '#ffffff' : (i%3 ? '#8a90a8' : '#c8ccd8'));
    }
  }
  // falling snow (stateful)
  let flakes = null;
  function snow(n=60, col='#f4f8fc'){
    if(!flakes){ const r = rand(11); flakes = Array.from({length:n}, () => ({x:r()*W, y:r()*H, s:0.3 + r()*0.6})); }
    for(const f of flakes){
      px(f.x, f.y, col);
      f.y += f.s; f.x += Math.sin((PX.t + f.s*100)/40) * 0.3;
      if(f.y > H){ f.y = -2; f.x = (f.x*7.3) % W; }
    }
  }
  // drifting mist band
  function mist(y, h, alpha=0.5, col='220,228,234'){
    for(let j=0; j<h; j++){
      const a = alpha * Math.sin(Math.PI * (j+0.5)/h);
      ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`;
      const off = Math.round(Math.sin((PX.t/60) + j*0.7) * 3);
      ctx.fillRect(off - 4, y + j, W + 8, 1);
    }
  }
  // a warm light pool, dithered
  function glow(cx, cy, r, col='255,190,90', a=0.35){
    for(let ring=r; ring>0; ring-=2){
      ctx.fillStyle = `rgba(${col},${(a*(1 - ring/r) + 0.04).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(cx, cy, ring, 0, Math.PI*2); ctx.fill();
    }
  }
  function fire(x, y, size=1){
    const t = PX.t;
    const cols = ['#fde047','#f59e0b','#ef4444','#b91c1c'];
    for(let i=0; i<6*size; i++){
      const fx = x + ((i*7 + t) % (5*size)) - 2*size;
      const fy = y - ((i*5 + t*0.7) % (6*size));
      px(fx, fy, cols[Math.min(3, Math.floor((y - fy) / (1.6*size)))]);
    }
  }
  function smoke(x, y, height=40){
    const t = PX.t;
    for(let i=0; i<8; i++){
      const rise = ((t*0.4 + i*height/8) % height);
      const sx = x + Math.sin((t + i*20)/25) * (rise/10);
      ctx.fillStyle = `rgba(110,110,118,${(0.55*(1 - rise/height)).toFixed(3)})`;
      ctx.fillRect(Math.round(sx), Math.round(y - rise), 3 + Math.floor(rise/12), 2);
    }
  }
  // ground silhouette from a list of heights (one per 8px column)
  function hills(baseY, heights, col, colTop){
    for(let i=0; i<heights.length; i++){
      const x = i*8, h = heights[i], hn = heights[Math.min(i+1, heights.length-1)];
      for(let k=0; k<8; k++){
        const hh = Math.round(h + (hn - h) * k/8);
        rect(x+k, baseY - hh, 1, hh + (H - baseY), col);
        if(colTop) px(x+k, baseY - hh, colTop);
      }
    }
  }
  // water with moving highlight dashes
  function water(y, h, base, hi){
    rect(0, y, W, h, base);
    for(let i=0; i<h*W/120; i++){
      const wy = y + (i*13) % h;
      const wx = (i*29 + PX.t*(0.3 + (i%3)*0.15)) % (W + 10) - 5;
      rect(wx, wy, 3 + i%3, 1, hi);
    }
  }

  // ---------------------------------------------------------------
  //  PORTRAITS (56 x 64, bust; built on a grid, then outlined)
  // ---------------------------------------------------------------
  const PW = 56, PH = 64;
  const SKIN = {
    light: { h:'#f4c8a0', b:'#e8b088', s:'#c88a62', d:'#9a6444' },
    old:   { h:'#eec0a0', b:'#e0a882', s:'#bc8460', d:'#8e5e42' },
    dark:  { h:'#d8a070', b:'#c08458', s:'#9a643e', d:'#6e4428' },
  };
  const IRON   = { h:'#f0f4f8', b:'#c8ced6', s:'#8a929c', d:'#5a626c' };
  const BRONZE = { h:'#f8dc90', b:'#e0a848', s:'#a8702c', d:'#6a4418' };
  const DBRONZE= { h:'#d8b070', b:'#a87a3a', s:'#7a5424', d:'#4a3214' };
  const TOGA   = { h:'#fbf8ee', b:'#ece6d4', s:'#c4bca4', d:'#948c76' };
  const MOUTH = { lip:'#8a3e2c', in:'#3a1010', teeth:'#f4f0e6', tongue:'#b04848' };
  const EYE = '#1a120c';

  const CHARS = {
    sempronius: { skin:'light', helmet:{ type:'crest', c:'#c8303c', d:'#7a1a2a' }, clothes:{ type:'armor', metal:BRONZE, cloak:'#c03028', cloakD:'#801c18', tunic:'#a02820' }, brows:'#4a3020', stubble:true },
    flaminius:  { skin:'light', helmet:{ type:'feathers', c:'#8a2030', d:'#3a1018' }, clothes:{ type:'armor', metal:BRONZE, cloak:'#c03028', cloakD:'#801c18', tunic:'#a02820' }, brows:'#3a2418', thick:true },
    fabius:     { skin:'old', hair:{ type:'short', c:'#c4c4bc', d:'#94948c' }, wrinkles:true, clothes:{ type:'toga', stripe:'#7a2a8a' }, brows:'#a0a098' },
    senator:    { skin:'old', hair:{ type:'bald', c:'#d4d4cc', d:'#a4a49c' }, wrinkles:true, clothes:{ type:'toga', stripe:'#6a2a7a', broad:true }, brows:'#b4b4ac' },
    varro:      { skin:'light', hair:{ type:'short', c:'#2a1e18', d:'#140e0a' }, clothes:{ type:'armor', metal:BRONZE, cloak:'#c03028', cloakD:'#801c18', tunic:'#a02820' }, brows:'#140e0a', thick:true },
    paullus:    { skin:'old', hair:{ type:'short', c:'#6a4a30', d:'#4a3020', grey:'#a8a8a0' }, wrinkles:true, clothes:{ type:'armor', metal:IRON, cloak:'#3a5a9a', cloakD:'#24386a', tunic:'#2a4a7a' }, brows:'#4a3020' },
    scipio:     { skin:'light', helmet:{ type:'crest', c:'#f0ece0', d:'#b8b0a0' }, clothes:{ type:'armor', metal:BRONZE, cloak:'#38a848', cloakD:'#207030', tunic:'#2a7a3a' }, brows:'#4a3020' },
    hannibal:   { skin:'dark', hair:{ type:'curly', c:'#1e1612', d:'#0e0a08' }, beard:true, oneEye:true, clothes:{ type:'armor', metal:DBRONZE, cloak:'#5a2a7a', cloakD:'#3a1a52', tunic:'#3a1a3a' }, brows:'#140e0a' },
    boy:        { skin:'dark', hair:{ type:'curly', c:'#2a1e16', d:'#140e0a' }, clothes:{ type:'tunic', robe:'#e8e0d0', trim:'#5a2a7a' }, brows:'#1a120c' },
    hamilcar:   { skin:'dark', hair:{ type:'curly', c:'#2a1e16', d:'#140e0a' }, beard:true, wrinkles:true, clothes:{ type:'armor', metal:DBRONZE, cloak:'#5a2a7a', cloakD:'#3a1a52', tunic:'#3a1a3a' }, brows:'#1a120c', thick:true },
  };
  const MOOD = { neutral:'neutral', angry:'angry', yell:'yell', smug:'smug', worry:'worry', tired:'tired',
                 grim:'grim', normal:'neutral', tight:'yell', action:'yell', dead:'grim', crush:'grim', lanes:'neutral', stab:'neutral',
                 sail:'neutral', ready:'grim', march:'smug' };

  function newGrid(){ return Array.from({length:PH}, () => Array(PW).fill(null)); }
  function put(g, x, y, c){ if(y>=0 && y<PH && x>=0 && x<PW) g[y][x] = c; }
  function box(g, x, y, w, h, c){ for(let j=y; j<y+h; j++) for(let i=x; i<x+w; i++) put(g, i, j, c); }
  function ell(g, cx, cy, rx, ry, c, keep){
    for(let y=Math.floor(cy-ry); y<=Math.ceil(cy+ry); y++) for(let x=Math.floor(cx-rx); x<=Math.ceil(cx+rx); x++){
      const dx = (x - cx)/rx, dy = (y - cy)/ry;
      if(dx*dx + dy*dy <= 1 && (!keep || keep(x, y))) put(g, x, y, c);
    }
  }
  const halfW = y => Math.min(27, 12 + (y - 41) * 1.7);   // shoulders widen below the neck

  function drawClothes(g, d, S){
    const C = d.clothes;
    if(C.type === 'tunic'){
      for(let y=41; y<PH; y++){ const hw = Math.round(halfW(y) * 0.85); box(g, 28-hw, y, hw*2+1, 1, C.robe); put(g, 28+hw, y, TOGA.s); put(g, 28+hw-1, y, TOGA.s); }
      for(let x=21; x<=35; x++) put(g, x, 43 + Math.abs(x-28)/3|0, C.trim);    // embroidered neckline
      return;
    }
    if(C.type === 'toga'){
      for(let y=41; y<PH; y++){ const hw = Math.round(halfW(y)); box(g, 28-hw, y, hw*2+1, 1, TOGA.b); }
      // the tunic shows in the V of the toga
      for(let y=41; y<PH; y++){ const v = Math.max(0, 7 - Math.floor((y-41)/3)); if(v>0) box(g, 28-v, y, v*2+1, 1, C.broad ? TOGA.s : TOGA.h); }
      if(C.broad){ box(g, 21, 44, 3, PH-44, C.stripe); box(g, 33, 44, 3, PH-44, C.stripe); }   // the senator's two broad stripes
      // folds sweep from the left shoulder down across the chest
      for(let k=0; k<6; k++) for(let i=0; i<26; i++){
        const x = 4 + k*7 + i, y = 41 + i;
        if(y < PH && g[y][x] === TOGA.b) put(g, x, y, k%2 ? TOGA.d : TOGA.s);
      }
      if(!C.broad) for(let i=0; i<24; i++){ put(g, 14+i, 42+i, C.stripe); put(g, 15+i, 42+i, C.stripe); }   // purple border of the toga praetexta
      for(let y=41; y<PH; y++){ const hw = Math.round(halfW(y)); put(g, 28+hw, y, TOGA.s); put(g, 28+hw-1, y, TOGA.s); }
      return;
    }
    // armour: tunic at the shoulders, a muscle cuirass, a cloak pinned at the shoulder
    const M = C.metal || BRONZE;
    for(let y=41; y<PH; y++){ const hw = Math.round(halfW(y)); box(g, 28-hw, y, hw*2+1, 1, C.cloak); }
    for(let y=41; y<PH; y++){ const hw = Math.round(halfW(y)); for(const fx of [4, 9, 13, 43, 47, 52]) if(y > 45 && fx > 28-hw && fx < 28+hw) put(g, fx, y, C.cloakD); }
    for(let y=44; y<PH; y++) box(g, 17, y, 23, 1, C.tunic);
    for(let y=45; y<PH; y++) box(g, 18, y, 21, 1, M.b);
    for(let y=45; y<PH; y++) box(g, 35, y, 4, 1, M.s);                  // shaded side
    box(g, 20, 47, 5, 2, M.h); box(g, 31, 47, 2, 1, M.h);                // shine on the chest
    // pectoral muscles: two rounded curves meeting at the breastbone
    for(const [x, y] of [[19,51],[20,52],[21,53],[22,53],[23,53],[24,53],[25,52],[26,51],[27,50],
                         [29,50],[30,51],[31,52],[32,53],[33,53],[34,53],[35,53],[36,52],[37,51]]) put(g, x, y, M.s);
    for(let y=54; y<PH; y++) if(y%3) put(g, 28, y, M.s);                 // the line of the stomach
    put(g, 28, 59, M.d); box(g, 21, 56, 2, 1, M.h);
    box(g, 22, 44, 13, 1, M.d);                                          // neckline
    box(g, 14, 44, 4, 3, '#f8d048'); put(g, 15, 45, '#a8702c');           // brooch on the shoulder
  }

  function drawHair(g, d, S){
    const Hh = d.hair; if(!Hh) return;
    if(Hh.type === 'bald'){
      box(g, 16, 19, 4, 11, Hh.c); box(g, 37, 19, 4, 11, Hh.d);
      box(g, 22, 15, 4, 2, S.h);                                          // shine on the scalp
      return;
    }
    const top = Hh.type === 'curly' ? 12 : 13;
    ell(g, 28, 24, Hh.type==='curly' ? 13 : 12, 12, Hh.c, (x, y) => y <= 19);
    for(let x=17; x<=39; x++) if((x*7)%3 !== 0) put(g, x, 20, Hh.c);      // ragged fringe
    for(let x=34; x<=40; x++) for(let y=top; y<=20; y++) if(g[y][x] === Hh.c) put(g, x, y, Hh.d);
    const side = Hh.type === 'curly' ? 31 : 27;
    box(g, 16, 20, 3, side-20, Hh.grey || Hh.c); box(g, 38, 20, 3, side-20, Hh.grey || Hh.d);
    if(Hh.type === 'curly') for(let x=18; x<=38; x+=4){ put(g, x, top-1, Hh.c); put(g, x+1, top-1, Hh.c); }   // curls along the top
  }

  function drawHelmet(g, d){
    const Hm = d.helmet; if(!Hm) return;
    const t = PX.t;
    ell(g, 28, 22, 13, 13, IRON.b, (x, y) => y <= 20);                   // dome
    for(let y=9; y<=20; y++) for(let x=34; x<=41; x++) if(g[y][x] === IRON.b) put(g, x, y, IRON.s);
    box(g, 19, 12, 4, 2, IRON.h); box(g, 21, 11, 3, 1, IRON.h);          // shine
    box(g, 15, 19, 27, 2, IRON.s); box(g, 15, 19, 27, 1, IRON.b);        // brow rim
    // cheek guards
    for(const [x0, sh] of [[15, IRON.b], [37, IRON.s]]){
      box(g, x0, 21, 5, 13, sh); box(g, x0+1, 34, 3, 2, sh);
      put(g, x0+2, 24, IRON.d); put(g, x0+2, 31, IRON.d);
    }
    box(g, 12, 28, 3, 8, IRON.s); box(g, 42, 28, 3, 8, IRON.d);          // neck guard behind
    if(Hm.type === 'crest'){
      box(g, 25, 8, 7, 2, BRONZE.b); box(g, 25, 8, 7, 1, BRONZE.h);       // crest holder
      const sway = Math.floor(t/18) % 2;
      const HALF = [2,4,5,6,6,6,5,4];
      for(let r=0; r<HALF.length; r++){
        const half = HALF[r], off = r < 4 ? sway : 0;
        for(let x=28-half; x<=28+half; x++){
          const edge = x === 28-half || x === 28+half;
          put(g, x + off, r, edge ? Hm.d : ((x + r) % 3 === 0 ? Hm.d : Hm.c));
        }
        put(g, 28-half+1+off, r, r < 5 ? '#ffffff' : Hm.c);                 // lit edge of the horsehair
      }
    } else if(Hm.type === 'feathers'){
      box(g, 27, 7, 3, 2, BRONZE.b);                                      // knob
      for(let y=0; y<9; y++){
        const lean = Math.floor((9-y)/3);
        for(const [fx, c] of [[22-lean, Hm.c], [28, Hm.d], [34+lean, Hm.c]]){ put(g, fx, y, c); put(g, fx+1, y, y<3 ? '#e8e0d0' : c); }
      }
    }
  }

  function drawFace(g, d, S, mood, talking, blink){
    const t = PX.t;
    // eyes
    const eyeRows = { neutral:[26,27], smug:[26,27], worry:[26,27], angry:[27], grim:[27], tired:[27], yell:[25,26,27] }[mood] || [26,27];
    const eye = (x, right) => {
      if(blink || (right && d.oneEye)){ box(g, x, 27, 2, 1, S.d); return; }
      for(const y of eyeRows) box(g, x, y, 2, 1, EYE);
      if(eyeRows.length > 1) put(g, x + (right ? 1 : 0), eyeRows[0], '#f4f4f4');   // catchlight
      if(mood === 'tired' || mood === 'grim' || mood === 'angry') box(g, x, 26, 2, 1, S.s);  // heavy lid
    };
    eye(22, false); eye(33, true);
    if(d.oneEye){ for(let i=0; i<6; i++) put(g, 31+i, 22+i, '#7a3a2a'); }  // the scar over his blind eye
    // brows
    const B = d.brows, th = d.thick ? 2 : 1;
    const brow = (pts) => { for(const [x, y] of pts) for(let k=0; k<th; k++) put(g, x, y+k, B); };
    const L = [20,21,22,23,24], R = [32,33,34,35,36];
    if(mood === 'angry' || mood === 'yell'){ brow(L.map((x,i)=>[x, 22 + Math.floor(i/2)])); brow(R.map((x,i)=>[x, 24 - Math.floor(i/2)])); }
    else if(mood === 'worry'){ brow(L.map((x,i)=>[x, 24 - Math.floor(i/2)])); brow(R.map((x,i)=>[x, 22 + Math.floor(i/2)])); }
    else if(mood === 'smug'){ brow(L.map(x=>[x, 23])); brow(R.map(x=>[x, 22])); }
    else if(mood === 'tired' || mood === 'grim'){ brow(L.map((x,i)=>[x, i===0 ? 24 : 23])); brow(R.map((x,i)=>[x, i===4 ? 24 : 23])); }
    else { brow(L.map(x=>[x, 23])); brow(R.map(x=>[x, 23])); }
    // nose
    for(let y=28; y<=31; y++) put(g, 29, y, S.s);
    put(g, 27, 31, S.d); put(g, 29, 31, S.d); put(g, 28, 32, S.s);
    // age
    if(d.wrinkles){
      put(g, 19, 26, S.s); put(g, 19, 28, S.s); put(g, 37, 26, S.s); put(g, 37, 28, S.s);
      put(g, 24, 32, S.s); put(g, 23, 33, S.s); put(g, 32, 32, S.s); put(g, 33, 33, S.s);
      box(g, 22, 29, 2, 1, S.s); box(g, 33, 29, 2, 1, S.s);
    }
    if(d.stubble) for(let y=32; y<=38; y++) for(let x=20; x<=36; x++) if(g[y][x] === S.b && (x + y*2) % 3 === 0) put(g, x, y, S.s);
    if(d.beard){
      const hc = d.hair ? d.hair.c : '#1e1612';
      for(let y=29; y<=41; y++) for(let x=16; x<=40; x++) if((g[y][x] === S.b || g[y][x] === S.s) && (y >= 32 || x < 20 || x > 36)) put(g, x, y, hc);
      box(g, 24, 33, 9, 1, hc);                                           // moustache
    }
    // mouth
    const open = talking && (Math.floor(t/5) % 2 === 0);
    if(mood === 'yell'){
      box(g, 24, 34, 9, 5, MOUTH.in); box(g, 25, 34, 7, 1, MOUTH.teeth); box(g, 26, 38, 5, 1, MOUTH.tongue);
      if(talking && Math.floor(t/5)%2) box(g, 24, 37, 9, 2, S.s);          // jaw working while he shouts
    } else if(open){
      box(g, 25, 34, 7, 3, MOUTH.in); box(g, 25, 34, 7, 1, MOUTH.teeth);
    } else if(mood === 'smug'){
      box(g, 25, 35, 6, 1, MOUTH.lip); put(g, 31, 34, MOUTH.lip); put(g, 32, 34, MOUTH.lip);
    } else if(mood === 'angry' || mood === 'worry'){
      box(g, 25, 35, 7, 1, MOUTH.lip); put(g, 24, 36, MOUTH.lip); put(g, 32, 36, MOUTH.lip);
    } else if(mood === 'tired'){
      box(g, 25, 36, 7, 1, MOUTH.lip); put(g, 24, 37, MOUTH.lip); put(g, 32, 37, MOUTH.lip);
    } else if(mood === 'grim'){
      box(g, 24, 35, 9, 1, '#5a2a1a');
    } else {
      box(g, 25, 35, 7, 1, MOUTH.lip);
    }
  }

  const pcache = new Map();
  function portraitCanvas(id, mood, talking, blink){
    const d = CHARS[id];
    const m = MOOD[mood] || 'neutral';
    const t = PX.t;
    const open = talking ? (Math.floor(t/5) % 2) : 0;
    const sway = d.helmet ? Math.floor(t/18) % 2 : 0;
    const key = [id, m, open, talking?1:0, blink?1:0, sway].join('|');
    let cv = pcache.get(key);
    if(!cv){
      const S = SKIN[d.skin || 'light'];
      const g = newGrid();
      drawClothes(g, d, S);
      // neck and ears
      box(g, 23, 36, 11, 9, S.s); box(g, 24, 36, 7, 6, S.b);
      if(!d.helmet){ box(g, 16, 24, 2, 6, S.s); box(g, 39, 24, 2, 6, S.d); }
      // head with a shaded right side and jaw
      ell(g, 28, 26, 11, 13, S.b);
      for(let y=13; y<=39; y++) for(let x=34; x<=39; x++) if(g[y][x] === S.b) put(g, x, y, S.s);
      for(let x=20; x<=36; x++) if(g[38][x] === S.b || g[38][x] === S.s) put(g, x, 38, S.s);
      drawHair(g, d, S);
      drawHelmet(g, d);
      drawFace(g, d, S, m, talking, blink);
      cv = PX.bake(g, false);
      pcache.set(key, cv);
    }
    return cv;
  }

  // Draw a portrait with its bottom edge at the bottom of the picture.
  // opts: { x (centre), talking, mood }
  function portrait(id, mood='neutral', opts={}){
    const t = PX.t;
    const blink = (t % 200) < 7;
    const talking = opts.talking !== undefined ? opts.talking : api.isTalking();
    const cv = portraitCanvas(id, mood, talking, blink);
    const cx = opts.x !== undefined ? opts.x : W/2;
    const breathe = Math.floor(t/40) % 2;
    ctx.drawImage(cv, Math.round(cx - cv.width/2), H - cv.height + 1 + breathe + (opts.dy || 0));
  }

  // ---------------------------------------------------------------
  //  SHARED SETTINGS
  // ---------------------------------------------------------------
  // Inside a commander's tent at night, lit by a lantern
  function tent(){
    rect(0, 0, W, H, '#3a2c1e');
    for(let x=0; x<W; x+=12){ rect(x, 0, 6, H, '#463624'); px(x+6, 0, '#2a2016'); rect(x+6, 0, 1, H, '#2e2418'); }
    // roof slopes
    for(let y=0; y<30; y++){ rect(0, y, 64 - y*2, 1, '#2a2016'); rect(64 + y*2, y, W, 1, '#2a2016'); }
    rect(20, 0, 3, H, '#5a4028'); rect(21, 0, 1, H, '#7a5838');           // tent pole
    const fl = (Math.floor(PX.t/6) % 3);
    glow(30, 44, 34 + fl, '255,180,80', 0.32);
    rect(27, 38, 7, 9, '#2a2016'); rect(28, 39, 5, 7, fl ? '#fde68a' : '#fbbf24'); rect(29, 36, 3, 2, '#2a2016');
    // a table with a map
    rect(0, 120, W, 40, '#4a321c'); rect(0, 120, W, 2, '#6a4a2a');
    rect(8, 112, 34, 12, '#d8c8a0'); rect(10, 115, 12, 1, '#8a6a40'); rect(14, 118, 18, 1, '#5a6a9a'); px(30, 116, '#c03028');
    rect(96, 114, 22, 8, '#c8b890');
  }

  // A Roman camp seen from inside the rampart
  function camp(skyBands, opts={}){
    sky(skyBands);
    hills(88, [10,14,12,18,20,16,12,10,14,18,16,12,10,8,12,14,10], opts.hill || '#3a4434', opts.hillTop);
    rect(0, 88, W, H-88, opts.ground || '#5a5a48');
    if(opts.groundTile) PX.ground(16, 20, (x, y) => y*8 >= 88 ? opts.groundTile : null);
    for(let i=0; i<6; i++){ const x = 6 + i*22, y = 78 + (i%2)*6; PX.pic('tent', x/8 - 0.5, y/8 - 1); }
    for(const x of [40, 96]){ PX.pic('standard', x/8 - 0.5, 80/8 - 1); }
  }

  // ---------------------------------------------------------------
  //  MORE SHARED PIECES
  // ---------------------------------------------------------------
  // small string-art pictures, outlined and cached
  const acache = new Map();
  function art(name, rows, map, flip){
    const key = name + (flip ? '|f' : '');
    let cv = acache.get(key);
    if(!cv){
      let grid = rows.map(r => r.split('').map(ch => ch === '.' ? null : (map[ch] || '#ff00ff')));
      if(flip) grid = grid.map(r => r.slice().reverse());
      cv = PX.bake(grid, false); acache.set(key, cv);
    }
    return cv;
  }
  const SHIP = [
    "...............x................",
    "........wwwwwwwxwwwww...........",
    "........wwwwwwwxwwwww...........",
    "........wcccccccccccw...........",
    "........wwwwwwwxwwwww...........",
    "........wwwwwwwxwwwww...........",
    "...............x................",
    "y..............x..............y.",
    "hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh",
    ".HHHHyHHHHHHyHHHHHHyHHHHHHyHHHHrr",
    "..hhhhhhhhhhhhhhhhhhhhhhhhhhhhh.",
    "...o..o..o..o..o..o..o..o..o....",
    "..o..o..o..o..o..o..o..o..o.....",
  ].map(r => r.slice(0, 32));
  function ship(x, y, opts={}){
    const map = { w: opts.sail || '#f0ece0', c: opts.stripe || '#c03028', x:'#6a4a2a', h:'#8a5a30', H:'#5a3a1e', y:'#f8d048', r:'#a8b0b8', o:'#4a3420' };
    const cv = art('ship|' + (opts.sail||'') + (opts.stripe||''), SHIP, map, opts.flip);
    const bob = Math.round(Math.sin((PX.t + x) / 30));
    ctx.drawImage(cv, Math.round(x), Math.round(y) + bob);
    if(opts.burning){ fire(x + 16, y + 8, 2); fire(x + 8, y + 9, 1.4); smoke(x + 14, y, 44); }
  }
  // a tiny figure for crowds and benches: head, body, optional stripe
  function tiny(x, y, body, head='#e0a878', stripe){
    rect(x, y, 2, 2, head); rect(x - 1, y + 2, 4, 4, body);
    if(stripe) rect(x, y + 2, 1, 4, stripe);
  }
  // marble columns along a wall
  function columns(x0, y0, h, n, gap, col='#d8d4c8', shade='#a8a498'){
    for(let i=0; i<n; i++){
      const x = x0 + i*gap;
      rect(x - 1, y0, 8, 3, shade); rect(x, y0 + 3, 6, h - 6, col); rect(x + 4, y0 + 3, 2, h - 6, shade);
      rect(x + 2, y0 + 3, 1, h - 6, '#ece8dc'); rect(x - 1, y0 + h - 3, 8, 3, shade);
    }
  }
  // Rome on its hills at dusk: temples, walls, cypresses, lit windows
  function rome(baseY=104){
    hills(baseY, [18,22,26,24,20,16,18,24,28,26,22,18,16,14,18,20,18], '#2a2236', '#3a3048');
    const temples = [[14, baseY-34, 30], [70, baseY-36, 26], [100, baseY-30, 22]];
    for(const [x, y, w] of temples){
      ctx.fillStyle = '#3a3048';
      ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + w/2, y - 8); ctx.lineTo(x + w + 2, y); ctx.closePath(); ctx.fill();
      rect(x, y, w, 2, '#4a405a');
      for(let c=x+1; c<x+w-1; c+=4) rect(c, y + 2, 2, 12, '#4a405a');
      rect(x - 1, y + 14, w + 2, 2, '#3a3048');
    }
    rect(0, baseY - 8, W, 8, '#241e30');
    for(let i=0; i<W; i+=6) rect(i, baseY - 10, 3, 2, '#241e30');            // battlements
    for(let i=0; i<18; i++){ const x = (i*23) % W, y = baseY - 6 + (i%3); if((PX.t + i*40) % 240 > 30) px(x, y, '#fde68a'); }
    for(const x of [6, 56, 118]){ rect(x, baseY - 26, 3, 20, '#1a2a1e'); rect(x - 1, baseY - 20, 5, 10, '#1a2a1e'); px(x + 1, baseY - 28, '#1a2a1e'); }
  }
  // a block of soldiers from the battle sprites; rows drawn back to front
  function formation(kind, x0, y0, cols, rows, dx, dy, opts={}){
    const t = PX.t;
    for(let r=0; r<rows; r++) for(let c=0; c<cols; c++){
      const x = x0 + c*dx + ((opts.stagger && r%2) ? Math.floor(dx/2) : 0);
      const y = y0 + r*dy;
      PX.figure(kind, x, y, { back: !!opts.back, face: opts.face || 1, frame: opts.walk ? Math.floor((t + c*5 + r*3)/10) % 2 : 0 });
    }
  }
  function tint(rgba){ rect(0, 0, W, H, rgba); }

  // The legions wading a freezing river; the far bank is lost in fog
  function riverCrossing(top=40, bottom=96){
    PX.ground(16, 20, (x, y) => {
      const py = y*8;
      if(py < top || py >= bottom) return 'snowGround';
      return (Math.floor(x/2) % 2) ? 'ford' : 'deep';
    });
    const t = PX.t, men = [];
    for(let r=0; r<9; r++) for(let c=0; c<9; c++) men.push({ x: 4 + c*13 + (r%2)*5, y: 168 - ((t*0.22 + r*19) % 190), c });
    men.sort((a, b) => a.y - b.y);
    for(const m of men){
      const wet = m.y + 8 > top && m.y + 8 < bottom;
      PX.figure('roman', m.x, m.y, { back:true, frame: Math.floor((t + m.c*4)/12) % 2, icy: m.y < bottom });
      if(wet){
        rect(m.x + 1, m.y + 5, 8, 4, 'rgba(26,44,92,0.85)');
        if((t + m.c*7) % 24 < 3) px(m.x + (t % 7), m.y + 5, '#e8f4ff');
      }
    }
    mist(0, top + 4, 0.85);
    mist(top - 8, 18, 0.35);
    snow(70);
  }

  // ---------------------------------------------------------------
  //  DIALOGUE RUNNER: typewriter text, tap to continue, speaker name
  //  and colour, title screen at the end, and the draw loop.
  //  cfg = { script:[{scene, mood, speaker, text}], speakers:{id:{label,color}},
  //          speaker: default id, draw(line) }
  // ---------------------------------------------------------------
  function run(cfg){
    const BOX = document.getElementById('dialogue-box');
    const TXT = document.getElementById('speech');
    const NAME = document.getElementById('speaker') || document.querySelector('.speaker-name');
    const TITLE = document.getElementById('title-screen');
    let i = 0, ci = 0, cur = '', timer = null, titleAt = 0;
    api.isTalking = () => ci < cur.length;
    function start(){
      if(i >= cfg.script.length){
        BOX.style.display = 'none';
        TITLE.style.display = 'flex';
        titleAt = performance.now();
        requestAnimationFrame(() => { TITLE.style.opacity = 1; });
        fit();
        return;
      }
      const L = cfg.script[i];
      BOX.style.display = 'block';
      const sp = cfg.speakers && cfg.speakers[L.speaker || cfg.speaker];
      if(sp && NAME){ NAME.innerText = sp.label; NAME.style.color = sp.color; BOX.style.borderTopColor = sp.color; }
      cur = L.text; TXT.textContent = ''; ci = 0;
      clearInterval(timer); timer = setInterval(type, 30);
    }
    // the line is rebuilt from the script each tick: reading innerText back drops a trailing space
    function type(){ if(ci < cur.length){ ci++; TXT.textContent = cur.slice(0, ci); } else clearInterval(timer); }
    function next(){
      if(ci < cur.length){ TXT.textContent = cur; ci = cur.length; clearInterval(timer); }
      else { i++; start(); }
    }
    window.nextLine = next;
    // Keys: Space, Enter or the right arrow for the next line; Enter on the
    // title screen presses its first button (never a "start over" button).
    window.addEventListener('keydown', e => {
      if(e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if(TITLE && getComputedStyle(TITLE).display !== 'none'){
        if(e.key === 'Enter' && performance.now() - titleAt > 800){
          const b = TITLE.querySelector('button:not(.restart-btn)');
          if(b){ e.preventDefault(); b.click(); }
        }
        return;
      }
      if(e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight'){ e.preventDefault(); next(); }
    });
    init(document.getElementById('cv'));
    start();
    (function loop(now){
      if(PX.steps(now) > 0 && i < cfg.script.length){
        const L = cfg.script[i];
        frame(L.scene + '|' + (L.speaker || ''), () => cfg.draw(L));
      }
      requestAnimationFrame(loop);
    })();
  }

  const since = () => PX.t - keyStart;   // frames since the current scene began
  const api = { W, H, init, fit, frame, run, since, rect, px, dither, sky, stars, snow, mist, glow, fire, smoke, hills, water,
                portrait, portraitCanvas, tent, camp, art, ship, tiny, columns, rome, formation, tint, riverCrossing,
                isTalking: () => false, CHARS, rand,
                get ctx(){ return ctx; } };
  return api;
})();
