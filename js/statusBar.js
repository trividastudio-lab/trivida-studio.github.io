import { i18n } from './languages.js';
import { state } from './state.js';
import { formatCurrency, formatDate, formatMonth } from './utils.js';

let currentInfoIndex = 0;
let infoRotationTimer = null;
let timeUpdateTimer = null;
let initialized = false;

/**
 * 커스텀 상태바 초기화
 */
export function initCustomStatusBar() {
    if (initialized) return;
    initialized = true;

    // 시간 표시 시작 (1초마다)
    updateStatusTime();
    timeUpdateTimer = setInterval(updateStatusTime, 1000);

    // 정보 로테이션 시작 (5초마다)
    startInfoRotation();
}

/**
 * 커스텀 상태바 정리
 */
export function cleanupCustomStatusBar() {
    clearInterval(infoRotationTimer);
    infoRotationTimer = null;
    clearInterval(timeUpdateTimer);
    timeUpdateTimer = null;
    initialized = false;
}

/**
 * 시간 업데이트
 */
const TIME_FORMAT_OPTIONS = { hour: '2-digit', minute: '2-digit' };

function updateStatusTime() {
    const timeElement = document.getElementById('statusTime');
    if (!timeElement) return;

    const now = new Date();
    let timeString;
    try {
        timeString = now.toLocaleTimeString(state.user?.language || 'en-US', TIME_FORMAT_OPTIONS);
    } catch {
        timeString = now.toLocaleTimeString('ko', TIME_FORMAT_OPTIONS);
    }

    timeElement.textContent = timeString;
}

/**
 * 정보 로테이션 시작
 */
function startInfoRotation() {
    if (infoRotationTimer) clearInterval(infoRotationTimer);

    rotateStatusInfo();
    infoRotationTimer = setInterval(rotateStatusInfo, 5000);
}

/**
 * 정보 순환 표시
 */
function rotateStatusInfo() {
    const infos = [
        getInfoTodayAmount(),
        getInfoMonthlyStreak(),
        getInfoTotalStreak(),
        getInfoCheer()
    ];

    const availableInfos = infos.filter(info => info !== null);
    if (availableInfos.length === 0) return;

    const currentInfo = availableInfos[currentInfoIndex % availableInfos.length];
    displayStatusInfo(currentInfo);

    currentInfoIndex = (currentInfoIndex + 1) % availableInfos.length;
}

/**
 * 1. 오늘 획득 금액
 */
function getInfoTodayAmount() {
    const amount = calculateTodayAmount();
    if (amount <= 0) return null;

    const formatted = formatCurrency(amount);
    const text = i18n.t('statusBar.todayAmount', { amount: formatted });
    return `💰 ${text}`;
}

/**
 * 2. 이달 완료한 날
 */
function getInfoMonthlyStreak() {
    const streak = calculateMonthlyStreak();
    if (streak < 1) return null;

    const text = i18n.t('statusBar.monthlyStreak', { count: streak });
    return `🔥 ${text}`;
}

/**
 * 3. 전체 연속 완료
 */
function getInfoTotalStreak() {
    const streak = calculateTotalStreak();
    if (streak < 1) return null;

    const text = i18n.t('statusBar.totalStreak', { count: streak });
    return `🔥 ${text}`;
}

/**
 * 4. 응원 메시지
 */
function getInfoCheer() {
    const text = i18n.t('statusBar.cheer');
    return `💪 ${text}`;
}

/**
 * 정보 표시
 */
function displayStatusInfo(text) {
    const infoElement = document.getElementById('statusInfo');
    if (!infoElement) return;

    infoElement.style.opacity = '0';

    setTimeout(() => {
        infoElement.textContent = text;
        infoElement.style.opacity = '1';
    }, 150);
}

/**
 * 날짜 배열을 순회하며 연속 완료일을 계산하는 공통 헬퍼
 */
function countStreak(dateKeys) {
    let streak = 0;
    for (const dateKey of dateKeys) {
        if (isAllSubjectsCompleted(dateKey)) {
            streak += 1;
        } else {
            break;
        }
    }
    return streak;
}

/**
 * 이달 완료한 날 수 계산 (이번 달에 모든 과목을 완료한 날짜의 총 개수)
 */
function calculateMonthlyStreak() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    let count = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = formatDate(new Date(year, month, day));
        if (isAllSubjectsCompleted(dateKey)) {
            count += 1;
        }
    }
    return count;
}

/**
 * 전체 연속 완료일 계산
 */
function calculateTotalStreak() {
    const today = new Date();
    const dateKeys = [];
    for (let i = 0; i < 365; i += 1) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        dateKeys.push(formatDate(checkDate));
    }
    return countStreak(dateKeys);
}

/**
 * 특정 날짜 모든 과목 완료 확인
 */
function isAllSubjectsCompleted(dateKey) {
    if (!state.records?.[dateKey] || !Array.isArray(state.subjects) || state.subjects.length === 0) {
        return false;
    }

    for (const subject of state.subjects) {
        if (!state.records[dateKey][subject.id]) return false;
    }

    return true;
}

/**
 * 오늘 획득 총 금액 계산
 */
function calculateTodayAmount() {
    const today = new Date();
    const dateKey = formatDate(today);
    const monthKey = formatMonth(today);
    let totalAmount = 0;

    if (state.records?.[dateKey]) {
        for (const subjectId in state.records[dateKey]) {
            if (state.records[dateKey][subjectId]) {
                const subject = state.subjects.find(s => s.id === Number(subjectId));
                if (subject) totalAmount += subject.amount;
            }
        }
    }

    const bonusList = state.ledger?.month?.[monthKey]?.bonus?.[dateKey];
    if (Array.isArray(bonusList)) {
        for (const bonus of bonusList) {
            totalAmount += bonus.amount;
        }
    }

    return totalAmount;
}
