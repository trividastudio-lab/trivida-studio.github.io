/**
 * 프로덕션 빌드: 반드시 false 유지.
 * 로컬·에뮬에서만 true로 바꾼 뒤 테스트 (출시 전 원복)
 */
export const DEV_MODE = false;

/**
 * true: Android에서 목표 시간 켤 때 2단계(알람 및 리마인더·정확한 알람) 모달/설정 호출 안 함. 알림(1단계)만.
 * 원복 시 false.
 */
export const SKIP_ANDROID_EXACT_ALARM_PROMPT = false;
