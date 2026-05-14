import { DEV_MODE } from './build-flags.js';
import { i18n } from './languages.js';
import { loadData, saveData } from './api.js';
import { render, applyFontSizeScale, setupCurrencySymbolResizeHandler } from './ui.js';
import { setupEventListeners, showAlertModal, showDonationPromptModal } from './eventHandlers.js';
import { state } from './state.js';
import { initOnboarding } from './onboarding.js';
import { initCustomStatusBar, cleanupCustomStatusBar } from './statusBar.js';
import * as utils from './utils.js';
import {
    ensureInstallDateRecorded,
    syncDonationPromptStateFromStorage,
    shouldOfferAutoDonationPrompt,
} from './donation.js';

// 초기화 플래그
let appInitialized = false;
let keyboardListenersInitialized = false;

// 타이머 참조 저장 (정리용)
let keyboardCloseTimeout = null;

/**
 * Android 네이티브 환경에서 Edge-to-edge 인셋을 비활성화.
 * 상단 여백(상태바 영역)으로 생기는 공백을 제거하기 위한 처리.
 */
async function disableEdgeToEdgeInsets() {
    if (!window.Capacitor?.isNativePlatform || !window.Capacitor.isNativePlatform()) {
        return;
    }
    if (window.Capacitor.getPlatform() !== 'android') {
        return;
    }
    const EdgeToEdge = window.Capacitor.Plugins?.EdgeToEdge;
    if (EdgeToEdge && typeof EdgeToEdge.disable === 'function') {
        try {
            await EdgeToEdge.disable();
        } catch (error) {
            if (DEV_MODE) {
                console.warn('EdgeToEdge 비활성화 실패:', error);
            }
        }
    }
}

// 전역 입력 필드 포커스 상태 (다른 모듈에서도 접근 가능)
window.isInputFocused = false;

/**
 * 에러 발생 시 화면에 표시할 UI를 생성합니다.
 */
function showErrorUI(message, stack) {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 20px; text-align: center; font-family: sans-serif; background: white; z-index: 9999; position: fixed; inset: 0; overflow: auto;';

    const title = document.createElement('h1');
    title.style.color = 'red';
    try {
        title.textContent = (typeof i18n !== 'undefined' && i18n?.t) ? i18n.t('modal.title.error') : 'Error';
    } catch {
        title.textContent = 'Error';
    }

    const msg = document.createElement('p');
    const fallbackMsg = 'An unknown error occurred. Please refresh the page.';
    try {
        msg.textContent = message || ((typeof i18n !== 'undefined' && i18n?.t) ? i18n.t('api.error.unknown') : fallbackMsg);
    } catch {
        msg.textContent = message || fallbackMsg;
    }

    container.appendChild(title);
    container.appendChild(msg);

    if (DEV_MODE && stack) {
        const pre = document.createElement('pre');
        pre.style.cssText = 'text-align: left; background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto; font-size: 12px;';
        pre.textContent = stack;
        container.appendChild(pre);
    }

    document.body.textContent = '';
    document.body.appendChild(container);
}

// 전역 에러 핸들러 설정 (모듈 로드 전에 설정)
window.addEventListener('error', (event) => {
    if (document.body) {
        const err = event.error;
        showErrorUI(
            err?.message || event.message,
            err?.stack
        );
    }
});

// 모듈 로드 에러 핸들러
window.addEventListener('unhandledrejection', (event) => {
    if (DEV_MODE) {
        console.warn('Unhandled Promise rejection:', event.reason);
    }
});

/**
 * 앱의 언어를 적용하고 화면의 모든 텍스트를 업데이트하는 함수.
 * @param {string} langCode - 'ko', 'en' 등 언어 코드
 */
export function applyLanguage(langCode) {
    i18n.setLocale(langCode);
    document.documentElement.lang = langCode;
    document.documentElement.dir = (langCode === 'ar' || langCode === 'ur') ? 'rtl' : 'ltr';
    state.user.language = langCode;
    saveData();
}

/**
 * 프리미엄: 현재 빌드에서는 과목 확장·잠금 기능을 전원 무료로 제공한다.
 * 과거 IAP로 저장·복원하던 로직은 아래 블록에 보관했다. 복원 시 주석 해제하고 위 한 줄 할당을 제거하면 된다.
 */
