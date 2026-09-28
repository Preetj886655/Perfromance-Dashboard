const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173');
  await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
  await page.fill('input[type="password"]', 'Secret123!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.live-google-sheets-section');
  await page.waitForTimeout(3000);
  const text = await page.locator('.live-google-sheets-section').innerText();
  console.log('--- LIVE SECTION INNER TEXT ---');
  console.log(text.slice(0, 1000));
  await browser.close();
})();

