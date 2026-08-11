/**
 * Per-tenant theming. Turns a company's brand colour into overrides for the
 * primary token family, which every `bg-primary` / `primary-soft` / ring / active
 * nav item resolves through — so one hex re-skins the whole portal. Derived tones
 * use CSS color-mix so we don't ship a colour library; the primary foreground is
 * computed from luminance for legible button text. Emitted as a `:root` rule so
 * it also covers dialogs and menus that render in a body-level portal.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * A `:root { … }` CSS override for a brand colour, or null to keep the default
 * theme. The hex is regex-validated, so interpolating it into CSS is safe.
 */
export function brandThemeCss(hex: string | null | undefined): string | null {
  if (!hex || !HEX.test(hex)) return null;
  const c = hex.toLowerCase();
  // Dark text on light/vivid brands, white on dark ones.
  const fg = luminance(c) > 0.45 ? "oklch(0.22 0.01 0)" : "oklch(0.99 0.01 90)";

  return `:root{
    --primary:${c};
    --primary-hover:color-mix(in oklab, ${c} 88%, black);
    --primary-foreground:${fg};
    --primary-soft:color-mix(in oklab, ${c} 12%, white);
    --accent:color-mix(in oklab, ${c} 12%, white);
    --accent-foreground:color-mix(in oklab, ${c}, black 45%);
    --ring:${c};
    --sidebar-accent:color-mix(in oklab, ${c} 50%, black);
    --sidebar-accent-foreground:color-mix(in oklab, ${c} 35%, white);
  }`;
}
