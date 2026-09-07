import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;
  audioUri?: string;
};

const initialMessage: Message = { 
  id: 'initial', 
  role: 'assistant', 
  content: 'Привет! Я ваш умный помощник. Чем я могу помочь вам сегодня?' 
};

interface ChatState {
  messages: Message[];
  addMessage: (message: Message) => void;
  clearHistory: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [initialMessage],
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      clearHistory: () => set({ messages: [initialMessage] }),
    }),
    {
      name: 'smartnotes-chat-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
