import { resources } from './languages.js';
import { formatDate, formatMonth } from './utils.js';

// 프리미엄 기능 관련 상수
export const DEFAULT_MAX_SUBJECTS = 5;
export const EXPANDED_MAX_SUBJECTS = 10;

// 상수 정의
const DEFAULT_GOAL_DAYS = 25;
const DEFAULT_GOAL_BONUS = 10000;
const DEFAULT_REST_CONSTANT = 6;
export const MIN_GOAL_DAYS = 15;

// 기본값은 resources에서 가져오기 (온보딩·감지 실패 시와 동일하게 영어·미국)
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_COUNTRY = 'US';
const defaultCountryData = resources.countries[DEFAULT_COUNTRY];

// subjects 배열 생성 헬퍼 함수 (코드 중복 제거)
function createSubjectsArray(defaultSubjects) {
    return defaultSubjects.map((subject, index) => ({
        id: index + 1,
        name: subject.name,
        amount: subject.amount,
        timerEnabled: false,
        timerMinutes: 25
    }));
}

// 기본 settings 객체 생성 헬퍼 (state 초기값 · resetState 중복 제거)
function createDefaultSettingsObj(countryData) {
    return {
        goalDays: DEFAULT_GOAL_DAYS,
        goalBonus: countryData.defaultBonus || DEFAULT_GOAL_BONUS,
        restConstant: DEFAULT_REST_CONSTANT,
        currency: countryData.currency,
        fontSizeScale: 3
    };
}

export const state = {
    isInitialized: false,
    onboardingCompleted: false,
    schemaVersion: "1.0",
    
    // 프리미엄 인앱 결제 상태 (현재 빌드: 기능 무료 해제 — IAP 복원 시 주석 참고)
    isPurchasedExpansion: true,
    isPurchasedLock: true,
    lockPasswordHash: null,
    /** 잠긴 날짜 목록 (YYYY-MM-DD 형식). 날짜별 과목·추가용돈 잠금 */
    lockedDates: [],
    MAX_SUBJECTS: EXPANDED_MAX_SUBJECTS,

    /** localStorage donation_prompt_shown 미러 */
    donationPromptShown: false,
    
    user: {
        name: '',
        language: DEFAULT_LOCALE,
        country: DEFAULT_COUNTRY
    },
    
    subjects: createSubjectsArray(defaultCountryData.defaultSubjects),
    settings: createDefaultSettingsObj(defaultCountryData),
    
    records: {},
    
    ledger: {
        month: {}
    },
    
    currentDate: new Date(),
    calendarDate: new Date(),
    
    tempSettings: null
};

export function createDefaultSettings(langCode) {
    if (!langCode || typeof langCode !== 'string') {
        langCode = DEFAULT_LOCALE;
    }
    
    const countryCode = state.user?.country || resources.localeToCountry[langCode] || DEFAULT_COUNTRY;
    const countryData = resources.countries[countryCode] || defaultCountryData;
    
    return {
        subjects: createSubjectsArray(countryData.defaultSubjects),
        currency: countryData.currency,
        goalDays: DEFAULT_GOAL_DAYS,
        goalBonus: countryData.defaultBonus || DEFAULT_GOAL_BONUS,
        restConstant: DEFAULT_REST_CONSTANT
    };
}

export function resetState() {
    state.isInitialized = false;
    state.onboardingCompleted = false;
    
    state.isPurchasedExpansion = true;
    state.isPurchasedLock = true;
    state.lockPasswordHash = null;
    state.lockedDates = [];
    state.MAX_SUBJECTS = EXPANDED_MAX_SUBJECTS;
    state.donationPromptShown = false;
    state.user = { name: '', language: DEFAULT_LOCALE, country: DEFAULT_COUNTRY };
    
    state.subjects = createSubjectsArray(defaultCountryData.defaultSubjects);
    state.settings = createDefaultSettingsObj(defaultCountryData);
    state.records = {};
    state.ledger = { month: {} };
    state.currentDate = new Date();
    state.calendarDate = new Date();
    state.tempSettings = null;
}

export function validateState() {
    return (
        state.user.name &&
        state.user.language &&
        state.subjects.length > 0 &&
        state.settings.goalDays > 0
    );
}

export function addSubject(name, amount) {
    const maxSubjects = state.MAX_SUBJECTS || DEFAULT_MAX_SUBJECTS;
    if (state.subjects.length >= maxSubjects) return false;
    
    // 입력 유효성 검사
    if (!name || typeof name !== 'string' || name.trim().length === 0) return false;
    if (typeof amount !== 'number' || isNaN(amount) || amount < 0) return false;
    
    // 빈 배열일 때를 대비한 안전한 ID 계산 (reduce 사용으로 성능 개선)
    const maxId = state.subjects.reduce((max, s) => Math.max(max, s.id || 0), 0);
    const newId = maxId + 1;
    
    state.subjects.push({
        id: newId,
        name: name.trim(),
        amount: amount,
        timerEnabled: false,
        timerMinutes: 25
    });
    
    return true;
}

