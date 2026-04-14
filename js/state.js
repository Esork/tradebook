// ── SHARED MUTABLE STATE ──────────────────────────────────
// All modules import this object and mutate it directly.
// Render functions read from it synchronously.

export const state = {
  trades: [],                // in-memory array — source of truth for rendering
  screenshotURLs: new Map(), // tradeId (number) → ObjectURL string
  currentFilter: 'ALL',     // active table filter: 'ALL'|'DAY'|'WIN'|'LOSS'
  editTradeId: null,         // id of trade currently open in edit modal
};
