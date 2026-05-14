import { DEV_MODE } from './build-flags.js';
import { state } from './state.js';

/** 첫 실행·업데이트 후 최초 실행 시각(ms). 기존 사용자는 본 키가 없으면 첫 실행 때 채워짐 */
export const LS_INSTALL_DATE = 'install_date';

/** 자동 후원 안내를 한 번이라도 띄웠으면 true */
export const LS_DONATION_PROMPT_SHOWN = 'donation_prompt_shown';

/** 설치 후 이 일수가 지나면 앱 시작 시 자동 후원 안내 1회 */
export const DONATION_PROMPT_MIN_DAYS = DEV_MODE ? 0 : 60;

export function ensureInstallDateRecorded() {
    try {
        const v = localStorage.getItem(LS_INSTALL_DATE);
        if (v == null || v === '') {
            localStorage.setItem(LS_INSTALL_DATE, String(Date.now()));
        }
    } catch (_) {
        /* ignore */
    }
}

export function syncDonationPromptStateFromStorage() {
    try {
        state.donationPromptShown = localStorage.getItem(LS_DONATION_PROMPT_SHOWN) === 'true';
    } catch (_) {
        state.donationPromptShown = false;
    }
}

export function markDonationAutoPromptShown() {
    state.donationPromptShown = true;
    try {
        localStorage.setItem(LS_DONATION_PROMPT_SHOWN, 'true');
    } catch (_) {
        /* ignore */
    }
}

export function shouldOfferAutoDonationPrompt() {
    if (state.donationPromptShown) {
        return false;
    }
    let raw;
    try {
        raw = localStorage.getItem(LS_INSTALL_DATE);
    } catch (_) {
        return false;
    }
    if (raw == null || raw === '') {
        return false;
    }
    const installMs = Number(raw);
    if (!Number.isFinite(installMs)) {
        return false;
    }
    const days = (Date.now() - installMs) / 86400000;
    return days >= DONATION_PROMPT_MIN_DAYS;
}
