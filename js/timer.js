/**
 * timer.js
 * 타이머 기능 관리
 */

import { DEV_MODE, SKIP_ANDROID_EXACT_ALARM_PROMPT } from './build-flags.js';
import { state } from './state.js';
import { i18n } from './languages.js';
import { toggleSubject } from './ui.js';
import { saveData } from './api.js';
import * as utils from './utils.js';

let activeTimer = null;
let timerInterval = null;
let timerStartTime = null;
let wakeLock = null;
let isTimerRunning = false;
let isPaused = false;
/** 카운트다운은 끝났고 "탭하여 완료"만 남은 상태 — 화면 켜짐 유지 불필요 */
let awaitingCompletionTap = false;

/** 집중 모드 진입 직전 `.scroll-content` scrollTop — 레이아웃 복귀·리렌더 후 복원 */
let mainScrollTopBeforeTimer = null;

function getMainScrollContentEl() {
    return document.querySelector('#appContainer .scroll-content');
}

/**
 * renderMainView / updateMainViewSubjects 등으로 DOM 갱신 후 호출 — 스크롤 위치 유지
 */
export function restoreMainScrollAfterTimerExit() {
    if (mainScrollTopBeforeTimer == null) return;
    const y = mainScrollTopBeforeTimer;
    mainScrollTopBeforeTimer = null;
    if (utils.usesMainAppDocumentScroll()) {
        const root = document.scrollingElement ?? document.documentElement;
        const apply = () => {
            const max = Math.max(0, root.scrollHeight - window.innerHeight);
            window.scrollTo(0, Math.min(y, max));
        };
        apply();
        requestAnimationFrame(() => {
            apply();
            requestAnimationFrame(apply);
        });
        return;
    }
    const sc = getMainScrollContentEl();
    if (!sc) return;
    const apply = () => {
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        sc.scrollTop = Math.min(y, max);
    };
    apply();
    requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(apply);
    });
}

/** 타이머 시간 종료 후, 탭 완료 전 무응답 시 1분 간격 재알림 진동 */
const IDLE_COMPLETION_REMINDER_MS = 60 * 1000;
let idleCompletionReminderTimers = [];

/**
 * Vibration API는 길이·간격(ms)만 지정 가능하고, 실제 “세기”는 기기/OS 설정 따름.
 * 체감을 키우려면 짧은 간격으로 여러 번 울리는 패턴을 씀.
 */
const VIBRATE_TIMER_FINISHED = [320, 110, 320];
const VIBRATE_IDLE_REMINDER = [260];

/** 화면 꺼짐·백그라운드에서도 종료 시각에 OS 알림(진동) — Android 32비트 id */
const TIMER_END_NOTIFICATION_ID = 91001;
const TIMER_NOTIFICATION_CHANNEL_ID = 'study_timer_end';

function isNativeCapacitor() {
    return typeof window !== 'undefined'
        && window.Capacitor
        && typeof window.Capacitor.isNativePlatform === 'function'
        && window.Capacitor.isNativePlatform();
}

function isAndroidNative() {
    return isNativeCapacitor()
        && typeof window.Capacitor.getPlatform === 'function'
        && window.Capacitor.getPlatform() === 'android';
}

/**
 * 로컬 알림 플러그인 참조.
 * - Android/iOS WebView: `import('@capacitor/...')`는 bare specifier라 실패할 수 있어,
 *   런타임에 포함된 `Capacitor.registerPlugin('LocalNotifications')`를 우선 사용.
 * - 폴백: 동적 import(개발 서버 등에서 import map이 있을 때).
 */
