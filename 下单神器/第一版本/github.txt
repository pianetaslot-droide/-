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

    const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 && rect.height > 0 &&
                rect.top >= 0 && rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth));
    };

    // ====== 终极弹窗关闭（7种方法） ======
    const dismissFrequencyPopup = () => {
        const allText = document.body.innerText || '';
        const hasFreqText = allText.includes('操作过于频繁') ||
                            allText.includes('频繁') ||
                            allText.includes('too frequent') ||
                            allText.includes('Information') ||
                            allText.includes('请稍后再试') ||
                            allText.includes('try again');

        const ionAlert = document.querySelector('ion-alert');
        const hasIonAlert = ionAlert && ionAlert.offsetParent !== null;

        // Ionic 1 专项检测
        const popupContainer = document.querySelector('.popup-container');
        const hasIonic1Popup = popupContainer && popupContainer.offsetParent !== null;

        const modalSelectors = [
            '.modal', '.popup', '.dialog', '.overlay', '.alert',
            '[class*="modal"]', '[class*="popup"]', '[class*="dialog"]',
            '[class*="overlay"]', '[class*="alert"]', '.backdrop',
            '.alert-wrapper'
        ];
        const visibleModal = modalSelectors.some(sel => {
            const el = document.querySelector(sel);
            return el && el.offsetParent !== null && el.getBoundingClientRect().height > 0;
        });

        if (!hasFreqText && !hasIonAlert && !hasIonic1Popup && !visibleModal) {
            return false;
        }

        // === 方法1：Ionic 1 $ionicPopup 服务关闭（最精准） ===
        try {
            if (typeof window.angular !== 'undefined') {
                const injector = window.angular.element(document.body).injector();
                if (injector) {
                    const ionicPopup = injector.get('$ionicPopup');
                    if (ionicPopup) {
                        if (ionicPopup.close) ionicPopup.close();
                        if (ionicPopup._popupStack && ionicPopup._popupStack.length > 0) {
                            ionicPopup._popupStack.forEach(function(p) { try { p.close(); } catch(e){} });
                        }
                    }
                }
            }
        } catch(e) {}

        // === 方法2：Ionic 1 popup scope 关闭 ===
        try {
            if (typeof window.angular !== 'undefined') {
                const popupEl = document.querySelector('.popup-container, .popup, .alert-wrapper, ion-alert');
                if (popupEl) {
                    const scope = window.angular.element(popupEl).scope();
                    if (scope) {
                        if (scope.close) scope.close();
                        else if (scope.$close) scope.$close();
                        else if (scope.hide) scope.hide();
                        else if (scope.dismiss) scope.dismiss();
                        try { scope.$apply(); } catch(e){}
                    }
                }
            }
        } catch(e) {}

        // === 方法3：ion-alert dismiss API ===
        if (ionAlert) {
            try {
                if (typeof ionAlert.dismiss === 'function') ionAlert.dismiss();
            } catch(e) {}
        }

        // === 方法4：Ionic 1 直接点击 .popup-buttons .button ===
        try {
            const ionic1Btns = document.querySelectorAll('.popup-buttons .button, .popup-buttons button, .popup button');
            for (let b of ionic1Btns) {
                if (b.offsetParent !== null) {
                    b.click();
                    HTMLElement.prototype.click.call(b);
                    ['touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(evt => {
                        b.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true }));
                    });
                    const rect = b.getBoundingClientRect();
                    const cx = rect.left + rect.width / 2;
                    const cy = rect.top + rect.height / 2;
                    b.dispatchEvent(new MouseEvent('click', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: cx, clientY: cy, buttons: 1
                    }));
                }
            }
        } catch(e) {}

        // === 方法5：全局搜索所有 Ok/确定 按钮 ===
        try {
            const allBtns = document.querySelectorAll('button, .button, [role="button"], .alert-button, ion-alert button');
            for (let b of allBtns) {
                const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                if (txt === 'ok' || txt === '确定' || txt === '关闭' ||
                    txt === 'close' || txt === '知道了' || txt === '好的' || txt === '取消') {
                    if (b.offsetParent !== null) {
                        b.click();
                        HTMLElement.prototype.click.call(b);
                        ['touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(evt => {
                            b.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true }));
                        });
                    }
                }
            }
        } catch(e) {}

        // === 方法6：模拟触摸坐标点击（绕过事件拦截） ===
        try {
            const okBtns = document.querySelectorAll('.popup-buttons .button, .popup button, ion-alert button, .alert-button');
            for (let b of okBtns) {
                if (b.offsetParent !== null) {
                    const rect = b.getBoundingClientRect();
                    const cx = rect.left + rect.width / 2;
                    const cy = rect.top + rect.height / 2;
                    const touchObj = new Touch({
                        identifier: Date.now(),
                        target: b,
                        clientX: cx, clientY: cy,
                        pageX: cx + window.scrollX,
                        pageY: cy + window.scrollY,
                        radiusX: 10, radiusY: 10,
                        rotationAngle: 0, force: 1
                    });
                    b.dispatchEvent(new TouchEvent('touchstart', {
                        bubbles: true, cancelable: true,
                        touches: [touchObj], targetTouches: [touchObj], changedTouches: [touchObj]
                    }));
                    b.dispatchEvent(new TouchEvent('touchend', {
                        bubbles: true, cancelable: true,
                        touches: [], targetTouches: [], changedTouches: [touchObj]
                    }));
                }
            }
        } catch(e) {}

        // === 方法7：暴力移除 DOM（最后手段，100%有效） ===
        try {
            document.querySelectorAll('.popup-container, .popup, ion-alert, .alert-wrapper, .alert, .modal').forEach(el => {
                el.style.display = 'none';
                el.remove();
            });
            document.querySelectorAll('.backdrop, ion-backdrop, .modal-backdrop').forEach(el => {
                el.style.display = 'none';
                el.remove();
            });
            // 清除 body 上可能的 overflow:hidden
            document.body.classList.remove('popup-open', 'modal-open');
            document.body.style.overflow = '';
            document.body.style.pointerEvents = '';
        } catch(e) {}

        // === 验证：200ms后再检查一次，如果还在就再删 ===
        setTimeout(function() {
            try {
                document.querySelectorAll('.popup-container, .popup, ion-alert, .backdrop, ion-backdrop, .alert-wrapper').forEach(el => el.remove());
                document.body.classList.remove('popup-open', 'modal-open');
                document.body.style.overflow = '';
                document.body.style.pointerEvents = '';
            } catch(e) {}
        }, 200);

        return true;
    };

    const run = async () => {
        if (window.isPaused || window.curIdx >= list.length) {
            if (window.curIdx >= list.length) window.webkit.messageHandlers.bridge.postMessage({type:'finish'});
            return;
        }

        const barcode = list[window.curIdx];

        // 搜索前检查弹窗，关掉后立即继续
        if (dismissFrequencyPopup()) {
            await new Promise(r => setTimeout(r, randBetween(400, 700)));
            setTimeout(run, 0);
            return;
        }

        const input = document.querySelector('input.searchinput') || document.querySelector('input[type="search"]');

        if (!isVisible(input)) {
            window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'搜索框未在当前可视画面，任务已拦截'});
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

        // 搜索后检查弹窗
        if (dismissFrequencyPopup()) {
            await new Promise(r => setTimeout(r, randBetween(400, 700)));
            setTimeout(run, 0);
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

        const nextDelay = randBetween(MIN_DELAY, MAX_DELAY);
        setTimeout(run, nextDelay);
    };
    run();
};
