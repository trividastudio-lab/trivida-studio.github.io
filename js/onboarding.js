import { i18n, resources, languages } from './languages.js';
import { state, MIN_GOAL_DAYS } from './state.js';
import { saveData, importDataFromFile, pickDataBackupFileAndroid } from './api.js';
import { showAlertModal, STUDY_EXPANSION_SUBJECT_ADDED_EVENT } from './eventHandlers.js';
import { prepareStudyTimerOsPermissions } from './timer.js';
import { logDevWarning, normalizeNumericInput, formatCurrency } from './utils.js';
import { getLocaleByLanguage, localeOptions, getLocalesByCountry, getLanguageMapping } from './locales.js';

/**
 * #appContainer를 display:flex로 켠 직후 같은 틱에서 startApp()을 호출하면,
 * Android WebView에서 .scroll-content(flex:1·min-height:0) 높이가 아직 잡히지 않아 스크롤/드래그가 되지 않는 경우가 있음.
 * 첫 프레임 레이아웃 이후에 콜백을 실행한다.
 */
function runWhenMainShellLaidOut(callback) {
    if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
        callback();
        return;
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            callback();
        });
    });
}

// --- DOM 요소 관리 ---
const elements = {
    // 온보딩 화면의 최상위 컨테이너
    onboardingView: document.getElementById('onboardingView'),
    // 메인 앱 컨테이너
    appContainer: document.getElementById('appContainer'),
    
    // 각 단계별 요소들
    steps: {
        step1: document.getElementById('onboardingStep1'),
        step2: document.getElementById('onboardingStep2'),
        step3: document.getElementById('onboardingStep3'),
        step4: document.getElementById('onboardingStep4'),
        step5: document.getElementById('onboardingStep5'),
        step6: document.getElementById('onboardingStep6'),
        step8: document.getElementById('onboardingStep8')
    },
    
    // 1단계: 언어 선택
    languageTitle: document.getElementById('languageTitle'),
    languageDetected: document.getElementById('languageDetected'),
    languageSubtitle: document.getElementById('languageSubtitle'),
    languageSelector: document.getElementById('onboardingLanguageSelector'),
    languageNextBtn: document.getElementById('languageNextBtn'),
    loadDataBtn: document.getElementById('onboardingLoadDataBtn'),
    
    // 2단계: 환영 가이드
    welcomeTitle: document.getElementById('welcomeTitle'),
    welcomeMessage: document.getElementById('welcomeMessage'),
    welcomeNextBtn: document.getElementById('welcomeNextBtn'),
    welcomeQuickStartBtn: document.getElementById('welcomeQuickStartBtn'),
    
    // 3단계: 이름 입력
    nameTitle: document.getElementById('nameTitle'),
    nameDesc: document.getElementById('nameDesc'),
    nameInput: document.getElementById('onboardingNameInput'),
    nameError: document.getElementById('nameError'),
    nameNextBtn: document.getElementById('nameNextBtn'),
    
    // 5단계: 과목 설정
    onboardingSubjectsTitle: document.getElementById('onboardingSubjectsTitle'),
    onboardingSubjectsDescription: document.getElementById('onboardingSubjectsDescription'),
    onboardingSubjectsList: document.getElementById('onboardingSubjectsList'),
    onboardingAddSubjectBtn: document.getElementById('onboardingAddSubjectBtn'),
    onboardingSubjectsNextBtn: document.getElementById('onboardingSubjectsNextBtn'),
    
    // 6단계: 이달의 목표 설정
    onboardingGoalTitle: document.getElementById('onboardingGoalTitle'),
    onboardingGoalSubtitle: document.getElementById('onboardingGoalSubtitle'),
    onboardingTargetDaysInput: document.getElementById('onboardingTargetDaysInput'),
    onboardingBonusAmountInput: document.getElementById('onboardingBonusAmountInput'),
    onboardingGoalDaysLabel: document.getElementById('onboardingGoalDaysLabel'),
    onboardingGoalBonusLabel: document.getElementById('onboardingGoalBonusLabel'),
    onboardingGoalInfo: document.getElementById('onboardingGoalInfo'),
    onboardingGoalNextBtn: document.getElementById('onboardingGoalNextBtn'),
    
    // 8단계: 완료
    completeTitle: document.getElementById('completeTitle'),
    completeMessage: document.getElementById('completeMessage'),
    completeStartBtn: document.getElementById('completeStartBtn')
};

// 현재 온보딩 단계
let currentStep = 1;
// 온보딩 완료 후 실행할 콜백
let onboardingCompleteCallback = null;
// 언어 변경 여부 추적
let languageChanged = false;
// 과목 설정이 사용자에 의해 수정되었는지 추적
let subjectsModified = false;
// 데이터 불러오기 중복 실행 방지
let isLoadingData = false;

/**
 * 온보딩 단계를 전환하는 함수
 * @param {number} step - 이동할 단계 (1-8)
 * @param {boolean} skipHistory - history 상태 저장을 건너뛸지 여부 (뒤로가기 처리 시 true)
 */
function showStep(step, skipHistory = false) {
    // 모든 단계 숨기기
    Object.values(elements.steps).forEach(stepEl => {
        stepEl.classList.remove('active');
    });
    
    // 현재 단계 표시
    elements.steps[`step${step}`].classList.add('active');
    currentStep = step;
    
    // history 상태 저장 (뒤로가기 처리를 위해)
    if (!skipHistory && step > 1) {
        history.pushState({ onboardingStep: step }, '');
    } else if (!skipHistory && step === 1) {
        // 첫 번째 단계로 이동할 때는 replaceState 사용
        history.replaceState({ onboardingStep: 1 }, '');
    }
}

/**
 * 언어 선택 드롭다운을 채우는 함수
 * localeOptions의 모든 언어를 표시하며, 한 국가에 여러 언어가 있는 경우도 모두 표시
 */
async function populateLanguageSelector() {
    if (!elements.languageSelector) {
        return;
    }

    // localeOptions에서 언어 목록 생성
    const availableLocales = [];
    localeOptions.forEach(locale => {
        const langCode = locale.language;
        // languages.js에 직접 있거나 매핑된 언어가 있는 경우
        const mappedLang = getLanguageMapping(langCode);
        if (languages[mappedLang] || languages[langCode]) {
            // 같은 국가-언어 조합이 이미 추가되지 않았는지 확인
            const exists = availableLocales.some(l => 
                l.country === locale.country && l.language === locale.language
            );
            if (!exists) {
                availableLocales.push({
                    ...locale,
                    mappedLanguage: languages[mappedLang] ? mappedLang : langCode
                });
            }
        }
    });
    
    // 언어를 정렬하여 표시 (국가별로 그룹화)
    const sortedLocales = availableLocales.sort((a, b) => {
        // 먼저 국가 코드로 정렬
        if (a.country !== b.country) {
            return a.country.localeCompare(b.country);
        }
        // 같은 국가 내에서는 언어 이름으로 정렬
        return a.languageName.localeCompare(b.languageName);
    });
    
    // 각 국가 언어별로 현지화된 국가명을 가져오기 위한 캐시
    const displayNamesCache = {};
    const getLocalizedCountryName = (locale) => {
        const langForDisplay = locale.language || 'en';
        if (!displayNamesCache[langForDisplay]) {
            try {
                displayNamesCache[langForDisplay] = new Intl.DisplayNames([langForDisplay], { type: 'region' });
            } catch (e) {
                displayNamesCache[langForDisplay] = null;
            }
        }
        const dn = displayNamesCache[langForDisplay];
        return dn?.of(locale.country) || locale.countryName || locale.country;
    };

    elements.languageSelector.innerHTML = sortedLocales.map(locale => {
        const flag = locale.flag || '';
        // 각 국가 언어로 현지화된 국가명 (폴백: locale 정의값)
        const localizedCountryName = getLocalizedCountryName(locale);
        const languageName = locale.languageName || locale.language;
        
        // 매핑된 언어 코드 사용 (languages.js에 있는 키)
        const mappedLang = locale.mappedLanguage || locale.language;
        
        // 국가 코드와 언어 코드를 조합한 고유한 값 사용 (같은 언어라도 국가별로 구분)
        // 형식: "국가코드-언어코드" (예: "DE-de", "AT-de", "US-en-US")
        const value = `${locale.country}-${mappedLang}`;
        
        // data 속성으로 국가 정보도 저장 (추가 참조용)
        // 형식: {flag} {countryName} ({languageName})
        return `<option value="${value}" data-country="${locale.country}" data-language="${mappedLang}">${flag} ${localizedCountryName} (${languageName})</option>`;
    }).join('');
}

/**
 * 국가 코드와 힌트 언어로 최적의 locale을 반환하는 헬퍼
 * @param {string} countryCode - 국가 코드 (예: "KR")
 * @param {string} hintLang - 브라우저 언어 힌트 (예: "en-US")
 * @returns {{language: string, country: string, locale: object}|null}
 */