let localNotificationsPromise = null;
async function getLocalNotifications() {
    if (!isNativeCapacitor()) return null;
    /* Android/iOS: Bridge가 주입한 Capacitor.Plugins.LocalNotifications (plain object).
       이 런타임에는 @capacitor/core의 registerPlugin이 없을 수 있음 — registerPlugin만 쓰면 항상 null. */
    const injected = window.Capacitor?.Plugins?.LocalNotifications;
    if (injected && typeof injected.checkPermissions === 'function') {
        return injected;
    }
    try {
        const reg = window.Capacitor?.registerPlugin;
        if (typeof reg === 'function') {
            const ln = reg.call(window.Capacitor, 'LocalNotifications');
            if (ln && typeof ln.checkPermissions === 'function') {
                return ln;
            }
        }
    } catch (e) {
        if (DEV_MODE) console.warn('getLocalNotifications registerPlugin', e);
    }
    if (!localNotificationsPromise) {
        localNotificationsPromise = import('@capacitor/local-notifications');
    }
    try {
        const { LocalNotifications } = await localNotificationsPromise;
        return LocalNotifications;
    } catch (e) {
        localNotificationsPromise = null;
        if (DEV_MODE) console.warn('getLocalNotifications import', e);
        return null;
    }
}

/**
 * Android: POST_NOTIFICATIONS(granted)와 실제 알림 허용(areNotificationsEnabled)이 모두 true일 때만 통과.
 * 13+에서 런타임 권한은 있는데 설정에서 앱 알림만 끈 경우 checkPermissions만으로는 건너뛰기 되던 문제 방지.
 */
async function androidNotificationsOperational(LocalNotifications) {
    if (!LocalNotifications) return false;
    try {
        const st = await LocalNotifications.checkPermissions();
        if (st.display !== 'granted') return false;
    } catch (e) {
        if (DEV_MODE) console.warn('androidNotificationsOperational checkPermissions', e);
        return false;
    }
    try {
        /* registerPlugin 프록시에 없거나 응답 형식이 다르면 예전엔 true로 빠져 1단계가 통째로 건너뛰어짐 → 보수적으로 false */
        if (typeof LocalNotifications.areEnabled !== 'function') {
            if (DEV_MODE) console.warn('[StudyTimerOsPerm] LocalNotifications.areEnabled 없음 → 1단계 표시');
            return false;
        }
        const en = await LocalNotifications.areEnabled();
        if (en && typeof en.value === 'boolean') {
            return en.value === true;
        }
        if (DEV_MODE) console.warn('[StudyTimerOsPerm] areEnabled 비정상 응답 → 1단계 표시', en);
        return false;
    } catch (e) {
        if (DEV_MODE) console.warn('[StudyTimerOsPerm] areEnabled 예외 → 1단계 표시', e);
        return false;
    }
}

function getStudyTimerForegroundPlugin() {
    return window.Capacitor?.Plugins?.StudyTimerForeground
        ?? window.Capacitor?.registerPlugin?.('StudyTimerForeground');
}

/** Logcat 태그 StudyTimer — WebView console과 달리 필터로 바로 잡힘 */
function studyTimerNativeLog(message) {
    if (!isAndroidNative()) return;
    const P = getStudyTimerForegroundPlugin();
    if (P?.logStudyTimer) {
        void P.logStudyTimer({ message: String(message) }).catch(() => {});
    }
}

async function openAndroidAppNotificationSettingsIfAvailable() {
    const P = getStudyTimerForegroundPlugin();
    if (P?.openAppNotificationSettings) {
        try {
            await P.openAppNotificationSettings();
        } catch (e) {
            if (DEV_MODE) console.warn('openAppNotificationSettings', e);
        }
    }
}

/**
 * Android 13+ POST_NOTIFICATIONS — 네이티브 FGS/완료 알림에 필수. 시스템 권한 창만 띄움(앱 자체 모달 아님).
 */
export async function ensureAndroidPostNotificationsPermission() {
    if (!isAndroidNative()) return;
    const LocalNotifications = await getLocalNotifications();
    if (!LocalNotifications) return;
    try {
        if (await androidNotificationsOperational(LocalNotifications)) return;
        await LocalNotifications.requestPermissions();
    } catch (e) {
        if (DEV_MODE) console.warn('ensureAndroidPostNotificationsPermission', e);
    }
}

/** 메인 진입 시: 목표 시간 켜 둔 과목이 있으면 알림 권한만 선제 확인(토글을 다시 안 한 기존 사용자 대비) */
export async function ensureAndroidNotificationIfUsesTimerSubjects() {
    if (!state.subjects?.some((s) => s.timerEnabled)) return;
    await ensureAndroidPostNotificationsPermission();
}

