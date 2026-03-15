window.startAutoTask = function(list) {
    window.isPaused = false;
    if (typeof window.curIdx === 'undefined') window.curIdx = 0;

    // ====== 自适应防封控系统 ======
    // 基础参数
    const BASE_DELAY = 3000;         // 基础间隔3秒
    const MAX_DELAY = 10000;         // 最大间隔10秒
    const BATCH_SIZE = 20;           // 每批处理数量
    const BATCH_COOLDOWN = 30000;    // 每批冷却30秒
    const SEARCH_WAIT = 3000;        // 搜索后等待
    const MAX_FREQ_RETRIES = 5;      // 最大连续频控重试

    // 自适应状态
    if (typeof window._freqRetryCount === 'undefined') window._freqRetryCount = 0;
    if (typeof window._speedMultiplier === 'undefined') window._speedMultiplier = 1.0;
    if (typeof window._consecutiveSuccess === 'undefined') window._consecutiveSuccess = 0;

    const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // 自适应延迟计算：触发频控越多越慢，连续成功则逐步加快
    const getAdaptiveDelay = () => {
        const base = BASE_DELAY * window._speedMultiplier;
        const jitter = randBetween(-500, 1500);
        return Math.min(Math.max(base + jitter, 2000), MAX_DELAY);
    };

    const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 && rect.height > 0 &&
                rect.top >= 0 && rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth));
    };

    // 增强弹窗检测
    const dismissFrequencyPopup = () => {
        let isDismissed = false;
        const allText = document.body.innerText || '';
        const hasFreqText = allText.includes('操作过于频繁') ||
                            allText.includes('频繁') ||
                            allText.includes('too frequent') ||
                            allText.includes('Information') ||
                            allText.includes('请稍后再试') ||
                            allText.includes('try again');

        const modalSelectors = [
            '.modal', '.popup', '.dialog', '.overlay', '.alert',
            '[class*="modal"]', '[class*="popup"]', '[class*="dialog"]',
            '[class*="overlay"]', '[class*="alert"]', '.backdrop',
            'ion-alert', 'ion-modal', '.alert-wrapper'
        ];
        const visibleModal = modalSelectors.some(sel => {
            const el = document.querySelector(sel);
            return el && el.offsetParent !== null && el.getBoundingClientRect().height > 0;
        });

        if (hasFreqText || visibleModal) {
            const btnSelectors = [
                'button', '.button', '[role="button"]',
                '.alert-button', 'ion-alert button',
                '.modal button', '.popup button', '.dialog button'
            ];
            const allBtns = document.querySelectorAll(btnSelectors.join(', '));
            for (let b of allBtns) {
                const txt = b.innerText.trim().toLowerCase();
                if (txt === 'ok' || txt === '确定' || txt === '关闭' ||
                    txt === 'close' || txt === '知道了' || txt === '好的' || txt === '取消') {
                    if (b.offsetParent !== null) {
                        b.click();
                        isDismissed = true;
                        break;
                    }
                }
            }
            if (!isDismissed) {
                for (let b of allBtns) {
                    if (b.offsetParent !== null && b.getBoundingClientRect().height > 0) {
                        b.click();
                        isDismissed = true;
                        break;
                    }
                }
            }
        }
        return isDismissed;
    };

    // 频控触发后的处理：指数退避 + 自适应减速
    const handleFreqBlock = (barcode) => {
        window._freqRetryCount++;
        window._consecutiveSuccess = 0;

        // 自适应减速：每次触发频控，速度乘数+0.5
        window._speedMultiplier = Math.min(window._speedMultiplier + 0.5, 3.0);

        if (window._freqRetryCount >= MAX_FREQ_RETRIES) {
            const longWait = 90000;
            window.webkit.messageHandlers.bridge.postMessage({
                type:'update', code: barcode, idx: window.curIdx,
                status: "频控严重：连续" + window._freqRetryCount + "次，冷却90秒(速度已降至" + window._speedMultiplier.toFixed(1) + "x)"
            });
            window._freqRetryCount = 0;
            setTimeout(run, longWait);
            return;
        }

        const backoff = 5000 * Math.pow(2, window._freqRetryCount - 1);
        const backoffSec = Math.round(backoff / 1000);
        window.webkit.messageHandlers.bridge.postMessage({
            type:'update', code: barcode, idx: window.curIdx,
            status: "频控(第" + window._freqRetryCount + "次)退避" + backoffSec + "秒 速度:" + window._speedMultiplier.toFixed(1) + "x"
        });
        setTimeout(run, backoff);
    };

    const run = async () => {
        if (window.isPaused || window.curIdx >= list.length) {
            if (window.curIdx >= list.length) window.webkit.messageHandlers.bridge.postMessage({type:'finish'});
            return;
        }

        // 批次冷却
        if (window.curIdx > 0 && window.curIdx % BATCH_SIZE === 0 && window.lastSleepIdx !== window.curIdx) {
            window.lastSleepIdx = window.curIdx;
            // 自适应冷却：速度越慢冷却越长
            const cooldown = Math.round(BATCH_COOLDOWN * window._speedMultiplier);
            const cooldownSec = Math.round(cooldown / 1000);
            window.webkit.messageHandlers.bridge.postMessage({
                type: 'update', code: 'System', idx: window.curIdx,
                status: "已处理" + BATCH_SIZE + "个，冷却" + cooldownSec + "秒..."
            });
            setTimeout(run, cooldown);
            return;
        }

        const barcode = list[window.curIdx];

        // 搜索前检查弹窗
        if (dismissFrequencyPopup()) {
            handleFreqBlock(barcode);
            return;
        }

        // 未触发频控 → 记录连续成功
        window._freqRetryCount = 0;
        window._consecutiveSuccess++;

        // 自适应加速：连续成功30次，速度乘数-0.1（最低恢复到1.0）
        if (window._consecutiveSuccess % 30 === 0 && window._speedMultiplier > 1.0) {
            window._speedMultiplier = Math.max(window._speedMultiplier - 0.2, 1.0);
            window.webkit.messageHandlers.bridge.postMessage({
                type: 'update', code: 'System', idx: window.curIdx,
                status: "连续成功" + window._consecutiveSuccess + "次，提速至" + window._speedMultiplier.toFixed(1) + "x"
            });
        }

        const input = document.querySelector('input.searchinput') || document.querySelector('input[type="search"]');
        if (!isVisible(input)) {
            window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'搜索框未在可视区域，任务已拦截'});
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

        await new Promise(r => setTimeout(r, randBetween(300, 800)));

        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));
        input.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));

        try {
            if (typeof window.angular !== 'undefined') {
                let scope = window.angular.element(input).scope();
                if (scope && scope.keypress) scope.keypress.search({ which: 13 });
            }
        } catch(e) {}

        await new Promise(r => setTimeout(r, randBetween(SEARCH_WAIT, SEARCH_WAIT + 1500)));

        // 搜索后再次检查弹窗
        if (dismissFrequencyPopup()) {
            handleFreqBlock(barcode);
            return;
        }

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

        window.webkit.messageHandlers.bridge.postMessage({type:'update', code: barcode, idx: window.curIdx, status: addStatus});
        window.curIdx++;

        // 自适应间隔
        const nextDelay = getAdaptiveDelay();
        setTimeout(run, nextDelay);
    };
    run();
};
