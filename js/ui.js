// i18n 시스템과 리소스 데이터를 임포트합니다.
import { i18n, resources, languages } from './languages.js';
import { state, calculateMonthlyStats, getSubjectsForDateDisplay, toggleSubjectCompletion, addBonus as stateAddBonus } from './state.js';
// 유틸리티 함수들을 utils.js에서 임포트합니다.
import * as utils from './utils.js';

/** 글자 크기 단계(1–5): root font-size를 px로 설정 → rem 기반 UI가 실시간 반영 */
const FONT_SIZE_PX = { 1: '8px', 2: '12px', 3: '16px', 4: '20px', 5: '24px' };
export function applyFontSizeScale() {
    const step = state.settings.fontSizeScale ?? 3;
    const px = FONT_SIZE_PX[step] ?? '16px';
    document.documentElement.style.fontSize = px;
    reapplySubjectNameFontSizes();
    scheduleTotalAllowanceFontFit();
}

// --- DOM 요소 관리 ---
const elements = {
    // 헤더 요소들
    userNameDisplay: document.getElementById('userNameDisplay'),
    appSubtitle: document.getElementById('appSubtitle'),
    
    // 요약 섹션 요소들
    summarySection: document.querySelector('.summary-section'),
    summaryHeader: document.querySelector('.summary-header'),
    summaryTitle: document.getElementById('summaryTitle'),
    totalAllowance: document.getElementById('totalAllowance'),
    goalAchievedBadge: document.getElementById('goalAchievedBadge'),
    goalAchievedText: document.getElementById('goalAchievedText'),
    progressBar: document.getElementById('progressBar'),
    progressLabel: document.getElementById('progressLabel'),
    progressBarWrapper: document.querySelector('.progress-bar-wrapper'),
    progressLabelContainer: document.querySelector('.progress-label-container'),
    
    // 날짜 탐색 요소들
    currentDate: document.getElementById('currentDate'),
    
    // 과목 그리드 요소들
    subjectsGrid: document.getElementById('subjectsGrid'),
    
    // 추가 용돈 요소들
    bonusTitle: document.getElementById('bonusTitle'),
    additionalReason: document.getElementById('additionalReason'),
    additionalAmount: document.getElementById('additionalAmount'),
    addAdditionalBtn: document.getElementById('addAdditionalBtn'),
    additionalList: document.getElementById('additionalList'),
    
    // 잠금 버튼 (프리미엄 잠금 기능)
    lockToggleBtn: document.getElementById('lockToggleBtn'),
    
    // 팝업 컨테이너
    popupContainer: document.getElementById('popupContainer')
};

const settingsInputDebouncers = new WeakMap();

// --- 계산 로직 ---
// calculateMonthlyStats는 state.js에서 import하여 사용

/**
 * 입력 필드에 통화 기호를 추가하는 함수 (국가별 currencyPosition 적용)
 * @param {HTMLElement} inputElement - 통화 기호를 추가할 입력 필드
 */
function addCurrencySymbolToInput(inputElement) {
    if (!inputElement || !state.settings?.currency) return;
    
    const currency = state.settings.currency;
    const symbol = currency.symbol || '₩';
    const position = currency.position || 'before';
    
    // 이미 통화 기호가 추가되어 있으면 제거
    const parent = inputElement.parentElement;
    const existingSymbol = parent?.querySelector('.currency-symbol');
    if (existingSymbol) existingSymbol.remove();
    
    // 삽입 대상 컨테이너 결정
    let container = parent;
    if (inputElement.classList.contains('subject-amount-input')) {
        if (!container.classList.contains('subject-amount-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'subject-amount-wrapper';
            container.insertBefore(wrapper, inputElement);
            wrapper.appendChild(inputElement);
            container = wrapper;
        } else {
            container = inputElement.parentElement;
        }
    } else if (inputElement.id === 'additionalAmount') {
        const wrapper = inputElement.closest('.additional-amount-wrapper');
        if (wrapper) {
            container = wrapper;
        } else if (parent?.classList.contains('add-additional')) {
            const newWrapper = document.createElement('div');
            newWrapper.className = 'additional-amount-wrapper';
            parent.insertBefore(newWrapper, inputElement);
            newWrapper.appendChild(inputElement);
            container = newWrapper;
        }
    }
    // goal-input-wrapper 등 기타: container = parent 그대로 사용
    
    const symbolElement = document.createElement('span');
    symbolElement.className = 'currency-symbol';
    symbolElement.textContent = symbol;
    
    if (position === 'before') {
        container.insertBefore(symbolElement, inputElement);
    } else {
        container.insertBefore(symbolElement, inputElement.nextSibling);
    }
}

/**
 * 과목 완료 토스트 메시지 표시
 * @param {boolean} isCompleted - 완료 여부
 */
function showSubjectToast(isCompleted) {
    const messages = isCompleted
        ? i18n.t('dashboard.subject.toastDone')
        : i18n.t('dashboard.subject.toastUndone');

    // 배열이면 랜덤 선택, 문자열이면 그대로 사용 (하위 호환성)
    const message = Array.isArray(messages)
        ? messages[Math.floor(Math.random() * messages.length)]
        : messages;
    
    // popupContainer가 없으면 생성
    let popupContainer = elements.popupContainer;
    if (!popupContainer) {
        popupContainer = document.getElementById('popupContainer');
        if (!popupContainer) {
            popupContainer = document.createElement('div');
            popupContainer.id = 'popupContainer';
            document.body.appendChild(popupContainer);
        }
        elements.popupContainer = popupContainer;
    }
    
    // 기존 토스트 모두 제거 (겹쳐서 뜨도록)
    const existingToasts = popupContainer.querySelectorAll('.subject-toast');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = 'subject-toast';
    toast.textContent = message;
    popupContainer.appendChild(toast);
    
    // 애니메이션
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 1000);
}

/** 범용 짧은 토스트 (예: 클립보드 복사 안내) */
export function showToastMessage(message, durationMs = 2200) {
    let popupContainer = elements.popupContainer;
    if (!popupContainer) {
        popupContainer = document.getElementById('popupContainer');
        if (!popupContainer) {
            popupContainer = document.createElement('div');
            popupContainer.id = 'popupContainer';
            document.body.appendChild(popupContainer);
        }
        elements.popupContainer = popupContainer;
    }
    popupContainer.querySelectorAll('.app-inline-toast').forEach((el) => el.remove());

    const toast = document.createElement('div');
    toast.className = 'subject-toast app-inline-toast';
    toast.textContent = message;
    popupContainer.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, durationMs);
}

/**
 * 웹 + 한국어: 카카오뱅크 후원 블록 표시. 네이티브·다른 언어는 기존 IAP 후원 버튼 유지.
 */
