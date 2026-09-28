const { chromium } = require('playwright');
const path = require('path');

async function run() {
  console.log('====================================================');
  console.log('TARGET VS ACTUAL VISUAL & CHART LOGIC VERIFICATION');
  console.log('====================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (err) => {
    console.log('PAGEERROR:', err.message);
    consoleErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore initial 401 before login
      if (!txt.includes('401 (Unauthorized)')) {
        console.log('BROWSER CONSOLE ERROR:', txt);
        consoleErrors.push(txt);
      }
    }
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
    await page.waitForTimeout(2000);
  }

  // Check for Retry Connection button if present
  const retryBtn = await page.$('.live-empty-state__retry, button:has-text("Retry Connection")');
  if (retryBtn) {
    console.log('Clicking Retry Connection...');
    await retryBtn.click();
    await page.waitForTimeout(4000);
  }

  // 2. Wait for Operations Control panel or carousel
  console.log('Waiting for dashboard panel to load...');
  await page.waitForSelector('.carousel-kpi-card, .period-analysis-section', { timeout: 35000 });
  await page.waitForTimeout(3000);

  // Pause carousel autoplay if active
  const pauseBtn = await page.$('.dashboard-carousel__play-toggle');
  if (pauseBtn) {
    const isPlaying = await pauseBtn.getAttribute('aria-pressed');
    if (isPlaying === 'false' || isPlaying === null) {
      await pauseBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Artifact directory for screenshots
  const artifactDir = path.resolve(
    'C:/Users/Preet Jaiswal/.gemini/antigravity/brain/11796991-0774-4f24-81d5-9c7e5fc9005e'
  );

  // 3. EXECUTIVE OVERVIEW SLIDE - Target vs Actual Section
  console.log('\n--- 1. Testing Executive Overview Target vs Actual Charts ---');
  // Check header legend
  const execLegendTexts = await page.locator('.exec-ta-header__legend span').allTextContents();
  console.log('Executive Overview Header Legend items:', execLegendTexts.map(t => t.trim()).filter(Boolean));
  
  const hasYetToAchieveLegend = execLegendTexts.some(t => t.toLowerCase().includes('yet to achieve'));
  if (hasYetToAchieveLegend) {
    console.error('FAIL: "Yet to Achieve" still found in Executive Overview header legend!');
  } else {
    console.log('PASS: "Yet to Achieve" is REMOVED from Executive Overview header legend.');
  }

  // Take screenshot of Executive Overview Target vs Actual grid
  const execSection = await page.$('.period-analysis-section');
  if (execSection) {
    await execSection.screenshot({
      path: path.join(artifactDir, 'executive_overview_target_actual_side_by_side.png'),
    });
    console.log('Saved screenshot: executive_overview_target_actual_side_by_side.png');
  }

  // 4. TARGET / ACHIEVEMENT / GAP ANALYSIS SLIDE
  console.log('\n--- 2. Testing Target / Achievement / Gap Analysis Carousel Slide ---');
  // Click on the Target / Achievement / Gap carousel tab/pill
  const gapTab = await page.$('button[role="tab"]:has-text("Target / Achievement / Gap"), .dashboard-carousel__pill:has-text("Target / Achievement")');
  if (gapTab) {
    await gapTab.click();
    await page.waitForTimeout(1500);
  } else {
    // Try navigating via carousel next buttons or slide selector
    const slideSelect = await page.$('select[aria-label="Select slide"], .slide-nav-select');
    if (slideSelect) {
      await slideSelect.selectOption({ label: 'Target / Achievement / Gap' });
      await page.waitForTimeout(1500);
    }
  }

  // Verify KPI cards
  const kpiLabels = await page.locator('.target-gap-kpi-card__label').allTextContents();
  console.log('TargetGapAnalysisSlide KPI Card labels:', kpiLabels);
  console.log('Checking KPI cards: Total Target, Total Achieved, Yet to Achieve intact:',
    kpiLabels.includes('Total Target') && kpiLabels.includes('Total Achieved') && kpiLabels.includes('Yet to Achieve')
  );

  // Verify custom legend
  const gapLegendTexts = await page.locator('.target-gap-legend__item').allTextContents();
  console.log('TargetGapAnalysisSlide custom legend items:', gapLegendTexts.map(t => t.trim()));
  const gapHasYetToAchieve = gapLegendTexts.some(t => t.toLowerCase().includes('yet to achieve'));
  if (gapHasYetToAchieve) {
    console.error('FAIL: "Yet to achieve" still found in TargetGapAnalysisSlide legend!');
  } else {
    console.log('PASS: "Yet to achieve" is REMOVED from TargetGapAnalysisSlide legend.');
  }

  const targetGapCard = await page.$('.target-gap-card');
  if (targetGapCard) {
    await targetGapCard.screenshot({
      path: path.join(artifactDir, 'target_gap_analysis_monthly_side_by_side.png'),
    });
    console.log('Saved screenshot: target_gap_analysis_monthly_side_by_side.png');

    // Test period switcher: Weekly
    const weeklyBtn = await page.$('.target-gap-pill:has-text("Weekly")');
    if (weeklyBtn) {
      await weeklyBtn.click();
      await page.waitForTimeout(1000);
      await targetGapCard.screenshot({
        path: path.join(artifactDir, 'target_gap_analysis_weekly_side_by_side.png'),
      });
      console.log('Saved screenshot: target_gap_analysis_weekly_side_by_side.png');
    }

    // Test period switcher: Quarterly
    const quarterlyBtn = await page.$('.target-gap-pill:has-text("Quarterly")');
    if (quarterlyBtn) {
      await quarterlyBtn.click();
      await page.waitForTimeout(1000);
      await targetGapCard.screenshot({
        path: path.join(artifactDir, 'target_gap_analysis_quarterly_side_by_side.png'),
      });
      console.log('Saved screenshot: target_gap_analysis_quarterly_side_by_side.png');
    }

    // Test period switcher: Yearly
    const yearlyBtn = await page.$('.target-gap-pill:has-text("Yearly")');
    if (yearlyBtn) {
      await yearlyBtn.click();
      await page.waitForTimeout(1000);
      await targetGapCard.screenshot({
        path: path.join(artifactDir, 'target_gap_analysis_yearly_side_by_side.png'),
      });
      console.log('Saved screenshot: target_gap_analysis_yearly_side_by_side.png');
    }
  }

  // 5. PRODUCTION SLIDE
  console.log('\n--- 3. Testing Production Slide Target vs Actual Chart ---');
  const prodTab = await page.$('button[role="tab"]:has-text("Production"), .dashboard-carousel__pill:has-text("Production")');
  if (prodTab) {
    await prodTab.click();
    await page.waitForTimeout(1500);
    const prodSlide = await page.$('.production-slide, .carousel-slide');
    if (prodSlide) {
      await page.screenshot({
        path: path.join(artifactDir, 'production_slide_target_actual.png'),
        fullPage: false,
      });
      console.log('Saved screenshot: production_slide_target_actual.png');
    }
  }

  console.log('\n====================================================');
  console.log(`VERIFICATION COMPLETE. Console errors: ${consoleErrors.length}`);
  console.log('====================================================');

  await browser.close();
  if (consoleErrors.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
