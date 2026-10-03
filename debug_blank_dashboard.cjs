let chromium;
try {
    chromium = require('playwright').chromium;
} catch (e) {
    chromium = require('./frontend/node_modules/playwright').chromium;
}

async function run() {
    const browser = await chromium.launch({
        headless: true
    });

    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(
            `[CONSOLE ${msg.type()}] ${msg.text()}`
        );
    });

    page.on('pageerror', error => {
        console.log(
            '[PAGE ERROR]',
            error.message
        );
        console.log(
            error.stack || ''
        );
    });

    page.on('requestfailed', request => {
        console.log(
            '[REQUEST FAILED]',
            request.url(),
            request.failure()?.errorText
        );
    });

    page.on('response', response => {
        if (response.status() >= 400) {
            console.log(
                '[HTTP ERROR]',
                response.status(),
                response.url()
            );
        }
    });

    const urls = [
        'http://localhost:5173/',
        'http://localhost:5173/#/dashboard',
        'http://localhost:5173/#/quality',
        'http://127.0.0.1:5173/',
        'http://127.0.0.1:5173/#/dashboard'
    ];

    for (const url of urls) {
        console.log('\n========================================');
        console.log('TESTING:', url);
        console.log('========================================');

        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            await page.waitForTimeout(3000);

            console.log('Final URL:', page.url());

            console.log(
                'Title:',
                await page.title()
            );

            console.log(
                'Body text:',
                JSON.stringify(
                    (await page.locator('body').innerText())
                        .slice(0, 2000)
                )
            );

            console.log(
                'Root HTML length:',
                await page.locator('#root').innerHTML()
                    .then(html => html.length)
                    .catch(() => -1)
            );

            console.log(
                'Root child count:',
                await page.locator('#root > *').count()
                    .catch(() => -1)
            );

            await page.screenshot({
                path: `debug-${url
                    .replace(/[^a-z0-9]/gi, '_')
                    .slice(0, 100)}.png`,
                fullPage: true
            });

        } catch (error) {
            console.log(
                '[NAVIGATION ERROR]',
                error.message
            );
        }
    }

    await browser.close();
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
