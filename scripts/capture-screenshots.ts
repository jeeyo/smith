import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDir = path.join(process.cwd(), 'docs', 'images');
const artifactImgDir = 'C:\\Users\\jeeyo\\.gemini\\antigravity\\brain\\d6b8f8c2-3e56-4f8c-b8c6-f682efab6ef7\\images';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
if (!fs.existsSync(artifactImgDir)) {
  fs.mkdirSync(artifactImgDir, { recursive: true });
}

function copyToArtifact(fileName: string) {
  const src = path.join(outputDir, fileName);
  const dest = path.join(artifactImgDir, fileName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

async function capture() {
  console.log('Launching Edge via puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  console.log('Navigating to http://localhost:4100...');
  await page.goto('http://localhost:4100', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // Switch to the session that has the generated artifacts
  const sessionSelect = await page.$('select');
  if (sessionSelect) {
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
    await new Promise(r => setTimeout(r, 2000));
  }

  // Check if we need to dispatch a goal
  const hasPlan = await page.evaluate(() => {
    return document.body.innerText.includes('Cooperative Task DAG') || document.body.innerText.includes('Worktree Diff');
  });

  if (!hasPlan) {
    console.log('Dispatching goal in UI...');
    await page.type('textarea', 'Build an authentication service with Ed25519 tokens, route guards, and integration tests');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const run = buttons.find(b => b.textContent?.includes('Run'));
      run?.click();
    });
    await new Promise(r => setTimeout(r, 3500));
  }

  // 1. Expand diff preview if present
  console.log('Opening changed files diff accordion...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const viewDiff = buttons.find(b => b.textContent?.includes('View') && b.textContent?.includes('changed files'));
    viewDiff?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 1. Capture Main Goal Chat View with Mermaid Diagram Artifact Preview rendered
  console.log('Capturing screenshot_goal_chat_executed.png (Mermaid sequence diagram preview)...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_goal_chat_executed.png') });
  copyToArtifact('screenshot_goal_chat_executed.png');
  fs.copyFileSync(
    path.join(outputDir, 'screenshot_goal_chat_executed.png'),
    path.join(outputDir, 'screenshot_cockpit_grid.png')
  );
  copyToArtifact('screenshot_cockpit_grid.png');
  console.log('Saved screenshot_goal_chat_executed.png');

  // 2. Click HTML tab to show interactive web prototype preview
  console.log('Selecting HTML prototype preview tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const htmlTab = buttons.find(b => b.textContent?.includes('auth_prototype.html') || b.textContent?.includes('.html'));
    htmlTab?.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  console.log('Capturing screenshot_artifact_html.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_artifact_html.png') });
  copyToArtifact('screenshot_artifact_html.png');
  console.log('Saved screenshot_artifact_html.png');

  // 3. Click Image tab to show SVG image preview
  console.log('Selecting SVG image preview tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const imgTab = buttons.find(b => b.textContent?.includes('.svg') || b.textContent?.includes('image'));
    imgTab?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  console.log('Capturing screenshot_artifact_image.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_artifact_image.png') });
  copyToArtifact('screenshot_artifact_image.png');
  console.log('Saved screenshot_artifact_image.png');

  // 4. Click Downloadable / Other file tab to show download card
  console.log('Selecting Other / Downloadable file tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const docTab = buttons.find(b => b.textContent?.includes('.json') || b.textContent?.includes('other'));
    docTab?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  console.log('Capturing screenshot_artifact_download.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_artifact_download.png') });
  copyToArtifact('screenshot_artifact_download.png');
  console.log('Saved screenshot_artifact_download.png');

  // Switch back to mermaid tab for behind-the-scenes
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const mmdTab = buttons.find(b => b.textContent?.includes('.mmd') || b.textContent?.includes('mermaid'));
    mmdTab?.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 5. Expand Behind-the-Scenes Drawer and Capture
  console.log('Expanding Behind-the-Scenes operations drawer...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const opsBtn = buttons.find(b => b.textContent?.includes('Behind the scenes'));
    opsBtn?.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  console.log('Capturing screenshot_goal_chat_behind_scenes.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_goal_chat_behind_scenes.png') });
  copyToArtifact('screenshot_goal_chat_behind_scenes.png');
  console.log('Saved screenshot_goal_chat_behind_scenes.png');

  // 6. Open In-App Terminal Modal and Capture
  console.log('Launching In-App Terminal Modal...');
  await page.evaluate(() => {
    const authBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Terminal Auth'));
    if (authBtn) {
      authBtn.click();
    } else {
      const topTerm = document.querySelector('button[title*="Terminal"]') as HTMLElement;
      topTerm?.click();
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  console.log('Capturing screenshot_in_app_terminal.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_in_app_terminal.png') });
  copyToArtifact('screenshot_in_app_terminal.png');
  console.log('Saved screenshot_in_app_terminal.png');

  // Close terminal modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.fixed button') as HTMLElement;
    closeBtn?.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 7. Open Customizations Drawer and Capture
  console.log('Opening Customizations drawer...');
  await page.evaluate(() => {
    const slidersBtn = document.querySelector('button[title*="Skills"]') as HTMLElement;
    slidersBtn?.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  console.log('Capturing screenshot_goal_chat_customizations.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_goal_chat_customizations.png') });
  copyToArtifact('screenshot_goal_chat_customizations.png');
  console.log('Saved screenshot_goal_chat_customizations.png');

  // Close drawer
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));

  // 8. Capture Swagger API Documentation
  console.log('Navigating to http://localhost:4100/api/docs...');
  await page.goto('http://localhost:4100/api/docs', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('Capturing screenshot_api_docs.png...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot_api_docs.png') });
  copyToArtifact('screenshot_api_docs.png');
  console.log('Saved screenshot_api_docs.png');

  await browser.close();
  console.log('All real, updated screenshots captured and mirrored to brain artifact successfully!');
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
