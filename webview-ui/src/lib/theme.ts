/**
 * Returns true if the current VS Code theme looks dark based on
 * the CSS custom property --vscode-panel-background.
 * Fallback: if the token is missing, uses prefers-color-scheme.
 *
 * @param threshold - 0..1 luminance cutoff (lower = darker). Default 0.4
 * @returns boolean
 */
export function isVscodeDark(threshold: number = 0.4): boolean {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--vscode-panel-background')
    .trim();

  if (!raw) {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  const { r, g, b } = parseColor(raw);
  const L = relativeLuminance(r, g, b);
  return L < threshold;
}

/* ---------- helpers ---------- */

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseColor(input: string): RGB {
  if (input.startsWith('#')) {
    let hex = input.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    else if (hex.length === 4) hex = hex.split('').map(c => c + c).join('').slice(0, 6); // drop alpha
    else if (hex.length === 8) hex = hex.slice(0, 6); // drop alpha

    if (hex.length !== 6) throw new Error('Unsupported hex color: ' + input);

    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const m = input.match(/rgba?\(\s*([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map(s => s.trim());
    const to255 = (v: string): number => {
      if (v.endsWith('%')) return Math.round(255 * (parseFloat(v) / 100));
      return Math.max(0, Math.min(255, parseFloat(v)));
    };
    return { r: to255(parts[0]), g: to255(parts[1]), b: to255(parts[2]) };
  }

  throw new Error('Unrecognized color format: ' + input);
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number): number => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/* ---------- example ---------- */
console.log('VS Code theme dark?', isVscodeDark());           // default cutoff 0.4
console.log('More strict cutoff (0.5):', isVscodeDark(0.5));
