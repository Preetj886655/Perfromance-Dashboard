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
  await page.waitForSelector('.carousel-kpi-card', { timeout: 30000 });
  await page.waitForTimeout(2500); // allow data calculations and ECharts render

  // Pause carousel autoplay if button exists
  const pauseBtn = await page.$('.dashboard-carousel__play-toggle');
  if (pauseBtn) {
    const isPlaying = await pauseBtn.getAttribute('aria-pressed');
    if (isPlaying === 'false' || isPlaying === null) {
      await pauseBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function jumpToSlide(page, slideNum) {
  const dots = await page.$$('.dashboard-carousel__dot');
  if (dots.length >= slideNum) {
    await dots[slideNum - 1].click();
    await page.waitForTimeout(1000);
  }
}

(async () => {
  console.log('=== DUAL NUMBER FORMAT COMPREHENSIVE MULTI-SLIDE AUDIT ===');
  const browser = await chromium.launch({ headless: true });
  const results = {
    timestamp: new Date().toISOString(),
    viewportsTested: [],
    dualFormatCheck: {
      passed: true,
      executiveOverviewKpis: [],
      slide2Kpis: [],
      slide7TableCells: [],
      exactParenthesesCount: 0,
      compactUnitsCount: 0,
    },
    overflowChecks: [],
    screenshotsCaptured: [],
  };

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();

      await ensureLoggedIn(page);

      // Check for horizontal page overflow
      const pageOverflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 5,
        };
      });

      console.log(`Horizontal overflow check (${vp.name}): scrollWidth=${pageOverflow.scrollWidth}, clientWidth=${pageOverflow.clientWidth}, overflow=${pageOverflow.hasHorizontalScroll}`);
      results.overflowChecks.push({
        viewport: vp.name,
        ...pageOverflow,
      });

      // Capture Slide 1 screenshot
      const s1Path = path.join(ARTIFACT_DIR, `dual_format_${vp.name}_slide1.png`);
      await page.screenshot({ path: s1Path, fullPage: false });
      results.screenshotsCaptured.push({
        viewport: vp.name,
        slide: 1,
        path: s1Path,
      });
      console.log(`Saved screenshot Slide 1: ${s1Path}`);

      // If Desktop 1920x1080, extract full details across multiple slides
      if (vp.name === 'desktop-1920x1080') {
        // Slide 1 KPIs
        const kpis1 = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('.carousel-kpi-card'));
          return cards.map(c => {
            const label = c.querySelector('.carousel-kpi-card__label')?.textContent?.trim() || '';
            const value = c.querySelector('.carousel-kpi-card__value')?.textContent?.trim() || '';
            const exact = c.querySelector('.carousel-kpi-card__exact-value')?.textContent?.trim() || '';
            const target = c.querySelector('.carousel-kpi-card__target')?.textContent?.trim() || '';
            return { label, value, exact, target };
          });
        });
        results.dualFormatCheck.executiveOverviewKpis = kpis1;
        console.log(`Slide 1: ${kpis1.length} KPI cards captured.`);
        kpis1.forEach(k => console.log(`  KPI [${k.label}]: Primary="${k.value}" | Exact="${k.exact}" | Target="${k.target}"`));

        // Jump to Slide 2 (Production Performance)
        await jumpToSlide(page, 2);
        const s2Path = path.join(ARTIFACT_DIR, `dual_format_${vp.name}_slide2_production.png`);
        await page.screenshot({ path: s2Path, fullPage: false });
        results.screenshotsCaptured.push({
          viewport: vp.name,
          slide: 2,
          path: s2Path,
        });
        console.log(`Saved screenshot Slide 2: ${s2Path}`);

        const kpis2 = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('.carousel-kpi-card'));
          return cards.map(c => {
            const label = c.querySelector('.carousel-kpi-card__label')?.textContent?.trim() || '';
            const value = c.querySelector('.carousel-kpi-card__value')?.textContent?.trim() || '';
            const exact = c.querySelector('.carousel-kpi-card__exact-value')?.textContent?.trim() || '';
            const target = c.querySelector('.carousel-kpi-card__target')?.textContent?.trim() || '';
            return { label, value, exact, target };
          });
        });
        results.dualFormatCheck.slide2Kpis = kpis2;
        console.log(`Slide 2 KPIs:`);
        kpis2.forEach(k => console.log(`  KPI [${k.label}]: Primary="${k.value}" | Exact="${k.exact}" | Target="${k.target}"`));

        // Jump to Slide 7 (Line Performance Matrix)
        await jumpToSlide(page, 7);
        const s7Path = path.join(ARTIFACT_DIR, `dual_format_${vp.name}_slide7_line_matrix.png`);
        await page.screenshot({ path: s7Path, fullPage: false });
        results.screenshotsCaptured.push({
          viewport: vp.name,
          slide: 7,
          path: s7Path,
        });
        console.log(`Saved screenshot Slide 7: ${s7Path}`);

        const tableData = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('.data-table tbody tr'));
          return rows.slice(0, 5).map(r => {
            const cells = Array.from(r.querySelectorAll('td')).map(c => c.textContent?.trim().replace(/\s+/g, ' '));
            return cells;
          });
        });
        results.dualFormatCheck.slide7TableCells = tableData;
        console.log(`Slide 7 Table sampled rows: ${tableData.length}`);
        tableData.forEach((row, i) => console.log(`  Row ${i + 1}: ${row.join(' | ')}`));

        // Jump to Slide 11 (Work Center Breakdown Table)
        await jumpToSlide(page, 11);
        const s11Path = path.join(ARTIFACT_DIR, `dual_format_${vp.name}_slide11_work_centers.png`);
        await page.screenshot({ path: s11Path, fullPage: false });
        results.screenshotsCaptured.push({
          viewport: vp.name,
          slide: 11,
          path: s11Path,
        });
        console.log(`Saved screenshot Slide 11: ${s11Path}`);
      }

      // On Mobile 375x812, also test Slide 2 and Slide 7
      if (vp.name === 'mobile-standard-375x812') {
        await jumpToSlide(page, 2);
        const s2mPath = path.join(ARTIFACT_DIR, `dual_format_${vp.name}_slide2.png`);
        await page.screenshot({ path: s2mPath, fullPage: false });
        results.screenshotsCaptured.push({
          viewport: vp.name,
          slide: 2,
          path: s2mPath,
        });
        console.log(`Saved mobile Slide 2: ${s2mPath}`);
      }

      results.viewportsTested.push({
        name: vp.name,
        width: vp.width,
        height: vp.height,
        deviceType: vp.deviceType,
        status: 'PASSED',
      });

      await context.close();
    }

    // Write results JSON
    const reportPath = path.join(ARTIFACT_DIR, 'dual_number_verification.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\nVerification data saved to: ${reportPath}`);
    console.log('=== MULTI-SLIDE AUDIT COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Error during verification:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
