/**
 * locales.js
 * 모든 언어의 LOCALE 메타데이터
 * 
 * 구조:
 * - localeOptions: 국가-언어 조합 배열
 * - 각 항목은 국가, 언어, 통화, 기본 설정 등의 메타데이터 포함
 * - 한 국가에 여러 언어가 있는 경우 각각 별도 항목으로 포함
 */

export const localeOptions = [
    // ========================================================================
    // 아시아
    // ========================================================================
    {
        country: 'KR',
        flag: '🇰🇷',
        countryName: '한국',
        language: 'ko',
        languageName: '한국어',
        currency: 'KRW',
        symbol: '₩',
        decimals: 0,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 200,
        maxAmount: 10000000,
        maxSubjectAmount: 1000000,
        defaultBonus: 10000,
        defaultSubjects: [
            { name: '국어', amount: 200 },
            { name: '수학', amount: 200 },
            { name: '영어', amount: 200 },
            { name: '과학', amount: 200 }
        ],
        maxLengths: { name: 8, subject: 15, reason: 20 }
    },
    {
        country: 'JP',
        flag: '🇯🇵',
        countryName: '日本',
        language: 'ja',
        languageName: '日本語',
        currency: 'JPY',
        symbol: '¥',
        decimals: 0,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 20,
        maxAmount: 1000000,
        maxSubjectAmount: 100000,
        defaultBonus: 1000,
        defaultSubjects: [
            { name: '国語', amount: 20 },
            { name: '算数', amount: 20 },
            { name: '理科', amount: 20 },
            { name: '社会', amount: 20 }
        ],
        maxLengths: { name: 8, subject: 20, reason: 25 }
    },
    {
        country: 'CN',
        flag: '🇨🇳',
        countryName: '中国',
        language: 'zh-CN',
        languageName: '简体中文',
        currency: 'CNY',
        symbol: '¥',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 2.00,
        maxAmount: 100000,
        maxSubjectAmount: 10000,
        defaultBonus: 100.00,
        defaultSubjects: [
            { name: '语文', amount: 2.00 },
            { name: '数学', amount: 2.00 },
            { name: '英语', amount: 2.00 },
            { name: '科学', amount: 2.00 }
        ],
        maxLengths: { name: 8, subject: 20, reason: 25 }
    },
    {
        country: 'TW',
        flag: '🇹🇼',
        countryName: '台灣',
        language: 'zh-TW',
        languageName: '繁體中文',
        currency: 'TWD',
        symbol: 'NT$',
        decimals: 0,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 10,
        maxAmount: 100000,
        maxSubjectAmount: 10000,
        defaultBonus: 500,
        defaultSubjects: [
            { name: '國語', amount: 10 },
            { name: '數學', amount: 10 },
            { name: '英語', amount: 10 },
            { name: '自然', amount: 10 }
        ],
        maxLengths: { name: 8, subject: 20, reason: 25 }
    },
    {
        country: 'MN',
        flag: '🇲🇳',
        countryName: 'Монгол',
        language: 'mn',
        languageName: 'Монгол',
        currency: 'MNT',
        symbol: '₮',
        decimals: 0,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 500,
        maxAmount: 1000000,
        maxSubjectAmount: 100000,
        defaultBonus: 25000,
        defaultSubjects: [
            { name: 'Монгол хэл', amount: 500 },
            { name: 'Математик', amount: 500 },
            { name: 'Англи хэл', amount: 500 },
            { name: 'Байгаль', amount: 500 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },

    // ========================================================================
    // 동남아시아
    // ========================================================================
    {
        country: 'VN',
        flag: '🇻🇳',
        countryName: 'Việt Nam',
        language: 'vi',
        languageName: 'Tiếng Việt',
        currency: 'VND',
        symbol: 'K',
        decimals: 0,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 2,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 50,
        defaultSubjects: [
            { name: 'Toán', amount: 2 },
            { name: 'Tiếng Việt', amount: 2 },
            { name: 'Tiếng Anh', amount: 2 },
            { name: 'Khoa học', amount: 2 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'TH',
        flag: '🇹🇭',
        countryName: 'ประเทศไทย',
        language: 'th',
        languageName: 'ไทย',
        currency: 'THB',
        symbol: '฿',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 5.00,
        maxAmount: 100000,
        maxSubjectAmount: 10000,
        defaultBonus: 200.00,
        defaultSubjects: [
            { name: 'ภาษาไทย', amount: 5.00 },
            { name: 'คณิตศาสตร์', amount: 5.00 },
            { name: 'ภาษาอังกฤษ', amount: 5.00 },
            { name: 'วิทยาศาสตร์', amount: 5.00 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'ID',
        flag: '🇮🇩',
        countryName: 'Indonesia',
        language: 'id',
        languageName: 'Bahasa Indonesia',
        currency: 'IDR',
        symbol: 'rb',
        decimals: 0,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 2,
        maxAmount: 10000000,
        maxSubjectAmount: 1000000,
        defaultBonus: 50,
        defaultSubjects: [
            { name: 'Bahasa Indonesia', amount: 2 },
            { name: 'Matematika', amount: 2 },
            { name: 'Bahasa Inggris', amount: 2 },
            { name: 'IPA', amount: 2 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'MY',
        flag: '🇲🇾',
        countryName: 'Malaysia',
        language: 'ms',
        languageName: 'Bahasa Melayu',
        currency: 'MYR',
        symbol: 'RM',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 2.00,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 50.00,
        defaultSubjects: [
            { name: 'Bahasa Melayu', amount: 2.00 },
            { name: 'Matematik', amount: 2.00 },
            { name: 'Bahasa Inggeris', amount: 2.00 },
            { name: 'Sains', amount: 2.00 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'PH',
        flag: '🇵🇭',
        countryName: 'Pilipinas',
        language: 'fil',
        languageName: 'Filipino',
        currency: 'PHP',
        symbol: '₱',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 5.00,
        maxAmount: 100000,
        maxSubjectAmount: 10000,
        defaultBonus: 200.00,
        defaultSubjects: [
            { name: 'Filipino', amount: 5.00 },
            { name: 'Matematika', amount: 5.00 },
            { name: 'English', amount: 5.00 },
            { name: 'Agham', amount: 5.00 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },

    // ========================================================================
    // 남아시아
    // ========================================================================
    {
        country: 'IN',
        flag: '🇮🇳',
        countryName: 'भारत',
        language: 'hi',
        languageName: 'हिन्दी',
        currency: 'INR',
        symbol: '₹',
        decimals: 0,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 5,
        maxAmount: 1000000,
        maxSubjectAmount: 100000,
        defaultBonus: 200,
        defaultSubjects: [
            { name: 'हिंदी', amount: 5 },
            { name: 'गणित', amount: 5 },
            { name: 'अंग्रेजी', amount: 5 },
            { name: 'विज्ञान', amount: 5 }
        ],
        maxLengths: { name: 15, subject: 20, reason: 25 }
    },

    // ========================================================================
    // 북미
    // ========================================================================
    {
        country: 'US',
        flag: '🇺🇸',
        countryName: 'United States',
        language: 'en-US',
        languageName: 'English',
        currency: 'USD',
        symbol: '$',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'English', amount: 0.20 },
            { name: 'Math', amount: 0.20 },
            { name: 'Science', amount: 0.20 },
            { name: 'History', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'CA',
        flag: '🇨🇦',
        countryName: 'Canada',
        language: 'en',
        languageName: 'English',
        currency: 'CAD',
        symbol: 'C$',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        languagePriority: 1, // 인구수 기준 우선순위 (영어 약 75%)
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'English', amount: 0.20 },
            { name: 'Math', amount: 0.20 },
            { name: 'Science', amount: 0.20 },
            { name: 'History', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'CA',
        flag: '🇨🇦',
        countryName: 'Canada',
        language: 'fr',
        languageName: 'Français',
        currency: 'CAD',
        symbol: 'C$',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        languagePriority: 2, // 인구수 기준 우선순위 (프랑스어 약 25%)
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Français', amount: 0.20 },
            { name: 'Mathématiques', amount: 0.20 },
            { name: 'Histoire-Géo', amount: 0.20 },
            { name: 'Sciences', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },

    // ========================================================================
    // 중남미
    // ========================================================================
    {
        country: 'MX',
        flag: '🇲🇽',
        countryName: 'México',
        language: 'es',
        languageName: 'Español',
        currency: 'MXN',
        symbol: '$',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 4.00,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 50.00,
        defaultSubjects: [
            { name: 'Lengua', amount: 4.00 },
            { name: 'Matemáticas', amount: 4.00 },
            { name: 'Inglés', amount: 4.00 },
            { name: 'Ciencias', amount: 4.00 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'AR',
        flag: '🇦🇷',
        countryName: 'Argentina',
        language: 'es',
        languageName: 'Español',
        currency: 'ARS',
        symbol: '$',
        decimals: 0,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 350,
        maxAmount: 1000000,
        maxSubjectAmount: 100000,
        defaultBonus: 5000,
        defaultSubjects: [
            { name: 'Lengua', amount: 350 },
            { name: 'Matemáticas', amount: 350 },
            { name: 'Inglés', amount: 350 },
            { name: 'Ciencias', amount: 350 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'CO',
        flag: '🇨🇴',
        countryName: 'Colombia',
        language: 'es',
        languageName: 'Español',
        currency: 'COP',
        symbol: '$',
        decimals: 0,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 750,
        maxAmount: 1000000,
        maxSubjectAmount: 100000,
        defaultBonus: 10000,
        defaultSubjects: [
            { name: 'Lengua', amount: 750 },
            { name: 'Matemáticas', amount: 750 },
            { name: 'Inglés', amount: 750 },
            { name: 'Ciencias', amount: 750 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'CL',
        flag: '🇨🇱',
        countryName: 'Chile',
        language: 'es',
        languageName: 'Español',
        currency: 'CLP',
        symbol: '$',
        decimals: 0,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 250,
        maxAmount: 1000000,
        maxSubjectAmount: 100000,
        defaultBonus: 5000,
        defaultSubjects: [
            { name: 'Lengua', amount: 250 },
            { name: 'Matemáticas', amount: 250 },
            { name: 'Inglés', amount: 250 },
            { name: 'Ciencias', amount: 250 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'BR',
        flag: '🇧🇷',
        countryName: 'Brasil',
        language: 'pt',
        languageName: 'Português',
        currency: 'BRL',
        symbol: 'R$',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 0.50,
        maxAmount: 100000,
        maxSubjectAmount: 10000,
        defaultBonus: 20.00,
        defaultSubjects: [
            { name: 'Português', amount: 0.50 },
            { name: 'Matemática', amount: 0.50 },
            { name: 'Inglês', amount: 0.50 },
            { name: 'Ciências', amount: 0.50 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },

    // ========================================================================
    // 서유럽
    // ========================================================================
    {
        country: 'GB',
        flag: '🇬🇧',
        countryName: 'United Kingdom',
        language: 'en-GB',
        languageName: 'English',
        currency: 'GBP',
        symbol: '£',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'English', amount: 0.20 },
            { name: 'Maths', amount: 0.20 },
            { name: 'Science', amount: 0.20 },
            { name: 'Geography', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'IE',
        flag: '🇮🇪',
        countryName: 'Ireland',
        language: 'en',
        languageName: 'English',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'English', amount: 0.20 },
            { name: 'Maths', amount: 0.20 },
            { name: 'Science', amount: 0.20 },
            { name: 'Geography', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'FR',
        flag: '🇫🇷',
        countryName: 'France',
        language: 'fr',
        languageName: 'Français',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Français', amount: 0.20 },
            { name: 'Mathématiques', amount: 0.20 },
            { name: 'Histoire-Géo', amount: 0.20 },
            { name: 'Sciences', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'BE',
        flag: '🇧🇪',
        countryName: 'Belgique',
        language: 'fr',
        languageName: 'Français',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        languagePriority: 2, // 인구수 기준 우선순위 (프랑스어 약 40%)
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Français', amount: 0.20 },
            { name: 'Mathématiques', amount: 0.20 },
            { name: 'Histoire-Géo', amount: 0.20 },
            { name: 'Sciences', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'BE',
        flag: '🇧🇪',
        countryName: 'België',
        language: 'nl',
        languageName: 'Nederlands',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        languagePriority: 1, // 인구수 기준 우선순위 (네덜란드어 약 60%)
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Nederlands', amount: 0.20 },
            { name: 'Wiskunde', amount: 0.20 },
            { name: 'Engels', amount: 0.20 },
            { name: 'Aardrijkskunde', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'NL',
        flag: '🇳🇱',
        countryName: 'Nederland',
        language: 'nl',
        languageName: 'Nederlands',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Nederlands', amount: 0.20 },
            { name: 'Wiskunde', amount: 0.20 },
            { name: 'Engels', amount: 0.20 },
            { name: 'Aardrijkskunde', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'DE',
        flag: '🇩🇪',
        countryName: 'Deutschland',
        language: 'de',
        languageName: 'Deutsch',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Deutsch', amount: 0.20 },
            { name: 'Mathematik', amount: 0.20 },
            { name: 'Englisch', amount: 0.20 },
            { name: 'Naturwissenschaften', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'AT',
        flag: '🇦🇹',
        countryName: 'Österreich',
        language: 'de',
        languageName: 'Deutsch',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Deutsch', amount: 0.20 },
            { name: 'Mathematik', amount: 0.20 },
            { name: 'Englisch', amount: 0.20 },
            { name: 'Naturwissenschaften', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'CH',
        flag: '🇨🇭',
        countryName: 'Schweiz',
        language: 'de',
        languageName: 'Deutsch',
        currency: 'CHF',
        symbol: 'Fr.',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        languagePriority: 1, // 인구수 기준 우선순위 (독일어 약 65%)
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Deutsch', amount: 0.20 },
            { name: 'Mathematik', amount: 0.20 },
            { name: 'Englisch', amount: 0.20 },
            { name: 'Naturwissenschaften', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'CH',
        flag: '🇨🇭',
        countryName: 'Suisse',
        language: 'fr',
        languageName: 'Français',
        currency: 'CHF',
        symbol: 'Fr.',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        languagePriority: 2, // 인구수 기준 우선순위 (프랑스어 약 23%)
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Français', amount: 0.20 },
            { name: 'Mathématiques', amount: 0.20 },
            { name: 'Histoire-Géo', amount: 0.20 },
            { name: 'Sciences', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'IT',
        flag: '🇮🇹',
        countryName: 'Italia',
        language: 'it',
        languageName: 'Italiano',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Italiano', amount: 0.20 },
            { name: 'Matematica', amount: 0.20 },
            { name: 'Storia', amount: 0.20 },
            { name: 'Inglese', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'ES',
        flag: '🇪🇸',
        countryName: 'España',
        language: 'es',
        languageName: 'Español',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Lengua', amount: 0.20 },
            { name: 'Matemáticas', amount: 0.20 },
            { name: 'Inglés', amount: 0.20 },
            { name: 'Ciencias', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'PT',
        flag: '🇵🇹',
        countryName: 'Portugal',
        language: 'pt',
        languageName: 'Português',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Português', amount: 0.20 },
            { name: 'Matemática', amount: 0.20 },
            { name: 'Inglês', amount: 0.20 },
            { name: 'Ciências', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },

    // ========================================================================
    // 북유럽
    // ========================================================================
    {
        country: 'FI',
        flag: '🇫🇮',
        countryName: 'Suomi',
        language: 'fi',
        languageName: 'Suomi',
        currency: 'EUR',
        symbol: '€',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'Suomi', amount: 0.20 },
            { name: 'Matematiikka', amount: 0.20 },
            { name: 'Englanti', amount: 0.20 },
            { name: 'Luonnontiede', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'SE',
        flag: '🇸🇪',
        countryName: 'Sverige',
        language: 'sv',
        languageName: 'Svenska',
        currency: 'SEK',
        symbol: 'kr',
        decimals: 0,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 2,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 50,
        defaultSubjects: [
            { name: 'Svenska', amount: 2 },
            { name: 'Matematik', amount: 2 },
            { name: 'Engelska', amount: 2 },
            { name: 'Naturvetenskap', amount: 2 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'NO',
        flag: '🇳🇴',
        countryName: 'Norge',
        language: 'no',
        languageName: 'Norsk',
        currency: 'NOK',
        symbol: 'kr',
        decimals: 0,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 2,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 50,
        defaultSubjects: [
            { name: 'Norsk', amount: 2 },
            { name: 'Matematikk', amount: 2 },
            { name: 'Engelsk', amount: 2 },
            { name: 'Naturfag', amount: 2 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'DK',
        flag: '🇩🇰',
        countryName: 'Danmark',
        language: 'da',
        languageName: 'Dansk',
        currency: 'DKK',
        symbol: 'kr',
        decimals: 0,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 2,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 50,
        defaultSubjects: [
            { name: 'Dansk', amount: 2 },
            { name: 'Matematik', amount: 2 },
            { name: 'Engelsk', amount: 2 },
            { name: 'Naturvidenskab', amount: 2 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },

    // ========================================================================
    // 동유럽
    // ========================================================================
    {
        country: 'PL',
        flag: '🇵🇱',
        countryName: 'Polska',
        language: 'pl',
        languageName: 'Polski',
        currency: 'PLN',
        symbol: 'zł',
        decimals: 2,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 2.00,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 50.00,
        defaultSubjects: [
            { name: 'Język polski', amount: 2.00 },
            { name: 'Matematyka', amount: 2.00 },
            { name: 'Język angielski', amount: 2.00 },
            { name: 'Przyroda', amount: 2.00 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'RU',
        flag: '🇷🇺',
        countryName: 'Россия',
        language: 'ru',
        languageName: 'Русский',
        currency: 'RUB',
        symbol: '₽',
        decimals: 0,
        rtl: false,
        currencyPosition: 'after',
        defaultAmount: 20,
        maxAmount: 1000000,
        maxSubjectAmount: 100000,
        defaultBonus: 1000,
        defaultSubjects: [
            { name: 'Русский язык', amount: 20 },
            { name: 'Математика', amount: 20 },
            { name: 'Английский', amount: 20 },
            { name: 'Наука', amount: 20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'TR',
        flag: '🇹🇷',
        countryName: 'Türkiye',
        language: 'tr',
        languageName: 'Türkçe',
        currency: 'TRY',
        symbol: '₺',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 5.00,
        maxAmount: 100000,
        maxSubjectAmount: 10000,
        defaultBonus: 200.00,
        defaultSubjects: [
            { name: 'Türkçe', amount: 5.00 },
            { name: 'Matematik', amount: 5.00 },
            { name: 'İngilizce', amount: 5.00 },
            { name: 'Fen Bilgisi', amount: 5.00 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },

    // ========================================================================
    // 중동
    // ========================================================================
    {
        country: 'SA',
        flag: '🇸🇦',
        countryName: 'السعودية',
        language: 'ar',
        languageName: 'العربية',
        currency: 'SAR',
        symbol: '﷼',
        decimals: 2,
        rtl: true,
        currencyPosition: 'before',
        defaultAmount: 1.00,
        maxAmount: 50000,
        maxSubjectAmount: 5000,
        defaultBonus: 50.00,
        defaultSubjects: [
            { name: 'اللغة العربية', amount: 1.00 },
            { name: 'الرياضيات', amount: 1.00 },
            { name: 'اللغة الإنجليزية', amount: 1.00 },
            { name: 'العلوم', amount: 1.00 }
        ],
        maxLengths: { name: 22, subject: 25, reason: 30 }
    },
    {
        country: 'AE',
        flag: '🇦🇪',
        countryName: 'الإمارات',
        language: 'ar',
        languageName: 'العربية',
        currency: 'AED',
        symbol: 'د.إ',
        decimals: 2,
        rtl: true,
        currencyPosition: 'before',
        defaultAmount: 1.00,
        maxAmount: 50000,
        maxSubjectAmount: 5000,
        defaultBonus: 50.00,
        defaultSubjects: [
            { name: 'اللغة العربية', amount: 1.00 },
            { name: 'الرياضيات', amount: 1.00 },
            { name: 'اللغة الإنجليزية', amount: 1.00 },
            { name: 'العلوم', amount: 1.00 }
        ],
        maxLengths: { name: 22, subject: 20, reason: 25 }
    },
    {
        country: 'EG',
        flag: '🇪🇬',
        countryName: 'مصر',
        language: 'ar',
        languageName: 'العربية',
        currency: 'EGP',
        symbol: '£',
        decimals: 2,
        rtl: true,
        currencyPosition: 'before',
        defaultAmount: 1.00,
        maxAmount: 50000,
        maxSubjectAmount: 5000,
        defaultBonus: 50.00,
        defaultSubjects: [
            { name: 'اللغة العربية', amount: 1.00 },
            { name: 'الرياضيات', amount: 1.00 },
            { name: 'اللغة الإنجليزية', amount: 1.00 },
            { name: 'العلوم', amount: 1.00 }
        ],
        maxLengths: { name: 22, subject: 20, reason: 25 }
    },
    {
        country: 'IL',
        flag: '🇮🇱',
        countryName: 'ישראל',
        language: 'he',
        languageName: 'עברית',
        currency: 'ILS',
        symbol: '₪',
        decimals: 2,
        rtl: true,
        currencyPosition: 'before',
        defaultAmount: 2.00,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 50.00,
        defaultSubjects: [
            { name: 'עברית', amount: 2.00 },
            { name: 'מתמטיקה', amount: 2.00 },
            { name: 'אנגלית', amount: 2.00 },
            { name: 'מדעים', amount: 2.00 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },

    // ========================================================================
    // 오세아니아
    // ========================================================================
    {
        country: 'AU',
        flag: '🇦🇺',
        countryName: 'Australia',
        language: 'en',
        languageName: 'English',
        currency: 'AUD',
        symbol: 'A$',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'English', amount: 0.20 },
            { name: 'Math', amount: 0.20 },
            { name: 'Science', amount: 0.20 },
            { name: 'History', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    },
    {
        country: 'NZ',
        flag: '🇳🇿',
        countryName: 'New Zealand',
        language: 'en',
        languageName: 'English',
        currency: 'NZD',
        symbol: 'NZ$',
        decimals: 2,
        rtl: false,
        currencyPosition: 'before',
        defaultAmount: 0.20,
        maxAmount: 10000,
        maxSubjectAmount: 1000,
        defaultBonus: 10.00,
        defaultSubjects: [
            { name: 'English', amount: 0.20 },
            { name: 'Math', amount: 0.20 },
            { name: 'Science', amount: 0.20 },
            { name: 'History', amount: 0.20 }
        ],
        maxLengths: { name: 18, subject: 25, reason: 30 }
    }
];

/**
 * localeOptions.language → languages.js 키 (onboarding 등과 동일 규칙)
 * @param {string} langCode
 * @returns {string}
 */
export function getLanguageMapping(langCode) {
    const languageMapping = {
        en: 'en-US',
        'en-CA': 'en-US',
        'en-AU': 'en-US',
        'en-NZ': 'en-US',
        'en-IE': 'en-GB',
        'fr-CA': 'fr',
        'fr-BE': 'fr',
        'fr-CH': 'fr',
        'nl-BE': 'nl',
        'de-AT': 'de',
        'de-CH': 'de',
        'es-MX': 'es',
        'es-AR': 'es',
        'es-CO': 'es',
        'es-CL': 'es',
        'pt-PT': 'pt',
        'zh-HK': 'zh-TW',
        'ar-AE': 'ar',
        'ar-EG': 'ar',
    };
    return languageMapping[langCode] || langCode;
}

/**
 * 저장된 국가 + UI 언어 코드(예: en-US)로 localeOptions의 정확한 한 행을 찾습니다.
 * @param {string} countryCode
 * @param {string} uiLanguageCode languages.js / i18n에 쓰는 코드
 * @returns {object|null}
 */
export function getLocaleRowForUser(countryCode, uiLanguageCode) {
    if (!countryCode || !uiLanguageCode) return null;
    const locales = localeOptions.filter((l) => l.country === countryCode);
    if (locales.length === 0) return null;
    const byExact = locales.find((l) => l.language === uiLanguageCode);
    if (byExact) return byExact;
    const byMapped = locales.find((l) => getLanguageMapping(l.language) === uiLanguageCode);
    if (byMapped) return byMapped;
    const sorted = getLocalesByCountry(countryCode);
    return sorted[0] || null;
}

/**
 * 헬퍼 함수들
 */

/**
 * 언어 코드로 localeOption 찾기
 * @param {string} language - 언어 코드 (예: 'ko', 'en-US', 'fr')
 * @returns {object|null} localeOption 객체 또는 null
 */
export function getLocaleByLanguage(language) {
    return localeOptions.find(locale => locale.language === language) || null;
}

/**
 * 국가 코드로 localeOption 찾기 (첫 번째 매칭 항목)
 * @param {string} country - 국가 코드 (예: 'KR', 'US', 'CA')
 * @returns {object|null} localeOption 객체 또는 null
 */
export function getLocaleByCountry(country) {
    return localeOptions.find(locale => locale.country === country) || null;
}

/**
 * 국가 코드로 모든 localeOption 찾기 (다중 언어 국가 대응)
 * @param {string} country - 국가 코드 (예: 'CA', 'BE', 'CH')
 * @returns {array} localeOption 객체 배열
 */
export function getLocalesByCountry(country) {
    const locales = localeOptions.filter(locale => locale.country === country);
    // languagePriority가 있는 경우 우선순위로 정렬 (낮은 숫자가 우선)
    return locales.sort((a, b) => {
        const priorityA = a.languagePriority ?? 999;
        const priorityB = b.languagePriority ?? 999;
        return priorityA - priorityB;
    });
}

/**
 * 언어 코드로 국가 코드 찾기
 * @param {string} language - 언어 코드
 * @returns {string|null} 국가 코드 또는 null
 */
export function getCountryByLanguage(language) {
    const locale = getLocaleByLanguage(language);
    return locale ? locale.country : null;
}

/**
 * 기존 resources 구조와의 호환성을 위한 헬퍼
 * localeOptions에서 기존 resources.countries 형태로 변환
 */
export function getCountryData(countryCode) {
    const locale = getLocaleByCountry(countryCode);
    if (!locale) return null;
    
    return {
        currency: {
            code: locale.currency,
            symbol: locale.symbol,
            position: locale.currencyPosition,
            decimal: locale.decimals,
            defaultAmount: locale.defaultAmount,
            maxAmount: locale.maxAmount,
            maxSubjectAmount: locale.maxSubjectAmount
        },
        defaultBonus: locale.defaultBonus,
        defaultSubjects: locale.defaultSubjects
    };
}

/**
 * 기존 resources.localeToCountry 형태로 변환
 * 주의: 동일 language 문자열(예: 'es', 'en')이 여러 국가에 쓰이면 배열 순서상 **마지막** 항목만 남습니다.
 * 국가별 통화·한도는 state.user.country + getCountryData / getLocaleRowForUser를 우선하세요.
 */
export function getLocaleToCountryMap() {
    const map = {};
    for (const locale of localeOptions) {
        map[locale.language] = locale.country;
    }
    return map;
}

/**
 * 기존 resources.maxLengths 형태로 변환
 * 주의: language 키가 겹치면 마지막 locale 행 기준으로 덮어씁니다.
 * 정확한 값은 getLocaleRowForUser(country, lang)?.maxLengths 또는 resources.getMaxLength(..., country)를 쓰세요.
 */
export function getMaxLengthsMap() {
    const map = {};
    for (const locale of localeOptions) {
        map[locale.language] = locale.maxLengths;
    }
    return map;
}

/**
 * 지원되는 국가 코드 목록
 * localeOptions에서 자동 파생 — 국가 추가/삭제 시 별도 수정 불필요
 */
export const SUPPORTED_COUNTRIES = [...new Set(localeOptions.map(l => l.country))].sort();
