import {CardStyle, CornerRadius, FontScale, LayoutDensity, SurfaceMode, ThemeConfig} from '../types';

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  surface: 'light',
  accentColor: '#059669',
  cardStyle: 'gradient',
  radius: 'rounded',
  density: 'cozy',
  fontScale: 'md',
};

export interface SurfacePreset {
  id: SurfaceMode;
  labelBn: string;
  labelEn: string;
  descBn: string;
  isDark: boolean;
  previewBg: string;
  previewCard: string;
  previewBorder: string;
}

export const SURFACE_PRESETS: SurfacePreset[] = [
  {
    id: 'light',
    labelBn: 'ক্রিস্প লাইট',
    labelEn: 'Crisp Light',
    descBn: 'পরিচ্ছন্ন সাদা ও স্লেট',
    isDark: false,
    previewBg: '#f8fafc',
    previewCard: '#ffffff',
    previewBorder: '#e2e8f0',
  },
  {
    id: 'warm',
    labelBn: 'ওয়ার্ম পেপার',
    labelEn: 'Warm Paper',
    descBn: 'চোখের আরামের ক্রিম শেড',
    isDark: false,
    previewBg: '#faf6ee',
    previewCard: '#fffdf8',
    previewBorder: '#e7dec9',
  },
  {
    id: 'dark',
    labelBn: 'মিডনাইট ডার্ক',
    labelEn: 'Midnight Slate',
    descBn: 'গভীর স্লেট ডার্ক মোড',
    isDark: true,
    previewBg: '#020617',
    previewCard: '#0f172a',
    previewBorder: '#1e293b',
  },
  {
    id: 'amoled',
    labelBn: 'পিওর অ্যামোলেড',
    labelEn: 'Pure AMOLED',
    descBn: 'ব্যাটারি সেভিং পিওর ব্ল্যাক',
    isDark: true,
    previewBg: '#000000',
    previewCard: '#0a0a0c',
    previewBorder: '#1f1f24',
  },
];

export interface AccentPreset {
  id: string;
  nameBn: string;
  nameEn: string;
  hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {id: 'emerald', nameBn: 'এমেরাল্ড', nameEn: 'Emerald', hex: '#059669'},
  {id: 'ocean', nameBn: 'ওশান ব্লু', nameEn: 'Ocean', hex: '#0284c7'},
  {id: 'indigo', nameBn: 'ইন্ডিগো', nameEn: 'Indigo', hex: '#4f46e5'},
  {id: 'violet', nameBn: 'রয়্যাল ভায়োলেট', nameEn: 'Violet', hex: '#7c3aed'},
  {id: 'rose', nameBn: 'রুবি রোজ', nameEn: 'Rose', hex: '#e11d48'},
  {id: 'amber', nameBn: 'গোল্ড অ্যাম্বার', nameEn: 'Amber', hex: '#d97706'},
  {id: 'teal', nameBn: 'ডিপ টিল', nameEn: 'Teal', hex: '#0d9488'},
  {id: 'slate', nameBn: 'আয়রন স্লেট', nameEn: 'Slate', hex: '#334155'},
];

export const CARD_STYLE_OPTIONS: Array<{id: CardStyle; labelBn: string; labelEn: string}> = [
  {id: 'gradient', labelBn: 'গ্রেডিয়েন্ট কার্ড', labelEn: 'Gradient'},
  {id: 'glass', labelBn: 'গ্লাস এফেক্ট', labelEn: 'Glass'},
  {id: 'minimal', labelBn: 'মিনিমাল ক্লিন', labelEn: 'Minimal'},
];

export const RADIUS_OPTIONS: Array<{id: CornerRadius; labelBn: string; labelEn: string}> = [
  {id: 'rounded', labelBn: 'সফট রাউন্ডেড', labelEn: 'Rounded'},
  {id: 'sharp', labelBn: 'শার্প এডিটোরিয়াল', labelEn: 'Sharp'},
];

export const DENSITY_OPTIONS: Array<{id: LayoutDensity; labelBn: string; labelEn: string}> = [
  {id: 'cozy', labelBn: 'স্বাচ্ছন্দ্য (Cozy)', labelEn: 'Cozy'},
  {id: 'compact', labelBn: 'কম্প্যাক্ট (বেশি তথ্য)', labelEn: 'Compact'},
];

