import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ru from './ru.json';
import en from './en.json';
import fr from './fr.json';
import es from './es.json';
import de from './de.json';
import ar from './ar.json';

const resources = {
  ru: { translation: ru },
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  de: { translation: de },
  ar: { translation: ar },
};

const LANGUAGE_KEY = 'user_language';

export const initI18n = async () => {
  try {
    let savedLanguage = null;
    try {
      savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    } catch (e) {
      console.warn('Failed to get saved language from storage:', e);
    }

    let defaultLang = 'ru';

    if (!savedLanguage) {
      try {
        const locales = Localization.getLocales ? Localization.getLocales() : [];
        const langCode = locales[0]?.languageCode || (Localization.locale ? Localization.locale.split('-')[0] : 'ru');
        if (langCode && Object.keys(resources).includes(langCode)) {
          defaultLang = langCode;
        }
      } catch (e) {
        console.warn('Failed to detect device locale:', e);
      }
    } else {
      defaultLang = savedLanguage;
    }

    // Handle RTL for Arabic
    try {
      const isRTL = defaultLang === 'ar';
      if (I18nManager && I18nManager.isRTL !== isRTL) {
        I18nManager.allowRTL(isRTL);
        I18nManager.forceRTL(isRTL);
      }
    } catch (e) {
      console.warn('Failed to configure RTL:', e);
    }

    await i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: defaultLang,
        fallbackLng: 'ru',
        interpolation: {
          escapeValue: false,
        },
      });
  } catch (err) {
    console.error('initI18n error, falling back to ru:', err);
    try {
      await i18n.use(initReactI18next).init({
        resources,
        lng: 'ru',
        fallbackLng: 'ru',
        interpolation: { escapeValue: false },
      });
    } catch (e) {
      console.error('Fatal i18n init error:', e);
    }
  }
};

export const changeLanguage = async (lang: string) => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch (e) {
    console.warn('Failed to save language to storage:', e);
  }
  await i18n.changeLanguage(lang);
  try {
    const isRTL = lang === 'ar';
    if (I18nManager && I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
    }
  } catch (e) {
    console.warn('Failed to change RTL:', e);
  }
};

export default i18n;
