const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  console.log('Navigating to http://localhost:8081...');
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle2' });

  console.log('Clicking on Add Note button...');
  // We need to wait for the plus button to appear
  // It has Ionicons name="add", usually inside a TouchableOpacity
  // Since we don't have testIDs, we can just click the screen roughly where the FAB is, or evaluate a script.
  await page.evaluate(() => {
    // Find all elements and click the one that looks like the FAB
    // The FAB is a div with role="button" or tabIndex="0" with a plus icon
    const buttons = Array.from(document.querySelectorAll('[role="button"], [tabindex="0"]'));
    // The FAB is usually at the bottom right.
    // Let's just click the last button which is often the FAB.
    const fab = buttons[buttons.length - 1];
    if (fab) fab.click();
  });

  await new Promise(r => setTimeout(r, 3000));
  
  await browser.close();
})();
