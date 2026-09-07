import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image, Linking } from 'react-native';
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
  const { geminiKey, gigaChatKey, openRouterKey, activeAiProvider, proxyUrl } = useSettingsStore();
  const { messages, addMessage, clearHistory } = useChatStore();
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingAudioUri, setPendingAudioUri] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const baseInputRef = useRef('');
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!ExpoSpeechRecognitionModule || !ExpoSpeechRecognitionModule.addListener) return;

    const startSub = ExpoSpeechRecognitionModule.addListener('start', () => {
      setIsDictating(true);
    });

    const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
      setIsDictating(false);
    });

    const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
      const transcript = event?.results?.[0]?.transcript;
      if (transcript) {
        const base = baseInputRef.current.trim();
        const newText = base ? `${base} ${transcript}` : transcript;
        setInputText(newText);
      }
    });

    const errorSub = ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
      console.warn('Speech recognition error:', event?.error, event?.message);
      setIsDictating(false);
    });

    return () => {
      startSub?.remove?.();
      endSub?.remove?.();
      resultSub?.remove?.();
      errorSub?.remove?.();
    };
  }, []);

  const handleToggleLiveDictation = async () => {
    if (isDictating) {
      ExpoSpeechRecognitionModule.stop();
      setIsDictating(false);
      return;
    }
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert('Микрофон', 'Разрешите доступ к микрофону для голосового ввода');
        return;
      }
      baseInputRef.current = inputText;
      ExpoSpeechRecognitionModule.start({
        lang: 'ru-RU',
        interimResults: true,
        maxAlternatives: 1,
        continuous: true,
      });
      setIsDictating(true);
    } catch (e: any) {
      console.warn('Dictation error:', e);
      setIsDictating(false);
      Alert.alert('Ошибка', 'Не удалось включить голосовой ввод: ' + (e.message || 'Проверьте микрофон'));
    }
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={clearHistory} style={{ marginRight: 15 }}>
          <Ionicons name="trash-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, clearHistory]);

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
      if (isDictating) {
        try { ExpoSpeechRecognitionModule.stop(); } catch (e) {}
        setIsDictating(false);
      }

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
              <Ionicons name={isDictating ? "mic" : "mic-outline"} size={22} color={isDictating ? "#fff" : colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, isDictating && { borderColor: colors.danger, borderWidth: 1 }]}
              placeholder={isDictating ? "Слушаю вас... Говорите" : t('chat.type_message')}
              placeholderTextColor={isDictating ? colors.danger : colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
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
  userText: { color: colors.text },
  aiText: { color: colors.text }
});
