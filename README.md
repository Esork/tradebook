# 📒 TradeBook — PDT Guard

A lightweight personal trade journal built as a single HTML file.
Tracks trade entries, P&L, and warns you before hitting the
**Pattern Day Trader (PDT) 3/5 rule** on US margin accounts.

## Features

- Log trades with entry reason, R:R, outcome, and post-trade notes
- Rolling 5-day PDT window tracker with live warning system
- Auto-calculated win rate, total P&L, and average R:R
- Filter by day trades, wins, or losses
- 100% client-side — all data stored in browser localStorage, nothing sent anywhere

## PDT Rule (Why This Exists)

Under FINRA rules, executing **4+ day trades in a rolling 5-day window**
on a US margin account flags you as a Pattern Day Trader (PDT).
PDT accounts must maintain **$25,000 minimum equity** or lose day trading
privileges for 90 days. This tool warns you at 3 trades so you never
accidentally cross the line.

## Usage

Open the link in any browser. No install, no login, no server.
https://Esork.github.io/tradebook

> ⚠️ Data is stored in your browser's localStorage.
> Clearing browser data will erase your trade history.
> Use the Export/Import feature to back up your data.

## Disclaimer

This tool is for personal record-keeping only.
Nothing here constitutes financial or legal advice.
