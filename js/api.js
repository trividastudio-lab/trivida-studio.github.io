import { state, DEFAULT_MAX_SUBJECTS } from './state.js';
import { resources } from './languages.js';
import { logDevWarning } from './utils.js';

const STORAGE_KEY = 'studyAllowanceAppData';

// 상수 정의 (state.js와 일치)
const DEFAULT_GOAL_DAYS = 25;
const DEFAULT_GOAL_BONUS = 10000;
const DEFAULT_REST_CONSTANT = 6;

// 기본값은 resources에서 가져오기
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_COUNTRY = 'US';

function createDataObject() {
    try {
        const settings = state.settings || {};
        // 저장 시에는 notification 관련 필드와 currency 전체는 제외하고,
        // 목표/휴식/글자 크기처럼 "사용자 선택이 중요한 최소 설정값"만 저장한다.
        const {
            notificationEnabled,
            notificationHour,
            notificationMinute,
            currency,
            ...restSettings
        } = settings;

        const settingsToSave = {
            goalDays: restSettings.goalDays,
            goalBonus: restSettings.goalBonus,
            restConstant: restSettings.restConstant,
            fontSizeScale: restSettings.fontSizeScale
        };
        return {
            isInitialized: state.isInitialized || false,
            onboardingCompleted: state.onboardingCompleted || false,
            schemaVersion: state.schemaVersion || '1.0',
            user: state.user || {},
            subjects: Array.isArray(state.subjects) ? state.subjects : [],
            settings: settingsToSave,
            records: state.records || {},
            ledger: state.ledger || { month: {} }
        };
    } catch (error) {
        logDevWarning('데이터 생성 실패', error);
        return {
            isInitialized: false,
            onboardingCompleted: false,
            schemaVersion: '1.0',
            user: {},
            subjects: [],
            settings: {},
            records: {},
            ledger: { month: {} }
        };
    }
}

export function loadData() {
    try {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (!savedData) {
            return;
        }
        
        const data = JSON.parse(savedData);
        
        if (!data || typeof data !== 'object') {
            return;
        }

        // 스키마 버전 불일치 시 경고 (마이그레이션 필요할 수 있음)
        if (data.schemaVersion && data.schemaVersion !== state.schemaVersion) {
            logDevWarning(`스키마 버전 불일치: 저장=${data.schemaVersion}, 현재=${state.schemaVersion}`);
        }

        state.isInitialized = data.isInitialized === true;
        state.onboardingCompleted = data.onboardingCompleted === true;
        state.schemaVersion = data.schemaVersion || state.schemaVersion;
        
        if (data.user && typeof data.user === 'object') {
            try {
                const userLanguage = data.user.language || DEFAULT_LOCALE;
                const userCountry = data.user.country || resources.localeToCountry?.[userLanguage] || DEFAULT_COUNTRY;
                
                state.user = {
                    name: String(data.user.name || ''),
                    language: userLanguage,
                    country: userCountry
                };
            } catch (error) {
                logDevWarning('user 데이터 로드 실패', error);
                state.user = {
                    name: '',
                    language: DEFAULT_LOCALE,
                    country: DEFAULT_COUNTRY
                };
            }
        }
        
        if (data.subjects && Array.isArray(data.subjects)) {
            state.subjects = data.subjects;
        }
        
        if (data.settings && typeof data.settings === 'object') {
            try {
                const langCode = data.user?.language || DEFAULT_LOCALE;
                const countryCode = state.user?.country || resources.localeToCountry?.[langCode] || DEFAULT_COUNTRY;
                const countryData = resources.countries?.[countryCode] || resources.countries?.[DEFAULT_COUNTRY];
                
                const defaultBonus = countryData?.defaultBonus || DEFAULT_GOAL_BONUS;
                
                const defaultCurrency = countryData?.currency || resources.countries?.[DEFAULT_COUNTRY]?.currency;
                // 글자 크기: 없거나 유효하지 않으면 기본 3단계 (과거 백업 파일 호환)
                const rawScale = data.settings.fontSizeScale;
                const numScale = Number(rawScale);
                const fontSizeScale = (rawScale !== undefined && rawScale !== null && !Number.isNaN(numScale) && numScale >= 1 && numScale <= 5)
                    ? numScale
                    : 3;
                state.settings = {
                    goalDays: Number(data.settings.goalDays) || DEFAULT_GOAL_DAYS,
                    goalBonus: (data.settings.goalBonus !== undefined && data.settings.goalBonus !== null && data.settings.goalBonus !== 0)
                        ? Number(data.settings.goalBonus)
                        : defaultBonus,
                    restConstant: Number(data.settings.restConstant) || DEFAULT_REST_CONSTANT,
                    currency: data.settings.currency || defaultCurrency,
                    fontSizeScale
                };
            } catch (error) {
                logDevWarning('settings 데이터 로드 실패', error);
            }
        }
        
        if (data.records && typeof data.records === 'object') {
            state.records = data.records;
        }
        
        if (data.ledger && typeof data.ledger === 'object') {
            state.ledger = data.ledger;
        }
        
        // 날짜는 항상 현재 시간으로 초기화 (저장된 날짜는 사용하지 않음)
        state.currentDate = new Date();
        state.calendarDate = new Date();
    } catch (error) {
        logDevWarning('데이터 로드 실패', error);
        if (error instanceof SyntaxError) {
            // JSON 파싱 오류 - 손상된 데이터
            localStorage.removeItem(STORAGE_KEY);
        }
    }
}

