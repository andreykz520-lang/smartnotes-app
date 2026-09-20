import * as Crypto from 'expo-crypto';
import { API_URL } from '../config';
import { useSettingsStore } from '../store/useSettingsStore';

// In-memory token cache
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export class GigaChatService {
  private static getModel(): string {
    return useSettingsStore.getState().selectedGigaChatModel || 'GigaChat';
  }

  /**
   * Получение токена доступа.
   * Кэширует токен до его истечения (GigaChat токены обычно живут 30 минут).
   */
  static async getAccessToken(authKey: string): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiresAt) {
      return cachedToken;
    }

    let cleanKey = authKey.trim();
    if (cleanKey.toLowerCase().startsWith('basic ')) {
      cleanKey = cleanKey.slice(6).trim();
    }

    const rqUid = Crypto.randomUUID();
    
    try {
      let response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'RqUID': rqUid,
          'Authorization': `Basic ${cleanKey}`
        },
        body: 'scope=GIGACHAT_API_PERS'
      });

      if (!response.ok) {
        const retryRes = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'RqUID': Crypto.randomUUID(),
            'Authorization': `Basic ${cleanKey}`
          },
          body: 'scope=GIGACHAT_API_CORP'
        });
        if (retryRes.ok) response = retryRes;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Auth Error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      cachedToken = data.access_token;
      tokenExpiresAt = data.expires_at; // unix time ms
      return cachedToken!;
    } catch (e: any) {
      console.error('Failed to get GigaChat token:', e);
      throw new Error(e.message || 'Ошибка получения токена GigaChat.');
    }
  }

  static async sendMessage(authKey: string, messages: {role: string, content: string}[]): Promise<string | null> {
    const model = this.getModel();
    const gigaMessages = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content || '...'
    }));

    // Сначала пробуем через серверный прокси
    try {
      const proxyRes = await fetch(`${API_URL}/api/proxy/gigachat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey, model, messages: gigaMessages })
      });
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData?.choices?.[0]?.message?.content) {
          return proxyData.choices[0].message.content;
        }
      }
    } catch (proxyErr: any) {
      console.warn('GigaChat proxy fallback to direct call:', proxyErr);
    }

    // Если прокси не вернул ответ, работаем напрямую со Сбером (как в Автомеханике)
    const token = await this.getAccessToken(authKey);

    try {
      const response = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: model,
          messages: gigaMessages,
          temperature: 0.7,
          top_p: 0.1,
          n: 1,
          stream: false,
          max_tokens: 1024,
          repetition_penalty: 1,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GigaChat Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e: any) {
      console.error('Failed to send message to GigaChat:', e);
      throw new Error(e.message || 'Unknown network error');
    }
  }

  static async analyzeNote(authKey: string, noteText: string): Promise<{summary: string, reminderDate: string | null, tags: string[], transcription?: string} | null> {
    const model = this.getModel();
    const token = await this.getAccessToken(authKey).catch(() => null);

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

ОБЯЗАТЕЛЬНО: Верни просто строку JSON без \`\`\`json.
Пример: {"summary": "Кратко о главном.", "reminderDate": null, "tags": ["Работа"]}
ВНИМАНИЕ: Обязательно возвращай время с правильным смещением часового пояса (${offsetString}). Если пользователь пишет "через 2 часа", прибавь 2 часа к текущему времени. Если "завтра", прибавь 1 день.
Текущая дата и время на устройстве пользователя: ${localTime}

Текст заметки:
${noteText}`;

    // Сначала пробуем через серверный прокси (обход SSL сертификатов Минцифры)
    try {
      const proxyRes = await fetch(`${API_URL}/api/proxy/gigachat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authKey,
          model,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        const contentText = proxyData?.choices?.[0]?.message?.content || '';
        if (contentText) {
          const jsonStr = contentText.replace(/```json/g, '').replace(/```/g, '').trim();
          const result = JSON.parse(jsonStr);
          return {
            summary: result.summary || 'Без названия',
            reminderDate: result.reminderDate || null,
            tags: Array.isArray(result.tags) ? result.tags : [],
          };
        }
      }
    } catch (proxyErr) {
      console.warn('GigaChat analyze proxy fallback:', proxyErr);
    }

    if (!token) {
      throw new Error('Не удалось подключиться к GigaChat');
    }

    try {
      const response = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 1024,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GigaChat Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      let contentText = data.choices?.[0]?.message?.content || '';
      
      const jsonStr = contentText.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonStr);
      
      return {
        summary: result.summary || 'Без названия',
        reminderDate: result.reminderDate || null,
        tags: Array.isArray(result.tags) ? result.tags : [],
      };
    } catch (e: any) {
      console.error('Failed to analyze note with GigaChat:', e);
      throw new Error(e.message || 'Unknown network error');
    }
  }
}
