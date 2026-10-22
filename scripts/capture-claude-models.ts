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
  await new Promise(r => setTimeout(r, 1200));

  // 1. Open New Session Modal
  console.log('Opening New Session Modal...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[title="New Session"]') as HTMLElement;
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Add another worker to show multiple workers capability
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addWorkerBtn = buttons.find(b => b.textContent?.includes('Add Worker'));
    if (addWorkerBtn) addWorkerBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Switch Worker 1 to Claude
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    // In Worker Slots, each slot has agent select then model select
    // Slot 1 agent select
    if (selects[0]) {
      selects[0].value = 'claude';
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 500));

  console.log('Capturing New Session Modal with Dynamic Claude Models...');
  const newSessionModalPath = path.join(outputDir, 'screenshot_dynamic_claude_models.png');
  await page.screenshot({ path: newSessionModalPath });
  copyToArtifact('screenshot_dynamic_claude_models.png');

  // Close New Session Modal
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const cancelBtn = buttons.find(b => b.textContent?.trim() === 'Cancel');
    if (cancelBtn) cancelBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Open Customizations Drawer
  console.log('Opening Customizations Drawer...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[title="Session Skills & MCP Servers"]') as HTMLElement;
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Select Claude for Orchestrator in Customizations Drawer
  await page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    const claudeRadio = radios.find(r => r.value === 'claude');
    if (claudeRadio) {
      claudeRadio.click();
    }
  });
  await new Promise(r => setTimeout(r, 600));

  console.log('Capturing Customizations Drawer with Claude Orchestrator...');
  const customDrawerPath = path.join(outputDir, 'screenshot_customizations_claude_models.png');
  await page.screenshot({ path: customDrawerPath });
  copyToArtifact('screenshot_customizations_claude_models.png');

  await browser.close();
  console.log('Screenshots completed successfully!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
