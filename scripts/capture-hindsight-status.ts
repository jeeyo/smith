import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDir = path.join(process.cwd(), 'docs', 'images');
const artifactImgDir = 'C:\\Users\\jeeyo\\.gemini\\antigravity\\brain\\d6b8f8c2-3e56-4f8c-b8c6-f682efab6ef7\\images';

function copyToArtifact(fileName: string) {
  const src = path.join(outputDir, fileName);
  const dest = path.join(artifactImgDir, fileName);
  if (!fs.existsSync(artifactImgDir)) {
    fs.mkdirSync(artifactImgDir, { recursive: true });
  }
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 1440, height: 950 }
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:4100', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Capturing UI with Embedded Hindsight Connected...');
  const headerPath = path.join(outputDir, 'screenshot_embedded_hindsight_connected.png');
  await page.screenshot({ path: headerPath });
  copyToArtifact('screenshot_embedded_hindsight_connected.png');

  await browser.close();
  console.log('Screenshot completed successfully!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
