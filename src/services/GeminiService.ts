import * as FileSystem from 'expo-file-system';
import { useAuthStore } from '../store/useAuthStore';

const PRO_GEMINI_KEY = 'AQ.Ab8RN6IcZJdYCDG28zz80eX1fiNfTqveqWP7NDk80x7ohKEMCw';
const BUILTIN_PROXY = 'https://smartnotes-backend-two.vercel.app/api/proxy/gemini';
const GEMINI_MODEL = 'gemini-3.7-flash';

export class GeminiService {
  private static getBaseUrl(proxyUrl: string | null): string {
    if (proxyUrl === 'NONE') return 'https://generativelanguage.googleapis.com';
    if (!proxyUrl || proxyUrl === 'BUILTIN' || proxyUrl.trim() === '') return BUILTIN_PROXY;
    return proxyUrl.replace(/\/$/, '');
  }

  static async sendMessage(apiKey: string, proxyUrl: string | null, messages: {role: string, content: string, imageUri?: string, audioUri?: string}[]): Promise<string | null> {
    const { isPro, isProPlus, isTrialActive } = useAuthStore.getState();
    const finalApiKey = (!apiKey || apiKey.trim() === '') ? PRO_GEMINI_KEY : apiKey.trim();

    const baseUrl = this.getBaseUrl(proxyUrl);
    const url = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${finalApiKey}`;
    
    // Google Gemini API strictly requires that the first message is 'user' and not empty
    let validMessages = messages.filter(m => (m.content && m.content.trim()) || m.imageUri || m.audioUri);
    while (validMessages.length > 0 && (validMessages[0].role === 'assistant' || validMessages[0].role === 'model')) {
      validMessages.shift();
    }
    if (validMessages.length === 0) {
      validMessages = [{ role: 'user', content: 'Привет' }];
    }

    const geminiContents = await Promise.all(validMessages.map(async msg => {
      const parts: any[] = [];
      if (msg.content) parts.push({ text: msg.content });
      else parts.push({ text: "Посмотри на это" });

      if (msg.imageUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(msg.imageUri, { encoding: FileSystem.EncodingType.Base64 });
          parts.push({
            inlineData: { data: base64, mimeType: 'image/jpeg' }
          });
        } catch (e) { console.warn("Could not read image", e); }
      }
      
      if (msg.audioUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(msg.audioUri, { encoding: FileSystem.EncodingType.Base64 });
          parts.push({
            inlineData: { data: base64, mimeType: 'audio/m4a' }
          });
        } catch (e) { console.warn("Could not read audio", e); }
      }

      return {
        role: (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user',
        parts
      };
    }));

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: geminiContents })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Error (${GEMINI_MODEL}): ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e: any) {
      console.error('Failed to send message to Gemini:', e);
      throw new Error(e.message || 'Не удалось получить ответ от Gemini');
    }
  }

  static async analyzeNote(apiKey: string, proxyUrl: string | null, noteText: string, audioUri?: string | null): Promise<{summary: string, reminderDate: string | null, tags: string[], transcription?: string} | null> {
    const isProPlus = useAuthStore.getState().isProPlus;
    const finalApiKey = (isProPlus && (!apiKey || apiKey.trim() === '')) ? PRO_GEMINI_KEY : (apiKey || '');

    const baseUrl = this.getBaseUrl(proxyUrl);
    const url = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${finalApiKey}`;

    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const pad = (num: number) => String(num).padStart(2, '0');
    const offsetString = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    const localTime = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + offsetString;

    const prompt = `Проанализируй текст заметки. Выдели из текста информацию о дате/времени напоминания, если она есть, и извлеки 1-3 смысловых тега (одно слово каждый).
ВАЖНОЕ ПРАВИЛО ДЛЯ ДНЕЙ РОЖДЕНИЯ: Если в тексте упоминается чей-то день рождения (или юбилей), обязательно установи время напоминания (reminderDate) строго на 09:00 утра в этот день рождения.
${audioUri ? 'К заметке прикреплено аудио-сообщение (голосовая заметка). Пожалуйста, сделай его полную транскрипцию (расшифруй голос в текст) и верни в поле "transcription". Если текста заметки нет, сделай саммари и теги на основе этого аудио.' : ''}
Верни строго один JSON объект без форматирования markdown (без блоков \`\`\`json).
Формат: {"summary": "Краткое содержание (1-2 предложения)", "reminderDate": "дата в формате ISO8601 с учетом часового пояса (например, 2026-08-05T09:00:00${offsetString}) (или null, если даты нет)", "tags": ["тег1", "тег2"]${audioUri ? ', "transcription": "Полный текст голосового сообщения"' : ''}}
ВНИМАНИЕ: Обязательно возвращай время с правильным смещением часового пояса (${offsetString}). Если пользователь пишет "через 2 часа", прибавь 2 часа к текущему времени. Если "завтра", прибавь 1 день.
Текущая дата и время на устройстве пользователя: ${localTime}
Текст заметки: ${noteText}`;

    const parts: any[] = [{ text: prompt }];
    if (audioUri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
        parts.push({
          inlineData: { data: base64, mimeType: 'audio/m4a' }
        });
      } catch (e) {
        console.warn("Could not read audio for analyzeNote", e);
      }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Error (${GEMINI_MODEL}): ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      let contentText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      const jsonStr = contentText.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonStr);
      
      return {
        summary: result.summary,
        reminderDate: result.reminderDate,
        tags: result.tags || [],
        transcription: result.transcription
      };
    } catch (e: any) {
      console.error('Failed to analyze note with Gemini:', e);
      throw new Error(e.message || 'Не удалось проанализировать заметку');
    }
  }
}
