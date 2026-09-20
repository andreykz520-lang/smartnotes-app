import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { API_URL } from '../config';

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
      if (androidId) {
        return androidId.startsWith('android_') ? androidId : `android_${androidId}`;
      }
      return 'android_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    if (Platform.OS === 'ios') {
      try {
        let deviceId = await SecureStore.getItemAsync('deviceId');
        if (!deviceId) {
          deviceId = 'ios_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
          await SecureStore.setItemAsync('deviceId', deviceId);
        }
        return deviceId.startsWith('ios_') ? deviceId : `ios_${deviceId}`;
      } catch (e) {
        console.warn('SecureStore error:', e);
      }
    }

    // Web browser vs Desktop Electron (Windows / Linux / macOS)
    let deviceId = await AsyncStorage.getItem('deviceId');
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isElectron = typeof navigator !== 'undefined' && /electron/i.test(ua);

    if (isElectron) {
      // Desktop app
      let prefix = 'win_';
      if (/linux/i.test(ua)) prefix = 'linux_';
      else if (/macintosh|mac os x/i.test(ua)) prefix = 'mac_';

      if (!deviceId || (!deviceId.startsWith(prefix) && !deviceId.startsWith('device_win_'))) {
        deviceId = prefix + Math.random().toString(36).substring(2) + Date.now().toString(36);
        await AsyncStorage.setItem('deviceId', deviceId);
      }
      return deviceId;
    }

    // Pure Web browser (Chrome, Safari, Firefox on desktop or mobile)
    let osSuffix = 'win';
    if (/android/i.test(ua)) osSuffix = 'android';
    else if (/iphone|ipad|ipod/i.test(ua)) osSuffix = 'ios';
    else if (/macintosh|mac os x/i.test(ua)) osSuffix = 'mac';
    else if (/linux/i.test(ua)) osSuffix = 'linux';
    else if (/windows|win32/i.test(ua)) osSuffix = 'win';

    const expectedPrefix = `web_${osSuffix}_`;
    if (!deviceId || !deviceId.startsWith(expectedPrefix)) {
      deviceId = expectedPrefix + Math.random().toString(36).substring(2) + Date.now().toString(36);
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
      const trialDurationMs = 30 * 24 * 60 * 60 * 1000;
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

      if (email && email.includes('@')) {
        fetch(`${API_URL}/api/auth/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        })
        .then(res => res.json())
        .then(data => {
          if (data?.success && data?.user) {
            const serverIsPro = !!data.user.isPro;
            const serverIsProPlus = !!data.user.isProPlus;
            AsyncStorage.setItem('isPro', JSON.stringify(serverIsPro));
            AsyncStorage.setItem('isProPlus', JSON.stringify(serverIsProPlus));
            set({ isPro: serverIsPro, isProPlus: serverIsProPlus });
          }
        })
        .catch(() => {});
      }
    } catch (e) {
      console.error('Failed to init auth', e);
      set({ isLoading: false });
    }
  },
}));