/** @type {boolean} */
let timerAppResumeListenerRegistered = false;

function registerTimerAppResumeListenerOnce() {
    if (timerAppResumeListenerRegistered || !isNativeCapacitor()) return;
    timerAppResumeListenerRegistered = true;
    void import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) void syncNativeTimerForegroundCompletion();
        }).catch(() => {});
    }).catch(() => {});
}

async function startAndroidForegroundTimer(endAtMs, subjectId) {
    if (!isAndroidNative()) return;
    await ensureAndroidPostNotificationsPermission();
    const P = getStudyTimerForegroundPlugin();
    if (!P?.start) return;
    try {
        await P.start({
            endAtMs: Math.round(endAtMs),
            labelPrefix: i18n.t('timer.foregroundLabel'),
            subjectId: Number(subjectId),
        });
    } catch (e) {
        if (DEV_MODE) console.warn('StudyTimerForeground.start', e);
    }
}

async function stopAndroidForegroundTimer() {
    if (!isAndroidNative()) return;
    const P = getStudyTimerForegroundPlugin();
    if (!P?.stop) return;
    try {
        await P.stop();
    } catch (e) {
        if (DEV_MODE) console.warn('StudyTimerForeground.stop', e);
    }
}

/**
 * 온보딩·설정에서 목표 시간(타이머)을 켤 때 호출.
 * iOS: 알림 요청 후 채널 생성.
 * Android: ① 알림 모달 → 시스템 알림 권한 요청 → ② 알람 및 리마인더 모달(필요 시).
 * 타이머 시작 시에는 `ensureAndroidPostNotificationsPermission()`으로 알림만 한 번 더 맞춥니다.
 */
export async function prepareStudyTimerOsPermissions() {
    if (!isNativeCapacitor()) return;
    try {
        if (isAndroidNative()) {
            studyTimerNativeLog('prepareStudyTimerOsPermissions: android path start');
            await runAndroidPrepareStudyTimerOsPermissions();
        } else {
            const LocalNotifications = await getLocalNotifications();
            if (!LocalNotifications) return;
            await LocalNotifications.requestPermissions();
            await ensureTimerNotificationChannel();
        }
    } catch (e) {
        if (DEV_MODE) console.warn('prepareStudyTimerOsPermissions', e);
    }
}

/**
 * Android: 알림(1단계) 안내 모달 → 시스템 알림 요청 → (선택) 알람 및 리마인더(2단계).
 */
async function runAndroidPrepareStudyTimerOsPermissions() {
    studyTimerNativeLog('runAndroidPrepareStudyTimerOsPermissions: start');
    await promptAndroidNotificationStepFirst();
    await ensureTimerNotificationChannel();
    if (!SKIP_ANDROID_EXACT_ALARM_PROMPT) {
        await promptAndroidExactAlarmIfNeeded();
    }
}

/**
 * 이미 허용됐으면 건너뜀. 아니면 안내 모달 후 "건너뛰기"가 아닐 때 시스템 알림 권한 요청.
 */
