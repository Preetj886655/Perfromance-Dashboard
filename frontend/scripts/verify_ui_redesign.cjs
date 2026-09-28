const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Preet Jaiswal\\.gemini\\antigravity\\brain\\11796991-0774-4f24-81d5-9c7e5fc9005e';

async function run() {
  console.log('Starting comprehensive UI Redesign verification...');
  const browser = await chromium.launch({ headless: true });
  
  // 1. Desktop 1440x950
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  console.log('Navigating to dashboard...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  // Handle login if present
  const loginHeader = await page.$('text=Sign In');
  if (loginHeader) {
    console.log('Logging in...');
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }

  // Wait for Dashboard
  await page.waitForSelector('.executive-overview-page', { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Pause carousel immediately and ensure we are on Slide 1 (Executive Overview)
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

  console.log('Verifying Header & Operations Control & KPI Row...');
  const header = await page.$('.exec-header');
  const filters = await page.$('.dashboard-filters-wrapper');
  const kpiRow = await page.$('.exec-kpi-row-section');
  const unifiedTa = await page.$('.unified-ta-section');
  const lowerRow = await page.$('.exec-bottom-row');
  const insights = await page.$('.exec-insights-section');
  const sidebarFooter = await page.$('.sidebar__footer');

  console.log('DOM Elements Found:');
  console.log('  Header:', !!header);
  console.log('  Sidebar Footer:', !!sidebarFooter);
  console.log('  Filters:', !!filters);
  console.log('  KPI Row:', !!kpiRow);
  console.log('  Unified Target vs Actual:', !!unifiedTa);
  console.log('  Lower 3-Col Analytics Row:', !!lowerRow);
  console.log('  Key Insights Section:', !!insights);

  // Capture Desktop Overview Screenshot (Top of dashboard)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const desktopOverviewPath = path.join(ARTIFACT_DIR, 'redesign_desktop_overview.png');
  await page.screenshot({ path: desktopOverviewPath, fullPage: false });
  console.log(`Saved desktop overview: ${desktopOverviewPath}`);

  // Test Period Switcher: Monthly -> Weekly -> Quarterly -> Yearly
  console.log('Testing period switcher tabs...');
  const weeklyTab = await page.$('button.period-switcher-btn:has-text("Weekly")');
  if (weeklyTab) {
    await page.evaluate(el => el.click(), weeklyTab);
    await page.waitForTimeout(600);
  }
  const weeklySummary = await page.$eval('.unified-ta-latest-label', el => el.textContent);
  console.log('  Switched to Weekly. Summary label:', weeklySummary);

  const monthlyTab = await page.$('button.period-switcher-btn:has-text("Monthly")');
  if (monthlyTab) {
    await page.evaluate(el => el.click(), monthlyTab);
    await page.waitForTimeout(600);
  }
  const monthlySummary = await page.$eval('.unified-ta-latest-label', el => el.textContent);
  console.log('  Switched back to Monthly. Summary label:', monthlySummary);

  // Test View Mode Toggle: Switch to Table view
  console.log('Testing Table view toggle...');
  const tableBtn = await page.$('button.view-mode-btn:has-text("Table")');
  if (tableBtn) {
    await page.evaluate(el => el.click(), tableBtn);
    await page.waitForTimeout(600);
  }

  const tableExists = await page.$('.unified-ta-table');
  console.log('  Table rendered:', !!tableExists);
  if (tableExists) {
    await tableExists.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }

  const tableScreenshotPath = path.join(ARTIFACT_DIR, 'redesign_table_view.png');
  await page.screenshot({ path: tableScreenshotPath, fullPage: false });
  console.log(`Saved table view screenshot: ${tableScreenshotPath}`);

  // Switch back to Chart view
  const chartBtn = await page.$('button.view-mode-btn:has-text("Chart")');
  if (chartBtn) {
    await page.evaluate(el => el.click(), chartBtn);
    await page.waitForTimeout(600);
  }

  // Scroll down to lower row & insights to capture
  await lowerRow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const lowerRowScreenshotPath = path.join(ARTIFACT_DIR, 'redesign_lower_analytics_row.png');
  await page.screenshot({ path: lowerRowScreenshotPath, fullPage: false });
  console.log(`Saved lower analytics screenshot: ${lowerRowScreenshotPath}`);

  // Full page screenshot desktop (1440x950)
  const fullDesktopPath = path.join(ARTIFACT_DIR, 'redesign_full_desktop.png');
  await page.screenshot({ path: fullDesktopPath, fullPage: true });
  console.log(`Saved full desktop screenshot: ${fullDesktopPath}`);

  // Save auth state for tablet & mobile
  const storageState = await context.storageState();
  await context.close();

  // 2. Tablet 1024x768
  console.log('Capturing tablet view (1024x768)...');
  const tabletContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, storageState });
  const tabletPage = await tabletContext.newPage();
  await tabletPage.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await tabletPage.waitForSelector('.executive-overview-page', { timeout: 15000 });
  
  // Pause autoplay on tablet
  const tabletPause = await tabletPage.$('.dashboard-carousel__play-toggle');
  if (tabletPause) {
    await tabletPage.evaluate(el => el.click(), tabletPause);
  }
  const tabletSlide1 = await tabletPage.$('button[aria-label*="slide 1:"]');
  if (tabletSlide1) {
    await tabletPage.evaluate(el => el.click(), tabletSlide1);
  }
  await tabletPage.waitForTimeout(800);

  const tabletPath = path.join(ARTIFACT_DIR, 'redesign_tablet.png');
  await tabletPage.screenshot({ path: tabletPath, fullPage: true });
  console.log(`Saved tablet screenshot: ${tabletPath}`);
  await tabletContext.close();

  // 3. Mobile 390x844
  console.log('Capturing mobile view (390x844)...');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForSelector('.executive-overview-page', { timeout: 15000 });

  // Pause autoplay on mobile
  const mobilePause = await mobilePage.$('.dashboard-carousel__play-toggle');
  if (mobilePause) {
    await mobilePage.evaluate(el => el.click(), mobilePause);
  }
  const mobileSlide1 = await mobilePage.$('button[aria-label*="slide 1:"]');
  if (mobileSlide1) {
    await mobilePage.evaluate(el => el.click(), mobileSlide1);
  }
  await mobilePage.waitForTimeout(800);

  const mobilePath = path.join(ARTIFACT_DIR, 'redesign_mobile.png');
  await mobilePage.screenshot({ path: mobilePath, fullPage: true });
  console.log(`Saved mobile screenshot: ${mobilePath}`);
  await mobileContext.close();

  await browser.close();
  console.log('Verification completed successfully!');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
