/**
 * Old browser engines, and the office TV in particular.
 *
 * The TV is an LG webOS set whose browser reports "Chrome/87.0.3945.79" — but
 * 3945.79 is Chromium 79's build number; the major version is bumped so sites
 * don't turn it away. Next.js 16 targets Chrome 111+ by default, and on that
 * engine its router chunk (a class `static {}` block) failed to parse, so the
 * board's JavaScript never started: no loop, no poll, numbers frozen.
 *
 * - JavaScript: package.json `browserslist` adds "chrome 79", so the build
 *   compiles everything — Next's own runtime included — down to it. Next's
 *   polyfill chunk already covers .at(), Object.hasOwn and URL.canParse.
 * - CSS the build can't lower lives at the end of ops/tokens.css: margins for
 *   flex `gap` (Chromium 84+), a fallback for color-mix(), and the spring's
 *   linear() easing gets a cubic-bezier stand-in in ops/ops-board.css.
 *
 * Don't raise the browserslist floor past 79 while that TV is on the wall.
 */

/**
 * Puts `ob-nfg` on <html> when flexbox ignores `gap` (Chromium < 84), which
 * switches on the margin fallbacks in ops/tokens.css. Runs inline before the
 * board paints, so it is plain ES5: it never goes through the build.
 */
export const FLEX_GAP_CHECK = `(function(){try{var d=document,f=d.createElement('div');f.style.cssText='display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';f.appendChild(d.createElement('div'));f.appendChild(d.createElement('div'));d.body.appendChild(f);var ok=f.scrollHeight===1;d.body.removeChild(f);if(!ok)d.documentElement.className+=' ob-nfg'}catch(e){}})()`;
