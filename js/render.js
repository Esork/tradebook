// ── RENDER FUNCTIONS ──────────────────────────────────────
// All functions read from state synchronously and update the DOM.
// Screenshots are accessed via state.screenshotURLs (ObjectURLs pre-loaded on init).

import { state } from './state.js';
import { getPDTStatus } from './pdt.js';

export function render() {
  renderStats();
  renderPDT();
  renderTable();
}

// ── STATS ─────────────────────────────────────────────────
export function renderStats() {
  const { trades } = state;
  const closed = trades.filter(t => t.outcome);
  const wins   = closed.filter(t => t.outcome === 'WIN').length;
  const wr     = closed.length ? Math.round(wins / closed.length * 100) + '%' : '—';
  const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const rrTrades = trades.filter(t => t.rr && t.rr.includes(':'));
  let avgRr = '—';
  if (rrTrades.length) {
    const ratios = rrTrades.map(t => {
      const p = t.rr.split(':');
      return p.length === 2 ? parseFloat(p[1]) / parseFloat(p[0]) : null;
    }).filter(Boolean);
    if (ratios.length) avgRr = (ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2);
  }

  document.getElementById('stat-total').textContent = trades.length;

  const wrEl = document.getElementById('stat-wr');
  wrEl.textContent = wr;
  wrEl.className = 'stat-val ' + (closed.length === 0 ? 'neutral' : wins / closed.length >= 0.5 ? 'pos' : 'neg');

  const pnlEl = document.getElementById('stat-pnl');
  pnlEl.textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(0);
  pnlEl.className = 'stat-val ' + (totalPnl > 0 ? 'pos' : totalPnl < 0 ? 'neg' : 'neutral');

  document.getElementById('stat-rr').textContent = avgRr === '—' ? '—' : '1:' + avgRr;
  document.getElementById('stat-rr').className = 'stat-val neutral';
}

// ── PDT WINDOW ────────────────────────────────────────────
export function renderPDT() {
  const { count, window5, dtTrades } = getPDTStatus(state.trades);

  // Badge
  const badge     = document.getElementById('pdt-badge');
  const badgeText = document.getElementById('pdt-badge-text');
  if (count === 0) {
    badge.className = 'safe';
    badgeText.textContent = `PDT SAFE — 0/3 DAY TRADES`;
  } else if (count <= 2) {
    badge.className = 'safe';
    badgeText.textContent = `PDT SAFE — ${count}/3 DAY TRADES`;
  } else if (count === 3) {
    badge.className = 'warn';
    badgeText.textContent = `⚠ PDT WARNING — 3/3 DAY TRADES`;
  } else {
    badge.className = 'danger';
    badgeText.textContent = `🚨 PDT DANGER — ${count}/3 EXCEEDED`;
  }

  // Count text + progress bar
  document.getElementById('pdt-count-text').textContent =
    `${count} day trade${count !== 1 ? 's' : ''} in window`;

  const pct = Math.min((count / 3) * 100, 100);
  const bar = document.getElementById('pdt-bar');
  bar.style.width = pct + '%';
  bar.style.background = count >= 4 ? 'var(--red)' : count === 3 ? 'var(--accent)' : 'var(--green)';

  const msg = document.getElementById('pdt-msg');
  if      (count === 0) msg.textContent = "You're clear. No day trades this window.";
  else if (count === 1) msg.textContent = "1 day trade used. 2 remaining.";
  else if (count === 2) msg.textContent = "2 day trades used. 1 remaining — be careful.";
  else if (count === 3) msg.textContent = "⚠ Limit reached. Next day trade = PDT flag.";
  else                  msg.textContent = `🚨 ${count} day trades — PDT flag likely triggered!`;
  msg.style.color = count >= 4 ? 'var(--red)' : count === 3 ? 'var(--accent)' : 'var(--muted)';

  // 5-day pip row
  const row   = document.getElementById('pdt-days-row');
  row.innerHTML = '';
  const today   = new Date().toISOString().split('T')[0];
  const dtDates = new Set(dtTrades.map(t => t.date));
  window5.reverse().forEach(d => {
    const pip = document.createElement('div');
    pip.className = 'day-pip' + (dtDates.has(d) ? ' has-trade' : '') + (d === today ? ' today' : '');
    pip.title = d;
    const label = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    pip.textContent = label.slice(0, 1);
    if (dtDates.has(d)) {
      const n = dtTrades.filter(t => t.date === d).length;
      pip.textContent += n > 1 ? n : '';
    }
    row.appendChild(pip);
  });
  window5.reverse(); // restore original order

  // Alert banner
  const alertEl = document.getElementById('pdt-alert');
  if (count === 3) {
    alertEl.style.display = 'block';
    alertEl.className = 'warn';
    alertEl.innerHTML = `<strong>⚠ PDT Warning:</strong> You've used all 3 allowed day trades in the rolling 5-day window. Any additional day trade this window will trigger Pattern Day Trader status. Consider waiting until older trades fall outside the window.`;
  } else if (count >= 4) {
    alertEl.style.display = 'block';
    alertEl.className = 'danger';
    alertEl.innerHTML = `<strong>🚨 PDT Threshold Exceeded:</strong> You have ${count} day trades in the last 5 trading days — above the 3-trade safe limit. Your account may be flagged as a Pattern Day Trader. If your balance drops below $25,000, day trading will be restricted.`;
  } else {
    alertEl.style.display = 'none';
  }
}