export function removeSubject(subjectId) {
    if (state.subjects.length <= 1) return false;
    
    const numericId = Number(subjectId);
    if (isNaN(numericId)) return false;
    
    const index = state.subjects.findIndex(s => s.id === numericId);
    if (index === -1) return false;
    
    state.subjects.splice(index, 1);
    
    // 해당 과목의 모든 기록 삭제 (성능 최적화: Object.keys 사용)
    const recordKeys = Object.keys(state.records);
    for (let i = 0; i < recordKeys.length; i++) {
        const dateKey = recordKeys[i];
        if (state.records[dateKey] && state.records[dateKey][numericId] !== undefined) {
            delete state.records[dateKey][numericId];
            // 빈 객체 정리
            if (Object.keys(state.records[dateKey]).length === 0) {
                delete state.records[dateKey];
            }
        }
    }
    
    return true;
}

export function toggleSubjectCompletion(subjectId, date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return false;
    }
    
    const numericId = Number(subjectId);
    if (isNaN(numericId)) return false;
    
    const dateKey = formatDate(date);
    if (!state.records[dateKey]) {
        state.records[dateKey] = {};
    }
    
    const wasCompleted = !!state.records[dateKey][numericId];
    state.records[dateKey][numericId] = !wasCompleted;
    
    // 토글 off 시 빈 날짜 레코드 정리 (removeSubject와 동일한 패턴)
    if (wasCompleted && Object.values(state.records[dateKey]).every(v => !v)) {
        delete state.records[dateKey];
    }
    
    return !wasCompleted;
}

// subjects 배열을 깊은 복사하는 헬퍼 함수 (성능 최적화)
function cloneSubjects(subjects) {
    return subjects.map(s => ({ 
        id: s.id, 
        name: s.name, 
        amount: s.amount,
        timerEnabled: s.timerEnabled || false,
        timerMinutes: s.timerMinutes || 25
    }));
}

// ledger 초기화 헬퍼 함수 (코드 중복 제거)
// subjects는 여기서 채우지 않음 — 기록/보너스가 있는 달은 records 기준으로만 스냅샷(과거 데이터 고정)
function initializeMonthLedger(monthKey) {
    if (!state.ledger.month[monthKey]) {
        state.ledger.month[monthKey] = {
            totalAmount: 0,
            bonus: {},
            goalBonusAchieved: 0,
            goalBonus: state.settings.goalBonus
        };
    }
    if (!state.ledger.month[monthKey].bonus) {
        state.ledger.month[monthKey].bonus = {};
    }
}

/**
 * 해당 월에 완료(true)로 남은 subjectId만 모아 candidateSubjects에서 매칭.
 * 설정 저장 후 과목 수가 바뀌어도, 과거 달 스냅샷을 전역 과목 목록 길이로 덮어쓰지 않기 위함.
 */
/** 이번 달 ledger 스냅샷에도 목표 시간(타이머)은 live 설정을 반영 — 권한 플로우 후 그리드 갱신 시 분 표시 유지 */
function mergeLedgerSubjectsWithLiveTimers(snapshot, liveList) {
    if (!Array.isArray(snapshot) || !Array.isArray(liveList)) return snapshot || [];
    const liveById = new Map(liveList.map((s) => [Number(s.id), s]));
    return snapshot.map((s) => {
        const live = liveById.get(Number(s.id));
        if (!live) return { ...s };
        return {
            ...s,
            timerEnabled: !!live.timerEnabled,
            timerMinutes: live.timerMinutes != null ? live.timerMinutes : 25,
        };
    });
}

export function inferSubjectsFromMonthRecords(monthKey, candidateSubjects) {
    if (!Array.isArray(candidateSubjects)) return [];
    const usedSubjectIds = new Set();
    for (const dateKey in state.records) {
        const recordDate = new Date(dateKey);
        if (isNaN(recordDate.getTime())) continue;
        if (formatMonth(recordDate) !== monthKey) continue;
        const day = state.records[dateKey];
        if (!day || typeof day !== 'object') continue;
        for (const subjectId in day) {
            if (day[subjectId]) usedSubjectIds.add(Number(subjectId));
        }
    }
    if (usedSubjectIds.size === 0) return [];
    return candidateSubjects.filter((subj) => usedSubjectIds.has(Number(subj.id)));
}

