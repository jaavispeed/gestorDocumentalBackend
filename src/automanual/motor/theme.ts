import { TemaCliente } from './tipos.js';

export const TEMA_PREDETERMINADO: TemaCliente = {
  primaryColor: '#0062cc',
  secondaryColor: '#1d1d1f',
  accentColor: '#38bdf8',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  logoPath: 'default-logo.svg',
};

export function resolverTema(
  temaPersonalizado?: Partial<TemaCliente>,
): TemaCliente {
  return {
    primaryColor:
      temaPersonalizado?.primaryColor?.trim() ||
      TEMA_PREDETERMINADO.primaryColor,
    secondaryColor:
      temaPersonalizado?.secondaryColor?.trim() ||
      TEMA_PREDETERMINADO.secondaryColor,
    accentColor:
      temaPersonalizado?.accentColor?.trim() || TEMA_PREDETERMINADO.accentColor,
    fontFamily:
      temaPersonalizado?.fontFamily?.trim() || TEMA_PREDETERMINADO.fontFamily,
    logoPath:
      temaPersonalizado?.logoPath?.trim() || TEMA_PREDETERMINADO.logoPath,
  };
}

export function generarCssTema(tema: TemaCliente): string {
  const resuelto = resolverTema(tema);
  return `/* AutoManual - Tokens de Tema Estilo Apple */
:root {
  --client-primary: ${resuelto.primaryColor};
  --client-primary-hover: ${ajustarBrillo(resuelto.primaryColor, -10)};
  --client-primary-subtle: ${hexARgba(resuelto.primaryColor, 0.08)};
  --client-primary-border: ${hexARgba(resuelto.primaryColor, 0.22)};
  --client-primary-glow: ${hexARgba(resuelto.primaryColor, 0.25)};

  --client-secondary: ${resuelto.secondaryColor};
  --client-secondary-hover: ${ajustarBrillo(resuelto.secondaryColor, 12)};
  --client-secondary-subtle: ${hexARgba(resuelto.secondaryColor, 0.07)};
  --client-secondary-border: ${hexARgba(resuelto.secondaryColor, 0.16)};
  --client-font: ${resuelto.fontFamily};

  /* Paleta Apple Human Interface Guidelines */
  --bg-page: #f5f5f7;
  --bg-surface: #ffffff;
  --bg-translucent: rgba(255, 255, 255, 0.82);
  --bg-surface-secondary: #fbfbfd;
  --text-main: #1d1d1f;
  --text-secondary: #3c3c43;
  --text-muted: #59595e;
  --border-subtle: rgba(0, 0, 0, 0.07);
  --border-strong: rgba(0, 0, 0, 0.14);
  
  /* Curvas y Radios Apple */
  --radius-pill: 980px;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 22px;
  --radius-xl: 28px;

  /* Sombras y Luces Especulares */
  --shadow-subtle: 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-card: 0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
  --shadow-float: 0 16px 40px -8px rgba(0, 0, 0, 0.08), 0 6px 16px -4px rgba(0, 0, 0, 0.04);
  --shadow-modal: 0 24px 60px rgba(0, 0, 0, 0.15);
}
`;
}

function hexARgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6 && cleanHex.length !== 3)
    return `rgba(0, 113, 227, ${alpha})`;
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex;
  const num = parseInt(fullHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ajustarBrillo(hex: string, percent: number): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return hex;
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex;
  let num = parseInt(fullHex, 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
