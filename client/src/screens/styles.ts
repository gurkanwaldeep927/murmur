/**
 * Shared stylesheet for the ported screens — S1–S4 (T10) and S5–S8 (T19).
 *
 * The keyframes below are the union of the per-screen <style> blocks in the Claude
 * Design `.dc.html` sources (verbatim). The `.mur-*` classes reproduce the designs'
 * `style-hover` / `style-focus` / `style-active` custom attributes (which only the
 * dc-runtime interprets) as real CSS pseudo-state rules — the one transformation
 * needed to run the designs without that runtime. No colors or sizes were changed.
 */

const CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: #F6EDE4; font-family: 'Plus Jakarta Sans', sans-serif; }
  a { color: #F26B4E; text-decoration: none; }
  a:hover { color: #D95538; }
  input::placeholder { color: #C4AB9E; }

  /* --- pseudo-state ports of the designs' style-focus/hover/active --- */
  .mur-input:focus { border: 2px solid #F26B4E; box-shadow: 0 0 0 4px rgba(242,107,78,.13); }
  .mur-otp:focus { border: 2px solid #F26B4E; box-shadow: 0 0 0 4px rgba(242,107,78,.13); transform: scale(1.06); }
  .mur-btn-primary:not(:disabled):hover { background: #E85A3C; transform: translateY(-1px); box-shadow: 0 9px 22px rgba(242,107,78,.38); }
  .mur-btn-primary:not(:disabled):active { transform: translateY(1px) scale(.98); box-shadow: 0 3px 10px rgba(242,107,78,.3); }
  .mur-btn-lift:not(:disabled):hover { transform: translateY(-1px); }
  .mur-btn-lift:not(:disabled):active { transform: translateY(1px) scale(.98); }
  .mur-link-btn:hover { background: #FBE2D4; transform: translateY(-1px); }

  /* --- S5–S8 pseudo-state ports (T19) --- */
  .mur-card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(93,58,44,.1); }
  .mur-card:active { transform: scale(.985); }
  .mur-fab:hover { background: #E85A3C; transform: scale(1.05); }
  .mur-fab:active { transform: scale(.96); }
  .mur-icon-btn:hover { background: #F4E5D9; }
  .mur-chip:hover { transform: translateY(-1px); }
  .mur-chip:active { transform: scale(.95); }
  .mur-textarea:focus { border: 2px solid #F26B4E; box-shadow: 0 0 0 4px rgba(242,107,78,.13); }
  .mur-btn-soft:hover { background: #DAEAE0; }
  .mur-btn-muted:not(:disabled):hover { background: #EDE2D2; transform: translateY(-1px); }
  .mur-retry:hover { background: #FBE2D4; transform: translateY(-1px); }
  /* The composers' inputs carry no border of their own by design; keep it that way. */
  .mur-bare-input:focus { outline: none; }

  /* --- animations (union of S1–S4 .dc.html keyframes) --- */
  @keyframes blobFloat { 0%,100%{ transform:translate(0,0) scale(1);} 50%{ transform:translate(10px,-14px) scale(1.06);} }
  @keyframes blobFloat2 { 0%,100%{ transform:translate(0,0) scale(1);} 50%{ transform:translate(-12px,10px) scale(1.08);} }
  @keyframes popIn { 0%{ transform:scale(.6); opacity:0;} 70%{ transform:scale(1.08);} 100%{ transform:scale(1); opacity:1;} }
  @keyframes slideDown { from{ transform:translateY(-6px); opacity:0;} to{ transform:translateY(0); opacity:1;} }
  @keyframes dotPulse { 0%,80%,100%{ opacity:.25; transform:scale(.85);} 40%{ opacity:1; transform:scale(1);} }
  @keyframes envFloat { 0%,100%{ transform:translateY(0) rotate(-2deg);} 50%{ transform:translateY(-10px) rotate(2deg);} }
  @keyframes ringPulse { 0%{ transform:scale(1); opacity:.5;} 100%{ transform:scale(1.6); opacity:0;} }
  @keyframes revealUp { 0%{ transform:translateY(14px); opacity:0;} 100%{ transform:translateY(0); opacity:1;} }
  @keyframes confettiFall { 0%{ transform:translateY(-10px) rotate(0deg); opacity:1;} 100%{ transform:translateY(120px) rotate(240deg); opacity:0;} }
  @keyframes shimmer { 0%{ background-position:-200px 0;} 100%{ background-position:200px 0;} }

  /* --- S5–S8 keyframes (T19). shimmer above is S1–S4's 200px variant; S5/S7 use 260px. --- */
  @keyframes cardIn { 0%{ transform:translateY(16px); opacity:0;} 100%{ transform:translateY(0); opacity:1;} }
  @keyframes shimmerWide { 0%{ background-position:-260px 0;} 100%{ background-position:260px 0;} }
  @keyframes fabBob { 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-4px);} }
  @keyframes sheetUp { 0%{ transform:translateY(60px); opacity:0;} 100%{ transform:translateY(0); opacity:1;} }
  @keyframes toastUp { 0%{ transform:translate(-50%,20px); opacity:0;} 100%{ transform:translate(-50%,0); opacity:1;} }
`;

let injected = false;
export function injectStyles(): void {
  if (injected) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  injected = true;
}

/** The three-dot "loading" indicator markup, reused verbatim across S1–S4 buttons. */
export const dotsHTML = `<span style="display:inline-flex; gap:4px">
  <span style="width:5px; height:5px; border-radius:50%; background:#FFF8F1; animation:dotPulse 1.1s infinite"></span>
  <span style="width:5px; height:5px; border-radius:50%; background:#FFF8F1; animation:dotPulse 1.1s .18s infinite"></span>
  <span style="width:5px; height:5px; border-radius:50%; background:#FFF8F1; animation:dotPulse 1.1s .36s infinite"></span>
</span>`;

/** Standard page wrapper (gradient background + centered column) shared by S1–S4. */
export function pageShell(inner: string, width = 390): string {
  return `<div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Plus Jakarta Sans',sans-serif; background:linear-gradient(180deg,#FFF8F1 0%,#FDEFE3 100%)">
    <div style="width:${width}px; max-width:100%; position:relative">${inner}</div>
  </div>`;
}

/**
 * The full-height 420px phone column S5–S8 share, verbatim from their `.dc.html`
 * sources. Distinct from `pageShell`: those screens are full-bleed app surfaces with
 * sticky headers and bottom bars, not centered cards.
 */
export function appShell(inner: string): string {
  return `<div style="min-height:100vh; display:flex; justify-content:center; font-family:'Plus Jakarta Sans',sans-serif; background:#EFE3D8">
    <div style="width:420px; max-width:100%; min-height:100vh; background:linear-gradient(180deg,#FFF8F1 0%,#FDEFE3 100%); position:relative; display:flex; flex-direction:column">${inner}</div>
  </div>`;
}

/** The shimmering skeleton block S5 and S7 both use while loading. */
export function skeletonBar(width: string, height: string, radius: string): string {
  return `<div style="width:${width}; height:${height}; border-radius:${radius}; background:linear-gradient(90deg,#F4E5D9 25%,#FBF1E9 50%,#F4E5D9 75%); background-size:260px 100%; animation:shimmerWide 1.4s linear infinite"></div>`;
}
