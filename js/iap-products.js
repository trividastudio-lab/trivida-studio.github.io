/**
 * Google Play Console에 등록된 인앱 상품 ID (관리 콘솔 Product ID와 동일해야 함)
 */
export const PRODUCT_IDS = {
    SUBJECTS_EXPANSION: 'subjects_expansion',
    LOCK_FEATURE: 'lock_feature',
};

/** 자발적 후원(소모성) — 스토어에 동일 ID 등록 필요. amountKrw는 UI 표시용이 아니라 기획·문서용 참고 값입니다. */
export const DONATION_PRODUCTS = {
    SMALL: { id: 'donation_small', amountKrw: 1000 },
    MEDIUM: { id: 'donation_medium', amountKrw: 3000 },
    LARGE: { id: 'donation_large', amountKrw: 5000 },
};