function resolveLocaleForCountry(countryCode, hintLang) {
    const countryLocales = getLocalesByCountry(countryCode);
    if (countryLocales.length === 0) return null;

    if (countryLocales.length === 1) {
        const locale = countryLocales[0];
        const mappedLang = getLanguageMapping(locale.language);
        return languages[mappedLang] ? { language: mappedLang, country: countryCode, locale } : null;
    }

    // 다중 언어 국가: 힌트 언어로 매칭 시도
    const langCode = hintLang.split('-')[0].toLowerCase();
    const lowerHint = hintLang.toLowerCase();
    const match = countryLocales.find(l => {
        const ll = l.language.toLowerCase();
        return ll === lowerHint || ll.startsWith(langCode);
    });
    const candidate = match || countryLocales[0];
    const mappedLang = getLanguageMapping(candidate.language);
    return languages[mappedLang] ? { language: mappedLang, country: countryCode, locale: candidate } : null;
}

/**
 * 브라우저 언어를 감지하여 기본 언어와 국가 정보를 반환하는 함수.
 * 국가(지역) 최우선 인식 — TimeZone 기반으로 실제 위치 추정.
 * (navigator.language의 region은 언어 로케일이라 실제 위치와 다를 수 있음.
 *  예: 갤럭시 한국 기기 + 영어 설정 시 en-US → US가 되어 오동작)
 * @returns {{language: string, country: string, locale: object|null}}
 */
async function detectBrowserLanguage() {
    const allLanguages = navigator.languages || [navigator.language] || ['en-US'];
    const browserLang = navigator.language || allLanguages[0] || 'en-US';

    const tzToCountry = {
        "Asia/Seoul": "KR", "Asia/Pyongyang": "KR",
        "Asia/Tokyo": "JP", "Asia/Shanghai": "CN",
        "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW",
        "Asia/Ulaanbaatar": "MN", "Asia/Ho_Chi_Minh": "VN",
        "Asia/Bangkok": "TH", "Asia/Jakarta": "ID",
        "Asia/Kuala_Lumpur": "MY", "Asia/Manila": "PH",
        "Asia/Dubai": "AE", "Asia/Riyadh": "SA",
        "Africa/Cairo": "EG", "Asia/Jerusalem": "IL",
        "Asia/Kolkata": "IN",
        "Europe/London": "GB", "Europe/Dublin": "IE",
        "Europe/Paris": "FR", "Europe/Brussels": "BE",
        "Europe/Amsterdam": "NL", "Europe/Berlin": "DE",
        "Europe/Vienna": "AT", "Europe/Zurich": "CH",
        "Europe/Rome": "IT", "Europe/Madrid": "ES",
        "Europe/Lisbon": "PT", "Europe/Helsinki": "FI",
        "Europe/Stockholm": "SE", "Europe/Oslo": "NO",
        "Europe/Copenhagen": "DK", "Europe/Warsaw": "PL",
        "Europe/Moscow": "RU", "Europe/Istanbul": "TR",
        "America/New_York": "US", "America/Chicago": "US",
        "America/Los_Angeles": "US", "America/Toronto": "CA",
        "America/Mexico_City": "MX", "America/Buenos_Aires": "AR",
        "America/Bogota": "CO", "America/Santiago": "CL",
        "America/Sao_Paulo": "BR",
        "Australia/Sydney": "AU", "Pacific/Auckland": "NZ"
    };

    // 0단계: TimeZone 기반 국가 추정
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzCountry = tzToCountry[timeZone] || null;
    if (tzCountry) {
        const result = resolveLocaleForCountry(tzCountry, browserLang);
        if (result) return result;
    }

    // 1단계: navigator.languages의 region 코드로 폴백
    for (const lang of allLanguages) {
        const parts = lang.split('-');
        const navRegion = parts.length >= 2 ? parts[1].toUpperCase() : null;
        if (navRegion) {
            const result = resolveLocaleForCountry(navRegion, lang);
            if (result) return result;
        }
    }

    // 2단계: 언어 코드 기반 최종 폴백
    const fallbackLangCode = browserLang.split('-')[0].toLowerCase();
    const lowerBrowserLang = browserLang.toLowerCase();

    const exactMatch = localeOptions.find(l => l.language.toLowerCase() === lowerBrowserLang);
    if (exactMatch) {
        const mapped = getLanguageMapping(exactMatch.language);
        if (languages[mapped]) return { language: mapped, country: exactMatch.country, locale: exactMatch };
    }
    if (languages[browserLang]) {
        const locale = getLocaleByLanguage(browserLang);
        return { language: browserLang, country: locale?.country || null, locale };
    }
    if (languages[fallbackLangCode]) {
        const locale = getLocaleByLanguage(fallbackLangCode);
        return { language: fallbackLangCode, country: locale?.country || null, locale };
    }
    const partialMatch = localeOptions.find(l => l.language.toLowerCase().startsWith(fallbackLangCode));
    if (partialMatch) {
        const mapped = getLanguageMapping(partialMatch.language);
        if (languages[mapped]) return { language: mapped, country: partialMatch.country, locale: partialMatch };
    }

    return detectionFallbackEnglish();
}

/** 지원 목록·브라우저 힌트로도 못 맞출 때: 영어(미국) */
function detectionFallbackEnglish() {
    const defaultLocale = getLocaleByLanguage('en-US');
    return {
        language: 'en-US',
        country: defaultLocale?.country || 'US',
        locale: defaultLocale,
    };
}

/**
 * 이름 유효성 검사 함수
 * @param {string} name - 검사할 이름
 * @returns {object} { isValid: boolean, error: string }
 */
function validateName(name) {
    const trimmedName = name.trim();
    const currentLang = state.user?.language || 'en-US';
    const minNameLength = 1;
    const maxNameLength = resources.getMaxLength(currentLang, 'name', state.user?.country);
    
    // 공백만으로 구성된 경우 또는 너무 짧은 경우
    if (!trimmedName || trimmedName.length < minNameLength) {
        return { isValid: false, error: i18n.t('onboarding.name.errorTooShort', { min: minNameLength }) };
    }
    
    // 언어별 최대 글자 수 제한
    if (trimmedName.length > maxNameLength) {
        return { isValid: false, error: i18n.t('onboarding.name.errorTooLong', { max: maxNameLength }) };
    }
    
    // 글자·결합문자·공백만 허용(숫자·구두점 제외) — utils.isValidName 과 동일. 힌디·태국어 등 결합(\p{M}) 포함
    const validPattern = /^[\p{L}\p{M}\s]+$/u;
    if (!validPattern.test(trimmedName)) {
        return { isValid: false, error: i18n.t('onboarding.name.errorChars') };
    }
    
    return { isValid: true, error: '' };
}

/**
 * 국가별 초기 설정을 적용하는 함수
 * @param {string} locale - 언어 코드
 * @param {boolean} preserveSubjects - 과목 설정을 보존할지 여부 (기본값: false)
 * @returns {object} { success: boolean, error: string }
 */
function applyCountrySettings(locale, preserveSubjects = false) {
    try {
        // 온보딩에서 선택한 국가 우선 (같은 UI 언어(en-US)를 쓰는 여러 국가 구분)
        const countryCode =
            state.user?.country || resources.localeToCountry[locale] || null;
        if (!countryCode) {
            return { success: false, error: i18n.t('onboarding.country.detectFailed') };
        }
        
        // 국가별 설정 가져오기
        const countryData = resources.countries[countryCode];
        if (!countryData) {
            return { success: false, error: i18n.t('onboarding.country.detectFailed') };
        }
        
        // 통화 설정 적용
        state.settings.currency = countryData.currency;
        
        // 기본 보너스 금액 설정 적용
        state.settings.goalBonus = countryData.defaultBonus || 10000;
        
        // 과목 설정 적용 (preserveSubjects가 false이고 subjectsModified가 false일 때만 초기화)
        if (!preserveSubjects && !subjectsModified) {
            state.subjects = countryData.defaultSubjects.map((subject, index) => ({
                id: index + 1,
                name: subject.name,
                amount: subject.amount
            }));
        }
        
        return { success: true, error: '' };
    } catch (error) {
        return { success: false, error: i18n.t('onboarding.country.detectFailed') };
    }
}

/**
 * 온보딩 입력 필드 아래에 작은 오류 메시지를 표시하는 범용 함수
 * @param {string} message - 표시할 오류 메시지
 * @param {HTMLElement} inputElement - 입력 필드 요소
 * @param {HTMLElement} nextButton - NEXT 버튼 요소 (경고 표시 중 비활성화)
 * @param {string} errorClass - 오류 메시지에 사용할 CSS 클래스명
 */