async function initializePremiumState() {
    try {
        state.isPurchasedExpansion = true;
        state.isPurchasedLock = true;
        state.MAX_SUBJECTS = 10;
        try {
            localStorage.setItem('purchased_expansion', 'true');
            localStorage.setItem('purchased_lock', 'true');
        } catch (_) {
            /* ignore */
        }

        /* === RESTORE_IAP_PREMIUM_STATE_START
        import { PRODUCT_IDS } from './iap-products.js';

        async function fetchOwnedInAppProductIds() {
            try {
                const Capacitor = window.Capacitor;
                if (!Capacitor || typeof Capacitor.isNativePlatform !== 'function' || !Capacitor.isNativePlatform()) {
                    return null;
                }
                const plugin = Capacitor.Plugins?.NativePurchases;
                if (!plugin || typeof plugin.getPurchases !== 'function') {
                    return null;
                }
                try {
                    if (typeof plugin.isBillingSupported === 'function') {
                        const { isBillingSupported } = await plugin.isBillingSupported();
                        if (!isBillingSupported) {
                            return null;
                        }
                    }
                } catch (_) {}
                const result = await plugin.getPurchases({});
                const purchases = result?.purchases || [];
                const ownedIds = new Set();
                const now = Date.now();
                purchases.forEach((purchase) => {
                    const id = purchase?.productIdentifier;
                    if (!id) return;
                    if (purchase.expirationDate) {
                        const exp = new Date(purchase.expirationDate).getTime();
                        if (!isNaN(exp) && exp <= now) {
                            return;
                        }
                    }
                    const purchaseState = purchase.purchaseState ?? '';
                    const isAcknowledged = purchase.isAcknowledged;
                    const isAndroidIapValid =
                        (purchaseState === 'PURCHASED' || purchaseState === '1') &&
                        (isAcknowledged === undefined || !!isAcknowledged);
                    const isActive = purchase.isActive === true;
                    if (isActive || isAndroidIapValid) {
                        ownedIds.add(id);
                    }
                });
                return ownedIds;
            } catch (_) {
                return null;
            }
        }

        if (DEV_MODE) {
            state.isPurchasedExpansion = true;
            state.isPurchasedLock = true;
            state.MAX_SUBJECTS = 10;
            try {
                localStorage.setItem('purchased_expansion', 'true');
                localStorage.setItem('purchased_lock', 'true');
            } catch (_) {}
        } else {
            const purchasedExpansion = localStorage.getItem('purchased_expansion');
            const purchasedLock = localStorage.getItem('purchased_lock');
            state.isPurchasedExpansion = purchasedExpansion === 'true';
            state.isPurchasedLock = purchasedLock === 'true';
            state.MAX_SUBJECTS = state.isPurchasedExpansion ? 10 : 5;
            const ownedIds = await fetchOwnedInAppProductIds();
            if (ownedIds) {
                const hasExpansion = ownedIds.has(PRODUCT_IDS.SUBJECTS_EXPANSION);
                const hasLock = ownedIds.has(PRODUCT_IDS.LOCK_FEATURE);
                state.isPurchasedExpansion = hasExpansion;
                state.isPurchasedLock = hasLock;
                state.MAX_SUBJECTS = hasExpansion ? 10 : 5;
                try {
                    localStorage.setItem('purchased_expansion', hasExpansion ? 'true' : 'false');
                    localStorage.setItem('purchased_lock', hasLock ? 'true' : 'false');
                } catch (_) {}
            }
        }
        === RESTORE_IAP_PREMIUM_STATE_END */

        const savedPasswordHash = localStorage.getItem('lock_password_hash');
        state.lockPasswordHash = savedPasswordHash || null;

        // 잠긴 날짜 목록 (날짜별 잠금)
        try {
            const stored = localStorage.getItem('locked_dates');
            state.lockedDates = Array.isArray(JSON.parse(stored || '[]')) ? JSON.parse(stored) : [];
        } catch {
            state.lockedDates = [];
        }
        // 기존 lock_date 형식 마이그레이션: 있으면 lockedDates에 추가 후 제거
        const oldLockDate = localStorage.getItem('lock_date');
        if (oldLockDate && localStorage.getItem('lock_enabled') === 'true') {
            try {
                const migrated = utils.formatDate(new Date(oldLockDate));
                if (migrated && !state.lockedDates.includes(migrated)) {
                    state.lockedDates.push(migrated);
                    localStorage.setItem('locked_dates', JSON.stringify(state.lockedDates));
                }
            } catch (_) {}
            try {
                localStorage.removeItem('lock_enabled');
                localStorage.removeItem('lock_date');
            } catch (_) {}
        }
    } catch (e) {
        if (DEV_MODE) {
            console.warn('프리미엄 상태 초기화 실패:', e);
        }
    }
}

/**
 * Input 포커스 이벤트 핸들러
 */
function handleFocusIn(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        window.isInputFocused = true;
    }
}

/**
 * Input 포커스 아웃 이벤트 핸들러
 */
function handleFocusOut(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        window.isInputFocused = false;
    }
}

/**
 * 키보드 관련 이벤트 리스너 설정 (한 번만 실행)
 */
function setupKeyboardListeners() {
    if (keyboardListenersInitialized) return;
    keyboardListenersInitialized = true;
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
}

/**
 * 키보드 리스너 정리
 */
function cleanupKeyboardListeners() {
    if (!keyboardListenersInitialized) return;
    document.removeEventListener('focusin', handleFocusIn);
    document.removeEventListener('focusout', handleFocusOut);
    if (keyboardCloseTimeout) {
        clearTimeout(keyboardCloseTimeout);
        keyboardCloseTimeout = null;
    }
    keyboardListenersInitialized = false;
}

