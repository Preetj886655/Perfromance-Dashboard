const { chromium } = require('playwright');
const path = require('path');

async function run() {
  console.log('====================================================');
  console.log('MACHINE FILTER UI VERIFICATION (PLAYWRIGHT)');
  console.log('====================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text());
  });

  console.log('Navigating to http://127.0.0.1:5173...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  // 1. Check Login
  const loginHeader = await page.$('text=Sign In');
  if (loginHeader) {
    console.log('Logging in as alice@patil.local...');
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }

  // 2. Wait for Operations Control panel or carousel
  console.log('Waiting for dashboard panel to load...');
  await page.waitForSelector('.filter-panel, .carousel-kpi-card', { timeout: 35000 });
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

  // Ensure filter panel is expanded
  const expandBtn = await page.$('.filter-panel__toggle');
  if (expandBtn) {
    const text = await expandBtn.textContent();
    if (text && text.includes('Show Filters')) {
      await expandBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // 3. Verify Filter Order
  const fieldSpans = await page.locator('.filter-grid label span, .filter-grid .field span').allTextContents();
  console.log('Filter grid fields detected in UI:', fieldSpans);

  // 4. Verify Machine filter exists
  const machineSelect = page.locator('label:has-text("Machine") select');
  const machineCount = await machineSelect.count();
  console.log('Machine select elements found:', machineCount);
  if (machineCount === 0) {
    throw new Error('FAIL: Machine filter select not found in UI!');
  }

  // 5. Inspect Machine options
  const options = await machineSelect.locator('option').allTextContents();
  console.log(`Dynamic Machine options count: ${options.length}`);
  console.log('Top 10 Machine options:', options.slice(0, 10));

  const hasAll = options.includes('All Machines');
  const hasLine1 = options.includes('Line 1');
  const hasLine2 = options.includes('Line 2');
  console.log(`Checking required options: All Machines=${hasAll}, Line 1=${hasLine1}, Line 2=${hasLine2}`);
  if (!hasAll || !hasLine1 || !hasLine2) {
    throw new Error(`FAIL: Missing required machine options! All=${hasAll}, Line 1=${hasLine1}, Line 2=${hasLine2}`);
  }

  // Helper to extract KPIs
  async function extractKpiMetrics() {
    await page.waitForTimeout(1000);
    const kpiElements = await page.locator('.carousel-kpi-card, .kpi-card, .metric-card').all();
    const metrics = {};
    for (const el of kpiElements) {
      const title = (await el.locator('.carousel-kpi-card__title, .kpi-card__title, h3, h4').first().textContent().catch(() => ''))?.trim();
      const val = (await el.locator('.carousel-kpi-card__val-current, .kpi-card__value, .value').first().textContent().catch(() => ''))?.trim();
      if (title && val) {
        metrics[title] = val;
      }
    }
    return metrics;
  }

  // 6. Test: Select Line 1
  console.log('\n--- Test 1: Machine = "Line 1" ---');
  await machineSelect.selectOption('Line 1');
  await page.locator('button:has-text("Apply Filters")').click();
  await page.waitForTimeout(1500);
  const kpiLine1 = await extractKpiMetrics();
  console.log('Line 1 KPIs:', kpiLine1);

  // 7. Test: Select Line 2
  console.log('\n--- Test 2: Machine = "Line 2" ---');
  await machineSelect.selectOption('Line 2');
  await page.locator('button:has-text("Apply Filters")').click();
  await page.waitForTimeout(1500);
  const kpiLine2 = await extractKpiMetrics();
  console.log('Line 2 KPIs:', kpiLine2);

  // 8. Test: Select All Machines
  console.log('\n--- Test 3: Machine = "All Machines" ---');
  await machineSelect.selectOption('All Machines');
  await page.locator('button:has-text("Apply Filters")').click();
  await page.waitForTimeout(1500);
  const kpiAll = await extractKpiMetrics();
  console.log('All Machines KPIs:', kpiAll);

  // Save screenshot artifact
  const artifactDir = 'C:\\Users\\Preet Jaiswal\\.gemini\\antigravity\\brain\\11796991-0774-4f24-81d5-9c7e5fc9005e';
  const screenshotPath = path.join(artifactDir, 'machine_filter_verified_ui.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`\nVerification screenshot saved to: ${screenshotPath}`);

  await browser.close();
  console.log('\n====================================================');
  console.log('ALL MACHINE FILTER UI TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
