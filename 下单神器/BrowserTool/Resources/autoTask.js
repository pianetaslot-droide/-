window.startAutoTask = function(list) {
    window.isPaused = false;
    if (typeof window.curIdx === 'undefined') window.curIdx = 0;

    // --- 参数 ---
    const MIN_DELAY = 1910;       // 单条间隔 1.91秒
    const MAX_DELAY = 1910;       // 单条间隔 1.91秒
    const SEARCH_WAIT = 1590;     // 搜索等待 1.59秒
    const SEARCH_WAIT_EXTRA = 955;  // 额外等待 0.955秒
    const INPUT_DELAY_MIN = 195;  // 输入延迟 0.195秒
    const INPUT_DELAY_MAX = 520;  // 输入延迟 0.52秒
    const BATCH_SIZE = 100;       // 每100个冷却
    const BATCH_COOLDOWN = 30000; // 冷却30秒

    const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Unicode escape text constants (avoid encoding issues)
    const T = {
        processing: '\u6b63\u5728\u5904\u7406\u8ba2\u5355...',   // 正在处理订单...
        progress:   '\u8fdb\u5ea6',                                // 进度
        success:    '\u6210\u529f',                                // 成功
        nostock:    '\u65e0\u8d27',                                // 无货
        skip:       '\u8df3\u8fc7',                                // 跳过
        fail:       '\u5931\u8d25',                                // 失败
        current:    '\u5f53\u524d',                                // 当前
        complete:   '\u5168\u90e8\u5b8c\u6210\uff01',              // 全部完成！
        searching:  '\u6b63\u5728\u641c\u7d22',                    // 正在搜索
        noInput:    '\u627e\u4e0d\u5230\u641c\u7d22\u6846\uff0c\u4efb\u52a1\u5df2\u62e6\u622a',  // 找不到搜索框，任务已拦截
        noProduct:  '\u641c\u7d22\u5b8c\u6210(\u65e0\u5546\u54c1)',   // 搜索完成(无商品)
        inCart:     '\u8df3\u8fc7(\u5df2\u5728\u8d2d\u7269\u8f66)',   // 跳过(已在购物车)
        addOk:      '\u52a0\u8d2d\u6210\u529f',                       // 加购成功
        btnFail:    '\u5931\u8d25(\u6309\u94ae\u4e0d\u53ef\u70b9)',   // 失败(按钮不可点)
        noItem:     '\u65e0\u5546\u54c1',                              // 无商品
        box:        '\u{1F4E6}',                                       // 📦
    };

    // ====== 弹窗主动关闭（不用CSS隐藏，而是点击按钮让框架正常关闭）======

    // 仅对 backdrop 做 CSS 处理，不隐藏弹窗本体（否则按钮点不了）
    if (!window._popupCSSInjected) {
        const style = document.createElement('style');
        style.id = 'popup-killer-css';
        style.textContent = `
            body.popup-open, body.modal-open {
                overflow: auto !important;
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);
        window._popupCSSInjected = true;
    }

    // 主动关闭弹窗：先点按钮让框架正常处理，再清理DOM
    const dismissPopups = () => {
        let dismissed = false;

        // 第1步：找到弹窗按钮并点击（让Ionic/Angular框架正常关闭）
        const popupBtns = document.querySelectorAll(
            '.popup-buttons .button, .popup-buttons button, ' +
            '.alert-button, ion-alert button, ' +
            '.popup button, .popup-container button, ' +
            '.alert-wrapper button'
        );
        popupBtns.forEach(btn => {
            try {
                btn.click();
                dismissed = true;
            } catch(e) {}
        });

        // 第2步：搜索所有包含 Ok/确定/关闭 文字的按钮
        if (!dismissed) {
            document.querySelectorAll('button, .button, a.button, [role="button"]').forEach(el => {
                const txt = (el.innerText || '').trim().toLowerCase();
                if (txt === 'ok' || txt === '确定' || txt === '关闭' || txt === 'close' ||
                    txt === '好的' || txt === '知道了' || txt === 'cancel' || txt === '取消') {
                    try {
                        el.click();
                        dismissed = true;
                    } catch(e) {}
                }
            });
        }

        // 第3步：Ionic/Angular 框架级别关闭
        try {
            if (typeof window.angular !== 'undefined') {
                const inj = window.angular.element(document.body).injector();
                if (inj) {
                    try {
                        const popup = inj.get('$ionicPopup');
                        if (popup) {
                            if (popup._popupStack && popup._popupStack.length > 0) {
                                popup._popupStack.forEach(p => { try { p.close(); } catch(e){} });
                            }
                            try { popup.close(); } catch(e) {}
                        }
                    } catch(e) {}
                    try { inj.get('$ionicModal').close(); } catch(e) {}
                }
            }
        } catch(e) {}

        // 第4步：ion-alert dismiss API
        document.querySelectorAll('ion-alert').forEach(alert => {
            if (typeof alert.dismiss === 'function') {
                try { alert.dismiss(); } catch(e) {}
            }
        });

        // 第5步：延迟50ms后清理残留DOM（给框架时间处理关闭）
        setTimeout(() => {
            document.querySelectorAll(
                '.popup-container, .popup, ion-alert, ion-backdrop, ' +
                '.backdrop, .alert-wrapper, .modal-backdrop, ion-modal'
            ).forEach(el => {
                try { el.remove(); } catch(e) {}
            });
            document.body.classList.remove('popup-open', 'modal-open');
            document.body.style.overflow = '';
            document.body.style.pointerEvents = '';
        }, 50);

        return dismissed;
    };

    // MutationObserver：弹窗出现时立即尝试点击关闭
    if (!window._popupObserver) {
        window._popupObserver = new MutationObserver(function(mutations) {
            let hasPopup = false;
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        const tag = (node.tagName || '').toLowerCase();
                        const cls = (node.className || '').toString().toLowerCase();
                        if (tag === 'ion-alert' || tag === 'ion-backdrop' ||
                            cls.includes('popup') || cls.includes('backdrop') ||
                            cls.includes('alert') || cls.includes('modal')) {
                            hasPopup = true;
                        }
                    }
                });
            });
            if (hasPopup) {
                // 等弹窗渲染完再点按钮
                setTimeout(dismissPopups, 100);
            }
        });
        window._popupObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (!window._popupInterval) {
        window._popupInterval = setInterval(dismissPopups, 300);
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
                title.textContent = T.processing;
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
                <div style="font-size:60px; margin-bottom:20px;">${T.box}</div>
                <div id="stealth-title" style="font-size:22px; font-weight:bold; color:#333; margin-bottom:15px;">
                    ${T.processing}
                </div>
                <div id="stealth-progress" style="font-size:16px; color:#666; margin-bottom:20px;">
                    ${T.progress}: ${done} / ${total}  (${pct}%)
                </div>
                <div style="width:260px; height:8px; background:#e0e0e0; border-radius:4px; overflow:hidden; margin-bottom:20px;">
                    <div id="stealth-bar" style="width:${pct}%; height:100%; background:linear-gradient(90deg,#4CAF50,#8BC34A); border-radius:4px; transition:width 0.3s;"></div>
                </div>
                <div id="stealth-stats" style="font-size:14px; color:#888; line-height:1.8;">
                    <span id="stat-success" style="color:#4CAF50;">\u2713 ${T.success}: ${s.success}</span>&nbsp;&nbsp;
                    <span id="stat-nostock" style="color:#999;">\u25cb ${T.nostock}: ${s.nostock}</span><br>
                    <span id="stat-skip" style="color:#FF9800;">\u25b3 ${T.skip}: ${s.skip}</span>&nbsp;&nbsp;
                    <span id="stat-fail" style="color:#f44336;">\u2717 ${T.fail}: ${s.fail}</span>
                </div>
                <div id="stealth-current" style="font-size:13px; color:#aaa; margin-top:15px;">
                    ${T.current}: --
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

        if (status.includes(T.success)) window._stealthStats.success++;
        else if (status.includes(T.noItem)) window._stealthStats.nostock++;
        else if (status.includes(T.skip)) window._stealthStats.skip++;
        else if (status.includes(T.fail)) window._stealthStats.fail++;

        const bar = document.getElementById('stealth-bar');
        const progress = document.getElementById('stealth-progress');
        const current = document.getElementById('stealth-current');
        const logBox = document.getElementById('stealth-log');

        if (bar) bar.style.width = pct + '%';
        if (progress) progress.textContent = T.progress + ': ' + (idx + 1) + ' / ' + total + '  (' + pct + '%)';
        if (current) current.textContent = T.current + ': ' + barcode;

        const ss = document.getElementById('stat-success');
        const sn = document.getElementById('stat-nostock');
        const sk = document.getElementById('stat-skip');
        const sf = document.getElementById('stat-fail');
        if (ss) ss.textContent = '\u2713 ' + T.success + ': ' + window._stealthStats.success;
        if (sn) sn.textContent = '\u25cb ' + T.nostock + ': ' + window._stealthStats.nostock;
        if (sk) sk.textContent = '\u25b3 ' + T.skip + ': ' + window._stealthStats.skip;
        if (sf) sf.textContent = '\u2717 ' + T.fail + ': ' + window._stealthStats.fail;

        if (logBox) {
            let color = '#666';
            if (status.includes(T.success)) color = '#4CAF50';
            else if (status.includes(T.skip)) color = '#FF9800';
            else if (status.includes(T.fail)) color = '#f44336';

            const entry = document.createElement('div');
            entry.style.cssText = `padding:2px 0; border-bottom:1px solid #f0f0f0; color:${color};`;
            entry.textContent = barcode + ' \u2192 ' + status;
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
                title.textContent = T.complete;
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

    // ====== 执行一次搜索（带重试）======
    const doSearch = async (input, barcode) => {
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
    };

    // 检测页面是否被弹窗卡住
    const isPageBlocked = () => {
        return !!(
            document.querySelector('.popup-container, .popup, ion-alert, .alert-wrapper') ||
            document.body.classList.contains('popup-open') ||
            document.body.classList.contains('modal-open')
        );
    };

    // 记录上一次搜索结果的商品信息，用于判断搜索是否生效
    let lastSearchFingerprint = '';

    const getResultFingerprint = () => {
        // 用页面上第一个商品的文本内容作为指纹
        const item = document.querySelector('.item, .product-item, .search-result, .card');
        if (item) return item.innerText.substring(0, 50);
        // 也检查搜索框当前值
        const input = document.querySelector('input.searchinput') || document.querySelector('input[type="search"]');
        return input ? input.value : '';
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

        // 每次循环开始先清理弹窗
        dismissPopups();

        const barcode = list[window.curIdx];

        const current = document.getElementById('stealth-current');
        if (current) current.textContent = T.searching + ': ' + barcode;

        const input = document.querySelector('input.searchinput') || document.querySelector('input[type="search"]');

        if (!input) {
            hideOverlay();
            window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:T.noInput});
            return;
        }

        // 搜索 + 重试机制（最多3次）
        let searchWorked = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            // 如果页面被弹窗卡住，先关弹窗
            if (isPageBlocked()) {
                dismissPopups();
                await new Promise(r => setTimeout(r, 300));
                // 再检查一次，如果还卡着就强制清理
                if (isPageBlocked()) {
                    document.querySelectorAll(
                        '.popup-container, .popup, ion-alert, ion-backdrop, ' +
                        '.backdrop, .alert-wrapper, .modal-backdrop, ion-modal'
                    ).forEach(el => { try { el.remove(); } catch(e) {} });
                    document.body.classList.remove('popup-open', 'modal-open');
                    document.body.style.overflow = '';
                    document.body.style.pointerEvents = '';
                    await new Promise(r => setTimeout(r, 200));
                }
            }

            const fpBefore = getResultFingerprint();
            await doSearch(input, barcode);
            await new Promise(r => setTimeout(r, randBetween(SEARCH_WAIT, SEARCH_WAIT + SEARCH_WAIT_EXTRA)));

            // 检查搜索是否生效
            const fpAfter = getResultFingerprint();

            // 搜索生效的判断：指纹变了，或者搜索框值是当前条码
            const currentInputVal = input.value || '';
            if (fpAfter !== fpBefore || currentInputVal === barcode || attempt === 2) {
                searchWorked = true;
                break;
            }

            // 搜索没生效，关弹窗后重试
            dismissPopups();
            await new Promise(r => setTimeout(r, 500));
        }

        dismissPopups();

        let addStatus = T.noProduct;
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
                addStatus = T.inCart;
            } else if (visibleBtns.length === 1) {
                const addBtn = visibleBtns[0];
                ['mousedown', 'mouseup', 'click'].forEach(t => {
                    addBtn.dispatchEvent(new MouseEvent(t, { view: window, bubbles: true, cancelable: true, buttons: 1 }));
                });
                try { window.angular.element(addBtn).scope().$apply(); } catch(e){}
                addStatus = T.addOk;
            } else {
                addStatus = T.btnFail;
            }
        }

        updateOverlay(barcode, window.curIdx, addStatus);

        window.webkit.messageHandlers.bridge.postMessage({type:'update', code: barcode, idx: window.curIdx, status: addStatus});
        window.curIdx++;

        // 批次冷却：每 BATCH_SIZE 个条码休息 BATCH_COOLDOWN
        if (window.curIdx % BATCH_SIZE === 0 && window.curIdx < list.length) {
            const coolSec = Math.round(BATCH_COOLDOWN / 1000);
            const title = document.getElementById('stealth-title');
            if (title) title.textContent = '\u51b7\u5374\u4e2d... ' + coolSec + '\u79d2';  // 冷却中... Xs秒
            window.webkit.messageHandlers.bridge.postMessage({type:'log', msg: '\u25cf \u6279\u6b21\u51b7\u5374 ' + coolSec + '\u79d2'});  // ● 批次冷却 Xs
            setTimeout(() => {
                if (title) title.textContent = T.processing;
                run();
            }, BATCH_COOLDOWN);
            return;
        }

        const nextDelay = randBetween(MIN_DELAY, MAX_DELAY);
        setTimeout(run, nextDelay);
    };

    // 启动：关闭弹窗，显示遮罩，开始任务
    dismissPopups();
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