export function addBonus(reason, amount, date) {
    // 입력 유효성 검사
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) return false;
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return false;
    if (!(date instanceof Date) || isNaN(date.getTime())) return false;
    
    const dateKey = formatDate(date);
    const monthKey = formatMonth(date);
    
    initializeMonthLedger(monthKey);
    const bonusLedger = state.ledger.month[monthKey];
    if (!bonusLedger.subjects || bonusLedger.subjects.length === 0) {
        bonusLedger.subjects = cloneSubjects(state.subjects);
    }

    if (!state.ledger.month[monthKey].bonus[dateKey]) {
        state.ledger.month[monthKey].bonus[dateKey] = [];
    }
    
    // 일일 5개 제한 체크
    if (state.ledger.month[monthKey].bonus[dateKey].length >= 5) {
        return false;
    }
    
    const bonusItem = {
        id: `bonus_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        reason: reason.trim(),
        amount: amount,
        createdAt: new Date().toISOString()
    };
    
    state.ledger.month[monthKey].bonus[dateKey].push(bonusItem);
    state.ledger.month[monthKey].totalAmount = (state.ledger.month[monthKey].totalAmount || 0) + amount;
    
    return true;
}

export function removeBonus(bonusId, date) {
    if (!bonusId || typeof bonusId !== 'string') return false;
    if (!(date instanceof Date) || isNaN(date.getTime())) return false;
    
    const dateKey = formatDate(date);
    const monthKey = formatMonth(date);
    
    if (!state.ledger.month[monthKey]?.bonus?.[dateKey]) {
        return false;
    }
    
    const bonusIndex = state.ledger.month[monthKey].bonus[dateKey].findIndex(item => item.id === bonusId);
    if (bonusIndex === -1) return false;
    
    const removedAmount = state.ledger.month[monthKey].bonus[dateKey][bonusIndex].amount;
    state.ledger.month[monthKey].bonus[dateKey].splice(bonusIndex, 1);
    
    // 빈 배열 정리
    if (state.ledger.month[monthKey].bonus[dateKey].length === 0) {
        delete state.ledger.month[monthKey].bonus[dateKey];
    }
    
    if (state.ledger.month[monthKey].totalAmount !== undefined) {
        state.ledger.month[monthKey].totalAmount = Math.max(0, state.ledger.month[monthKey].totalAmount - removedAmount);
    }
    
    return true;
}


/**
 * 메인 화면 과목 그리드용: 기록/보너스가 있는 달은 ledger 스냅샷, 아니면 현재(또는 설정 미리보기) 과목 목록
 */
export function getSubjectsForDateDisplay(date) {
    const maxSubjects = state.MAX_SUBJECTS || DEFAULT_MAX_SUBJECTS;
    const live = state.tempSettings?.subjects || state.subjects;
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return live.slice(0, maxSubjects);
    }
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthKey = formatMonth(date);
    const monthLedger = state.ledger.month[monthKey];
    const recordKeys = Object.keys(state.records);
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    let hasRecordsInMonth = false;
    for (let i = 0; i < recordKeys.length; i++) {
        const key = recordKeys[i];
        if (!key.startsWith(monthPrefix) || !/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
        if (Object.keys(state.records[key] || {}).length > 0) {
            hasRecordsInMonth = true;
            break;
        }
    }
    const hasBonusInMonth = !!(monthLedger?.bonus && Object.keys(monthLedger.bonus).length > 0);
    const shouldLock = hasRecordsInMonth || hasBonusInMonth;
    const ls = monthLedger?.subjects;
    const viewMonthKey = formatMonth(date);
    const isViewingCurrentMonth = viewMonthKey === formatMonth(new Date());
    if (shouldLock && Array.isArray(ls) && ls.length > 0) {
        const merged = isViewingCurrentMonth ? mergeLedgerSubjectsWithLiveTimers(ls, live) : ls;
        return merged.slice(0, maxSubjects);
    }
    if (shouldLock) {
        const inferred = inferSubjectsFromMonthRecords(monthKey, live);
        const list = inferred.length > 0 ? inferred : live;
        return list.slice(0, maxSubjects);
    }
    return live.slice(0, maxSubjects);
}

export function calculateMonthlyStats(date) {
    // 입력 유효성 검사
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return { totalAmount: 0, doneCount: 0, targetCount: 0, percentage: 0 };
    }
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthKey = formatMonth(date);
    const monthLedger = state.ledger.month[monthKey];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const goalBonusToUse = monthLedger?.goalBonus ?? state.tempSettings?.goalBonus ?? state.settings.goalBonus;
    const tempOrGlobal = state.tempSettings?.subjects || state.subjects;

    const recordKeys = Object.keys(state.records);
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    let hasRecordsInMonth = false;
    for (let i = 0; i < recordKeys.length; i++) {
        const key = recordKeys[i];
        if (!key.startsWith(monthPrefix) || !/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
        const dayRecords = state.records[key];
        if (dayRecords && Object.keys(dayRecords).length > 0) {
            hasRecordsInMonth = true;
            break;
        }
    }

    const hasBonusInMonth = !!(monthLedger?.bonus && Object.keys(monthLedger.bonus).length > 0);
    const shouldLockMonthSettings = hasRecordsInMonth || hasBonusInMonth;

    initializeMonthLedger(monthKey);
    const ledger = state.ledger.month[monthKey];

    if (!ledger.subjects || ledger.subjects.length === 0) {
        if (shouldLockMonthSettings) {
            const inferred = inferSubjectsFromMonthRecords(monthKey, tempOrGlobal);
            ledger.subjects = cloneSubjects(inferred.length > 0 ? inferred : tempOrGlobal);
        } else {
            ledger.subjects = cloneSubjects(tempOrGlobal);
        }
    }

    const subjectsToUse = ledger.subjects;
    const subjectMap = new Map(subjectsToUse.map(s => [Number(s.id), s]));

    let totalAmount = 0;
    let doneCount = 0;
    for (let i = 0; i < recordKeys.length; i++) {
        const key = recordKeys[i];
        if (!key.startsWith(monthPrefix) || !/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
        const dayRecords = state.records[key];
        const subjectIds = Object.keys(dayRecords);
        for (let j = 0; j < subjectIds.length; j++) {
            const subjectId = subjectIds[j];
            if (dayRecords[subjectId]) {
                doneCount++;
                const subject = subjectMap.get(Number(subjectId));
                if (subject) totalAmount += subject.amount;
            }
        }
    }

    const restConstantToUse = shouldLockMonthSettings
        ? (ledger.restConstant ?? state.tempSettings?.restConstant ?? state.settings.restConstant)
        : (state.tempSettings?.restConstant ?? state.settings.restConstant);
    const goalDaysToUse = shouldLockMonthSettings && ledger.goalDays !== undefined
        ? ledger.goalDays
        : Math.max(MIN_GOAL_DAYS, daysInMonth - (restConstantToUse || 0));

    const targetCount = (goalDaysToUse || 0) * subjectsToUse.length;
    const percentage = targetCount > 0 ? Math.min((doneCount / targetCount) * 100, 100) : 0;

    if (shouldLockMonthSettings) {
        if (ledger.goalDays === undefined) {
            ledger.goalDays = goalDaysToUse;
        }
        if (ledger.restConstant === undefined) {
            ledger.restConstant = restConstantToUse;
        }
    } else {
        ledger.goalDays = goalDaysToUse;
        ledger.restConstant = restConstantToUse;
    }
    if (ledger.goalBonus === undefined) {
        ledger.goalBonus = goalBonusToUse;
    }
    
    // 기존 ledger 업그레이드
    // 기존 goalBonus 필드가 있고 goalBonusAchieved가 없으면 마이그레이션
    if (ledger.goalBonus !== undefined && ledger.goalBonusAchieved === undefined) {
        // 기존 goalBonus는 목표 달성 보너스였을 수 있으므로 goalBonusAchieved로 이동
        ledger.goalBonusAchieved = ledger.goalBonus || 0;
    }
    if (ledger.totalAmount === undefined) {
        ledger.totalAmount = 0;
    }
    if (ledger.goalBonusAchieved === undefined) {
        ledger.goalBonusAchieved = 0;
    }
    
    // 목표 달성 보너스 처리
    if (percentage >= 100 && goalBonusToUse > 0) {
        if (!ledger.goalBonusAchieved || ledger.goalBonusAchieved === 0) {
            ledger.goalBonusAchieved = goalBonusToUse;
        }
    } else {
        ledger.goalBonusAchieved = 0;
    }
    
    // 목표 달성 보너스 추가
    if (ledger.goalBonusAchieved) {
        totalAmount += ledger.goalBonusAchieved;
    }
    
    // 추가 보너스 합계
    if (ledger.bonus) {
        const bonusDayKeys = Object.keys(ledger.bonus);
        for (let i = 0; i < bonusDayKeys.length; i++) {
            const bonusItems = ledger.bonus[bonusDayKeys[i]];
            if (Array.isArray(bonusItems)) {
                for (let j = 0; j < bonusItems.length; j++) {
                    totalAmount += bonusItems[j].amount || 0;
                }
            }
        }
    }
    
    return { totalAmount, doneCount, targetCount, percentage };
}