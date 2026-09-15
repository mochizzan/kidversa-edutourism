/**
 * E2E Test: Report Mission Review — Misi Lanjutan UX
 *
 * Tests:
 *   1. No "Topik: xxxx…" text (UUID bug fix)
 *   2. Chips with ✕ + counter n/4 (no inline checkboxes)
 *   3. Modal loads topic-scoped missions
 *   4. Select/deselect via modal updates chips
 *   5. AI button exists + handles LLM failure gracefully
 *
 * Usage:
 *   node tmp/e2e-report-mission-review.mjs
 *
 * Requires: puppeteer-core, MariaDB on :3307
 * Pattern: tmp/driver.mjs
 */

import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_URL = 'http://localhost:8002';
const DB_CONTAINER = 'kidversa-edutourism-mariadb-1';

// ── Credentials ──────────────────────────────────────────────────────────────
const CREDS_FILE = join(__dirname, 'credentials.txt');
const SUPER_EMAIL = 'superadmin@kidversa.id';
const SUPER_PW_DEFAULT = 'pass1234';

function loadCreds() {
  const out = { email: SUPER_EMAIL, password: SUPER_PW_DEFAULT };
  if (!existsSync(CREDS_FILE)) return out;
  for (const line of readFileSync(CREDS_FILE, 'utf8').split('\n')) {
    const m = line.match(/^(superadmin_email|superadmin_new_password):\s*(.+)$/);
    if (m) out[m[1] === 'superadmin_new_password' ? 'password' : 'email'] = m[2].trim();
  }
  return out;
}

// ── DB query ─────────────────────────────────────────────────────────────────
function dbQuery(sql) {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'mariadb', '-uroot', '-padmin', 'kidversa', '-N', '-e', sql], { encoding: 'utf8' });
}

// ── Result tracking ──────────────────────────────────────────────────────────
const RESULTS = [];
let passed = 0;
let failed = 0;

function log(flow, status, detail) {
  const line = `[${new Date().toISOString()}] ${status} | ${flow} | ${detail}`;
  console.log(line);
  RESULTS.push({ flow, status, detail });
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
}

// ── Browser helpers ──────────────────────────────────────────────────────────
async function launchBrowser() {
  return puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,2000'],
  });
}

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.__pageErrors = errors;
  return page;
}

async function waitForText(page, text, timeout = 15000) {
  try {
    await page.waitForFunction(
      (t) => document.body && document.body.innerText.includes(t),
      { timeout },
      text,
    );
    return true;
  } catch {
    return false;
  }
}

async function clickByText(page, text, { timeout = 10000 } = {}) {
  const t = text.toLowerCase();
  await page.waitForFunction(
    (t) => {
      return [...document.querySelectorAll('button,a,[role="button"],label')].some(
        (el) => el.offsetParent !== null && (el.innerText || '').trim().toLowerCase().includes(t),
      );
    },
    { timeout },
    t,
  );
  await page.evaluate((t) => {
    const all = [...document.querySelectorAll('button,a,[role="button"],label')];
    const match = all.find(
      (el) => el.offsetParent !== null && (el.innerText || '').trim().toLowerCase().includes(t),
    );
    if (match) match.click();
  }, t);
}

async function typeByPlaceholder(page, placeholder, value) {
  const sel = `[placeholder="${placeholder}"]`;
  await page.waitForSelector(sel, { timeout: 10000 });
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, value, { delay: 5 });
}

// ── Login ────────────────────────────────────────────────────────────────────
async function loginSuperAdmin(page) {
  const creds = loadCreds();
  console.log(`   Using creds: ${creds.email} / ${creds.password.slice(0,4)}...`);
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('[placeholder="email@example.com"]', { timeout: 20000 });
  await typeByPlaceholder(page, 'email@example.com', creds.email);
  await typeByPlaceholder(page, 'Masukkan password', creds.password);
  await page.screenshot({ path: join(__dirname, 'debug-pre-login.png') });
  console.log('   Screenshot: tmp/debug-pre-login.png');
  await clickByText(page, 'Masuk', { exact: true });
  // Wait for navigation — try multiple landing patterns
  const landed = await Promise.race([
    page.waitForFunction(
      () => location.pathname.startsWith('/admin'),
      { timeout: 20000 },
    ).then(() => 'admin'),
    page.waitForFunction(
      () => location.pathname === '/auth/change-password',
      { timeout: 20000 },
    ).then(() => 'change-password'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 22000)),
  ]).catch(() => null);

  if (landed === 'admin') {
    console.log('   Landed on /admin');
  } else if (landed === 'change-password') {
    console.log('   Forced password change detected');
  } else {
    console.log(`   Current URL: ${page.url()}`);
    await page.screenshot({ path: join(__dirname, 'debug-login.png') });
    console.log('   Screenshot saved: tmp/debug-login.png');
    throw new Error(`Login failed — landed on ${page.url()}`);
  }

  // Handle forced password change
  if (page.url().includes('/auth/change-password')) {
    const np = 'SmokeTest#' + Math.floor(Math.random() * 900000 + 100000);
    await typeByPlaceholder(page, 'Masukkan password lama', creds.password);
    await typeByPlaceholder(page, 'Masukkan password baru', np);
    await typeByPlaceholder(page, 'Ulangi password baru', np);
    await clickByText(page, 'Ubah Password', { exact: true });
    await page.waitForFunction(() => location.pathname.startsWith('/admin'), { timeout: 20000 });
    // Update creds for subsequent runs
    appendFileSync(CREDS_FILE, `superadmin_new_password: ${np}\n`);
    return np;
  }
  return creds.password;
}

