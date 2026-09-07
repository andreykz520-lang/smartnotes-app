async function fetchFileContent(href: string): Promise<{ text: string | null; error?: string }> {
  // Strategy 1: Local node proxy (completely bypasses Chromium referer checks that caused 403)
  try {
    const proxyUrl = `http://127.0.0.1:38491/api/proxy-download?url=${encodeURIComponent(href)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const text = await proxyRes.text();
      if (text && text.trim().length > 0) {
        return { text };
      }
    }
  } catch (e: any) {
    console.warn('Proxy download error:', e?.message);
  }

  // Strategy 2: Direct fetch with no-referrer
  try {
    const directRes = await fetch(href, { referrerPolicy: 'no-referrer' });
    if (directRes.ok) {
      const text = await directRes.text();
      if (text && text.trim().length > 0) {
        return { text };
      }
    }
  } catch (e: any) {
    console.warn('Direct download error:', e?.message);
  }

  // Strategy 3: Standard fetch
  try {
    const rawRes = await fetch(href);
    if (rawRes.ok) {
      const text = await rawRes.text();
      if (text && text.trim().length > 0) {
        return { text };
      }
    }
  } catch (e: any) {
    return { text: null, error: e?.message };
  }

  return { text: null, error: 'Could not read file body' };
}

export class YandexDiskService {
  static async getUserInfo(token: string): Promise<{ login?: string; displayName?: string } | null> {
    try {
      const res = await fetch('https://cloud-api.yandex.net/v1/disk/', {
        headers: { Authorization: `OAuth ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return {
          login: data?.user?.login,
          displayName: data?.user?.display_name
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  static async uploadBackup(token: string, jsonData: string): Promise<boolean> {
    try {
      const getUploadUrlRes = await fetch(
        'https://cloud-api.yandex.net/v1/disk/resources/upload?path=app:/smart_notes_backup.json&overwrite=true',
        {
          headers: {
            Authorization: `OAuth ${token}`,
          },
        }
      );
      
      if (!getUploadUrlRes.ok) {
        console.error('Failed to get upload URL', await getUploadUrlRes.text());
        return false;
      }
      
      const { href } = await getUploadUrlRes.json();
      
      const uploadRes = await fetch(href, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: jsonData,
      });

      return uploadRes.ok;
    } catch (e) {
      console.error('Backup upload failed', e);
      return false;
    }
  }

  static async downloadBackup(token: string): Promise<{ data: string | null; error?: string; user?: string; foundFiles?: string[] }> {
    try {
      const userInfo = await this.getUserInfo(token);
      const userName = userInfo?.displayName || userInfo?.login || '';

      // 1. Get download URL for app:/smart_notes_backup.json
      const dlRes = await fetch(
        'https://cloud-api.yandex.net/v1/disk/resources/download?path=app:/smart_notes_backup.json',
        {
          headers: { Authorization: `OAuth ${token}` }
        }
      );

      if (dlRes.ok) {
        const dlData = await dlRes.json();
        if (dlData.href) {
          const content = await fetchFileContent(dlData.href);
          if (content.text) {
            return { data: content.text, user: userName };
          }
        }
      }

      // 2. Fallback: Search in app directory
      let foundFiles: string[] = [];
      try {
        const listRes = await fetch('https://cloud-api.yandex.net/v1/disk/resources?path=app:/', {
          headers: { Authorization: `OAuth ${token}` }
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          const items = listData?._embedded?.items || [];
          foundFiles = items.map((i: any) => i.name);
          
          const backupItem = items.find((i: any) => i.name === 'smart_notes_backup.json' || i.name.includes('backup') || i.name.includes('smart_notes'));
          if (backupItem) {
            if (backupItem.file) {
              const fileContent = await fetchFileContent(backupItem.file);
              if (fileContent.text) {
                return { data: fileContent.text, user: userName, foundFiles };
              }
            }

            const itemPath = backupItem.path || `app:/${backupItem.name}`;
            const itemDlRes = await fetch(
              `https://cloud-api.yandex.net/v1/disk/resources/download?path=${encodeURIComponent(itemPath)}`,
              {
                headers: { Authorization: `OAuth ${token}` }
              }
            );
            if (itemDlRes.ok) {
              const itemDlData = await itemDlRes.json();
              if (itemDlData.href) {
                const fileContent = await fetchFileContent(itemDlData.href);
                if (fileContent.text) {
                  return { data: fileContent.text, user: userName, foundFiles };
                }
              }
            }
          }
        }
      } catch (err) {}

      return { data: null, user: userName, foundFiles, error: 'Файл не найден' };
    } catch (e: any) {
      console.error('Backup download failed', e);
      return { data: null, error: e?.message };
    }
  }
}
