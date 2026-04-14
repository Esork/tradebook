// ── ENTRY POINT ───────────────────────────────────────────
// Initializes the app: opens IndexedDB, loads trades, eager-loads screenshot
// ObjectURLs, runs a one-time localStorage migration, then renders.

import { openDB, getAllTrades, getScreenshot, putTrade, putScreenshot } from './db.js';
import { state } from './state.js';
import { render } from './render.js';
import './ui.js'; // registers event listeners and exposes functions to window

// ── ONE-TIME MIGRATION FROM localStorage ──────────────────
// Runs only if the old tradebook_v1 key exists. Converts each trade's
// base64 screenshot string to an IndexedDB Blob, then removes the old key.
async function migrateFromLocalStorage() {
  const raw = localStorage.getItem('tradebook_v1');
  if (!raw) return;

  let oldTrades;
  try {
    oldTrades = JSON.parse(raw);
    if (!Array.isArray(oldTrades)) throw new Error('not an array');
  } catch {
    localStorage.removeItem('tradebook_v1');
    return;
  }

  for (const old of oldTrades) {
    const { screenshot, ...trade } = old;

    // Skip if already migrated (trade already exists in IndexedDB)
    if (state.trades.some(t => t.id === trade.id)) continue;

    if (screenshot) {
      trade.hasScreenshot = true;
      await putTrade(trade);

      // Convert base64 data URL → Blob
      try {
        const [header, data] = screenshot.split(',');
        const mimeMatch = header.match(/:(.*?);/);
        const mimeType  = mimeMatch ? mimeMatch[1] : 'image/png';
        const binary    = atob(data);
        const bytes     = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mimeType });
        await putScreenshot(trade.id, blob);
        state.screenshotURLs.set(trade.id, URL.createObjectURL(blob));
      } catch {
        // Screenshot conversion failed — store trade without screenshot
        trade.hasScreenshot = false;
        await putTrade(trade);
      }
    } else {
      trade.hasScreenshot = false;
      await putTrade(trade);
    }

    state.trades.push(trade);
  }

  state.trades.sort((a, b) => b.id - a.id);
  localStorage.removeItem('tradebook_v1');
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  await openDB();

  // Load all trades from IndexedDB into memory
  state.trades = await getAllTrades();
  state.trades.sort((a, b) => b.id - a.id);

  // Eager-load screenshot blobs as ObjectURLs so render stays synchronous
  for (const trade of state.trades) {
    if (trade.hasScreenshot) {
      try {
        const blob = await getScreenshot(trade.id);
        if (blob) state.screenshotURLs.set(trade.id, URL.createObjectURL(blob));
      } catch {
        // Screenshot missing from DB — mark trade as having no screenshot
        trade.hasScreenshot = false;
      }
    }
  }

  // Migrate any data from the old localStorage-based v1 format
  await migrateFromLocalStorage();

  // Set form defaults using local time (toISOString() is UTC and can be off by a day)
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('f-date').value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  document.getElementById('f-time').value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  render();
}

document.addEventListener('DOMContentLoaded', init);
