// =====================================================================
//  controls.js: the same game on a phone, a tablet or a laptop.
//
//  - <html class="kbd"> when the device has no touchscreen (a laptop or
//    Chromebook), or the player has started using the keys. ui.css and
//    boot.css then hide the on-screen joystick and buttons and show the
//    keys instead. Touching the screen brings the on-screen controls back,
//    so a touchscreen laptop can switch between the two.
//  - Enter presses the main button of a battle's start or end screen.
//    (Cutscenes handle their own keys in scene.js.)
// =====================================================================
(function(){
  const root = document.documentElement;
  const touchScreen = window.matchMedia ? window.matchMedia('(any-pointer: coarse)').matches
                                        : ('ontouchstart' in window);
  root.classList.toggle('kbd', !touchScreen);

  const GAME_KEYS = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space','Enter','KeyZ'];
  window.addEventListener('keydown', e => { if(GAME_KEYS.includes(e.code)) root.classList.add('kbd'); }, true);
  window.addEventListener('touchstart', () => root.classList.remove('kbd'), { capture:true, passive:true });

  // Enter: the first button of a start / end / history screen. Ignored for
  // a moment after a screen appears mid-game, so a key pressed in the
  // fight can't skip the ending before it has been read. (The start
  // screen is there from the beginning: no wait.)
  let shownAt = -1e9, wasShown = true;
  function overlayShown(){
    const ov = document.getElementById('overlay');
    const shown = !!ov && getComputedStyle(ov).display !== 'none';
    if(shown && !wasShown) shownAt = performance.now();
    wasShown = shown;
    return shown ? ov : null;
  }
  (function watch(){ overlayShown(); setTimeout(watch, 200); })();
  window.addEventListener('keydown', e => {
    if(e.key !== 'Enter') return;
    const ov = overlayShown();
    if(!ov) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if(e.repeat || performance.now() - shownAt < 900) return;
    const btn = ov.querySelector('.btn-start') || ov.querySelector('button');
    if(btn) btn.click();
  }, true);
})();