export async function saveData() {
    try {
        const dataToSave = createDataObject();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            // 저장 공간 부족 - 사용자에게 알림
            try {
                const [{ showAlertModal }, { i18n }] = await Promise.all([
                    import('./eventHandlers.js'),
                    import('./languages.js')
                ]);
                await showAlertModal(
                    i18n.t('modal.title.error'),
                    i18n.t('api.error.storageFull')
                );
            } catch (modalError) {
                logDevWarning('모달 표시 실패', modalError);
            }
        } else if (error.name === 'SecurityError') {
            // 보안 오류 (예: 사설 브라우징 모드)
            logDevWarning('localStorage 접근 불가 (보안 제한)', error);
        } else {
            logDevWarning('데이터 저장 실패', error);
        }
    }
}

export async function exportDataToFile() {
    // i18n과 showAlertModal을 함수 초입에 한 번만 import (병렬 로드)
    const [{ i18n }, { showAlertModal }] = await Promise.all([
        import('./languages.js'),
        import('./eventHandlers.js')
    ]);

    try {
        const dataToExport = createDataObject();
        const dataStr = JSON.stringify(dataToExport, null, 2);

        const userName = state.user.name || i18n.t('api.user.default');
        const sanitizedUserName = userName.replace(/[\/\\:*?"<>|]/g, '_').trim() || 'user';
        const now = new Date();
        const year   = String(now.getFullYear());
        const month  = String(now.getMonth() + 1).padStart(2, '0');
        const day    = String(now.getDate()).padStart(2, '0');
        const hours  = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const filename = `SA_${sanitizedUserName}_${year}${month}${day}_${hours}${minutes}.json`;

        let isNative = false;
        let Capacitor = null;

        try {
            if (window.Capacitor) {
                Capacitor = window.Capacitor;
                isNative = Capacitor.isNativePlatform();
            }
        } catch (e) {
            logDevWarning('Capacitor 접근 실패', e);
        }

        if (isNative) {
            try {
                const Filesystem = Capacitor.Plugins.Filesystem;

                if (!Filesystem) {
                    throw new Error('Filesystem plugin not available');
                }

                const result = await Filesystem.writeFile({
                    path: filename,
                    data: dataStr,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });

                let successMessage = `${i18n.t('api.export.success')}\n\n📁 ${filename}\n\n`;
                successMessage += result.uri
                    ? `${i18n.t('api.export.location')}\n${result.uri}`
                    : i18n.t('api.export.savedToDocuments');

                showAlertModal(i18n.t('modal.title.success'), successMessage);
                return;

            } catch (nativeError) {
                await showAlertModal(
                    i18n.t('modal.title.error'),
                    `${i18n.t('api.error.exportFailed')}\n\n${nativeError.message || String(nativeError)}`
                );
                return;
            }
        }

        const blob = new Blob([dataStr], { type: 'application/json' });

        if (navigator.share) {
            try {
                const file = new File([blob], filename, { type: 'application/json' });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: i18n.t('api.export.title'),
                        text:  i18n.t('api.export.text')
                    });
                    return;
                }
            } catch (shareError) {
                if (shareError.name !== 'AbortError') {
                    // Web Share 실패 - 폴백으로 진행
                }
            }
        }

        fallbackDownload(blob, filename);

    } catch (error) {
        try {
            await showAlertModal(
                i18n.t('modal.title.error'),
                `${i18n.t('api.error.exportFailed')}\n\n${error.message || String(error)}`
            );
        } catch (modalError) {
            logDevWarning('모달 표시 실패', modalError);
        }
    }
}
function fallbackDownload(blob, filename) {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        if (!document.body) {
            URL.revokeObjectURL(url);
            return;
        }
        
        document.body.appendChild(a);
        
        setTimeout(() => {
            try {
                a.click();
            } catch (clickError) {
                logDevWarning('클릭 처리 실패', clickError);
            }
            
            if (a.parentNode) {
                document.body.removeChild(a);
            }
            
            setTimeout(() => {
                try {
                    URL.revokeObjectURL(url);
                } catch (revokeError) {
                    logDevWarning('URL 해제 실패', revokeError);
                }
            }, 100);
        }, 0);
    } catch (error) {
        logDevWarning('다운로드 실패', error);
    }
}

