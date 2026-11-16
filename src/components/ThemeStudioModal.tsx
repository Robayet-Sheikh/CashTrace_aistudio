import React from 'react';
import {Check, Palette, RotateCcw, Sparkles, X} from 'lucide-react';
import {LanguageCode, ThemeConfig} from '../types';
import {t} from '../utils/i18n';
import {
  ACCENT_PRESETS,
  CARD_STYLE_OPTIONS,
  DEFAULT_THEME_CONFIG,
  DENSITY_OPTIONS,
  FONT_SCALE_OPTIONS,
  RADIUS_OPTIONS,
  resolveEffectiveThemeConfig,
  SURFACE_PRESETS,
} from '../utils/themeEngine';

interface ThemeStudioModalProps {
  isOpen: boolean;
  themeConfig?: Partial<ThemeConfig>;
  darkMode: boolean;
  language: LanguageCode;
  onChangeTheme: (next: ThemeConfig) => void;
  onClose: () => void;
}

export const ThemeStudioModal: React.FC<ThemeStudioModalProps> = ({
  isOpen,
  themeConfig,
  darkMode,
  language,
  onChangeTheme,
  onClose,
}) => {
  if (!isOpen) return null;

  const current = resolveEffectiveThemeConfig(themeConfig, darkMode);

  const patchTheme = (patch: Partial<ThemeConfig>) => {
    onChangeTheme({
      ...current,
      ...patch,
    });
  };

  const resetDefault = () => {
    onChangeTheme({...DEFAULT_THEME_CONFIG});
  };

  const isPresetAccent = ACCENT_PRESETS.some(
    (p) => p.hex.toLowerCase() === current.accentColor.toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-xl ct-surface-card border shadow-2xl rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Drag handle on mobile */}
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/70 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 ct-btn-radius ct-accent-soft flex items-center justify-center shrink-0">
              <Palette className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {t('থিম ও ডিজাইন স্টুডিও', 'Theme & Design Studio', language)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {t('রং, সারফেস, কার্ড স্টাইল ও ফন্ট সাইজ পছন্দমতো সাজান', 'Customize surface, accent, card look & typography', language)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={resetDefault}
              className="min-h-[38px] px-2.5 ct-btn-radius text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
              title={t('ডিফল্ট রিসেট', 'Reset Default', language)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('রিসেট', 'Reset', language)}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] ct-btn-radius flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Live Miniature Preview Banner */}
          <div
            className={`p-4 ct-btn-radius border transition-all ${
              current.cardStyle === 'gradient'
                ? 'ct-hero-gradient border-transparent shadow-md'
                : current.cardStyle === 'glass'
                ? 'ct-hero-glass text-slate-900 dark:text-white'
                : 'ct-surface-alt text-slate-900 dark:text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span
                  className={`text-[11px] font-semibold flex items-center gap-1 ${
                    current.cardStyle === 'gradient'
                      ? 'text-white/80'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  {t('লাইভ থিম প্রিভিউ', 'Live Preview', language)}
                </span>
                <p className="text-xl font-bold tabular-nums tracking-tight">
                  ৳ ২৪,৫৮০.০০
                </p>
              </div>
              <span
                className={`px-3 py-1.5 ct-btn-radius text-xs font-bold ${
                  current.cardStyle === 'gradient'
                    ? 'bg-white text-slate-900'
                    : 'ct-accent-bg'
                }`}
              >
                {t('নতুন এন্ট্রি', 'Add Entry', language)}
              </span>
            </div>
          </div>

          {/* 1. Surface Mode */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              {t('১. সারফেস মোড (ব্যাকগ্রাউন্ড)', '1. Surface Mode', language)}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {SURFACE_PRESETS.map((surf) => {
                const selected = current.surface === surf.id;
                return (
                  <button
                    key={surf.id}
                    type="button"
                    onClick={() => patchTheme({surface: surf.id})}
                    className={`p-2.5 ct-btn-radius border text-left transition-all flex flex-col gap-2 ${
                      selected
                        ? 'ct-accent-border ring-2 ring-[var(--ct-accent-ring)] bg-[var(--ct-accent-soft)]'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {/* Mini UI Swatch */}
                    <div
                      className="w-full h-11 rounded-lg p-1.5 border flex flex-col justify-between"
                      style={{
                        backgroundColor: surf.previewBg,
                        borderColor: surf.previewBorder,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="w-5 h-1.5 rounded-full"
                          style={{backgroundColor: current.accentColor}}
                        />
                        {selected && (
                          <Check className="w-3 h-3" style={{color: current.accentColor}} />
                        )}
                      </div>
                      <div
                        className="w-full h-4 rounded border"
                        style={{
                          backgroundColor: surf.previewCard,
                          borderColor: surf.previewBorder,
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {language === 'bn' ? surf.labelBn : surf.labelEn}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {surf.descBn}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Accent Color Presets + Custom Picker */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {t('২. প্রাইমারি অ্যাকসেন্ট রং', '2. Accent Color', language)}
              </label>
              <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase">
                {current.accentColor}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {ACCENT_PRESETS.map((preset) => {
                const selected = current.accentColor.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => patchTheme({accentColor: preset.hex})}
                    className={`px-2.5 py-2 ct-btn-radius border text-xs font-semibold inline-flex items-center gap-2 transition-all min-h-[40px] ${
                      selected
                        ? 'ct-accent-border bg-[var(--ct-accent-soft)] text-slate-900 dark:text-white ring-1 ring-[var(--ct-accent-ring)]'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-white"
                      style={{backgroundColor: preset.hex}}
                    >
                      {selected && <Check className="w-2.5 h-2.5" />}
                    </span>
                    <span>{language === 'bn' ? preset.nameBn : preset.nameEn}</span>
                  </button>
                );
              })}

              <label
                className={`px-2.5 py-2 ct-btn-radius border text-xs font-semibold inline-flex items-center gap-2 cursor-pointer min-h-[40px] ${
                  !isPresetAccent
                    ? 'ct-accent-border bg-[var(--ct-accent-soft)] text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <input
                  type="color"
                  value={current.accentColor}
                  onChange={(e) => patchTheme({accentColor: e.target.value})}
                  className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer p-0"
                  aria-label="Custom accent color picker"
                />
                <span>{t('কাস্টম রং', 'Custom Hex', language)}</span>
              </label>
            </div>
          </div>

          {/* 3. Hero Card Style */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              {t('৩. হিরো ব্যালেন্স কার্ড স্টাইল', '3. Hero Balance Card Style', language)}
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 ct-surface-alt border ct-btn-radius">
              {CARD_STYLE_OPTIONS.map((opt) => {
                const selected = current.cardStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patchTheme({cardStyle: opt.id})}
                    className={`py-2 px-2 rounded-lg text-xs font-bold transition-all min-h-[38px] ${
                      selected
                        ? 'ct-surface-card text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {language === 'bn' ? opt.labelBn : opt.labelEn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Radius, Density, Font Scale */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                {t('কর্নার স্টাইল', 'Corners', language)}
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 ct-surface-alt border ct-btn-radius">
                {RADIUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patchTheme({radius: opt.id})}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors ${
                      current.radius === opt.id
                        ? 'ct-surface-card text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {language === 'bn' ? opt.labelBn.split(' ')[1] || opt.labelBn : opt.labelEn}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                {t('লেআউট স্পেসিং', 'Density', language)}
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 ct-surface-alt border ct-btn-radius">
                {DENSITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patchTheme({density: opt.id})}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors ${
                      current.density === opt.id
                        ? 'ct-surface-card text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {language === 'bn' ? opt.labelBn.split(' ')[0] : opt.labelEn}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                {t('ফন্টের সাইজ', 'Font Scale', language)}
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 ct-surface-alt border ct-btn-radius">
                {FONT_SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patchTheme({fontScale: opt.id})}
                    className={`py-1.5 px-1.5 rounded-md text-[11px] font-bold transition-colors ${
                      current.fontScale === opt.id
                        ? 'ct-surface-card text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {language === 'bn' ? opt.labelBn : opt.labelEn}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200/70 dark:border-slate-800 pb-safe shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 ct-btn-radius ct-accent-bg text-xs font-bold min-h-[42px]"
          >
            {t('সেভ ও সম্পন্ন', 'Done', language)}
          </button>
        </div>
      </div>
    </div>
  );
};
