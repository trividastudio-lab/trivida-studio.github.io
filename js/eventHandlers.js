import { state, MIN_GOAL_DAYS, DEFAULT_MAX_SUBJECTS, EXPANDED_MAX_SUBJECTS, inferSubjectsFromMonthRecords } from './state.js';
import { saveData, exportDataToFile, importDataFromFile, pickDataBackupFileAndroid } from './api.js';
import * as utils from './utils.js';
import { renderMainView, renderCalendarView, renderSettings, toggleSubject, enableNameEdit, scheduleSettingsInputFontSize, applyFontSizeScale, showToastMessage, resetAdditionalAmountSignButton, syncAdditionalAmountSignButton } from './ui.js';
import { i18n, resources } from './languages.js';
import { DONATION_PRODUCTS } from './iap-products.js';
import { DEV_MODE } from './build-flags.js';
import { isTimerActive, prepareStudyTimerOsPermissions } from './timer.js';
import { markDonationAutoPromptShown } from './donation.js';

// 기본값 상수 (state.js와 일치)
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_COUNTRY = 'KR';
const APP_PACKAGE_ID = 'com.yoonpapa3.studyapp';
const STORAGE_KEY = 'studyAllowanceAppData';
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE_ID}`;

/** 인앱 리뷰 플러그인: Bridge 주입 객체와 registerPlugin 폴백 (LocalNotifications와 동일 패턴). */
function getInAppReviewPlugin() {
    const injected = window.Capacitor?.Plugins?.InAppReview;
    if (injected && typeof injected.requestReview === 'function') {
        return injected;
    }
    try {
        const reg = window.Capacitor?.registerPlugin;
        if (typeof reg === 'function') {
            const p = reg.call(window.Capacitor, 'InAppReview');
            if (p && typeof p.requestReview === 'function') {
                return p;
            }
        }
    } catch (_) {}
    return null;
}

/** Play 스토어 앱 상세 열기 (Android WebView에서 window.open이 막히는 경우가 많아 @capacitor/browser 사용). */
async function openPlayStoreAppListing() {
    const url = PLAY_STORE_URL;
    try {
        const Capacitor = window.Capacitor;
        const isNative = typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform() === true;
        const Browser = Capacitor?.Plugins?.Browser;
        if (isNative && Browser && typeof Browser.open === 'function') {
            await Browser.open({ url });
            return;
        }
    } catch (e) {
        utils.logDevWarning('Play Store Browser.open 실패', e);
    }
    try {
        const w = window.open(url, '_blank', 'noopener,noreferrer');
        if (!w || w.closed) {
            window.location.href = url;
        }
    } catch (_) {
        try {
            window.location.href = url;
        } catch (e2) {
            utils.logDevWarning('Play Store 열기 실패', e2);
        }
    }
}
/** 비밀번호 연속 오류 시 잠금 (localStorage) */
const LS_LOCK_PIN_LOCKOUT_UNTIL = 'lock_pin_lockout_until';
const LS_LOCK_PIN_FAIL_STREAK = 'lock_pin_fail_streak';
const LOCK_PIN_LOCKOUT_MS = 3 * 60 * 60 * 1000;
const LOCK_PIN_MAX_FAILURES = 3;
// 잠금 비밀번호 설정/변경 플로우 중복 실행 방지용 플래그
let isLockPasswordFlowInProgress = false;

// 현재 활성화된 뷰를 추적하는 변수
let activeView = 'main';

/** 확인 모달이 backButton으로 닫힐 때 호출할 핸들러 (타이머 '계속 공부하기' 등) */
let pendingConfirmBackHandler = null;

/** 메인/달력 가로 스와이프(이전·다음 날·월) — touchstart 좌표 */
let mainCalendarSwipeTouchStart = null;

function isSwipeBlockedByModal() {
    const ids = [
        'settingsModal',
        'confirmModal',
        'alertModal',
        'exitModal',
        'saveConfirmModal',
        'pinModal',
        'settingsInfoPopup',
    ];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (window.getComputedStyle(el).display !== 'none') {
            return true;
        }
    }
    return false;
}

function getMainAppScrollContent() {
    return document.querySelector('#appContainer .scroll-content');
}

/**
 * 설정 모달 뒤 배경 스크롤 잠금.
 * 예전에는 body에 position:fixed를 썼는데, 실제 스크롤은 .scroll-content에 있어 복원이 어긋지고
 * 일부 WebView에서 제스처가 통째로 막히는 경우가 있음 → 메인 스크롤 영역만 잠금.
 */
function lockScrollForSettingsModal() {
    const sc = getMainAppScrollContent();
    if (!sc) return;
    if (utils.usesMainAppDocumentScroll()) {
        const y = window.scrollY ?? document.documentElement.scrollTop ?? 0;
        document.body.dataset.settingsScrollTop = String(y);
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        return;
    }
    document.body.dataset.settingsScrollTop = String(sc.scrollTop);
    sc.style.overflow = 'hidden';
}

function unlockScrollAfterSettingsModal() {
    if (utils.usesMainAppDocumentScroll()) {
        document.documentElement.style.removeProperty('overflow');
        document.body.style.removeProperty('overflow');
        const raw = document.body.dataset.settingsScrollTop;
        if (raw !== undefined) {
            window.scrollTo(0, parseInt(raw, 10) || 0);
            delete document.body.dataset.settingsScrollTop;
        }
    } else {
        const sc = getMainAppScrollContent();
        if (sc) {
            sc.style.removeProperty('overflow');
            const raw = document.body.dataset.settingsScrollTop;
            if (raw !== undefined) {
                sc.scrollTop = parseInt(raw, 10) || 0;
                delete document.body.dataset.settingsScrollTop;
            }
        }
    }
    /* 구버전·예외 경로에서 남은 body 고정 제거 */
    if (document.body.style.position === 'fixed' || document.body.dataset.scrollY !== undefined) {
        const scrollY = document.body.dataset.scrollY ? parseInt(document.body.dataset.scrollY, 10) : 0;
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('top');
        document.body.style.removeProperty('left');
        document.body.style.removeProperty('right');
        delete document.body.dataset.scrollY;
        window.scrollTo(0, scrollY);
    }
}

/** 설정 모달이 닫혀 있는데 스크롤 잠금만 남은 경우 복구 (히스토리/백 버튼 불일치 등) */
function releaseStaleMainScrollLock() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    const open = modal.style.display === 'flex' || window.getComputedStyle(modal).display === 'flex';
    if (open) return;
    if (utils.usesMainAppDocumentScroll()) {
        document.documentElement.style.removeProperty('overflow');
        document.body.style.removeProperty('overflow');
        const rawDoc = document.body.dataset.settingsScrollTop;
        if (rawDoc !== undefined) {
            window.scrollTo(0, parseInt(rawDoc, 10) || 0);
            delete document.body.dataset.settingsScrollTop;
        }
    } else {
        const sc = getMainAppScrollContent();
        if (sc && sc.style.overflow === 'hidden') {
            sc.style.removeProperty('overflow');
        }
        if (document.body.dataset.settingsScrollTop !== undefined && sc) {
            sc.scrollTop = parseInt(document.body.dataset.settingsScrollTop, 10) || 0;
            delete document.body.dataset.settingsScrollTop;
        }
    }
    if (document.body.style.position === 'fixed' || document.body.dataset.scrollY !== undefined) {
        const scrollY = document.body.dataset.scrollY ? parseInt(document.body.dataset.scrollY, 10) : 0;
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('top');
        document.body.style.removeProperty('left');
        document.body.style.removeProperty('right');
        delete document.body.dataset.scrollY;
        window.scrollTo(0, scrollY);
    }
}


function toggleView(viewName) {
    releaseStaleMainScrollLock();
    activeView = viewName;
    
    const mainView = document.getElementById('mainView');
    const calendarView = document.getElementById('calendarView');
    
    if (!mainView || !calendarView) {
        return;
    }
    
    mainView.style.display = viewName === 'main' ? 'block' : 'none';
    calendarView.style.display = viewName === 'calendar' ? 'block' : 'none';

    if (activeView === 'main') {
        renderMainView();
        if (!history.state || (!history.state.mainView && !history.state.calendarView)) {
            history.pushState({ mainView: true }, '');
        }
    } else if (activeView === 'calendar') {
        const currentYear = state.currentDate.getFullYear();
        const currentMonth = state.currentDate.getMonth();
        state.calendarDate = new Date(currentYear, currentMonth, 1);
        renderCalendarView();
        history.pushState({ calendarView: true }, '');
    }
}

function handleChangeDate(direction) {
    state.currentDate.setDate(state.currentDate.getDate() + direction);
    renderMainView();
}

async function handleToggleSubject(subjectId) {
    try {
        // 현재 보고 있는 날짜가 잠긴 경우 과목 토글 차단
        const viewedDateKey = utils.formatDate(state.currentDate);
        if (state.isPurchasedLock && state.lockedDates && state.lockedDates.includes(viewedDateKey)) {
            return;
        }
        const numericSubjectId = Number(subjectId);
        if (isNaN(numericSubjectId)) {
            return;
        }
        
        // 타이머가 실행 중인지 확인
        const { isTimerActive, getActiveTimerSubjectId, handleTimerTap, startTimer, completeTimer } = await import('./timer.js');
        
        if (isTimerActive()) {
            const activeSubjectId = getActiveTimerSubjectId();
            if (activeSubjectId === numericSubjectId) {
                // 같은 과목 탭 - 타이머 완료 또는 계속하기 선택
                await handleTimerTap();
                return;
            } else {
                // 다른 과목 탭 - 무시
                return;
            }
        }
        
        // 타이머가 설정된 과목인지 확인 (최신 설정은 state.subjects 기준)
        const subject = state.subjects.find(s => Number(s.id) === numericSubjectId);
        if (subject && subject.timerEnabled) {
            const dateKey = utils.formatDate(state.currentDate);
            const isCompleted = !!(state.records[dateKey] && state.records[dateKey][numericSubjectId]);
            if (isCompleted) {
                // 이미 완료된 경우: 클릭 시 완료 취소(토글)
                toggleSubject(numericSubjectId, state.currentDate);
                saveData();
                renderMainView();
                return;
            }
            const started = await startTimer(numericSubjectId);
            if (started) {
                return;
            }
        }
        
        // 타이머가 없거나 시작 실패 시 기존 방식
        toggleSubject(numericSubjectId, state.currentDate);
        saveData();
    } catch (error) {
        utils.logDevWarning('과목 토글 처리 실패', error);
    }
}

async function handleAddAdditional() {
    const reasonInput = document.getElementById('additionalReason');
    const amountInput = document.getElementById('additionalAmount');
    let reason = reasonInput.value.trim();
    const signBtn = document.getElementById('additionalAmountSignBtn');
    let absAmount = Math.abs(Number(amountInput.value));
    if (Number.isNaN(absAmount)) {
        absAmount = NaN;
    }
    let amount = absAmount;
    if (!Number.isNaN(amount) && signBtn?.classList.contains('is-negative')) {
        amount = -amount;
    }
    
    // 현재 보고 있는 날짜가 잠긴 경우 추가 용돈 변경 차단
    const viewedDateKey = utils.formatDate(state.currentDate);
    if (state.isPurchasedLock && state.lockedDates && state.lockedDates.includes(viewedDateKey)) {
        return;
    }

    if (!reason) {
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('dashboard.bonus.errorReason'));
        return;
    }
    
    const maxReasonLength = resources.getMaxLength(state.user?.language || DEFAULT_LOCALE, 'reason', state.user?.country);
    if (reason.length > maxReasonLength) {
        reason = reason.substring(0, maxReasonLength);
        reasonInput.value = reason;
    }
    
    // 소숫점·마이너스 허용; 0만 불가
    if (typeof amount !== 'number' || isNaN(amount) || amount === 0) {
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('dashboard.bonus.errorAmount'));
        return;
    }
    
    const maxAmount = state.settings?.currency?.maxAmount || 10000000;
    if (amount > maxAmount) {
        amount = maxAmount;
        amountInput.value = String(maxAmount);
    } else if (amount < -maxAmount) {
        amount = -maxAmount;
        amountInput.value = String(maxAmount);
    }
    
    const { addBonus } = await import('./ui.js');
    if (await addBonus(reason, amount, state.currentDate)) {
        reasonInput.value = '';
        amountInput.value = '';
        resetAdditionalAmountSignButton();
        saveData();
        renderMainView();
    }
}

async function handleRemoveAdditional(id, dateKey) {
    const { removeBonus } = await import('./state.js');
    const date = new Date(dateKey);
    
    // 해당 날짜가 잠긴 경우 추가 용돈 삭제 차단
    if (state.isPurchasedLock && state.lockedDates && state.lockedDates.includes(dateKey)) {
        return;
    }
    if (removeBonus(id, date)) {
        saveData();
        renderMainView();
    }
}

function handleChangeCalendarMonth(direction) {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + direction);
    renderCalendarView();
}

function handleGoToDate(dateKey) {
    if (!dateKey || dateKey === 'undefined' || dateKey === 'null') {
        return;
    }
    
    const date = new Date(dateKey);
    if (isNaN(date.getTime())) {
        return;
    }
    
    state.currentDate = date;
    toggleView('main');
}

async function openSettings() {
    releaseStaleMainScrollLock();
    state.tempSettings = {
        subjects: JSON.parse(JSON.stringify(state.subjects)),
        goalBonus: state.settings.goalBonus,
        restConstant: state.settings.restConstant
    };
    document.getElementById('settingsModal').style.display = 'flex';
    renderSettings();
    lockScrollForSettingsModal();
    
    history.pushState({ settingsOpen: true }, '');
    
    const handleEscKey = (e) => {
        if (e.key === 'Escape') {
            closeSettings();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    document.addEventListener('keydown', handleEscKey);
}

// 과목과 목표 설정이 변경되었는지 확인하는 함수
function hasSubjectsOrGoalChanged() {
    if (!state.tempSettings) return false;
    
    // 과목 비교
    const currentSubjects = state.subjects;
    const tempSubjects = state.tempSettings.subjects;
    
    if (currentSubjects.length !== tempSubjects.length) {
        return true;
    }
    
    // 각 과목 비교
    for (let i = 0; i < currentSubjects.length; i++) {
        const current = currentSubjects[i];
        const temp = tempSubjects[i];
        if (!temp || 
            current.id !== temp.id ||
            current.name !== temp.name ||
            current.amount !== temp.amount) {
            return true;
        }
    }
    
    // 목표 비교 (goalBonus, restConstant)
    if (state.settings.goalBonus !== state.tempSettings.goalBonus ||
        state.settings.restConstant !== state.tempSettings.restConstant) {
        return true;
    }
    
    return false;
}

async function closeSettings() {
    // 과목이나 목표가 변경되었는지 확인
    if (hasSubjectsOrGoalChanged()) {
        const confirmed = await showConfirmModal(
            i18n.t('settings.close.warnTitle'),
            i18n.t('settings.close.warnMessage')
        );
        
        if (confirmed) {
            // 저장 버튼 클릭과 동일하게 처리
            // handleSaveSettings를 호출하면 내부에서 closeSettings를 호출하지만,
            // 그 closeSettings는 변경사항이 없으므로 바로 닫히므로 여기서 직접 처리하지 않음
            await handleSaveSettings();
            return; // handleSaveSettings에서 closeSettings를 호출하므로 여기서는 리턴
        }
        // 취소하면 계속 진행 (변경사항 무시)
    }
    
    state.tempSettings = null;
    
    const modalBody = document.querySelector('#settingsModal .modal-body');
    if (modalBody) {
        modalBody.style.paddingBottom = '';
    }
    
    const dataSection = document.querySelector('.settings-section[data-section="data"]');
    if (dataSection) {
        dataSection.style.paddingBottom = '';
        dataSection.style.marginBottom = '';
    }
    
    document.getElementById('settingsModal').style.display = 'none';
    unlockScrollAfterSettingsModal();
    
    if (activeView !== 'main') {
        toggleView('main');
    } else {
        renderMainView(state.currentDate);
    }
    
    if (history.state?.settingsOpen) {
        history.back();
    }
}

function handleSettingsInput(event) {
    if (!state.tempSettings) return;
    const target = event.target;
    const id = Number(target.dataset.id);

    if (target.classList.contains('subject-name-input')) {
        const maxLength = resources.getMaxLength(state.user?.language || DEFAULT_LOCALE, 'subject', state.user?.country);
        if (target.value.length > maxLength) {
            target.value = target.value.substring(0, maxLength);
        }
        const subject = state.tempSettings.subjects.find(s => s.id === id);
        if (subject) {
            subject.name = target.value.trim();
        }
        scheduleSettingsInputFontSize(target);
    }
    else if (target.classList.contains('subject-amount-input')) {
        // 숫자만 허용 (소수점 포함)
        const valueStr = target.value;
        const cleanedValue = valueStr.replace(/[^0-9.]/g, '');
        if (valueStr !== cleanedValue) {
            target.value = cleanedValue;
        }
        target.value = utils.normalizeNumericInput(target.value, true);
        
        const subject = state.tempSettings.subjects.find(s => s.id === id);
        if (subject) {
            // 소수점 자릿수 실시간 제한 (잘라내기 방식)
            const currencyDecimal = state.settings?.currency?.decimal || 0;
            const finalValueStr = target.value;
            if (finalValueStr.includes('.')) {
                const [intPart, decPart] = finalValueStr.split('.');
                if (decPart && decPart.length > currencyDecimal) {
                    target.value = currencyDecimal > 0
                        ? `${intPart}.${decPart.substring(0, currencyDecimal)}`
                        : intPart;
                }
            }
            target.value = utils.normalizeNumericInput(target.value, true);
            
            let amount = Number(target.value) || 0;
            const maxSubjectAmount = state.settings?.currency?.maxSubjectAmount || 1000000;
            if (amount > maxSubjectAmount) {
                amount = maxSubjectAmount;
                target.value = maxSubjectAmount;
            }
            target.value = utils.normalizeNumericInput(target.value, true);
            subject.amount = amount;
        }
        scheduleSettingsInputFontSize(target);
    }
    else if (target.id === 'targetDaysInput') {
        // 숫자만 허용 (소수점 제외) - 온보딩과 동일한 방식
        // input 이벤트에서는 숫자만 허용하고, 최소/최대값 검사는 blur 이벤트에서 처리
        const valueStr = target.value;
        const cleanedValue = valueStr.replace(/[^0-9]/g, '');
        if (valueStr !== cleanedValue) {
            target.value = cleanedValue;
        }
        target.value = utils.normalizeNumericInput(target.value, false);
    }
    else if (target.id === 'bonusAmountInput') {
        // 숫자만 허용 (소수점 포함)
        const valueStr = target.value;
        const cleanedValue = valueStr.replace(/[^0-9.]/g, '');
        if (valueStr !== cleanedValue) {
            target.value = cleanedValue;
        }
        target.value = utils.normalizeNumericInput(target.value, true);
        
        // 소수점 자릿수 실시간 제한 (잘라내기 방식)
        const currencyDecimal = state.settings?.currency?.decimal || 0;
        const finalValueStr = target.value;
        if (finalValueStr.includes('.')) {
            const [intPart, decPart] = finalValueStr.split('.');
            if (decPart && decPart.length > currencyDecimal) {
                target.value = currencyDecimal > 0
                    ? `${intPart}.${decPart.substring(0, currencyDecimal)}`
                    : intPart;
                if (state.tempSettings) {
                    state.tempSettings.goalBonus = parseFloat(target.value) || 0;
                }
            }
        }
        target.value = utils.normalizeNumericInput(target.value, true);
        
        let bonus = Number(target.value) || 0;
        const maxAmount = state.settings?.currency?.maxAmount || 10000000;
        
        // 최대값 초과 시 경고 메시지 표시 및 자동 조정
        if (bonus > maxAmount) {
            bonus = maxAmount;
            target.value = maxAmount;
            showBonusAmountError(
                i18n.t('settings.goal.errorBonusMaxAuto', { amount: utils.formatCurrency(maxAmount) }),
                target
            );
        }
        
        // 최소값 검사 (0 미만)
        if (bonus < 0) {
            bonus = 0;
            target.value = 0;
            showBonusAmountError(i18n.t('settings.goal.errorBonusMin'), target);
        }
        target.value = utils.normalizeNumericInput(target.value, true);
        
        state.tempSettings.goalBonus = bonus;
    }
    else if (target.id === 'applyToFutureCheck') {
        state.tempSettings.applyToFuture = target.checked;
    }
}

async function handleAddSubject() {
    if (!state.tempSettings) return;
    
    const maxSubjects = state.MAX_SUBJECTS || 5;
    if (state.tempSettings.subjects.length >= maxSubjects) {
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('settings.subjects.errorLimit', { max: state.MAX_SUBJECTS || 5 }));
        return;
    }
    
    const newId = state.tempSettings.subjects.length > 0 ? Math.max(...state.tempSettings.subjects.map(s => s.id)) + 1 : 1;
    const langCode = state.user?.language || DEFAULT_LOCALE;
    const countryCode = state.user?.country || resources.localeToCountry[langCode] || DEFAULT_COUNTRY;
    const countryData = resources.countries[countryCode];
    const defaultAmount = countryData?.currency?.defaultAmount || 300;
    const newSubject = { id: newId, name: '', amount: defaultAmount, timerEnabled: false, timerMinutes: 25 };
    state.tempSettings.subjects.push(newSubject);
    
    renderSettings();
}

async function handleTimerToggle(subjectId) {
    if (!state.tempSettings) return;
    
    const subject = state.tempSettings.subjects.find(s => s.id === subjectId);
    if (!subject) return;
    
    const newTimerEnabled = !subject.timerEnabled;
    subject.timerEnabled = newTimerEnabled;
    if (!subject.timerMinutes) {
        subject.timerMinutes = 25;
    }
    
    // state.subjects에도 즉시 반영
    const mainSubject = state.subjects.find(s => s.id === subjectId);
    if (mainSubject) {
        mainSubject.timerEnabled = newTimerEnabled;
        if (!mainSubject.timerMinutes) {
            mainSubject.timerMinutes = 25;
        }
    }
    
    renderSettings();
    saveData();
    /* 권한 요청은 사용자 클릭 직후 이어지도록 메인 뷰 갱신보다 먼저 (제스처 체인) */
    if (newTimerEnabled) {
        await prepareStudyTimerOsPermissions();
    }
    await updateMainViewSubjects();
    /* Android: 시스템 권한/설정 화면 복귀 직후 WebView가 한 프레임 늦게 그릴 때 재갱신 */
    requestAnimationFrame(() => {
        void updateMainViewSubjects();
    });
}

/** 타이머 시간 ±5분 조절 공통 헬퍼 */
function handleTimerAdjust(subjectId, direction) {
    if (!state.tempSettings) return;

    const subject = state.tempSettings.subjects.find(s => s.id === subjectId);
    if (!subject || !subject.timerEnabled) return;

    const newMinutes = direction === 'increase'
        ? Math.min(90, (subject.timerMinutes || 25) + 5)
        : Math.max(5,  (subject.timerMinutes || 25) - 5);
    subject.timerMinutes = newMinutes;

    // state.subjects에도 즉시 반영
    const mainSubject = state.subjects.find(s => s.id === subjectId);
    if (mainSubject) {
        mainSubject.timerMinutes = newMinutes;
        mainSubject.timerEnabled = true;
    }

    // 설정 모달 내 타이머 표시 즉시 업데이트
    const modal = document.getElementById('settingsModal');
    const timerDisplay = modal?.querySelector(`.timer-display-inline[data-id="${subjectId}"]`);
    if (timerDisplay) {
        timerDisplay.textContent = `${newMinutes}${i18n.t('timer.minutes')}`;
    }

    saveData();
    void updateMainViewSubjects();
}

/** 설정 변경 시 메인 화면 과목/타이머 실시간 반영용 (다른 모듈에서 호출 가능) */
export async function updateMainViewSubjects() {
    if (activeView === 'main') {
        const { renderSubjectsGrid, renderSummarySection } = await import('./ui.js');
        renderSubjectsGrid(state.currentDate);
        renderSummarySection(state.currentDate);
    }
}

async function handleRemoveSubject(id) {
    if (!state.tempSettings) return;
    
    if (state.tempSettings.subjects.length <= 1) {
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('settings.subjects.errorAtLeastOne'));
        return;
    }
    
    state.tempSettings.subjects = state.tempSettings.subjects.filter(s => s.id !== id);
    renderSettings();
}

async function handleSaveSettings() {
    if (!state.tempSettings) return;
    
    
    if (!state.tempSettings.subjects || state.tempSettings.subjects.length === 0) {
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('settings.subjects.errorAtLeastOne'));
        return;
    }
    
    for (const subject of state.tempSettings.subjects) {
        // 입력 필드에서 최신 값 읽어오기
        const nameInput = document.getElementById(`subject-name-${subject.id}`);
        const amountInput = document.getElementById(`subject-amount-${subject.id}`);
        
        // 과목명 검증 및 업데이트
        const trimmedName = nameInput ? (nameInput.value?.trim() || '') : (subject.name?.trim() || '');
        if (!trimmedName) {
            await showAlertModal(i18n.t('modal.title.alert'), i18n.t('settings.subjects.errorName'));
            return;
        }
        const maxSubjectLength = resources.getMaxLength(state.user?.language || DEFAULT_LOCALE, 'subject', state.user?.country);
        if (trimmedName.length > maxSubjectLength) {
            subject.name = trimmedName.substring(0, maxSubjectLength);
            if (nameInput) {
                nameInput.value = subject.name;
            }
        } else {
            subject.name = trimmedName;
        }
        
        // 금액 검증 및 업데이트 (입력 필드에서 최신 값 읽어오기)
        let amount = subject.amount;
        if (amountInput) {
            const inputValue = Number(amountInput.value);
            if (!isNaN(inputValue) && inputValue > 0) {
                amount = inputValue;
            }
        }
        
        // 소숫점 통화를 고려한 최소값 검증
        const minAmount = state.settings?.currency?.decimal > 0 
            ? Math.pow(0.1, state.settings.currency.decimal) 
            : 1;
        
        if (!amount || amount < minAmount) {
            await showAlertModal(i18n.t('modal.title.alert'), i18n.t('settings.subjects.errorAmount'));
            return;
        }
        
        const maxSubjectAmount = state.settings?.currency?.maxSubjectAmount || 1000000;
        if (amount > maxSubjectAmount) {
            amount = maxSubjectAmount;
            if (amountInput) {
                amountInput.value = maxSubjectAmount;
            }
        }
        
        subject.amount = amount;
    }
    
    // 오늘 날짜 기준으로 이번 달의 목표 일수 계산
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const restConstantToUse = state.tempSettings.restConstant ?? state.settings.restConstant;
    let calculatedGoalDays = daysInMonth - (restConstantToUse || 0);
    
    // 15일 미만이면 15일로 자동 조정
    if (calculatedGoalDays < 15) {
        calculatedGoalDays = 15;
        state.tempSettings.restConstant = daysInMonth - 15;
        const targetDaysInput = document.getElementById('targetDaysInput');
        if (targetDaysInput) {
            targetDaysInput.value = 15;
        }
    }
    // 해당 월의 날짜보다 크면 최대일로 자동 조정
    else if (calculatedGoalDays > daysInMonth) {
        calculatedGoalDays = daysInMonth;
        state.tempSettings.restConstant = 0;
        const targetDaysInput = document.getElementById('targetDaysInput');
        if (targetDaysInput) {
            targetDaysInput.value = daysInMonth;
        }
    }
    
    if (state.tempSettings.goalBonus < 0) {
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('settings.goal.errorBonusMax'));
        return;
    }
    
    const maxAmount = state.settings?.currency?.maxAmount || 10000000;
    if (state.tempSettings.goalBonus > maxAmount) {
        state.tempSettings.goalBonus = maxAmount;
        const bonusAmountInput = document.getElementById('bonusAmountInput');
        if (bonusAmountInput) {
            bonusAmountInput.value = maxAmount;
        }
    }
    
    const confirmed = await showSaveConfirmModal(
        i18n.t('settings.save.warnReplace'),
        i18n.t('settings.save.warnBackup')
    );
    if (!confirmed) return;

    const requiresLockVerification = state.isPurchasedLock && !!state.lockPasswordHash;
    if (requiresLockVerification) {
        const ok = await verifyLockPassword(i18n.t('premium.lock.password.promptNew'));
        if (ok === null) return;
        if (!ok) {
            if (!isLockPinLockedOut()) {
                await showAlertModal(i18n.t('modal.title.error'), i18n.t('premium.lock.password.errorWrong'));
            }
            return;
        }
    }
    
    // 달별 설정 저장: 이번 달만 초기화하고 지난달 데이터는 유지
    const currentMonthKey = utils.formatMonth(today);
    
    // 이번 달이 아닌 달: 그 달에 완료 기록이 있으면 항상 그 과목들만 스냅샷(과거에 전역 목록이 잘못 들어간 경우도 저장 시 교정)
    for (const monthKey in state.ledger.month) {
        if (monthKey === currentMonthKey) continue;
        const entry = state.ledger.month[monthKey];
        const inferred = inferSubjectsFromMonthRecords(monthKey, state.subjects);
        if (inferred.length > 0) {
            entry.subjects = JSON.parse(JSON.stringify(inferred));
        } else if (!entry.subjects || entry.subjects.length === 0) {
            entry.subjects = JSON.parse(JSON.stringify(state.subjects));
        }
    }
    
    // 이번 달의 records만 삭제 (지난달 records는 유지)
    const recordsToDelete = [];
    for (const dateKey in state.records) {
        const recordDate = new Date(dateKey);
        const recordMonthKey = utils.formatMonth(recordDate);
        if (recordMonthKey === currentMonthKey) {
            recordsToDelete.push(dateKey);
        }
    }
    recordsToDelete.forEach(dateKey => delete state.records[dateKey]);
    
    // 이번 달의 ledger를 새로운 설정으로 갱신 (이번 달 목표는 초기화)
    state.ledger.month[currentMonthKey] = {
        subjects: JSON.parse(JSON.stringify(state.tempSettings.subjects)),
        goalDays: calculatedGoalDays,
        goalBonus: state.tempSettings.goalBonus,
        restConstant: state.tempSettings.restConstant,
        totalAmount: 0, // 이번 달 목표 초기화로 인해 총액도 0으로 시작
        bonus: {}, // 보너스도 이번 달은 초기화
        goalBonusAchieved: 0 // 목표 달성 보너스도 초기화
    };
    
    // 현재 설정 업데이트 (앱 전역 설정)
    state.subjects = JSON.parse(JSON.stringify(state.tempSettings.subjects));
    state.settings.goalBonus = state.tempSettings.goalBonus;
    state.settings.restConstant = state.tempSettings.restConstant;
    
    saveData();
    closeSettings();
    
    if (activeView === 'main') {
        renderMainView(state.currentDate);
    } else {
        renderCalendarView(state.calendarDate);
    }
    
    const { showPopupMessage } = await import('./utils.js');
    showPopupMessage(i18n.t('settings.save.success'), 'encouragement');
}

async function handleImportData() {
    // 잠금 비밀번호가 설정된 경우, 데이터 가져오기 전 PIN 검증
    if (state.lockPasswordHash) {
        const ok = await verifyLockPassword(i18n.t('premium.lock.password.promptNew'));
        if (ok === null) return; // 취소 시 중단
        if (!ok) {
            if (!isLockPinLockedOut()) {
                await showAlertModal(i18n.t('modal.title.error'), i18n.t('premium.lock.password.errorWrong'));
            }
            return;
        }
    }

    const nativePick = await pickDataBackupFileAndroid();
    if (nativePick.ok) {
        try {
            const confirmed = await showConfirmModal(
                i18n.t('modal.title.dataImport'),
                i18n.t('settings.data.confirmImport')
            );
            if (!confirmed) return;
            const importResult = await importDataFromFile(nativePick.file);
            if (importResult.success) {
                const msg = importResult.expansionSubjectsClamped
                    ? `${i18n.t('premium.expansion.importClampedMessage')}\n\n${i18n.t('settings.data.importSuccess')}`
                    : i18n.t('settings.data.importSuccess');
                await showAlertModal(i18n.t('modal.title.success'), msg);
                location.reload();
            }
        } catch (error) {
            await showAlertModal(i18n.t('modal.title.error'), error.message);
        }
        return;
    }
    if (nativePick.reason === 'cancelled') return;

    useWebFileInput();

    function useWebFileInput() {
        const fileInput = document.getElementById('fileInput');
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const confirmed = await showConfirmModal(
                        i18n.t('modal.title.dataImport'),
                        i18n.t('settings.data.confirmImport')
                    );
                    if (!confirmed) {
                        fileInput.value = '';
                        return;
                    }
                    const importResult = await importDataFromFile(file);
                    if (importResult.success) {
                        const msg = importResult.expansionSubjectsClamped
                            ? `${i18n.t('premium.expansion.importClampedMessage')}\n\n${i18n.t('settings.data.importSuccess')}`
                            : i18n.t('settings.data.importSuccess');
                        await showAlertModal(i18n.t('modal.title.success'), msg);
                        location.reload();
                    }
                } catch (error) {
                    await showAlertModal(i18n.t('modal.title.error'), error.message);
                }
            }
            fileInput.value = '';
        };
        fileInput.click();
    }
}


async function showSaveConfirmModal(title, message) {
    const modal = document.getElementById('saveConfirmModal');
    if (!modal) return false;

    const titleEl  = document.getElementById('saveConfirmTitle');
    const messageEl = document.getElementById('saveConfirmMessage');
    const cancelBtn = document.getElementById('saveConfirmCancelBtn');
    const okBtn     = document.getElementById('saveConfirmOkBtn');

    titleEl.textContent  = title || i18n.t('settings.save.title');
    messageEl.textContent = message || '';
    cancelBtn.textContent = i18n.t('action.cancel');
    okBtn.textContent     = i18n.t('action.save');

    modal.style.display = 'flex';

    return new Promise((resolve) => {
        const close = (value) => {
            modal.style.display = 'none';
            cancelBtn.removeEventListener('click', onCancel);
            okBtn.removeEventListener('click', onOk);
            document.removeEventListener('keydown', handleKeydown);
            resolve(value);
        };
        const onCancel = () => close(false);
        const onOk     = () => close(true);
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };
        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onOk);
        document.addEventListener('keydown', handleKeydown);
    });
}

/**
 * 입력 필드 아래에 작은 오류 메시지를 3초간 표시 (온보딩과 동일한 방식)
 * @param {string} message - 표시할 오류 메시지
 * @param {HTMLElement} inputElement - 입력 필드 요소
 * @param {string} errorClass - 오류 메시지 클래스명
 */
function showInputError(message, inputElement, errorClass) {
    if (!inputElement) {
        return;
    }
    
    // 기존 오류 메시지 제거 (전역 검색 - 온보딩과 동일)
    const existingErrors = document.querySelectorAll(`.${errorClass}`);
    existingErrors.forEach(err => err.remove());
    
    // goal-input-group 찾기 (자기 자리를 차지하도록)
    let inputGroup = inputElement.closest('.goal-input-group');
    if (!inputGroup) {
        // goal-input-group을 찾지 못한 경우, wrapper 확인
        const wrapper = inputElement.closest('.goal-input-wrapper');
        if (wrapper) {
            inputGroup = wrapper.parentElement;
        } else {
            return;
        }
    }
    
    // 저장 버튼 찾기
    const saveButton = document.getElementById('saveSettingsBtn');
    
    // 저장 버튼 비활성화
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.style.opacity = '0.5';
        saveButton.style.cursor = 'not-allowed';
        saveButton.style.pointerEvents = 'none';
    }
    
    // 새로운 오류 메시지 생성 (goal-input-group에 추가하여 자기 자리를 차지하도록)
    const errorElement = document.createElement('div');
    errorElement.className = errorClass;
    errorElement.textContent = message;
    inputGroup.appendChild(errorElement);
    
    // 애니메이션을 위해 약간의 지연 후 표시 (온보딩과 동일한 방식)
    setTimeout(() => {
        errorElement.classList.add('show');
    }, 10);
    
    // 1초 후 저장 버튼 활성화
    setTimeout(() => {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.style.opacity = '1';
            saveButton.style.cursor = 'pointer';
            saveButton.style.pointerEvents = 'auto';
        }
    }, 1000);
    
    // 3초 후 경고 메시지 제거
    setTimeout(() => {
        errorElement.classList.remove('show');
        setTimeout(() => {
            if (errorElement.parentNode) {
                errorElement.remove();
            }
        }, 300); // 애니메이션 시간
    }, 3000);
}

/**
 * 목표일 입력 필드 아래에 작은 오류 메시지를 3초간 표시
 * @param {string} message - 표시할 오류 메시지
 * @param {HTMLElement} inputElement - 입력 필드 요소
 */
function showTargetDaysError(message, inputElement) {
    showInputError(message, inputElement, 'target-days-error');
}

/**
 * 보너스 금액 입력 필드 아래에 작은 오류 메시지를 3초간 표시
 * @param {string} message - 표시할 오류 메시지
 * @param {HTMLElement} inputElement - 입력 필드 요소
 */
function showBonusAmountError(message, inputElement) {
    showInputError(message, inputElement, 'bonus-amount-error');
}

export async function showAlertModal(title, message, options = {}) {
    const modal = document.getElementById('alertModal');
    if (!modal) return;

    const contentEl = modal.querySelector('.alert-modal-content');
    const titleEl = document.getElementById('alertModalTitle');
    const messageEl = document.getElementById('alertModalMessage');
    const okBtn = document.getElementById('alertModalOkBtn');

    const {
        messageHtml = false,
        contentClass = null,
        okButtonClass = null,
        titleClass = null,
    } = options;

    titleEl.textContent = title || i18n.t('modal.title.alert');
    if (titleClass) titleEl.classList.add(titleClass);

    messageEl.className = 'alert-modal-message';
    if (messageHtml) {
        messageEl.innerHTML = message || '';
    } else {
        messageEl.textContent = message || '';
    }

    if (contentClass && contentEl) contentEl.classList.add(contentClass);
    if (okButtonClass) okBtn.classList.add(okButtonClass);

    okBtn.textContent = i18n.t('action.confirm');

    modal.style.display = 'flex';

    return new Promise((resolve) => {
        const close = () => {
            modal.style.display = 'none';
            if (contentClass && contentEl) contentEl.classList.remove(contentClass);
            if (okButtonClass) okBtn.classList.remove(okButtonClass);
            if (titleClass) titleEl.classList.remove(titleClass);
            messageEl.textContent = '';
            messageEl.innerHTML = '';
            messageEl.className = 'alert-modal-message';
            okBtn.removeEventListener('click', onOk);
            document.removeEventListener('keydown', handleKeydown);
            resolve();
        };
        const onOk = () => close();
        const handleKeydown = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };
        okBtn.addEventListener('click', onOk);
        document.addEventListener('keydown', handleKeydown);
    });
}

function escapeConfirmModalHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeConfirmModalAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export async function showConfirmModal(title, message, buttons = null, options = {}) {
    const modal     = document.getElementById('confirmModal');
    if (!modal) return false;

    const titleEl   = document.getElementById('confirmModalTitle');
    const messageEl = document.getElementById('confirmModalMessage');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');
    const okBtn     = document.getElementById('confirmModalOkBtn');

    const {
        messageHtml = false,
        okText = null,
        okButtonClass = null,
        messageBodyClass = null
    } = options;

    const clearBackHandler = () => { pendingConfirmBackHandler = null; };

    titleEl.textContent   = title || i18n.t('modal.title.confirm');
    messageEl.className = 'confirm-modal-message' + (messageBodyClass ? ` ${messageBodyClass}` : '');
    if (messageHtml) {
        messageEl.innerHTML = message || '';
    } else {
        messageEl.textContent = message || '';
    }

    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
        // 여러 버튼: 3개 이상 세로, 2개는 가로(취소 왼쪽·확인 오른쪽 — 배열 순서대로)
        const buttonContainer = document.createElement('div');
        buttonContainer.className =
            'confirm-modal-buttons'
            + (buttons.length >= 3 ? ' confirm-modal-buttons-column' : '')
            + (buttons.length === 2 ? ' confirm-modal-buttons-row' : '');
        buttonContainer.innerHTML = buttons.map((btn) => {
            const extra = btn.className && String(btn.className).trim();
            const cls = ['confirm-modal-btn', extra].filter(Boolean).join(' ');
            const inner =
                btn.buttonHtml != null && String(btn.buttonHtml).trim() !== ''
                    ? btn.buttonHtml
                    : escapeConfirmModalHtml(String(btn.text ?? ''));
            const ariaRaw = btn.ariaLabel != null ? String(btn.ariaLabel).trim() : '';
            const ariaAttr = ariaRaw ? ` aria-label="${escapeConfirmModalAttr(ariaRaw)}"` : '';
            return `<button type="button" class="${cls}" data-value="${escapeConfirmModalAttr(String(btn.value ?? ''))}"${ariaAttr}>${inner}</button>`;
        }).join('');

        // 기존 버튼 영역 숨기기 (제거하면 다음에 기본 버튼 사용 시 사라짐)
        const contentEl = modal.querySelector('.confirm-modal-content');
        const existingContainer = modal.querySelector('.confirm-modal-buttons');
        if (existingContainer) existingContainer.style.display = 'none';
        cancelBtn.style.display = 'none';
        okBtn.style.display = 'none';

        // 새 버튼 추가 (confirm 모달에는 .modal-footer 없음 → .confirm-modal-content에 추가)
        if (contentEl) contentEl.appendChild(buttonContainer);

        modal.style.display = 'flex';

        return new Promise((resolve) => {
            const closeWithValue = (value) => {
                modal.style.display = 'none';
                buttonContainer.remove();
                if (existingContainer) existingContainer.style.display = '';
                cancelBtn.style.display = '';
                okBtn.style.display = '';
                clearBackHandler();
                document.removeEventListener('keydown', handleKeydown);
                resolve(value);
            };

            if (options.backButtonValue !== undefined) {
                pendingConfirmBackHandler = () => closeWithValue(options.backButtonValue);
            }

            const handleKeydown = (e) => {
                if (e.key === 'Escape' && options.backButtonValue !== undefined) {
                    e.preventDefault();
                    closeWithValue(options.backButtonValue);
                }
            };

            buttonContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.confirm-modal-btn');
                if (btn) closeWithValue(btn.dataset.value);
            });
            document.addEventListener('keydown', handleKeydown);
        });
    } else {
        // 기본 버튼 사용
        cancelBtn.style.display = '';
        okBtn.style.display = '';
        cancelBtn.textContent = i18n.t('action.cancel');
        okBtn.textContent     = okText || i18n.t('action.confirm');
        if (okButtonClass) {
            okButtonClass.split(/\s+/).filter(Boolean).forEach((c) => okBtn.classList.add(c));
        }

        modal.style.display = 'flex';

        return new Promise((resolve) => {
            const close = (value) => {
                modal.style.display = 'none';
                cancelBtn.removeEventListener('click', onCancel);
                okBtn.removeEventListener('click', onOk);
                document.removeEventListener('keydown', handleKeydown);
                if (okButtonClass) {
                    okButtonClass.split(/\s+/).filter(Boolean).forEach((c) => okBtn.classList.remove(c));
                }
                messageEl.className = 'confirm-modal-message';
                if (messageHtml) {
                    messageEl.innerHTML = '';
                } else {
                    messageEl.textContent = '';
                }
                clearBackHandler();
                resolve(value);
            };
            const onCancel = () => close(false);
            const onOk     = () => close(true);
            const handleKeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onOk();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                }
            };
            cancelBtn.addEventListener('click', onCancel);
            okBtn.addEventListener('click', onOk);
            document.addEventListener('keydown', handleKeydown);
        });
    }
}

async function handleResetData() {
    const { resetState } = await import('./state.js');

    // 잠금 비밀번호가 설정된 경우, 데이터 초기화 전 PIN 검증
    if (state.lockPasswordHash) {
        const ok = await verifyLockPassword(i18n.t('premium.lock.password.promptNew'));
        if (ok === null) return; // 취소 시 중단
        if (!ok) {
            if (!isLockPinLockedOut()) {
                await showAlertModal(i18n.t('modal.title.error'), i18n.t('premium.lock.password.errorWrong'));
            }
            return;
        }
    }
    
    if (await showConfirmModal(i18n.t('modal.title.dataReset'), i18n.t('settings.data.confirmReset'))) {
        resetState();
        localStorage.removeItem(STORAGE_KEY);
        /* 과목 확장·잠금은 현재 빌드에서 무료 제공 — 아래 플래그 제거 시 다음 실행에서도 자동 해제됨 */
        try {
            localStorage.removeItem('purchased_expansion');
            localStorage.removeItem('purchased_lock');
            localStorage.removeItem('lock_enabled');
            localStorage.removeItem('lock_date');
            localStorage.removeItem('locked_dates');
            localStorage.removeItem('lock_password_hash');
            localStorage.removeItem(LS_LOCK_PIN_LOCKOUT_UNTIL);
            localStorage.removeItem(LS_LOCK_PIN_FAIL_STREAK);
        } catch (_) {}
        location.reload();
    }
}


async function handleRateApp() {
    try {
        const Capacitor = window.Capacitor;
        const isNative = Capacitor?.isNativePlatform?.() === true;

        if (!isNative) {
            await openPlayStoreAppListing();
            return;
        }

        const InAppReview = getInAppReviewPlugin();
        if (!InAppReview) {
            await openPlayStoreAppListing();
            return;
        }

        try {
            await InAppReview.requestReview();
        } catch (_) {
            await openPlayStoreAppListing();
        }
    } catch (_) {
        try {
            await openPlayStoreAppListing();
        } catch (e) {
            utils.logDevWarning('Play Store 열기 실패', e);
        }
    }
}

// --- 인앱 결제 & 잠금 비밀번호 유틸 ---

/**
 * SHA-256 해시 생성
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
    try {
        if (!window.crypto?.subtle) {
            // 환경에서 crypto.subtle을 지원하지 않으면 평문 반환 (DEV 용도)
            return password;
        }
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return password;
    }
}

/**
 * 4자리 숫자 키패드 모달 표시 (터치·키보드 지원, 4자리 시각 표시)
 * @param {string} message - 제목(짧은 안내)
 * @param {{ pinHint?: 'newFirst' | 'newConfirm' | null }} [options] — 새 비밀번호 설정 시 단계별 안내
 * @returns {Promise<string|null>} - 4자리 비밀번호 또는 취소 시 null
 */
function showPinModal(message, { pinHint = null } = {}) {
    const modal = document.getElementById('pinModal');
    const titleEl = document.getElementById('pinModalTitle');
    const messageEl = document.getElementById('pinModalMessage');
    const hintEl = document.getElementById('pinModalHint');
    const dotsEl = document.getElementById('pinDots');
    const okBtn = document.getElementById('pinModalOkBtn');
    const cancelBtn = document.getElementById('pinModalCancelBtn');
    const backdrop = modal?.querySelector('.pin-modal-backdrop');

    if (!modal || !dotsEl || !okBtn || !cancelBtn) return Promise.resolve(null);

    titleEl.textContent = message || '';
    if (messageEl) {
        messageEl.textContent = '';
        messageEl.setAttribute('hidden', '');
    }
    if (pinHint === 'newFirst') {
        hintEl.textContent = i18n.t('premium.lock.password.hintParent');
        hintEl.removeAttribute('hidden');
        modal.setAttribute('aria-describedby', 'pinModalHint');
    } else if (pinHint === 'newConfirm') {
        hintEl.textContent = i18n.t('premium.lock.password.hintConfirmRepeat');
        hintEl.removeAttribute('hidden');
        modal.setAttribute('aria-describedby', 'pinModalHint');
    } else {
        hintEl.textContent = '';
        hintEl.setAttribute('hidden', '');
        modal.removeAttribute('aria-describedby');
    }

    let pin = '';
    const dots = dotsEl.querySelectorAll('.pin-dot');

    function updateDots() {
        dots.forEach((el, i) => {
            const shouldFill = i < pin.length;
            if (shouldFill !== el.classList.contains('filled')) {
                el.classList.toggle('filled', shouldFill);
            }
        });
        okBtn.disabled = pin.length !== 4;
    }

    function addDigit(digit) {
        if (pin.length >= 4) return;
        pin += String(digit);
        if (navigator.vibrate) navigator.vibrate(8);
        updateDots();
    }

    function removeDigit() {
        if (pin.length === 0) return;
        pin = pin.slice(0, -1);
        if (navigator.vibrate) navigator.vibrate(8);
        updateDots();
    }

    modal.style.display = 'flex';
    pin = '';
    updateDots();
    cancelBtn.textContent = i18n.t('action.cancel');
    okBtn.textContent = i18n.t('action.confirm');

    const keypad = modal.querySelector('.pin-keypad');
    const keypadDown = (e) => {
        const key = e.target.closest('.pin-key');
        if (!key) return;
        e.preventDefault();
        if (key.dataset.digit !== undefined) addDigit(key.dataset.digit);
        else if (key.dataset.action === 'backspace') removeDigit();
    };

    return new Promise((resolve) => {
        const close = (value) => {
            modal.style.display = 'none';
            document.removeEventListener('keydown', handleKeydown);
            keypad?.removeEventListener('pointerdown', keypadDown);
            resolve(value);
        };

        const handleKeydown = (e) => {
            if (e.key >= '0' && e.key <= '9') {
                e.preventDefault();
                addDigit(e.key);
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                removeDigit();
            } else if (e.key === 'Enter' && pin.length === 4) {
                // 엔터키도 확인 버튼과 동일하게 동작
                e.preventDefault();
                close(pin);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close(null);
            }
        };

        okBtn.onclick = () => { if (pin.length === 4) close(pin); };
        cancelBtn.onclick = () => close(null);
        if (backdrop) backdrop.onclick = () => close(null);
        keypad?.addEventListener('pointerdown', keypadDown, { passive: false });
        document.addEventListener('keydown', handleKeydown);
    });
}

/**
 * 4자리 비밀번호 입력 (앱 내 키패드 모달 사용)
 * @param {{ pinHint?: 'newFirst' | 'newConfirm' | null }} [options]
 */
async function promptPasswordOnce(message, options = {}) {
    const input = await showPinModal(message, options);
    if (!input) return null;
    return input;
}

/**
 * 새 비밀번호 2회 입력 받아 확인
 * @param {boolean} [isReplacingExisting] - 이미 PIN이 있을 때 변경 플로우면 첫 입력 제목만 "새 비밀번호"
 * - 키보드 엔터키로 인한 반복 입력을 막기 위해,
 *   엔터키는 PIN 모달에서 "확인" 동작으로 사용하지 않고
 *   확인 버튼 클릭/터치로만 진행되도록 한다.
 */
async function promptNewPassword(isReplacingExisting = false) {
    const firstTitle = isReplacingExisting
        ? i18n.t('premium.lock.password.promptReplaceNew')
        : i18n.t('premium.lock.password.promptNew');
    for (;;) {
        const first = await promptPasswordOnce(firstTitle, { pinHint: 'newFirst' });
        if (!first) return null;
        const second = await promptPasswordOnce(i18n.t('premium.lock.password.promptConfirm'), { pinHint: 'newConfirm' });
        if (!second) return null;
        if (first === second) return first;
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('premium.lock.password.errorMismatch'));
    }
}

function readLockPinLockoutUntil() {
    try {
        const v = localStorage.getItem(LS_LOCK_PIN_LOCKOUT_UNTIL);
        if (!v) return 0;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

function clearExpiredLockPinLockout() {
    try {
        localStorage.removeItem(LS_LOCK_PIN_LOCKOUT_UNTIL);
        localStorage.removeItem(LS_LOCK_PIN_FAIL_STREAK);
    } catch {
        /* ignore */
    }
}

function isLockPinLockedOut() {
    const until = readLockPinLockoutUntil();
    if (until <= 0) return false;
    if (Date.now() >= until) {
        clearExpiredLockPinLockout();
        return false;
    }
    return true;
}

function getLockPinFailStreak() {
    try {
        const v = localStorage.getItem(LS_LOCK_PIN_FAIL_STREAK);
        const n = parseInt(v || '0', 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
        return 0;
    }
}

function setLockPinFailStreak(n) {
    try {
        localStorage.setItem(LS_LOCK_PIN_FAIL_STREAK, String(n));
    } catch {
        /* ignore */
    }
}

function recordLockPinSuccess() {
    setLockPinFailStreak(0);
}

/** @returns {{ lockedOut: boolean }} lockedOut=true 이면 방금 3회 실패로 3시간 잠금 시작 */
function recordLockPinFailure() {
    const s = getLockPinFailStreak() + 1;
    if (s >= LOCK_PIN_MAX_FAILURES) {
        try {
            localStorage.setItem(LS_LOCK_PIN_LOCKOUT_UNTIL, String(Date.now() + LOCK_PIN_LOCKOUT_MS));
        } catch {
            /* ignore */
        }
        setLockPinFailStreak(0);
        return { lockedOut: true };
    }
    setLockPinFailStreak(s);
    return { lockedOut: false };
}

function buildLockPinLockoutWaitMessage() {
    const until = readLockPinLockoutUntil();
    const ms = Math.max(0, until - Date.now());
    const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const prefix = i18n.t('premium.lock.lockout.waitPrefix');
    let timePart;
    if (hours > 0 && minutes > 0) {
        timePart = i18n.t('premium.lock.lockout.waitHM', { hours, minutes });
    } else if (hours > 0) {
        timePart = i18n.t('premium.lock.lockout.waitH', { hours });
    } else {
        timePart = i18n.t('premium.lock.lockout.waitM', { minutes: totalMinutes });
    }
    return `${prefix}\n\n${timePart}`;
}

/**
 * 기존 비밀번호 검증
 * @param {string} question
 * @returns {Promise<boolean|null>} true=일치, false=불일치, null=취소(팝업만 닫힘) 또는 잠금 중(안내 후)
 */
export async function verifyLockPassword(question) {
    if (!state.lockPasswordHash) return true;
    if (isLockPinLockedOut()) {
        await showAlertModal(i18n.t('modal.title.alert'), buildLockPinLockoutWaitMessage());
        return null;
    }
    const input = await promptPasswordOnce(question || i18n.t('premium.lock.password.promptNew'));
    if (!input) return null; // 취소 또는 바깥 클릭 → 오류 없이 닫기만
    const inputHash = await hashPassword(input);
    if (inputHash === state.lockPasswordHash) {
        recordLockPinSuccess();
        return true;
    }
    const { lockedOut } = recordLockPinFailure();
    if (lockedOut) {
        await showAlertModal(i18n.t('modal.title.alert'), i18n.t('premium.lock.lockout.justActivated'));
        return false;
    }
    return false;
}

/**
 * 잠금 기능 비밀번호 최초 설정 또는 변경
 */
async function setupOrChangeLockPassword(isChange = false) {
    // 비밀번호 변경(isChange=true) 시에는 먼저 기존 비밀번호를 한 번 검증하고,
    // 통과한 뒤에 새 비밀번호 2회 입력(확인용) 플로우로 진행한다.
    if (isChange && state.lockPasswordHash) {
        const ok = await verifyLockPassword(i18n.t('premium.lock.password.currentPrompt'));
        if (ok === null) return; // 취소 → 아무 것도 변경하지 않음
        if (!ok) {
            if (!isLockPinLockedOut()) {
                await showAlertModal(i18n.t('modal.title.error'), i18n.t('premium.lock.password.errorWrong'));
            }
            return;
        }
    }

    const isReplacingExisting = isChange && !!state.lockPasswordHash;
    const newPassword = await promptNewPassword(isReplacingExisting);
    if (!newPassword) return;
    const hash = await hashPassword(newPassword);
    state.lockPasswordHash = hash;
    try {
        localStorage.setItem('lock_password_hash', hash);
    } catch {}
    await showAlertModal(i18n.t('premium.lock.password.savedTitle'), i18n.t('premium.lock.password.savedMessage'));
}

/**
 * 인앱 결제 플러그인 가져오기 (@capgo/native-purchases, 없으면 null)
 */
async function getInAppPurchasesPlugin() {
    try {
        const Capacitor = window.Capacitor;
        if (!Capacitor || !Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) {
            return null;
        }
        const plugin = Capacitor.Plugins?.NativePurchases;
        return plugin || null;
    } catch {
        return null;
    }
}

/**
 * Play/App Store에서 조회한 현지 통화 표시 가격 (Google: oneTimePurchaseOfferDetails → formattedPrice, 플러그인은 priceString).
 * 조회 실패·웹·플러그인 없음 시 번역된 안내 문구.
 */
/* === RESTORE_IAP_FORMATTED_PRICE_LOOKUP_START
async function getFormattedIapPrice(productId) {
    try {
        const plugin = await getInAppPurchasesPlugin();
        if (!plugin || typeof plugin.getProduct !== 'function') {
            return i18n.t('premium.iap.priceUnavailable');
        }
        const { product } = await plugin.getProduct({
            productIdentifier: productId,
            productType: 'inapp',
        });
        const s = product?.priceString;
        if (typeof s === 'string' && s.trim()) {
            return s.trim();
        }
    } catch (e) {
        utils.logDevWarning('IAP 가격 조회 실패', e);
    }
    return i18n.t('premium.iap.priceUnavailable');
}
=== RESTORE_IAP_FORMATTED_PRICE_LOOKUP_END */

/**
 * 단일 상품 인앱 결제 시도 (프리미엄 SKU 또는 후원 SKU `donation_*`)
 * - 프로덕션·네이티브: NativePurchases.purchaseProduct
 * - 웹 브라우저: 스토어 없음 → 성공 시뮬레이션(로컬 UI 테스트용)
 * - `DEV_MODE`(build-flags.js): 네이티브에서도 결제 없이 성공 처리(로컬 전용)
 */
async function purchaseProduct(productId) {
    // 웹 또는 DEV_MODE에서는 실제 스토어 결제 없이 성공 처리
    try {
        const hasCapacitor = !!window.Capacitor;
        const isNative = hasCapacitor && typeof window.Capacitor.isNativePlatform === 'function'
            ? window.Capacitor.isNativePlatform()
            : false;
        const isWebEnvironment = !hasCapacitor || !isNative;

        if (DEV_MODE || isWebEnvironment) {
            // 결제 플로우를 시뮬레이션만 하고 바로 성공 처리
            return true;
        }
    } catch (e) {
        // 환경 판별에 실패해도 웹 테스트를 막을 필요는 없으므로 성공 처리
        return true;
    }

    const plugin = await getInAppPurchasesPlugin();
    if (!plugin) {
        await showAlertModal(
            i18n.t('premium.iap.error.unavailableTitle'),
            i18n.t('premium.iap.error.unavailableMessage')
        );
        return false;
    }
    try {
        await plugin.purchaseProduct({
            productIdentifier: productId,
            productType: 'inapp',
            quantity: 1
        });
        return true;
    } catch (error) {
        utils.logDevWarning('인앱 결제 실패', error);
        await showAlertModal(
            i18n.t('premium.iap.error.unavailableTitle'),
            i18n.t('premium.iap.error.failedMessage')
        );
        return false;
    }
}

/**
 * Play/App Store에서 donation_* SKU들의 현지 표시 가격 조회 (NativePurchases.getProducts → priceString)
 */
async function fetchDonationPriceStringByProductId() {
    try {
        const plugin = await getInAppPurchasesPlugin();
        if (!plugin || typeof plugin.getProducts !== 'function') {
            return null;
        }
        const ids = [DONATION_PRODUCTS.SMALL.id, DONATION_PRODUCTS.MEDIUM.id, DONATION_PRODUCTS.LARGE.id];
        const { products } = await plugin.getProducts({
            productIdentifiers: ids,
            productType: 'inapp',
        });
        if (!Array.isArray(products) || products.length === 0) {
            return null;
        }
        const map = Object.create(null);
        for (const pr of products) {
            const id = pr.identifier;
            const ps = pr.priceString;
            if (id && typeof ps === 'string' && ps.trim()) {
                map[id] = ps.trim();
            }
        }
        return Object.keys(map).length > 0 ? map : null;
    } catch (e) {
        utils.logDevWarning('후원 상품 가격 조회 실패', e);
        return null;
    }
}

/** 웹 + 한국어 안내용 카카오뱅크 계좌번호 (앱 붙여넣기용, 하이픈 없음) */
const WEB_KO_BANK_ACCOUNT_CLIPBOARD = '3333368362457';

async function handleWebKoDonationCopy() {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(WEB_KO_BANK_ACCOUNT_CLIPBOARD);
        } else {
            const ta = document.createElement('textarea');
            ta.value = WEB_KO_BANK_ACCOUNT_CLIPBOARD;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        let msg = i18n.t('donation.webKo.copyToast');
        if (!msg || msg === 'donation.webKo.copyToast') {
            msg = '계좌번호가 복사되었습니다!';
        }
        showToastMessage(msg);
    } catch (e) {
        utils.logDevWarning('계좌 클립보드 복사 실패', e);
        let fallback = i18n.t('donation.webKo.accountLine');
        if (!fallback || fallback === 'donation.webKo.accountLine') {
            fallback = '카카오뱅크 333-33-6836-2457';
        }
        await showAlertModal(i18n.t('modal.title.alert'), fallback);
    }
}

function buildDonationTierButtonSpec(tier, productId, priceMap) {
    const captionKey = `donation.buttons.${tier}`;
    const caption = i18n.t(captionKey);
    const formatted = priceMap?.[productId];
    const cap = typeof caption === 'string' ? caption.trim() : '';
    const resolvedCaption = cap && cap !== captionKey ? cap : '';

    const baseClass = `donation-tier-btn donation-tier-${tier}`;

    if (formatted && resolvedCaption) {
        const ariaLabel = `${resolvedCaption}, ${formatted}`;
        return {
            value: tier,
            className: baseClass,
            ariaLabel,
            buttonHtml:
                `<span class="donation-tier-btn-layout">` +
                `<span class="donation-tier-ment">${escapeConfirmModalHtml(resolvedCaption)}</span>` +
                `<span class="donation-tier-price">${escapeConfirmModalHtml(formatted)}</span>` +
                `</span>`,
        };
    }

    const fallbackLabel = resolvedCaption || caption;
    return {
        value: tier,
        className: baseClass,
        text: fallbackLabel,
    };
}

const DONATION_CHOICE_TO_PRODUCT = {
    small: DONATION_PRODUCTS.SMALL,
    medium: DONATION_PRODUCTS.MEDIUM,
    large: DONATION_PRODUCTS.LARGE,
};

export async function showDonationPromptModal(options = {}) {
    const { autoTrackShown = false } = options;
    const title = i18n.t('donation.prompt.title');
    const body = `<div class="donation-prompt-inner">${i18n.t('donation.prompt.body')}</div>`;
    const priceMap = await fetchDonationPriceStringByProductId();
    const buttons = [
        buildDonationTierButtonSpec('small', DONATION_PRODUCTS.SMALL.id, priceMap),
        buildDonationTierButtonSpec('medium', DONATION_PRODUCTS.MEDIUM.id, priceMap),
        buildDonationTierButtonSpec('large', DONATION_PRODUCTS.LARGE.id, priceMap),
        { text: i18n.t('donation.buttons.dismiss'), value: 'dismiss', className: 'donation-dismiss-btn' },
    ];
    const choice = await showConfirmModal(title, body, buttons, {
        messageHtml: true,
        messageBodyClass: 'donation-prompt-message',
        backButtonValue: 'dismiss',
    });

    if (autoTrackShown) {
        markDonationAutoPromptShown();
    }

    const tier = DONATION_CHOICE_TO_PRODUCT[choice];
    if (tier) {
        const success = await purchaseProduct(tier.id);
        if (success) {
            await showAlertModal(i18n.t('donation.thanks.title'), i18n.t('donation.thanks.message'));
        }
    }
}

/**
 * 과목 확장(최대 10개) 구매 안내 및 결제
 */
function buildLockPurchaseSuccessMessageHtml() {
    const line1 = i18n.t('premium.lock.purchaseSuccessLine1');
    const line2 = i18n.t('premium.lock.purchaseSuccessLine2');
    return (
        `<div class="lock-success-message">` +
        `<div class="lock-success-icon-wrap" aria-hidden="true"><span class="lock-success-icon">🔒</span></div>` +
        `<p class="lock-success-copy lock-success-lead">${line1}</p>` +
        `<p class="lock-success-copy lock-success-hint">${line2}</p>` +
        `</div>`
    );
}

function buildSubjectsExpansionSuccessMessageHtml() {
    const copy = i18n.t('premium.expansion.successMessage', { max: EXPANDED_MAX_SUBJECTS });
    return (
        `<div class="expansion-success-message">` +
        `<div class="expansion-success-icon-wrap" aria-hidden="true"><span class="expansion-success-icon">✓</span></div>` +
        `<p class="expansion-success-copy">${copy}</p>` +
        `</div>`
    );
}

function buildLockPurchaseMessageHtml(priceFormatted) {
    const valueLine = i18n.t('premium.lock.valueLine');
    const compareLine = i18n.t('premium.lock.compareLine');
    const priceLine = i18n.t('premium.lock.priceLine', { price: priceFormatted });
    return (
        `<div class="lock-purchase-value">${valueLine}</div>` +
        `<div class="lock-purchase-compare"><div class="lock-purchase-compare-inner">${compareLine}</div></div>` +
        `<div class="lock-purchase-price"><span class="lock-price-emphasis">${priceLine}</span></div>`
    );
}

/** 무료 한도(5개)에서 확장 결제 직후, 사용자가 누른 「과목 추가」에 대응해 빈 슬롯 1개를 바로 넣음 */
function appendOneSubjectAfterExpansionUnlock() {
    const atFreeLimit = DEFAULT_MAX_SUBJECTS;
    const step5El = typeof document !== 'undefined' ? document.getElementById('onboardingStep5') : null;
    const onOnboardingSubjects = Boolean(step5El?.classList.contains('active'));

    if (onOnboardingSubjects && state.subjects.length === atFreeLimit) {
        const newId = Math.max(...state.subjects.map((s) => s.id), 0) + 1;
        const defaultAmount = state.settings?.currency?.defaultAmount ?? 1000;
        state.subjects.push({
            id: newId,
            name: '',
            amount: defaultAmount,
            timerEnabled: false,
            timerMinutes: 25,
        });
        return true;
    }
    if (state.tempSettings && state.tempSettings.subjects.length === atFreeLimit) {
        const newId = Math.max(...state.tempSettings.subjects.map((s) => s.id), 0) + 1;
        const langCode = state.user?.language || DEFAULT_LOCALE;
        const countryCode = state.user?.country || resources.localeToCountry[langCode] || DEFAULT_COUNTRY;
        const countryData = resources.countries[countryCode];
        const defaultAmount = countryData?.currency?.defaultAmount || 300;
        state.tempSettings.subjects.push({
            id: newId,
            name: '',
            amount: defaultAmount,
            timerEnabled: false,
            timerMinutes: 25,
        });
        return true;
    }
    return false;
}

export const STUDY_EXPANSION_SUBJECT_ADDED_EVENT = 'study-allowance-expansion-subject-added';

function buildSubjectsExpansionPurchaseMessageHtml(priceFormatted) {
    const valueLine = i18n.t('premium.expansion.valueLine', { max: EXPANDED_MAX_SUBJECTS });
    const compareLine = i18n.t('premium.expansion.compareLine', {
        current: `<strong>${DEFAULT_MAX_SUBJECTS}</strong>`,
        expanded: `<strong>${EXPANDED_MAX_SUBJECTS}</strong>`
    });
    const priceLine = i18n.t('premium.expansion.priceLine', { price: priceFormatted });
    return (
        `<div class="expansion-purchase-value">${valueLine}</div>` +
        `<div class="expansion-purchase-compare"><div class="expansion-purchase-compare-inner">${compareLine}</div></div>` +
        `<div class="expansion-purchase-price"><span class="expansion-price-emphasis">${priceLine}</span></div>`
    );
}

export async function promptSubjectsExpansionPurchase() {
    /* === RESTORE_IAP_SUBJECT_EXPANSION_PURCHASE_START
        const title = i18n.t('premium.expansion.title');
        const price = await getFormattedIapPrice(PRODUCT_IDS.SUBJECTS_EXPANSION);
        const messageHtml = buildSubjectsExpansionPurchaseMessageHtml(price);
        const ok = await showConfirmModal(title, messageHtml, null, {
            messageHtml: true,
            messageBodyClass: 'expansion-purchase-message',
            okText: i18n.t('premium.expansion.buttonPrimary'),
            okButtonClass: 'expansion-purchase-ok'
        });
        if (!ok) return;

        const success = await purchaseProduct(PRODUCT_IDS.SUBJECTS_EXPANSION);
        if (!success) return;

        state.isPurchasedExpansion = true;
        state.MAX_SUBJECTS = 10;
        try {
            localStorage.setItem('purchased_expansion', 'true');
        } catch {}

        const appended = appendOneSubjectAfterExpansionUnlock();
        if (appended && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(STUDY_EXPANSION_SUBJECT_ADDED_EVENT));
        }
        const settingsModalEarly = document.getElementById('settingsModal');
        if (
            appended &&
            settingsModalEarly &&
            (settingsModalEarly.style.display === 'flex' || window.getComputedStyle(settingsModalEarly).display === 'flex')
        ) {
            renderSettings();
        }

        await showAlertModal(
            i18n.t('premium.expansion.successTitle'),
            buildSubjectsExpansionSuccessMessageHtml(),
            {
                messageHtml: true,
                contentClass: 'expansion-success',
                okButtonClass: 'expansion-success-ok',
                titleClass: 'expansion-success-title',
            }
        );

        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal && (settingsModal.style.display === 'flex' || window.getComputedStyle(settingsModal).display === 'flex')) {
            renderSettings();
        }
    === RESTORE_IAP_SUBJECT_EXPANSION_PURCHASE_END */
}

/**
 * 잠금 기능 구매 버튼 클릭 처리
 */
async function handleLockFeatureButtonClick() {
    // 키보드 엔터 연타 등으로 동일 플로우가 중복 실행되지 않도록 가드
    if (isLockPasswordFlowInProgress) {
        return;
    }
    isLockPasswordFlowInProgress = true;
    try {
        /* === RESTORE_IAP_LOCK_PURCHASE_FLOW_START
        if (!state.isPurchasedLock) {
            const title = i18n.t('premium.lock.purchaseTitle');
            const price = await getFormattedIapPrice(PRODUCT_IDS.LOCK_FEATURE);
            const messageHtml = buildLockPurchaseMessageHtml(price);
            const ok = await showConfirmModal(title, messageHtml, null, {
                messageHtml: true,
                messageBodyClass: 'lock-purchase-message',
                okText: i18n.t('premium.lock.buttonPrimary'),
                okButtonClass: 'lock-purchase-ok',
            });
            if (!ok) return;

            const success = await purchaseProduct(PRODUCT_IDS.LOCK_FEATURE);
            if (!success) return;

            state.isPurchasedLock = true;
            try {
                localStorage.setItem('purchased_lock', 'true');
            } catch {}
            await showAlertModal(
                i18n.t('premium.lock.purchaseSuccessTitle'),
                buildLockPurchaseSuccessMessageHtml(),
                {
                    messageHtml: true,
                    contentClass: 'lock-success',
                    okButtonClass: 'lock-success-ok',
                    titleClass: 'lock-success-title',
                }
            );
            await setupOrChangeLockPassword(false);

            const settingsModalPurchased = document.getElementById('settingsModal');
            if (settingsModalPurchased && (settingsModalPurchased.style.display === 'flex' || window.getComputedStyle(settingsModalPurchased).display === 'flex')) {
                renderSettings();
            }
            return;
        }
        === RESTORE_IAP_LOCK_PURCHASE_FLOW_END */

        if (!state.lockPasswordHash) {
            await setupOrChangeLockPassword(false);
        } else {
            await setupOrChangeLockPassword(true);
        }

        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal && (settingsModal.style.display === 'flex' || window.getComputedStyle(settingsModal).display === 'flex')) {
            renderSettings();
        }
    } finally {
        isLockPasswordFlowInProgress = false;
    }
}

let appContainerClickHandler = null;
let appContainerInputHandler = null;
let appContainerBlurHandler = null;

function showSettingsInfoPopup(i18nKey) {
    const popup = document.getElementById('settingsInfoPopup');
    const bodyEl = document.getElementById('settingsInfoPopupBody');
    const closeBtn = document.getElementById('settingsInfoPopupClose');
    if (!popup || !bodyEl) return;
    let html;
    if (i18nKey === 'settings.subjects.help') {
        const lang = state.user?.language || DEFAULT_LOCALE;
        const maxLength = resources.getMaxLength(lang, 'subject', state.user?.country);
        const maxSubjectAmount = state.settings?.currency?.maxSubjectAmount ?? 1000000;
        const defaultAmount = state.settings?.currency?.defaultAmount ?? 200;
        const formattedMaxAmount = maxSubjectAmount.toLocaleString();
        const formattedDefaultAmount = defaultAmount.toLocaleString();
        const currencySymbol = state.settings?.currency?.symbol || '₩';
        const currencyPosition = state.settings?.currency?.position || 'before';
        // 화폐 단위 위치에 따라 금액 문자열 조합
        const maxAmountWithSymbol = currencyPosition === 'before' 
            ? `${currencySymbol}${formattedMaxAmount}` 
            : `${formattedMaxAmount} ${currencySymbol}`;
        const defaultAmountWithSymbol = currencyPosition === 'before' 
            ? `${currencySymbol}${formattedDefaultAmount}` 
            : `${formattedDefaultAmount} ${currencySymbol}`;
        const title = i18n.t('settings.subjects.help.title');
        const p1 = i18n.t('settings.subjects.help.subjectName', { max: maxLength });
        const p2 = i18n.t('settings.subjects.help.amount', { maxAmount: maxAmountWithSymbol, defaultAmount: defaultAmountWithSymbol });
        const p3 = i18n.t('settings.subjects.help.targetTime');
        html = `<div class="settings-info-block settings-info-title">${title}</div><div class="settings-info-block settings-info-justify">${p1}</div><div class="settings-info-block settings-info-justify">${p2}</div><div class="settings-info-block settings-info-justify">${p3}</div>`;
    } else if (i18nKey === 'settings.goal.info') {
        const raw = i18n.t(i18nKey, { min: MIN_GOAL_DAYS });
        const parts = raw.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
        let title = '';
        let listItems = [];
        let tip = '';
        if (parts.length >= 3) {
            title = parts[0];
            listItems = parts[1].split('\n').map((l) => l.trim()).filter((l) => /^\d+\./.test(l));
            tip = parts[2];
        } else if (parts.length === 2) {
            const main = parts[0];
            tip = parts[1];
            const lines = main.split('\n').map((l) => l.trim()).filter(Boolean);
            title = lines[0] || '';
            listItems = lines.slice(1).filter((l) => /^\d+\./.test(l));
        } else {
            html = raw.replace(/\n/g, '<br>');
        }
        if (parts.length >= 2) {
            const listHtml = listItems.length > 0
                ? `<ol class="settings-info-list">${listItems.map((item) => `<li>${item.replace(/^\d+\.\s*/, '').trim()}</li>`).join('')}</ol>`
                : '';
            html = `
                <div class="settings-info-block settings-info-title">${title}</div>
                ${listHtml ? `<div class="settings-info-block">${listHtml}</div>` : ''}
                ${tip ? `<div class="settings-info-block settings-info-tip">${tip}</div>` : ''}
            `;
        }
    } else {
        html = i18n.t(i18nKey);
    }
    bodyEl.innerHTML = html;
    if (closeBtn) closeBtn.textContent = i18n.t('action.close');
    popup.style.display = 'flex';
}

function closeSettingsInfoPopup() {
    const popup = document.getElementById('settingsInfoPopup');
    if (popup) popup.style.display = 'none';
}

export function setupEventListeners() {
    const appContainer = document.getElementById('appContainer');
    const settingsModal = document.getElementById('settingsModal');
    
    if (!appContainer) {
        return;
    }

    const SWIPE_MIN_DIST_PX = 56;
    const SWIPE_VERTICAL_RATIO = 1.35;
    const SWIPE_MAX_DURATION_MS = 700;

    appContainer.addEventListener(
        'touchstart',
        (e) => {
            if (e.touches.length !== 1) {
                mainCalendarSwipeTouchStart = null;
                return;
            }
            if (isSwipeBlockedByModal()) {
                mainCalendarSwipeTouchStart = null;
                return;
            }
            if (document.getElementById('appContainer')?.classList.contains('timer-active')) {
                mainCalendarSwipeTouchStart = null;
                return;
            }
            const t = e.touches[0];
            mainCalendarSwipeTouchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
        },
        { passive: true }
    );

    appContainer.addEventListener(
        'touchcancel',
        () => {
            mainCalendarSwipeTouchStart = null;
        },
        { passive: true }
    );

    appContainer.addEventListener(
        'touchend',
        (e) => {
            const start = mainCalendarSwipeTouchStart;
            mainCalendarSwipeTouchStart = null;
            if (!start || !e.changedTouches?.[0]) {
                return;
            }
            if (isSwipeBlockedByModal()) {
                return;
            }
            if (document.getElementById('appContainer')?.classList.contains('timer-active')) {
                return;
            }

            const t = e.changedTouches[0];
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            if (Date.now() - start.t > SWIPE_MAX_DURATION_MS) {
                return;
            }
            if (Math.abs(dx) < SWIPE_MIN_DIST_PX) {
                return;
            }
            if (Math.abs(dx) < Math.abs(dy) * SWIPE_VERTICAL_RATIO) {
                return;
            }

            const mainView = document.getElementById('mainView');
            const calendarView = document.getElementById('calendarView');
            const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
            const mainVisible = mainView && window.getComputedStyle(mainView).display !== 'none';
            const calVisible = calendarView && window.getComputedStyle(calendarView).display !== 'none';
            const inMain = mainVisible && path.includes(mainView);
            const inCal = calVisible && path.includes(calendarView);

            const rtl = document.documentElement.getAttribute('dir') === 'rtl';
            const hSign = rtl ? -1 : 1;
            if (inMain) {
                handleChangeDate((dx < 0 ? 1 : -1) * hSign);
            } else if (inCal) {
                handleChangeCalendarMonth((dx < 0 ? 1 : -1) * hSign);
            }
        },
        { passive: true }
    );
    
    if (appContainerClickHandler) {
        appContainer.removeEventListener('click', appContainerClickHandler);
    }
    if (appContainerInputHandler) {
        appContainer.removeEventListener('input', appContainerInputHandler);
    }
    if (appContainerBlurHandler) {
        appContainer.removeEventListener('blur', appContainerBlurHandler);
    }

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        const newSettingsBtn = settingsBtn.cloneNode(true);
        settingsBtn.parentNode.replaceChild(newSettingsBtn, settingsBtn);
        newSettingsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openSettings();
        });
    }
    
    const calendarBtn = document.getElementById('calendarBtn');
    if (calendarBtn) {
        const newCalendarBtn = calendarBtn.cloneNode(true);
        calendarBtn.parentNode.replaceChild(newCalendarBtn, calendarBtn);
        newCalendarBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const targetView = activeView === 'main' ? 'calendar' : 'main';
            toggleView(targetView);
        });
    }
    
    window.addEventListener('popstate', (event) => {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal && (settingsModal.style.display === 'flex' || window.getComputedStyle(settingsModal).display === 'flex')) {
            closeSettings();
        }
        else if (activeView === 'calendar') {
            toggleView('main');
        }
    });
    
    async function setupNativeBackButton() {
        const Capacitor = window.Capacitor || window.CapacitorPlugins;

        if (!Capacitor) {
            return;
        }

        const isNative = Capacitor.isNativePlatform ? Capacitor.isNativePlatform() : false;

        if (!isNative) {
            return;
        }

        const App = Capacitor.Plugins.App;

        if (!App) {
            return;
        }

        try {
            await App.removeAllListeners();
        } catch (e) {
            utils.logDevWarning('백버튼 리스너 초기화 실패', e);
        }

        let lastBackPressTime = 0;
        const DOUBLE_BACK_THRESHOLD = 2000;

        App.addListener('backButton', async () => {
            const settingsModal = document.getElementById('settingsModal');
            const isSettingsOpen = settingsModal && (
                settingsModal.style.display === 'flex' ||
                window.getComputedStyle(settingsModal).display === 'flex'
            );

            if (isSettingsOpen) {
                closeSettings();
                return;
            }

            const confirmModal = document.getElementById('confirmModal');
            const isConfirmVisible = confirmModal && (
                confirmModal.style.display === 'flex' ||
                window.getComputedStyle(confirmModal).display === 'flex'
            );
            if (isConfirmVisible && pendingConfirmBackHandler) {
                pendingConfirmBackHandler();
                return;
            }

            if (activeView === 'main') {
                try {
                    const { isTimerActive, handleTimerTap } = await import('./timer.js');
                    if (isTimerActive()) {
                        await handleTimerTap();
                        return;
                    }
                } catch (e) {
                    utils.logDevWarning('타이머 탭 처리 실패', e);
                }
            }

            if (activeView === 'calendar') {
                toggleView('main');
                return;
            }

            if (activeView === 'main') {
                const now = Date.now();
                if (now - lastBackPressTime < DOUBLE_BACK_THRESHOLD) {
                    App.minimizeApp();
                    return;
                }
                lastBackPressTime = now;
                return;
            }
        });
    }
    
    setupNativeBackButton();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            releaseStaleMainScrollLock();
        }
    });
    
    // 메인 뷰 이벤트 (이벤트 위임 사용)
    appContainerClickHandler = async (event) => {
        const target = event.target;
        if (target.id === 'prevDate') handleChangeDate(-1);
        if (target.id === 'nextDate') handleChangeDate(1);
        
        // 이름 클릭 시 편집 모드 활성화
        if (target.id === 'userNameDisplay' || target.classList.contains('user-name')) {
            event.preventDefault();
            event.stopPropagation();
            enableNameEdit();
            return;
        }
        
        const subjectCard = target.closest('.subject-card');
        if (subjectCard) {
            event.preventDefault();
            event.stopPropagation();
            
            const subjectId = subjectCard.getAttribute('data-subject-id') || subjectCard.dataset.subjectId;
            
            if (subjectId) {
                try {
                    // 타이머 완료 상태에서 탭 시 완료 처리
                    const {
                        isTimerActive,
                        getActiveTimerSubjectId,
                        completeTimer,
                        restoreMainScrollAfterTimerExit,
                    } = await import('./timer.js');
                    if (isTimerActive() && getActiveTimerSubjectId() === Number(subjectId)) {
                        const tapComplete = subjectCard.querySelector('.timer-tap-complete');
                        if (tapComplete && tapComplete.style.display !== 'none') {
                            await completeTimer();
                            const { renderMainView } = await import('./ui.js');
                            renderMainView();
                            restoreMainScrollAfterTimerExit();
                            return;
                        }
                    }
                    await handleToggleSubject(subjectId);
                } catch (err) {
                    utils.logDevWarning('과목 토글 클릭 처리 실패', err);
                }
                return;
            }
        }
        if (target.id === 'addAdditionalBtn') handleAddAdditional();
        const removeBtn = target.closest('.remove-bonus');
        if (removeBtn) {
            const bonusId = removeBtn.dataset.id;
            const dateKey = utils.formatDate(state.currentDate);
            if (bonusId) {
                handleRemoveAdditional(bonusId, dateKey).catch(() => {
                    // 에러 발생 시 조용히 처리
                });
            }
        }
        if (target.id === 'prevMonth') handleChangeCalendarMonth(-1);
        if (target.id === 'nextMonth') handleChangeCalendarMonth(1);
        const dayEl = target.closest('.calendar-day');
        if (dayEl && dayEl.dataset.dateKey && !dayEl.classList.contains('empty')) {
            handleGoToDate(dayEl.dataset.dateKey);
        }
        const goalBadge = target.closest('.goal-achieved-badge');
        if (goalBadge || target.id === 'goalAchievedBadge' || target.id === 'goalAchievedText') {
            (async () => {
                const { createFireworkEffect } = await import('./ui.js');
                createFireworkEffect();
            })();
        }
        if (target.id === 'lockToggleBtn') {
            event.preventDefault();
            event.stopPropagation();
            if (isTimerActive()) {
                return;
            }
            (async () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const current = new Date(state.currentDate);
                current.setHours(0, 0, 0, 0);
                const isToday = today.getTime() === current.getTime();
                
                // 잠금 기능은 구매 + PIN(비밀번호) 설정이 완료된 상태에서만 사용 가능
                if (!state.isPurchasedLock || !state.lockPasswordHash) {
                    await showAlertModal(
                        i18n.t('modal.title.alert'),
                        i18n.t('premium.lock.password.promptNew')
                    );
                    return;
                }
                const viewedDateKey = utils.formatDate(state.currentDate);
                const isDateLocked = state.lockedDates && state.lockedDates.includes(viewedDateKey);
                if (!isDateLocked) {
                    const ok = await showConfirmModal(
                        i18n.t('premium.lock.toggle.title'),
                        i18n.t('premium.lock.toggle.message')
                    );
                    if (!ok) return;
                    if (!state.lockedDates) state.lockedDates = [];
                    if (!state.lockedDates.includes(viewedDateKey)) {
                        state.lockedDates.push(viewedDateKey);
                        try {
                            localStorage.setItem('locked_dates', JSON.stringify(state.lockedDates));
                        } catch (_) {}
                    }
                    saveData();
                    renderMainView(state.currentDate);
                } else {
                    const ok = await verifyLockPassword(i18n.t('premium.lock.password.promptNew'));
                    if (ok === null) return;
                    if (!ok) {
                        if (!isLockPinLockedOut()) {
                            await showAlertModal(
                                i18n.t('modal.title.error'),
                                i18n.t('premium.lock.password.errorWrong')
                            );
                        }
                        return;
                    }
                    state.lockedDates = (state.lockedDates || []).filter(d => d !== viewedDateKey);
                    try {
                        localStorage.setItem('locked_dates', JSON.stringify(state.lockedDates));
                    } catch (_) {}
                    saveData();
                    renderMainView(state.currentDate);
                }
            })();
        }
    };
    appContainer.addEventListener('click', appContainerClickHandler);

    settingsModal.addEventListener('click', (event) => {
        const target = event.target;
        if (target.id === 'closeSettings') closeSettings();
        if (target.id === 'subjectsInfoBtn') { showSettingsInfoPopup('settings.subjects.help'); return; }
        if (target.id === 'goalInfoBtn') { showSettingsInfoPopup('settings.goal.info'); return; }
        if (target.id === 'saveSettingsBtn') handleSaveSettings();
        if (target.id === 'rateAppBtn') handleRateApp();
        if (target.id === 'donateDeveloperBtn') {
            void showDonationPromptModal({ autoTrackShown: false });
            return;
        }
        if (target.id === 'webKoDonationBtn') {
            void handleWebKoDonationCopy();
            return;
        }
        if (target.id === 'lockFeatureBtn') { handleLockFeatureButtonClick(); return; }
        
        if (target.id === 'dataTitle' || target.classList.contains('data-title-toggle')) {
            const container = document.getElementById('dataButtonsContainer');
            const title = document.getElementById('dataTitle');
            const dataSection = document.querySelector('.settings-section[data-section="data"]');
            const modalBody = document.querySelector('.modal-body');
            
            if (container && title) {
                const isVisible = container.classList.contains('show');
                if (isVisible) {
                    container.classList.remove('show');
                    title.classList.remove('active');
                    setTimeout(() => {
                        container.style.display = 'none';
                    }, 300);
                } else {
                    container.style.display = 'block';
                    requestAnimationFrame(() => {
                        container.classList.add('show');
                        title.classList.add('active');
                        
                        setTimeout(() => {
                            if (dataSection && modalBody) {
                                const sectionTop = dataSection.offsetTop;
                                const sectionHeight = dataSection.offsetHeight;
                                modalBody.scrollTo({
                                    top: sectionTop + sectionHeight - modalBody.clientHeight + 100,
                                    behavior: 'smooth'
                                });
                            }
                        }, 350);
                    });
                }
            }
        }
        if (target.id === 'addSubjectBtn') handleAddSubject();
        const removeSubjectBtn = target.closest('.remove-btn');
        if (removeSubjectBtn) handleRemoveSubject(Number(removeSubjectBtn.dataset.id));
        
        // 타이머 토글 버튼 (버튼 자체 클릭)
        const timerToggleBtn = target.closest('.timer-toggle-btn');
        if (timerToggleBtn && !target.closest('.timer-controls-inline')) {
            const subjectId = Number(timerToggleBtn.dataset.id);
            void handleTimerToggle(subjectId).catch((e) => utils.logDevWarning('handleTimerToggle', e));
        }
        
        // 타이머 시간 조절 버튼 (인라인) — 전파/기본동작 차단으로 부모 깜박임 방지
        const timerDecreaseBtn = target.closest('.timer-decrease-btn-inline');
        if (timerDecreaseBtn) {
            event.preventDefault();
            event.stopPropagation();
            handleTimerAdjust(Number(timerDecreaseBtn.dataset.id), 'decrease');
            return;
        }
        
        const timerIncreaseBtn = target.closest('.timer-increase-btn-inline');
        if (timerIncreaseBtn) {
            event.preventDefault();
            event.stopPropagation();
            handleTimerAdjust(Number(timerIncreaseBtn.dataset.id), 'increase');
            return;
        }
        const fontSizeDot = target.closest('.font-size-dot');
        const fontSizenum = target.closest('.font-size-num');
        if (fontSizeDot || fontSizenum) {
            const btn = fontSizeDot || fontSizenum;
            const level = Number(btn.dataset.level);
            if (level >= 1 && level <= 5) {
                state.settings.fontSizeScale = level;
                applyFontSizeScale();
                saveData();
                document.querySelectorAll('.font-size-dot').forEach(b => {
                    const sel = Number(b.dataset.level) === level;
                    b.setAttribute('aria-pressed', sel ? 'true' : 'false');
                    b.classList.toggle('selected', sel);
                });
                document.querySelectorAll('.font-size-num').forEach(b => {
                    b.classList.toggle('selected', Number(b.dataset.level) === level);
                });
            }
        }
        if (target.id === 'exportDataBtn') exportDataToFile();
        if (target.id === 'importDataBtn') handleImportData();
        if (target.id === 'resetDataBtn') handleResetData();
    });

    const settingsInfoPopup = document.getElementById('settingsInfoPopup');
    const settingsInfoPopupClose = document.getElementById('settingsInfoPopupClose');
    const settingsInfoPopupBackdrop = document.querySelector('.settings-info-popup-backdrop');
    if (settingsInfoPopupClose) settingsInfoPopupClose.addEventListener('click', closeSettingsInfoPopup);
    if (settingsInfoPopupBackdrop) settingsInfoPopupBackdrop.addEventListener('click', closeSettingsInfoPopup);
    if (settingsInfoPopup) {
        settingsInfoPopup.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeSettingsInfoPopup();
        });
    }

    const subjectsInfoBtn = document.getElementById('subjectsInfoBtn');
    const goalInfoBtn = document.getElementById('goalInfoBtn');
    [subjectsInfoBtn, goalInfoBtn].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (btn.id === 'subjectsInfoBtn') {
                    showSettingsInfoPopup('settings.subjects.help');
                } else if (btn.id === 'goalInfoBtn') {
                    showSettingsInfoPopup('settings.goal.info');
                }
            }
        });
    });

    settingsModal.addEventListener('input', handleSettingsInput);
    
    settingsModal.addEventListener('blur', (event) => {
        const target = event.target;
        
        if (target.id === 'targetDaysInput') {
            // blur 시에도 소수점 제거 (온보딩과 동일한 방식)
            const valueStr = target.value;
            const cleanedValue = valueStr.replace(/[^0-9]/g, '');
            if (valueStr !== cleanedValue) {
                target.value = cleanedValue;
            }
            target.value = utils.normalizeNumericInput(target.value, false);
            
            // 오늘 날짜 기준으로 이번 달의 날짜 수 계산
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const originalValue = Number(target.value) || 15;
            let targetDays = originalValue;
            let errorMessage = null;
            let adjustedValue = targetDays;
            
            // 15일 미만이면 15일로 자동 조정
            if (targetDays < 15) {
                adjustedValue = 15;
                errorMessage = i18n.t('settings.goal.errorDaysMin', { min: MIN_GOAL_DAYS });
            }
            // 해당 월의 날짜보다 크면 최대일로 자동 조정
            else if (targetDays > daysInMonth) {
                adjustedValue = daysInMonth;
                errorMessage = i18n.t('settings.goal.errorDaysMax', { max: daysInMonth });
            }
            
            // 값이 조정되었으면 오류 메시지 표시하고 값 업데이트
            if (errorMessage && adjustedValue !== originalValue) {
                showTargetDaysError(errorMessage, target);
                target.value = adjustedValue;
                targetDays = adjustedValue;
            }
            target.value = utils.normalizeNumericInput(target.value, false);
            
            // restConstant 업데이트
            if (state.tempSettings) {
                state.tempSettings.restConstant = daysInMonth - targetDays;
            }
        }
        else if (target.classList.contains('subject-amount-input')) {
            // 숫자만 허용 (소수점 포함)
            const valueStr = target.value;
            const cleanedValue = valueStr.replace(/[^0-9.]/g, '');
            if (valueStr !== cleanedValue) {
                target.value = cleanedValue;
            }
            target.value = utils.normalizeNumericInput(target.value, true);
            
            // 소수점 자릿수 제한 및 반올림
            const currencyDecimal = state.settings?.currency?.decimal || 0;
            const finalValueStr = target.value;
            if (finalValueStr && finalValueStr.includes('.')) {
                const decimalPart = finalValueStr.split('.')[1];
                if (decimalPart && decimalPart.length > currencyDecimal) {
                    // 소수점 자릿수 초과 시 반올림
                    const rounded = parseFloat(finalValueStr).toFixed(currencyDecimal);
                    target.value = rounded;
                    const id = Number(target.dataset.id);
                    const subject = state.tempSettings?.subjects.find(s => s.id === id);
                    if (subject) {
                        subject.amount = parseFloat(rounded);
                    }
                }
            }
            target.value = utils.normalizeNumericInput(target.value, true);
            
            const maxSubjectAmount = state.settings?.currency?.maxSubjectAmount || 1000000;
            const value = Number(target.value);
            if (value > maxSubjectAmount) {
                target.value = maxSubjectAmount;
                const id = Number(target.dataset.id);
                const subject = state.tempSettings?.subjects.find(s => s.id === id);
                if (subject) {
                    subject.amount = maxSubjectAmount;
                }
            }
            target.value = utils.normalizeNumericInput(target.value, true);
        }
        else if (target.id === 'bonusAmountInput') {
            // 숫자만 허용 (소수점 포함)
            const valueStr = target.value;
            const cleanedValue = valueStr.replace(/[^0-9.]/g, '');
            if (valueStr !== cleanedValue) {
                target.value = cleanedValue;
            }
            target.value = utils.normalizeNumericInput(target.value, true);
            
            // 소수점 자릿수 실시간 제한 (입력 중에 자릿수 초과 방지)
            const currencyDecimal = state.settings?.currency?.decimal || 0;
            const finalValueStr = target.value;
            if (finalValueStr && finalValueStr.includes('.')) {
                const decimalPart = finalValueStr.split('.')[1];
                if (decimalPart && decimalPart.length > currencyDecimal) {
                    // 소수점 자릿수 초과 시 자동으로 잘라내기
                    const integerPart = finalValueStr.split('.')[0];
                    const limitedDecimal = decimalPart.substring(0, currencyDecimal);
                    target.value = currencyDecimal > 0 ? `${integerPart}.${limitedDecimal}` : integerPart;
                    if (state.tempSettings) {
                        state.tempSettings.goalBonus = parseFloat(target.value) || 0;
                    }
                }
            }
            target.value = utils.normalizeNumericInput(target.value, true);
            
            const maxAmount = state.settings?.currency?.maxAmount || 10000000;
            const value = Number(target.value);
            if (value > maxAmount) {
                target.value = maxAmount;
                if (state.tempSettings) {
                    state.tempSettings.goalBonus = maxAmount;
                }
                // 최대값 초과 시 경고 메시지 표시
                const errorMessage = i18n.t('settings.goal.errorBonusMaxAuto', { amount: utils.formatCurrency(maxAmount) });
                showBonusAmountError(errorMessage, target);
            }
            
            // 최소값 검사 (0 미만)
            if (value < 0) {
                target.value = 0;
                if (state.tempSettings) {
                    state.tempSettings.goalBonus = 0;
                }
                const errorMessage = i18n.t('settings.goal.errorBonusMin');
                showBonusAmountError(errorMessage, target);
            }
            target.value = utils.normalizeNumericInput(target.value, true);
        }
    }, true);
    
    appContainerInputHandler = (event) => {
        const target = event.target;
        if (target.id === 'additionalReason') {
            const maxLength = resources.getMaxLength(state.user?.language || DEFAULT_LOCALE, 'reason', state.user?.country);
            if (target.value.length > maxLength) {
                target.value = target.value.substring(0, maxLength);
            }
        }
        else if (target.id === 'additionalAmount') {
            const signBtn = document.getElementById('additionalAmountSignBtn');
            const valueStr = target.value;
            if (/-/.test(valueStr) && signBtn) {
                signBtn.classList.add('is-negative');
                syncAdditionalAmountSignButton(target, signBtn);
            }
            const cleanedValue = utils.cleanUnsignedNumericInput(valueStr);
            if (valueStr !== cleanedValue) {
                target.value = cleanedValue;
            }
            target.value = utils.normalizeUnsignedNumericInput(target.value, true);
            
            // 소수점 자릿수 제한
            const currencyDecimal = state.settings?.currency?.decimal || 0;
            const finalValueStr = target.value;
            if (finalValueStr && finalValueStr.includes('.')) {
                const decimalPart = finalValueStr.split('.')[1];
                if (decimalPart && decimalPart.length > currencyDecimal) {
                    const rounded = parseFloat(finalValueStr).toFixed(currencyDecimal);
                    target.value = rounded;
                }
            }
            target.value = utils.normalizeUnsignedNumericInput(target.value, true);
            
            const maxAmount = state.settings?.currency?.maxAmount || 10000000;
            const value = Number(target.value);
            if (!Number.isNaN(value) && value > maxAmount) {
                target.value = String(maxAmount);
            }
        }
    };
    appContainer.addEventListener('input', appContainerInputHandler, true);
    
    appContainerBlurHandler = (event) => {
        const target = event.target;
        if (target.id === 'additionalAmount') {
            const signBtn = document.getElementById('additionalAmountSignBtn');
            const valueStr = target.value;
            if (/-/.test(valueStr) && signBtn) {
                signBtn.classList.add('is-negative');
                syncAdditionalAmountSignButton(target, signBtn);
            }
            const cleanedValue = utils.cleanUnsignedNumericInput(valueStr);
            if (valueStr !== cleanedValue) {
                target.value = cleanedValue;
            }
            target.value = utils.normalizeUnsignedNumericInput(target.value, true);
            
            const currencyDecimal = state.settings?.currency?.decimal || 0;
            const finalValueStr = target.value;
            if (finalValueStr && finalValueStr.includes('.')) {
                const decimalPart = finalValueStr.split('.')[1];
                if (decimalPart && decimalPart.length > currencyDecimal) {
                    const rounded = parseFloat(finalValueStr).toFixed(currencyDecimal);
                    target.value = rounded;
                }
            }
            target.value = utils.normalizeUnsignedNumericInput(target.value, true);
            
            const maxAmount = state.settings?.currency?.maxAmount || 10000000;
            const value = Number(target.value);
            if (!Number.isNaN(value) && value > maxAmount) {
                target.value = String(maxAmount);
            }
        }
    };
    appContainer.addEventListener('blur', appContainerBlurHandler, true);
}