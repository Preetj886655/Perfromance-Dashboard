const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'laptop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-landscape-1024x768', width: 1024, height: 768 },
  { name: 'tablet-portrait-768x1024', width: 768, height: 1024 },
  { name: 'mobile-large-480x900', width: 480, height: 900 },
  { name: 'mobile-standard-375x812', width: 375, height: 812 },
];

async function runValidation() {
  console.log('Starting Playwright post-cleanup browser validation...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // 1. Navigate to frontend
  console.log('Navigating to http://127.0.0.1:5173...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  // 2. Perform Login if needed
  const loginHeader = await page.$('text=Sign In');
  if (loginHeader) {
    console.log('Login form found, authenticating as alice@patil.local...');
    await page.fill('input[type="text"], input[name="identifier"], input[placeholder*="email" i], input[placeholder*="employee" i]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(3000);
  }

  // 3. Verify Dashboard Loaded
  const bodyText = await page.textContent('body');
  const hasLive = bodyText.includes('LIVE GOOGLE SHEETS') || bodyText.includes('Live Google Sheets') || bodyText.includes('Connected') || bodyText.includes('connected');
  console.log('Dashboard loaded, Live Google Sheets banner visible:', hasLive);

  // 4. Verify Record Count & Latest Date
  const hasRecords = bodyText.includes('14,720') || bodyText.includes('14720');
  console.log('Live Google Sheets record count (14,720) present:', hasRecords);

  // 5. Test Filter Buttons / Period Selector
  console.log('Testing Period selector buttons (Monthly, Weekly, Quarterly, Yearly)...');
  const periodButtons = ['Monthly', 'Weekly', 'Quarterly', 'Yearly'];
  for (const p of periodButtons) {
    const btn = await page.$(`button:has-text("${p}")`);
    if (btn) {
      await btn.click();
      await page.waitForTimeout(500);
      console.log(`Clicked period button: ${p}`);
    }
  }

  // 6. Test Multi-Viewport Validation
  console.log('\nTesting 7 viewports...');
  const results = {};
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    const isVisible = await page.evaluate(() => {
      const el = document.querySelector('.dashboard-carousel') || document.querySelector('.dashboard-root') || document.querySelector('main');
      return el !== null;
    });

    results[vp.name] = {
      width: vp.width,
      height: vp.height,
      horizontalOverflow: overflow,
      dashboardRendered: isVisible,
    };
    console.log(`  Viewport ${vp.name} (${vp.width}x${vp.height}): rendered=${isVisible}, overflow=${overflow}`);
  }

  await browser.close();

  console.log('\n--- BROWSER VALIDATION SUMMARY ---');
  console.log('Console errors encountered:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => console.log('  ERROR:', e));
  }
  console.log('All Viewports Passed:', Object.values(results).every(r => r.dashboardRendered));
}

runValidation().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});

