import React, { useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Switch, Platform, Linking, Modal } from 'react-native';
import { colors, spacing, borderRadius } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../store/useSettingsStore';
import { useNoteStore } from '../store/useNoteStore';
import { YandexDiskService } from '../services/YandexDiskService';
import { GeminiService } from '../services/GeminiService';
import { GoogleDriveService } from '../services/GoogleDriveService';
import { OpenRouterService } from '../services/OpenRouterService';
import { GigaChatService } from '../services/GigaChatService';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

let GoogleSignin: any = null;
let statusCodes: any = {};
if (Platform.OS !== 'web') {
  try {
    const gsignin = require('@react-native-google-signin/google-signin');
    GoogleSignin = gsignin.GoogleSignin;
    statusCodes = gsignin.statusCodes || {};
    if (GoogleSignin && GoogleSignin.configure) {
      GoogleSignin.configure({
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
    }
  } catch (e) {
    console.warn('GoogleSignin not available:', e);
  }
}

WebBrowser.maybeCompleteAuthSession();

// Замените на ваш Client ID из Яндекс OAuth (https://oauth.yandex.ru/)
const YANDEX_CLIENT_ID = '51e56994f0c641eb9c8689cfe9ab63b4';

const discovery = {
  authorizationEndpoint: 'https://oauth.yandex.ru/authorize',
  tokenEndpoint: 'https://oauth.yandex.ru/token',
};

const BUILTIN_PROXY_URL = 'https://smartnotes-backend-two.vercel.app/api/proxy/gemini';

import { useAuthStore } from '../store/useAuthStore';
import { useTranslation } from 'react-i18next';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { logout, isLocalMode, isPro, isProPlus, isTrialActive, trialDaysLeft, email } = useAuthStore();
  const { geminiKey, setGeminiKey, gigaChatKey, setGigaChatKey, openRouterKey, setOpenRouterKey, activeAiProvider, setActiveAiProvider, proxyUrl, setProxyUrl, yandexToken, setYandexToken, googleToken, setGoogleToken, pinCode, setPinCode, isAutoSyncEnabled, setAutoSyncEnabled, isCloudEnabled, setCloudEnabled } = useSettingsStore();
  const notes = useNoteStore(state => state.notes);
  const replaceNotes = useNoteStore(state => state.replaceNotes);
  const [localKey, setLocalKey] = React.useState(geminiKey || '');
  const [localGigaChatKey, setLocalGigaChatKey] = React.useState(gigaChatKey || '');
  const [localOpenRouterKey, setLocalOpenRouterKey] = React.useState(openRouterKey || '');
  
  const [proxyMode, setProxyMode] = React.useState<'builtin' | 'none' | 'custom'>('builtin');
  const [localProxy, setLocalProxy] = React.useState('');
  
  React.useEffect(() => {
    setLocalKey(geminiKey || '');
    setLocalGigaChatKey(gigaChatKey || '');
    setLocalOpenRouterKey(openRouterKey || '');
    if (proxyUrl === 'NONE') {
      setProxyMode('none');
      setLocalProxy('');
    } else if (!proxyUrl || proxyUrl === BUILTIN_PROXY_URL || proxyUrl === 'BUILTIN') {
      setProxyMode('builtin');
      setLocalProxy('');
    } else {
      setProxyMode('custom');
      setLocalProxy(proxyUrl);
    }
  }, [proxyUrl, geminiKey, gigaChatKey, openRouterKey]);
  
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);

  // Состояния для сброса ПИН-кода
  const [isResettingPin, setIsResettingPin] = React.useState(false);
  const [resetCode, setResetCode] = React.useState('');
  const [isSendingCode, setIsSendingCode] = React.useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = React.useState(false);
  const [manualYandexToken, setManualYandexToken] = React.useState('');

  // Модальное окно ввода кода активации / восстановления
  const [isActivationModalVisible, setIsActivationModalVisible] = React.useState(false);
  const [activationEmail, setActivationEmail] = React.useState(email || '');
  const [activationCode, setActivationCode] = React.useState('');
  const [isActivating, setIsActivating] = React.useState(false);
  const [isSendingRecoveryCode, setIsSendingRecoveryCode] = React.useState(false);
  const [recoveryCodeSent, setRecoveryCodeSent] = React.useState(false);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: YANDEX_CLIENT_ID,
      responseType: AuthSession.ResponseType.Token,
      redirectUri: Platform.OS === 'web' 
        ? 'https://oauth.yandex.ru/verification_code' 
        : AuthSession.makeRedirectUri({ scheme: 'smartnotes' }),
      scopes: ['cloud_api:disk.app_folder'],
    },
    discovery
  );

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSendRecoveryCode = async () => {
    const targetEmail = activationEmail.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      showAlert('Ошибка', 'Введите ваш корректный Email для получения кода');
      return;
    }

    try {
      setIsSendingRecoveryCode(true);
      const res = await fetch('https://smartnotes-backend-two.vercel.app/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRecoveryCodeSent(true);
        showAlert('Код отправлен! ✉️', `Проверочный 6-значный код отправлен на ${targetEmail}. Введите его в поле «Код» для входа и восстановления подписки.`);
      } else {
        showAlert('Ошибка', data.error || 'Не удалось отправить код на почту');
      }
    } catch (e: any) {
      showAlert('Ошибка сети', 'Не удалось связаться с сервером. Проверьте интернет-соединение.');
    } finally {
      setIsSendingRecoveryCode(false);
    }
  };

  const handleActivateCode = async () => {
    const targetEmail = activationEmail.trim().toLowerCase();
    const targetCode = activationCode.trim().toUpperCase();

    if (!targetEmail || !targetCode) {
      showAlert('Ошибка', 'Введите ваш Email и код (из письма или покупки)');
      return;
    }

    try {
      setIsActivating(true);
      const deviceId = useAuthStore.getState().deviceId;
      const res = await fetch('https://smartnotes-backend-two.vercel.app/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, code: targetCode, deviceId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        useAuthStore.getState().setAuth(data.token, data.user.email, data.user.isPro, data.user.isProPlus);
        setIsActivationModalVisible(false);
        setActivationCode('');
        showAlert('Успешно! 🎉', data.user.isProPlus 
          ? 'Тариф PRO+ успешно восстановлен/активирован! Все функции и ИИ доступны.' 
          : data.user.isPro
            ? 'Тариф PRO успешно восстановлен/активирован!'
            : `Вход выполнен успешно (${data.user.email})!`);
      } else {
        showAlert('Ошибка', data.error || 'Неверный или устаревший код');
      }
    } catch (e) {
      showAlert('Ошибка сети', 'Не удалось связаться с сервером. Проверьте интернет-соединение.');
    } finally {
      setIsActivating(false);
    }
  };

  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = (response.params as any);
      if (access_token) {
        setYandexToken(access_token);
        showAlert('Успешно', 'Авторизация в Яндекс Диск прошла успешно!');
      }
    }
  }, [response]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location && window.location.hash) {
      try {
        const hash = window.location.hash.replace('#', '?');
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        if (accessToken) {
          setYandexToken(accessToken);
          window.location.hash = '';
          showAlert('Успешно', 'Яндекс Диск успешно подключен!');
        }
      } catch (e) {
        console.warn('Hash parsing error:', e);
      }
    }
  }, []);

  const handleSaveKey = (silent = false) => {
    let finalProxy = '';
    if (proxyMode === 'builtin') {
      finalProxy = BUILTIN_PROXY_URL;
    } else if (proxyMode === 'none') {
      finalProxy = 'NONE';
    } else {
      finalProxy = localProxy.trim();
      if (finalProxy && !finalProxy.startsWith('http')) {
        finalProxy = 'https://' + finalProxy;
        setLocalProxy(finalProxy);
      }
    }
    
    setGeminiKey(localKey.trim());
    setGigaChatKey(localGigaChatKey.trim());
    setOpenRouterKey(localOpenRouterKey.trim());
    setProxyUrl(finalProxy);
    if (!silent) {
      Alert.alert('Успешно', 'Настройки ИИ сохранены!');
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    setIsTesting(true);
    
    let activeProxy: string | null = null;
    if (proxyMode === 'builtin') activeProxy = BUILTIN_PROXY_URL;
    else if (proxyMode === 'custom') activeProxy = localProxy.trim() || null;
    else if (proxyMode === 'none') activeProxy = 'NONE';
    
    try {
      let response: string | null = null;

      if (activeAiProvider === 'gemini') {
        if (!localKey.trim() && !isProPlus) {
          setTestResult('Ошибка: Введите ваш API Key Gemini (или оформите PRO+)');
          setIsTesting(false);
          return;
        }
        response = await GeminiService.sendMessage(localKey.trim(), activeProxy, [{ role: 'user', content: 'Ответь строго одним словом: РАБОТАЕТ' }]);
      } else if (activeAiProvider === 'gigachat') {
        if (!localGigaChatKey.trim()) {
          setTestResult('Ошибка: Сначала введите Auth Key GigaChat!');
          setIsTesting(false);
          return;
        }
        response = await GigaChatService.sendMessage(localGigaChatKey.trim(), [{ role: 'user', content: 'Ответь строго одним словом: РАБОТАЕТ' }]);
      } else if (activeAiProvider === 'openrouter') {
        response = await OpenRouterService.sendMessage(localOpenRouterKey.trim(), activeProxy, [{ role: 'user', content: 'Ответь строго одним словом: РАБОТАЕТ' }]);
      }

      if (response) {
        setTestResult('✅ Успех! Подключение работает. Нейросеть ответила: ' + response);
        handleSaveKey(true); // Автоматически сохраняем проверенные настройки
      } else {
        setTestResult('❌ Ошибка: Сервер не вернул ответ. Проверьте ключ и интернет.');
      }
    } catch (e: any) {
      setTestResult('❌ Ошибка подключения: ' + (e.message || 'Неизвестная ошибка. Проверьте настройки прокси.'));
    } finally {
      setIsTesting(false);
    }
  };

  const handleLoginYandex = () => {
    if (!isPro) {
      showAlert('Требуется PRO', 'Синхронизация с Яндекс Диском доступна только в PRO версии.');
      return;
    }
    promptAsync();
  };

  const handleLogoutYandex = () => {
    setYandexToken(null);
    showAlert('Готово', 'Вы вышли из Яндекс Диска');
  };

  const handleBackup = async () => {
    if (!yandexToken) {
      showAlert('Внимание', 'Сначала подключите Яндекс Диск');
      return;
    }
    setIsSyncing(true);
    const jsonData = JSON.stringify(notes);
    const success = await YandexDiskService.uploadBackup(yandexToken, jsonData);
    setIsSyncing(false);
    if (success) {
      showAlert('Готово', `Резервная копия успешно сохранена на Яндекс Диск! (Заметок: ${notes.length})`);
    } else {
      showAlert('Ошибка', 'Не удалось загрузить данные на Яндекс Диск. Проверьте подключение.');
    }
  };

  const handleRestore = async () => {
    if (!yandexToken) {
      showAlert('Внимание', 'Сначала подключите Яндекс Диск');
      return;
    }
    setIsSyncing(true);
    const result = await YandexDiskService.downloadBackup(yandexToken);
    setIsSyncing(false);
    
    if (result.data) {
      try {
        const parsedNotes = JSON.parse(result.data);
        if (Array.isArray(parsedNotes)) {
          replaceNotes(parsedNotes);
          showAlert('Готово', `Заметки успешно синхронизированы! Загружено заметок: ${parsedNotes.length}`);
        } else {
          showAlert('Ошибка', 'Файл резервной копии имеет неверный формат.');
        }
      } catch (e: any) {
        showAlert('Ошибка', 'Некорректный формат данных в облаке: ' + (e?.message || ''));
      }
    } else {
      const userHint = result.user ? ` (пользователь: ${result.user})` : '';
      const filesHint = (result.foundFiles && result.foundFiles.length > 0)
        ? `\nНайденные файлы: ${result.foundFiles.join(', ')}`
        : '\nВ папке приложения пока нет сохраненных копий.';
      const debugHint = result.debug ? `\n\n[Debug: ${result.debug}]` : '';
      showAlert(
        'Синхронизация',
        `На Яндекс Диске${userHint} не удалось прочитать файл заметок.${filesHint}${debugHint}\n\n1. Откройте SmartNotes на телефоне.\n2. В Настройках нажмите «Сохранить на диск».\n3. Затем нажмите «Восстановить» здесь.`
      );
    }
  };

  const handleLoginGoogle = async () => {
    if (!isPro) {
      Alert.alert('Требуется PRO', 'Синхронизация с Google Диском доступна только в PRO версии.');
      return;
    }
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      if (tokens.accessToken) {
        setGoogleToken(tokens.accessToken);
        Alert.alert('Успешно', 'Авторизация в Google Drive прошла успешно!');
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // cancelled
      } else {
        Alert.alert('Ошибка авторизации', error.message || 'Не удалось войти в Google');
      }
    }
  };

  const handleLogoutGoogle = async () => {
    try {
      await GoogleSignin.signOut();
    } catch (error) {}
    setGoogleToken(null);
  };

  const handleBackupGoogle = async () => {
    if (!googleToken) return;
    setIsSyncing(true);
    const jsonData = JSON.stringify(notes);
    const success = await GoogleDriveService.uploadBackup(googleToken, jsonData);
    setIsSyncing(false);
    if (success) {
      Alert.alert('Готово', 'Резервная копия успешно сохранена на Google Диск!');
    } else {
      Alert.alert('Ошибка', 'Не удалось загрузить данные (возможно, истек токен, попробуйте перезайдите).');
    }
  };

  const handleRestoreGoogle = async () => {
    if (!googleToken) return;
    setIsSyncing(true);
    const jsonData = await GoogleDriveService.restoreBackup(googleToken);
    setIsSyncing(false);
    
    if (jsonData) {
      try {
        let parsed = jsonData;
        if (typeof jsonData === 'string') parsed = JSON.parse(jsonData);
        if (Array.isArray(parsed)) {
          replaceNotes(parsed);
          Alert.alert('Готово', 'Заметки успешно восстановлены из Google!');
        }
      } catch (e) {
        Alert.alert('Ошибка', 'Некорректный формат данных в облаке.');
      }
    } else {
      Alert.alert('Ошибка', 'Резервная копия не найдена на сервере.');
    }
  };

  const handleRequestPinReset = async () => {
    if (isLocalMode) {
      Alert.alert('Сброс ПИН-кода', 'Внимание! Так как вы работаете локально, сброс ПИН-кода навсегда удалит все ваши секретные заметки для защиты ваших данных. Продолжить?', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Сбросить и удалить', style: 'destructive', onPress: () => {
          useNoteStore.getState().deleteSecretNotes();
          setPinCode(null);
          Alert.alert('Готово', 'ПИН-код сброшен, секретные заметки удалены.');
        }}
      ]);
      return;
    }

    try {
      setIsSendingCode(true);
      const email = useAuthStore.getState().email;
      const res = await fetch('https://smartnotes-backend-two.vercel.app/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        setIsResettingPin(true);
        Alert.alert('Код отправлен', `Код для сброса ПИН-кода отправлен на ${email}`);
      } else {
        Alert.alert('Ошибка', 'Не удалось отправить код');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Проверьте подключение к сети');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyPinReset = async () => {
    if (!resetCode || resetCode.length < 6) {
      Alert.alert('Ошибка', 'Введите 6-значный код или PRO-код');
      return;
    }
    try {
      setIsVerifyingCode(true);
      const email = useAuthStore.getState().email;
      const deviceId = useAuthStore.getState().deviceId;
      
      const res = await fetch('https://smartnotes-backend-two.vercel.app/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: resetCode.trim(), deviceId })
      });
      
      if (res.ok) {
        setPinCode(null);
        setIsResettingPin(false);
        setResetCode('');
        Alert.alert('Готово', 'ПИН-код успешно сброшен! Ваши заметки в безопасности.');
      } else {
        const data = await res.json();
        Alert.alert('Ошибка', data.error || 'Неверный код');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Проверьте подключение к сети');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Plan Status Card */}
      <View style={[
        styles.planCard,
        isProPlus ? styles.planCardProPlus : isPro ? styles.planCardPro : styles.planCardFree
      ]}>
        <View style={styles.planCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={[
              styles.planIconCircle, 
              isProPlus ? styles.planIconCircleProPlus : isPro ? styles.planIconCirclePro : styles.planIconCircleFree
            ]}>
              <Ionicons 
                name={isProPlus ? "sparkles" : isPro ? "star" : "person-outline"} 
                size={22} 
                color={isProPlus ? "#c084fc" : isPro ? "#60a5fa" : "#f59e0b"} 
              />
            </View>
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={[
                styles.planCardTitle,
                isProPlus ? styles.planCardTitleProPlus : isPro ? styles.planCardTitlePro : styles.planCardTitleFree
              ]}>
                {isTrialActive
                  ? t('settings.plan_pro_plus_trial')
                  : isProPlus
                    ? t('settings.plan_pro_plus')
                    : isPro
                      ? t('settings.plan_pro')
                      : t('settings.plan_free')}
              </Text>
              <Text style={styles.planCardSubtitle} numberOfLines={1}>
                {email ? email : (isLocalMode ? t('settings.plan_local_acc') : t('settings.plan_free_mode'))}
              </Text>
            </View>
          </View>
          <View style={[
            styles.planBadgeTag,
            isProPlus ? styles.planBadgeTagProPlus : isPro ? styles.planBadgeTagPro : styles.planBadgeTagFree
          ]}>
            <Text style={[
              styles.planBadgeTagText,
              isProPlus ? styles.planBadgeTagTextProPlus : isPro ? styles.planBadgeTagTextPro : styles.planBadgeTagTextFree
            ]}>
              {isTrialActive ? `${trialDaysLeft} d.` : isProPlus ? 'PRO+' : isPro ? 'PRO' : 'FREE'}
            </Text>
          </View>
        </View>

        <View style={styles.planDivider} />

        <Text style={styles.planDetailsText}>
          {isTrialActive
            ? t('settings.plan_desc_trial')
            : isProPlus
              ? t('settings.plan_desc_pro_plus')
              : isPro
                ? t('settings.plan_desc_pro')
                : t('settings.plan_desc_free')}
        </Text>

        <View style={{ flexDirection: 'column', gap: 8, marginTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!isProPlus && (
              <TouchableOpacity 
                style={[styles.planUpgradeButton, { flex: 1 }]}
                onPress={() => Linking.openURL(`https://smartnotes-ai.ru/#checkout?plan=${!isPro ? 'pro' : 'pro_plus_6m'}${email ? `&email=${encodeURIComponent(email)}` : ''}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="flash" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.planUpgradeButtonText}>
                  {!isPro ? t('settings.plan_upgrade_to_pro') : t('settings.plan_upgrade_to_pro_plus')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.planActivateCodeButton, !isProPlus ? { flex: 1 } : { width: '100%' }]}
              onPress={() => {
                setActivationEmail(email || '');
                setRecoveryCodeSent(false);
                setIsActivationModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="key-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.planActivateCodeButtonText}>
                Ввести код
              </Text>
            </TouchableOpacity>
          </View>

          {(!isPro || !isProPlus) && (
            <TouchableOpacity 
              style={styles.planRestoreButton}
              onPress={() => {
                setActivationEmail(email || '');
                setRecoveryCodeSent(false);
                setIsActivationModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="mail-unread-outline" size={16} color="#60a5fa" style={{ marginRight: 6 }} />
              <Text style={styles.planRestoreButtonText}>
                Восстановить подписку по Email
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="cloud-offline" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>{t('settings.cloud_sync')}</Text>
        </View>
        <Text style={styles.description}>
          {t('settings.cloud_sync_desc')}
        </Text>
        
        {isLocalMode ? (
          <View style={{ backgroundColor: colors.surfaceHighlight, padding: spacing.md, borderRadius: borderRadius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.primary }}>
             <Text style={{ color: colors.primary, fontWeight: 'bold', marginBottom: 4 }}>{t('settings.local_mode')}</Text>
             <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.md }}>{t('settings.local_mode_desc')}</Text>
             <TouchableOpacity style={{backgroundColor: colors.primary, padding: spacing.sm, borderRadius: borderRadius.sm, alignItems: 'center'}} onPress={() => logout()}>
               <Text style={{color: 'white', fontWeight: 'bold'}}>{t('settings.login')} / {t('settings.register')}</Text>
             </TouchableOpacity>
          </View>
        ) : !isPro ? (
          <View style={{ backgroundColor: colors.surfaceHighlight, padding: spacing.md, borderRadius: borderRadius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.primary }}>
             <Text style={{ color: colors.primary, fontWeight: 'bold', marginBottom: 4 }}>{t('settings.need_pro')}</Text>
             <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.md }}>{t('settings.need_pro_sync_desc')}</Text>
             <TouchableOpacity style={{backgroundColor: colors.primary, padding: spacing.sm, borderRadius: borderRadius.sm, alignItems: 'center'}} onPress={() => Linking.openURL(`https://smartnotes-ai.ru/#checkout?plan=pro${email ? `&email=${encodeURIComponent(email)}` : ''}`)}>
               <Text style={{color: 'white', fontWeight: 'bold'}}>{t('settings.activate_pro')}</Text>
             </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.syncOption}>
            <Text style={styles.syncOptionText}>{t('settings.enable_sync')}</Text>
            <Switch 
              value={!!isCloudEnabled} 
              onValueChange={setCloudEnabled} 
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        )}

        {!isLocalMode && (
          <TouchableOpacity style={{padding: spacing.sm, alignItems: 'center', marginTop: spacing.md}} onPress={() => logout()}>
            <Text style={{color: colors.danger, fontWeight: 'bold'}}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isLocalMode && isPro && isCloudEnabled && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cloud-outline" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>{t('settings.yandex_disk')}</Text>
            </View>
        <Text style={styles.description}>
          {t('settings.yandex_disk_desc')}
        </Text>
        
        {!yandexToken ? (
          <>
            <TouchableOpacity style={styles.yandexButton} onPress={handleLoginYandex}>
              <Text style={styles.yandexButtonText}>{t('settings.login_yandex')}</Text>
            </TouchableOpacity>
            {Platform.OS === 'web' && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs }}>
                  Или вставьте OAuth-токен Яндекс Диска вручную:
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Вставьте токен Яндекс Диска (y0_...)"
                  placeholderTextColor={colors.textMuted}
                  value={manualYandexToken}
                  onChangeText={setManualYandexToken}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.syncButton, { marginTop: spacing.xs }]}
                  onPress={() => {
                    if (manualYandexToken.trim()) {
                      setYandexToken(manualYandexToken.trim());
                      showAlert('Успешно', 'Яндекс Диск успешно подключен!');
                    }
                  }}
                >
                  <Text style={styles.syncButtonText}>Сохранить токен</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={styles.syncActions}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, backgroundColor: '#e6f7ed', padding: spacing.sm, borderRadius: borderRadius.sm }}>
              <Ionicons name="checkmark-circle" size={20} color="#00aa44" style={{ marginRight: 8 }} />
              <Text style={{ color: '#00aa44', fontWeight: 'bold' }}>Яндекс Диск подключен</Text>
            </View>
            
            <TouchableOpacity style={[styles.syncButton, {backgroundColor: colors.accent, paddingVertical: 14}]} onPress={handleRestore} disabled={isSyncing}>
              <Ionicons name="cloud-download-outline" size={22} color="#fff" />
              <Text style={[styles.syncButtonText, { fontSize: 15 }]}>📥 Восстановить заметки с Яндекс Диска</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.syncButton, { paddingVertical: 14, marginTop: spacing.sm }]} onPress={handleBackup} disabled={isSyncing}>
              <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
              <Text style={[styles.syncButtonText, { fontSize: 15 }]}>📤 Сохранить текущие заметки в облако</Text>
            </TouchableOpacity>
            
            <View style={styles.syncOption}>
              <Text style={styles.syncOptionText}>{t('settings.auto_sync_on_change')}</Text>
              <Switch 
                value={!!isAutoSyncEnabled} 
                onValueChange={setAutoSyncEnabled} 
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogoutYandex}>
              <Text style={styles.logoutButtonText}>Отключить Яндекс Диск</Text>
            </TouchableOpacity>

            {isSyncing && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.textMuted }}>Синхронизация данных...</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {!isLocalMode && (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="logo-google" size={24} color="#DB4437" />
          <Text style={styles.sectionTitle}>{t('settings.google_drive')}</Text>
        </View>
        <Text style={styles.description}>
          {t('settings.google_drive_desc')}
        </Text>
        
        {!googleToken ? (
          <>
            <TouchableOpacity style={styles.googleButton} onPress={handleLoginGoogle}>
              <Text style={styles.googleButtonText}>{t('settings.login_google')}</Text>
            </TouchableOpacity>
            {Platform.OS === 'web' && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs }}>
                  Или вставьте OAuth-токен Google Диска вручную:
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Вставьте токен Google (ya29...)"
                  placeholderTextColor={colors.textMuted}
                  onChangeText={setGoogleToken}
                  autoCapitalize="none"
                />
              </View>
            )}
          </>
        ) : (
          <View style={styles.syncActions}>
            <Text style={styles.loggedInText}>{t('settings.logged_in_google')}</Text>
            
            <TouchableOpacity style={styles.syncButton} onPress={handleBackupGoogle} disabled={isSyncing}>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.syncButtonText}>{t('settings.save_to_cloud')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.syncButton, {backgroundColor: colors.accent}]} onPress={handleRestoreGoogle} disabled={isSyncing}>
              <Ionicons name="cloud-download-outline" size={20} color="#fff" />
              <Text style={styles.syncButtonText}>{t('settings.restore_from_cloud')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogoutGoogle}>
              <Text style={styles.logoutButtonText}>{t('settings.logout_short')}</Text>
            </TouchableOpacity>

            {isSyncing && <ActivityIndicator size="small" color={colors.primary} style={{marginTop: 10}} />}
          </View>
        )}
      </View>
      )}
      </>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        </View>
        <Text style={styles.description}>
          {pinCode ? t('settings.pin_set') : t('settings.pin_not_set')}
        </Text>
        
        {pinCode && !isResettingPin && (
          <TouchableOpacity 
            style={styles.resetPinButton} 
            onPress={handleRequestPinReset}
            disabled={isSendingCode}
          >
            {isSendingCode ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text style={styles.resetPinButtonText}>{t('settings.reset_pin')}</Text>
            )}
          </TouchableOpacity>
        )}

        {isResettingPin && (
          <View style={{ marginTop: spacing.md, backgroundColor: colors.surfaceHighlight, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.primary }}>
            <Text style={{ color: colors.text, marginBottom: spacing.sm, fontWeight: 'bold' }}>
              {t('settings.enter_code_from_email')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t('settings.code_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={resetCode}
              onChangeText={setResetCode}
              keyboardType="default"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity 
                style={[styles.saveButton, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} 
                onPress={() => {
                  setIsResettingPin(false);
                  setResetCode('');
                }}
              >
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveButton, { flex: 1 }]} 
                onPress={handleVerifyPinReset}
                disabled={isVerifyingCode}
              >
                {isVerifyingCode ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>{t('settings.confirm')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="sparkles" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>{t('settings.ai_settings')}</Text>
        </View>
        {!isPro ? (
          <View style={{ backgroundColor: colors.surfaceHighlight, padding: spacing.md, borderRadius: borderRadius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.primary }}>
             <Text style={{ color: colors.primary, fontWeight: 'bold', marginBottom: 4 }}>{t('settings.need_pro')}</Text>
             <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.md }}>{t('settings.need_pro_ai_desc')}</Text>
             <TouchableOpacity style={{backgroundColor: colors.primary, padding: spacing.sm, borderRadius: borderRadius.sm, alignItems: 'center'}} onPress={() => Linking.openURL(`https://smartnotes-ai.ru/#checkout?plan=pro_plus_6m${email ? `&email=${encodeURIComponent(email)}` : ''}`)}>
               <Text style={{color: 'white', fontWeight: 'bold'}}>{t('settings.activate_pro')}</Text>
             </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.proxyModeContainer}>
          <TouchableOpacity style={[styles.proxyModeButton, activeAiProvider === 'gemini' && styles.proxyModeButtonActive]} onPress={() => setActiveAiProvider('gemini')}>
            <Text style={[styles.proxyModeText, activeAiProvider === 'gemini' && styles.proxyModeTextActive]}>Google Gemini</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.proxyModeButton, activeAiProvider === 'gigachat' && styles.proxyModeButtonActive]} onPress={() => setActiveAiProvider('gigachat')}>
            <Text style={[styles.proxyModeText, activeAiProvider === 'gigachat' && styles.proxyModeTextActive]}>Сбер GigaChat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.proxyModeButton, activeAiProvider === 'openrouter' && styles.proxyModeButtonActive]} onPress={() => setActiveAiProvider('openrouter')}>
            <Text style={[styles.proxyModeText, activeAiProvider === 'openrouter' && styles.proxyModeTextActive]}>OpenRouter</Text>
          </TouchableOpacity>
        </View>

        {activeAiProvider === 'gemini' ? (
          <>
            <Text style={styles.description}>
              {t('settings.gemini_desc')}
            </Text>
            
            <Text style={[styles.description, { fontWeight: 'bold', marginTop: spacing.sm }]}>{t('settings.gemini_key_label')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={isProPlus ? t('settings.gemini_placeholder_pro_plus') : t('settings.gemini_placeholder_custom')}
                placeholderTextColor={colors.textMuted}
                value={localKey}
                onChangeText={setLocalKey}
                secureTextEntry
              />
            </View>
            <Text style={[styles.helpText, { marginTop: 4, marginBottom: spacing.md, fontSize: 12 }]}>
              {isProPlus 
                ? t('settings.gemini_help_pro_plus') 
                : t('settings.gemini_help_free')}
            </Text>

            <Text style={[styles.description, { fontWeight: 'bold', marginTop: spacing.sm }]}>{t('settings.proxy_mode')}</Text>
            <View style={styles.proxyModeContainer}>
              <TouchableOpacity style={[styles.proxyModeButton, proxyMode === 'builtin' && styles.proxyModeButtonActive]} onPress={() => setProxyMode('builtin')}>
                <Text style={[styles.proxyModeText, proxyMode === 'builtin' && styles.proxyModeTextActive]}>{t('settings.proxy_builtin')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.proxyModeButton, proxyMode === 'none' && styles.proxyModeButtonActive]} onPress={() => setProxyMode('none')}>
                <Text style={[styles.proxyModeText, proxyMode === 'none' && styles.proxyModeTextActive]}>{t('settings.proxy_disabled')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.proxyModeButton, proxyMode === 'custom' && styles.proxyModeButtonActive]} onPress={() => setProxyMode('custom')}>
                <Text style={[styles.proxyModeText, proxyMode === 'custom' && styles.proxyModeTextActive]}>{t('settings.proxy_custom')}</Text>
              </TouchableOpacity>
            </View>

            {proxyMode === 'custom' && (
              <>
                <Text style={[styles.description, { fontSize: 12, marginBottom: spacing.xs }]}>
                  {t('settings.custom_proxy_desc')}
                </Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="https://..."
                    placeholderTextColor={colors.textMuted}
                    value={localProxy}
                    onChangeText={setLocalProxy}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
              </>
            )}
          </>
        ) : activeAiProvider === 'gigachat' ? (
          <>
            <Text style={styles.description}>
              {t('settings.gigachat_desc')}
            </Text>
            
            <Text style={[styles.description, { fontWeight: 'bold', marginTop: spacing.sm }]}>{t('settings.gigachat_key_label')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={t('settings.gigachat_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={localGigaChatKey}
                onChangeText={setLocalGigaChatKey}
                secureTextEntry
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.description}>
              {t('settings.openrouter_desc')}
            </Text>
            
            <Text style={[styles.description, { fontWeight: 'bold', marginTop: spacing.sm }]}>{t('settings.openrouter_key_label')}</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={t('settings.openrouter_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={localOpenRouterKey}
                onChangeText={setLocalOpenRouterKey}
                secureTextEntry
              />
            </View>
          </>
        )}

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveKey}>
          <Text style={styles.saveButtonText}>{t('settings.save_ai_settings')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.saveButton, { backgroundColor: colors.surfaceHighlight, marginTop: spacing.sm }]} 
          onPress={handleTestConnection}
          disabled={isTesting}
        >
          {isTesting ? (
             <ActivityIndicator size="small" color={colors.primary} />
          ) : (
             <Text style={[styles.saveButtonText, { color: colors.primary }]}>{t('settings.test_connection')}</Text>
          )}
        </TouchableOpacity>

        {testResult && (
          <Text style={[styles.description, { marginTop: spacing.md, color: testResult.includes('Успех') || testResult.includes('Success') ? 'green' : 'red', fontWeight: 'bold' }]}>
            {testResult}
          </Text>
        )}
          </>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="desktop-outline" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>SmartNotes для Windows и Сайт</Text>
        </View>
        <Text style={styles.description}>
          Используйте SmartNotes AI на компьютере! Все заметки и списки задач автоматически синхронизируются между телефоном и Windows ПК.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.sm }}>
          <TouchableOpacity 
            style={[styles.saveButton, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHighlight, borderWidth: 1, borderColor: colors.border }]} 
            onPress={() => Linking.openURL('https://smartnotes-ai.ru')}
          >
            <Ionicons name="globe-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.saveButtonText, { color: colors.text, fontSize: 13 }]}>Наш сайт</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.saveButton, { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }]} 
            onPress={() => Linking.openURL('https://smartnotes-ai.ru/SmartNotes-Setup.exe')}
          >
            <Ionicons name="logo-windows" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={[styles.saveButtonText, { fontSize: 13 }]}>Скачать для ПК</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="globe-outline" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        </View>
        <Text style={styles.description}>{t('settings.choose_language')}</Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {[
            { code: 'ru', label: 'Русский' },
            { code: 'en', label: 'English' },
            { code: 'fr', label: 'Français' },
            { code: 'es', label: 'Español' },
            { code: 'de', label: 'Deutsch' },
            { code: 'ar', label: 'العربية' }
          ].map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: colors.surfaceHighlight,
                borderWidth: 1,
                borderColor: colors.border
              }}
              onPress={() => {
                import('../i18n/i18n').then(({ changeLanguage }) => {
                  changeLanguage(lang.code);
                });
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '500' }}>{lang.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Модальное окно активации / восстановления подписки */}
      <Modal
        visible={isActivationModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsActivationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="key" size={24} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={styles.modalTitle}>Активация и Восстановление</Text>
              </View>
              <TouchableOpacity onPress={() => setIsActivationModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Введите Email и код активации из письма. Если вы забыли код или перенесли приложение на новый телефон — нажмите «Отправить код на Email»:
            </Text>

            <Text style={styles.inputLabel}>Ваш Email:</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                value={activationEmail}
                onChangeText={(val) => {
                  setActivationEmail(val);
                  setRecoveryCodeSent(false);
                }}
                placeholder="example@mail.ru"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.modalSendCodeButton}
                onPress={handleSendRecoveryCode}
                disabled={isSendingRecoveryCode}
                activeOpacity={0.85}
              >
                {isSendingRecoveryCode ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSendCodeButtonText}>Отправить код</Text>
                )}
              </TouchableOpacity>
            </View>

            {recoveryCodeSent && (
              <View style={styles.modalRecoveryNotice}>
                <Ionicons name="checkmark-circle" size={16} color="#4ade80" style={{ marginRight: 6 }} />
                <Text style={styles.modalRecoveryNoticeText}>
                  6-значный проверочный код выслан на вашу почту!
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Код активации (или 6-значный код из письма):</Text>
            <TextInput
              style={styles.modalInput}
              value={activationCode}
              onChangeText={setActivationCode}
              placeholder="XXXX-XXXX-XXXX-XXXX или 123456"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
            />

            <TouchableOpacity 
              style={[styles.modalSubmitButton, isActivating && { opacity: 0.7 }]}
              onPress={handleActivateCode}
              disabled={isActivating}
              activeOpacity={0.85}
            >
              {isActivating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitButtonText}>Восстановить / Активировать</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  section: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginLeft: spacing.sm },
  description: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.md, lineHeight: 20 },
  yandexButton: { backgroundColor: '#FFCC00', padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  yandexButtonText: { color: '#000', fontSize: 16, fontWeight: '600' },
  googleButton: { backgroundColor: '#DB4437', padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  googleButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  syncActions: { marginTop: spacing.sm },
  loggedInText: { color: colors.primary, fontWeight: 'bold', marginBottom: spacing.sm, fontSize: 16 },
  syncButton: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: borderRadius.md, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm },
  syncButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: spacing.sm },
  logoutButton: { padding: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  logoutButtonText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  inputContainer: { marginBottom: spacing.md },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, fontSize: 16 },
  saveButton: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  syncOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceHighlight, padding: spacing.md, borderRadius: borderRadius.md, marginTop: spacing.sm },
  syncOptionText: { color: colors.text, fontSize: 14, flex: 1, marginRight: spacing.sm },
  resetPinButton: { backgroundColor: colors.surfaceHighlight, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', marginTop: spacing.sm },
  resetPinButtonText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  proxyModeContainer: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: borderRadius.md, padding: 2, marginBottom: spacing.md },
  proxyModeButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: borderRadius.sm },
  proxyModeButtonActive: { backgroundColor: colors.surface },
  proxyModeText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  proxyModeTextActive: { color: colors.primary, fontWeight: 'bold' },
  planCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  planCardProPlus: {
    borderColor: '#a855f750',
    backgroundColor: '#8b5cf610',
  },
  planCardPro: {
    borderColor: '#3b82f650',
    backgroundColor: '#3b82f610',
  },
  planCardFree: {
    borderColor: '#f59e0b40',
    backgroundColor: '#f59e0b10',
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planIconCircleProPlus: {
    backgroundColor: '#8b5cf625',
  },
  planIconCirclePro: {
    backgroundColor: '#3b82f625',
  },
  planIconCircleFree: {
    backgroundColor: '#f59e0b20',
  },
  planCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  planCardTitleProPlus: {
    color: '#c084fc',
  },
  planCardTitlePro: {
    color: '#60a5fa',
  },
  planCardTitleFree: {
    color: '#fbbf24',
  },
  planCardSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  planBadgeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  planBadgeTagProPlus: {
    backgroundColor: '#8b5cf620',
    borderColor: '#a855f7',
  },
  planBadgeTagPro: {
    backgroundColor: '#3b82f620',
    borderColor: '#3b82f6',
  },
  planBadgeTagFree: {
    backgroundColor: '#64748b20',
    borderColor: '#64748b',
  },
  planBadgeTagText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planBadgeTagTextProPlus: {
    color: '#c084fc',
  },
  planBadgeTagTextPro: {
    color: '#60a5fa',
  },
  planBadgeTagTextFree: {
    color: '#94a3b8',
  },
  planDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  planDetailsText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  planUpgradeButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planUpgradeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  planActivateCodeButton: {
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planActivateCodeButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  planRestoreButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRestoreButtonText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
  modalSendCodeButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSendCodeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  modalRecoveryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    padding: 10,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  modalRecoveryNoticeText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  modalSubmitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  modalSubmitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
