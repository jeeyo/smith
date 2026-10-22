import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactImgDir = 'C:\\Users\\jeeyo\\.gemini\\antigravity\\brain\\d6b8f8c2-3e56-4f8c-b8c6-f682efab6ef7\\images';

async function testAndCapture() {
  console.log('Launching browser for 4-Agent Mechanisms & Observer verification...');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 1440, height: 960 }
  });

  const page = await browser.newPage();
  console.log('Navigating to http://localhost:4100...');
  await page.goto('http://localhost:4100', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // Dispatch a goal to exercise the full pipeline
  console.log('Dispatching goal in UI...');
  await page.type('textarea', 'Build an authentication service with Ed25519 tokens, route guards, and integration tests');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const run = buttons.find(b => b.textContent?.includes('Run'));
    run?.click();
  });

  // Wait for goal execution & observer signoff
  console.log('Waiting for cooperative phases & observer audit...');
  await new Promise(r => setTimeout(r, 4500));

  // 1. Capture Main Goal Chat showing The Observer Verification Harness Card
  console.log('Capturing screenshot_observer_harness.png...');
  await page.screenshot({ path: path.join(artifactImgDir, 'screenshot_observer_harness.png') });

  // 2. Open Behind the scenes drawer
  console.log('Opening Behind the scenes drawer...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const opsBtn = buttons.find(b => b.textContent?.includes('Behind the scenes'));
    opsBtn?.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click Dual Memory tab
  console.log('Clicking Dual Memory tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const memTab = buttons.find(b => b.textContent?.includes('Dual Memory'));
    memTab?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  console.log('Capturing screenshot_dual_memory_tab.png...');
  await page.screenshot({ path: path.join(artifactImgDir, 'screenshot_dual_memory_tab.png') });

  // Click Peer Broadcast tab
  console.log('Clicking Peer Broadcast tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const bcastTab = buttons.find(b => b.textContent?.includes('Peer Broadcast'));
    bcastTab?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  console.log('Capturing screenshot_peer_broadcast_tab.png...');
  await page.screenshot({ path: path.join(artifactImgDir, 'screenshot_peer_broadcast_tab.png') });

  // Click Observer tab in drawer
  console.log('Clicking Observer telemetry tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const obsTab = buttons.find(b => b.textContent?.includes('Observer') && b.querySelector('svg'));
    obsTab?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  console.log('Capturing screenshot_observer_telemetry_tab.png...');
  await page.screenshot({ path: path.join(artifactImgDir, 'screenshot_observer_telemetry_tab.png') });

  await browser.close();
  console.log('All 4-Agent collaboration screenshots captured successfully!');
}

testAndCapture().catch(err => {
  console.error('Test and capture failed:', err);
  process.exit(1);
});
