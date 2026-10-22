import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fork } from 'node:child_process';

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

async function run() {
  console.log('Starting Smith ADE server...');
  const serverProcess = fork('dist-server/index.cjs', [], {
    env: { ...process.env, PORT: '4100', NODE_ENV: 'production' }
  });

  await new Promise(r => setTimeout(r, 2000));

  console.log('Launching browser to capture UI...');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 1440, height: 900 }
  });

  try {
    const page = await browser.newPage();
    console.log('Navigating to http://localhost:4100...');
    await page.goto('http://localhost:4100', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));

    // 1. Capture Main View with Left Sidebar
    const sidebarPath = path.join(outputDir, 'screenshot_left_sidebar_chat_list.png');
    await page.screenshot({ path: sidebarPath });
    copyToArtifact('screenshot_left_sidebar_chat_list.png');
    console.log('Captured screenshot_left_sidebar_chat_list.png');

    // 2. Open App Settings Configuration page
    console.log('Opening App Configuration...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.innerText.includes('App Configuration') || b.title?.includes('Settings'));
      if (target) (target as HTMLButtonElement).click();
    });

    await new Promise(r => setTimeout(r, 2000));

    // Capture Settings: Agent Binaries tab
    const settingsAgentsPath = path.join(outputDir, 'screenshot_settings_agent_binaries.png');
    await page.screenshot({ path: settingsAgentsPath });
    copyToArtifact('screenshot_settings_agent_binaries.png');
    console.log('Captured screenshot_settings_agent_binaries.png');

    // Switch to Hindsight tab
    console.log('Switching to Vectorize Hindsight tab...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const tab = btns.find(b => b.innerText.includes('Vectorize Hindsight'));
      if (tab) (tab as HTMLButtonElement).click();
    });
    await new Promise(r => setTimeout(r, 1500));

    const settingsHindsightPath = path.join(outputDir, 'screenshot_settings_hindsight.png');
    await page.screenshot({ path: settingsHindsightPath });
    copyToArtifact('screenshot_settings_hindsight.png');
    console.log('Captured screenshot_settings_hindsight.png');

    // Switch to App & Workspace tab
    console.log('Switching to App & Workspace tab...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const tab = btns.find(b => b.innerText.includes('App & Workspace'));
      if (tab) (tab as HTMLButtonElement).click();
    });
    await new Promise(r => setTimeout(r, 1500));

    const settingsAppPath = path.join(outputDir, 'screenshot_settings_app_workspace.png');
    await page.screenshot({ path: settingsAppPath });
    copyToArtifact('screenshot_settings_app_workspace.png');
    console.log('Captured screenshot_settings_app_workspace.png');

    console.log('All screenshots captured successfully!');
  } finally {
    await browser.close();
    serverProcess.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
