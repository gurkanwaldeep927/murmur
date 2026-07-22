/**
 * Tiny DOM helpers for the ported Claude Design screens. No framework — the designs
 * use inline style strings (native HTML), so a light vanilla layer ports them 1:1.
 */

/** Build a single root element from an HTML string. */
export function elFromHTML(htmlStr: string): HTMLElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = htmlStr.trim();
  const node = tpl.content.firstElementChild;
  if (!node) throw new Error("elFromHTML: no root element in template");
  return node as HTMLElement;
}

/** Replace the mount point's content with a new node. */
export function render(mount: HTMLElement, node: HTMLElement): void {
  mount.replaceChildren(node);
}

/** Escape untrusted text before inserting into markup. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
