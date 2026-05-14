import { DEV_MODE } from './build-flags.js';
// 상태 관리를 위해 state.js에서 state 객체를 임포트합니다.
import { state } from './state.js';
// 언어별 설정을 위해 languages.js에서 resources를 임포트합니다.
import { resources } from './languages.js';

/**
 * 개발 모드에서만 경고 로그를 남깁니다.
 * @param {string} message - 로그 메시지
 * @param {Error|unknown} [error] - 에러 객체
 */
export function logDevWarning(message, error) {
    if (!DEV_MODE) return;
    console.warn(message, ...(error !== undefined ? [error] : []));
}

/** Date 객체가 유효한지 확인하는 내부 헬퍼 */
function isDate(d) {
    return d instanceof Date && !isNaN(d.getTime());
}

/**
 * 날짜 객체를 'YYYY-MM-DD' 형식의 문자열로 변환합니다. (데이터 키로 사용)
 * @param {Date} date - 변환할 날짜 객체
 * @returns {string} 'YYYY-MM-DD' 형식
 */
export function formatDate(date) {
    if (!isDate(date)) date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 날짜 객체를 현재 언어 설정에 맞는 형식으로 변환합니다. (화면 표시용)
 * @param {Date} date - 변환할 날짜 객체
 * @returns {string} 현지화된 날짜 문자열
 */
export function formatDisplayDate(date) {
    if (!isDate(date)) date = new Date();
    const langCode = state.user?.language || 'en';
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    try {
        return new Intl.DateTimeFormat(langCode, options).format(date);
    } catch (error) {
        // 폴백: 기본 영어 형식
        return new Intl.DateTimeFormat('en', options).format(date);
    }
}

/**
 * 숫자를 현재 언어의 통화 형식으로 자동 변환합니다.
 * @param {number} amount - 포맷할 금액
 * @returns {string} 현지화된 통화 문자열 (예: ₩500, $0.25)
 */
export function formatCurrency(amount) {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
        amount = 0;
    }
    
    const currencyInfo = state.settings?.currency;
    const langCode = state.user?.language || 'en';
    const decimal = currencyInfo?.decimal || 0;
    const symbol = currencyInfo?.symbol || '';
    const position = currencyInfo?.position || 'before';
    const space = (langCode === 'ar' && position === 'before') ? ' ' : '';
    
    if (currencyInfo) {
        let formatted;
        try {
            formatted = new Intl.NumberFormat(langCode, {
                minimumFractionDigits: decimal,
                maximumFractionDigits: decimal
            }).format(amount);
        } catch (error) {
            // 폴백: 간단한 포맷
            formatted = amount.toFixed(decimal);
        }
        
        return position === 'before' 
            ? `${symbol}${space}${formatted}` 
            : `${formatted}${space}${symbol}`;
    }
    
    // 통화 정보가 없으면 기본 포맷
    try {
        return amount.toLocaleString(langCode);
    } catch (error) {
        return String(amount);
    }
}

/**
 * 숫자 입력의 앞자리 0을 정리합니다.
 * @param {string|number} value - 입력 값
 * @param {boolean} allowDecimal - 소수점 허용 여부
 * @returns {string} 정리된 숫자 문자열
 */
export function normalizeNumericInput(value, allowDecimal = false) {
    if (value === null || value === undefined) return '';
    let str = String(value);
    if (str === '') return '';

    if (allowDecimal) {
        if (str.startsWith('.')) {
            str = `0${str}`;
        }
        const parts = str.split('.');
        let integerPart = parts[0];
        const decimalPart = parts[1];
        integerPart = integerPart.replace(/^0+(?=\d)/, '');
        if (integerPart === '') integerPart = '0';
        if (decimalPart !== undefined) {
            return `${integerPart}.${decimalPart}`;
        }
        return integerPart;
    }

    str = str.replace(/^0+(?=\d)/, '');
    return str === '' ? '0' : str;
}

/**
 * 함수 실행을 지연(디바운스)합니다.
 * @param {Function} fn - 실행할 함수
 * @param {number} delay - 지연 시간(ms)
 * @returns {Function} 디바운스된 함수
 */
export function debounce(fn, delay = 150) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * 팝업 컨테이너를 가져오거나 생성합니다.
 * @returns {HTMLElement} 팝업 컨테이너 요소
 */