export const FONT_SCALE_OPTIONS: Array<{id: FontScale; labelBn: string; labelEn: string}> = [
  {id: 'sm', labelBn: 'ছোট', labelEn: 'Small'},
  {id: 'md', labelBn: 'মাঝারি', labelEn: 'Medium'},
  {id: 'lg', labelBn: 'বড়', labelEn: 'Large'},
];

function hexToRgb(hex: string): {r: number; g: number; b: number} {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return {r: 5, g: 150, b: 105};
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function adjustHexBrightness(hex: string, amount: number): string {
  const {r, g, b} = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = clamp(r + amount);
  const ng = clamp(g + amount);
  const nb = clamp(b + amount);
  return `#${((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1)}`;
}

export function resolveEffectiveThemeConfig(
  themeConfig?: Partial<ThemeConfig>,
  darkMode?: boolean
): ThemeConfig {
  const surface: SurfaceMode =
    themeConfig?.surface && ['light', 'warm', 'dark', 'amoled'].includes(themeConfig.surface)
      ? themeConfig.surface
      : darkMode
      ? 'dark'
      : 'light';

  const accentColor =
    themeConfig?.accentColor && /^#[0-9a-fA-F]{3,8}$/.test(themeConfig.accentColor)
      ? themeConfig.accentColor
      : DEFAULT_THEME_CONFIG.accentColor;

  return {
    surface,
    accentColor,
    cardStyle:
      themeConfig?.cardStyle && ['gradient', 'glass', 'minimal'].includes(themeConfig.cardStyle)
        ? themeConfig.cardStyle
        : DEFAULT_THEME_CONFIG.cardStyle,
    radius:
      themeConfig?.radius && ['rounded', 'sharp'].includes(themeConfig.radius)
        ? themeConfig.radius
        : DEFAULT_THEME_CONFIG.radius,
    density:
      themeConfig?.density && ['cozy', 'compact'].includes(themeConfig.density)
        ? themeConfig.density
        : DEFAULT_THEME_CONFIG.density,
    fontScale:
      themeConfig?.fontScale && ['sm', 'md', 'lg'].includes(themeConfig.fontScale)
        ? themeConfig.fontScale
        : DEFAULT_THEME_CONFIG.fontScale,
  };
}

export function applyThemeToDocument(themeConfig?: Partial<ThemeConfig>, darkMode?: boolean): ThemeConfig {
  const resolved = resolveEffectiveThemeConfig(themeConfig, darkMode);
  if (typeof document === 'undefined') return resolved;

  const root = document.documentElement;
  const isDark = resolved.surface === 'dark' || resolved.surface === 'amoled';

  root.classList.toggle('dark', isDark);
  root.setAttribute('data-surface', resolved.surface);
  root.setAttribute('data-radius', resolved.radius);
  root.setAttribute('data-density', resolved.density);
  root.setAttribute('data-font-scale', resolved.fontScale);

  const {r, g, b} = hexToRgb(resolved.accentColor);
  const hoverHex = adjustHexBrightness(resolved.accentColor, -22);
  const deepHex = adjustHexBrightness(resolved.accentColor, -48);
  const lightTintHex = adjustHexBrightness(resolved.accentColor, 28);

  root.style.setProperty('--ct-accent', resolved.accentColor);
  root.style.setProperty('--ct-accent-hover', hoverHex);
  root.style.setProperty('--ct-accent-deep', deepHex);
  root.style.setProperty('--ct-accent-light', lightTintHex);
  root.style.setProperty('--ct-accent-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--ct-accent-soft', `rgba(${r}, ${g}, ${b}, ${isDark ? 0.18 : 0.1})`);
  root.style.setProperty('--ct-accent-ring', `rgba(${r}, ${g}, ${b}, 0.28)`);

  // Radius tokens
  root.style.setProperty('--ct-radius-card', resolved.radius === 'sharp' ? '0.625rem' : '1.125rem');
  root.style.setProperty('--ct-radius-btn', resolved.radius === 'sharp' ? '0.5rem' : '0.75rem');

  // Theme meta color on mobile browser
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute(
      'content',
      resolved.surface === 'amoled'
        ? '#000000'
        : resolved.surface === 'dark'
        ? '#0f172a'
        : resolved.accentColor
    );
  }

  return resolved;
}