async function promptAndroidNotificationStepFirst() {
    const LocalNotifications = await getLocalNotifications();
    if (!LocalNotifications) {
        studyTimerNativeLog('step1: LocalNotifications=null → skip');
        if (DEV_MODE) console.warn('[StudyTimerOsPerm] LocalNotifications 없음 → 1단계 생략');
        return;
    }
    const operational = await androidNotificationsOperational(LocalNotifications);
    studyTimerNativeLog(`step1: androidNotificationsOperational=${operational}`);
    if (operational) {
        if (DEV_MODE) console.warn('[StudyTimerOsPerm] 1단계 생략: 권한·알림 허용으로 판단됨');
        return;
    }
    studyTimerNativeLog('step1: show confirm modal');
    const { showConfirmModal } = await import('./eventHandlers.js');
    const result = await showConfirmModal(
        i18n.t('timer.osPermNotifyTitle'),
        i18n.t('timer.osPermNotifyMessage'),
        [
            { text: i18n.t('timer.osPermNotifySkip'), value: 'skip', className: 'confirm-modal-btn-cancel' },
            { text: i18n.t('timer.osPermNotifyRequest'), value: 'request', className: 'confirm-modal-btn-ok' },
        ],
        { backButtonValue: 'skip' }
    );
    studyTimerNativeLog(`step1: modal result=${String(result)}`);
    if (result === 'skip') {
        studyTimerNativeLog('step1: user skipped');
        return;
    }
    try {
        studyTimerNativeLog('step1: requestPermissions()');
        await LocalNotifications.requestPermissions();
    } catch (e) {
        studyTimerNativeLog(`step1: requestPermissions error ${String(e)}`);
        if (DEV_MODE) console.warn('requestPermissions', e);
    }
    if (!(await androidNotificationsOperational(LocalNotifications))) {
        studyTimerNativeLog('step1: still not operational → openAppNotificationSettings');
        await openAndroidAppNotificationSettingsIfAvailable();
    } else {
        studyTimerNativeLog('step1: operational after request');
    }
}

/**
 * Android 12+ 정확한 알람(알람 및 리마인더). 1단계 알림은 `runAndroidPrepareStudyTimerOsPermissions`에서 처리.
 */
async function promptAndroidExactAlarmIfNeeded() {
    const P = getStudyTimerForegroundPlugin();
    if (!P?.getExactAlarmStatus) return true;
    try {
        const status = await P.getExactAlarmStatus();
        if (!status?.needsCheck || status.canScheduleExactAlarms) return true;
        const { showConfirmModal } = await import('./eventHandlers.js');
        const result = await showConfirmModal(
            i18n.t('timer.exactAlarmTitle'),
            i18n.t('timer.exactAlarmMessage'),
            [
                { text: i18n.t('timer.exactAlarmNotNow'), value: 'cancel', className: 'confirm-modal-btn-cancel' },
                { text: i18n.t('timer.exactAlarmOpenSettings'), value: 'settings', className: 'confirm-modal-btn-ok' },
            ],
            { backButtonValue: 'cancel' }
        );
        if (result === 'cancel') return false;
        if (result === 'settings' && P.openExactAlarmSettings) {
            await P.openExactAlarmSettings();
        }
        return false;
    } catch (e) {
        if (DEV_MODE) console.warn('getExactAlarmStatus', e);
        return true;
    }
}

/**
 * Foreground Service가 먼저 종료를 처리한 경우 WebView UI와 동기화
 */
async function syncNativeTimerForegroundCompletion() {
    if (!isAndroidNative() || !activeTimer || awaitingCompletionTap) return;
    const P = getStudyTimerForegroundPlugin();
    if (!P?.consumePendingIfMatches) return;
    try {
        const r = await P.consumePendingIfMatches({ subjectId: activeTimer.subjectId });
        if (!r?.pending) return;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        await cancelTimerEndNotificationScheduled();
        onTimerComplete(activeTimer.subjectId);
    } catch (e) {
        if (DEV_MODE) console.warn('StudyTimerForeground.consumePendingIfMatches', e);
    }
}

function delayMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function vibrateIfSupported(pattern) {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
        navigator.vibrate(pattern);
    } catch {
        /* 일부 WebView에서 패턴 미지원 시 무시 */
    }
}

/** 네이티브(Capacitor)에서는 @capacitor/haptics, 그 외는 vibrate 패턴 */
async function runTimerFinishedHaptics() {
    if (!isNativeCapacitor()) {
        vibrateIfSupported(VIBRATE_TIMER_FINISHED);
        return;
    }
    try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await delayMs(110);
        await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {
        vibrateIfSupported(VIBRATE_TIMER_FINISHED);
    }
}

async function runIdleReminderHaptics() {
    if (!isNativeCapacitor()) {
        vibrateIfSupported(VIBRATE_IDLE_REMINDER);
        return;
    }
    try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
        vibrateIfSupported(VIBRATE_IDLE_REMINDER);
    }
}

