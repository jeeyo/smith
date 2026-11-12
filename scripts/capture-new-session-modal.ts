import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDir = path.join(process.cwd(), 'docs', 'images');
const artifactImgDir = 'C:\\Users\\jeeyo\\.gemini\\antigravity\\brain\\d6b8f8c2-3e56-4f8c-b8c6-f682efab6ef7\\images';

function copyToArtifact(fileName: string) {
  const src = path.join(outputDir, fileName);
  const dest = path.join(artifactImgDir, fileName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:4100', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Open New Session Modal
  console.log('Opening New Session Modal...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[title="New Session"]') as HTMLElement;
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Type session name
  await page.type('input[placeholder*="Auth Service Refactor"]', 'Authentication Microservice');
  await new Promise(r => setTimeout(r, 400));

  console.log('Capturing screenshot_new_session_dialog.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_new_session_dialog.png') });
  copyToArtifact('screenshot_new_session_dialog.png');

  // Click submit in page evaluate
  console.log('Submitting session creation...');
  const submitted = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.trim() === 'Create Session');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Create Session:', submitted);

  // Wait for modal to disappear
  await page.waitForFunction(() => !document.querySelector('.fixed.inset-0.z-50'), { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Capturing screenshot_session_chat_ready.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_session_chat_ready.png') });
  copyToArtifact('screenshot_session_chat_ready.png');

  await browser.close();
  console.log('Done successfully!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