export function syncWebKoDonationUi() {
    const iapWrap = document.querySelector('.settings-donation-container');
    const webKoWrap = document.getElementById('webKoDonationContainer');
    const webKoBtn = document.getElementById('webKoDonationBtn');
    if (!iapWrap || !webKoWrap) return;

    let isNative = false;
    try {
        const Cap = window.Capacitor;
        isNative = typeof Cap?.isNativePlatform === 'function' && Cap.isNativePlatform() === true;
    } catch (_) {
        isNative = false;
    }

    const lang = String(state.user?.language || '').trim();
    const isKorean = lang === 'ko' || lang.toLowerCase().startsWith('ko-');
    const showBank = !isNative && isKorean;

    iapWrap.toggleAttribute('hidden', showBank);
    webKoWrap.toggleAttribute('hidden', !showBank);

    if (showBank && webKoBtn) {
        const titleEl = webKoBtn.querySelector('.web-ko-donation-title');
        const accountEl = webKoBtn.querySelector('.web-ko-donation-account');
        if (titleEl) titleEl.textContent = i18n.t('donation.settings.link');
        if (accountEl) accountEl.textContent = i18n.t('donation.webKo.accountLine');
        const hint = i18n.t('donation.webKo.copyHint');
        webKoBtn.setAttribute(
            'aria-label',
            hint && hint !== 'donation.webKo.copyHint'
                ? `${i18n.t('donation.settings.link')}. ${hint}`
                : i18n.t('donation.settings.link')
        );
    }
}

// --- 렌더링 함수 ---

/** 현재 root font-size(px). 슬라이더와 자동 축소가 rem 기준으로 동작하도록 사용 */
function getRootFontSizePx() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

const REM_STEP = 1 / 16; // 0.0625rem (1px@16px 기준) — 이진 탐색/감소 단위

function roundRem(r) {
    return Math.round(r / REM_STEP) * REM_STEP;
}

/**
 * 메인 요약 "총 용돈" 한 줄 유지 — 넘치면 rem 폰트 축소 (다국어·큰 금액 대비)
 */
function adjustTotalAllowanceFontFit() {
    const el = elements.totalAllowance;
    const container = elements.summaryHeader;
    if (!el || !container) return;
    const text = el.textContent;
    if (!text || !String(text).trim()) return;
    const isMobile = window.innerWidth <= 480;
    const baseRem = 1.875;
    const minRem = isMobile ? 0.6875 : 0.75;
    el.style.whiteSpace = 'nowrap';
    fitElementFontToContainerWidth(el, baseRem, minRem, container);
}

function scheduleTotalAllowanceFontFit() {
    if (typeof requestAnimationFrame === 'undefined') {
        adjustTotalAllowanceFontFit();
        return;
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => adjustTotalAllowanceFontFit());
    });
}

function fitElementFontToContainerWidth(element, baseRem, minRem, containerEl) {
    if (!element || !containerEl) return;
    const avail = containerEl.clientWidth;
    if (avail <= 0) return;
    element.style.fontSize = `${baseRem}rem`;
    void element.offsetWidth;
    if (element.scrollWidth <= avail) return;
    let low = minRem;
    let high = baseRem;
    let bestRem = minRem;
    for (let i = 0; i < 18; i++) {
        const testRem = roundRem((low + high) / 2);
        if (testRem < minRem) {
            bestRem = minRem;
            break;
        }
        element.style.fontSize = `${testRem}rem`;
        void element.offsetWidth;
        if (element.scrollWidth <= avail) {
            bestRem = testRem;
            low = testRem + REM_STEP;
        } else {
            high = testRem - REM_STEP;
        }
        if (low > high) break;
    }
    element.style.fontSize = `${bestRem}rem`;
}

/** 과목명: 가운데 열 너비에 맞게 폰트 축소 (동기; 호출부에서 레이아웃 확정 후 실행) */
function adjustSubjectNameFontSizeSync(element, card) {
    if (!element || !card) return;

    const isMobile = window.innerWidth <= 480;
    const baseFontSizeRem = 1;
    const minFontSizeRem = isMobile ? 0.625 : 0.75;

    element.style.maxWidth = '100%';
    element.style.width = 'auto';
    element.style.fontSize = `${baseFontSizeRem}rem`;
    void element.offsetHeight;
    void element.scrollWidth;

    const nameBlock = card.querySelector('.subject-name-block');
    if (!nameBlock) return;
    const avail = nameBlock.clientWidth;
    if (avail <= 0) return;

    const textWidth = element.getBoundingClientRect().width;

    if (textWidth > avail) {
        let low = minFontSizeRem;
        let high = baseFontSizeRem;
        let bestRem = baseFontSizeRem;
        for (let i = 0; i < 15; i++) {
            const testRem = roundRem((low + high) / 2);
            if (testRem < minFontSizeRem) {
                bestRem = minFontSizeRem;
                break;
            }
            element.style.fontSize = `${testRem}rem`;
            void element.offsetHeight;
            void element.scrollWidth;
            const w = element.getBoundingClientRect().width;
            if (w <= avail) {
                bestRem = testRem;
                low = testRem + REM_STEP;
            } else {
                high = testRem - REM_STEP;
            }
            if (low > high) break;
        }
        element.style.fontSize = `${bestRem}rem`;
    } else {
        element.style.fontSize = `${baseFontSizeRem}rem`;
    }
}

/** 번호·금액·상태·과목명 폰트를 각 열에 맞게 조절 */
function adjustSubjectCardTypography(card) {
    if (!card) return;
    const isMobile = window.innerWidth <= 480;
    const minSideRem = isMobile ? 0.5625 : 0.625;

    const numEl = card.querySelector('.subject-number');
    const infoEl = card.querySelector('.subject-info');
    const amtEl = card.querySelector('.subject-amount');
    const statEl = card.querySelector('.subject-status');
    const nameEl = card.querySelector('.subject-name');

    if (numEl) {
        numEl.style.fontSize = '';
        fitElementFontToContainerWidth(numEl, 1.5625, minSideRem, numEl);
    }
    if (amtEl && infoEl) {
        amtEl.style.fontSize = '';
        fitElementFontToContainerWidth(amtEl, 0.875, minSideRem, infoEl);
    }
    if (statEl && infoEl) {
        statEl.style.fontSize = '';
        fitElementFontToContainerWidth(statEl, 0.75, minSideRem, infoEl);
    }
    if (nameEl) adjustSubjectNameFontSizeSync(nameEl, card);
    const durEl = card.querySelector('.subject-timer-duration');
    const nameBlock = card.querySelector('.subject-name-block');
    if (durEl && nameBlock) {
        durEl.style.fontSize = '';
        fitElementFontToContainerWidth(durEl, 0.75, 0.5, nameBlock);
    }
}

/** 리사이즈·폰트 배율 변경 후 과목 카드 타이포 재계산 */
function reapplySubjectNameFontSizes() {
    if (!elements.subjectsGrid) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            for (const card of elements.subjectsGrid.querySelectorAll('.subject-card')) {
                adjustSubjectCardTypography(card);
            }
        });
    });
}

/**
 * 이름 길이에 따라 폰트 크기를 자동으로 조절 (rem 기준)
 */
function adjustNameFontSize(element, text) {
    if (!element || !text) return;
    const isMobile = window.innerWidth <= 480;
    const baseRem = isMobile ? 1.875 : 2.8125;   // 30px / 45px
    const minRem = isMobile ? 1.125 : 1.75;      // 18px / 28px
    adjustFontSize(element, text, baseRem, minRem);
}

/**
 * 텍스트 길이에 따라 폰트 크기를 자동으로 조절 (rem 기준 — 슬라이더와 충돌 없음)
 * @param {HTMLElement} element - 텍스트를 표시할 요소
 * @param {string} text - 표시할 텍스트
 * @param {number} baseFontSizeRem - 기본 폰트 크기(rem)
 * @param {number} minFontSizeRem - 최소 폰트 크기(rem)
 */
