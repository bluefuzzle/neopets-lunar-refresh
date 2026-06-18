// ==UserScript==
// @name         Neopets Shenkuu Lunar - Midnight Refresh
// @namespace    neopets-lunar-refresh
// @version      4.0
// @description  Refreshes the Shenkuu Lunar page at 12:00:05 AM Pacific Time and opens the Bubbling Pit in a new tab. Choose Once or Continuous mode.
// @match        https://www.neopets.com/shenkuu/lunar/*
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_HOUR = 0;
    const TARGET_MIN = 0;
    const TARGET_SEC = 5;
    const NEW_TAB_URL = 'https://www.neopets.com/water/bubblingpit.phtml';

    const STORAGE_ENABLED = 'lunarRefresh_enabled';
    const STORAGE_MODE = 'lunarRefresh_mode'; // 'once' | 'continuous'
    const STORAGE_LAST_RUN = 'lunarRefresh_lastRunDate';

    function getPacificParts() {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
        const parts = {};
        fmt.formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
        let hour = parseInt(parts.hour, 10);
        if (hour === 24) hour = 0; // some engines report midnight as "24"
        return {
            dateKey: `${parts.year}-${parts.month}-${parts.day}`,
            hour,
            minute: parseInt(parts.minute, 10),
            second: parseInt(parts.second, 10)
        };
    }

    function secondsUntilTarget() {
        const p = getPacificParts();
        const nowSec = p.hour * 3600 + p.minute * 60 + p.second;
        const targetSec = TARGET_HOUR * 3600 + TARGET_MIN * 60 + TARGET_SEC;
        let diff = targetSec - nowSec;
        if (diff <= 0) diff += 24 * 3600;
        return diff;
    }

    function formatHMS(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600) % 24;
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
    }

    function isEnabled() {
        return localStorage.getItem(STORAGE_ENABLED) !== 'false'; // default true
    }
    function setEnabled(val) {
        localStorage.setItem(STORAGE_ENABLED, val ? 'true' : 'false');
    }

    function getMode() {
        return localStorage.getItem(STORAGE_MODE) === 'continuous' ? 'continuous' : 'once'; // default 'once'
    }
    function setMode(val) {
        localStorage.setItem(STORAGE_MODE, val);
    }

    // ---------- UI ----------
    const style = document.createElement('style');
    style.textContent = `
        #lunarRefreshPanel {
            position: fixed;
            top: 12px;
            right: 12px;
            z-index: 999999;
            background: rgba(20, 20, 30, 0.88);
            color: #f1f1f1;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px;
            padding: 10px 14px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.4);
            min-width: 190px;
            text-align: center;
            user-select: none;
        }
        #lunarRefreshPanel .lr-title {
            font-weight: 600;
            margin-bottom: 4px;
            letter-spacing: 0.3px;
        }
        #lunarRefreshPanel .lr-clock {
            font-family: "SF Mono", "Consolas", monospace;
            font-size: 20px;
            letter-spacing: 1px;
            margin: 4px 0 6px;
        }
        #lunarRefreshPanel .lr-status {
            font-size: 11px;
            opacity: 0.85;
            margin-bottom: 8px;
        }
        #lunarRefreshPanel .lr-status.on { color: #6fdc8c; }
        #lunarRefreshPanel .lr-status.off { color: #e88; }
        #lunarRefreshPanel .lr-modes {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
        }
        #lunarRefreshPanel .lr-mode-btn {
            flex: 1;
            padding: 5px 0;
            border: 1px solid rgba(255,255,255,0.25);
            border-radius: 6px;
            background: transparent;
            color: #ccc;
            font-size: 11px;
            cursor: pointer;
        }
        #lunarRefreshPanel .lr-mode-btn.active {
            background: #3a7bd5;
            border-color: #3a7bd5;
            color: white;
            font-weight: 600;
        }
        #lunarRefreshPanel button.lr-main-toggle {
            width: 100%;
            padding: 6px 0;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
        }
        #lunarRefreshPanel button.stop { background: #d9534f; color: white; }
        #lunarRefreshPanel button.start { background: #4caf78; color: white; }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'lunarRefreshPanel';
    panel.innerHTML = `
        <div class="lr-title">Lunar Refresh</div>
        <div class="lr-clock" id="lunarRefreshClock">--:--:--</div>
        <div class="lr-status" id="lunarRefreshStatus">Status</div>
        <div class="lr-modes">
            <button class="lr-mode-btn" data-mode="once" id="lunarModeOnce">Once</button>
            <button class="lr-mode-btn" data-mode="continuous" id="lunarModeContinuous">Continuous</button>
        </div>
        <button class="lr-main-toggle" id="lunarRefreshToggle">Toggle</button>
    `;
    document.body.appendChild(panel);

    const clockEl = panel.querySelector('#lunarRefreshClock');
    const statusEl = panel.querySelector('#lunarRefreshStatus');
    const toggleBtn = panel.querySelector('#lunarRefreshToggle');
    const modeOnceBtn = panel.querySelector('#lunarModeOnce');
    const modeContinuousBtn = panel.querySelector('#lunarModeContinuous');

    function renderUI() {
        const enabled = isEnabled();
        const mode = getMode();

        modeOnceBtn.classList.toggle('active', mode === 'once');
        modeContinuousBtn.classList.toggle('active', mode === 'continuous');

        if (enabled) {
            statusEl.textContent = mode === 'once'
                ? 'Armed: fires tonight, then stops'
                : 'Armed: fires every night';
            statusEl.className = 'lr-status on';
            toggleBtn.textContent = 'Stop';
            toggleBtn.className = 'lr-main-toggle stop';
        } else {
            statusEl.textContent = 'Stopped';
            statusEl.className = 'lr-status off';
            toggleBtn.textContent = 'Start';
            toggleBtn.className = 'lr-main-toggle start';
        }
    }

    toggleBtn.addEventListener('click', () => {
        setEnabled(!isEnabled());
        renderUI();
    });

    modeOnceBtn.addEventListener('click', () => {
        setMode('once');
        renderUI();
    });
    modeContinuousBtn.addEventListener('click', () => {
        setMode('continuous');
        renderUI();
    });

    renderUI();

    // ---------- Countdown + refresh logic ----------
    function tick() {
        const secsLeft = secondsUntilTarget();
        clockEl.textContent = formatHMS(secsLeft);

        if (!isEnabled()) return;

        // Trigger exactly when we hit/pass the target second, once per armed cycle
        const p = getPacificParts();
        const atTarget = p.hour === TARGET_HOUR && p.minute === TARGET_MIN && p.second === TARGET_SEC;
        if (atTarget && localStorage.getItem(STORAGE_LAST_RUN) !== p.dateKey) {
            localStorage.setItem(STORAGE_LAST_RUN, p.dateKey);

            // Open the new tab BEFORE reloading, since reload tears down this page's context
            GM_openInTab(NEW_TAB_URL, { active: true, insert: true, setParent: true });

            // In "once" mode, auto-disable so it won't fire again until manually re-armed
            if (getMode() === 'once') {
                setEnabled(false);
            }

            location.reload();
        }
    }

    tick();
    setInterval(tick, 1000);
})();