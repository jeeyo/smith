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
    console.log(`Copied ${fileName} to artifact images.`);
  }
}

async function capture() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 1440, height: 960 }
  });

  const page = await browser.newPage();
  console.log('Opening http://localhost:4100...');
  await page.goto('http://localhost:4100', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Capture New Session Modal with Orchestrator Agent Selection & Multi-Worker slots
  console.log('Opening New Session Modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const newSessionBtn = buttons.find(b => b.textContent?.includes('New Session'));
    if (newSessionBtn) newSessionBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Add another worker slot to demonstrate multi-worker support (e.g. second Claude worker)
  console.log('Adding an extra worker slot...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addWorkerBtn = buttons.find(b => b.textContent?.includes('Add Worker'));
    if (addWorkerBtn) addWorkerBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  console.log('Capturing New Session Modal...');
  const modalPath = path.join(outputDir, 'screenshot_new_session_dialog.png');
  await page.screenshot({ path: modalPath, fullPage: false });
  copyToArtifact('screenshot_new_session_dialog.png');

  // Also focus on Worker #1 model select to demonstrate only official Claude models are listed
  const workerSelects = await page.$$('select');
  if (workerSelects.length >= 2) {
    console.log('Inspecting Worker #1 model options...');
    const options = await page.evaluate((el) => {
      const select = el as HTMLSelectElement;
      return Array.from(select.options).map(o => o.text);
    }, workerSelects[1]);
    console.log('Worker #1 model options:', options);
  }

  // Close the modal
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelBtn = buttons.find(b => b.textContent?.includes('Cancel'));
    if (cancelBtn) cancelBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 2. Dispatch a goal to demonstrate the Orchestrator with Interactive Questions
  console.log('Dispatching goal in UI to test orchestrator & interactive questions...');
  await page.click('textarea');
  await page.type('textarea', 'Build an authentication service with Ed25519 tokens, route guards, and integration tests');
  await new Promise(r => setTimeout(r, 400));
  
  await page.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) {
      submitBtn.click();
    }
  });

  console.log('Waiting for orchestrator response and question cards...');
  await new Promise(r => setTimeout(r, 6500));

  // 3. Answer one question in the UI
  console.log('Answering first question in UI...');
  await page.evaluate(() => {
    const allDivs = Array.from(document.querySelectorAll('div'));
    const edOption = allDivs.find(el => el.textContent?.includes('Ed25519 asymmetric signatures') && el.classList.contains('cursor-pointer'));
    if (edOption) {
      (edOption as HTMLElement).click();
    }
  });

  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const submitChoiceBtn = buttons.find(b => b.textContent?.includes('Submit Choice'));
    if (submitChoiceBtn) {
      submitChoiceBtn.click();
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // Scroll directly to the interactive questions so they are centered in the viewport
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto');
    if (container) {
      container.scrollTop = 150;
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // 4. Capture interactive question state in chat
  console.log('Capturing Interactive Questions in Goal Chat...');
  const chatQuestionsPath = path.join(outputDir, 'screenshot_interactive_questions.png');
  await page.screenshot({ path: chatQuestionsPath, fullPage: false });
  copyToArtifact('screenshot_interactive_questions.png');

  // Also capture Customizations Drawer to show hot-reloading orchestrator agent/model
  console.log('Opening Customizations Drawer...');
  await page.evaluate(() => {
    const customBtn = document.querySelector('button[title*="Session Skills"]') as HTMLButtonElement;
    if (customBtn) customBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Capturing Customizations Drawer with Lead Orchestrator agent...');
  const drawerPath = path.join(outputDir, 'screenshot_orchestrator_customizations.png');
  await page.screenshot({ path: drawerPath, fullPage: false });
  copyToArtifact('screenshot_orchestrator_customizations.png');

  await browser.close();
  console.log('Screenshots captured successfully!');
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
