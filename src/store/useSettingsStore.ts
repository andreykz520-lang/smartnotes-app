import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  yandexToken: string | null;
  googleToken: string | null;
  geminiKey: string | null;
  gigaChatKey: string | null;
  openRouterKey: string | null;
  activeAiProvider: 'gemini' | 'gigachat' | 'openrouter';
  proxyUrl: string | null;
  pinCode: string | null;
  isAutoSyncEnabled: boolean;
  isCloudEnabled: boolean;
  setYandexToken: (token: string | null) => void;
  setGoogleToken: (token: string | null) => void;
  setGeminiKey: (key: string | null) => void;
  setGigaChatKey: (key: string | null) => void;
  setOpenRouterKey: (key: string | null) => void;
  setActiveAiProvider: (provider: 'gemini' | 'gigachat' | 'openrouter') => void;
  setProxyUrl: (url: string | null) => void;
  setPinCode: (pin: string | null) => void;
  setAutoSyncEnabled: (enabled: boolean) => void;
  setCloudEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      yandexToken: null,
      googleToken: null,
      geminiKey: null,
      gigaChatKey: null,
      openRouterKey: null,
      activeAiProvider: 'openrouter',
      proxyUrl: null,
      pinCode: null,
      isAutoSyncEnabled: false,
      isCloudEnabled: true,
      setYandexToken: (token) => set({ yandexToken: token }),
      setGoogleToken: (token) => set({ googleToken: token }),
      setGeminiKey: (key) => set({ geminiKey: key }),
      setGigaChatKey: (key) => set({ gigaChatKey: key }),
      setOpenRouterKey: (key) => set({ openRouterKey: key }),
      setActiveAiProvider: (provider) => set({ activeAiProvider: provider }),
      setProxyUrl: (url) => set({ proxyUrl: url }),
      setPinCode: (pin) => set({ pinCode: pin }),
      setAutoSyncEnabled: (enabled) => set({ isAutoSyncEnabled: enabled }),
      setCloudEnabled: (enabled) => set({ isCloudEnabled: enabled }),
    }),
    {
      name: 'smart-notes-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
