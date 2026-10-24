import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image, Linking, AppState, AppStateStatus } from 'react-native';
import { colors, spacing, borderRadius } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../store/useSettingsStore';
import { GeminiService } from '../services/GeminiService';
import { GigaChatService } from '../services/GigaChatService';
import { OpenRouterService } from '../services/OpenRouterService';
import { useChatStore, Message } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
let ExpoSpeechRecognitionModule: any = null;
if (Platform.OS !== 'web') {
  try {
    ExpoSpeechRecognitionModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch (e) {
    console.warn('ExpoSpeechRecognitionModule not available:', e);
  }
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { 
    geminiKey, gigaChatKey, openRouterKey, activeAiProvider, proxyUrl,
    selectedGeminiModel, selectedGigaChatModel, selectedOpenRouterModel
  } = useSettingsStore();
  const { messages, addMessage, clearHistory } = useChatStore();
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingAudioUri, setPendingAudioUri] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const isDictatingExplicitlyRef = useRef(false);
  const webRecognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<any[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const baseInputRef = useRef('');
  const inputTextRef = useRef(inputText);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  const stopDictation = React.useCallback(() => {
    isDictatingExplicitlyRef.current = false;
    setIsDictating(false);
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        console.warn('Error stopping media recorder:', e);
      }
      mediaRecorderRef.current = null;
    }
    if (webRecognitionRef.current) {
      try {
        if (typeof webRecognitionRef.current.abort === 'function') {
          webRecognitionRef.current.abort();
        } else if (typeof webRecognitionRef.current.stop === 'function') {
          webRecognitionRef.current.stop();
        }
      } catch (e) {
        console.warn('Error stopping web speech recognition:', e);
      }
      webRecognitionRef.current = null;
    }
    if (ExpoSpeechRecognitionModule) {
      try {
        if (typeof ExpoSpeechRecognitionModule.stop === 'function') {
          ExpoSpeechRecognitionModule.stop();
        }
        if (typeof ExpoSpeechRecognitionModule.abort === 'function') {
          ExpoSpeechRecognitionModule.abort();
        }
      } catch (e) {
        console.warn('Error stopping speech recognition:', e);
      }
    }
    if (inputTextRef.current) {
      baseInputRef.current = inputTextRef.current;
    }
  }, []);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Stop any leftover speech recognition session on mount
    stopDictation();

    if (!ExpoSpeechRecognitionModule || !ExpoSpeechRecognitionModule.addListener) return;

    const startSub = ExpoSpeechRecognitionModule.addListener('start', () => {
      if (!isDictatingExplicitlyRef.current) {
        stopDictation();
        return;
      }
      setIsDictating(true);
    });

    const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
      isDictatingExplicitlyRef.current = false;
      setIsDictating(false);
      baseInputRef.current = inputTextRef.current;
    });

    const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
      // Crucial: ignore incoming text if dictation was not explicitly started on this screen
      if (!isDictatingExplicitlyRef.current) {
        stopDictation();
        return;
      }

      const transcript = event?.results?.[0]?.transcript;
      if (typeof transcript === 'string' && transcript.length > 0) {
        let base = (baseInputRef.current || '').trim();
        // Fallback: if base was empty but input already has content, preserve existing text
        if (!base && inputTextRef.current && inputTextRef.current.trim()) {
          base = inputTextRef.current.trim();
          baseInputRef.current = inputTextRef.current;
        }
        const newText = base ? `${base} ${transcript}` : transcript;
        setInputText(newText);
        inputTextRef.current = newText;
      }
    });

    const errorSub = ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
      console.warn('Speech recognition error:', event?.error, event?.message);
      isDictatingExplicitlyRef.current = false;
      setIsDictating(false);
      baseInputRef.current = inputTextRef.current;
    });

    return () => {
      stopDictation();
      startSub?.remove?.();
      endSub?.remove?.();
      resultSub?.remove?.();
      errorSub?.remove?.();
    };
  }, [stopDictation]);

  useEffect(() => {
    const unsubBlur = navigation.addListener('blur', () => {
      stopDictation();
    });

    const unsubBeforeRemove = navigation.addListener('beforeRemove', () => {
      stopDictation();
    });

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active') {
        stopDictation();
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      unsubBlur();
      unsubBeforeRemove();
      appStateSub.remove();
      stopDictation();
    };
  }, [navigation, stopDictation]);

  const handleToggleLiveDictation = async () => {
    if (isDictating || isDictatingExplicitlyRef.current) {
      stopDictation();
      return;
    }
    try {
      const isElectron = typeof window !== 'undefined' && (
        Boolean((window as any).process?.versions?.electron) ||
        navigator.userAgent.toLowerCase().includes('electron')
      );

      const SpeechRecognition = typeof window !== 'undefined'
        ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
        : null;

      // 1. Native mobile app
      if (ExpoSpeechRecognitionModule) {
        if (recording) await stopRecording();
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!result.granted) {
          Alert.alert('Микрофон', 'Разрешите доступ к микрофону для голосового ввода');
          return;
        }
        const currentInput = inputTextRef.current || inputText || '';
        baseInputRef.current = currentInput;
        isDictatingExplicitlyRef.current = true;
        setIsDictating(true);
        const speechLang = ({ ru: 'ru-RU', en: 'en-US', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', ar: 'ar-SA' } as any)[i18n.language] || 'ru-RU';
        ExpoSpeechRecognitionModule.start({
          lang: speechLang,
          interimResults: true,
          maxAlternatives: 1,
          continuous: true,
        });
        return;
      }

      // 2. Request mic permission on Web/Electron
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (permErr: any) {
          Alert.alert('Микрофон', 'Пожалуйста, разрешите доступ к микрофону в настройках браузера или системы');
          return;
        }

        // 3. In Electron or browsers without SpeechRecognition: record audio & transcribe with Gemini
        const hasMediaRecorder = typeof window !== 'undefined' && typeof (window as any).MediaRecorder !== 'undefined';
        if (isElectron || !SpeechRecognition || (hasMediaRecorder && !('webkitSpeechRecognition' in window))) {
          if (!stream) return;
          const currentInput = inputTextRef.current || inputText || '';
          baseInputRef.current = currentInput;
          isDictatingExplicitlyRef.current = true;
          setIsDictating(true);

          audioChunksRef.current = [];
          const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = (e: any) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };

          recorder.onstop = async () => {
            stream?.getTracks?.().forEach(t => t.stop());
            const recordedChunks = audioChunksRef.current;
            if (recordedChunks.length === 0) return;
            const finalMime = recorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(recordedChunks, { type: finalMime });
            setIsTranscribing(true);
            try {
              const reader = new FileReader();
              reader.onloadend = async () => {
                const base64Data = (reader.result as string)?.split(',')[1];
                if (!base64Data) {
                  setIsTranscribing(false);
                  return;
                }
                const transcription = await GeminiService.transcribeAudio('', null, base64Data, finalMime.split(';')[0]);
                setIsTranscribing(false);
                if (transcription && transcription.trim()) {
                  let base = (baseInputRef.current || '').trim();
                  const newText = base ? `${base} ${transcription.trim()}` : transcription.trim();
                  setInputText(newText);
                  inputTextRef.current = newText;
                  baseInputRef.current = newText;
                } else {
                  Alert.alert('Голосовой ввод', 'Не удалось распознать речь или запись была слишком тихой');
                }
              };
              reader.readAsDataURL(audioBlob);
            } catch (err) {
              console.warn('Transcription error:', err);
              setIsTranscribing(false);
            }
          };

          recorder.start();
          return;
        }

        // For Web Speech API: release stream
        stream.getTracks().forEach(t => t.stop());
      }

      // 4. Web browsers with SpeechRecognition
      if (SpeechRecognition) {
        const currentInput = inputTextRef.current || inputText || '';
        baseInputRef.current = currentInput;
        const speechLang = ({ ru: 'ru-RU', en: 'en-US', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', ar: 'ar-SA' } as any)[i18n.language] || 'ru-RU';

        const recognition = new SpeechRecognition();
        recognition.lang = speechLang;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          isDictatingExplicitlyRef.current = true;
          setIsDictating(true);
        };

        recognition.onresult = (event: any) => {
          if (!isDictatingExplicitlyRef.current) return;
          let sessionTranscript = '';
          for (let i = 0; i < event.results.length; ++i) {
            sessionTranscript += event.results[i][0].transcript;
          }
          const trimmed = sessionTranscript.trim();
          if (trimmed) {
            let base = (baseInputRef.current || '').trim();
            const newText = base ? `${base} ${trimmed}` : trimmed;
            setInputText(newText);
            inputTextRef.current = newText;
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Web speech recognition error:', event?.error);
          if (event?.error === 'no-speech' || event?.error === 'aborted') {
            return;
          }
          stopDictation();
        };

        recognition.onend = () => {
          if (isDictatingExplicitlyRef.current && webRecognitionRef.current) {
            try {
              webRecognitionRef.current.start();
              return;
            } catch (e) {}
          }
          isDictatingExplicitlyRef.current = false;
          setIsDictating(false);
          webRecognitionRef.current = null;
          if (inputTextRef.current) {
            baseInputRef.current = inputTextRef.current;
          }
        };

        webRecognitionRef.current = recognition;
        recognition.start();
      }
    } catch (e: any) {
      console.warn('Dictation error:', e);
      stopDictation();
      Alert.alert(t('common.error'), e.message || t('chat.microphone_error'));
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(t('common.error'), 'Нет доступа к галерее');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingImageUri(result.assets[0].uri);
      setPendingAudioUri(null); // Clear audio if picking photo
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(t('common.error'), 'Нет доступа к камере');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingImageUri(result.assets[0].uri);
      setPendingAudioUri(null); // Clear audio if taking photo
    }
  };

  const startRecording = async () => {
    stopDictation();
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        setRecording(recording);
        setPendingAudioUri(null); // Clear previous if any
        setPendingImageUri(null); // Clear image if starting audio
      } else {
        Alert.alert(t('common.error'), t('chat.microphone_error'));
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setPendingAudioUri(uri);
    } catch (e) {
      console.error(e);
    }
    setRecording(null);
  };

  const sendMessage = async () => {
    try {
      stopDictation();

      const textToSend = inputText.trim();
      const imgToSend = pendingImageUri;
      const audioToSend = pendingAudioUri;

      if (!textToSend && !imgToSend && !audioToSend) return;

      // 1. Создаем сообщение пользователя и СРАЗУ добавляем в чат
      const userMsg: Message = { 
        id: Date.now().toString(), 
        role: 'user', 
        content: textToSend,
        imageUri: imgToSend || undefined,
        audioUri: audioToSend || undefined
      };
      addMessage(userMsg);
      
      // 2. СРАЗУ очищаем строку ввода и превью
      setInputText('');
      setPendingImageUri(null);
      setPendingAudioUri(null);
      setIsLoading(true);

      const settingsState = useSettingsStore.getState();
      const authState = useAuthStore.getState();
      const curGeminiKey = settingsState.geminiKey;
      const curGigaChatKey = settingsState.gigaChatKey;
      const curOpenRouterKey = settingsState.openRouterKey;
      const curProvider = settingsState.activeAiProvider || 'gemini';
      const curProxy = settingsState.proxyUrl;

      const historyForApi = [...messages, userMsg].map(m => ({ 
        role: m.role, 
        content: m.content,
        imageUri: m.imageUri,
        audioUri: m.audioUri
      }));

      let aiResponseText: string | null = null;
      if (curProvider === 'gemini') {
        aiResponseText = await GeminiService.sendMessage(curGeminiKey || '', curProxy, historyForApi);
      } else if (curProvider === 'gigachat') {
        if (!curGigaChatKey) {
          addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: '⚠️ Пожалуйста, укажите Auth Key для GigaChat в Настройках.' });
          return;
        }
        aiResponseText = await GigaChatService.sendMessage(curGigaChatKey, historyForApi);
      } else if (curProvider === 'openrouter') {
        aiResponseText = await OpenRouterService.sendMessage(curOpenRouterKey || '', curProxy, historyForApi);
      }
      
      if (aiResponseText) {
        addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: aiResponseText });
      } else {
        addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: '❌ Не удалось получить ответ от нейросети. Проверьте интернет или настройки.' });
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: `❌ Ошибка: ${e.message || 'Сбой связи с нейросетью'}` });
    } finally {
      setIsLoading(false);
    }
  };

  const renderTextWithLinks = (text: string, textStyle: any) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return (
      <Text style={textStyle}>
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            return (
              <Text 
                key={i} 
                style={{ color: colors.primary, textDecorationLine: 'underline' }} 
                onPress={() => Linking.openURL(part).catch(() => Alert.alert(t('common.error'), 'Не удалось открыть ссылку'))}
              >
                {part}
              </Text>
            );
          }
          return <Text key={i}>{part}</Text>;
        })}
      </Text>
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={16} color="#fff" />
          </View>
        )}
        <View style={styles.messageContent}>
          {item.imageUri && (
            <Image source={{ uri: item.imageUri }} style={styles.messageImage} />
          )}
          {item.audioUri && (
            <View style={styles.audioBubble}>
               <Ionicons name="mic" size={16} color={isUser ? colors.text : colors.primary} />
               <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText, { marginLeft: 6 }]}>{t('chat.voice_message')}</Text>
            </View>
          )}
          {!!item.content && renderTextWithLinks(
            item.id === 'initial' || item.content === 'Привет! Я ваш умный помощник. Чем я могу помочь вам сегодня?'
              ? t('chat.initial_greeting')
              : item.content,
            [styles.messageText, isUser ? styles.userText : styles.aiText]
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons 
            name={activeAiProvider === 'gemini' ? "logo-google" : activeAiProvider === 'gigachat' ? "flash" : "globe-outline"} 
            size={14} 
            color={colors.primary} 
            style={{ marginRight: 6 }} 
          />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>
            {activeAiProvider === 'gemini' 
              ? `Google Gemini (${selectedGeminiModel || 'Flash Cloud'})` 
              : activeAiProvider === 'gigachat' 
                ? `Сбер GigaChat (${selectedGigaChatModel || 'GigaChat'})` 
                : (!openRouterKey ? 'OpenRouter (Gemini Flash Cloud)' : `OpenRouter (${selectedOpenRouterModel?.split('/').pop() || 'Flash'})`)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => (navigation as any).navigate('Settings')} style={{ paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>{t('tabs.settings')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.chatContainer}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />
      
      {(pendingImageUri || pendingAudioUri) && (
        <View style={styles.previewContainer}>
          {pendingImageUri && (
            <View style={styles.previewItem}>
              <Image source={{ uri: pendingImageUri }} style={styles.previewImage} />
              <TouchableOpacity style={styles.removePreview} onPress={() => setPendingImageUri(null)}>
                <Ionicons name="close-circle" size={24} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
          {pendingAudioUri && (
            <View style={styles.previewItem}>
              <View style={styles.audioPreview}>
                <Ionicons name="mic" size={24} color={colors.primary} />
                <Text style={{color: colors.text, marginLeft: 8}}>{t('chat.audio_ready')}</Text>
              </View>
              <TouchableOpacity style={styles.removePreview} onPress={() => setPendingAudioUri(null)}>
                <Ionicons name="close-circle" size={24} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={styles.inputContainer}>
        {recording ? (
          <TouchableOpacity style={styles.recordingButton} onPress={stopRecording}>
            <Ionicons name="stop-circle" size={32} color={colors.danger} />
            <Text style={{color: colors.danger, marginLeft: 8}}>Запись...</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
              <Ionicons name="image-outline" size={24} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachButton} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.attachButton, isDictating && { backgroundColor: colors.danger, borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }]} 
              onPress={handleToggleLiveDictation}
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name={isDictating ? "mic" : "mic-outline"} size={22} color={isDictating ? "#fff" : colors.primary} />
              )}
            </TouchableOpacity>
            <TextInput
              style={[styles.input, isDictating && { borderColor: colors.danger, borderWidth: 1 }]}
              placeholder={isDictating ? "🔴 Идёт запись... Нажмите ещё раз для отправки" : (isTranscribing ? "⏳ ИИ расшифровывает голос..." : t('chat.type_message'))}
              placeholderTextColor={isDictating ? colors.danger : colors.textMuted}
              value={inputText}
              onChangeText={(text) => {
                setInputText(text);
                inputTextRef.current = text;
                if (!isDictatingExplicitlyRef.current) {
                  baseInputRef.current = text;
                }
              }}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity 
              style={[styles.sendButton, (!inputText.trim() && !pendingImageUri && !pendingAudioUri || isLoading) && { opacity: 0.5 }]} 
              onPress={sendMessage}
              disabled={(!inputText.trim() && !pendingImageUri && !pendingAudioUri) || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chatContainer: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  messageBubble: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  aiBubble: {
    alignSelf: 'flex-start',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 4,
  },
  messageContent: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    flexShrink: 1,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  userText: {
    color: colors.text,
    fontSize: 16,
  },
  aiText: {
    color: colors.text,
    fontSize: 16,
  },
  previewContainer: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceHighlight,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.xs,
    borderRadius: borderRadius.md,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
  },
  audioPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
  },
  removePreview: {
    padding: spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  attachButton: {
    width: 40,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xs,
    marginBottom: 0,
  },
  recordingButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
    marginBottom: 0,
  },
  messageText: { fontSize: 16, lineHeight: 22 },
});
