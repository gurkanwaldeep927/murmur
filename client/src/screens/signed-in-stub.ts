import { elFromHTML, esc } from "./dom";
import { pageShell } from "./styles";

/**
 * SCAFFOLDING — delete when S5 (Home Feed) lands in M2.
 *
 * T12 makes a returning user land signed-in instead of being sent back through S1,
 * but the authenticated shell (S5–S15) does not exist yet, so a restored session has
 * nowhere to go. This is the placeholder that keeps that path from rendering a blank
 * page — deliberately plain: it composes only the existing shared shell and adds no
 * new visual design, which is Claude Design's to author (06-ui deviations[0]).
 *
 * Replace the `mountSignedInStub` call in main.ts with the S5 mount; do not grow this
 * file into a screen.
 */
export function mountSignedInStub(
  mount: HTMLElement,
  profile: { pseudonym: string; year_badge: string },
  onSignOut: () => void,
): void {
  const node = elFromHTML(
    pageShell(`
      <div style="background:#FFF8F1; border:1px solid #F0DCCB; border-radius:20px; padding:28px; text-align:center">
        <div style="font-size:15px; font-weight:700; color:#3D2B1F">Signed in as ${esc(profile.pseudonym)}</div>
        <div style="margin-top:6px; font-size:13px; color:#8A7264">${esc(profile.year_badge)}</div>
        <p style="margin:18px 0 0; font-size:13px; line-height:1.5; color:#8A7264">
          Your session was restored — no re-verification needed. The home feed arrives
          with the next milestone.
        </p>
        <button id="mur-sign-out" class="mur-link-btn" type="button"
          style="margin-top:20px; border:0; background:#FBE7DA; color:#C6482C; font-family:inherit; font-size:13px; font-weight:600; padding:10px 18px; border-radius:12px; cursor:pointer">
          Sign out
        </button>
      </div>
    `),
  );
  node.querySelector<HTMLButtonElement>("#mur-sign-out")?.addEventListener("click", onSignOut);
  mount.replaceChildren(node);
}
