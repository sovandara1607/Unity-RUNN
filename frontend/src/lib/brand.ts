/**
 * Bridges the admin-configurable brand colours into CSS custom properties.
 *
 * The public site applies `config.primary_color` through inline `style` attributes, which
 * cannot express hover or focus states. Everything interactive therefore hard-coded the
 * default acid yellow (`#d9ff00`) -- so changing the brand colour in /admin/public-site left
 * a trail of stubbornly yellow focus rings, hovers and underlines behind. Publishing the
 * colours as custom properties lets Tailwind reach them in any variant via `[var(--brand)]`.
 */

/** WCAG relative luminance of an #rrggbb colour, or null if it cannot be parsed. */
export function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((part) => {
    const c = part / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * The text colour to place on top of a brand colour.
 *
 * CTAs previously assumed `text-black` on the brand, which is right for acid yellow and
 * unreadable the moment an admin picks a dark colour. 0.1791 is the luminance at which
 * white and black reach equal contrast.
 */
export function readableInk(hex: string): string {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return "#111111";
  return luminance > 0.1791 ? "#111111" : "#ffffff";
}

export function brandCustomProperties(config: { primary_color: string; accent_color: string; background_color: string }): Record<string, string> {
  return {
    "--brand": config.primary_color,
    "--brand-ink": readableInk(config.primary_color),
    "--brand-accent": config.accent_color,
    "--brand-bg": config.background_color,
  };
}
