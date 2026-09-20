import * as FileSystem from 'expo-file-system';

export class GoogleDriveService {
  private static readonly FILE_NAME = 'smartnotes_backup.json';

  static async getFreshToken(fallbackToken: string): Promise<string> {
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      if (GoogleSignin) {
        const tokens = await GoogleSignin.getTokens();
        if (tokens?.accessToken) {
          const { useSettingsStore } = require('../store/useSettingsStore');
          useSettingsStore.getState().setGoogleToken(tokens.accessToken);
          return tokens.accessToken;
        }
      }
    } catch (e) {
      console.warn('GoogleDriveService getFreshToken error:', e);
    }
    return fallbackToken;
  }

  static async uploadBackup(accessToken: string, jsonData: string): Promise<boolean> {
    try {
      const token = await this.getFreshToken(accessToken);
      const existingFileId = await this.findBackupFileId(token);

      // Защита: не перезаписывать существующую копию пустым списком заметок
      if (existingFileId && (jsonData.trim() === '[]' || jsonData.trim() === '')) {
        console.warn('Safety guard: skipping upload of empty notes list over existing Google Drive backup');
        return true;
      }

      const metadata = {
        name: this.FILE_NAME,
        mimeType: 'application/json',
      };

      const boundary = 'foo_bar_baz';
      const body = 
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${jsonData}\r\n` +
        `--${boundary}--`;

      const method = existingFileId ? 'PATCH' : 'POST';
      const url = existingFileId 
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Drive Upload Error:', response.status, errorText);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Failed to upload backup to Google Drive', e);
      return false;
    }
  }

  static async restoreBackup(accessToken: string): Promise<{ data: any | null; error?: string } | any> {
    try {
      const token = await this.getFreshToken(accessToken);
      const fileIdResult = await this.findBackupFileIdWithStatus(token);

      if (fileIdResult.status === 401) {
        return { data: null, error: 'AUTH_EXPIRED' };
      }
      if (!fileIdResult.fileId) {
        return { data: null, error: 'NOT_FOUND' };
      }

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdResult.fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        return { data: null, error: 'AUTH_EXPIRED' };
      }

      if (!response.ok) {
        return { data: null, error: 'FETCH_FAILED' };
      }
      
      const data = await response.json();
      return { data, error: undefined };
    } catch (e) {
      console.error('Failed to restore backup from Google Drive', e);
      return { data: null, error: 'NETWORK_ERROR' };
    }
  }

  private static async findBackupFileIdWithStatus(accessToken: string): Promise<{ fileId: string | null; status?: number }> {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${this.FILE_NAME}' and trashed=false&spaces=drive`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (response.status === 401) {
        return { fileId: null, status: 401 };
      }
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        return { fileId: data.files[0].id, status: response.status };
      }
      return { fileId: null, status: response.status };
    } catch (e) {
      return { fileId: null };
    }
  }

  private static async findBackupFileId(accessToken: string): Promise<string | null> {
    const res = await this.findBackupFileIdWithStatus(accessToken);
    return res.fileId;
  }

  static async findOrCreateAttachmentsFolder(accessToken: string): Promise<string | null> {
    const folderName = 'SmartNotes Attachments';
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
      
      const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });
      const createData = await createResponse.json();
      return createData.id || null;
    } catch (e) {
      console.error('Failed to create attachments folder', e);
      return null;
    }
  }

  static async uploadAttachment(accessToken: string, fileUri: string, fileName: string, mimeType: string): Promise<string | null> {
    try {
      const folderId = await this.findOrCreateAttachmentsFolder(accessToken);
      if (!folderId) throw new Error("No folder id");

      const initResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: fileName,
          parents: [folderId],
        }),
      });

      if (!initResponse.ok) throw new Error("Failed to init resumable upload");
      const location = initResponse.headers.get('Location');
      if (!location) throw new Error("No location header");

      const uploadResult = await FileSystem.uploadAsync(location, fileUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });

      if (uploadResult.status === 200 || uploadResult.status === 201) {
        const data = JSON.parse(uploadResult.body);
        return data.id;
      }
      return null;
    } catch (e) {
      console.error('Failed to upload attachment', e);
      return null;
    }
  }

  static async downloadAttachment(accessToken: string, fileId: string, destFileName: string): Promise<string | null> {
    try {
      const destUri = FileSystem.documentDirectory + destFileName;
      const downloadResult = await FileSystem.downloadAsync(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        destUri,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (downloadResult.status === 200) {
        return downloadResult.uri;
      }
      return null;
    } catch (e) {
      console.error('Failed to download attachment', e);
      return null;
    }
  }
}
