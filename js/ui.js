// ── UI HANDLERS ───────────────────────────────────────────
// Event handlers, form logic, modals, export/import.
// All data-mutating functions are async (IndexedDB writes are async).
// Functions are exposed on window so inline HTML onclick attributes work.

import { state } from './state.js';
import * as db from './db.js';
import { getRollingDayTrades } from './pdt.js';
import { render, renderTable } from './render.js';

// ── HELPERS ───────────────────────────────────────────────

// Derive outcome purely from P&L — no manual selection needed.
function calcOutcome(pnl) {
  if (pnl === null) return '';   // open position
  if (pnl > 0)  return 'WIN';
  if (pnl < 0)  return 'LOSS';
  return 'BE';
}

// A position with an exit price was opened and closed on the same date
// (single date field = same day). No exit = still open, not a day trade yet.
function calcIsDayTrade(exit) {
  return exit !== null;
}

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function localTimeStr(d = new Date()) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function blobToBase64(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataURL) {
  const [header, data] = dataURL.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mimeType  = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary    = atob(data);
  const bytes     = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

// ── LOG TRADE ─────────────────────────────────────────────
async function logTrade() {
  const ticker = document.getElementById('f-ticker').value.trim().toUpperCase();
  const dir    = document.getElementById('f-dir').value;
  const date   = document.getElementById('f-date').value;
  const time   = document.getElementById('f-time').value;
  const entry  = parseFloat(document.getElementById('f-entry').value);
  const exit   = parseFloat(document.getElementById('f-exit').value) || null;
  const size   = parseFloat(document.getElementById('f-size').value) || null;
  const rr     = document.getElementById('f-rr').value.trim();
  const reason = document.getElementById('f-reason').value.trim();
  const notes  = document.getElementById('f-notes').value.trim();
  const ssFile = document.getElementById('f-screenshot').files[0] || null;

  if (!ticker || !date || !entry) {
    alert('Please fill in Ticker, Date, and Entry Price at minimum.');
    return;
  }

  const pnl        = (exit && size) ? (dir === 'LONG' ? (exit - entry) * size : (entry - exit) * size) : null;
  const isDayTrade = calcIsDayTrade(exit);
  const outcome    = calcOutcome(pnl);

  // PDT pre-check
  if (isDayTrade) {
    const rolling = getRollingDayTrades(state.trades, date);
    if (rolling >= 4) {
      if (!confirm(`⚠️ WARNING: This would be your ${rolling + 1}th day trade in the rolling 5-day window.\n\nLogging this trade may flag your account as a Pattern Day Trader (PDT).\n\nContinue anyway?`)) return;
    }
  }

  const trade = {
    id: Date.now(),
    ticker, dir, date, time, entry, exit, size, rr,
    isDayTrade, reason, outcome, notes, pnl,
    hasScreenshot: !!ssFile,
  };

  state.trades.unshift(trade);
  await db.putTrade(trade);

  if (ssFile) {
    await db.putScreenshot(trade.id, ssFile);
    state.screenshotURLs.set(trade.id, URL.createObjectURL(ssFile));
  }

  resetForm();
  render();
}

// ── EDIT MODAL ────────────────────────────────────────────
function openEditModal(id) {
  const t = state.trades.find(x => x.id === id);
  if (!t) return;
  state.editTradeId = id;

  document.getElementById('e-ticker').value   = t.ticker;
  document.getElementById('e-dir').value      = t.dir;
  document.getElementById('e-date').value     = t.date;
  document.getElementById('e-time').value     = t.time || '';
  document.getElementById('e-entry').value    = t.entry;
  document.getElementById('e-exit').value     = t.exit || '';
  document.getElementById('e-size').value     = t.size || '';
  document.getElementById('e-rr').value       = t.rr || '';
  document.getElementById('e-reason').value   = t.reason || '';
  document.getElementById('e-notes').value    = t.notes || '';
  document.getElementById('e-screenshot').value = '';
  document.getElementById('e-ss-upload-wrap').classList.remove('has-file');
  document.getElementById('e-ss-label').textContent = '📷 \u00a0Replace screenshot';

  const previewSrc = state.screenshotURLs.get(t.id);
  document.getElementById('e-ss-preview').innerHTML = previewSrc
    ? `<img src="${previewSrc}" style="max-width:100%;max-height:120px;border-radius:4px;border:1px solid var(--border2);display:block;margin-bottom:4px;cursor:pointer;" onclick="openLightbox(${t.id})">`
    : '';

  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  state.editTradeId = null;
}

function onEditScreenshotChange(input) {
  const wrap  = document.getElementById('e-ss-upload-wrap');
  const label = document.getElementById('e-ss-label');
  if (input.files && input.files[0]) {
    wrap.classList.add('has-file');
    label.textContent = '✓ \u00a0' + input.files[0].name;
  } else {
    wrap.classList.remove('has-file');
    label.textContent = '📷 \u00a0Replace screenshot';
  }
}

async function saveEdit() {
  const idx = state.trades.findIndex(x => x.id === state.editTradeId);
  if (idx === -1) return;

  const ticker = document.getElementById('e-ticker').value.trim().toUpperCase();
  const entry  = parseFloat(document.getElementById('e-entry').value);
  if (!ticker || !entry) { alert('Ticker and Entry Price are required.'); return; }

  const dir    = document.getElementById('e-dir').value;
  const date   = document.getElementById('e-date').value;
  const time   = document.getElementById('e-time').value;
  const exit   = parseFloat(document.getElementById('e-exit').value) || null;
  const size   = parseFloat(document.getElementById('e-size').value) || null;
  const rr     = document.getElementById('e-rr').value.trim();
  const reason = document.getElementById('e-reason').value.trim();
  const notes  = document.getElementById('e-notes').value.trim();

  const pnl        = (exit && size) ? (dir === 'LONG' ? (exit - entry) * size : (entry - exit) * size) : null;
  const isDayTrade = calcIsDayTrade(exit);
  const outcome    = calcOutcome(pnl);

  const ssFile     = document.getElementById('e-screenshot').files[0] || null;
  const existingId = state.trades[idx].id;
  let hasScreenshot = state.trades[idx].hasScreenshot;

  if (ssFile) {
    const oldURL = state.screenshotURLs.get(existingId);
    if (oldURL) URL.revokeObjectURL(oldURL);
    await db.putScreenshot(existingId, ssFile);
    state.screenshotURLs.set(existingId, URL.createObjectURL(ssFile));
    hasScreenshot = true;
  }

  state.trades[idx] = {
    ...state.trades[idx],
    ticker, dir, date, time, entry, exit, size, rr,
    isDayTrade, reason, outcome, notes, pnl,
    hasScreenshot,
  };

  await db.putTrade(state.trades[idx]);
  render();
  closeEditModal();
}

// ── DETAIL MODAL ──────────────────────────────────────────
function showDetail(id) {
  const t = state.trades.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-title').textContent =
    `▶ ${t.ticker} — ${t.date} ${t.time || ''}`;

  const rows = [
    ['Direction',         t.dir],
    ['Day Trade',         t.isDayTrade ? 'Yes ⚡' : 'No'],
    ['Entry Price',       `$${t.entry.toFixed(2)}`],
    ['Exit Price',        t.exit ? `$${t.exit.toFixed(2)}` : 'Open'],
    ['Size',              t.size ? `${t.size} shares` : '—'],
    ['P&L',               t.pnl !== null ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}` : '—'],
    ['Planned R:R',       t.rr || '—'],
    ['Outcome',           t.outcome || 'Open'],
    ['Entry Reason',      t.reason || '—'],
    ['Post-Trade Notes',  t.notes || '—'],
  ];

  const ssSrc = state.screenshotURLs.get(t.id);
  const ssHtml = ssSrc
    ? `<div style="margin-bottom:16px;">
         <div class="modal-detail-key" style="margin-bottom:8px;">SCREENSHOT</div>
         <img src="${ssSrc}" style="width:100%;border-radius:6px;border:1px solid var(--border2);cursor:pointer;"
              onclick="openLightbox(${t.id})">
       </div>`
    : '';

  document.getElementById('modal-body').innerHTML = ssHtml + rows.map(([k, v]) =>
    `<div class="modal-detail-row">
      <span class="modal-detail-key">${k}</span>
      <span class="modal-detail-val">${v}</span>
    </div>`
  ).join('');

  document.getElementById('detail-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('detail-modal').classList.remove('open');
}

// ── LIGHTBOX ──────────────────────────────────────────────
function openLightbox(id) {
  const ssSrc = state.screenshotURLs.get(id);
  if (!ssSrc) return;
  document.getElementById('lightbox-img').src = ssSrc;
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightbox-img').src = '';
}

// ── FILTER TOGGLE ─────────────────────────────────────────
function setFilter(val, el) {
  state.currentFilter = val;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderTable();
}

// ── DELETE / CLEAR ────────────────────────────────────────
async function deleteTrade(id) {
  const url = state.screenshotURLs.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    state.screenshotURLs.delete(id);
  }
  state.trades = state.trades.filter(t => t.id !== id);
  await db.deleteTrade(id);
  await db.deleteScreenshot(id);
  render();
}

async function confirmClearAll() {
  if (state.trades.length === 0) { alert('Nothing to clear.'); return; }
  if (!confirm('Delete ALL trades? This cannot be undone.')) return;

  for (const [, url] of state.screenshotURLs) URL.revokeObjectURL(url);
  state.screenshotURLs.clear();
  state.trades = [];
  await db.clearAllTrades();
  render();
}

// ── FORM RESET ────────────────────────────────────────────
function resetForm() {
  document.getElementById('f-ticker').value     = '';
  document.getElementById('f-exit').value       = '';
  document.getElementById('f-size').value       = '';
  document.getElementById('f-rr').value         = '';
  document.getElementById('f-reason').value     = '';
  document.getElementById('f-notes').value      = '';
  document.getElementById('f-screenshot').value = '';
  document.getElementById('ss-label').textContent = '📷 \u00a0Click to attach chart screenshot';
  document.getElementById('ss-upload-wrap').classList.remove('has-file');
  // Update time to now so next trade has current timestamp; keep the date
  document.getElementById('f-time').value = localTimeStr();
}

// ── SCREENSHOT UPLOAD LABELS ──────────────────────────────
function onScreenshotChange(input) {
  const wrap  = document.getElementById('ss-upload-wrap');
  const label = document.getElementById('ss-label');
  if (input.files && input.files[0]) {
    wrap.classList.add('has-file');
    label.textContent = '✓ \u00a0' + input.files[0].name;
  } else {
    wrap.classList.remove('has-file');
    label.textContent = '📷 \u00a0Click to attach chart screenshot';
  }
}

// ── EXPORT / IMPORT ───────────────────────────────────────
async function exportTrades() {
  const exportData = await Promise.all(state.trades.map(async t => {
    if (!t.hasScreenshot) return { ...t };
    const blob = await db.getScreenshot(t.id);
    if (!blob) return { ...t };
    const base64 = await blobToBase64(blob);
    return { ...t, screenshot: base64 };
  }));
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
  const link    = document.createElement('a');
  link.setAttribute('href', dataUri);
  link.setAttribute('download', 'tradebook_backup.json');
  link.click();
}

async function importTrades(importedArray, replace) {
  if (replace) {
    for (const [, url] of state.screenshotURLs) URL.revokeObjectURL(url);
    state.screenshotURLs.clear();
    state.trades = [];
    await db.clearAllTrades();
  }

  for (const raw of importedArray) {
    const { screenshot, ...trade } = raw;

    // Recalculate derived fields so imported data is always consistent
    trade.isDayTrade = calcIsDayTrade(trade.exit);
    trade.outcome    = calcOutcome(trade.pnl);

    if (screenshot) {
      trade.hasScreenshot = true;
      await db.putTrade(trade);
      const blob = base64ToBlob(screenshot);
      await db.putScreenshot(trade.id, blob);
      state.screenshotURLs.set(trade.id, URL.createObjectURL(blob));
    } else {
      trade.hasScreenshot = trade.hasScreenshot || false;
      await db.putTrade(trade);
    }

    const existingIdx = state.trades.findIndex(t => t.id === trade.id);
    if (existingIdx !== -1) state.trades.splice(existingIdx, 1);
    state.trades.push(trade);
  }

  state.trades.sort((a, b) => b.id - a.id);
  render();
}

// ── EVENT LISTENERS ───────────────────────────────────────
document.getElementById('detail-modal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

document.getElementById('edit-modal').addEventListener('click', function (e) {
  if (e.target === this) closeEditModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeLightbox(); closeEditModal(); closeModal(); }
});

// Open the native date/time picker on any click inside the field —
// not just on the small calendar/clock icon (works across all inputs in
// the main form and the edit modal via event delegation).
document.addEventListener('click', e => {
  const el = e.target;
  if ((el.type === 'date' || el.type === 'time') && typeof el.showPicker === 'function') {
    el.showPicker();
  }
});

document.getElementById('import-file').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (ev) {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) {
        alert('Invalid JSON format. Expected an array of trades.');
        return;
      }
      const replace = confirm('Replace current trades with imported data? Cancel to merge.');
      await importTrades(imported, replace);
      alert('Trades imported successfully.');
    } catch {
      alert('Error parsing JSON file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ── GLOBAL EXPOSURE ───────────────────────────────────────
// Required because HTML uses inline onclick="fnName()" attributes.
// ES modules don't pollute the global scope, so we expose explicitly.
Object.assign(window, {
  logTrade,
  setFilter,
  confirmClearAll,
  exportTrades,
  onScreenshotChange,
  closeModal,
  closeLightbox,
  saveEdit,
  closeEditModal,
  onEditScreenshotChange,
  showDetail,
  openEditModal,
  deleteTrade,
  openLightbox,
});
