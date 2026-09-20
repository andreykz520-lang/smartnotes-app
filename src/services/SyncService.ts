import { useNoteStore } from '../store/useNoteStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { GoogleDriveService } from './GoogleDriveService';
import { YandexDiskService } from './YandexDiskService';

export class SyncService {
  /**
   * При старте приложения восстанавливает заметки из облака пользователя, если это настроено.
   */
  static async syncNotes() {
    const { isPro } = useAuthStore.getState();
    const { googleToken, yandexToken, isCloudEnabled, isAutoSyncEnabled } = useSettingsStore.getState();
    const { replaceNotes, notes } = useNoteStore.getState();

    if (!isPro || !isCloudEnabled || !isAutoSyncEnabled) return;

    try {
      let cloudData = null;

      // Пытаемся стянуть сначала с Яндекса, если есть токен
      if (yandexToken) {
        cloudData = await YandexDiskService.downloadBackup(yandexToken);
      }
      
      // Если на Яндексе нет, пробуем Гугл
      if (!cloudData && googleToken) {
        cloudData = await GoogleDriveService.restoreBackup(googleToken);
      }

      if (cloudData && typeof cloudData === 'object' && 'data' in cloudData) {
        cloudData = cloudData.data;
      }

      if (cloudData) {
        let parsedNotes = typeof cloudData === 'string' ? JSON.parse(cloudData) : cloudData;
        if (Array.isArray(parsedNotes) && parsedNotes.length > 0) {
          if (parsedNotes.length >= notes.length) {
            replaceNotes(parsedNotes);
          }
        }
      }
    } catch (error) {
      console.error('Personal Cloud Sync failed:', error);
    }
  }
}
