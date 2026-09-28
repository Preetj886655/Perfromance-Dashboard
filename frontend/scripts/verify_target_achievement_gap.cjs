const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Preet Jaiswal\\.gemini\\antigravity\\brain\\11796991-0774-4f24-81d5-9c7e5fc9005e';

const VIEWPORTS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080, deviceType: 'Desktop' },
  { name: 'laptop-1440x900', width: 1440, height: 900, deviceType: 'Laptop' },
  { name: 'compact-1280x800', width: 1280, height: 800, deviceType: 'Compact Laptop' },
  { name: 'tablet-landscape-1024x768', width: 1024, height: 768, deviceType: 'Tablet Landscape' },
  { name: 'tablet-portrait-768x1024', width: 768, height: 1024, deviceType: 'Tablet Portrait' },
  { name: 'mobile-large-480x900', width: 480, height: 900, deviceType: 'Mobile Large' },
  { name: 'mobile-standard-375x812', width: 375, height: 812, deviceType: 'Mobile Standard' },
];

async function ensureLoggedIn(page) {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  const loginHeader = await page.$('text=Sign In');
  if (loginHeader) {
    console.log('Logging in as alice@patil.local...');
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }
  await page.waitForSelector('.carousel-kpi-card, .target-gap-section', { timeout: 30000 });
  await page.waitForTimeout(2000); // allow data calculations and ECharts render

  // Pause carousel autoplay if active
  const pauseBtn = await page.$('.dashboard-carousel__play-toggle');
  if (pauseBtn) {
    const isPlaying = await pauseBtn.getAttribute('aria-pressed');
    if (isPlaying === 'false' || isPlaying === null) {
      await pauseBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function jumpToTargetGapSlide(page) {
  // Option A: Use quick-action button on Executive slide if present
  const quickBtn = await page.$('button:has-text("Target / Gap Analysis")');
  if (quickBtn && (await quickBtn.isVisible())) {
    await quickBtn.click();
    await page.waitForTimeout(1000);
  } else {
    // Option B: Jump to dot 3 (slide 3)
    const dots = await page.$$('.dashboard-carousel__dot');
    if (dots.length >= 3) {
      await dots[2].click();
      await page.waitForTimeout(1000);
    }
  }
  await page.waitForSelector('.target-gap-section', { timeout: 10000 });
}

(async () => {
  console.log('=== TARGET / ACHIEVEMENT / GAP ANALYSIS AUTOMATED VERIFICATION ===\n');
  const browser = await chromium.launch({ headless: true });
  const verificationResults = {
    timestamp: new Date().toISOString(),
    kpiCards: {},
    periodSwitching: {},
    filterTesting: {},
    viewportChecks: [],
    screenshots: [],
  };

  try {
    // 1. Initial Deep Verification on Desktop 1920x1080
    console.log('--- Initial Desktop Verification (1920x1080) ---');
    const desktopContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const desktopPage = await desktopContext.newPage();
    await ensureLoggedIn(desktopPage);

    // Verify Quick Navigation Button on Slide 1
    const quickBtn = await desktopPage.$('button:has-text("Target / Gap Analysis")');
    console.log(`Quick-navigation button found on Slide 1: ${quickBtn !== null}`);

    // Navigate to Target / Gap Analysis slide
    await jumpToTargetGapSlide(desktopPage);
    console.log('Successfully navigated to Target / Gap Analysis slide!');

    // Read Header
    const title = await desktopPage.$eval('.target-gap-header__title', el => el.textContent?.trim());
    const subtitle = await desktopPage.$eval('.target-gap-header__subtitle', el => el.textContent?.trim());
    console.log(`Header Title: "${title}"`);
    console.log(`Header Subtitle: "${subtitle}"`);

    // Read 4 KPI Cards
    const kpiCards = await desktopPage.$$eval('.target-gap-kpi-card', cards => {
      return cards.map(c => {
        const label = c.querySelector('.target-gap-kpi-card__label')?.textContent?.trim();
        const primary = c.querySelector('.target-gap-kpi-card__primary-value')?.textContent?.trim();
        const exact = c.querySelector('.target-gap-kpi-card__exact-value')?.textContent?.trim();
        const badge = c.querySelector('.target-gap-badge')?.textContent?.trim();
        return { label, primary, exact, badge };
      });
    });
    console.log('Top 4 KPI Cards Detected:', JSON.stringify(kpiCards, null, 2));
    verificationResults.kpiCards = kpiCards;

    // Capture Desktop Monthly Screenshot
    const desktopMonthlyScreenshot = path.join(ARTIFACT_DIR, 'target_gap_desktop-1920x1080_monthly.png');
    await desktopPage.screenshot({ path: desktopMonthlyScreenshot, fullPage: false });
    verificationResults.screenshots.push('target_gap_desktop-1920x1080_monthly.png');
    console.log(`Captured screenshot: ${desktopMonthlyScreenshot}`);

    // Test Period Switcher: Weekly
    console.log('\nTesting Period Switcher: Weekly...');
    const weeklyPill = await desktopPage.$('.target-gap-pill:has-text("Weekly")');
    if (weeklyPill) {
      await weeklyPill.click();
      await desktopPage.waitForTimeout(1500);
      const weeklyKpis = await desktopPage.$$eval('.target-gap-kpi-card', cards => {
        return cards.map(c => ({
          label: c.querySelector('.target-gap-kpi-card__label')?.textContent?.trim(),
          primary: c.querySelector('.target-gap-kpi-card__primary-value')?.textContent?.trim(),
          exact: c.querySelector('.target-gap-kpi-card__exact-value')?.textContent?.trim(),
        }));
      });
      console.log('Weekly KPIs:', JSON.stringify(weeklyKpis, null, 2));
      verificationResults.periodSwitching.weekly = weeklyKpis;

      const desktopWeeklyScreenshot = path.join(ARTIFACT_DIR, 'target_gap_desktop-1920x1080_weekly.png');
      await desktopPage.screenshot({ path: desktopWeeklyScreenshot, fullPage: false });
      verificationResults.screenshots.push('target_gap_desktop-1920x1080_weekly.png');
    }

    // Test Period Switcher: Quarterly
    console.log('\nTesting Period Switcher: Quarterly...');
    const quarterlyPill = await desktopPage.$('.target-gap-pill:has-text("Quarterly")');
    if (quarterlyPill) {
      await quarterlyPill.click();
      await desktopPage.waitForTimeout(1500);
      const quarterlyKpis = await desktopPage.$$eval('.target-gap-kpi-card', cards => {
        return cards.map(c => ({
          label: c.querySelector('.target-gap-kpi-card__label')?.textContent?.trim(),
          primary: c.querySelector('.target-gap-kpi-card__primary-value')?.textContent?.trim(),
        }));
      });
      verificationResults.periodSwitching.quarterly = quarterlyKpis;
    }

    // Test Period Switcher: Yearly
    console.log('\nTesting Period Switcher: Yearly...');
    const yearlyPill = await desktopPage.$('.target-gap-pill:has-text("Yearly")');
    if (yearlyPill) {
      await yearlyPill.click();
      await desktopPage.waitForTimeout(1500);
      const yearlyKpis = await desktopPage.$$eval('.target-gap-kpi-card', cards => {
        return cards.map(c => ({
          label: c.querySelector('.target-gap-kpi-card__label')?.textContent?.trim(),
          primary: c.querySelector('.target-gap-kpi-card__primary-value')?.textContent?.trim(),
        }));
      });
      verificationResults.periodSwitching.yearly = yearlyKpis;
    }

    // Switch back to Monthly
    const monthlyPill = await desktopPage.$('.target-gap-pill:has-text("Monthly")');
    if (monthlyPill) {
      await monthlyPill.click();
      await desktopPage.waitForTimeout(1500);
    }

    // Test Legend Visibility
    const legendItems = await desktopPage.$$eval('.target-gap-legend__item', items =>
      items.map(it => it.textContent?.trim())
    );
    console.log('Legend Items:', legendItems);

    // Test Info Alert
    const infoAlertText = await desktopPage.$eval('.target-gap-info-alert__text', el => el.textContent?.trim());
    console.log(`Info Alert Text: "${infoAlertText}"`);

    await desktopContext.close();

    // 2. Cross-Device Viewport Checks
    console.log('\n--- Cross-Device Viewport Audit across 7 Viewports ---');
    for (const vp of VIEWPORTS) {
      console.log(`Auditing ${vp.name} (${vp.width}x${vp.height})...`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await ensureLoggedIn(page);
      await jumpToTargetGapSlide(page);

      // Check for horizontal overflow
      const overflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 5,
        };
      });

      console.log(`  Horizontal overflow: ${overflow.hasHorizontalScroll} (scroll=${overflow.scrollWidth}, client=${overflow.clientWidth})`);
      verificationResults.viewportChecks.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        hasHorizontalScroll: overflow.hasHorizontalScroll,
      });

      // Capture representative device screenshots
      if (vp.name === 'laptop-1440x900' || vp.name === 'tablet-landscape-1024x768' || vp.name === 'mobile-standard-375x812') {
        const shotName = `target_gap_${vp.name}.png`;
        const shotPath = path.join(ARTIFACT_DIR, shotName);
        await page.screenshot({ path: shotPath, fullPage: false });
        verificationResults.screenshots.push(shotName);
        console.log(`  Saved screenshot: ${shotName}`);
      }

      await context.close();
    }

    // Save JSON results to artifact directory
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'target_gap_verification.json'),
      JSON.stringify(verificationResults, null, 2),
      'utf8'
    );
    console.log('\nVerification completed successfully! Results written to target_gap_verification.json');
  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