function adjustFontSize(element, text, baseFontSizeRem, minFontSizeRem) {
    if (!element || !text) return;
    const container = element.parentElement;
    if (!container) return;
    
    const rootPx = getRootFontSizePx();
    const isInput = element.tagName === 'INPUT';
    
    const containerStyle = window.getComputedStyle(container);
    let availableWidth = container.clientWidth
        - (parseFloat(containerStyle.paddingLeft) || 0)
        - (parseFloat(containerStyle.paddingRight) || 0);
    if (isInput) {
        const s = window.getComputedStyle(element);
        availableWidth -= (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0)
            + (parseFloat(s.borderLeftWidth) || 0) + (parseFloat(s.borderRightWidth) || 0);
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const computedStyle = window.getComputedStyle(element);
    const fontWeight = computedStyle.fontWeight;
    const fontFamily = computedStyle.fontFamily;
    const measureText = (sizeRem) => {
        const sizePx = sizeRem * rootPx;
        ctx.font = `${fontWeight} ${sizePx}px ${fontFamily}`;
        return ctx.measureText(text).width;
    };
    
    let currentRem = baseFontSizeRem;
    while (measureText(currentRem) > availableWidth && currentRem > minFontSizeRem) {
        currentRem = Math.max(minFontSizeRem, currentRem - REM_STEP);
    }
    
    element.style.fontSize = `${currentRem}rem`;
    if (!isInput) element.textContent = text;
}

/**
 * 과목 설정 입력 필드 폰트 크기 자동 조절 (rem 기준)
 */
export function adjustSettingsInputFontSize(input) {
    if (!input) return;
    const rootPx = getRootFontSizePx();
    const computedStyle = window.getComputedStyle(input);
    const storedBaseRem = input.dataset.baseFontSizeRem != null ? parseFloat(input.dataset.baseFontSizeRem) : null;
    const computedPx = parseFloat(computedStyle.fontSize) || 16;
    const baseFontSizeRem = storedBaseRem ?? (computedPx / rootPx);
    if (storedBaseRem == null) input.dataset.baseFontSizeRem = String(baseFontSizeRem);
    const minFontSizeRem = Math.max(0.625, baseFontSizeRem * 0.7); // 10px@16 기준 이상
    const text = input.value || input.placeholder || ' ';
    adjustFontSize(input, text, baseFontSizeRem, minFontSizeRem);
}

export function scheduleSettingsInputFontSize(input) {
    if (!input) return;
    let debounced = settingsInputDebouncers.get(input);
    if (!debounced) {
        debounced = utils.debounce(() => adjustSettingsInputFontSize(input), 120);
        settingsInputDebouncers.set(input, debounced);
    }
    debounced();
}

/**
 * 이름 편집 모드 활성화
 */
export function enableNameEdit() {
    if (!elements.userNameDisplay) return;
    
    const currentName = state.user.name;
    const maxNameLength = resources.getMaxLength(state.user?.language || 'en-US', 'name', state.user?.country);
    
    // 현재 텍스트를 input으로 변환
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'user-name-edit';
    input.style.cssText = `
        font-size: inherit;
        font-weight: inherit;
        font-family: inherit;
        color: inherit;
        text-shadow: inherit;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid rgba(102, 126, 234, 0.5);
        border-radius: 8px;
        padding: 4px 8px;
        width: 100%;
        max-width: 100%;
        text-align: center;
        outline: none;
        box-sizing: border-box;
    `;
    
    // 실시간 글자수 제한 및 폰트 크기 조정
    let lastValue = currentName;
    input.addEventListener('input', () => {
        const currentLength = input.value.length;
        
        // 언어별 최대 글자 수 제한 (실시간 자동 수정)
        if (currentLength > maxNameLength) {
            input.value = input.value.substring(0, maxNameLength);
        }
        
        // 실시간 폰트 크기 조정
        const newValue = input.value;
        if (newValue !== lastValue) {
            adjustNameFontSize(input, newValue);
            lastValue = newValue;
        }
    });
    
    // Enter 키 또는 blur 시 저장
    const saveName = async () => {
        const newName = input.value.trim();
        const trimmedCurrent = (currentName || '').trim();
        if (newName !== trimmedCurrent) {
            state.user.name = newName;
            const { saveData } = await import('./api.js');
            saveData();
        }
        
        // input을 다시 텍스트로 변환
        const userNameText = getHeaderUserText();
        elements.userNameDisplay.textContent = userNameText;
        elements.userNameDisplay.style.display = '';
        input.remove();
        
        // 폰트 크기 재조정 (레이아웃이 안정화된 후 실행)
        requestAnimationFrame(() => {
            adjustNameFontSize(elements.userNameDisplay, userNameText);
        });
    };
    
    input.addEventListener('blur', saveName);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            // 취소: 원래 이름으로 복원
            const userNameText = getHeaderUserText();
            elements.userNameDisplay.textContent = userNameText;
            elements.userNameDisplay.style.display = '';
            input.remove();
            // 폰트 크기 재조정 (레이아웃이 안정화된 후 실행)
            requestAnimationFrame(() => {
                adjustNameFontSize(elements.userNameDisplay, userNameText);
            });
        }
    });
    
    // 기존 텍스트를 input으로 교체
    const parent = elements.userNameDisplay.parentElement;
    if (parent) {
        elements.userNameDisplay.style.display = 'none';
        parent.insertBefore(input, elements.userNameDisplay);
        input.focus();
        input.select();
        
        // 초기 폰트 크기 조정
        adjustNameFontSize(input, currentName);
    }
}

/**
 * 헤더 렌더링
 */
function getHeaderUserText() {
    const name = state.user.name?.trim();
    if (name) {
        return i18n.t('dashboard.header.user', { name });
    }
    return i18n.t('dashboard.header.userAnonymous');
}

function renderHeader() {
    const userNameText = getHeaderUserText();
    if (elements.userNameDisplay) {
        elements.userNameDisplay.textContent = userNameText;
    }
    adjustNameFontSize(elements.userNameDisplay, userNameText);
    
    const subtitleText = i18n.t('dashboard.header.subtitle');
    elements.appSubtitle.textContent = subtitleText;
    
    // app-subtitle 폰트 크기 조정 (rem 기준)
    const isMobile = window.innerWidth <= 480;
    const subtitleBaseRem = isMobile ? 1.40625 : 1.6875;   // 22.5px / 27px
    const subtitleMinRem = isMobile ? 0.875 : 1.125;       // 14px / 18px
    adjustFontSize(elements.appSubtitle, subtitleText, subtitleBaseRem, subtitleMinRem);
    
    // ... 나머지 코드
}

/**
 * 요약 섹션 렌더링
 * @param {Date} date - 기준 날짜
 */