async function ensureTimerNotificationChannel() {
    if (!isNativeCapacitor()) return;
    const LocalNotifications = await getLocalNotifications();
    if (!LocalNotifications) return;
    try {
        await LocalNotifications.createChannel({
            id: TIMER_NOTIFICATION_CHANNEL_ID,
            name: i18n.t('timer.focusMode'),
            importance: 5,
            vibration: true,
        });
    } catch {
        /* 채널 생성 실패 시 기본 채널로 스케줄될 수 있음 */
    }
}

async function cancelTimerEndNotificationScheduled() {
    if (!isNativeCapacitor()) return;
    const LocalNotifications = await getLocalNotifications();
    if (!LocalNotifications) return;
    try {
        await LocalNotifications.cancel({ notifications: [{ id: TIMER_END_NOTIFICATION_ID }] });
    } catch {
        /* ignore */
    }
}

/**
 * WebView 타이머가 백그라운드에서 멈춰도 OS가 종료 시각에 알림·진동
 */
async function scheduleTimerEndNotification(endAtMs) {
    if (isAndroidNative()) return;
    if (!isNativeCapacitor()) return;
    const LocalNotifications = await getLocalNotifications();
    if (!LocalNotifications) return;
    try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
            return;
        }
        await ensureTimerNotificationChannel();
        const at = Math.max(Date.now() + 1500, endAtMs);
        await LocalNotifications.cancel({ notifications: [{ id: TIMER_END_NOTIFICATION_ID }] });
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: TIMER_END_NOTIFICATION_ID,
                    title: i18n.t('timer.studyDone'),
                    body: i18n.t('timer.tapToComplete'),
                    channelId: TIMER_NOTIFICATION_CHANNEL_ID,
                    schedule: { at: new Date(at), allowWhileIdle: true },
                },
            ],
        });
    } catch (e) {
        if (DEV_MODE) console.warn('scheduleTimerEndNotification', e);
    }
}

function clearIdleCompletionReminders() {
    idleCompletionReminderTimers.forEach((id) => clearTimeout(id));
    idleCompletionReminderTimers = [];
}

function scheduleIdleCompletionReminders() {
    clearIdleCompletionReminders();
    const vibrateOnce = () => {
        if (!isTimerRunning || !activeTimer) return;
        void runIdleReminderHaptics();
    };
    idleCompletionReminderTimers.push(
        setTimeout(vibrateOnce, IDLE_COMPLETION_REMINDER_MS)
    );
    idleCompletionReminderTimers.push(
        setTimeout(vibrateOnce, IDLE_COMPLETION_REMINDER_MS * 2)
    );
}

/**
 * 타이머 시작
 */
export async function startTimer(subjectId) {
    if (isTimerRunning) {
        return false;
    }
    
    const subject = findSubject(subjectId);
    if (!subject || !subject.timerEnabled) {
        return false;
    }
    
    const targetMinutes = subject.timerMinutes || 25;
    const targetMs = targetMinutes * 60 * 1000;
    
    timerStartTime = Date.now();
    isTimerRunning = true;
    awaitingCompletionTap = false;
    activeTimer = {
        subjectId: Number(subjectId),
        targetMs: targetMs,
        startTime: timerStartTime
    };

    registerTimerAppResumeListenerOnce();

    // Wake Lock 요청 (카운트다운 구간에만 유지; 탭 완료 대기에서는 해제)
    await requestWakeLock();
    
    // 화면 dim 처리 (Android: 하단/상단바 숨김)
    dimScreen(subjectId);
    
    // 카운트다운 표시
    updateTimerDisplay(subjectId, targetMs);
    
    // 게이지 업데이트 시작
    startTimerInterval(subjectId);

    if (isAndroidNative()) {
        await stopAndroidForegroundTimer();
        await startAndroidForegroundTimer(timerStartTime + targetMs, subjectId);
    } else {
        await scheduleTimerEndNotification(timerStartTime + targetMs);
    }

    return true;
}

/**
 * 타이머 중지
 */
