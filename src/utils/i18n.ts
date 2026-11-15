import {LanguageCode} from '../types';

export function t(bn: string, en: string, lang: LanguageCode): string {
  return lang === 'en' ? en : bn;
}
