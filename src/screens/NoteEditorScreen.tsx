import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Text, ScrollView, Image, Switch, Share, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, borderRadius } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { useNoteStore, Attachment } from '../store/useNoteStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { GeminiService } from '../services/GeminiService';
import { GigaChatService } from '../services/GigaChatService';
import { OpenRouterService } from '../services/OpenRouterService';
import { GoogleDriveService } from '../services/GoogleDriveService';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '../components/DateTimePicker';
import { useTranslation } from 'react-i18next';
import { formatCategory } from '../utils/formatCategory';
let ExpoSpeechRecognitionModule: any = null;
if (Platform.OS !== 'web') {
  try {
    ExpoSpeechRecognitionModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch (e) {
    console.warn('ExpoSpeechRecognitionModule not available:', e);
  }
}

type NoteEditorScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;
type NoteEditorScreenRouteProp = RouteProp<RootStackParamList, 'NoteEditor'>;

type Props = {
  navigation: NoteEditorScreenNavigationProp;
  route: NoteEditorScreenRouteProp;
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function NoteEditorScreen({ navigation, route }: Props) {
  const noteId = route.params?.noteId;
  const getNote = useNoteStore(state => state.getNote);
  const addNote = useNoteStore(state => state.addNote);
  const updateNote = useNoteStore(state => state.updateNote);
  const deleteNote = useNoteStore(state => state.deleteNote);
  const googleToken = useSettingsStore(state => state.googleToken);
  const isCloudEnabled = useSettingsStore(state => state.isCloudEnabled);
  const { t, i18n } = useTranslation();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const baseContentRef = React.useRef('');

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
        const base = baseContentRef.current.trim();
        const newContent = base ? `${base} ${transcript}` : transcript;
        setContent(newContent);
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

  const handleToggleDictation = async () => {
    if (isDictating) {
      ExpoSpeechRecognitionModule.stop();
      setIsDictating(false);
      return;
    }
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert(t('tabs.settings'), t('chat.mic_permission_required'));
        return;
      }
      baseContentRef.current = content;
      const speechLang = ({ ru: 'ru-RU', en: 'en-US', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', ar: 'ar-SA' } as any)[i18n.language] || 'en-US';
      ExpoSpeechRecognitionModule.start({
        lang: speechLang,
        interimResults: true,
        maxAlternatives: 1,
        continuous: true,
      });
      setIsDictating(true);
    } catch (e: any) {
      console.warn('Dictation error:', e);
      setIsDictating(false);
      Alert.alert(t('common.error'), e.message || t('chat.microphone_error'));
    }
  };

  const [reminderDate, setReminderDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time'>('date');
  const [ringtoneUri, setRingtoneUri] = useState<string | null>(null);
  const [ringtoneName, setRingtoneName] = useState<string | null>(null);

  const [imageUri, setImageUri] = useState<string | null>(null);

  const [category, setCategory] = useState<string>('Разное');
  const [isSecret, setIsSecret] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const customCategories = useNoteStore(state => state.customCategories);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (noteId) {
      const note = getNote(noteId);
      if (note) {
        setTitle(note.title);
        setContent(note.content);
        if (note.audioUri) setAudioUri(note.audioUri);
        if (note.reminderDate) setReminderDate(new Date(note.reminderDate));
        if (note.ringtoneUri) setRingtoneUri(note.ringtoneUri);
        if (note.imageUri) setImageUri(note.imageUri);
        if (note.category) setCategory(note.category);
        if (note.isSecret !== undefined) setIsSecret(note.isSecret);
        if (note.attachments) setAttachments(note.attachments);
        if (note.tags) setTags(note.tags);
      }
    }
    
    const requestPermissions = async () => {
      if (Platform.OS !== 'web') {
        try {
          await Notifications.requestPermissionsAsync();
        } catch (e) {
          console.warn('Notifications permission error', e);
        }
      }
      try {
        await ImagePicker.requestCameraPermissionsAsync();
      } catch (e) {
        console.warn('Camera permission error', e);
      }
    };
    requestPermissions();
  }, [noteId, getNote]);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
        setRecording(recording);
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    setRecording(null);
    if (recording) {
      await recording.stopAndUnloadAsync();
      setAudioUri(recording.getURI());
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });
    if (!result?.canceled && result?.assets[0]) {
      const asset = result?.assets[0];
      const newAttachment: Attachment = {
        id: Date.now().toString(),
        name: asset.name,
        type: 'document',
        mimeType: asset.mimeType || 'application/octet-stream',
        localUri: asset.uri,
        size: asset.size,
      };
      setAttachments([...attachments, newAttachment]);
    }
  };

  const handleUpload = async (att: Attachment) => {
    if (!googleToken) {
       Alert.alert('Требуется вход', 'Сначала войдите в Google Диск в Настройках');
       return;
    }
    if (!att.localUri) return;
    setUploadingId(att.id);
    const fileId = await GoogleDriveService.uploadAttachment(googleToken, att.localUri, att.name, att.mimeType);
    setUploadingId(null);
    if (fileId) {
       const newAtts = attachments.map(a => a.id === att.id ? { ...a, driveFileId: fileId } : a);
       setAttachments(newAtts);
    } else {
       Alert.alert('Ошибка', 'Не удалось загрузить файл в облако');
    }
  };

  const handleDownload = async (att: Attachment) => {
    if (!googleToken) {
       Alert.alert('Требуется вход', 'Сначала войдите в Google Диск в Настройках');
       return;
    }
    if (!att.driveFileId) return;
    setUploadingId(att.id);
    const uri = await GoogleDriveService.downloadAttachment(googleToken, att.driveFileId, att.name);
    setUploadingId(null);
    if (uri) {
       const newAtts = attachments.map(a => a.id === att.id ? { ...a, localUri: uri } : a);
       setAttachments(newAtts);
    } else {
       Alert.alert('Ошибка', 'Не удалось скачать файл из облака');
    }
  };

  const handleRemoveLocal = (att: Attachment) => {
    const newAtts = attachments.map(a => a.id === att.id ? { ...a, localUri: undefined } : a);
    setAttachments(newAtts);
  };

  const deleteAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const playSound = async () => {
    if (!audioUri) return;
    if (sound) {
      if (isPlaying) { await sound.pauseAsync(); } 
      else { await sound.playAsync(); }
      return;
    }
    const { sound: newSound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
    setSound(newSound);
    newSound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded) {
        setIsPlaying(status.isPlaying);
        if (status.didJustFinish) {
          setIsPlaying(false);
          newSound.setPositionAsync(0);
        }
      }
    });
  };

  const deleteAudio = () => {
    setAudioUri(null);
    if (sound) { sound.unloadAsync(); setSound(null); setIsPlaying(false); }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result?.canceled && result?.assets.length > 0) {
        setImageUri(result?.assets[0].uri);
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось сделать фото');
    }
  };

  const [isAiLoading, setIsAiLoading] = useState(false);

  const { isPro } = require('../store/useAuthStore').useAuthStore();

  const handleAiAnalyze = async () => {
    if (!isPro) {
      Alert.alert('Требуется PRO', 'Анализ нейросетью доступен только в PRO версии.');
      return;
    }

    const { geminiKey, gigaChatKey, openRouterKey, activeAiProvider, proxyUrl } = useSettingsStore.getState();
    const { isProPlus } = require('../store/useAuthStore').useAuthStore.getState();
    
    const textToAnalyze = (title + '\n' + content).trim();
    if (!textToAnalyze && !audioUri) {
      Alert.alert('Ошибка', 'Заметка пуста, анализировать нечего.');
      return;
    }

    if (activeAiProvider === 'gemini' && !geminiKey && !isProPlus) {
      Alert.alert('Требуется ключ', 'Пожалуйста, добавьте API Key Gemini в настройках или оформите подписку PRO+.');
      return;
    }
    if (activeAiProvider === 'gigachat' && !gigaChatKey) {
      Alert.alert('Требуется ключ', 'Пожалуйста, добавьте Auth Key GigaChat в настройках.');
      return;
    }
    if (activeAiProvider === 'openrouter' && !openRouterKey && !isProPlus) {
      Alert.alert('Требуется подписка', 'Пожалуйста, оформите подписку PRO+ или укажите свой API Key OpenRouter в настройках.');
      return;
    }

    setIsAiLoading(true);
    try {
      let result: { summary: string, reminderDate: string | null, tags: string[], transcription?: string } | null = null;
      
      if (activeAiProvider === 'openrouter') {
        result = await OpenRouterService.analyzeNote(openRouterKey || '', proxyUrl, textToAnalyze, audioUri);
      } else if (activeAiProvider === 'gigachat') {
        if (audioUri) {
          Alert.alert('Внимание', 'Распознавание голоса пока не поддерживается для GigaChat.');
        }
        result = await GigaChatService.analyzeNote(gigaChatKey!, textToAnalyze);
      } else {
        result = await GeminiService.analyzeNote(geminiKey || '', proxyUrl, textToAnalyze, audioUri);
      }
      
      if (result) {
        if (result.transcription) {
          setContent(prev => prev + (prev.trim() ? '\n\n' : '') + result.transcription);
          Alert.alert('Готово', 'Голос успешно расшифрован в текст!');
        }
        if (result.summary) {
          setContent(prev => prev + '\n\n--- AI Саммари ---\n' + result.summary);
        }
        if (result.reminderDate) {
          setReminderDate(new Date(result.reminderDate));
          Alert.alert('AI нашел дату!', 'Установлено напоминание на ' + new Date(result.reminderDate).toLocaleString('ru-RU'));
        }
        if (result.tags && result.tags.length > 0) {
          setTags(prev => {
            const newTags = [...prev];
            result.tags.forEach((t: string) => {
              if (!newTags.includes(t)) newTags.push(t);
            });
            return newTags;
          });
        }
      } else {
        Alert.alert('Ошибка', 'Не удалось проанализировать текст.');
      }
    } catch (error: any) {
      Alert.alert('Ошибка', 'Не удалось обработать ответ от ИИ: ' + (error.message || 'Неизвестная ошибка'));
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDelete = React.useCallback(() => {
    if (noteId) {
      const confirmDelete = () => {
        isSavingRef.current = true;
        deleteNote(noteId);
        navigation.goBack();
      };

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm) {
          if (window.confirm('Вы уверены, что хотите удалить эту заметку?')) {
            confirmDelete();
          }
        } else {
          confirmDelete();
        }
      } else {
        Alert.alert(
          'Удаление',
          'Вы уверены, что хотите удалить эту заметку?',
          [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: confirmDelete }
          ]
        );
      }
    }
  }, [noteId, deleteNote, navigation]);

  const handleExportPDF = React.useCallback(async () => {
    try {
      const note = noteId ? getNote(noteId) : null;
      let imageHtml = '';
      if (imageUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
          imageHtml = `<div style="margin-top: 15px; margin-bottom: 15px; text-align: center;"><img src="data:image/jpeg;base64,${base64}" style="max-width: 100%; max-height: 400px; border-radius: 8px; object-fit: contain;" /></div>`;
        } catch (err) {
          console.warn('Failed to embed image in PDF', err);
        }
      }

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              h1 { font-size: 24px; margin-bottom: 5px; color: #111; }
              .meta { font-size: 14px; color: #666; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
              .content { font-size: 16px; line-height: 1.6; white-space: pre-wrap; color: #222; }
            </style>
          </head>
          <body>
            <h1>${title || 'Без названия'}</h1>
            <div class="meta">Категория: ${category} | Создано: ${note ? new Date((note as any).createdAt || Date.now()).toLocaleString('ru-RU') : new Date().toLocaleString('ru-RU')}</div>
            ${imageHtml}
            <div class="content">${content}</div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Экспорт в PDF' });
      } else {
        Alert.alert('Готово', `PDF сохранен по адресу: ${uri}`);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось создать PDF');
    }
  }, [noteId, getNote, title, category, content, imageUri]);

  const handleShare = React.useCallback(async () => {
    try {
      if (imageUri && await Sharing.isAvailableAsync()) {
        Alert.alert(
          'Выгрузить заметку',
          'Выберите способ выгрузки заметки:',
          [
            { 
              text: '📄 Текст заметки', 
              onPress: async () => {
                await Share.share({
                  message: `${title ? title + '\n\n' : ''}${content}`,
                  title: title || 'Заметка'
                });
              }
            },
            { 
              text: '🖼️ Отправить фото', 
              onPress: async () => {
                await Sharing.shareAsync(imageUri, { dialogTitle: 'Поделиться фото' });
              }
            },
            { 
              text: '📑 Экспорт в PDF с фото', 
              onPress: handleExportPDF 
            },
            { text: 'Отмена', style: 'cancel' }
          ]
        );
      } else {
        const message = `${title ? title + '\n\n' : ''}${content}`;
        await Share.share({
          message,
          title: title || 'Заметка'
        });
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось выгрузить заметку');
    }
  }, [title, content, imageUri, handleExportPDF]);

  const handleSave = async () => {
    try {
      if (!title.trim() && !content.trim() && !audioUri && !reminderDate && !imageUri && attachments.length === 0) {
        navigation.goBack();
        return;
      }

      if (reminderDate && reminderDate.getTime() > Date.now()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: title || 'Напоминание',
            body: content || 'У вас сработало умное напоминание!',
            sound: true, 
          },
          trigger: reminderDate,
        });
      }

      const finalTags = [...tags];
      if (tagInput.trim() && !finalTags.includes(tagInput.trim())) {
        finalTags.push(tagInput.trim());
      }

      const noteData = { 
        title, 
        content, 
        audioUri: audioUri || undefined, 
        hasAudio: !!audioUri,
        hasReminder: !!reminderDate,
        reminderDate: reminderDate?.toISOString(),
        ringtoneUri: ringtoneUri || undefined,
        imageUri: imageUri || undefined,
        category,
        isSecret,
        attachments,
        tags: finalTags
      };

      if (noteId) {
        updateNote(noteId, noteData);
      } else {
        addNote(noteData);
      }
      
      // Trigger sync in background
      const { SyncService } = require('../services/SyncService');
      SyncService.syncNotes();

      isSavingRef.current = true;
      Alert.alert("Успех", "Заметка сохранена!", [
        { text: "ОК", onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      Alert.alert("Ошибка сохранения", e.message || String(e));
      console.error(e);
    }
  };

  React.useEffect(() => {
    navigation.setOptions({
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={handleExportPDF} style={{ marginRight: 16 }}>
              <Ionicons name="document-text-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={{ marginRight: spacing.md }}>
              <Ionicons name="share-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
            {noteId && (
              <TouchableOpacity onPress={handleDelete} style={{ marginRight: spacing.sm }}>
                <Ionicons name="trash-outline" size={24} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        ),
      });
  }, [navigation, noteId, handleExportPDF, handleShare, handleDelete]);

  const isSavingRef = React.useRef(false);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (isSavingRef.current) return;
      if (noteId) {
        const exists = useNoteStore.getState().notes.some(n => n.id === noteId);
        if (!exists) return; // If note was deleted, don't recreate it!
      }
      if (title.trim() || content.trim() || audioUri || imageUri || attachments.length > 0) {
        const finalTags = [...tags];
        if (tagInput.trim() && !finalTags.includes(tagInput.trim())) {
          finalTags.push(tagInput.trim());
        }

        const noteData = { 
          title, content, audioUri: audioUri || undefined, hasAudio: !!audioUri,
          hasReminder: !!reminderDate, reminderDate: reminderDate?.toISOString(),
          ringtoneUri: ringtoneUri || undefined, imageUri: imageUri || undefined,
          category, isSecret, attachments, tags
        };
        if (noteId) updateNote(noteId, noteData);
        else addNote(noteData);
      }
    });
    return unsubscribe;
  }, [navigation, title, content, audioUri, reminderDate, imageUri, category, isSecret, noteId, attachments, tags, tagInput]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.editorContainer}>
        <TextInput
          style={styles.titleInput}
          placeholder={t('notes.new_note')}
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />

        <View style={styles.secretToggleContainer}>
          <Text style={styles.secretToggleText}>{t('notes.secret_note_locked')}</Text>
          <Switch 
            value={isSecret} 
            onValueChange={setIsSecret} 
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={'#fff'}
          />
        </View>

        <View style={styles.categoriesWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContainer}>
            {customCategories.map(cat => (
              <TouchableOpacity 
                key={cat}
                style={[styles.categoryTab, category === cat && styles.categoryTabActive]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[styles.categoryTabText, category === cat && styles.categoryTabTextActive]}>{formatCategory(cat, t)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        
        <View style={styles.tagsInputContainer}>
          <Ionicons name="pricetag-outline" size={20} color={colors.textMuted} style={{marginRight: spacing.sm}} />
          {tags.map(tag => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagText}>#{tag}</Text>
              <TouchableOpacity onPress={() => setTags(tags.filter(t => t !== tag))}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
          <TextInput
            style={styles.tagInputField}
            placeholder={t('notes.search')}
            placeholderTextColor={colors.textMuted}
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={() => {
              if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                setTags([...tags, tagInput.trim()]);
                setTagInput('');
              }
            }}
          />
        </View>
        
        {imageUri && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageUri }} style={styles.attachedImage} />
            <View style={styles.imageActionsOverlay}>
              <TouchableOpacity 
                style={styles.imageActionButton} 
                onPress={async () => {
                  if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(imageUri, { dialogTitle: 'Share' });
                  } else {
                    Alert.alert('Photo', `Path: ${imageUri}`);
                  }
                }}
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.imageActionButton, { backgroundColor: 'rgba(239, 68, 68, 0.85)', marginLeft: 8 }]} 
                onPress={() => setImageUri(null)}
              >
                <Ionicons name="trash-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {audioUri && (
          <View style={styles.audioPlayerContainer}>
            <TouchableOpacity onPress={playSound} style={styles.playButton}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.audioText}>{t('notes.voice_input')}</Text>
            <TouchableOpacity onPress={deleteAudio} style={styles.deleteAudioButton}>
              <Ionicons name="close-circle" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {reminderDate && (
          <View style={styles.reminderContainer}>
            <View style={styles.reminderHeader}>
              <Ionicons name="alarm" size={20} color={colors.accent} />
              <Text style={styles.reminderText}>
                {t('notes.reminder_set')} {reminderDate.toLocaleString()}
              </Text>
              <TouchableOpacity onPress={() => setReminderDate(null)}>
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isDictating && (
          <TouchableOpacity style={styles.dictatingBanner} onPress={handleToggleDictation}>
            <Ionicons name="radio" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.dictatingText}>🔴 {t('notes.listening')}</Text>
          </TouchableOpacity>
        )}

        <TextInput
          style={styles.contentInput}
          placeholder={t('notes.type_text')}
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />

        {attachments.length > 0 && (
          <View style={styles.attachmentsContainer}>
            <Text style={{color: colors.textMuted, marginBottom: 8}}>Вложения ({attachments.length}):</Text>
            {attachments.map(att => (
              <View key={att.id} style={styles.attachmentItem}>
                <Ionicons name="document-attach" size={24} color={colors.primary} />
                <View style={{flex: 1, marginLeft: 8}}>
                  <Text style={{color: colors.text, fontSize: 14}} numberOfLines={1}>{att.name}</Text>
                </View>
                
                {uploadingId === att.id ? (
                  <ActivityIndicator color={colors.primary} size="small" style={{marginHorizontal: 8}} />
                ) : (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    {isCloudEnabled && att.localUri && !att.driveFileId && (
                      <TouchableOpacity style={styles.attAction} onPress={() => handleUpload(att)}>
                        <Ionicons name="cloud-upload" size={20} color={colors.accent} />
                      </TouchableOpacity>
                    )}
                    {isCloudEnabled && !att.localUri && att.driveFileId && (
                      <TouchableOpacity style={styles.attAction} onPress={() => handleDownload(att)}>
                        <Ionicons name="cloud-download" size={20} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                    {isCloudEnabled && att.localUri && att.driveFileId && (
                      <TouchableOpacity style={styles.attAction} onPress={() => handleRemoveLocal(att)}>
                        <Ionicons name="phone-portrait-outline" size={20} color={colors.danger} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.attAction} onPress={() => deleteAttachment(att.id)}>
                      <Ionicons name="trash" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {showDatePicker && Platform.OS !== 'web' && DateTimePicker && (
        <DateTimePicker
          value={reminderDate || new Date()}
          mode={Platform.OS === 'ios' ? 'datetime' : datePickerMode}
          display="default"
          onChange={(event: any, selectedDate: any) => {
            if (Platform.OS === 'ios') {
              setShowDatePicker(false);
              if (selectedDate) setReminderDate(selectedDate);
            } else {
              if (event.type === 'set' && selectedDate) {
                if (datePickerMode === 'date') {
                  const current = reminderDate || new Date();
                  current.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                  setReminderDate(new Date(current));
                  setShowDatePicker(false);
                  setTimeout(() => {
                    setDatePickerMode('time');
                    setShowDatePicker(true);
                  }, 100);
                } else {
                  const current = reminderDate || new Date();
                  current.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                  setReminderDate(new Date(current));
                  setShowDatePicker(false);
                  setDatePickerMode('date');
                }
              } else {
                setShowDatePicker(false);
                setDatePickerMode('date');
              }
            }
          }}
        />
      )}
      {showDatePicker && Platform.OS === 'web' && (
        <View style={{padding: 20, backgroundColor: 'white'}}>
          <Text style={{color: 'red'}}>Напоминания (будильник) работают только в мобильной версии.</Text>
        </View>
      )}

      <View style={styles.toolbar}>
        <TouchableOpacity 
          style={[styles.toolButton, isDictating && styles.recordingButton]} 
          onPress={handleToggleDictation}
        >
          <Ionicons name={isDictating ? "mic" : "mic-outline"} size={26} color={isDictating ? "#fff" : colors.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.toolButton} onPress={takePhoto}>
          <Ionicons name="camera" size={26} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={pickDocument}>
          <Ionicons name="attach" size={26} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="alarm" size={26} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.toolButton, isAiLoading && { opacity: 0.5 }]} onPress={handleAiAnalyze} disabled={isAiLoading || isDictating}>
          {isAiLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="sparkles" size={26} color={colors.primary} />
          )}
        </TouchableOpacity>
        
        <View style={{flex: 1}} />
        
        <TouchableOpacity style={[styles.saveButton, isAiLoading && { opacity: 0.5 }]} onPress={handleSave} disabled={isAiLoading}>
          <Ionicons name="checkmark" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  editorContainer: { flex: 1, padding: spacing.md },
  dictatingBanner: {
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  dictatingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  titleInput: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: spacing.md },
  contentInput: { fontSize: 18, color: colors.text, lineHeight: 28, minHeight: 200, paddingBottom: spacing.xxl },
  imageContainer: { position: 'relative', marginBottom: spacing.md, borderRadius: borderRadius.md, overflow: 'hidden' },
  attachedImage: { width: '100%', height: 200, borderRadius: borderRadius.md, resizeMode: 'cover' },
  imageActionsOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageActionButton: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPlayerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceHighlight, padding: spacing.sm, borderRadius: borderRadius.md, marginBottom: spacing.md },
  playButton: { backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  audioText: { color: colors.text, fontSize: 16, marginLeft: spacing.sm, flex: 1 },
  deleteAudioButton: { padding: spacing.xs },
  reminderContainer: { backgroundColor: colors.surfaceHighlight, padding: spacing.sm, borderRadius: borderRadius.md, marginBottom: spacing.md },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  reminderText: { color: colors.accent, fontSize: 16, marginLeft: spacing.sm, flex: 1, fontWeight: '600' },
  toolbar: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  toolButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceHighlight, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  recordingButton: { backgroundColor: colors.danger },
  saveButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  attachmentsContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
    backgroundColor: colors.surfaceHighlight,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  attAction: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  categoriesWrapper: {
    marginBottom: spacing.md,
  },
  secretToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceHighlight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  secretToggleText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  categoriesContainer: {
    paddingVertical: spacing.xs,
  },
  categoryTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    backgroundColor: colors.surfaceHighlight,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryTabActive: {
    backgroundColor: colors.primary,
  },
  categoryTabText: {
    color: colors.text,
    fontSize: 14,
  },
  categoryTabTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  tagsInputContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceHighlight,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 14,
    color: colors.textMuted,
    marginRight: 4,
  },
  tagInputField: {
    flex: 1,
    minWidth: 100,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 4,
  }
});
