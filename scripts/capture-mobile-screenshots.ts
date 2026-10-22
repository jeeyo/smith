import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactImgDir = 'C:\\Users\\jeeyo\\.gemini\\antigravity\\brain\\d6b8f8c2-3e56-4f8c-b8c6-f682efab6ef7\\images';

if (!fs.existsSync(artifactImgDir)) {
  fs.mkdirSync(artifactImgDir, { recursive: true });
}

async function captureMobile() {
  console.log('Launching Edge for mobile and tablet responsiveness check...');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();
  console.log('Navigating to http://localhost:4100 on mobile viewport (390x844)...');
  await page.goto('http://localhost:4100', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // Switch to session with completed goal and artifacts
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
  await new Promise(r => setTimeout(r, 1500));

  // 1. Capture Mobile Chat & DAG & Mermaid Artifact
  console.log('Capturing 1. mobile_chat_dag.png...');
  await page.screenshot({ path: path.join(artifactImgDir, 'mobile_chat_dag.png') });

  // 2. Click HTML tab to show responsive HTML prototype preview on mobile
  console.log('Capturing 2. mobile_artifact_html.png...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const htmlTab = buttons.find(b => b.textContent?.includes('auth_prototype.html') || b.textContent?.includes('.html'));
    htmlTab?.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactImgDir, 'mobile_artifact_html.png') });

  // 3. Click Image tab to show SVG image preview on mobile
  console.log('Capturing 3. mobile_artifact_image.png...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const imgTab = buttons.find(b => b.textContent?.includes('.svg') || b.textContent?.includes('image'));
    imgTab?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(artifactImgDir, 'mobile_artifact_image.png') });

  // 4. Click Download tab to show other file card on mobile
  console.log('Capturing 4. mobile_artifact_download.png...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const docTab = buttons.find(b => b.textContent?.includes('.json') || b.textContent?.includes('other'));
    docTab?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(artifactImgDir, 'mobile_artifact_download.png') });

  // Switch back to mermaid
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const mmdTab = buttons.find(b => b.textContent?.includes('.mmd') || b.textContent?.includes('mermaid'));
    mmdTab?.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 5. Open Behind the scenes drawer
  console.log('Capturing 5. mobile_behind_scenes.png...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const opsBtn = buttons.find(b => b.textContent?.includes('Behind the scenes'));
    opsBtn?.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactImgDir, 'mobile_behind_scenes.png') });

  // Close behind the scenes
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const opsBtn = buttons.find(b => b.textContent?.includes('Behind the scenes'));
    opsBtn?.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 6. Open In-App Terminal Modal
  console.log('Capturing 6. mobile_terminal_modal.png...');
  await page.evaluate(() => {
    const termBtn = document.querySelector('button[title*="Terminal"]') as HTMLElement;
    termBtn?.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(artifactImgDir, 'mobile_terminal_modal.png') });

  // Close terminal modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.fixed button') as HTMLElement;
    closeBtn?.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 7. Open Customizations Drawer
  console.log('Capturing 7. mobile_customizations.png...');
  await page.evaluate(() => {
    const slidersBtn = document.querySelector('button[title*="Skills"]') as HTMLElement;
    slidersBtn?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(artifactImgDir, 'mobile_customizations.png') });

  // 8. Test Tablet View (768 x 1024)
  console.log('Capturing 8. tablet_view.png (768x1024)...');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));
  await page.setViewport({ width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactImgDir, 'tablet_view.png') });

  // 9. Test Swagger API Docs on Mobile (390 x 844)
  console.log('Capturing 9. mobile_api_docs.png...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('http://localhost:4100/api/docs', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(artifactImgDir, 'mobile_api_docs.png') });

  await browser.close();
  console.log('All mobile & tablet responsiveness screenshots captured successfully!');
}

captureMobile().catch(err => {
  console.error('Failed capturing mobile screenshots:', err);
  process.exit(1);
});