export function stopTimer(cancel = false) {
    clearIdleCompletionReminders();
    void cancelTimerEndNotificationScheduled();
    void stopAndroidForegroundTimer();
    if (!isTimerRunning && !activeTimer) return;

    clearInterval(timerInterval);
    timerInterval = null;

    awaitingCompletionTap = false;
    void releaseWakeLock();

    if (activeTimer) {
        const subjectId = activeTimer.subjectId;
        clearTimerDisplay(subjectId);
        undimScreen();
        activeTimer = null;
    }

    isTimerRunning = false;
    isPaused = false;
    timerStartTime = null;
}

/**
 * 타이머 완료 처리
 */
export async function completeTimer() {
    if (!isTimerRunning || !activeTimer) {
        return;
    }
    
    const subjectId = activeTimer.subjectId;
    
    // 공부 완료 처리
    const date = state.currentDate;
    toggleSubject(subjectId, date);
    saveData();
    
    // 타이머 중지
    stopTimer();
}

/**
 * 타이머 일시정지
 */
function pauseTimer() {
    if (!activeTimer || isPaused) return;
    void cancelTimerEndNotificationScheduled();
    void stopAndroidForegroundTimer();
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    const elapsed = Date.now() - timerStartTime;
    activeTimer.elapsedAtPause = elapsed;
    isPaused = true;
}

/**
 * 타이머 재개
 */
function resumeTimer() {
    if (!activeTimer || !isPaused) return;
    const elapsed = activeTimer.elapsedAtPause || 0;
    timerStartTime = Date.now() - elapsed;
    isPaused = false;
    startTimerInterval(activeTimer.subjectId);
    if (isAndroidNative()) {
        void startAndroidForegroundTimer(timerStartTime + activeTimer.targetMs, activeTimer.subjectId);
    } else {
        void scheduleTimerEndNotification(timerStartTime + activeTimer.targetMs);
    }
}

/**
 * remainingMs → { minutes, seconds } 분해 헬퍼
 */
function splitRemainingMs(remainingMs) {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    return { minutes: Math.floor(totalSeconds / 60), seconds: totalSeconds % 60 };
}

/**
 * 남은 시간 포맷 (MM:SS) — 카운트다운 표시용
 */
function formatRemaining(remainingMs) {
    const { minutes, seconds } = splitRemainingMs(remainingMs);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 남은 시간 포맷 (24분 58초) — 확인 팝업 메시지용
 */
function formatRemainingLong(remainingMs) {
    const { minutes, seconds } = splitRemainingMs(remainingMs);
    const m = i18n.t('timer.minutes');
    const s = i18n.t('timer.seconds');
    return `${minutes}${m} ${seconds}${s}`;
}

/**
 * 타이머 진행 중 탭 처리 — 일시정지 후 확인 팝업
 * 팝업이 떠 있는 동안 시간이 흐르지 않도록 먼저 일시정지
 */
export async function handleTimerTap() {
    if (!isTimerRunning || !activeTimer) {
        return;
    }
    if (isPaused) {
        return;
    }
    
    const subjectId = activeTimer.subjectId;
    const elapsed = Date.now() - timerStartTime;
    const targetMs = activeTimer.targetMs;
    const remaining = targetMs - elapsed;
    
    if (remaining <= 0) {
        await completeTimer();
        const { renderMainView } = await import('./ui.js');
        renderMainView();
        restoreMainScrollAfterTimerExit();
        return;
    }
    
    pauseTimer();
    
    const timeStr = formatRemainingLong(remaining);
    const message = `${i18n.t('timer.timeLeftPrompt')}\n⏱️ ${timeStr} ${i18n.t('timer.timeLeftSuffix')}`;
    
    const { showConfirmModal } = await import('./eventHandlers.js');
    const result = await showConfirmModal(
        i18n.t('modal.title.confirm'),
        message,
        [
            { text: i18n.t('timer.continueStudy'), value: 'continue' },
            { text: i18n.t('timer.studyDone'), value: 'complete' },
            { text: i18n.t('timer.startOver'), value: 'restart' },
            { text: i18n.t('timer.quit'), value: 'quit' }
        ],
        { backButtonValue: 'continue' }
    );
    
    const savedSubjectId = activeTimer ? activeTimer.subjectId : null;
    
    if (result === 'complete') {
        await completeTimer();
        const { renderMainView } = await import('./ui.js');
        renderMainView();
        restoreMainScrollAfterTimerExit();
    } else if (result === 'restart') {
        stopTimer(true);
        if (savedSubjectId != null) {
            await startTimer(savedSubjectId);
        }
    } else if (result === 'quit') {
        stopTimer(true);
        const { updateMainViewSubjects } = await import('./eventHandlers.js');
        await updateMainViewSubjects();
        restoreMainScrollAfterTimerExit();
    } else if (result === 'continue') {
        resumeTimer();
    }
}

/**
 * 과목 찾기 (타이머 설정은 state.subjects 기준)
 */
function findSubject(subjectId) {
    const numericId = Number(subjectId);
    return state.subjects.find(s => Number(s.id) === numericId);
}

/**
 * Wake Lock 요청
 */
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch (err) {
        if (DEV_MODE) console.warn('Wake Lock 불가:', err);
    }
}

