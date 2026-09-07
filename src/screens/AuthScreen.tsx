import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { colors } from '../theme';
import { useAuthStore, getOrCreateDeviceId } from '../store/useAuthStore';
import { API_URL } from '../config';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'EMAIL' | 'CODE'>('EMAIL');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  
  const { setAuth, deviceId } = useAuthStore();

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSendCode = async () => {
    setStatusMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setStatusMessage({ type: 'error', text: 'Введите корректный email' });
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        setStep('CODE');
        setStatusMessage({ type: 'success', text: `Код отправлен на ${cleanEmail}` });
      } else {
        const err = data.error || 'Не удалось отправить код';
        setStatusMessage({ type: 'error', text: err });
        showAlert('Ошибка', err);
      }
    } catch (e: any) {
      const err = 'Проверьте подключение к интернету: ' + (e?.message || '');
      setStatusMessage({ type: 'error', text: err });
      showAlert('Ошибка', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setStatusMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode || cleanCode.length < 6) {
      setStatusMessage({ type: 'error', text: 'Введите 6-значный код из письма' });
      return;
    }

    setIsLoading(true);
    try {
      const activeDeviceId = deviceId || (await getOrCreateDeviceId());
      const response = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode, deviceId: activeDeviceId }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setAuth(data.token, data.user.email, data.user.isPro, data.user.isProPlus);
      } else {
        if (response.status === 403 && data.error?.includes('Превышен лимит устройств')) {
          if (data.canReset) {
            Alert.alert(
              'Превышен лимит устройств',
              'Вы пытаетесь войти с нового устройства, но лимит исчерпан.\n\nХотите отвязать все ваши старые устройства и войти на этом? (Осталось попыток: 1)',
              [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Отвязать старые устройства', style: 'destructive', onPress: handleResetDevices }
              ]
            );
          } else {
            setStatusMessage({ type: 'error', text: 'Вы превысили лимит устройств и уже использовали одноразовый сброс. Обратитесь в поддержку.' });
          }
        } else {
          const err = data.error || 'Неверный или устаревший код';
          setStatusMessage({ type: 'error', text: err });
        }
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Ошибка сети: ' + (e?.message || '') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetDevices = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim().toUpperCase();

    setIsLoading(true);
    try {
      const activeDeviceId = deviceId || (await getOrCreateDeviceId());
      const response = await fetch(`${API_URL}/api/auth/reset-devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode, deviceId: activeDeviceId }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setAuth(data.token, data.user.email, data.user.isPro, data.user.isProPlus);
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Не удалось сбросить устройства' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Ошибка сети: ' + (e?.message || '') });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Добро пожаловать</Text>
      <Text style={styles.subtitle}>
        {step === 'EMAIL' 
          ? 'Введите ваш email для входа или регистрации' 
          : 'Введите код, отправленный на ' + email.trim()}
      </Text>

      {statusMessage && (
        <View style={[styles.statusBox, statusMessage.type === 'error' ? styles.errorBox : styles.successBox]}>
          <Text style={[styles.statusText, statusMessage.type === 'error' ? styles.errorText : styles.successText]}>
            {statusMessage.text}
          </Text>
        </View>
      )}

      {step === 'EMAIL' ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Ваш Email"
            placeholderTextColor="#888"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(text) => { setEmail(text); setStatusMessage(null); }}
            onSubmitEditing={handleSendCode}
          />
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleSendCode}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Получить код</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Код из письма (например 123456)"
            placeholderTextColor="#888"
            keyboardType="default"
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={(text) => { setCode(text); setStatusMessage(null); }}
            onSubmitEditing={handleVerifyCode}
            autoFocus
          />
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleVerifyCode}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Войти</Text>}
          </TouchableOpacity>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
            <TouchableOpacity onPress={handleSendCode} disabled={isLoading}>
              <Text style={styles.backButtonText}>Отправить код еще раз</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep('EMAIL'); setCode(''); setStatusMessage(null); }}>
              <Text style={styles.backButtonText}>Изменить email</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 24,
    textAlign: 'center',
  },
  statusBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  successBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  statusText: {
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#fca5a5',
  },
  successText: {
    color: '#86efac',
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 14,
  },
});
