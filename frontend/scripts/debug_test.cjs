const { chromium } = require('playwright');
const path = require('path');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER PAGE ERROR:', err.message));

  console.log('Navigating to http://127.0.0.1:5173/#/dashboard ...');
  await page.goto('http://127.0.0.1:5173/#/dashboard', { waitUntil: 'networkidle' });

  console.log('Current URL:', page.url());
  const hasLogin = await page.$('input[type="password"]');
  console.log('Has password field:', !!hasLogin);

  if (hasLogin) {
    console.log('Filling login form...');
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    console.log('Submitting...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('URL after submit:', page.url());
  }

  console.log('Waiting for live data to load (waiting for .executive-overview-page)...');
  try {
    await page.waitForSelector('.executive-overview-page', { timeout: 45000 });
    console.log('SUCCESS: .executive-overview-page is visible!');
  } catch (e) {
    console.log('Timeout waiting for .executive-overview-page. Checking what is currently visible...');
    const emptyState = await page.$('.live-empty-state');
    if (emptyState) {
      console.log('Empty state text:', await emptyState.innerText());
    }
  }

  const overview = await page.$('.executive-overview-page');
  console.log('Has .executive-overview-page:', !!overview);

  await page.screenshot({ path: path.join(__dirname, 'debug_screen.png') });
  console.log('Screenshot saved to debug_screen.png');

  await browser.close();
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
