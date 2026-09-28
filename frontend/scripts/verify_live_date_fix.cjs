const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Preet Jaiswal\\.gemini\\antigravity\\brain\\11796991-0774-4f24-81d5-9c7e5fc9005e';

(async () => {
  console.log('--- Starting Playwright Verification ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Track console logs and errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser Console Error] ${msg.text()}`);
  });

  // Track network requests to manufacturing/data
  const apiCalls = [];
  page.on('response', async res => {
    if (res.url().includes('/api/manufacturing/data')) {
      try {
        const json = await res.json();
        apiCalls.push({
          url: res.url(),
          status: res.status(),
          cacheHit: json.cacheHit,
          recordCount: json.recordCount,
          minDate: json.minDate,
          maxDate: json.maxDate,
          spreadsheetId: json.spreadsheetId,
        });
      } catch {
        // Ignored
      }
    }
  });

  // 1. Navigate to frontend
  console.log('Navigating to http://127.0.0.1:5173...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  // 2. Check if login page is shown
  const loginHeader = await page.$('text=Sign In');
  if (loginHeader) {
    console.log('Logging in as alice@patil.local...');
    await page.fill('input[type="text"], input[type="email"]', 'alice@patil.local');
    await page.fill('input[type="password"]', 'Secret123!');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }

  // 3. Wait for dashboard and live sheets header to render
  console.log('Waiting for Live Google Sheets section...');
  await page.waitForSelector('.live-google-sheets-section', { timeout: 30000 });
  await page.waitForTimeout(3000); // allow data crunching and state sync

  // Capture Screenshot 1: Overview and Live Google Sheets header
  const screenshot1 = path.join(ARTIFACT_DIR, 'live_data_header_overview.png');
  await page.screenshot({ path: screenshot1, fullPage: false });
  console.log('Saved screenshot 1:', screenshot1);

  // 4. Verify Live Google Sheets metadata
  const liveSectionText = await page.textContent('body');
  const hasConnected = liveSectionText.includes('Connected') || liveSectionText.includes('ONLINE');
  console.log('Connection badge present:', hasConnected);

  // Check for record count
  const recordCountMatch = liveSectionText.match(/14[,.]?720/);
  console.log('Found 14,720 record count:', !!recordCountMatch);

  // Check for Source Range display
  const sourceRangeMatch = liveSectionText.match(/31\s+Aug\s+2024\s+→\s+22\s+Sep\s+2026/i) || liveSectionText.includes('22 Sep 2026');
  console.log('Found Source Range (ending 22 Sep 2026):', !!sourceRangeMatch);

  // 5. Inspect Date Range Inputs
  const dateInputs = await page.$$('input[type="date"]');
  console.log(`Found ${dateInputs.length} date inputs.`);
  let dateFromVal = '', dateToVal = '', dateToMax = '';
  if (dateInputs.length >= 2) {
    dateFromVal = await dateInputs[0].inputValue();
    dateToVal = await dateInputs[1].inputValue();
    dateToMax = await dateInputs[1].getAttribute('max');
    console.log('Date From Input Value:', dateFromVal);
    console.log('Date To Input Value:', dateToVal);
    console.log('Date To Input Max Attribute:', dateToMax);
  }

  // 6. Test Date Picker Selection with 2026-09-22
  if (dateInputs.length >= 2) {
    console.log('Testing custom date range: 2026-01-01 to 2026-09-22...');
    await dateInputs[0].fill('2026-01-01');
    await dateInputs[1].fill('2026-09-22');
    
    // Click Apply Date Range
    const applyBtn = await page.$('button:has-text("Apply Date Range")');
    if (applyBtn) {
      await applyBtn.click();
      await page.waitForTimeout(1500);
      console.log('Clicked "Apply Date Range". New Date From:', await dateInputs[0].inputValue(), 'Date To:', await dateInputs[1].inputValue());
    }
  }

  // Capture Screenshot 2: Date Range picker applied with 2026-09-22
  const screenshot2 = path.join(ARTIFACT_DIR, 'date_range_picker_22_sep_2026.png');
  await page.screenshot({ path: screenshot2, fullPage: false });
  console.log('Saved screenshot 2:', screenshot2);

  // 7. Check Period Analytics (Monthly / Weekly)
  // Look for Period selector or slides
  console.log('Checking Monthly and Weekly views...');
  const bodyTextAfterApply = await page.textContent('body');
  const hasSep2026 = bodyTextAfterApply.includes('Sep 2026') || bodyTextAfterApply.includes('2026-09') || bodyTextAfterApply.includes('Sep-26');
  console.log('Body includes Sep 2026 indicator:', hasSep2026);

  // 8. Test Refresh Data button
  console.log('Testing "Refresh Data" button...');
  const _initialCallCount = apiCalls.length;
  const refreshBtn = await page.$('button:has-text("Refresh Data")');
  if (refreshBtn) {
    await refreshBtn.click();
    console.log('Clicked "Refresh Data", waiting for response...');
    await page.waitForResponse(res => res.url().includes('/api/manufacturing/data'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  console.log('API Calls recorded during session:');
  console.dir(apiCalls, { depth: null });

  // Capture Screenshot 3: Full dashboard after refresh
  const screenshot3 = path.join(ARTIFACT_DIR, 'dashboard_after_refresh.png');
  await page.screenshot({ path: screenshot3, fullPage: false });
  console.log('Saved screenshot 3:', screenshot3);

  // 9. Output Summary Findings
  const results = {
    hasConnected,
    recordCountMatch: !!recordCountMatch,
    sourceRangeMatch: !!sourceRangeMatch,
    dateFromVal,
    dateToVal,
    dateToMax,
    hasSep2026,
    apiCalls,
  };
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'browser_verification_results.json'), JSON.stringify(results, null, 2));
  console.log('--- Verification Completed Successfully ---');

  await browser.close();
})();