export function renderSummarySection(date) {
    const { totalAmount, doneCount, targetCount, percentage } = calculateMonthlyStats(date);
    
    // 요약 헤더 - 제목 숨김
    elements.summaryTitle.textContent = '';
    elements.summaryTitle.style.display = 'none';
    
    // 목표 달성률 100% 달성 시 특별 UI 표시
    if (percentage >= 100) {
        // 총 용돈을 황금빛 배너로 표시
        const totalLabel = i18n.t('dashboard.summary.total');
        elements.totalAllowance.textContent = `${totalLabel}: ${utils.formatCurrency(totalAmount)}`;
        elements.totalAllowance.classList.add('goal-achieved-golden');
        
        // "목표 달성" 배지 표시
        elements.goalAchievedText.textContent = i18n.t('dashboard.goal.achieved');
        elements.goalAchievedBadge.style.display = 'block';
        
        // summary-header에 클래스 추가하여 아래 공간 절반으로 줄이기
        if (elements.summaryHeader) {
            elements.summaryHeader.classList.add('goal-achieved-active');
        }
        
        // summary-section에 클래스 추가하여 아래 공간 절반으로 줄이기
        if (elements.summarySection) {
            elements.summarySection.classList.add('goal-achieved-active');
        }
        
        // 게이지바와 달성률 숨기기
        if (elements.progressBarWrapper) {
            elements.progressBarWrapper.style.display = 'none';
        }
        if (elements.progressLabelContainer) {
            elements.progressLabelContainer.style.display = 'none';
        }
    } else {
        // 100% 미만일 때는 일반 UI 표시
        // 황금빛 배너 클래스 제거
        elements.totalAllowance.classList.remove('goal-achieved-golden');
        
        // "목표 달성" 배지 숨기기
        elements.goalAchievedBadge.style.display = 'none';
        
        // summary-header에서 클래스 제거하여 아래 공간 복원
        if (elements.summaryHeader) {
            elements.summaryHeader.classList.remove('goal-achieved-active');
        }
        
        // summary-section에서 클래스 제거하여 아래 공간 복원
        if (elements.summarySection) {
            elements.summarySection.classList.remove('goal-achieved-active');
        }
        
        // 게이지바와 달성률 표시
        if (elements.progressBarWrapper) {
            elements.progressBarWrapper.style.display = 'block';
        }
        if (elements.progressLabelContainer) {
            elements.progressLabelContainer.style.display = 'flex';
        }
        
        // 총합 라벨과 금액 표시
        const totalLabel = i18n.t('dashboard.summary.total');
        elements.totalAllowance.textContent = `${totalLabel}: ${utils.formatCurrency(totalAmount)}`;
        
        // 진행률 바
        const roundedPercent = Math.round(percentage);
        elements.progressBar.style.width = `${percentage}%`;
        elements.progressBar.setAttribute('aria-valuenow', roundedPercent);
        elements.progressBar.setAttribute('aria-valuemax', 100);
        elements.progressBar.setAttribute('aria-valuemin', 0);
        elements.progressBar.setAttribute('role', 'progressbar');
        
        // 진행률 바 색상 설정 (20단계: 하늘색 → 파랑 → 보라 → 와인/버건디 → 빨강)
        elements.progressBar.className = 'progress-bar';
        const step = Math.min(20, Math.max(1, Math.ceil(percentage / 5)));
        elements.progressBar.classList.add('progress-' + (step * 5));
        
        // 통합된 달성률 라벨: "목표 달성률 % (완료 수/총 개수)"
        const progressLabelText = i18n.t('dashboard.progress.label', { percent: roundedPercent });
        elements.progressLabel.textContent = `${progressLabelText} (${doneCount}/${targetCount})`;
    }

    scheduleTotalAllowanceFontFit();
}

/**
 * 날짜 탐색 렌더링
 * @param {Date} date - 표시할 날짜
 */
function renderDateNavigation(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const displayDate = new Date(date);
    displayDate.setHours(0, 0, 0, 0);
    
    // 오늘인지 확인
    if (displayDate.getTime() === today.getTime()) {
        elements.currentDate.textContent = i18n.t('dashboard.date.today');
    } else {
        // 날짜 포맷팅 (현재 언어에 맞게)
        const year = displayDate.getFullYear();
        const month = displayDate.getMonth() + 1;
        const day = displayDate.getDate();
        const currentLang = i18n.getLocale();
        
        // 언어별 날짜 포맷
        let dateText;
        if (currentLang === 'ko') {
            dateText = `${year}년 ${month}월 ${day}일`;
        } else if (currentLang === 'ja') {
            dateText = `${year}年${month}月${day}日`;
        } else if (currentLang.startsWith('zh')) {
            dateText = `${year}年${month}月${day}日`;
        } else {
            // 영어 및 기타 언어: "January 15, 2025" 형식
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                              'July', 'August', 'September', 'October', 'November', 'December'];
            dateText = `${monthNames[month - 1]} ${day}, ${year}`;
        }
        elements.currentDate.textContent = dateText;
    }
    
    // 이전/다음 버튼 화살표로 설정 (CSS로 화살표 그리기)
    const prevBtn = document.getElementById('prevDate');
    const nextBtn = document.getElementById('nextDate');
    if (prevBtn) {
        prevBtn.setAttribute('aria-label', i18n.t('action.prev'));
        prevBtn.textContent = '';
        prevBtn.classList.add('arrow-left');
    }
    if (nextBtn) {
        nextBtn.setAttribute('aria-label', i18n.t('action.next'));
        nextBtn.textContent = '';
        nextBtn.classList.add('arrow-right');
    }
}

/**
 * 과목 그리드 렌더링
 * @param {Date} date - 기준 날짜
 */
export function renderSubjectsGrid(date) {
    const dateKey = utils.formatDate(date);
    const todayRecords = state.records[dateKey] || {};
    
    // 기록/보너스가 있는 달은 ledger 스냅샷, 이번 달·미래·빈 달은 현재 설정 기준 (날짜별로 과목 수 고정)
    const displaySubjects = getSubjectsForDateDisplay(date);
    
    const htmlString = displaySubjects.map((subject, index) => {
        const subjectIdNum = Number(subject.id);
        const recordValueNum = todayRecords[subjectIdNum];
        const recordValueStr = todayRecords[String(subject.id)];
        const recordValue = recordValueNum !== undefined ? recordValueNum : recordValueStr;
        const isCompleted = !!recordValue;
        const numberSymbol = index + 1;
        const timerEnabled = !!subject.timerEnabled;
        const timerMinutes = subject.timerMinutes != null ? subject.timerMinutes : 25;
        const minutesLabel = i18n.t('timer.minutes');
        
        const focusModeLabel = subject.name + ' ' + i18n.t('timer.focusMode');
        return `
            <div class="subject-card ${isCompleted ? 'completed' : 'pending'}" data-subject-id="${subject.id}">
                <div class="subject-card-row">
                    <div class="subject-number">${numberSymbol}</div>
                    <div class="subject-name-block">
                        <div class="subject-name">
                            ${subject.name}
                        </div>
                        ${timerEnabled ? `<div class="subject-timer-duration">🕐 ${timerMinutes}${minutesLabel}</div>` : ''}
                    </div>
                    <div class="subject-info">
                        <div class="subject-amount">${utils.formatCurrency(subject.amount)}</div>
                        <div class="subject-status">${isCompleted ? i18n.t('dashboard.subject.done') : i18n.t('dashboard.subject.pending')}</div>
                    </div>
                </div>
                <div class="timer-focus-label" data-subject-id="${subject.id}" style="display: none;">${focusModeLabel}</div>
                <div class="timer-countdown" data-subject-id="${subject.id}" style="display: none;"></div>
                <div class="timer-tap-complete" data-subject-id="${subject.id}" style="display: none;">${i18n.t('timer.tapToComplete')}</div>
            </div>
        `;
    }).join('');
    
    // 한 번에 DOM 업데이트
    elements.subjectsGrid.innerHTML = htmlString;
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            for (const card of elements.subjectsGrid.querySelectorAll('.subject-card')) {
                adjustSubjectCardTypography(card);
            }
        });
    });
}

