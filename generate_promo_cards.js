const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const CARDS = [
  {
    id: 1,
    title: 'Умные заметки с ИИ',
    subtitle: 'Встроенный Gemini 3.7 Flash',
    accentColor: '#10b981',
    accentGlow: 'rgba(16, 185, 129, 0.3)',
    badge: '✨ НОВОЕ ПОКОЛЕНИЕ',
    htmlContent: `
      <div class="phone-frame">
        <div class="phone-header">
          <div class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">Gemini 3.7 Flash</div>
          <div class="time">14:30</div>
        </div>
        <div class="note-card">
          <div class="note-title">План запуска проекта</div>
          <div class="note-tags">
            <span class="tag">#Работа</span>
            <span class="tag">#Бизнес</span>
            <span class="tag tag-ai">🤖 AI Саммари</span>
          </div>
          <div class="note-body">
            Обсудили стратегию развития на 3-й квартал. Главные задачи: запуск мобильной версии и эквайринга.
          </div>
          <div class="ai-box">
            <div class="ai-title">⚡ ИИ Саммари:</div>
            <div class="ai-text">• Подготовка релиза для RuStore<br>• Подключение боевой кассы ЮKassa<br>• Тестирование синхронизации ПК + Android</div>
          </div>
        </div>
      </div>
    `
  },
  {
    id: 2,
    title: 'Голос в Текст',
    subtitle: 'Наговаривайте мысли на ходу',
    accentColor: '#06b6d4',
    accentGlow: 'rgba(6, 182, 212, 0.3)',
    badge: '🎙 РАСПОЗНАВАНИЕ РЕЧИ',
    htmlContent: `
      <div class="phone-frame">
        <div class="voice-card">
          <div class="mic-circle">
            <div class="mic-icon">🎙</div>
            <div class="pulse-wave"></div>
          </div>
          <div class="waveform">
            <div class="bar" style="height: 25px;"></div>
            <div class="bar" style="height: 45px;"></div>
            <div class="bar" style="height: 70px;"></div>
            <div class="bar" style="height: 35px;"></div>
            <div class="bar" style="height: 60px;"></div>
            <div class="bar" style="height: 80px;"></div>
            <div class="bar" style="height: 50px;"></div>
            <div class="bar" style="height: 30px;"></div>
          </div>
          <div class="recording-time">00:42 • Запись аудио</div>
        </div>
        <div class="note-card" style="margin-top: 30px;">
          <div class="note-title">Расшифровка аудио</div>
          <div class="note-body">
            «Купить билеты в командировку на пятницу в 18:00 и подготовить отчет для руководства.»
          </div>
          <div class="ai-box" style="border-left-color: #06b6d4;">
            <div class="ai-title" style="color: #06b6d4;">✓ Голос мгновенно переведён в структурированный текст</div>
          </div>
        </div>
      </div>
    `
  },
  {
    id: 3,
    title: 'Умные Напоминания',
    subtitle: 'ИИ сам находит дату и время в тексте',
    accentColor: '#8b5cf6',
    accentGlow: 'rgba(139, 92, 246, 0.3)',
    badge: '⏰ АВТОМАТИЧЕСКИЙ АНАЛИЗ',
    htmlContent: `
      <div class="phone-frame">
        <div class="reminder-card">
          <div class="reminder-badge">🔔 Напоминание установлено</div>
          <div class="reminder-time">Завтра, 18:00</div>
          <div class="reminder-desc">Встреча по запуску SmartNotes AI</div>
        </div>
        <div class="note-card" style="margin-top: 30px;">
          <div class="note-title">Заметка: Звонок партнерам</div>
          <div class="note-body">
            «Позвонить партнерам завтра в 6 вечера и согласовать финальный договор.»
          </div>
          <div class="ai-box" style="border-left-color: #8b5cf6;">
            <div class="ai-title" style="color: #a78bfa;">🤖 ИИ определил дату:</div>
            <div class="ai-text">Уведомление будет отправлено на телефон и ПК в 18:00</div>
          </div>
        </div>
      </div>
    `
  },
  {
    id: 4,
    title: 'Синхронизация Облака',
    subtitle: 'Ваши заметки на Телефоне и Компьютере',
    accentColor: '#3b82f6',
    accentGlow: 'rgba(59, 130, 246, 0.3)',
    badge: '☁️ ЯНДЕКС ДИСК & GOOGLE ДИСК',
    htmlContent: `
      <div class="sync-container">
        <div class="devices-row">
          <div class="device-box">
            <div class="device-icon">📱</div>
            <div class="device-name">Android</div>
          </div>
          <div class="sync-arrows">⇄</div>
          <div class="cloud-center">
            <div class="cloud-icon">☁️</div>
            <div class="cloud-name">Яндекс Диск</div>
          </div>
          <div class="sync-arrows">⇄</div>
          <div class="device-box">
            <div class="device-icon">💻</div>
            <div class="device-name">Windows</div>
          </div>
        </div>
        <div class="note-card" style="margin-top: 40px;">
          <div class="note-title">Безопасное хранение</div>
          <div class="note-body">
            Все заметки зашифрованы и доступны с любого вашего устройства в реальном времени.
          </div>
        </div>
      </div>
    `
  }
];

