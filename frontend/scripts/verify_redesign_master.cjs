const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Preet Jaiswal\\.gemini\\antigravity\\brain\\11796991-0774-4f24-81d5-9c7e5fc9005e';

async function run() {
  console.log('--- STARTING MASTER REDESIGN PLAYWRIGHT AUDIT ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  console.log('Navigating to http://127.0.0.1:5173/#/dashboard ...');
  await page.goto('http://127.0.0.1:5173/#/dashboard', { waitUntil: 'networkidle' });

  // Wait for either login form or executive overview page to mount
  console.log('Waiting for authentication or dashboard...');
  await page.waitForSelector('input[type="password"], .executive-overview-page', { timeout: 20000 });
  const isLoginForm = await page.$('input[type="password"]');

  if (isLoginForm) {
    console.log('Logging in as plant lead...');
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    await page.click('button[type="submit"]');
    console.log('Submitted login credentials. Waiting for live data...');
  }

  await page.waitForSelector('.executive-overview-page', { timeout: 90000 });
  console.log('Executive Overview dashboard is ready!');
  await page.waitForTimeout(1000);

  // Pause carousel immediately and stay on Slide 1
  const pauseBtn = await page.$('.dashboard-carousel__play-toggle');
  if (pauseBtn) {
    await page.evaluate(el => el.click(), pauseBtn);
    await page.waitForTimeout(300);
  }

  const slide1Dot = await page.$('button[aria-label*="slide 1:"]');
  if (slide1Dot) {
    await page.evaluate(el => el.click(), slide1Dot);
    await page.waitForTimeout(500);
  }

  const viewports = [
    { name: 'desktop_1920', width: 1920, height: 1080 },
    { name: 'desktop_1440', width: 1440, height: 900 },
    { name: 'tablet_1024', width: 1024, height: 768 },
    { name: 'tablet_768', width: 768, height: 1024 },
    { name: 'mobile_390', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(1200);

    // Check horizontal overflow
    const overflowX = await page.evaluate(() => {
      const docEl = document.documentElement;
      return {
        docScrollWidth: docEl.scrollWidth,
        docClientWidth: docEl.clientWidth,
        hasOverflow: docEl.scrollWidth > docEl.clientWidth + 2,
      };
    });
    console.log(`  Horizontal Overflow Status:`, overflowX.hasOverflow ? `FAIL - OVERFLOW DETECTED (${overflowX.docScrollWidth} > ${overflowX.docClientWidth})` : 'PASS - ZERO OVERFLOW');

    // Check key DOM landmarks
    const header = await page.$('.exec-header');
    const logo = await page.$('.exec-header__logo');
    const liveStatus = await page.$('.live-status-strip');
    const filterGrid = await page.$('.filter-grid');
    const kpiCards = await page.$$('.carousel-kpi-card');
    const targetActualCards = await page.$$('.target-actual-card');
    const lowerRow = await page.$('.exec-bottom-row');
    const machineTable = await page.$('.exec-machine-table');

    console.log(`  Found Elements:`);
    console.log(`    Header: ${!!header}`);
    console.log(`    Logo: ${!!logo}`);
    console.log(`    Live Status Card: ${!!liveStatus}`);
    console.log(`    Filter Grid: ${!!filterGrid}`);
    console.log(`    KPI Cards Count: ${kpiCards.length} (Expected 6)`);
    console.log(`    Target vs Actual Cards: ${targetActualCards.length} (Expected 4)`);
    console.log(`    Lower Analytics Row: ${!!lowerRow}`);
    console.log(`    Machine Performance Table: ${!!machineTable}`);

    // Take screenshot of viewport
    const shotPath = path.join(ARTIFACT_DIR, `master_redesign_${vp.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`  Saved screenshot: ${shotPath}`);

    // If desktop 1440, test Modal Table
    if (vp.name === 'desktop_1440') {
      console.log('  Testing View Data Table modal...');
      const tableBtn = await page.$('.unified-ta-table-btn');
      if (tableBtn) {
        await tableBtn.click();
        await page.waitForTimeout(600);
        const modal = await page.$('.period-data-table-modal');
        console.log(`    Modal Open: ${!!modal}`);
        if (modal) {
          const modalShot = path.join(ARTIFACT_DIR, 'master_redesign_modal_table.png');
          await page.screenshot({ path: modalShot, fullPage: false });
          console.log(`    Saved modal screenshot: ${modalShot}`);
          const closeBtn = await page.$('.modal-close-btn');
          if (closeBtn) await closeBtn.click();
          await page.waitForTimeout(400);
          console.log('    Modal closed successfully');
        }
      }
    }
  }

  await browser.close();
  console.log('\n--- MASTER REDESIGN PLAYWRIGHT AUDIT COMPLETE ---');
}

run().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
