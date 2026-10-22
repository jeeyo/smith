import puppeteer from 'puppeteer-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function checkOverflow() {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 375, height: 812, isMobile: true, hasTouch: true }
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:4100', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // Select the session with messages
  await page.evaluate(() => {
    const select = document.querySelector('select') as HTMLSelectElement;
    if (select) {
      const option = Array.from(select.options).find(o => o.text.includes('Artifact Preview') || o.text.includes('E2E'));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  const overflows = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const bodyScroll = document.body.scrollWidth;
    const results: string[] = [];

    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > docWidth + 2) {
        const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join('.') : '';
        results.push(`${el.tagName}.${cls} (right: ${rect.right.toFixed(1)}, doc: ${docWidth})`);
      }
    });

    return { docWidth, bodyScroll, results: results.slice(0, 10) };
  });

  console.log('Overflow check results for 375px:', JSON.stringify(overflows, null, 2));
  await browser.close();
}

checkOverflow();
