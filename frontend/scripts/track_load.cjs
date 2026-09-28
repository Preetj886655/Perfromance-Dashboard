const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('Manufacturing') || msg.text().includes('bootstrap')) {
      console.log('CONSOLE:', msg.type(), msg.text());
    }
  });
  page.on('response', res => {
    if (res.url().includes('api/')) {
      console.log(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  console.log('Navigating to http://127.0.0.1:5173/#/dashboard ...');
  await page.goto('http://127.0.0.1:5173/#/dashboard', { waitUntil: 'networkidle' });

  // Ensure login
  const hasLogin = await page.waitForSelector('input[type="password"], .executive-overview-page', { timeout: 15000 });
  const isLoginForm = await page.$('input[type="password"]');
  if (isLoginForm) {
    console.log('Logging in...');
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    await page.click('button[type="submit"]');
    console.log('Submitted login credentials.');
  }

  const start = Date.now();
  console.log('Tracking dashboard render...');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(2000);
    const elapsed = Math.round((Date.now() - start) / 1000);
    const hasOverview = await page.$('.executive-overview-page');
    const hasEmpty = await page.$('.live-empty-state');
    console.log(`[+${elapsed}s] overview:${!!hasOverview} empty:${!!hasEmpty}`);
    if (hasOverview) {
      console.log(`SUCCESS: Dashboard loaded in ${elapsed}s!`);
      break;
    }
  }

  await browser.close();
}

test().catch(console.error);
