import * as FileSystem from 'expo-file-system';

export class OpenRouterService {
  static async sendMessage(apiKey: string, proxyUrl: string | null, messages: {role: string, content: string, imageUri?: string, audioUri?: string}[]): Promise<string | null> {
    const openRouterMessages = await Promise.all(messages.map(async msg => {
      const content: any[] = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      else content.push({ type: 'text', text: 'Посмотри на это' });

      if (msg.imageUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(msg.imageUri, { encoding: FileSystem.EncodingType.Base64 });
          content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
        } catch (e) {}
      }

      if (msg.audioUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(msg.audioUri, { encoding: FileSystem.EncodingType.Base64 });
          content.push({ type: 'input_audio', input_audio: { data: base64, format: 'm4a' } });
        } catch (e) {}
      }

      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content
      };
    }));

    try {
      let baseUrl = 'https://smartnotes-backend-two.vercel.app/api/proxy/openrouter/v1/chat/completions';
      if (proxyUrl && proxyUrl !== 'NONE' && proxyUrl !== 'BUILTIN' && proxyUrl.trim() !== '' && !proxyUrl.includes('/api/proxy/gemini')) {
        baseUrl = proxyUrl.replace(/\/$/, '');
        if (!baseUrl.includes('/chat/completions')) {
          baseUrl += '/v1/chat/completions';
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://smartnotes-ai.ru', 
        'X-Title': 'SmartNotes AI', 
      };
      if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'google/gemini-3.7-flash',
          messages: openRouterMessages,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e: any) {
      console.error('Failed to send message to OpenRouter:', e);
      throw new Error(e.message || 'Unknown network error');
    }
  }

  static async analyzeNote(apiKey: string, proxyUrl: string | null, noteText: string, audioUri?: string | null): Promise<{summary: string, reminderDate: string | null, tags: string[], transcription?: string} | null> {
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const pad = (num: number) => String(num).padStart(2, '0');
    const offsetString = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    const localTime = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + offsetString;

    const prompt = `Ты ИИ-помощник для приложения заметок. Твоя задача проанализировать заметку и вернуть ТОЛЬКО валидный JSON (без лишних слов и без разметки markdown), который содержит:
1. "summary" - краткая выжимка (1-2 предложения)
2. "reminderDate" - если в тексте есть упоминание времени или даты для напоминания, верни дату в формате ISO8601 (например, 2026-08-05T09:00:00${offsetString}). Если даты нет, верни null.
3. "tags" - массив из 1-3 подходящих тегов (слов).
${audioUri ? '4. "transcription" - полная текстовая расшифровка прикрепленного голосового сообщения.' : ''}

ОБЯЗАТЕЛЬНО: Верни просто строку JSON без \`\`\`json.
Пример: {"summary": "Кратко о главном.", "reminderDate": null, "tags": ["Работа"]${audioUri ? ', "transcription": "Полный текст из аудио"' : ''}}
ВНИМАНИЕ: Обязательно возвращай время с правильным смещением часового пояса (${offsetString}). Если пользователь пишет "через 2 часа", прибавь 2 часа к текущему времени. Если "завтра", прибавь 1 день.
Текущая дата и время на устройстве пользователя: ${localTime}

Текст заметки:
${noteText}`;

    const content: any[] = [{ type: 'text', text: prompt }];
    if (audioUri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
        content.push({ type: 'input_audio', input_audio: { data: base64, format: 'm4a' } });
      } catch (e) {}
    }

    try {
      let baseUrl = 'https://smartnotes-backend-two.vercel.app/api/proxy/openrouter/v1/chat/completions';
      if (proxyUrl && proxyUrl !== 'NONE' && proxyUrl !== 'BUILTIN' && proxyUrl.trim() !== '' && !proxyUrl.includes('/api/proxy/gemini')) {
        baseUrl = proxyUrl.replace(/\/$/, '');
        if (!baseUrl.includes('/chat/completions')) {
          baseUrl += '/v1/chat/completions';
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://smartnotes-ai.ru', 
        'X-Title': 'SmartNotes AI', 
      };
      if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'google/gemini-3.7-flash',
          messages: [{ role: 'user', content }],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      let contentText = data.choices?.[0]?.message?.content || '';
      
      const jsonStr = contentText.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonStr);
      
      return {
        summary: result.summary || 'Без названия',
        reminderDate: result.reminderDate || null,
        tags: Array.isArray(result.tags) ? result.tags : [],
        transcription: result.transcription
      };
    } catch (e: any) {
      console.error('Failed to analyze note with OpenRouter:', e);
      throw new Error(e.message || 'Unknown network error');
    }
  }
}