/**
 * 추가 용돈 섹션 렌더링
 * @param {Date} date - 기준 날짜
 */
/** 추가 용돈 금액: 모바일 숫자 자판에는 −가 없는 경우가 많아 +/− 버튼으로 부호 전환 */
let additionalAmountSignButtonWired = false;

export function syncAdditionalAmountSignButton(_input, btn) {
    if (!btn) return;
    btn.textContent = btn.classList.contains('is-negative') ? '−' : '+';
}

export function resetAdditionalAmountSignButton() {
    const btn = document.getElementById('additionalAmountSignBtn');
    const input = document.getElementById('additionalAmount');
    if (!btn) return;
    btn.classList.remove('is-negative');
    btn.textContent = '+';
    if (input && input.value.startsWith('-')) {
        input.value = utils.normalizeUnsignedNumericInput(input.value, true);
    }
}

function setupAdditionalAmountSignButton(input) {
    const btn = document.getElementById('additionalAmountSignBtn');
    if (!btn || !input) return;
    btn.setAttribute('aria-label', i18n.t('dashboard.bonus.toggleSign'));
    syncAdditionalAmountSignButton(input, btn);
    if (additionalAmountSignButtonWired) return;
    additionalAmountSignButtonWired = true;

    btn.addEventListener('click', () => {
        btn.classList.toggle('is-negative');
        const el = document.getElementById('additionalAmount');
        if (!el) return;
        const abs = el.value.trim().replace(/^-+/g, '');
        el.value = abs ? utils.normalizeUnsignedNumericInput(abs, true) : '';
        syncAdditionalAmountSignButton(el, btn);
        el.focus();
    });
}

function renderBonusSection(date) {
    const dateKey = utils.formatDate(date);
    const monthKey = utils.formatMonth(date);
    
    elements.bonusTitle.textContent = i18n.t('dashboard.bonus.title');
    elements.additionalReason.placeholder = i18n.t('dashboard.bonus.reason');
    elements.additionalAmount.placeholder = i18n.t('dashboard.bonus.amount');
    elements.addAdditionalBtn.textContent = i18n.t('action.add');

    const amountEl = elements.additionalAmount || document.getElementById('additionalAmount');
    if (amountEl) {
        amountEl.type = 'text';
        amountEl.inputMode = 'decimal';
        amountEl.autocomplete = 'off';
        amountEl.enterKeyHint = 'done';
        amountEl.removeAttribute('min');
        amountEl.removeAttribute('max');
        amountEl.removeAttribute('step');
        setupAdditionalAmountSignButton(amountEl);
        const applySymbol = () => addCurrencySymbolToInput(amountEl);
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => requestAnimationFrame(applySymbol));
        } else {
            applySymbol();
        }
    }
    
    // 언어별 최대 글자 수 설정 (추가 용돈 사유)
    const maxReasonLength = resources.getMaxLength(state.user?.language || 'en-US', 'reason', state.user?.country);
    elements.additionalReason.maxLength = maxReasonLength;
    
    // 해당 날짜의 추가 용돈 목록 표시 (목표 달성 보너스는 별도 필드로 관리되므로 필터링 불필요)
    const bonusItems = state.ledger.month[monthKey]?.bonus[dateKey] || [];
    elements.additionalList.innerHTML = bonusItems.slice(0, 10).map(item => `
        <div class="bonus-item">
            <span class="bonus-reason">${item.reason}</span>
            <span class="bonus-amount">${utils.formatCurrency(item.amount)}</span>
            <button class="remove-bonus" data-id="${item.id}">×</button>
        </div>
    `).join('');
}

/**
 * 메인 뷰 렌더링
 * @param {Date} date - 표시할 날짜
 */
export function renderMainView(date = state.currentDate) {
    renderHeader();
    renderSummarySection(date);
    renderDateNavigation(date);
    renderSubjectsGrid(date);
    renderBonusSection(date);
    
    // 프리미엄 잠금 기능: 현재 보고 있는 날짜 기준으로 버튼/오버레이 표시
    const viewedDateKey = utils.formatDate(date);
    // 잠금 기능은 "PIN(비밀번호)이 설정된 경우에만" 동작하도록 제한
    const hasLockPassword = state.isPurchasedLock && !!state.lockPasswordHash;
    const isDateLocked = hasLockPassword && state.lockedDates && state.lockedDates.includes(viewedDateKey);

    const lockBtn = elements.lockToggleBtn || document.getElementById('lockToggleBtn');
    const mainView = document.getElementById('mainView');

    if (lockBtn) {
        // 잠금 기능을 구매했고, PIN(비밀번호)이 설정된 경우에만 잠금 버튼 노출
        if (!state.isPurchasedLock || !state.lockPasswordHash) {
            lockBtn.style.display = 'none';
        } else {
            lockBtn.style.display = '';
            lockBtn.textContent = isDateLocked
                ? i18n.t('premium.lock.toggleButton.lockedToday')
                : i18n.t('premium.lock.toggleButton.lock');
        }
    }

    // 현재 보고 있는 날짜가 잠긴 경우 과목·추가 용돈 영역 잠김 시각 피드백
    if (mainView) {
        mainView.classList.toggle('is-locked', !!isDateLocked);
    }
    
    // 메인 뷰에서는 날짜 네비게이션 표시
    const dateNav = document.getElementById('navDate');
    if (dateNav) {
        dateNav.style.display = '';
    }
    
    // 모든 렌더링 완료 후 이름 폰트 크기 재조정 (과목 완료 클릭 시 폰트 크기가 초기화되는 버그 수정)
    requestAnimationFrame(() => {
        if (elements.userNameDisplay) {
            const userNameText = getHeaderUserText();
            elements.userNameDisplay.textContent = userNameText;
            adjustNameFontSize(elements.userNameDisplay, userNameText);
        }
    });
    syncWebKoDonationUi();
}

/**
 * 달력 뷰 렌더링
 * @param {Date} date - 표시할 날짜
 */
