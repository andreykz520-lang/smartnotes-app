const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });
  
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR]: ${err.toString()}`);
  });

  console.log('Navigating to http://localhost:8081...');
  try {
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    console.log('Error navigating:', e);
  }
  
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('Clicking on + button to create a new note...');
  try {
    await page.evaluate(() => {
      // Find the Floating Action Button (FAB)
      // It has a plus icon usually. In HomeScreen: <Ionicons name="add" size={30} color="#fff" />
      // Since it's a TouchableOpacity, it renders as a div with role="button"
      const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
      // Find the one that is absolute positioned or something
      // Let's just click the button that looks like the FAB
      // It has styles.fab: position absolute, right 20, bottom 20
      const fab = buttons.find(b => {
        const style = window.getComputedStyle(b);
        return style.position === 'absolute' && style.bottom === '20px';
      }) || buttons[buttons.length - 1]; // fallback
      
      if (fab) {
        fab.click();
      } else {
        console.log('FAB not found');
      }
    });
    
    await new Promise(r => setTimeout(r, 5000));
  } catch (e) {
    console.log('Error clicking:', e);
  }

  await browser.close();
})();