// ── TRADE TABLE ───────────────────────────────────────────
export function renderTable() {
  const tbody = document.getElementById('trade-tbody');
  const empty = document.getElementById('empty-state');

  let filtered = [...state.trades];
  if (state.currentFilter === 'DAY')  filtered = filtered.filter(t => t.isDayTrade);
  if (state.currentFilter === 'WIN')  filtered = filtered.filter(t => t.outcome === 'WIN');
  if (state.currentFilter === 'LOSS') filtered = filtered.filter(t => t.outcome === 'LOSS');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map(t => {
    const pnlHtml = t.pnl !== null
      ? `<td class="pnl-cell ${t.pnl >= 0 ? 'pos' : 'neg'}">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</td>`
      : `<td class="mono" style="color:var(--muted);">—</td>`;

    const outcome     = t.outcome || 'OPEN';
    const reasonShort = t.reason ? (t.reason.length > 28 ? t.reason.slice(0, 28) + '…' : t.reason) : '—';
    const ssSrc       = state.screenshotURLs.get(t.id);
    const ssHtml      = ssSrc
      ? `<td><img class="ss-thumb" src="${ssSrc}" alt="chart" onclick="event.stopPropagation();openLightbox(${t.id})"></td>`
      : `<td class="mono" style="color:var(--muted);">—</td>`;

    return `<tr onclick="showDetail(${t.id})">
      <td class="mono" style="white-space:nowrap;">${t.date}<br><span style="color:var(--muted);font-size:11px;">${t.time || ''}</span></td>
      <td><span class="ticker-tag">${t.ticker}</span>${t.isDayTrade ? '<span class="daytrade-flag">DT</span>' : ''}</td>
      <td class="mono" style="color:${t.dir === 'LONG' ? 'var(--green)' : 'var(--red)'}">${t.dir}</td>
      ${ssHtml}
      <td style="color:var(--muted);max-width:160px;">${reasonShort}</td>
      <td class="mono">$${t.entry.toFixed(2)}</td>
      <td class="mono">${t.exit ? '$' + t.exit.toFixed(2) : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="mono">${t.size || '—'}</td>
      ${pnlHtml}
      <td class="mono" style="color:var(--muted)">${t.rr || '—'}</td>
      <td><span class="outcome-tag ${outcome}">${outcome}</span></td>
      <td style="white-space:nowrap;">
        <button class="action-btn" onclick="event.stopPropagation();openEditModal(${t.id})" style="margin-right:4px;" title="Edit">✎</button>
        <button class="action-btn" onclick="event.stopPropagation();deleteTrade(${t.id})" title="Delete">✕</button>
      </td>
    </tr>`;
  }).join('');
}