export function renderCalendarView(date = state.calendarDate) {
    // 헤더와 요약 섹션은 메인 대시보드와 동일하게 재사용
    renderHeader();
    renderSummarySection(date);
    
    // 달력 뷰에서는 날짜 네비게이션 숨기기
    const dateNav = document.getElementById('navDate');
    if (dateNav) {
        dateNav.style.display = 'none';
    }
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const currentLang = i18n.getLocale();
    
    // 월 네비게이션 - 각 문화권에 맞는 형식 사용
    let monthName;
    
    // 각 언어별 월 이름 배열
    const monthNamesByLang = {
        'en-US': ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'],
        'en-GB': ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'],
        'fr': ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 
               'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
        'it': ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
               'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
        'es': ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
        'de': ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
               'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
        'pt': ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
        'ru': ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 
               'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
        'hi': ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 
               'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
        'ar': ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
               'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    };
    
    // 월 이름을 사용하는 언어
    if (monthNamesByLang[currentLang]) {
        monthName = `${monthNamesByLang[currentLang][month]} ${year}`;
    } else {
        // 한국어, 일본어, 중국어, 베트남어 및 기타 모든 언어: 번역 키 사용 (숫자 형식)
        monthName = i18n.t('calendar.header.monthLabel', { year, month: month + 1 });
    }
    
    document.getElementById('calendarMonth').textContent = monthName;
    
    // 요일 헤더 생성
    const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekdaysHtml = weekdays.map(day => 
        `<div class="weekday">${i18n.t(`calendar.weekdays.${day}`)}</div>`
    ).join('');
    document.querySelector('.calendar-weekdays').innerHTML = weekdaysHtml;
    
    // 달력 그리드 생성
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    let gridHtml = '';
    
    // 첫 날 이전의 빈 셀
    for (let i = 0; i < firstDay; i++) {
        gridHtml += '<div class="calendar-day empty"></div>';
    }
    
    // 오늘 날짜 문자열 (루프 밖에서 한 번만 생성)
    const todayStr = new Date().toDateString();

    // 날짜 셀 생성
    for (let day = 1; day <= lastDate; day++) {
        const cellDate = new Date(year, month, day);
        const dateKey = utils.formatDate(cellDate);
        const dayRecords = state.records[dateKey] || {};
        const monthKey = utils.formatMonth(cellDate);
        const bonusItems = state.ledger.month[monthKey]?.bonus[dateKey] || [];
        
        const subjectsToRender = getSubjectsForDateDisplay(cellDate);
        const totalSubjectCount = subjectsToRender.length;
        const subjectIdSet = new Set(subjectsToRender.map(s => Number(s.id)));
        
        // 완료된 과목 개수 계산 (해당 달의 실제 과목 ID 기준)
        const completedCount = Object.keys(dayRecords)
            .filter(subjectId => {
                const id = parseInt(subjectId, 10);
                return !isNaN(id) && dayRecords[subjectId] && subjectIdSet.has(id);
            }).length;
        
        // 진행률 계산 (0-100%)
        const progressPercentage = totalSubjectCount > 0 ? (completedCount / totalSubjectCount) * 100 : 0;
        const isStudyLockedDay =
            state.isPurchasedLock &&
            !!state.lockPasswordHash &&
            state.lockedDates &&
            state.lockedDates.includes(dateKey);

        // 하단 색상 바 HTML 생성
        let progressBar = '';
        if (totalSubjectCount > 0) {
            progressBar = `
                <div class="calendar-progress-bar">
                    <div class="calendar-progress-fill" style="width: ${progressPercentage}%"></div>
                </div>
            `;
        }
        
        const isToday = cellDate.toDateString() === todayStr;
        
        // 접근성 속성 추가
        const totalCompletedCount = Object.keys(dayRecords).filter(subjectId => dayRecords[subjectId]).length;
        // 추가 용돈 개수 계산 (목표 달성 보너스는 별도 필드로 관리되므로 필터링 불필요)
        const userBonusCount = bonusItems.length;
        const ariaLabel = `${day}일, 완료된 과목 ${totalCompletedCount}개${userBonusCount > 0 ? `, 추가 용돈 ${userBonusCount}건` : ''}`;
        
        // 게이지 바 오른쪽 윗 부분에 빨간 점 표시
        const bonusIndicator = bonusItems.length > 0
            ? '<div class="bonus-indicator" aria-hidden="true"></div>'
            : '';
        
        // 클래스 조합: today, date-locked(공부 확정/잠금 날짜)
        const dayClasses = [
            isToday ? 'today' : '',
            isStudyLockedDay ? 'date-locked' : ''
        ].filter(Boolean).join(' ');
        
        gridHtml += `
            <div class="calendar-day ${dayClasses}" 
                 data-date-key="${dateKey}" 
                 role="button"
                 aria-label="${ariaLabel}"
                 tabindex="0">
                <div class="day-number">${day}</div>
                ${bonusIndicator}
                <div class="day-content">
                </div>
                ${progressBar}
            </div>
        `;
    }
    
    document.querySelector('.calendar-grid').innerHTML = gridHtml;
    
    // 달력 안내 텍스트 추가 (달력 그리드 컨테이너 밖)
    const calendarView = document.getElementById('calendarView');
    let guideElement = document.getElementById('calendarGuide');
    if (!guideElement) {
        guideElement = document.createElement('div');
        guideElement.id = 'calendarGuide';
        guideElement.className = 'calendar-guide';
        calendarView.appendChild(guideElement);
    }
    // 텍스트에서 특정 단어를 스타일링하기 위해 처리 (다국어 지원)
    const item2 = i18n.t('calendar.guide.item2');
    const item3 = i18n.t('calendar.guide.item3');
    const item4 = i18n.t('calendar.guide.item4');
    
    // 현재 언어의 스타일링 단어 가져오기
    const currentLocale = i18n.getLocale();
    const langData = languages[currentLocale] || languages['en-US'];
    const styledWords = langData['calendar.guide.styledWords'] || {
        progressBar: '',
        blue: '',
        red: ''
    };
    
    // progressBar 단어 스타일링
    let item2Styled = item2;
    if (styledWords.progressBar) {
        const progressBarRegex = new RegExp(styledWords.progressBar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        item2Styled = item2Styled.replace(progressBarRegex, `<span class="calendar-guide-progress-text">$&</span>`);
    }
    
    // blue 단어 스타일링
    let item3Styled = item3;
    if (styledWords.blue) {
        const blueRegex = new RegExp(styledWords.blue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        item3Styled = item3Styled.replace(blueRegex, `<span class="calendar-guide-blue-text">$&</span>`);
    }
    
    // red 단어 스타일링
    let item4Styled = item4;
    if (styledWords.red) {
        const redRegex = new RegExp(styledWords.red.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        item4Styled = item4Styled.replace(redRegex, `<span class="calendar-guide-red-text">$&</span>`);
    }
    
    const guideItem5 =
        state.isPurchasedLock
            ? `<div class="calendar-guide-item">${i18n.t('calendar.guide.item5')}</div>`
            : '';

    guideElement.innerHTML = `
        <div class="calendar-guide-content">
            <div class="calendar-guide-item">${i18n.t('calendar.guide.item1')}</div>
            <div class="calendar-guide-item">${item2Styled}</div>
            <div class="calendar-guide-item">${item3Styled}</div>
            <div class="calendar-guide-item">${item4Styled}</div>
            ${guideItem5}
        </div>
    `;
    
}

/**
 * 설정 모달 렌더링
 */
export function renderSettings() {
    // 모달 헤더
    document.getElementById('settingsTitle').textContent = i18n.t('settings.header.title');
    const closeBtn = document.getElementById('closeSettings');
    if (closeBtn) {
        closeBtn.setAttribute('aria-label', i18n.t('action.close'));
        closeBtn.textContent = '✕';
    }
    
    // 과목 설정 섹션 ("📚 과목 설정  ?" — ? 클릭 시 팝업)
    const subjectsTitleEl = document.getElementById('settingsSubjectsTitle');
    subjectsTitleEl.textContent = i18n.t('settings.subjects.title');
    const subjectsInfoEl = document.getElementById('subjectsInfoBtn');
    if (subjectsInfoEl) subjectsInfoEl.textContent = i18n.t('settings.infoLink');
    document.getElementById('addSubjectBtn').textContent = i18n.t('settings.subjects.add');
    
    // 과목 목록 렌더링
    renderSubjectsList();
    
    // 이달의 목표 섹션 ("🎯 이달의 목표  ?" — ? 클릭 시 팝업)
    const goalTitleEl = document.getElementById('goalTitle');
    goalTitleEl.textContent = i18n.t('settings.goal.title');
    const goalInfoEl = document.getElementById('goalInfoBtn');
    if (goalInfoEl) goalInfoEl.textContent = i18n.t('settings.infoLink');
    document.getElementById('goalDaysLabel').textContent = i18n.t('settings.goal.days');
    // 보너스 금액 레이블에 통화 단위 추가
    const bonusLabel = i18n.t('settings.goal.bonus');
    const currencySymbol = state.settings.currency.symbol || '₩';
    document.getElementById('goalBonusLabel').textContent = `${bonusLabel} (${currencySymbol})`;

    // 현재 설정값 적용 (tempSettings가 있으면 그것을 사용)
    const currentSettings = state.tempSettings || state.settings;
    // 오늘 날짜 기준으로 이번 달의 목표 일수 계산
    const displayDate = new Date(); // 오늘 날짜 사용
    const daysInMonth = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0).getDate();
    // 달력 연계형: 현재 달의 목표 일수 = 총 일수 - restConstant
    // 최소 목표일(15일)은 항상 보장되어야 함
    const restConstantToUse = currentSettings.restConstant ?? state.settings.restConstant;
    const calculatedGoalDays = Math.max(15, daysInMonth - (restConstantToUse || 0));
    
    const targetDaysInput = document.getElementById('targetDaysInput');
    targetDaysInput.value = calculatedGoalDays;
    targetDaysInput.min = 15;
    targetDaysInput.max = daysInMonth;
    targetDaysInput.setAttribute('aria-label', i18n.t('settings.goal.days'));
    
    const bonusAmountInput = document.getElementById('bonusAmountInput');
        // 보너스 금액이 없으면 국가별 기본값 사용
        if (!currentSettings.goalBonus || currentSettings.goalBonus === 0) {
            const langCode = state.user?.language || 'en-US';
            const countryCode = state.user?.country || resources.localeToCountry[langCode] || 'KR';
            const countryData = resources.countries[countryCode];
            bonusAmountInput.value = countryData?.defaultBonus || 10000;
        } else {
            bonusAmountInput.value = currentSettings.goalBonus;
        }
    bonusAmountInput.min = 0;
    bonusAmountInput.max = state.settings.currency?.maxAmount || 10000000;
    const currencyDecimal = state.settings.currency?.decimal ?? 0;
    bonusAmountInput.step = currencyDecimal > 0 ? Math.pow(0.1, currencyDecimal) : 1;
    bonusAmountInput.setAttribute('aria-label', i18n.t('settings.goal.bonus'));
    // 보너스 금액은 레이블에 (₩) 표시되므로 입력 필드 옆 기호 제거
    const bonusSymbol = bonusAmountInput.parentElement?.querySelector('.currency-symbol');
    if (bonusSymbol) bonusSymbol.remove();
    
    // 데이터 관리 섹션
    document.getElementById('dataTitle').textContent = i18n.t('settings.data.title');
    document.getElementById('exportDataBtn').textContent = i18n.t('settings.data.export');
    document.getElementById('importDataBtn').textContent = i18n.t('settings.data.import');
    document.getElementById('resetDataBtn').textContent = i18n.t('settings.data.reset');
    
    // 저장 버튼
    document.getElementById('saveSettingsBtn').textContent = i18n.t('settings.save.button');
    
    // 글자 크기 (단계형 슬라이더) — 번역 없으면 fallback
    const fontSizeTitle = document.getElementById('fontSizeTitle');
    if (fontSizeTitle) {
        const titleT = i18n.t('settings.fontSize.title');
        fontSizeTitle.textContent = (titleT && titleT !== 'settings.fontSize.title') ? titleT : i18n.t('settings.fontSize.title');
    }
    const currentScale = state.settings.fontSizeScale ?? 3;
    document.querySelectorAll('.font-size-dot').forEach(btn => {
        const level = Number(btn.dataset.level);
        const selected = level === currentScale;
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        btn.classList.toggle('selected', selected);
    });
    document.querySelectorAll('.font-size-num').forEach(btn => {
        const level = Number(btn.dataset.level);
        btn.classList.toggle('selected', level === currentScale);
    });
    
    // 구글플레이 스토어 평점 버튼
    const rateAppBtn = document.getElementById('rateAppBtn');
    if (rateAppBtn) {
        rateAppBtn.textContent = i18n.t('settings.rate.button');
    }
    
    // 잠금 기능 설정 섹션 (프리미엄)
    const lockTitleEl = document.getElementById('lockSectionTitle');
    const lockDescEl = document.getElementById('lockSectionDescription');
    const lockBtn = document.getElementById('lockFeatureBtn');
    if (lockTitleEl) {
        lockTitleEl.textContent = i18n.t('premium.lock.sectionTitle');
    }
    if (lockDescEl) {
        lockDescEl.textContent = i18n.t('premium.lock.sectionDescription');
    }
    if (lockBtn) {
        if (!state.lockPasswordHash) {
            lockBtn.textContent = i18n.t('premium.lock.button.setPassword');
        } else {
            lockBtn.textContent = i18n.t('premium.lock.button.changePassword');
        }
    }

    const donateDeveloperBtn = document.getElementById('donateDeveloperBtn');
    if (donateDeveloperBtn) {
        donateDeveloperBtn.textContent = i18n.t('donation.settings.link');
    }

    syncWebKoDonationUi();
    
}


/**
 * 과목 목록 렌더링
 */
function renderSubjectsList() {
    const container = document.getElementById('subjectsSettingsList');
    
    // tempSettings가 있으면 그것을 사용, 없으면 state.subjects 사용
    const subjectsToRender = state.tempSettings?.subjects || state.subjects;
    
    container.innerHTML = subjectsToRender.map((subject, index) => {
        const timerEnabled = subject.timerEnabled || false;
        const timerMinutes = subject.timerMinutes || 25;
        return `
        <div class="subject-setting-item">
            <div class="subject-main-row">
                <span class="subject-number">${index + 1}</span>
                <input type="text" 
                       id="subject-name-${subject.id}"
                       value="${subject.name}" 
                       placeholder="${i18n.t('settings.subjects.name')}" 
                       data-id="${subject.id}" 
                       class="subject-name-input"
                       maxlength="${resources.getMaxLength(state.user?.language || 'en-US', 'subject', state.user?.country)}"
                       aria-label="${i18n.t('settings.subjects.name')}">
                <input type="number" 
                       id="subject-amount-${subject.id}"
                       value="${subject.amount}" 
                       min="${state.settings.currency?.decimal > 0 ? Math.pow(0.1, state.settings.currency.decimal) : 1}" 
                       max="${state.settings.currency?.maxSubjectAmount || 1000000}" 
                       step="${state.settings.currency.decimal > 0 ? Math.pow(0.1, state.settings.currency.decimal) : 1}"
                       data-id="${subject.id}" 
                       class="subject-amount-input"
                       aria-label="${i18n.t('settings.subjects.amount')}">
                ${subjectsToRender.length > 1 ? 
                    `<button class="remove-btn" data-id="${subject.id}" aria-label="${i18n.t('settings.subjects.delete')}" title="${i18n.t('settings.subjects.delete')}">×</button>` : 
                    ''
                }
            </div>
            <div class="subject-timer-row">
                <div class="timer-toggle-btn ${timerEnabled ? 'active' : ''}" 
                     data-id="${subject.id}">
                    <div class="timer-toggle-left">
                        <span class="timer-icon">⏱️</span>
                        <span class="timer-label">${i18n.t('timer.targetMinutes')}</span>
                    </div>
                    <div class="timer-controls-inline ${timerEnabled ? 'visible' : ''}" data-id="${subject.id}">
                        <button type="button" class="timer-decrease-btn-inline" data-id="${subject.id}" aria-label="Decrease" ${timerEnabled ? '' : 'disabled'}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <span class="timer-display-inline" data-id="${subject.id}">${timerMinutes}${i18n.t('timer.minutes')}</span>
                        <button type="button" class="timer-increase-btn-inline" data-id="${subject.id}" aria-label="Increase" ${timerEnabled ? '' : 'disabled'}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="timer-auto-save-message" data-id="${subject.id}" style="${timerEnabled ? '' : 'display: none;'}">
                    ${i18n.t('timer.autoSave')}
                </div>
            </div>
        </div>
    `;
    }).join('');
    
    // 통화 기호 추가 + 폰트 크기 자동 조절
    for (const input of container.querySelectorAll('.subject-name-input, .subject-amount-input')) {
        if (input.classList.contains('subject-amount-input')) addCurrencySymbolToInput(input);
        adjustSettingsInputFontSize(input);
    }
}

/**
 * 전체 렌더링
 * @param {string} activeView - 활성 뷰 ('main')
 */
export function render(activeView) {
    if (activeView === 'main') {
        renderMainView();
    }
}

// 과목 토글 이벤트 핸들러 (eventHandlers.js에서 사용)
export function toggleSubject(subjectId, date) {
    try {
        const numericSubjectId = Number(subjectId);
        if (isNaN(numericSubjectId)) return;
        
        const newCompletedState = toggleSubjectCompletion(numericSubjectId, date);
        
        // 토스트 메시지 표시
        showSubjectToast(newCompletedState);
        
        // 화면 재렌더링
        renderMainView(date);
    } catch (error) {
        utils.logDevWarning('과목 토글 UI 처리 실패', error);
        throw error;
    }
}

// 추가 용돈 추가 이벤트 핸들러
export async function addBonus(reason, amount, date) {
    // 일일 5개 제한 초과 시 알림 (state.addBonus가 false 반환)
    const dateKey = utils.formatDate(date);
    const monthKey = utils.formatMonth(date);
    const existing = state.ledger.month[monthKey]?.bonus?.[dateKey];
    if (existing && existing.length >= 5) {
        const { showAlertModal } = await import('./eventHandlers.js');
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('dashboard.bonus.errorDailyCap'));
        return false;
    }
    
    return stateAddBonus(reason, amount, date);
}

/**
 * 기기 성능을 감지하여 최적화된 설정을 반환
 * @returns {object} { isMobile: boolean, particleCount: number }
 */
function detectDevicePerformance() {
    // 모바일 기기 감지 (터치 지원 + 작은 화면 또는 모바일 User Agent)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isMobile = isTouchDevice && (isSmallScreen || isMobileUA);
    
    if (isMobile) {
        return {
            isMobile: true,
            particleCount: 20 + Math.floor(Math.random() * 6) // 20~25개
        };
    }
    return {
        isMobile: false,
        particleCount: 40 + Math.floor(Math.random() * 11) // 40~50개
    };
}

/**
 * 목표 달성 배너 클릭 시 폭죽 효과 (이스터 에그)
 * 화면 하단 1/5 지점에서 위로 올라가는 효과 (각도: 위쪽 기준 ±5도 랜덤)
 * 모바일과 데스크톱에서 일관된 성능을 위해 기기 성능에 맞게 최적화됨
 */
export function createFireworkEffect() {
    const container = document.body;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 기기 성능 감지 및 최적화 설정
    const perf = detectDevicePerformance();
    
    // 화면 하단 1/5 지점 (화면 높이의 80% 위치)
    const startY = viewportHeight * 0.8;
    
    // 폭죽 입자 개수 (기기 성능에 따라 조정)
    const particleCount = perf.particleCount;
    const colors = ['#FFD700', '#FFED4E', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FF69B4', '#FFD700', '#FFEB3B', '#FFC107'];
    
    // 위쪽 기준 각도 (90도 = Math.PI / 2)
    const baseAngle = Math.PI / 2; // 90도 (정확히 위쪽)
    const angleRange = (5 * Math.PI) / 180; // ±5도 범위
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'firework-particle';
        
        // 모바일 최적화 클래스 추가
        if (perf.isMobile) {
            particle.classList.add('firework-particle-mobile');
        }
        
        // 랜덤 색상
        const color = colors[Math.floor(Math.random() * colors.length)];
        particle.style.backgroundColor = color;
        particle.style.color = color;
        
        // 시작 위치 설정 (하단 가로 20~80% 지점에서 랜덤하게)
        const startX = viewportWidth * (0.2 + Math.random() * 0.6); // 20~80% 범위
        particle.style.left = `${startX}px`;
        particle.style.top = `${startY}px`;
        
        // 랜덤 각도 (위쪽 기준 ±5도 범위)
        const spreadAngle = baseAngle + (Math.random() - 0.5) * 2 * angleRange;
        
        // 이동 거리 (화면 높이의 60~80% 정도)
        const distance = viewportHeight * (0.6 + Math.random() * 0.2);
        const translateX = Math.cos(spreadAngle) * distance;
        const translateY = -Math.sin(spreadAngle) * distance;
        
        // 애니메이션 시간 (0.8~1.2초)
        const duration = 0.8 + Math.random() * 0.4;
        
        particle.style.setProperty('--translate-x', `${translateX}px`);
        particle.style.setProperty('--translate-y', `${translateY}px`);
        particle.style.setProperty('--duration', `${duration}s`);
        
        container.appendChild(particle);
        particle.classList.add('launch');
        
        // 애니메이션 완료 후 제거
        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, duration * 1000);
    }
}

/** 모바일: resize/orientation/visualViewport 변경 시 추가 용돈 통화 기호 재적용 */
let currencySymbolResizeTimer = null;
function reapplyAdditionalAmountCurrencySymbol() {
    const el = document.getElementById('additionalAmount');
    if (el && state.settings?.currency) {
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => addCurrencySymbolToInput(el));
        } else {
            addCurrencySymbolToInput(el);
        }
    }
}

let currencySymbolResizeHandlerSetup = false;
export function setupCurrencySymbolResizeHandler() {
    if (typeof window === 'undefined' || currencySymbolResizeHandlerSetup) return;
    currencySymbolResizeHandlerSetup = true;
    const debounced = () => {
        if (currencySymbolResizeTimer) clearTimeout(currencySymbolResizeTimer);
        currencySymbolResizeTimer = setTimeout(() => {
            reapplyAdditionalAmountCurrencySymbol();
            reapplySubjectNameFontSizes();
            adjustTotalAllowanceFontFit();
        }, 150);
    };
    window.addEventListener('resize', debounced);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', debounced);
    }
}