import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

interface AuthState {
  token: string | null;
  email: string | null;
  isPro: boolean;
  isProPlus: boolean;
  isLocalMode: boolean;
  isTrialActive: boolean;
  trialDaysLeft: number;
  deviceId: string | null;
  isLoading: boolean;
  setAuth: (token: string, email: string, isPro: boolean, isProPlus: boolean) => void;
  setLocalMode: () => void;
  logout: () => void;
  initAuth: () => Promise<void>;
}

export async function getOrCreateDeviceId() {
  try {
    if (Platform.OS === 'android') {
      const androidId = Application.getAndroidId();
      if (androidId) return androidId;
    }

    if (Platform.OS === 'ios') {
      try {
        let deviceId = await SecureStore.getItemAsync('deviceId');
        if (!deviceId) {
          deviceId = Math.random().toString(36).substring(2) + Date.now().toString(36);
          await SecureStore.setItemAsync('deviceId', deviceId);
        }
        return deviceId;
      } catch (e) {
        console.warn('SecureStore error:', e);
      }
    }

    let deviceId = await AsyncStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = 'win_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      await AsyncStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  } catch (err) {
    console.warn('getOrCreateDeviceId fallback:', err);
    return 'device_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  email: null,
  isPro: false,
  isProPlus: false,
  isLocalMode: false,
  isTrialActive: false,
  trialDaysLeft: 0,
  deviceId: null,
  isLoading: true,

  setAuth: async (token, email, isPro, isProPlus) => {
    await AsyncStorage.setItem('authToken', token);
    await AsyncStorage.setItem('userEmail', email);
    await AsyncStorage.setItem('isPro', JSON.stringify(isPro));
    await AsyncStorage.setItem('isProPlus', JSON.stringify(isProPlus));
    await AsyncStorage.removeItem('isLocalMode');
    set({ token, email, isPro, isProPlus, isLocalMode: false, isTrialActive: false, trialDaysLeft: 0 });
  },

  setLocalMode: async () => {
    await AsyncStorage.setItem('isLocalMode', 'true');
    await AsyncStorage.setItem('authToken', 'local_mode_token');
    await AsyncStorage.setItem('userEmail', 'Локальный пользователь');
    await AsyncStorage.setItem('isPro', JSON.stringify(true));
    await AsyncStorage.setItem('isProPlus', JSON.stringify(true));
    set({ token: 'local_mode_token', email: 'Локальный пользователь', isPro: true, isProPlus: true, isLocalMode: true, isTrialActive: false, trialDaysLeft: 0 });
  },

  logout: async () => {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('userEmail');
    await AsyncStorage.removeItem('isPro');
    await AsyncStorage.removeItem('isProPlus');
    await AsyncStorage.removeItem('isLocalMode');
    set({ token: null, email: null, isPro: false, isProPlus: false, isLocalMode: false, isTrialActive: false, trialDaysLeft: 0 });
  },

  initAuth: async () => {
    try {
      const deviceId = await getOrCreateDeviceId();
      const token = await AsyncStorage.getItem('authToken');
      const email = await AsyncStorage.getItem('userEmail');
      let installDateStr = await AsyncStorage.getItem('installDate');
      if (!installDateStr) {
        installDateStr = Date.now().toString();
        await AsyncStorage.setItem('installDate', installDateStr);
      }
      const installDate = parseInt(installDateStr, 10);
      const elapsedMs = Date.now() - installDate;
      const trialDurationMs = 3 * 24 * 60 * 60 * 1000;
      const isTrialActive = elapsedMs < trialDurationMs;
      const trialDaysLeft = isTrialActive ? Math.max(1, Math.ceil((trialDurationMs - elapsedMs) / (24 * 60 * 60 * 1000))) : 0;

      const isProStr = await AsyncStorage.getItem('isPro');
      const isProFromStorage = isProStr ? JSON.parse(isProStr) : false;
      const isProPlusStr = await AsyncStorage.getItem('isProPlus');
      const isProPlusFromStorage = isProPlusStr ? JSON.parse(isProPlusStr) : false;
      
      const isPro = isProFromStorage || isTrialActive;
      const isProPlus = isProPlusFromStorage || isTrialActive;
      const isLocalModeStr = await AsyncStorage.getItem('isLocalMode');
      const isLocalMode = isLocalModeStr === 'true';

      set({ 
        deviceId, 
        token, 
        email, 
        isPro, 
        isProPlus,
        isLocalMode,
        isTrialActive: isTrialActive && !isProPlusFromStorage,
        trialDaysLeft,
        isLoading: false 
      });
    } catch (e) {
      console.error('Failed to init auth', e);
      set({ isLoading: false });
    }
  },
}));