function generateHtml(card) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    body {
      width: 1080px;
      height: 1920px;
      background: radial-gradient(circle at 50% 10%, #1e1e38 0%, #0d0e1a 100%);
      color: #ffffff;
      padding: 100px 70px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      overflow: hidden;
      position: relative;
    }
    .header-badge {
      display: inline-block;
      padding: 14px 28px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid ${card.accentColor};
      border-radius: 50px;
      font-size: 24px;
      font-weight: 700;
      color: ${card.accentColor};
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 30px;
      box-shadow: 0 0 30px ${card.accentGlow};
    }
    .main-title {
      font-size: 64px;
      font-weight: 800;
      text-align: center;
      line-height: 1.2;
      margin-bottom: 20px;
      color: #ffffff;
      text-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .main-subtitle {
      font-size: 34px;
      font-weight: 500;
      text-align: center;
      color: #94a3b8;
      margin-bottom: 60px;
    }
    .content-area {
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .phone-frame {
      width: 100%;
      max-width: 860px;
      background: rgba(30, 41, 59, 0.7);
      border: 2px solid rgba(255, 255, 255, 0.12);
      border-radius: 36px;
      padding: 45px;
      backdrop-filter: blur(20px);
      box-shadow: 0 25px 60px rgba(0,0,0,0.6);
    }
    .phone-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
    }
    .badge {
      padding: 8px 18px;
      border-radius: 12px;
      font-size: 22px;
      font-weight: 600;
    }
    .time {
      font-size: 22px;
      color: #64748b;
    }
    .note-card {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 35px;
    }
    .note-title {
      font-size: 38px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 18px;
    }
    .note-tags {
      display: flex;
      gap: 12px;
      margin-bottom: 25px;
    }
    .tag {
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      padding: 6px 16px;
      border-radius: 10px;
      font-size: 20px;
      font-weight: 500;
    }
    .tag-ai {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .note-body {
      font-size: 28px;
      color: #cbd5e1;
      line-height: 1.5;
      margin-bottom: 30px;
    }
    .ai-box {
      background: rgba(15, 23, 42, 0.95);
      border-left: 6px solid ${card.accentColor};
      border-radius: 14px;
      padding: 25px;
    }
    .ai-title {
      font-size: 26px;
      font-weight: 700;
      color: ${card.accentColor};
      margin-bottom: 12px;
    }
    .ai-text {
      font-size: 24px;
      color: #e2e8f0;
      line-height: 1.5;
    }
    .voice-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 30px;
    }
    .mic-circle {
      width: 140px;
      height: 140px;
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 60px;
      box-shadow: 0 0 50px rgba(6, 182, 212, 0.5);
      margin-bottom: 35px;
    }
    .waveform {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 90px;
      margin-bottom: 20px;
    }
    .bar {
      width: 10px;
      background: #06b6d4;
      border-radius: 6px;
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.4);
    }
    .recording-time {
      font-size: 26px;
      color: #94a3b8;
      font-weight: 600;
    }
    .reminder-card {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.1));
      border: 1px solid rgba(139, 92, 246, 0.4);
      border-radius: 24px;
      padding: 35px;
      text-align: center;
    }
    .reminder-badge {
      font-size: 24px;
      font-weight: 700;
      color: #c084fc;
      margin-bottom: 12px;
    }
    .reminder-time {
      font-size: 52px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 12px;
    }
    .reminder-desc {
      font-size: 26px;
      color: #cbd5e1;
    }
    .sync-container {
      width: 100%;
      max-width: 900px;
    }
    .devices-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(30, 41, 59, 0.6);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 30px;
      padding: 35px 40px;
      backdrop-filter: blur(15px);
    }
    .device-box, .cloud-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .device-icon, .cloud-icon {
      font-size: 64px;
    }
    .device-name, .cloud-name {
      font-size: 24px;
      font-weight: 600;
      color: #e2e8f0;
    }
    .sync-arrows {
      font-size: 48px;
      color: #38bdf8;
      font-weight: bold;
    }
    .footer-brand {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-top: 40px;
    }
    .app-name {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 1px;
      background: linear-gradient(90deg, #10b981, #06b6d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
  </style>
</head>
<body>
  <div>
    <div style="text-align: center;">
      <div class="header-badge">${card.badge}</div>
      <div class="main-title">${card.title}</div>
      <div class="main-subtitle">${card.subtitle}</div>
    </div>
  </div>

  <div class="content-area">
    ${card.htmlContent}
  </div>

  <div class="footer-brand">
    <span class="app-name">SmartNotes AI</span>
  </div>
</body>
</html>
  `;
}

app.whenReady().then(async () => {
  const outputDir = path.join('D:', 'SmartNotesApp', 'rustore_promo_cards');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const win = new BrowserWindow({
    width: 1080,
    height: 1920,
    show: false,
    webPreferences: {
      offscreen: true
    }
  });

  win.setContentSize(1080, 1920);

  for (const card of CARDS) {
    const html = generateHtml(card);
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 400));
    const image = await win.webContents.capturePage();
    const filePath = path.join(outputDir, `promo_card_${card.id}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    console.log(`Saved: ${filePath}`);
  }

  console.log('All promo cards created successfully in:', outputDir);
  app.quit();
});