/**
 * Wake Lock 해제
 */
async function releaseWakeLock() {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (!wakeLock) return;
    try {
        await wakeLock.release();
    } catch (err) {
        if (DEV_MODE) console.warn('Wake Lock 해제 실패:', err);
    } finally {
        wakeLock = null;
    }
}

/**
 * visibility 변경 처리
 */
async function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') return;

    await syncNativeTimerForegroundCompletion();

    /* 백그라운드에서 시간만 흐르고 setInterval이 멈췄다가 복귀 시 보정 */
    if (isTimerRunning && activeTimer && !isPaused && !awaitingCompletionTap) {
        const elapsed = Date.now() - timerStartTime;
        if (elapsed >= activeTimer.targetMs) {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            void cancelTimerEndNotificationScheduled();
            onTimerComplete(activeTimer.subjectId);
            return;
        }
    }

    // 탭 완료 대기 중에는 락 재요청 금지 (집중 모드 종료 후 화면이 계속 켜지는 현상 방지)
    if (!isTimerRunning || !activeTimer || isPaused || awaitingCompletionTap) return;

    const elapsedVisible = Date.now() - timerStartTime;
    updateTimerDisplay(activeTimer.subjectId, activeTimer.targetMs, elapsedVisible);

    await releaseWakeLock();
    await requestWakeLock();
}

/**
 * 화면 dim 처리 — 전체 어둡게, 활성 카드만 게이지·시간 포커스
 * Android: 집중 모드 진입 시 하단/상단 네비바 숨김
 * 라벨을 카드 밖으로 이동해 overflow:hidden으로 게이지 클리핑이 가능하도록 함
 */
function dimScreen(subjectId) {
    const sc = getMainScrollContentEl();
    if (utils.usesMainAppDocumentScroll()) {
        mainScrollTopBeforeTimer = window.scrollY ?? document.documentElement.scrollTop ?? 0;
    } else if (sc) {
        mainScrollTopBeforeTimer = sc.scrollTop;
    }
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.classList.add('timer-active');
    }
    
    const sid = Number(subjectId);
    const cards = document.querySelectorAll('.subject-card');
    cards.forEach(card => {
        const cardSubjectId = Number(card.dataset.subjectId);
        if (cardSubjectId !== sid) {
            card.classList.add('dimmed');
        } else {
            card.classList.add('timer-focus');
            // 라벨을 카드 밖으로 이동 (overflow:hidden 시에도 보이도록)
            const label = card.querySelector('.timer-focus-label');
            if (label && label.parentNode === card) {
                const wrapper = document.createElement('div');
                wrapper.className = 'timer-focus-wrapper';
                card.parentNode.insertBefore(wrapper, card);
                wrapper.appendChild(label);
                wrapper.appendChild(card);
            }
        }
    });
}

/**
 * 화면 dim 해제
 */
