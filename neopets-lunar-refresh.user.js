// ==UserScript==
// @name         Neopets Shenkuu Lunar - Midnight Refresh
// @namespace    neopets-lunar-refresh
// @version      5.0
// @description  Refreshes Lunar page at target Pacific time, then opens Bubbling Pit 45 seconds later.
// @match        https://www.neopets.com/shenkuu/lunar/*
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /***********************
     * SETTINGS
     ***********************/
    const TARGET_HOUR = 0;   // 0 = midnight Pacific
    const TARGET_MIN = 0;
    const TARGET_SEC = 5;

    const OPEN_DELAY_SECONDS = 45;
    const BUBBLING_PIT_URL = 'https://www.neopets.com/water/bubblingpit.phtml';

    const STORAGE_ENABLED = 'lunar_enabled_v5';
    const STORAGE_MODE = 'lunar_mode_v5';
    const STORAGE_LAST_RUN = 'lunar_last_run_v5';
    const STORAGE_OPEN_AT = 'lunar_open_at_v5';

    /***********************
     * TIME HELPERS
     ***********************/
    function getPacificNow() {
        const now = new Date();

        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).formatToParts(now);

        const obj = {};
        for (const part of parts) {
            obj[part.type] = part.value;
        }

        let hour = Number(obj.hour);
        if (hour === 24) hour = 0;

        return {
            hour,
            minute: Number(obj.minute),
            second: Number(obj.second),
            dateKey: `${obj.year}-${obj.month}-${obj.day}`
        };
    }

    function getSecondsOfDay(p) {
        return p.hour * 3600 + p.minute * 60 + p.second;
    }

    function getTargetSeconds() {
        return TARGET_HOUR * 3600 + TARGET_MIN * 60 + TARGET_SEC;
    }

    function getSecondsUntilTarget() {
        const p = getPacificNow();
        const nowSeconds = getSecondsOfDay(p);
        const targetSeconds = getTargetSeconds();

        let diff = targetSeconds - nowSeconds;

        if (diff < 0) {
            diff += 86400;
        }

        return diff;
    }

    function formatTime(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        return [h, m, s]
            .map(n => String(n).padStart(2, '0'))
            .join(':');
    }

    /***********************
     * SETTINGS HELPERS
     ***********************/
    function isEnabled() {
        return localStorage.getItem(STORAGE_ENABLED) !== 'false';
    }

    function setEnabled(value) {
        localStorage.setItem(STORAGE_ENABLED, value ? 'true' : 'false');
    }

    function getMode() {
        return localStorage.getItem(STORAGE_MODE) === 'continuous'
            ? 'continuous'
            : 'once';
    }

    function setMode(mode) {
        localStorage.setItem(STORAGE_MODE, mode);
    }

    /***********************
     * ACTIONS
     ***********************/
    function openBubblingPit() {
        try {
            GM_openInTab(BUBBLING_PIT_URL, {
                active: true,
                insert: true,
                setParent: true
            });
        } catch (e) {
            window.open(BUBBLING_PIT_URL, '_blank');
        }
    }

    function refreshNow() {
        const p = getPacificNow();

        localStorage.setItem(STORAGE_LAST_RUN, p.dateKey);

        const openAt = Date.now() + OPEN_DELAY_SECONDS * 1000;
        localStorage.setItem(STORAGE_OPEN_AT, String(openAt));

        if (getMode() === 'once') {
            setEnabled(false);
        }

        location.reload();
    }

    function checkPendingOpen() {
        const openAtRaw = localStorage.getItem(STORAGE_OPEN_AT);
        if (!openAtRaw) return;

        const openAt = Number(openAtRaw);

        if (!Number.isFinite(openAt)) {
            localStorage.removeItem(STORAGE_OPEN_AT);
            return;
        }

        const remaining = openAt - Date.now();

        if (remaining <= 0) {
            localStorage.removeItem(STORAGE_OPEN_AT);
            openBubblingPit();
        } else {
            setTimeout(() => {
                localStorage.removeItem(STORAGE_OPEN_AT);
                openBubblingPit();
            }, remaining);
        }
    }

    /***********************
     * UI
     ***********************/
    function createUI() {
        const style = document.createElement('style');
        style.textContent = `
            #lunarRefreshPanel {
                position: fixed;
                top: 12px;
                right: 12px;
                z-index: 999999;
                background: rgba(20, 20, 30, 0.9);
                color: #f1f1f1;
                font-family: Arial, sans-serif;
                font-size: 13px;
                padding: 10px 14px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.4);
                min-width: 200px;
                text-align: center;
            }

            #lunarRefreshPanel .lr-title {
                font-weight: bold;
                margin-bottom: 5px;
            }

            #lunarRefreshPanel .lr-clock {
                font-family: monospace;
                font-size: 22px;
                margin: 5px 0;
            }

            #lunarRefreshPanel .lr-status {
                font-size: 11px;
                margin-bottom: 8px;
            }

            #lunarRefreshPanel .on {
                color: #7ee09a;
            }

            #lunarRefreshPanel .off {
                color: #ff9999;
            }

            #lunarRefreshPanel .lr-row {
                display: flex;
                gap: 5px;
                margin-bottom: 7px;
            }

            #lunarRefreshPanel button {
                cursor: pointer;
                border: none;
                border-radius: 6px;
                padding: 6px;
                font-size: 12px;
                font-weight: bold;
            }

            #lunarRefreshPanel .mode-btn {
                flex: 1;
                background: #444;
                color: #ddd;
            }

            #lunarRefreshPanel .mode-btn.active {
                background: #3a7bd5;
                color: white;
            }

            #lunarRefreshPanel .toggle {
                width: 100%;
                color: white;
            }

            #lunarRefreshPanel .toggle.start {
                background: #4caf78;
            }

            #lunarRefreshPanel .toggle.stop {
                background: #d9534f;
            }
        `;

        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'lunarRefreshPanel';
        panel.innerHTML = `
            <div class="lr-title">Lunar Refresh</div>
            <div class="lr-clock" id="lrClock">--:--:--</div>
            <div class="lr-status" id="lrStatus">Loading...</div>

            <div class="lr-row">
                <button class="mode-btn" id="lrOnce">Once</button>
                <button class="mode-btn" id="lrContinuous">Continuous</button>
            </div>

            <button class="toggle" id="lrToggle">Toggle</button>
        `;

        document.body.appendChild(panel);

        const clock = document.getElementById('lrClock');
        const status = document.getElementById('lrStatus');
        const onceBtn = document.getElementById('lrOnce');
        const continuousBtn = document.getElementById('lrContinuous');
        const toggleBtn = document.getElementById('lrToggle');

        function render() {
            const enabled = isEnabled();
            const mode = getMode();

            onceBtn.classList.toggle('active', mode === 'once');
            continuousBtn.classList.toggle('active', mode === 'continuous');

            if (enabled) {
                status.textContent = mode === 'once'
                    ? 'Armed: once'
                    : 'Armed: continuous';

                status.className = 'lr-status on';
                toggleBtn.textContent = 'Stop';
                toggleBtn.className = 'toggle stop';
            } else {
                status.textContent = 'Stopped';
                status.className = 'lr-status off';
                toggleBtn.textContent = 'Start';
                toggleBtn.className = 'toggle start';
            }
        }

        onceBtn.addEventListener('click', () => {
            setMode('once');
            render();
        });

        continuousBtn.addEventListener('click', () => {
            setMode('continuous');
            render();
        });

        toggleBtn.addEventListener('click', () => {
            setEnabled(!isEnabled());
            render();
        });

        function tick() {
            const p = getPacificNow();
            const nowSeconds = getSecondsOfDay(p);
            const targetSeconds = getTargetSeconds();
            const secondsLeft = getSecondsUntilTarget();

            clock.textContent = formatTime(secondsLeft);

            if (!isEnabled()) return;

            const lastRun = localStorage.getItem(STORAGE_LAST_RUN);

            const hitTarget =
                nowSeconds >= targetSeconds &&
                nowSeconds <= targetSeconds + 10;

            if (hitTarget && lastRun !== p.dateKey) {
                refreshNow();
            }
        }

        render();
        tick();

        setInterval(tick, 250);
    }

    /***********************
     * START
     ***********************/
    checkPendingOpen();

    if (document.body) {
        createUI();
    } else {
        window.addEventListener('load', createUI);
    }
})();