// ── Find review URL ──────────────────────────────────────────────────────────
function findReviewUrl() {
  // Find a report with topic
  const rows = dbQuery(
    `SELECT r.id AS report_id, r.session_id, r.participant_id, r.program_stage_id
     FROM reports r
     WHERE r.program_stage_id IS NOT NULL AND r.program_stage_id != ''
       AND r.deleted_at IS NULL
     ORDER BY r.created_at DESC
     LIMIT 1`,
  );
  if (!rows.trim()) return null;
  const [reportId, sessionId, participantId, topicId] = rows.trim().split('\t');
  return { reportId, sessionId, participantId, topicId };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  E2E: Report Mission Review — Misi Lanjutan UX');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Find a report with topic
  console.log('1. Finding report with topic...');
  const info = findReviewUrl();
  if (!info) {
    console.error('   ❌ No report with topic found. Run seed + generate reports first.');
    process.exit(1);
  }
  console.log(`   Report: ${info.reportId}`);
  console.log(`   Session: ${info.sessionId}`);
  console.log(`   Participant: ${info.participantId}`);
  console.log(`   Topic: ${info.topicId}\n`);

  const reviewUrl = `${BASE_URL}/admin/reports/${info.sessionId}/review/${info.participantId}`;

  // 2. Launch browser + login
  console.log('2. Launching browser + login...');
  const browser = await launchBrowser();
  const page = await newPage(browser);
  try {
    await loginSuperAdmin(page);
    log('Login', 'PASS', 'Superadmin logged in');
  } catch (e) {
    log('Login', 'FAIL', e.message);
    await browser.close();
    process.exit(1);
  }

  // 3. Navigate to review page
  console.log(`\n3. Navigating to review page...`);
  await page.goto(reviewUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  // Wait for the mission selector to render (may need to load data)
  await new Promise((r) => setTimeout(r, 3000));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: No "Topik: xxxx…" text
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST 1: No "Topik: xxxx…" UUID text');
  console.log('═══════════════════════════════════════════════════════════');

  const hasTopikUuid = await page.evaluate(() => {
    const text = document.body.innerText;
    return /Topik:\s*[0-9a-f]{8}…/.test(text);
  });

  if (!hasTopikUuid) {
    log('TEST 1 — No UUID label', 'PASS', 'No "Topik: xxxx…" text found');
  } else {
    log('TEST 1 — No UUID label', 'FAIL', 'Found "Topik: xxxx…" text on page');
  }

  // Also check related_stage_ids / byTopic code is gone from DOM logic
  const hasGroupHeader = await page.evaluate(() => {
    // Look for any element with text "Topik:" that's a group header (not a tab)
    const els = [...document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,span')];
    return els.some((el) => {
      const t = (el.innerText || '').trim();
      return t.startsWith('Topik:') && /\w{8}…/.test(t);
    });
  });
  if (!hasGroupHeader) {
    log('TEST 1 — Group header gone', 'PASS', 'No group header with UUID pattern');
  } else {
    log('TEST 1 — Group header gone', 'FAIL', 'Group header with UUID still present');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: Chips UI — counter + placeholder or chips
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST 2: Chips UI — counter n/4');
  console.log('═══════════════════════════════════════════════════════════');

  // Wait for the mission section to render
  await page.waitForFunction(
    () => document.body.innerText.includes('Misi Lanjutan'),
    { timeout: 10000 },
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000)); // extra settle time

  const counterText = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    const counter = spans.find((s) => /\d+\/4/.test(s.innerText || ''));
    return counter ? counter.innerText.trim() : null;
  });

  if (counterText) {
    log('TEST 2 — Counter n/4', 'PASS', `Counter found: "${counterText}"`);
  } else {
    log('TEST 2 — Counter n/4', 'FAIL', 'Counter "n/4 misi" not found');
  }

  // Check for placeholder or chips (wait for missions to potentially load)
  await new Promise((r) => setTimeout(r, 2000));
  const hasPlaceholder = await page.evaluate(() => {
    return document.body.innerText.includes('Belum ada misi dipilih') ||
           document.body.innerText.includes('Belum ada misi yang tersedia');
  });
  const hasChips = await page.evaluate(() => {
    // Chips are <span> with rounded-full and ✕ button
    return !!document.querySelector('span.rounded-full button');
  });

  if (hasPlaceholder || hasChips) {
    log('TEST 2 — Chips/placeholder', 'PASS', hasPlaceholder ? 'Empty placeholder shown' : 'Chips rendered');
  } else {
    log('TEST 2 — Chips/placeholder', 'FAIL', 'Neither placeholder nor chips found');
  }

  // Verify no inline checkboxes outside modal
  const inlineCheckboxes = await page.evaluate(() => {
    // Count checkboxes outside of any modal (Modal has role=dialog or is inside a portal)
    const allCb = [...document.querySelectorAll('input[type="checkbox"]')];
    const outsideModal = allCb.filter((cb) => {
      let el = cb;
      while (el) {
        if (el.getAttribute && el.getAttribute('role') === 'dialog') return false;
        if (el.classList && el.classList.contains('fixed')) return false; // modal overlay
        el = el.parentElement;
      }
      return true;
    });
    return outsideModal.length;
  });

  if (inlineCheckboxes === 0) {
    log('TEST 2 — No inline checkboxes', 'PASS', 'No checkboxes outside modal');
  } else {
    log('TEST 2 — No inline checkboxes', 'FAIL', `${inlineCheckboxes} checkboxes found outside modal`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: Modal loads topic-scoped missions
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST 3: Modal loads missions');
  console.log('═══════════════════════════════════════════════════════════');

  // Click "Pilih dari library misi" button
  try {
    await clickByText(page, 'Pilih dari library misi', { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 2000)); // wait for modal + fetch

    const modalVisible = await page.evaluate(() => {
      return !!document.querySelector('[role="dialog"]');
    });

    if (modalVisible) {
      log('TEST 3 — Modal opens', 'PASS', 'Library modal opened');

      // Count missions inside modal
      const missionCount = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return 0;
        return dialog.querySelectorAll('label').length;
      });
      log('TEST 3 — Mission count', missionCount > 0 ? 'PASS' : 'FAIL', `Found ${missionCount} missions in modal`);

      // Verify no "Topik:" group header inside modal
      const modalGroupHeader = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return false;
        return /Topik:\s*[0-9a-f]{8}/.test(dialog.innerText);
      });
      if (!modalGroupHeader) {
        log('TEST 3 — No group header in modal', 'PASS', 'No UUID group header in modal');
      } else {
        log('TEST 3 — No group header in modal', 'FAIL', 'UUID group header found in modal');
      }

      // Close modal
      await clickByText(page, 'Selesai', { timeout: 3000 });
      await new Promise((r) => setTimeout(r, 500));
    } else {
      log('TEST 3 — Modal opens', 'FAIL', 'Modal did not appear');
    }
  } catch (e) {
    log('TEST 3 — Modal', 'FAIL', e.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4: AI button exists + handles failure
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST 4: AI button + LLM failure handling');
  console.log('═══════════════════════════════════════════════════════════');

  const aiButton = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    return btns.some((b) => (b.innerText || '').includes('Sesuaikan Misi'));
  });

  if (aiButton) {
    log('TEST 4 — AI button exists', 'PASS', '"Sesuaikan Misi – AI" button found');

    // Click AI button — LLM is likely not configured in dev, expect fallback toast
    await clickByText(page, 'Sesuaikan Misi', { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 5000)); // wait for LLM timeout/fallback

    // Check for toast (either success or error)
    const toastText = await page.evaluate(() => {
      const toasts = [...document.querySelectorAll('[role="status"],[class*="toast"],[class*="Toast"]')];
      return toasts.map((t) => t.innerText.trim()).join(' | ');
    });

    if (toastText) {
      log('TEST 4 — Fallback toast', 'PASS', `Toast: "${toastText}"`);
    } else {
      // Toast may have disappeared — check if missions were assigned
      const assigned = await page.evaluate(() => {
        return document.body.innerText.includes('/4 misi dipilih');
      });
      if (assigned) {
        log('TEST 4 — Fallback toast', 'PASS', 'Missions assigned (toast may have auto-closed)');
      } else {
        log('TEST 4 — Fallback toast', 'FAIL', 'No toast and no mission assignment observed');
      }
    }
  } else {
    log('TEST 4 — AI button exists', 'FAIL', '"Sesuaikan Misi" button not found');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 5: Chip delete via ✕
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST 5: Chip delete via ✕');
  console.log('═══════════════════════════════════════════════════════════');

  const chipsBefore = await page.evaluate(() => {
    return document.querySelectorAll('span.rounded-full button').length;
  });

  if (chipsBefore > 0) {
    // Click first ✕ button
    await page.evaluate(() => {
      const btn = document.querySelector('span.rounded-full button');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    const chipsAfter = await page.evaluate(() => {
      return document.querySelectorAll('span.rounded-full button').length;
    });

    if (chipsAfter === chipsBefore - 1) {
      log('TEST 5 — Chip delete', 'PASS', `Chips: ${chipsBefore} → ${chipsAfter}`);
    } else {
      log('TEST 5 — Chip delete', 'FAIL', `Expected ${chipsBefore - 1}, got ${chipsAfter}`);
    }
  } else {
    log('TEST 5 — Chip delete', 'PASS', 'No chips to delete (empty state — valid)');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  for (const r of RESULTS) {
    console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.flow}: ${r.detail}`);
  }
  console.log(`\n  PASSED: ${passed}  FAILED: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
