window.startAutoTask = function(list) {
    window.isPaused = false;
    if (typeof window.curIdx === 'undefined') window.curIdx = 0;

    // --- 极速人类模拟参数 ---
    const MIN_DELAY = 800;
    const MAX_DELAY = 1500;
    const SEARCH_WAIT = 1500;
    const SEARCH_WAIT_EXTRA = 800;
    const INPUT_DELAY_MIN = 100;
    const INPUT_DELAY_MAX = 300;

    const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // ====== 弹窗隐身术 ======
    if (!window._popupCSSInjected) {
        const style = document.createElement('style');
        style.id = 'popup-killer-css';
        style.textContent = `
            .popup-container, .popup, ion-alert, ion-modal,
            .alert-wrapper, .backdrop, ion-backdrop, .modal-backdrop,
            .popup-open .backdrop, .modal, .overlay,
            [class*="popup"], [class*="alert"], [class*="modal"] .backdrop {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                z-index: -9999 !important;
                width: 0 !important;
                height: 0 !important;
                position: fixed !important;
                top: -9999px !important;
                left: -9999px !important;
            }
            body.popup-open, body.modal-open {
                overflow: auto !important;
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);
        window._popupCSSInjected = true;
    }

    // MutationObserver 实时拦截弹窗
    if (!window._popupObserver) {
        window._popupObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        const tag = (node.tagName || '').toLowerCase();
                        const cls = (node.className || '').toString().toLowerCase();
                        if (tag === 'ion-alert' || tag === 'ion-backdrop' ||
                            cls.includes('popup') || cls.includes('backdrop') ||
                            cls.includes('alert') || cls.includes('modal') ||
                            cls.includes('overlay')) {
                            node.style.display = 'none';
                            try { node.remove(); } catch(e) {}
                        }
                    }
                });
            });
            document.body.classList.remove('popup-open', 'modal-open');
            document.body.style.overflow = '';
            document.body.style.pointerEvents = '';
        });
        window._popupObserver.observe(document.body, { childList: true, subtree: true });
    }

    const nukePopups = () => {
        document.querySelectorAll(
            '.popup-container, .popup, ion-alert, ion-backdrop, ' +
            '.backdrop, .alert-wrapper, .modal-backdrop, ion-modal'
        ).forEach(el => {
            el.style.display = 'none';
            try { el.remove(); } catch(e) {}
        });
        document.body.classList.remove('popup-open', 'modal-open');
        document.body.style.overflow = '';
        document.body.style.pointerEvents = '';
        try {
            if (typeof window.angular !== 'undefined') {
                const inj = window.angular.element(document.body).injector();
                if (inj) {
                    try { inj.get('$ionicPopup').close(); } catch(e) {}
                    try { inj.get('$ionicModal').close(); } catch(e) {}
                }
            }
        } catch(e) {}
        const ionAlert = document.querySelector('ion-alert');
        if (ionAlert && typeof ionAlert.dismiss === 'function') {
            try { ionAlert.dismiss(); } catch(e) {}
        }
    };

    if (!window._popupInterval) {
        window._popupInterval = setInterval(nukePopups, 500);
    }

    // ====== 隐身遮罩 ======
    const showOverlay = () => {
        const existing = document.getElementById('stealth-overlay');
        if (existing) {
            // 遮罩已存在（继续任务），直接显示回来
            existing.style.display = 'flex';
            existing.style.opacity = '1';
            const title = document.getElementById('stealth-title');
            if (title) {
                title.textContent = '正在处理订单...';
                title.style.color = '#333';
            }
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'stealth-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 999999; background: #f5f5f5;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; font-family: -apple-system, sans-serif;
        `;

        const done = window.curIdx || 0;
        const total = list.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const s = window._stealthStats || { success: 0, nostock: 0, skip: 0, fail: 0 };

        overlay.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <div style="font-size:60px; margin-bottom:20px;">📦</div>
                <div id="stealth-title" style="font-size:22px; font-weight:bold; color:#333; margin-bottom:15px;">
                    正在处理订单...
                </div>
                <div id="stealth-progress" style="font-size:16px; color:#666; margin-bottom:20px;">
                    进度: ${done} / ${total}  (${pct}%)
                </div>
                <div style="width:260px; height:8px; background:#e0e0e0; border-radius:4px; overflow:hidden; margin-bottom:20px;">
                    <div id="stealth-bar" style="width:${pct}%; height:100%; background:linear-gradient(90deg,#4CAF50,#8BC34A); border-radius:4px; transition:width 0.3s;"></div>
                </div>
                <div id="stealth-stats" style="font-size:14px; color:#888; line-height:1.8;">
                    <span id="stat-success" style="color:#4CAF50;">✓ 成功: ${s.success}</span>&nbsp;&nbsp;
                    <span id="stat-nostock" style="color:#999;">○ 无货: ${s.nostock}</span><br>
                    <span id="stat-skip" style="color:#FF9800;">△ 跳过: ${s.skip}</span>&nbsp;&nbsp;
                    <span id="stat-fail" style="color:#f44336;">✗ 失败: ${s.fail}</span>
                </div>
                <div id="stealth-current" style="font-size:13px; color:#aaa; margin-top:15px;">
                    当前: --
                </div>
                <div id="stealth-log" style="margin-top:20px; width:300px; max-height:180px; overflow-y:auto;
                    background:#fff; border-radius:8px; padding:10px; font-size:12px; color:#666;
                    text-align:left; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    };

    // 统计计数器
    if (!window._stealthStats) {
        window._stealthStats = { success: 0, nostock: 0, skip: 0, fail: 0 };
    }

    const updateOverlay = (barcode, idx, status) => {
        const total = list.length;
        const pct = Math.round(((idx + 1) / total) * 100);

        if (status.includes('成功')) window._stealthStats.success++;
        else if (status.includes('无商品')) window._stealthStats.nostock++;
        else if (status.includes('跳过')) window._stealthStats.skip++;
        else if (status.includes('失败')) window._stealthStats.fail++;

        const bar = document.getElementById('stealth-bar');
        const progress = document.getElementById('stealth-progress');
        const current = document.getElementById('stealth-current');
        const logBox = document.getElementById('stealth-log');

        if (bar) bar.style.width = pct + '%';
        if (progress) progress.textContent = `进度: ${idx + 1} / ${total}  (${pct}%)`;
        if (current) current.textContent = `当前: ${barcode}`;

        const ss = document.getElementById('stat-success');
        const sn = document.getElementById('stat-nostock');
        const sk = document.getElementById('stat-skip');
        const sf = document.getElementById('stat-fail');
        if (ss) ss.textContent = `✓ 成功: ${window._stealthStats.success}`;
        if (sn) sn.textContent = `○ 无货: ${window._stealthStats.nostock}`;
        if (sk) sk.textContent = `△ 跳过: ${window._stealthStats.skip}`;
        if (sf) sf.textContent = `✗ 失败: ${window._stealthStats.fail}`;

        if (logBox) {
            let color = '#666';
            if (status.includes('成功')) color = '#4CAF50';
            else if (status.includes('跳过')) color = '#FF9800';
            else if (status.includes('失败')) color = '#f44336';

            const entry = document.createElement('div');
            entry.style.cssText = `padding:2px 0; border-bottom:1px solid #f0f0f0; color:${color};`;
            entry.textContent = `${barcode} → ${status}`;
            logBox.insertBefore(entry, logBox.firstChild);
        }
    };

    // 隐藏遮罩（暂停时用，不删除，保留数据）
    const hideOverlay = () => {
        const overlay = document.getElementById('stealth-overlay');
        if (overlay) {
            overlay.style.transition = 'opacity 0.3s';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay) overlay.style.display = 'none';
            }, 300);
        }
    };

    // 完全移除遮罩（任务完成/重置时用）
    const removeOverlay = () => {
        const overlay = document.getElementById('stealth-overlay');
        if (overlay) {
            const title = document.getElementById('stealth-title');
            if (title) {
                title.textContent = '✅ 全部完成！';
                title.style.color = '#4CAF50';
            }
            setTimeout(() => {
                overlay.style.transition = 'opacity 0.5s';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 500);
            }, 2000);
        }
        window._stealthStats = null;
    };

    // ====== 主循环 ======
    const run = async () => {
        // 暂停 → 隐藏遮罩，露出原页面
        if (window.isPaused) {
            hideOverlay();
            return;
        }

        if (window.curIdx >= list.length) {
            clearInterval(window._popupInterval);
            window._popupInterval = null;
            if (window._popupObserver) {
                window._popupObserver.disconnect();
                window._popupObserver = null;
            }
            const css = document.getElementById('popup-killer-css');
            if (css) css.remove();
            window._popupCSSInjected = false;
            removeOverlay();
            window.webkit.messageHandlers.bridge.postMessage({type:'finish'});
            return;
        }

        nukePopups();

        const barcode = list[window.curIdx];

        const current = document.getElementById('stealth-current');
        if (current) current.textContent = `正在搜索: ${barcode}`;

        const input = document.querySelector('input.searchinput') || document.querySelector('input[type="search"]');

        if (!input) {
            hideOverlay();
            window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'找不到搜索框，任务已拦截'});
            return;
        }

        input.focus();

        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) {
            nativeSetter.call(input, barcode);
        } else {
            input.value = barcode;
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        try {
            if (typeof window.angular !== 'undefined') {
                let scope = window.angular.element(input).scope();
                if (scope) {
                    if (scope.input) scope.input.search = barcode;
                    else scope.search = barcode;
                    scope.$apply();
                }
            }
        } catch(e) {}

        await new Promise(r => setTimeout(r, randBetween(INPUT_DELAY_MIN, INPUT_DELAY_MAX)));

        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));
        input.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));

        try {
            if (typeof window.angular !== 'undefined') {
                let scope = window.angular.element(input).scope();
                if (scope && scope.keypress) scope.keypress.search({ which: 13 });
            }
        } catch(e) {}

        await new Promise(r => setTimeout(r, randBetween(SEARCH_WAIT, SEARCH_WAIT + SEARCH_WAIT_EXTRA)));

        nukePopups();

        let addStatus = "搜索完成(无商品)";
        const quantityBar = document.querySelector('.quantity-bar');

        if (quantityBar) {
            const visibleBtns = Array.from(quantityBar.querySelectorAll('div')).filter(el => {
                const r = el.getBoundingClientRect();
                return r.height > 0 && r.width > 0;
            });

            let hasBadge = false;
            const itemCard = quantityBar.closest('.item') || quantityBar.parentElement.parentElement;
            if (itemCard) {
                const badge = itemCard.querySelector('.badge, [class*="num"], [class*="qty"]');
                if (badge && badge.innerText.trim() !== "" && parseInt(badge.innerText) > 0) {
                    hasBadge = true;
                }
            }

            if (hasBadge || visibleBtns.length > 1) {
                addStatus = "跳过(已在购物车)";
            } else if (visibleBtns.length === 1) {
                const addBtn = visibleBtns[0];
                ['mousedown', 'mouseup', 'click'].forEach(t => {
                    addBtn.dispatchEvent(new MouseEvent(t, { view: window, bubbles: true, cancelable: true, buttons: 1 }));
                });
                try { window.angular.element(addBtn).scope().$apply(); } catch(e){}
                addStatus = "加购成功";
            } else {
                addStatus = "失败(按钮不可点)";
            }
        }

        updateOverlay(barcode, window.curIdx, addStatus);

        window.webkit.messageHandlers.bridge.postMessage({type:'update', code: barcode, idx: window.curIdx, status: addStatus});
        window.curIdx++;

        const nextDelay = randBetween(MIN_DELAY, MAX_DELAY);
        setTimeout(run, nextDelay);
    };

    // 启动：显示遮罩，开始任务
    nukePopups();
    showOverlay();
    run();
};

// 全局清理函数（重置时调用）
window.cleanupStealth = function() {
    const overlay = document.getElementById('stealth-overlay');
    if (overlay) overlay.remove();
    const css = document.getElementById('popup-killer-css');
    if (css) css.remove();
    window._popupCSSInjected = false;
    window._stealthStats = null;
    if (window._popupInterval) {
        clearInterval(window._popupInterval);
        window._popupInterval = null;
    }
    if (window._popupObserver) {
        window._popupObserver.disconnect();
        window._popupObserver = null;
    }
};
