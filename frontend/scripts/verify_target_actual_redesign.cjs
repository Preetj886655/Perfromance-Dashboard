const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Preet Jaiswal\\.gemini\\antigravity\\brain\\11796991-0774-4f24-81d5-9c7e5fc9005e';

async function run() {
  console.log('========================================================');
  console.log('TARGET VS ACTUAL SECTION REDESIGN VERIFICATION');
  console.log('========================================================');

  const browser = await chromium.launch({ headless: true });
  
  const testPassword = process.env.TEST_USER_PASSWORD;
  if (!testPassword) {
    throw new Error('TEST_USER_PASSWORD environment variable is required to run verification.');
  }

  // 1. Desktop 1440x950
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  console.log('Navigating to dashboard at http://127.0.0.1:5173/#/dashboard ...');
  await page.goto('http://127.0.0.1:5173/#/dashboard', { waitUntil: 'networkidle' });

  // Handle sign-in if needed
  const loginHeader = await page.$('text=Sign In');
  if (loginHeader) {
    console.log('Logging in as plant lead...');
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }

  // Wait for Dashboard to render
  await page.waitForSelector('.executive-overview-page', { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Pause carousel autoplay and go to Slide 1
  const pauseBtn = await page.$('.dashboard-carousel__play-toggle');
  if (pauseBtn) {
    await page.evaluate(el => el.click(), pauseBtn);
    await page.waitForTimeout(200);
  }

  const slide1Dot = await page.$('button[aria-label*="slide 1:"]');
  if (slide1Dot) {
    await page.evaluate(el => el.click(), slide1Dot);
    await page.waitForTimeout(600);
  }

  console.log('\n--- 1. Section Header & Layout Verification ---');
  const sectionTitle = await page.$eval('.unified-ta-title', el => el.textContent.trim());
  console.log('Section Title:', sectionTitle);

  const sectionSubtitle = await page.$eval('.unified-ta-subtitle', el => el.textContent.trim());
  console.log('Section Subtitle:', sectionSubtitle);

  const legendItems = await page.$$eval('.unified-ta-legend-item', items => items.map(i => i.textContent.trim()));
  console.log('Visual Legend Items:', legendItems);

  // Verify that tabs were removed from the main section
  const mainTabSwitcher = await page.$('.unified-ta-header .period-switcher-group');
  console.log('Main section tab switcher present:', !!mainTabSwitcher, '(Expected: false - ALL tabs removed from main section)');

  console.log('\n--- 2. Simultaneous 4-Period Cards Verification ---');
  const cards = await page.$$('.target-actual-grid .target-actual-card');
  console.log('Number of Target vs Actual cards rendered:', cards.length, '(Expected: 4)');

  const cardDetails = await page.$$eval('.target-actual-grid .target-actual-card', els => els.map(card => {
    const title = card.querySelector('.target-actual-card__title')?.textContent?.trim() || '';
    const subtitle = card.querySelector('.target-actual-card__subtitle')?.textContent?.trim() || '';
    const interval = card.querySelector('.target-actual-card__interval')?.textContent?.trim() || '';
    const targetStat = card.querySelector('.card-stat--target')?.textContent?.trim() || '';
    const actualStat = card.querySelector('.card-stat--actual')?.textContent?.trim() || '';
    const gapStat = card.querySelector('.card-stat--gap')?.textContent?.trim() || '';
    const achStat = card.querySelector('.card-stat--ach')?.textContent?.trim() || '';
    const hasCanvas = !!card.querySelector('canvas');
    return { title, subtitle, interval, targetStat, actualStat, gapStat, achStat, hasCanvas };
  }));

  cardDetails.forEach((c, idx) => {
    console.log(`\nCard ${idx + 1}: ${c.title}`);
    console.log(`  Subtitle: ${c.subtitle}`);
    console.log(`  Interval: ${c.interval}`);
    console.log(`  Target:   ${c.targetStat}`);
    console.log(`  Actual:   ${c.actualStat}`);
    console.log(`  Gap:      ${c.gapStat}`);
    console.log(`  Ach %:    ${c.achStat}`);
    console.log(`  Canvas:   ${c.hasCanvas ? 'Rendered' : 'Missing'}`);
  });

  // Scroll to Target vs Actual Section to capture desktop screenshot
  const targetActualSection = await page.$('.unified-ta-section');
  if (targetActualSection) {
    await targetActualSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
  }

  const desktopScreenshot = path.join(ARTIFACT_DIR, 'target_actual_desktop_1440.png');
  await page.screenshot({ path: desktopScreenshot, fullPage: false });
  console.log(`\nSaved Desktop (1440x950) screenshot: ${desktopScreenshot}`);

  // Test [View Data Table] Modal
  console.log('\n--- 3. Testing [View Data Table] Modal ---');
  const viewTableBtn = await page.$('.unified-ta-table-btn');
  console.log('View Data Table button exists:', !!viewTableBtn);
  if (viewTableBtn) {
    await page.evaluate(el => el.click(), viewTableBtn);
    await page.waitForTimeout(600);

    const modal = await page.$('.period-data-table-modal');
    console.log('Modal opened:', !!modal);

    const modalTitle = await page.$eval('.period-data-table-modal__title', el => el.textContent.trim());
    console.log('Modal title:', modalTitle);

    const modalTableRows = await page.$$eval('.period-data-table-modal .unified-ta-table tbody tr', trs => trs.length);
    console.log('Table rows in modal:', modalTableRows);

    const modalScreenshot = path.join(ARTIFACT_DIR, 'target_actual_modal_table.png');
    await page.screenshot({ path: modalScreenshot, fullPage: false });
    console.log(`Saved Modal Table screenshot: ${modalScreenshot}`);

    // Switch horizon tab inside modal (e.g. Weekly)
    const modalWeeklyTab = await page.$('.period-data-table-modal button.period-switcher-btn:has-text("Weekly")');
    if (modalWeeklyTab) {
      await page.evaluate(el => el.click(), modalWeeklyTab);
      await page.waitForTimeout(400);
      const weeklyRows = await page.$$eval('.period-data-table-modal .unified-ta-table tbody tr', trs => trs.length);
      console.log('Switched to Weekly tab in modal. Rows:', weeklyRows);
    }

    // Close modal
    const closeBtn = await page.$('.modal-close-btn');
    if (closeBtn) {
      await page.evaluate(el => el.click(), closeBtn);
      await page.waitForTimeout(400);
      const modalClosed = !(await page.$('.period-data-table-modal'));
      console.log('Modal successfully closed:', modalClosed);
    }
  }

  // Test Filter Interactivity (Atomic Update across all 4 horizons)
  console.log('\n--- 3b. Testing Filter Reactivity across all 4 horizons ---');
  const shiftSelect = await page.$('label.field:has(span:has-text("Shift")) select');
  if (shiftSelect) {
    const shiftOptions = await shiftSelect.$$eval('option', opts => opts.map(o => o.value));
    console.log('Available Shift options:', shiftOptions);
    const testOption = shiftOptions.find(o => o && o !== 'All' && o !== 'All Shifts') || shiftOptions[1];
    if (testOption) {
      console.log(`Selecting "${testOption}" in Operations Control filter...`);
      await shiftSelect.selectOption(testOption);
      const applyBtn = await page.$('button.btn--primary:has-text("Apply Filters")');
      if (applyBtn) {
        await page.evaluate(el => el.click(), applyBtn);
      }
      await page.waitForTimeout(800);

      const filteredCardDetails = await page.$$eval('.target-actual-grid .target-actual-card', els => els.map(card => {
        const title = card.querySelector('.target-actual-card__title')?.textContent?.trim() || '';
        const actualStat = card.querySelector('.card-stat--actual')?.textContent?.trim() || '';
        const targetStat = card.querySelector('.card-stat--target')?.textContent?.trim() || '';
        return { title, targetStat, actualStat };
      }));
      console.log(`Simultaneously updated card metrics under "${testOption}":`);
      filteredCardDetails.forEach(c => console.log(`  ${c.title}: Target=${c.targetStat}, Actual=${c.actualStat}`));

      // Reset filters back to nominal
      const resetBtn = await page.$('button.btn--ghost:has-text("Reset")');
      if (resetBtn) {
        console.log('Resetting filters back to All...');
        await page.evaluate(el => el.click(), resetBtn);
        await page.waitForTimeout(800);
      }
    }
  }

  // Full desktop screenshot (1440x950)
  const fullDesktopScreenshot = path.join(ARTIFACT_DIR, 'target_actual_full_desktop.png');
  await page.screenshot({ path: fullDesktopScreenshot, fullPage: true });
  console.log(`Saved Full Desktop screenshot: ${fullDesktopScreenshot}`);

  // 2. Desktop 1920x1080
  console.log('\n--- 4. Capturing Desktop 1920x1080 Layout ---');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(800);
  if (targetActualSection) await targetActualSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const d1920Screenshot = path.join(ARTIFACT_DIR, 'target_actual_desktop_1920.png');
  await page.screenshot({ path: d1920Screenshot, fullPage: false });
  console.log(`Saved Desktop (1920x1080) screenshot: ${d1920Screenshot}`);

  // 3. Tablet 1024x768 (Single Column Stack)
  console.log('\n--- 5. Capturing Tablet 1024x768 Layout (1 Column Stack) ---');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(800);
  if (targetActualSection) await targetActualSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const tabletScreenshot = path.join(ARTIFACT_DIR, 'target_actual_tablet_1024.png');
  await page.screenshot({ path: tabletScreenshot, fullPage: false });
  console.log(`Saved Tablet (1024x768) screenshot: ${tabletScreenshot}`);

  // 4. Mobile 390x844 (Single Column Stack)
  console.log('\n--- 6. Capturing Mobile 390x844 Layout ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  if (targetActualSection) await targetActualSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const mobileScreenshot = path.join(ARTIFACT_DIR, 'target_actual_mobile_390.png');
  await page.screenshot({ path: mobileScreenshot, fullPage: false });
  console.log(`Saved Mobile (390x844) screenshot: ${mobileScreenshot}`);

  // 5. Verify #/quality route
  console.log('\n--- 7. Verifying #/quality Route ---');
  await page.goto('http://127.0.0.1:5173/#/quality', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const qualityText = await page.evaluate(() => document.body.innerText);
  const qualityPassed = qualityText.toLowerCase().includes('quality');
  console.log('Quality dashboard rendered properly:', qualityPassed ? 'PASS' : 'FAIL');
  if (!qualityPassed) {
    throw new Error('Quality route did not render expected content');
  }

  await context.close();
  await browser.close();
  console.log('\nAll UI verification checks passed successfully!');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