function undimScreen() {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.classList.remove('timer-active');
    }
    
    // timer-focus-wrapper 정리: 라벨을 카드 안으로 되돌리고 래퍼 제거
    document.querySelectorAll('.timer-focus-wrapper').forEach(wrapper => {
        const label = wrapper.querySelector('.timer-focus-label');
        const card = wrapper.querySelector('.subject-card');
        if (label && card) {
            card.insertBefore(label, card.firstChild);
        }
        wrapper.parentNode.insertBefore(card, wrapper);
        wrapper.remove();
    });
    
    document.querySelectorAll('.subject-card').forEach(card => {
        card.classList.remove('dimmed', 'timer-complete', 'timer-focus');
    });
}

/**
 * 타이머 인터벌 시작
 */
function startTimerInterval(subjectId) {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    timerInterval = setInterval(() => {
        // 일시정지 중이면 tick 스킵
        if (isPaused) return;

        // 비정상 상태면 interval 정리
        if (!isTimerRunning || !activeTimer) {
            clearInterval(timerInterval);
            timerInterval = null;
            return;
        }

        const elapsed = Date.now() - timerStartTime;
        const targetMs = activeTimer.targetMs;
        const remaining = targetMs - elapsed;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            onTimerComplete(subjectId);
        } else {
            updateTimerDisplay(subjectId, targetMs, elapsed);
            updateTimerGauge(subjectId, elapsed, targetMs);
        }
    }, 1000);
}

/**
 * 타이머 완료 처리
 */
function onTimerComplete(subjectId) {
    if (!activeTimer || Number(activeTimer.subjectId) !== Number(subjectId)) {
        return;
    }
    if (awaitingCompletionTap) {
        return;
    }
    void stopAndroidForegroundTimer();
    void cancelTimerEndNotificationScheduled();
    awaitingCompletionTap = true;
    void releaseWakeLock();

    const card = document.querySelector(`.subject-card[data-subject-id="${subjectId}"]`);
    if (card) {
        card.classList.add('timer-complete');
        card.style.setProperty('--fill-width', '100%');
    }
    
    void runTimerFinishedHaptics();

    // "탭하여 완료" 표시
    const tapComplete = document.querySelector(`.timer-tap-complete[data-subject-id="${subjectId}"]`);
    if (tapComplete) {
        tapComplete.style.display = 'block';
    }
    
    // 카운트다운 숨기기
    const countdown = document.querySelector(`.timer-countdown[data-subject-id="${subjectId}"]`);
    if (countdown) {
        countdown.style.display = 'none';
    }

    scheduleIdleCompletionReminders();
}

/**
 * 타이머 표시 업데이트
 */
function updateTimerDisplay(subjectId, targetMs, elapsed = null) {
    if (elapsed === null) elapsed = Date.now() - timerStartTime;

    const remaining = Math.max(0, targetMs - elapsed);
    const countdown = document.querySelector(`.timer-countdown[data-subject-id="${subjectId}"]`);
    if (countdown) {
        countdown.textContent = formatRemaining(remaining);
        countdown.style.display = 'block';
    }
}

/**
 * 타이머 게이지 업데이트
 */
function updateTimerGauge(subjectId, elapsed, targetMs) {
    const percentage = Math.min(100, (elapsed / targetMs) * 100);
    const card = document.querySelector(`.subject-card[data-subject-id="${subjectId}"]`);
    if (card) {
        card.style.setProperty('--fill-width', `${percentage}%`);
    }
}

/**
 * 타이머 표시 초기화
 */
function clearTimerDisplay(subjectId) {
    const countdown = document.querySelector(`.timer-countdown[data-subject-id="${subjectId}"]`);
    if (countdown) {
        countdown.style.display = 'none';
    }
    
    const tapComplete = document.querySelector(`.timer-tap-complete[data-subject-id="${subjectId}"]`);
    if (tapComplete) {
        tapComplete.style.display = 'none';
    }
    
    const card = document.querySelector(`.subject-card[data-subject-id="${subjectId}"]`);
    if (card) {
        card.style.setProperty('--fill-width', '0%');
    }
}

/**
 * 타이머 실행 중인지 확인
 */
export function isTimerActive() {
    return isTimerRunning;
}

/**
 * 현재 활성 타이머의 과목 ID 반환
 */
export function getActiveTimerSubjectId() {
    return activeTimer ? activeTimer.subjectId : null;
}
