const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Preet Jaiswal\\.gemini\\antigravity\\brain\\11796991-0774-4f24-81d5-9c7e5fc9005e';

(async () => {
  console.log('Capturing upgraded Executive Overview Target vs Actual bar graphs...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  const loginHeader = await page.$('text=Sign In');
  if (loginHeader) {
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }

  await page.waitForSelector('.period-analysis-section', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Pause carousel autoplay if active
  const pauseBtn = await page.$('.dashboard-carousel__play-toggle');
  if (pauseBtn) {
    const isPlaying = await pauseBtn.getAttribute('aria-pressed');
    if (isPlaying === 'false' || isPlaying === null) {
      await pauseBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Scroll to period-analysis-section so all 4 bar graphs are clearly visible
  const targetActualSection = await page.$('.period-analysis-section');
  if (targetActualSection) {
    await targetActualSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
  }

  const screenshotPath = path.join(ARTIFACT_DIR, 'executive_overview_improved_bar_graphs.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Saved screenshot to ${screenshotPath}`);

  await browser.close();
})();

