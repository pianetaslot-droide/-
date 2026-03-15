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

    // ====== 弹窗隐身术：不关弹窗，让弹窗透明+不可交互，在下面继续操作 ======

    // 注入全局CSS：任何弹窗出现都立即隐形
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
            body.popup-open > :not(.popup-container):not(.backdrop):not(ion-backdrop),
            body.modal-open > :not(.modal):not(.backdrop):not(ion-backdrop) {
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);
        window._popupCSSInjected = true;
    }

    // MutationObserver：实时监控DOM，弹窗一出现就立即删除
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

            // 持续清理 body 状态
            document.body.classList.remove('popup-open', 'modal-open');
            document.body.style.overflow = '';
            document.body.style.pointerEvents = '';
        });

        window._popupObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 主动清理一次现有弹窗
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

        // 尝试通过 Ionic 服务关闭
        try {
            if (typeof window.angular !== 'undefined') {
                const injector = window.angular.element(document.body).injector();
                if (injector) {
                    try {
                        const ionicPopup = injector.get('$ionicPopup');
                        if (ionicPopup && ionicPopup.close) ionicPopup.close();
                    } catch(e) {}
                    try {
                        const ionicModal = injector.get('$ionicModal');
                        if (ionicModal && ionicModal.close) ionicModal.close();
                    } catch(e) {}
                }
            }
        } catch(e) {}

        // ion-alert dismiss
        const ionAlert = document.querySelector('ion-alert');
        if (ionAlert && typeof ionAlert.dismiss === 'function') {
            try { ionAlert.dismiss(); } catch(e) {}
        }
    };

    // 每500ms自动清一次弹窗（保险）
    if (!window._popupInterval) {
        window._popupInterval = setInterval(nukePopups, 500);
    }

    const run = async () => {
        if (window.isPaused || window.curIdx >= list.length) {
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
                window.webkit.messageHandlers.bridge.postMessage({type:'finish'});
            }
            return;
        }

        // 每次操作前先清弹窗
        nukePopups();

        const barcode = list[window.curIdx];

        const input = document.querySelector('input.searchinput') || document.querySelector('input[type="search"]');

        if (!input) {
            window.webkit.messageHandlers.bridge.postMessage({type:'auto_pause', msg:'找不到搜索框，任务已拦截'});
            return;
        }

        // 不再检查 isVisible，因为弹窗可能遮挡但实际搜索框还在
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

        // 搜索后清弹窗
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

        window.webkit.messageHandlers.bridge.postMessage({type:'update', code: barcode, idx: window.curIdx, status: addStatus});
        window.curIdx++;

        const nextDelay = randBetween(MIN_DELAY, MAX_DELAY);
        setTimeout(run, nextDelay);
    };

    // 启动前先清一波
    nukePopups();
    run();
};