function getPopupContainer() {
    let container = document.getElementById('popupContainer');
    if (!container && document.body) {
        container = document.createElement('div');
        container.id = 'popupContainer';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * 동적 팝업 메시지를 생성하고 보여줍니다.
 * @param {string} message - 표시할 메시지
 * @param {string} type - 팝업 종류 ('encouragement', 'discourage', 'progress')
 */
export function showPopupMessage(message, type = 'encouragement') {
    if (!message || typeof message !== 'string') return;
    
    const container = getPopupContainer();
    if (!container) return;
    
    const popup = document.createElement('div');
    popup.className = `popup ${type}`;
    popup.textContent = message;
    container.appendChild(popup);

    setTimeout(() => {
        if (popup.parentNode) {
            popup.remove();
        }
    }, 700);
}

/**
 * 금액 초과 경고 팝업을 표시합니다.
 * @param {string} message - 표시할 메시지
 */
export function showAmountLimitPopup(message) {
    if (!message || typeof message !== 'string') return;
    
    const container = getPopupContainer();
    if (!container) return;
    
    // 기존 팝업 제거
    container.querySelectorAll('.amount-limit-popup').forEach(popup => popup.remove());
    
    const popup = document.createElement('div');
    popup.className = 'amount-limit-popup';
    
    // XSS 방지를 위해 textContent 사용
    const icon = document.createElement('div');
    icon.className = 'amount-limit-icon';
    icon.textContent = '⚠️';
    const messageDiv = document.createElement('div');
    messageDiv.className = 'amount-limit-message';
    messageDiv.textContent = message;
    
    popup.appendChild(icon);
    popup.appendChild(messageDiv);
    container.appendChild(popup);
    
    requestAnimationFrame(() => {
        popup.classList.add('show');
    });
    
    setTimeout(() => {
        popup.classList.remove('show');
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
        }, 300);
    }, 3000);
}

/**
 * 폭죽(Confetti) 효과를 화면에 보여줍니다.
 */
export function createConfetti() {
    const confettiContainer = document.getElementById('confetti');
    if (!confettiContainer) return;
    
    // 이전 폭죽 효과 제거
    confettiContainer.innerHTML = '';
    confettiContainer.style.display = 'block';
    
    // DocumentFragment를 사용하여 DOM 조작 최적화
    const fragment = document.createDocumentFragment();
    const particleCount = 50;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random()}s`;
        particle.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        fragment.appendChild(particle);
    }
    
    confettiContainer.appendChild(fragment);
    
    setTimeout(() => {
        confettiContainer.style.display = 'none';
        confettiContainer.innerHTML = '';
    }, 2000);
}

/**
 * 월을 'YYYY-MM' 형식으로 포맷팅
 * @param {Date} date - 날짜 객체
 * @returns {string} 'YYYY-MM' 형식
 */
export function formatMonth(date) {
    if (!isDate(date)) date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * 진행률 퍼센트 계산
 * @param {number} done - 완료 수
 * @param {number} total - 전체 수
 * @returns {number} 퍼센트 (0-100)
 */
export function calcPercent(done, total) {
    if (typeof done !== 'number' || typeof total !== 'number' || isNaN(done) || isNaN(total)) {
        return 0;
    }
    if (total <= 0) return 0;
    return Math.min(Math.max((done / total) * 100, 0), 100);
}

/**
 * 날짜 유효성 검사
 * @param {string|Date} date - 검사할 날짜
 * @returns {boolean} 유효한 날짜인지 여부
 */
export function isValidDate(date) {
    if (!date) return false;
    return isDate(new Date(date));
}

/**
 * 금액 유효성 검사
 * @param {number} amount - 검사할 금액
 * @param {number} min - 최소값
 * @param {number} max - 최대값
 * @returns {boolean} 유효한 금액인지 여부
 */
export function isValidAmount(amount, min = 0, max = 10000000) {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
        return false;
    }
    if (typeof min !== 'number' || typeof max !== 'number' || isNaN(min) || isNaN(max)) {
        return false;
    }
    return amount >= min && amount <= max;
}

/**
 * 이름 유효성 검사
 * @param {string} name - 검사할 이름
 * @returns {boolean} 유효한 이름인지 여부
 */
export function isValidName(name) {
    if (!name || typeof name !== 'string') return false;
    
    const trimmed = name.trim();
    if (trimmed.length < 1) return false;
    
    try {
        const maxNameLength = resources.getMaxLength(state.user?.language || 'en-US', 'name', state.user?.country);
        if (trimmed.length > maxNameLength) return false;
    } catch (error) {
        // resources 접근 실패 시 기본값 사용
        if (trimmed.length > 20) return false;
    }
    
    // 유니코드 문자·결합문자·공백 허용 — 아랍어, 힌디·태국어 결합 자모(\p{M}) 등
    const validPattern = /^[\p{L}\p{M}\s]+$/u;
    return validPattern.test(trimmed);
}