/**
 * FileReader를 Promise로 래핑하는 헬퍼
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result);
        reader.onerror = ()  => reject(new Error('Failed to read the file. Please try again.'));
        reader.onabort = ()  => reject(new Error('File reading was aborted.'));
        try {
            reader.readAsText(file, 'utf-8');
        } catch (e) {
            reject(new Error(`Failed to start reading the file: ${e.message || String(e)}`));
        }
    });
}

/**
 * 과목 확장 미구매 시 백업에서 앞쪽 5개 과목만 유지하고, 나머지 과목 관련 기록을 제거한다.
 * @param {object} data - import JSON (변형됨)
 * @returns {boolean} 과목을 잘랐으면 true
 */
function clampImportedSubjectsForFreeExpansion(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.subjects) || data.subjects.length <= DEFAULT_MAX_SUBJECTS) {
        return false;
    }

    const keptSubjects = data.subjects.slice(0, DEFAULT_MAX_SUBJECTS);
    const allowedIds = new Set(keptSubjects.map((s) => Number(s.id)));

    data.subjects = keptSubjects;

    if (data.records && typeof data.records === 'object') {
        const dateKeys = Object.keys(data.records);
        for (let i = 0; i < dateKeys.length; i++) {
            const day = data.records[dateKeys[i]];
            if (!day || typeof day !== 'object') continue;
            const keys = Object.keys(day);
            for (let j = 0; j < keys.length; j++) {
                const k = keys[j];
                const idNum = Number(k);
                if (Number.isNaN(idNum) || !allowedIds.has(idNum)) {
                    delete day[k];
                }
            }
        }
    }

    if (data.ledger?.month && typeof data.ledger.month === 'object') {
        const monthKeys = Object.keys(data.ledger.month);
        for (let i = 0; i < monthKeys.length; i++) {
            const monthLedger = data.ledger.month[monthKeys[i]];
            if (!monthLedger || typeof monthLedger !== 'object') continue;
            if (Array.isArray(monthLedger.subjects)) {
                monthLedger.subjects = monthLedger.subjects.filter(
                    (s) => s && allowedIds.has(Number(s.id))
                );
            }
        }
    }

    return true;
}

/**
 * Android: 네이티브 파일 선택기(시스템이 허용하면 Documents에서 열림 — patches/@capawesome+capacitor-file-picker).
 * @returns {Promise<{ ok: true, file: File } | { ok: false, reason: 'cancelled' } | { ok: false, reason: 'use-web' }>}
 */
export async function pickDataBackupFileAndroid() {
    const Cap = window.Capacitor;
    if (!Cap?.isNativePlatform?.() || Cap.getPlatform() !== 'android') {
        return { ok: false, reason: 'use-web' };
    }
    const FilePicker = Cap.Plugins?.FilePicker
        ?? (typeof Cap.registerPlugin === 'function' ? Cap.registerPlugin('FilePicker') : null);
    if (!FilePicker?.pickFiles) {
        return { ok: false, reason: 'use-web' };
    }
    try {
        await FilePicker.requestPermissions?.().catch(() => {});
    } catch (_) {}
    let result;
    try {
        result = await FilePicker.pickFiles({ limit: 1 });
    } catch (e) {
        const msg = String(e?.message ?? e);
        if (/canceled|cancelled/i.test(msg)) return { ok: false, reason: 'cancelled' };
        throw e;
    }
    const picked = result?.files?.[0];
    if (!picked?.path) return { ok: false, reason: 'cancelled' };
    const url = Cap.convertFileSrc(picked.path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to read file (${res.status})`);
    const blob = await res.blob();
    const name = picked.name || 'backup.json';
    const file = new File([blob], name, { type: picked.mimeType || 'application/json' });
    return { ok: true, file };
}

/**
 * @returns {Promise<{ success: true, expansionSubjectsClamped: boolean }>}
 */
export async function importDataFromFile(file) {
    if (!file || (!(file instanceof File) && !(file instanceof Blob))) {
        throw new Error('Invalid file object.');
    }

    const text = await readFileAsText(file);

    let importedData;
    try {
        importedData = JSON.parse(text);
    } catch {
        throw new Error("Failed to parse the file. Please check if it's a valid JSON file.");
    }

    if (!importedData || typeof importedData !== 'object') {
        throw new Error('Invalid or corrupted data file. File is not a valid JSON object.');
    }
    if (!importedData.user || typeof importedData.user !== 'object') {
        throw new Error("Invalid or corrupted data file. Missing required 'user' field.");
    }
    if (!importedData.settings || typeof importedData.settings !== 'object') {
        throw new Error("Invalid or corrupted data file. Missing required 'settings' field.");
    }

    let expansionSubjectsClamped = false;
    if (!state.isPurchasedExpansion) {
        expansionSubjectsClamped = clampImportedSubjectsForFreeExpansion(importedData);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(importedData));
    loadData();
    return { success: true, expansionSubjectsClamped };
}