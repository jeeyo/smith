const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

async function generate() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });

  const svg = `
  <!DOCTYPE html>
  <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: transparent; display: flex; align-items: center; justify-content: center; width: 512px; height: 512px; }
      </style>
    </head>
    <body>
      <svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" rx="112" fill="#09090b"/>
        <rect x="8" y="8" width="496" height="496" rx="104" stroke="#27272a" stroke-width="8"/>
        <rect x="32" y="32" width="448" height="448" rx="80" fill="#18181b"/>
        <path d="M120 180L220 256L120 332" stroke="#10b981" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="248" y1="332" x2="384" y2="332" stroke="#38bdf8" stroke-width="36" stroke-linecap="round"/>
        <circle cx="400" cy="120" r="18" fill="#10b981"/>
      </svg>
    </body>
  </html>
  `;

  await page.setContent(svg);
  const outPath = path.join(__dirname, '../public/icon.png');
  await page.screenshot({ path: outPath, omitBackground: true });
  console.log('Generated icon at:', outPath);
  await browser.close();
}

generate().catch(console.error);
