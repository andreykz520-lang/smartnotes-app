import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { useSettingsStore } from './useSettingsStore';
import { YandexDiskService } from '../services/YandexDiskService';

export const NOTE_CATEGORIES = ['Разное', 'Дом', 'Автомобиль', 'Работа', 'День рождения'];

export interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
  hasAudio: boolean;
  audioUri?: string;
  imageUri?: string;
  hasReminder: boolean;
  reminderDate?: string;
  ringtoneUri?: string;
  category?: string;
  isSecret?: boolean;
  attachments?: Attachment[];
  tags?: string[];
}

export interface Attachment {
  id: string;
  name: string;
  type: string; // 'image', 'audio', 'video', 'document', 'other'
  mimeType: string;
  localUri?: string;
  driveFileId?: string;
  size?: number;
}

interface NoteState {
  notes: Note[];
  customCategories: string[];
  addNote: (note: Omit<Note, 'id' | 'date'>) => string;
  updateNote: (id: string, note: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  getNote: (id: string) => Note | undefined;
  replaceNotes: (notes: Note[]) => void;
  addCategory: (category: string) => void;
  removeCategory: (category: string) => void;
  renameCategory: (oldCategory: string, newCategory: string) => void;
  deleteSecretNotes: () => void;
}

const getFormattedDate = () => {
  const now = new Date();
  return now.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const triggerAutoSync = (notes: Note[]) => {
  const { isAutoSyncEnabled, isCloudEnabled, yandexToken, googleToken } = useSettingsStore.getState();
  const { isPro } = require('./useAuthStore').useAuthStore.getState();

  if (isPro && isCloudEnabled && isAutoSyncEnabled) {
    const jsonData = JSON.stringify(notes);
    if (yandexToken) {
      YandexDiskService.uploadBackup(yandexToken, jsonData).catch(console.error);
    }
    if (googleToken) {
      const { GoogleDriveService } = require('../services/GoogleDriveService');
      GoogleDriveService.uploadBackup(googleToken, jsonData).catch(console.error);
    }
  }
};

export const useNoteStore = create<NoteState>()(
  persist(
    (set, get) => ({
      notes: [],
      customCategories: [...NOTE_CATEGORIES],
      addNote: (noteData) => {
        const newNote: Note = {
          ...noteData,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          date: getFormattedDate(),
        };
        set((state) => ({
          notes: [newNote, ...state.notes],
        }));
        triggerAutoSync(get().notes);
        return newNote.id;
      },
      
      updateNote: (id, noteData) => {
        set((state) => ({
          notes: state.notes.map((note) => 
            note.id === id 
              ? { ...note, ...noteData, date: getFormattedDate() } 
              : note
          ),
        }));
        triggerAutoSync(get().notes);
      },
      
      deleteNote: (id) => {
        set((state) => ({
          notes: state.notes.filter((note) => note.id !== id),
        }));
        triggerAutoSync(get().notes);
      },
      
      getNote: (id) => {
        return get().notes.find((note) => note.id === id);
      },
      
      replaceNotes: (newNotes) => {
        set({ notes: newNotes });
        triggerAutoSync(get().notes);
      },
      addCategory: (category) => {
        set((state) => {
          if (!state.customCategories.includes(category)) {
            return { customCategories: [...state.customCategories, category] };
          }
          return state;
        });
      },
      removeCategory: (category) => {
        set((state) => ({
          customCategories: state.customCategories.filter(c => c !== category),
          notes: state.notes.map(note => note.category === category ? { ...note, category: 'Разное' } : note)
        }));
      },
      renameCategory: (oldCategory, newCategory) => {
        set((state) => ({
          customCategories: state.customCategories.map(c => c === oldCategory ? newCategory : c),
          notes: state.notes.map(note => note.category === oldCategory ? { ...note, category: newCategory } : note)
        }));
      },
      deleteSecretNotes: () => {
        set((state) => ({
          notes: state.notes.filter(note => !note.isSecret),
        }));
        triggerAutoSync(get().notes);
      },
    }),
    {
      name: 'smart-notes-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