function showOnboardingInputError(message, inputElement, nextButton, errorClass = 'onboarding-input-error') {
    if (!inputElement) {
        return;
    }
    
    // 기존 오류 메시지 제거 (전역 검색)
    const existingErrors = document.querySelectorAll(`.${errorClass}`);
    existingErrors.forEach(err => err.remove());
    
    // goal-input-group 또는 과목 설정 구조에서 컨테이너 찾기
    let inputGroup = inputElement.closest('.goal-input-group');
    if (!inputGroup) {
        const wrapper = inputElement.closest('.goal-input-wrapper');
        if (wrapper) {
            inputGroup = wrapper.parentElement;
        } else {
            // 과목 금액 입력 필드 (subject-amount-input)
            const subjectItem = inputElement.closest('.subject-setting-item');
            if (subjectItem) {
                inputGroup = subjectItem;
            } else {
                return;
            }
        }
    }
    
    // NEXT 버튼 비활성화
    if (nextButton) {
        nextButton.disabled = true;
        nextButton.style.opacity = '0.5';
        nextButton.style.cursor = 'not-allowed';
        nextButton.style.pointerEvents = 'none';
    }
    
    // 새로운 오류 메시지 생성 (goal-input-group에 추가하여 자기 자리를 차지하도록)
    const errorElement = document.createElement('div');
    errorElement.className = errorClass;
    errorElement.textContent = message;
    inputGroup.appendChild(errorElement);
    
    // 애니메이션을 위해 약간의 지연 후 표시 (아래에서 드러나는 방식)
    setTimeout(() => {
        errorElement.classList.add('show');
    }, 10);
    
    // 1초 후 NEXT 버튼 활성화
    setTimeout(() => {
        if (nextButton) {
            nextButton.disabled = false;
            nextButton.style.opacity = '1';
            nextButton.style.cursor = 'pointer';
            nextButton.style.pointerEvents = 'auto';
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
 * 입력 필드에 통화 기호를 추가하는 함수
 * @param {HTMLElement} inputElement - 통화 기호를 추가할 입력 필드
 */
function addCurrencySymbolToInput(inputElement) {
    if (!inputElement || !state.settings?.currency) return;
    
    const currency = state.settings.currency;
    const symbol = currency.symbol || '₩';
    const position = currency.position || 'before';
    
    // 이미 통화 기호가 추가되어 있으면 제거
    const existingSymbol = inputElement.parentElement.querySelector('.currency-symbol');
    if (existingSymbol) {
        existingSymbol.remove();
    }
    
    // 과목 금액 입력 필드인 경우 (grid 레이아웃)
    if (inputElement.classList.contains('subject-amount-input')) {
        // 입력 필드가 이미 wrapper로 감싸져 있는지 확인
        let wrapper = inputElement.parentElement;
        if (!wrapper.classList.contains('subject-amount-wrapper')) {
            // wrapper 생성 및 입력 필드 감싸기
            wrapper = document.createElement('div');
            wrapper.className = 'subject-amount-wrapper';
            inputElement.parentElement.insertBefore(wrapper, inputElement);
            wrapper.appendChild(inputElement);
        }
        
        // 통화 기호 요소 생성
        const symbolElement = document.createElement('span');
        symbolElement.className = 'currency-symbol';
        symbolElement.textContent = symbol;
        
        // wrapper에 통화 기호 추가
        if (position === 'before') {
            wrapper.insertBefore(symbolElement, inputElement);
        } else {
            wrapper.appendChild(symbolElement);
        }
    } else {
        // 일반 입력 필드인 경우 (goal-input-wrapper)
        const symbolElement = document.createElement('span');
        symbolElement.className = 'currency-symbol';
        symbolElement.textContent = symbol;
        
        // 위치에 따라 추가 (국가별 currencyPosition 적용)
        if (position === 'before') {
            inputElement.parentElement.insertBefore(symbolElement, inputElement);
        } else {
            inputElement.parentElement.insertBefore(symbolElement, inputElement.nextSibling);
        }
    }
}

/** 짧은 토스트 메시지 (저장된 DATA 불러오기 성공 등) */
function showOnboardingToast(message) {
    const existing = document.querySelector('.onboarding-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'onboarding-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
}

/**
 * 저장된 DATA 불러오기 — import·성공 처리는 설정과 같으나 확인 모달은 생략
 * @param {function} onComplete - 온보딩 완료 콜백
 */
function handleLoadData(onComplete) {
    if (isLoadingData) return;
    isLoadingData = true;

    void (async () => {
        const nativePick = await pickDataBackupFileAndroid();
        if (nativePick.ok) {
            try {
                const importResult = await importDataFromFile(nativePick.file);
                if (importResult.success) {
                    state.onboardingCompleted = true;
                    saveData();
                    if (importResult.expansionSubjectsClamped) {
                        await showAlertModal(
                            i18n.t('modal.title.alert'),
                            `${i18n.t('premium.expansion.importClampedMessage')}\n\n${i18n.t('onboarding.loadSuccess')}`
                        );
                    } else {
                        showOnboardingToast(i18n.t('onboarding.loadSuccess'));
                    }
                    const delayBeforeFade = importResult.expansionSubjectsClamped ? 100 : 1000;
                    setTimeout(() => {
                        elements.onboardingView.style.opacity = '0';
                        setTimeout(() => {
                            elements.onboardingView.style.display = 'none';
                            document.getElementById('appContainer').style.display = 'flex';
                            runWhenMainShellLaidOut(() => {
                                if (typeof onComplete === 'function') onComplete();
                            });
                        }, 500);
                    }, delayBeforeFade);
                }
            } catch (error) {
                await showAlertModal(i18n.t('modal.title.error'), error.message);
            } finally {
                isLoadingData = false;
            }
            return;
        }
        if (nativePick.reason === 'cancelled') {
            isLoadingData = false;
            return;
        }

        const fileInput = document.getElementById('fileInput');
        if (!fileInput) {
            isLoadingData = false;
            showAlertModal(i18n.t('modal.title.error'), i18n.t('onboarding.loadError'));
            return;
        }

        const resetLoadingState = () => {
            if (isLoadingData) isLoadingData = false;
        };
        const handleFocus = () => {
            window.removeEventListener('focus', handleFocus);
            clearTimeout(fallbackTimer);
            setTimeout(resetLoadingState, 300);
        };
        window.addEventListener('focus', handleFocus);

        const fallbackTimer = setTimeout(() => {
            window.removeEventListener('focus', handleFocus);
            resetLoadingState();
        }, 1000);

        fileInput.onchange = async (e) => {
            const file = e.target.files?.[0];
            fileInput.value = '';
            isLoadingData = false;
            window.removeEventListener('focus', handleFocus);
            clearTimeout(fallbackTimer);

            if (!file) return;

            try {
                const importResult = await importDataFromFile(file);
                if (importResult.success) {
                    state.onboardingCompleted = true;
                    saveData();
                    if (importResult.expansionSubjectsClamped) {
                        await showAlertModal(
                            i18n.t('modal.title.alert'),
                            `${i18n.t('premium.expansion.importClampedMessage')}\n\n${i18n.t('onboarding.loadSuccess')}`
                        );
                    } else {
                        showOnboardingToast(i18n.t('onboarding.loadSuccess'));
                    }
                    const delayBeforeFade = importResult.expansionSubjectsClamped ? 100 : 1000;
                    setTimeout(() => {
                        elements.onboardingView.style.opacity = '0';
                        setTimeout(() => {
                            elements.onboardingView.style.display = 'none';
                            document.getElementById('appContainer').style.display = 'flex';
                            runWhenMainShellLaidOut(() => {
                                if (typeof onComplete === 'function') onComplete();
                            });
                        }, 500);
                    }, delayBeforeFade);
                }
            } catch (error) {
                await showAlertModal(i18n.t('modal.title.error'), error.message);
            }
        };

        fileInput.click();
    })();
}

// 커스텀 팝업 함수
function showCustomPopup(message, icon = '⚠️', type = 'default') {
    return new Promise((resolve) => {
        // 기존 팝업이 있으면 제거
        const existingPopup = document.querySelector('.custom-popup-overlay');
        if (existingPopup) {
            existingPopup.remove();
        }
        
        // 팝업 오버레이 생성
        const overlay = document.createElement('div');
        overlay.className = 'custom-popup-overlay';
        
        // 팝업 컨텐츠 생성
        const popup = document.createElement('div');
        popup.className = `custom-popup custom-popup-${type}`;
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'custom-popup-icon';
        iconDiv.textContent = icon;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'custom-popup-message';
        messageDiv.textContent = message;
        
        const button = document.createElement('button');
        button.className = 'custom-popup-button';
        button.textContent = i18n.t('action.confirm');
        button.addEventListener('click', () => {
            overlay.remove();
            resolve();
        });
        
        // 오버레이 클릭 시 닫기
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve();
            }
        });
        
        popup.appendChild(iconDiv);
        popup.appendChild(messageDiv);
        popup.appendChild(button);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
    });
}

export async function initOnboarding(onComplete) {
    onboardingCompleteCallback = onComplete;
    let expansionSubjectAddedForStep5 = null;

    // 언어 선택 드롭다운 채우기
    await populateLanguageSelector();
    
    // 브라우저 언어 감지 및 기본 설정
    const detectionResult = await detectBrowserLanguage();
    
    // 결과가 객체인지 문자열인지 확인 (하위 호환성)
    const detectedLang = typeof detectionResult === 'string' ? detectionResult : detectionResult.language;
    const detectedCountry = typeof detectionResult === 'string' ? null : detectionResult.country;
    const detectedLocale = typeof detectionResult === 'string' ? null : detectionResult.locale;
    
    i18n.setLocale(detectedLang);

    state.user.language = detectedLang;
    if (detectedCountry) {
        state.user.country = detectedCountry;
    } else if (detectedLocale?.country) {
        state.user.country = detectedLocale.country;
    } else if (detectedLang === 'en-GB') {
        state.user.country = 'GB';
    } else if (detectedLang && String(detectedLang).startsWith('en')) {
        state.user.country = 'US';
    }
    
    // 감지된 국가 정보를 전역에 저장 (UI 표시용)
    window._detectedLanguageInfo = {
        language: detectedLang,
        country: state.user.country,
        locale: detectedLocale
    };

    /**
     * 셀렉터에서 국가/언어 정보에 맞는 최적의 option 요소를 반환하는 헬퍼
     */
    function findBestLanguageOption(selector, country, lang) {
        const options = Array.from(selector.options);
        if (country) {
            const countryOptions = options.filter(o => o.dataset.country === country);
            if (countryOptions.length > 0) {
                const langMatch = lang && countryOptions.find(o =>
                    o.dataset.language === lang || o.value === `${country}-${lang}`
                );
                return langMatch || countryOptions[0];
            }
        }
        return lang ? (options.find(o =>
            o.dataset.language === lang ||
            o.value.endsWith(`-${lang}`) ||
            o.value === lang
        ) || null) : null;
    }

    /**
     * 이전 단계로 이동하는 헬퍼 (뒤로가기 처리 공통 로직)
     */
    function navigateToPrevStep(step) {
        const prev = step - 1;
        if (prev === 4) {
            // 4단계는 건너뛰고 3단계로 이동
            showStep(3, true);
            setupStep3();
        } else {
            showStep(prev, true);
            if (prev === 1) setupStep1();
            else if (prev === 2) setupStep2();
            else if (prev === 3) setupStep3();
            else if (prev === 5) setupStep5();
            else if (prev === 6) setupStep6();
        }
    }

    // 드롭다운이 채워진 후에 값 설정
    if (elements.languageSelector) {
        const opt = findBestLanguageOption(elements.languageSelector, detectedCountry, detectedLang);
        if (opt) elements.languageSelector.value = opt.value;
    }
    
    const handlePopState = (event) => {
        const onboardingView = document.getElementById('onboardingView');
        if (!onboardingView || onboardingView.style.display === 'none') return;

        const histState = event.state;
        if (histState && histState.onboardingStep) {
            const targetStep = histState.onboardingStep;
            if (targetStep >= 1 && targetStep <= 8) {
                if (targetStep === 4) {
                    showStep(5, true); setupStep5();
                } else {
                    showStep(targetStep, true);
                    if (targetStep === 1) setupStep1();
                    else if (targetStep === 2) setupStep2();
                    else if (targetStep === 3) setupStep3();
                    else if (targetStep === 5) setupStep5();
                    else if (targetStep === 6) setupStep6();
                    else if (targetStep === 8) setupStep8();
                }
            }
        } else if (currentStep > 1) {
            navigateToPrevStep(currentStep);
        }
    };
    
    window.addEventListener('popstate', handlePopState);
    
    // 안드로이드 네이티브 뒤로가기 버튼 처리
    async function setupOnboardingBackButton() {
        try {
            const Capacitor = window.Capacitor;
            if (!Capacitor || !Capacitor.isNativePlatform()) {
                return; // 네이티브 플랫폼이 아니면 무시
            }
            
            const { App } = await import('@capacitor/core');
            
            await App.addListener('backButton', () => {
                const onboardingView = document.getElementById('onboardingView');
                if (!onboardingView || onboardingView.style.display === 'none') return;
                if (currentStep > 1) {
                    navigateToPrevStep(currentStep);
                }
                // 1단계에서는 뒤로가기 동작 없음 (앱 종료는 네이티브에서 처리)
            });
            
        } catch (error) {
            logDevWarning('뒤로가기 버튼 설정 실패', error);
        }
    }
    
    setupOnboardingBackButton();
    
    function applyDefaultGoalSettings() {
        const currentDate = new Date();
        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        const targetDays = state.settings.goalDays || Math.min(20, daysInMonth);
        const bonusAmount = state.settings.goalBonus ?? 0;
        state.settings.restConstant = daysInMonth - targetDays;
        state.settings.goalBonus = bonusAmount;
        state.settings.goalDays = targetDays;
    }

    async function completeOnboardingAndLaunch() {
        try {
            state.onboardingCompleted = true;
            await saveData();
            elements.onboardingView.style.opacity = '0';
            setTimeout(() => {
                elements.onboardingView.style.display = 'none';
                elements.appContainer.style.display = 'flex';
                runWhenMainShellLaidOut(() => {
                    if (typeof onboardingCompleteCallback === 'function') {
                        onboardingCompleteCallback();
                    }
                });
            }, 500);
        } catch (error) {
            await showCustomPopup(i18n.t('onboarding.complete.saveFailed'), '❌');
        }
    }

    async function startWithDefaultSettings() {
        state.user.name = '';
        subjectsModified = false;
        languageChanged = false;
        const result = applyCountrySettings(state.user.language, false);
        if (!result.success) {
            await showCustomPopup(result.error || i18n.t('onboarding.country.detectFailed'), '⚠️');
            return;
        }
        applyDefaultGoalSettings();
        await completeOnboardingAndLaunch();
    }
    
    // 1단계: 언어 선택
    function setupStep1() {
        // 기존 이벤트 리스너 제거를 위해 새 함수로 교체
        const updateStep1Texts = () => {
            const currentLang = i18n.getLocale();
            
            // 국가 우선: 감지된 국가 정보가 있으면 그 국가의 locale 사용
            let locale = null;
            if (window._detectedLanguageInfo && window._detectedLanguageInfo.country) {
                const countryLocales = getLocalesByCountry(window._detectedLanguageInfo.country);
                // 해당 국가에서 현재 언어와 매칭되는 locale 찾기
                locale = countryLocales.find(l => {
                    const mapped = getLanguageMapping(l.language);
                    return mapped === currentLang || l.language === currentLang;
                }) || countryLocales[0] || window._detectedLanguageInfo.locale;
            }
            
            // 국가 정보가 없거나 매칭 실패 시 언어 코드로 찾기
            if (!locale) {
                locale = getLocaleByLanguage(currentLang);
            }
            
            const languageName = locale?.languageName || currentLang;
            const countryName = locale?.countryName || '';
            
            
            elements.languageTitle.textContent = i18n.t('onboarding.language.title');
            
            // 감지된 국가와 언어 정보 표시 (두 줄)
            if (countryName && languageName) {
                elements.languageDetected.textContent = i18n.t('onboarding.language.detected', { 
                    countryName: countryName,
                    languageName: languageName
                });
            } else {
                // 폴백: 언어만 표시 (하위 호환성)
                const fallbackText = i18n.t('onboarding.language.detected', { 
                    countryName: locale?.country || '',
                    languageName: languageName
                });
                // {lang} 키가 있으면 사용 (구버전 호환)
                if (fallbackText.includes('{lang}')) {
                    elements.languageDetected.textContent = fallbackText.replace('{lang}', languageName);
                } else {
                    elements.languageDetected.textContent = fallbackText;
                }
            }
            
            // 부제목 표시 (subtitle 키가 있으면)
            const subtitleText = i18n.t('onboarding.language.subtitle');
            if (subtitleText && subtitleText !== 'onboarding.language.subtitle') {
                elements.languageSubtitle.textContent = subtitleText;
            } else {
                elements.languageSubtitle.textContent = '';
            }
            
            elements.languageNextBtn.textContent = i18n.t('action.next');
            
            // 저장된 DATA 불러오기 버튼 텍스트 업데이트
            if (elements.loadDataBtn) {
                const textEl = elements.loadDataBtn.querySelector('.load-data-btn-text');
                if (textEl) textEl.textContent = i18n.t('onboarding.loadData');
            }
        };
        
        if (elements.loadDataBtn) {
            // 기존 이벤트 리스너 제거 후 새로 추가 (중복 방지)
            const newLoadDataBtn = elements.loadDataBtn.cloneNode(true);
            elements.loadDataBtn.parentNode.replaceChild(newLoadDataBtn, elements.loadDataBtn);
            elements.loadDataBtn = newLoadDataBtn;

            const textEl = elements.loadDataBtn.querySelector('.load-data-btn-text');
            if (textEl) textEl.textContent = i18n.t('onboarding.loadData');

            elements.loadDataBtn.addEventListener('click', () => {
                if (!isLoadingData) {
                    handleLoadData(onboardingCompleteCallback);
                }
            });
        }
        
        // 초기 텍스트 설정
        updateStep1Texts();
        
        // 기존 이벤트 리스너 제거 후 새로 추가
        const languageChangeHandler = (e) => {
            const selectedValue = e.target.value;
            const selectedOption = e.target.options[e.target.selectedIndex];
            
            // value에서 언어 코드 추출 (형식: "국가코드-언어코드" 또는 "언어코드")
            const selectedLang = selectedOption?.dataset.language || 
                                 (selectedValue.includes('-') ? selectedValue.split('-').slice(1).join('-') : selectedValue);
            const selectedCountry = selectedOption?.dataset.country || null;
            
            i18n.setLocale(selectedLang);
            
            // 선택된 locale 정보 업데이트
            if (selectedCountry) {
                state.user.country = selectedCountry;
                const selectedLocale = getLocalesByCountry(selectedCountry).find(l => {
                    const mapped = getLanguageMapping(l.language);
                    return mapped === selectedLang || l.language === selectedLang;
                }) || getLocaleByLanguage(selectedLang);
                
                if (selectedLocale) {
                    window._detectedLanguageInfo = {
                        language: selectedLang,
                        country: selectedCountry,
                        locale: selectedLocale
                    };
                }
            }
            
            updateStep1Texts();
        };
        
        // 이전 이벤트 리스너 제거를 위해 새 인스턴스 생성
        if (elements.languageSelector && elements.languageSelector.parentNode) {
            const newSelector = elements.languageSelector.cloneNode(true);
            elements.languageSelector.parentNode.replaceChild(newSelector, elements.languageSelector);
            elements.languageSelector = newSelector;

            const opt = findBestLanguageOption(
                elements.languageSelector,
                window._detectedLanguageInfo?.country,
                i18n.getLocale()
            );
            if (opt) elements.languageSelector.value = opt.value;
        }
        
        // 언어 변경 이벤트
        elements.languageSelector.addEventListener('change', languageChangeHandler);
        
        // 다음 버튼 이벤트 (기존 제거 후 새로 추가)
        const nextBtnClickHandler = async () => {
            const selectedValue = elements.languageSelector.value;
            if (!selectedValue) {
                await showCustomPopup(i18n.t('onboarding.language.errorNoSelection'), '😊');
                return;
            }
            
            // 선택된 옵션에서 언어 코드 추출
            const selectedOption = elements.languageSelector.options[elements.languageSelector.selectedIndex];
            const selectedLang = selectedOption?.dataset.language || 
                                 (selectedValue.includes('-') ? selectedValue.split('-').slice(1).join('-') : selectedValue);
            
            if (!selectedLang) {
                await showCustomPopup(i18n.t('onboarding.language.errorNoSelection'), '😊');
                return;
            }
            
            // 언어가 변경되었는지 확인
            const previousLang = state.user?.language || i18n.getLocale();
            if (selectedLang !== previousLang) {
                languageChanged = true;
                // 언어가 변경되면 과목 설정도 초기화해야 함
                subjectsModified = false;
            } else {
                languageChanged = false;
            }
            
            i18n.setLocale(selectedLang);
            state.user.language = selectedLang;
            const selectedCountry = selectedOption?.dataset?.country;
            if (selectedCountry) {
                state.user.country = selectedCountry;
            }
            showStep(2);
            setupStep2();
        };
        
        if (elements.languageNextBtn && elements.languageNextBtn.parentNode) {
            const newNextBtn = elements.languageNextBtn.cloneNode(true);
            elements.languageNextBtn.parentNode.replaceChild(newNextBtn, elements.languageNextBtn);
            elements.languageNextBtn = newNextBtn;
            elements.languageNextBtn.addEventListener('click', nextBtnClickHandler);
        }
    }
    
    // 2단계: 환영 가이드
    function setupStep2() {
        elements.welcomeTitle.textContent = i18n.t('onboarding.welcome.title');
        elements.welcomeMessage.innerHTML = i18n.t('onboarding.welcome.message');
        elements.welcomeNextBtn.textContent = i18n.t('action.next');
        
        // 기존 이벤트 리스너 제거를 위해 새 인스턴스 생성
        if (elements.welcomeNextBtn && elements.welcomeNextBtn.parentNode) {
            const newNextBtn = elements.welcomeNextBtn.cloneNode(true);
            elements.welcomeNextBtn.parentNode.replaceChild(newNextBtn, elements.welcomeNextBtn);
            elements.welcomeNextBtn = newNextBtn;
        }
        if (elements.welcomeQuickStartBtn && elements.welcomeQuickStartBtn.parentNode) {
            const newQuickBtn = elements.welcomeQuickStartBtn.cloneNode(true);
            elements.welcomeQuickStartBtn.parentNode.replaceChild(newQuickBtn, elements.welcomeQuickStartBtn);
            elements.welcomeQuickStartBtn = newQuickBtn;
        }
        
        elements.welcomeNextBtn.textContent = i18n.t('action.next');
        if (elements.welcomeQuickStartBtn) {
            elements.welcomeQuickStartBtn.textContent = i18n.t('onboarding.welcome.quickStart');
        }
        
        elements.welcomeNextBtn.addEventListener('click', () => {
            showStep(3);
            setupStep3();
        });
        if (elements.welcomeQuickStartBtn) {
            elements.welcomeQuickStartBtn.addEventListener('click', () => {
                void startWithDefaultSettings();
            });
        }
    }
    
    // 3단계: 이름 입력
    function setupStep3() {
        elements.nameTitle.textContent = i18n.t('onboarding.name.label');
        elements.nameDesc.textContent = i18n.t('onboarding.name.desc');
        elements.nameNextBtn.textContent = i18n.t('action.next');
        
        // 언어별 최대 글자 수 설정 (maxLength 제거하여 실시간 에러 표시 가능하도록)
        const currentLang = state.user?.language || 'en-US';
        const maxNameLength = resources.getMaxLength(currentLang, 'name', state.user?.country);
        
        // 기존 이벤트 리스너 제거를 위해 새 인스턴스 생성
        if (elements.nameInput && elements.nameInput.parentNode) {
            const newInput = elements.nameInput.cloneNode(true);
            // maxLength 속성 제거 (실시간 에러 표시를 위해)
            newInput.removeAttribute('maxlength');
            elements.nameInput.parentNode.replaceChild(newInput, elements.nameInput);
            elements.nameInput = newInput;
        }
        
        if (elements.nameNextBtn && elements.nameNextBtn.parentNode) {
            const newNextBtn = elements.nameNextBtn.cloneNode(true);
            elements.nameNextBtn.parentNode.replaceChild(newNextBtn, elements.nameNextBtn);
            elements.nameNextBtn = newNextBtn;
        }
        
        // 실시간 유효성 검사 및 글자 수 제한
        elements.nameInput.addEventListener('input', () => {
            const currentLength = elements.nameInput.value.length;
            
            // 언어별 최대 글자 수 제한 (실시간 자동 수정)
            if (currentLength > maxNameLength) {
                elements.nameInput.value = elements.nameInput.value.substring(0, maxNameLength);
            }

            const validation = validateName(elements.nameInput.value);
            if (!validation.isValid) {
                elements.nameError.textContent = validation.error;
                elements.nameError.style.display = 'block';
            } else {
                elements.nameError.style.display = 'none';
            }
        });
        
        elements.nameNextBtn.addEventListener('click', () => {
            const validation = validateName(elements.nameInput.value);
            if (!validation.isValid) {
                elements.nameError.textContent = validation.error;
                elements.nameError.style.display = 'block';
                elements.nameInput.focus();
                return;
            }
            
            state.user.name = elements.nameInput.value.trim();
            // 국가별 설정을 백그라운드에서 적용하고 바로 5단계로 이동
            // 언어가 변경되지 않았고 과목이 이미 수정되었다면 과목 설정을 보존
            const preserveSubjects = !languageChanged && subjectsModified;
            applyCountrySettings(state.user.language, preserveSubjects);
            showStep(5);
            setupStep5();
        });
    }
    
    // 5단계: 과목 설정 - 리스너 중복 방지용 (뒤로가기 후 재진입 시)
    let step5ListClickHandler = null;

    // 5단계: 과목 설정
    function setupStep5() {
        elements.onboardingSubjectsTitle.textContent = i18n.t('settings.subjects.title');
        if (elements.onboardingSubjectsDescription) {
            elements.onboardingSubjectsDescription.innerHTML = i18n.t('onboarding.subjects.description');
        }
        elements.onboardingAddSubjectBtn.textContent = i18n.t('settings.subjects.add');
        elements.onboardingSubjectsNextBtn.textContent = i18n.t('action.next');
        
        // 과목 목록 렌더링
        renderOnboardingSubjectsList();
        
        // 과목 추가 버튼 이벤트
        if (elements.onboardingAddSubjectBtn && elements.onboardingAddSubjectBtn.parentNode) {
            const newAddBtn = elements.onboardingAddSubjectBtn.cloneNode(true);
            elements.onboardingAddSubjectBtn.parentNode.replaceChild(newAddBtn, elements.onboardingAddSubjectBtn);
            elements.onboardingAddSubjectBtn = newAddBtn;
        }
        
        elements.onboardingAddSubjectBtn.addEventListener('click', async () => {
            const maxSubjects = state.MAX_SUBJECTS || 5;
            if (state.subjects.length >= maxSubjects) {
                await showCustomPopup(i18n.t('settings.subjects.errorLimit', { max: state.MAX_SUBJECTS || 5 }), '⚠️');
                return;
            }
            
            const newId = Math.max(...state.subjects.map(s => s.id), 0) + 1;
            state.subjects.push({
                id: newId,
                name: '',
                amount: state.settings.currency.defaultAmount || 1000,
                timerEnabled: false,
                timerMinutes: 25
            });
            subjectsModified = true; // 과목이 수정되었음을 표시
            renderOnboardingSubjectsList();
        });
        
        // 과목 목록 이벤트 위임 (제거 버튼, 타이머 토글/증가/감소)
        // 기존 리스너 제거 후 추가 (뒤로가기 후 재진입 시 중복 방지)
        if (elements.onboardingSubjectsList) {
            if (step5ListClickHandler) {
                elements.onboardingSubjectsList.removeEventListener('click', step5ListClickHandler);
            }
            step5ListClickHandler = async (e) => {
                const target = e.target;
                
                // 제거 버튼
                const removeBtn = target.closest('.remove-btn');
                if (removeBtn) {
                    const id = Number(removeBtn.dataset.id);
                    if (state.subjects.length <= 1) {
                        await showCustomPopup(i18n.t('settings.subjects.errorAtLeastOne'), '⚠️');
                        return;
                    }
                    state.subjects = state.subjects.filter(s => s.id !== id);
                    subjectsModified = true; // 과목이 수정되었음을 표시
                    renderOnboardingSubjectsList();
                    return;
                }
                
                // 타이머 토글 버튼
                const timerToggleBtn = target.closest('.timer-toggle-btn');
                if (timerToggleBtn && !target.closest('.timer-controls-inline')) {
                    const subjectId = Number(timerToggleBtn.dataset.id);
                    const subject = state.subjects.find(s => s.id === subjectId);
                    if (subject) {
                        subject.timerEnabled = !subject.timerEnabled;
                        if (!subject.timerMinutes) {
                            subject.timerMinutes = 25;
                        }
                        subjectsModified = true;
                        renderOnboardingSubjectsList();
                        if (subject.timerEnabled) {
                            await prepareStudyTimerOsPermissions();
                        }
                    }
                    return;
                }
                
                // 타이머 감소 버튼
                const timerDecreaseBtn = target.closest('.timer-decrease-btn-inline');
                if (timerDecreaseBtn) {
                    const subjectId = Number(timerDecreaseBtn.dataset.id);
                    const subject = state.subjects.find(s => s.id === subjectId);
                    if (subject && subject.timerEnabled) {
                        subject.timerMinutes = Math.max(5, (subject.timerMinutes || 25) - 5);
                        subjectsModified = true;
                        renderOnboardingSubjectsList();
                    }
                    return;
                }
                
                // 타이머 증가 버튼
                const timerIncreaseBtn = target.closest('.timer-increase-btn-inline');
                if (timerIncreaseBtn) {
                    const subjectId = Number(timerIncreaseBtn.dataset.id);
                    const subject = state.subjects.find(s => s.id === subjectId);
                    if (subject && subject.timerEnabled) {
                        subject.timerMinutes = Math.min(90, (subject.timerMinutes || 25) + 5);
                        subjectsModified = true;
                        renderOnboardingSubjectsList();
                    }
                    return;
                }
            };
            elements.onboardingSubjectsList.addEventListener('click', step5ListClickHandler);
        }
        
        // 다음 버튼 이벤트
        if (elements.onboardingSubjectsNextBtn && elements.onboardingSubjectsNextBtn.parentNode) {
            const newNextBtn = elements.onboardingSubjectsNextBtn.cloneNode(true);
            elements.onboardingSubjectsNextBtn.parentNode.replaceChild(newNextBtn, elements.onboardingSubjectsNextBtn);
            elements.onboardingSubjectsNextBtn = newNextBtn;
        }
        
        elements.onboardingSubjectsNextBtn.addEventListener('click', async () => {
            // 과목 유효성 검사
            let hasError = false;
            const maxSubjectAmount = state.settings?.currency?.maxSubjectAmount || 1000000;
            
            for (const subject of state.subjects) {
                if (!subject.name || !subject.name.trim()) {
                    await showCustomPopup(i18n.t('settings.subjects.errorName'), '😊');
                    hasError = true;
                    break;
                }
                // 소숫점 통화를 고려한 최소값 검증
                const minAmount = state.settings?.currency?.decimal > 0 
                    ? Math.pow(0.1, state.settings.currency.decimal) 
                    : 1;
                
                if (!subject.amount || subject.amount < minAmount) {
                    await showCustomPopup(i18n.t('settings.subjects.errorAmount'), '⚠️');
                    hasError = true;
                    break;
                }
                
                // 최대값 검사 및 자동 조정
                if (subject.amount > maxSubjectAmount) {
                    subject.amount = maxSubjectAmount;
                    const amountInput = document.getElementById(`onboarding-subject-amount-${subject.id}`);
                    if (amountInput) {
                        amountInput.value = maxSubjectAmount;
                        showOnboardingInputError(
                            i18n.t('settings.subjects.errorAmountMaxAuto', { amount: formatCurrency(maxSubjectAmount) }),
                            amountInput,
                            elements.onboardingSubjectsNextBtn,
                            'onboarding-subject-amount-error'
                        );
                    }
                    hasError = true;
                    break;
                }
            }
            
            if (!hasError) {
                showStep(6);
                setupStep6();
            }
        });

        const expansionHandler = () => {
            const step5El = document.getElementById('onboardingStep5');
            if (!step5El?.classList.contains('active')) return;
            subjectsModified = true;
            renderOnboardingSubjectsList();
        };
        if (typeof window !== 'undefined') {
            if (expansionSubjectAddedForStep5) {
                window.removeEventListener(STUDY_EXPANSION_SUBJECT_ADDED_EVENT, expansionSubjectAddedForStep5);
            }
            expansionSubjectAddedForStep5 = expansionHandler;
            window.addEventListener(STUDY_EXPANSION_SUBJECT_ADDED_EVENT, expansionHandler);
        }
    }
    
    // 과목 목록 렌더링 함수
    function renderOnboardingSubjectsList() {
        const container = elements.onboardingSubjectsList;
        if (!container) return;
        
        container.innerHTML = state.subjects.map((subject, index) => {
            const timerEnabled = subject.timerEnabled || false;
            const timerMinutes = subject.timerMinutes || 25;
            return `
            <div class="subject-setting-item">
                <div class="subject-main-row">
                    <span class="subject-number">${index + 1}</span>
                    <input type="text" 
                           id="onboarding-subject-name-${subject.id}"
                           value="${subject.name}" 
                           placeholder="${i18n.t('settings.subjects.name')}" 
                           data-id="${subject.id}" 
                           class="subject-name-input"
                           maxlength="${resources.getMaxLength(state.user?.language || 'en-US', 'subject', state.user?.country)}"
                           aria-label="${i18n.t('settings.subjects.name')}">
                    <input type="number" 
                           id="onboarding-subject-amount-${subject.id}"
                           value="${subject.amount}" 
                           min="${state.settings.currency?.decimal > 0 ? Math.pow(0.1, state.settings.currency.decimal) : 1}" 
                           max="${state.settings.currency?.maxSubjectAmount || 1000000}" 
                           step="${state.settings.currency.decimal > 0 ? Math.pow(0.1, state.settings.currency.decimal) : 1}"
                           data-id="${subject.id}" 
                           class="subject-amount-input"
                           aria-label="${i18n.t('settings.subjects.amount')}">
                    ${state.subjects.length > 1 ? 
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
                            <button class="timer-decrease-btn-inline" data-id="${subject.id}" aria-label="Decrease" ${timerEnabled ? '' : 'disabled'}>
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                    <path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                </svg>
                            </button>
                            <span class="timer-display-inline" data-id="${subject.id}">${timerMinutes}${i18n.t('timer.minutes')}</span>
                            <button class="timer-increase-btn-inline" data-id="${subject.id}" aria-label="Increase" ${timerEnabled ? '' : 'disabled'}>
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
        
        // 입력 필드 이벤트 리스너 추가 (과목명만 처리, 금액은 아래 별도 처리)
        container.querySelectorAll('.subject-name-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const id = Number(e.target.dataset.id);
                const subject = state.subjects.find(s => s.id === id);
                if (subject) {
                        subject.name = e.target.value;
                        subjectsModified = true; // 과목이 수정되었음을 표시
                }
            });
        });
        
        // 과목 금액 입력 필드 input 이벤트 (숫자만 허용 및 소수점 자릿수 실시간 제한)
        container.querySelectorAll('.subject-amount-input').forEach(input => {
            // 통화 기호 추가
            addCurrencySymbolToInput(input);
            
            input.addEventListener('input', (e) => {
                const id = Number(e.target.dataset.id);
                const subject = state.subjects.find(s => s.id === id);
                
                // 숫자만 허용 (소수점 포함)
                const valueStr = e.target.value;
                const cleanedValue = valueStr.replace(/[^0-9.]/g, '');
                if (valueStr !== cleanedValue) {
                    e.target.value = cleanedValue;
                }
                e.target.value = normalizeNumericInput(e.target.value, true);
                
                // 소수점 자릿수 실시간 제한 (잘라내기)
                const currencyDecimal = state.settings?.currency?.decimal || 0;
                const finalValueStr = e.target.value;
                if (finalValueStr && finalValueStr.includes('.')) {
                    const parts = finalValueStr.split('.');
                    const integerPart = parts[0];
                    const decimalPart = parts[1];
                    if (decimalPart && decimalPart.length > currencyDecimal) {
                        // 소수점 자릿수 초과 시 잘라내기 (반올림하지 않음)
                        const limitedDecimal = decimalPart.substring(0, currencyDecimal);
                        e.target.value = currencyDecimal > 0 ? `${integerPart}.${limitedDecimal}` : integerPart;
                        
                        // 실시간으로 subject.amount 업데이트 (잘라낸 값으로)
                        if (subject) {
                            subject.amount = parseFloat(e.target.value) || 0;
                            subjectsModified = true;
                        }
                    } else if (subject) {
                        // 소수점 자릿수가 정상 범위 내일 때도 실시간 업데이트
                        subject.amount = parseFloat(e.target.value) || 0;
                        subjectsModified = true;
                    }
                } else if (subject) {
                    // 소수점이 없을 때도 실시간 업데이트
                    subject.amount = parseFloat(e.target.value) || 0;
                    subjectsModified = true;
                }
            });
        });
        
        // 과목 금액 입력 필드 blur 이벤트 (최대값 자동 조정 및 소수점 잘라내기)
        container.querySelectorAll('.subject-amount-input').forEach(input => {
            input.addEventListener('blur', async (e) => {
                const id = Number(e.target.dataset.id);
                const subject = state.subjects.find(s => s.id === id);
                if (subject) {
                    // 소수점 자릿수 제한 및 잘라내기 (반올림하지 않음)
                    const currencyDecimal = state.settings?.currency?.decimal || 0;
                    let valueStr = e.target.value;
                    
                    // 빈 값이면 기본값으로 설정
                    if (!valueStr || valueStr.trim() === '') {
                        valueStr = '0';
                        e.target.value = '0';
                    }
                    e.target.value = normalizeNumericInput(e.target.value, true);
                    valueStr = e.target.value;
                    
                    if (valueStr.includes('.')) {
                        const parts = valueStr.split('.');
                        const integerPart = parts[0] || '0';
                        const decimalPart = parts[1] || '';
                        
                        if (decimalPart.length > currencyDecimal) {
                            // 소수점 자릿수 초과 시 잘라내기 (반올림하지 않음)
                            const limitedDecimal = decimalPart.substring(0, currencyDecimal);
                            const truncatedValue = currencyDecimal > 0 ? `${integerPart}.${limitedDecimal}` : integerPart;
                            e.target.value = truncatedValue;
                            // 정확히 소수점 자릿수로 저장 (부동소수점 오차 방지)
                            subject.amount = currencyDecimal > 0 ? parseFloat(truncatedValue) : parseInt(integerPart);
                        } else {
                            // 소수점 자릿수가 정상 범위 내일 때도 정확히 저장
                            // 부동소수점 오차를 방지하기 위해 문자열을 그대로 파싱
                            const finalValue = currencyDecimal > 0 ? valueStr : integerPart;
                            e.target.value = finalValue;
                            subject.amount = parseFloat(finalValue) || 0;
                        }
                    } else {
                        // 소수점이 없을 때도 정확히 저장
                        subject.amount = parseInt(valueStr) || 0;
                    }
                    
                    // 부동소수점 오차를 방지하기 위해 정확히 소수점 자릿수로 저장
                    if (currencyDecimal > 0 && subject.amount % 1 !== 0) {
                        // 소수점이 있는 경우, 정확히 currencyDecimal 자릿수로 저장
                        const multiplier = Math.pow(10, currencyDecimal);
                        subject.amount = Math.floor(subject.amount * multiplier) / multiplier;
                    }
                    
                    const amount = Number(e.target.value) || 0;
                    const maxSubjectAmount = state.settings?.currency?.maxSubjectAmount || 1000000;
                    
                    // 최대값 검사 및 자동 조정
                    if (amount > maxSubjectAmount) {
                        subject.amount = maxSubjectAmount;
                        e.target.value = maxSubjectAmount;
                        showOnboardingInputError(
                            i18n.t('settings.subjects.errorAmountMaxAuto', { amount: formatCurrency(maxSubjectAmount) }),
                            e.target,
                            elements.onboardingSubjectsNextBtn,
                            'onboarding-subject-amount-error'
                        );
                        return;
                    }
                    
                    // 소숫점 통화를 고려한 최소값 검사
                    const minAmount = state.settings?.currency?.decimal > 0 
                        ? Math.pow(0.1, state.settings.currency.decimal) 
                        : 1;
                    
                    if (amount < minAmount && amount !== 0) {
                        subject.amount = minAmount;
                        e.target.value = minAmount;
                        showOnboardingInputError(
                            i18n.t('settings.subjects.errorAmountMin') || `과목 금액은 ${minAmount} 이상이어야 합니다. ${minAmount}로 자동 수정되었습니다.`,
                            e.target,
                            elements.onboardingSubjectsNextBtn,
                            'onboarding-subject-amount-error'
                        );
                        return;
                    }
                    e.target.value = normalizeNumericInput(e.target.value, true);
                }
            });
        });
    }
    
    // 6단계: 이달의 목표 설정
    function setupStep6() {
        elements.onboardingGoalTitle.textContent = i18n.t('settings.goal.title');
        elements.onboardingGoalDaysLabel.textContent = i18n.t('settings.goal.days');
        
        // 보너스 금액 레이블에 통화 단위 추가
        const bonusLabel = i18n.t('settings.goal.bonus');
        const currencySymbol = state.settings.currency.symbol || '₩';
        elements.onboardingGoalBonusLabel.textContent = `${bonusLabel} (${currencySymbol})`;
        
        // 목표 정보 텍스트 설정
        const goalInfoText = i18n.t('settings.goal.info', { min: MIN_GOAL_DAYS });
        const lines = goalInfoText.split('\n');
        let html = '';
        if (lines.length > 0) {
            // 첫 번째 줄은 제목으로 중앙 정렬
            html += `<div class="goal-info-title">${lines[0]}</div>`;
            if (lines.length > 1) {
                // 나머지 줄은 내용으로 중앙 정렬
                html += '<div class="goal-info-content">' + lines.slice(1).join('<br>') + '</div>';
            }
        } else {
            html = '<div class="goal-info-content">' + goalInfoText.replace(/\n/g, '<br>') + '</div>';
        }
        elements.onboardingGoalInfo.innerHTML = html;
        
        // 현재 설정값 적용
        const currentDate = new Date();
        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        elements.onboardingTargetDaysInput.value = state.settings.goalDays || Math.min(20, daysInMonth);
        elements.onboardingBonusAmountInput.value = state.settings.goalBonus || 0;
        
        elements.onboardingGoalNextBtn.textContent = i18n.t('action.next');
        
        // 목표 일수 입력 필드 실시간 유효성 검사
        if (elements.onboardingTargetDaysInput && elements.onboardingTargetDaysInput.parentNode) {
            const newInput = elements.onboardingTargetDaysInput.cloneNode(true);
            newInput.value = elements.onboardingTargetDaysInput.value;
            elements.onboardingTargetDaysInput.parentNode.replaceChild(newInput, elements.onboardingTargetDaysInput);
            elements.onboardingTargetDaysInput = newInput;
        }
        
        // 목표 일수 입력 필드에서 소수점 입력 방지
        elements.onboardingTargetDaysInput.addEventListener('input', (e) => {
            const valueStr = e.target.value;
            // 숫자만 허용 (소수점 제외)
            const cleanedValue = valueStr.replace(/[^0-9]/g, '');
            if (valueStr !== cleanedValue) {
                e.target.value = cleanedValue;
            }
            e.target.value = normalizeNumericInput(e.target.value, false);
        });
        
        elements.onboardingTargetDaysInput.addEventListener('blur', async () => {
            // blur 시에도 소수점 제거
            const valueStr = elements.onboardingTargetDaysInput.value;
            const cleanedValue = valueStr.replace(/[^0-9]/g, '');
            if (valueStr !== cleanedValue) {
                elements.onboardingTargetDaysInput.value = cleanedValue;
            }
            elements.onboardingTargetDaysInput.value = normalizeNumericInput(elements.onboardingTargetDaysInput.value, false);
            
            const targetDays = Number(elements.onboardingTargetDaysInput.value);
            const currentDate = new Date();
            const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            
            // 최소값 검사 (15일 미만)
            if (targetDays < 15) {
                const errorMessage = i18n.t('settings.goal.errorDaysMin', { min: MIN_GOAL_DAYS }) || `목표 일수는 최소 ${MIN_GOAL_DAYS}일입니다. ${MIN_GOAL_DAYS}일로 자동 수정되었습니다.`;
                showOnboardingInputError(errorMessage, elements.onboardingTargetDaysInput, elements.onboardingGoalNextBtn, 'onboarding-target-days-error');
                elements.onboardingTargetDaysInput.value = 15;
                return;
            }
            
            // 최대값 검사 (이번 달 날짜 초과)
            if (targetDays > daysInMonth) {
                const errorMessage = i18n.t('settings.goal.errorDaysMax', { max: daysInMonth }) || `목표 일수는 이번 달 마지막 날(${daysInMonth}일)을 넘을 수 없습니다. ${daysInMonth}일로 자동 수정되었습니다.`;
                showOnboardingInputError(errorMessage, elements.onboardingTargetDaysInput, elements.onboardingGoalNextBtn, 'onboarding-target-days-error');
                elements.onboardingTargetDaysInput.value = daysInMonth;
                return;
            }
            elements.onboardingTargetDaysInput.value = normalizeNumericInput(elements.onboardingTargetDaysInput.value, false);
        });
        
        // 보너스 금액 입력 필드 실시간 유효성 검사
        if (elements.onboardingBonusAmountInput && elements.onboardingBonusAmountInput.parentNode) {
            const newInput = elements.onboardingBonusAmountInput.cloneNode(true);
            newInput.value = elements.onboardingBonusAmountInput.value;
            elements.onboardingBonusAmountInput.parentNode.replaceChild(newInput, elements.onboardingBonusAmountInput);
            elements.onboardingBonusAmountInput = newInput;
        }
        // 보너스 금액은 레이블에 (₩) 표시되므로 입력 필드 옆 기호 제거
        const bonusSymbol = elements.onboardingBonusAmountInput.parentElement?.querySelector('.currency-symbol');
        if (bonusSymbol) bonusSymbol.remove();
        
        // 보너스 금액 입력 필드에서 소수점 자릿수 실시간 제한
        elements.onboardingBonusAmountInput.addEventListener('input', (e) => {
            const valueStr = e.target.value;
            // 숫자만 허용 (소수점 포함)
            const cleanedValue = valueStr.replace(/[^0-9.]/g, '');
            if (valueStr !== cleanedValue) {
                e.target.value = cleanedValue;
            }
            
            // 소수점 자릿수 실시간 제한 (입력 중에 자릿수 초과 방지)
            const currencyDecimal = state.settings?.currency?.decimal || 0;
            const finalValueStr = e.target.value;
            if (finalValueStr && finalValueStr.includes('.')) {
                const parts = finalValueStr.split('.');
                const integerPart = parts[0];
                const decimalPart = parts[1];
                if (decimalPart && decimalPart.length > currencyDecimal) {
                    // 소수점 자릿수 초과 시 자동으로 잘라내기
                    const limitedDecimal = decimalPart.substring(0, currencyDecimal);
                    e.target.value = currencyDecimal > 0 ? `${integerPart}.${limitedDecimal}` : integerPart;
                }
            }
            e.target.value = normalizeNumericInput(e.target.value, true);
        });
        
        elements.onboardingBonusAmountInput.addEventListener('blur', async () => {
            // blur 시에도 소수점 자릿수 제한 및 반올림
            const currencyDecimal = state.settings?.currency?.decimal || 0;
            const finalValueStr = elements.onboardingBonusAmountInput.value;
            if (finalValueStr.includes('.')) {
                const decimalPart = finalValueStr.split('.')[1];
                if (decimalPart && decimalPart.length > currencyDecimal) {
                    // 소수점 자릿수 초과 시 반올림
                    const rounded = parseFloat(finalValueStr).toFixed(currencyDecimal);
                    elements.onboardingBonusAmountInput.value = rounded;
                }
            }
            elements.onboardingBonusAmountInput.value = normalizeNumericInput(elements.onboardingBonusAmountInput.value, true);
            
            const bonusAmount = Number(elements.onboardingBonusAmountInput.value) || 0;
            const maxAmount = state.settings?.currency?.maxAmount || 10000000;
            
            // 최대값 검사 (통화별 최대 금액 초과)
            if (bonusAmount > maxAmount) {
                const errorMessage = i18n.t('settings.goal.errorBonusMaxAuto', { amount: formatCurrency(maxAmount) });
                showOnboardingInputError(errorMessage, elements.onboardingBonusAmountInput, elements.onboardingGoalNextBtn, 'onboarding-bonus-error');
                elements.onboardingBonusAmountInput.value = maxAmount;
                return;
            }
            
            // 최소값 검사 (0 미만)
            if (bonusAmount < 0) {
                const errorMessage = i18n.t('settings.goal.errorBonusMin') || '보너스 금액은 0 이상이어야 합니다. 0으로 자동 수정되었습니다.';
                showOnboardingInputError(errorMessage, elements.onboardingBonusAmountInput, elements.onboardingGoalNextBtn, 'onboarding-bonus-error');
                elements.onboardingBonusAmountInput.value = 0;
                return;
            }
            elements.onboardingBonusAmountInput.value = normalizeNumericInput(elements.onboardingBonusAmountInput.value, true);
        });
        
        // 다음 버튼 이벤트
        if (elements.onboardingGoalNextBtn && elements.onboardingGoalNextBtn.parentNode) {
            const newNextBtn = elements.onboardingGoalNextBtn.cloneNode(true);
            elements.onboardingGoalNextBtn.parentNode.replaceChild(newNextBtn, elements.onboardingGoalNextBtn);
            elements.onboardingGoalNextBtn = newNextBtn;
        }
        
        elements.onboardingGoalNextBtn.addEventListener('click', async () => {
            const targetDays = Number(elements.onboardingTargetDaysInput.value);
            let bonusAmount = Number(elements.onboardingBonusAmountInput.value) || 0;
            const maxAmount = state.settings?.currency?.maxAmount || 10000000;
            
            // 유효성 검사
            const currentDate = new Date();
            const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            
            // 최소값 검사 (15일 미만)
            if (targetDays < 15) {
                const errorMessage = i18n.t('settings.goal.errorDaysMin', { min: MIN_GOAL_DAYS }) || `목표 일수는 최소 ${MIN_GOAL_DAYS}일입니다. ${MIN_GOAL_DAYS}일로 자동 수정되었습니다.`;
                showOnboardingInputError(errorMessage, elements.onboardingTargetDaysInput, elements.onboardingGoalNextBtn, 'onboarding-target-days-error');
                elements.onboardingTargetDaysInput.value = 15;
                return;
            }
            
            // 최대값 검사 (이번 달 날짜 초과)
            if (targetDays > daysInMonth) {
                const errorMessage = i18n.t('settings.goal.errorDaysMax', { max: daysInMonth }) || `목표 일수는 이번 달 마지막 날(${daysInMonth}일)을 넘을 수 없습니다. ${daysInMonth}일로 자동 수정되었습니다.`;
                showOnboardingInputError(errorMessage, elements.onboardingTargetDaysInput, elements.onboardingGoalNextBtn, 'onboarding-target-days-error');
                elements.onboardingTargetDaysInput.value = daysInMonth;
                return;
            }
            
            // 보너스 금액 최대값 검사 및 자동 조정
            if (bonusAmount > maxAmount) {
                const errorMessage = i18n.t('settings.goal.errorBonusMaxAuto', { amount: formatCurrency(maxAmount) });
                showOnboardingInputError(errorMessage, elements.onboardingBonusAmountInput, elements.onboardingGoalNextBtn, 'onboarding-bonus-error');
                bonusAmount = maxAmount;
                elements.onboardingBonusAmountInput.value = maxAmount;
                return;
            }
            
            // 보너스 금액 최소값 검사
            if (bonusAmount < 0) {
                const errorMessage = i18n.t('settings.goal.errorBonusMin') || '보너스 금액은 0 이상이어야 합니다. 0으로 자동 수정되었습니다.';
                showOnboardingInputError(errorMessage, elements.onboardingBonusAmountInput, elements.onboardingGoalNextBtn, 'onboarding-bonus-error');
                bonusAmount = 0;
                elements.onboardingBonusAmountInput.value = 0;
                return;
            }
            
            // 설정 저장
            // goalDays는 달력 연계형이므로 restConstant로 변환하여 저장
            // restConstant = daysInMonth - targetDays
            state.settings.restConstant = daysInMonth - targetDays;
            state.settings.goalBonus = bonusAmount;
            // goalDays도 저장 (참고용, 실제로는 restConstant로 계산됨)
            state.settings.goalDays = targetDays;
            
            showStep(8);
            setupStep8();
        });
    }
    // 8단계: 완료
    function setupStep8() {
        elements.completeTitle.textContent = i18n.t('onboarding.complete.title');
        elements.completeMessage.innerHTML = `
            <p>${i18n.t('onboarding.complete.saved')}</p>
        `;
        elements.completeStartBtn.textContent = i18n.t('onboarding.complete.start');
        
        // 기존 이벤트 리스너 제거를 위해 새 인스턴스 생성
        if (elements.completeStartBtn && elements.completeStartBtn.parentNode) {
            const newStartBtn = elements.completeStartBtn.cloneNode(true);
            elements.completeStartBtn.parentNode.replaceChild(newStartBtn, elements.completeStartBtn);
            elements.completeStartBtn = newStartBtn;
        }
        
        elements.completeStartBtn.addEventListener('click', () => {
            void completeOnboardingAndLaunch();
        });
    }
    
    // 첫 번째 단계 시작 (초기 history 상태 설정)
    showStep(1);
    setupStep1();
    
    // cleanup 함수 반환 (필요시 사용)
    return () => {
        window.removeEventListener('popstate', handlePopState);
        if (expansionSubjectAddedForStep5) {
            window.removeEventListener(STUDY_EXPANSION_SUBJECT_ADDED_EVENT, expansionSubjectAddedForStep5);
            expansionSubjectAddedForStep5 = null;
        }
    };
}