import * as FileSystem from 'expo-file-system';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { API_URL } from '../config';

const PRO_GEMINI_KEY = 'BUILTIN';
const BUILTIN_PROXY = `${API_URL}/api/proxy/gemini`;

export class GeminiService {
  private static getBaseUrl(proxyUrl: string | null): string {
    if (proxyUrl === 'NONE') return 'https://generativelanguage.googleapis.com';
    if (!proxyUrl || proxyUrl === 'BUILTIN' || proxyUrl.trim() === '') return BUILTIN_PROXY;
    return proxyUrl.replace(/\/$/, '');
  }

  private static getModel(): string {
    return useSettingsStore.getState().selectedGeminiModel || 'gemini-2.5-flash';
  }

  static async sendMessage(apiKey: string, proxyUrl: string | null, messages: {role: string, content: string, imageUri?: string, audioUri?: string}[]): Promise<string | null> {
    const { isPro, isProPlus, isTrialActive } = useAuthStore.getState();
    const finalApiKey = (!apiKey || apiKey.trim() === '') ? PRO_GEMINI_KEY : apiKey.trim();

    const model = this.getModel();
    const baseUrl = this.getBaseUrl(proxyUrl);
    const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${finalApiKey}`;
    
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
        throw new Error(`Gemini Error (${model}): ${response.status} - ${errorText}`);
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

    const model = this.getModel();
    const baseUrl = this.getBaseUrl(proxyUrl);
    const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${finalApiKey}`;

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
        throw new Error(`Gemini Error (${model}): ${response.status} - ${errorText}`);
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

  static async transcribeAudio(apiKey: string, proxyUrl: string | null, audioBase64: string, mimeType: string = 'audio/webm'): Promise<string | null> {
    const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim();
    const promptText = "Расшифруй эту аудиозапись речи в текст на языке оригинала слово в слово. Выведи ТОЛЬКО расшифрованный текст без кавычек, вводных слов, пояснений и комментариев. Если на записи тишина или нет слов, верни пустую строку.";

    // 1. Direct OpenRouter with Google Gemini 2.5 Flash
    try {
      const openRouterKey = typeof atob !== 'undefined'
        ? atob('c2stb3ItdjEtOTU1NjRjNzIxNWFlZDkzZjY4NGQ3ZTBiNjRkZjNlNGE0NzE4YzdlODEzNWNlMTA5OTRkNjg1ZGZhNjVkZDQ5Nw==')
        : 'BUILTIN';
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://smartnotes-ai.ru",
          "X-Title": "SmartNotes AI"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: promptText },
              { type: "image_url", image_url: { url: `data:${cleanMime};base64,${audioBase64}` } }
            ]
          }],
          temperature: 0.1
        })
      });

      if (response.ok) {
        const data = await response.json();
        const transcription = data?.choices?.[0]?.message?.content?.trim();
        if (transcription) return transcription;
      }
    } catch (openRouterErr) {
      console.warn("OpenRouter direct transcription error:", openRouterErr);
    }

    // 2. Fallback to Gemini proxy
    try {
      const isProPlus = useAuthStore.getState().isProPlus;
      const finalApiKey = (isProPlus && (!apiKey || apiKey.trim() === '')) ? PRO_GEMINI_KEY : (apiKey || PRO_GEMINI_KEY);
      const model = this.getModel();
      const baseUrl = this.getBaseUrl(proxyUrl);
      const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${finalApiKey}`;
      const payload = {
        contents: [{
          role: 'user',
          parts: [
            { text: promptText },
            { inlineData: { data: audioBase64, mimeType: cleanMime } }
          ]
        }]
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const data = await response.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      }
    } catch (geminiErr) {
      console.warn("Gemini transcription fallback error:", geminiErr);
    }

    return null;
  }
}