/**
 * 온보딩 완료 후 또는 기존 사용자를 위해 메인 앱을 시작하는 함수.
 */
async function startApp() {
    try {
        loadData();
        await initializePremiumState();
        ensureInstallDateRecorded();
        syncDonationPromptStateFromStorage();
        applyFontSizeScale();
        i18n.setLocale(state.user.language);
        setupEventListeners();
        render('main');
        initCustomStatusBar();
        setupCurrencySymbolResizeHandler();

        /* 첫 설치 후 온보딩 직후 등: WebView가 flex 스크롤 영역 높이를 늦게 확정하는 경우 보조 */
        try {
            const Cap = window.Capacitor;
            const isAndroidNative =
                Cap
                && typeof Cap.isNativePlatform === 'function'
                && Cap.isNativePlatform()
                && typeof Cap.getPlatform === 'function'
                && Cap.getPlatform() === 'android';
            if (isAndroidNative) {
                const nudgeScrollLayout = () => {
                    const sc = document.querySelector('#appContainer .scroll-content');
                    if (sc) {
                        void sc.getBoundingClientRect();
                    }
                    try {
                        window.dispatchEvent(new Event('resize'));
                    } catch (_) {
                        /* ignore */
                    }
                };
                requestAnimationFrame(() => {
                    nudgeScrollLayout();
                    requestAnimationFrame(nudgeScrollLayout);
                });
            }
        } catch (_) {
            /* ignore */
        }

        if (!history.state || (!history.state.mainView && !history.state.settingsOpen && !history.state.calendarView)) {
            history.replaceState({ mainView: true }, '');
        }

        if (shouldOfferAutoDonationPrompt()) {
            await showDonationPromptModal({ autoTrackShown: true });
        }

        /* Android 13+: 타이머 과목이 있는데 예전에 알림 권한을 안 받은 경우 대비 */
        try {
            const { ensureAndroidNotificationIfUsesTimerSubjects } = await import('./timer.js');
            void ensureAndroidNotificationIfUsesTimerSubjects();
        } catch (_) {
            /* ignore */
        }
    } catch (error) {
        if (DEV_MODE) {
            console.error('앱 시작 오류:', error);
        }
        try {
            await showAlertModal(i18n.t('modal.title.error'), i18n.t('api.error.startFailed'));
        } catch (modalError) {
            if (DEV_MODE) {
                console.warn('모달 표시 실패:', modalError);
            }
        }
    }
}

/**
 * 앱 초기화 함수
 */
async function initializeApp() {
    if (appInitialized) {
        if (DEV_MODE) console.warn('앱이 이미 초기화되었습니다.');
        return;
    }

    try {
        if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.getPlatform() === 'android') {
            document.documentElement.classList.add('platform-android');
        }
    } catch (_) {}

    try {
        await disableEdgeToEdgeInsets();

        try {
            loadData();
        } catch (loadError) {
            if (DEV_MODE) console.warn('데이터 로드 실패 (기본값 사용):', loadError);
        }

        // 프리미엄 인앱 결제/잠금 상태 복원
        await initializePremiumState();

        const onboardingView = document.getElementById('onboardingView');
        const appContainer = document.getElementById('appContainer');

        if (!onboardingView || !appContainer) {
            throw new Error(
                i18n.t('api.error.missingElements') +
                ' (onboardingView: ' + !!onboardingView + ', appContainer: ' + !!appContainer + ')'
            );
        }

        if (state.onboardingCompleted) {
            onboardingView.style.display = 'none';
            appContainer.style.display = 'flex';
            try {
                await startApp();
            } catch (startError) {
                if (DEV_MODE) console.error('앱 시작 실패:', startError);
                appContainer.style.display = 'none';
                onboardingView.style.display = 'flex';
                state.onboardingCompleted = false;
                await initOnboarding(startApp);
            }
        } else {
            appContainer.style.display = 'none';
            onboardingView.style.display = 'flex';
            await initOnboarding(startApp);
        }

        window.addEventListener('beforeunload', () => {
            try {
                saveData();
            } catch (e) {
                if (DEV_MODE) console.warn('데이터 저장 실패:', e);
            }
        });

        setupKeyboardListeners();
        appInitialized = true;

    } catch (error) {
        appInitialized = false;
        if (DEV_MODE) {
            console.error('❌ 앱 초기화 오류:', error);
        }
        showErrorUI(
            error.message || i18n.t('api.error.initFailed'),
            error.stack
        );
    }
}

/**
 * 리소스 정리 함수 (필요시 사용)
 */
function cleanup() {
    cleanupKeyboardListeners();
    cleanupCustomStatusBar();
    appInitialized = false;
}

// DOM 로드 완료 후 앱 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

export { cleanup };
