/**
 * ANSI 색상 유틸리티
 */

const R = '\x1b[0m';

export const RESET = R;
export const DIM = '\x1b[2m';

export const dim = (s) => `${DIM}${s}${R}`;
export const red = (s) => `\x1b[31m${s}${R}`;
export const green = (s) => `\x1b[32m${s}${R}`;
export const yellow = (s) => `\x1b[33m${s}${R}`;
export const magenta = (s) => `\x1b[35m${s}${R}`;
export const cyan = (s) => `\x1b[36m${s}${R}`;
export const white = (s) => `\x1b[97m${s}${R}`;
export const brightGreen = (s) => `\x1b[92m${s}${R}`;
export const brightCyan = (s) => `\x1b[96m${s}${R}`;
export const brightRed = (s) => `\x1b[91m${s}${R}`;
export const brightBlue = (s) => `\x1b[94m${s}${R}`;
export const brightMagenta = (s) => `\x1b[95m${s}${R}`;

/**
 * 게이지 바 렌더링
 * @param {number} percent 0-100
 * @param {number} width 바 길이 (문자 수)
 * @returns {string} 색상 포함 바 문자열
 */
export function gauge(percent, width = 20) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  // ANSI 배경색 + 공백으로 게이지 표현 (폭 안전)
  let bg;
  if (percent >= 90) bg = '\x1b[41m';      // red bg
  else if (percent >= 75) bg = '\x1b[45m'; // magenta bg
  else if (percent >= 70) bg = '\x1b[43m'; // yellow bg
  else bg = '\x1b[42m';                    // green bg

  const filledBar = `${bg}${' '.repeat(filled)}${R}`;
  const emptyBar = empty > 0 ? `\x1b[100m${' '.repeat(empty)}${R}` : '';

  return `${filledBar}${emptyBar}`;
}

/**
 * 컨텍스트 바 색상 선택
 */
export function ctxColor(percent) {
  if (percent >= 85) return (s) => `\x1b[91m${s}${R}`;
  if (percent >= 70) return (s) => `\x1b[33m${s}${R}`;
  return (s) => `\x1b[32m${s}${R}`;
}

/**
 * 포맷: 토큰 수를 k 단위로
 */
export function fmtTokens(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/**
 * 포맷: 시간 표시
 */
export function fmtDuration(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
}

/**
 * 포맷: 리셋까지 남은 시간
 */
export function fmtTimeUntil(resetAt, now = Date.now()) {
  if (!resetAt) return '';
  const ms = new Date(resetAt).getTime() - now;
  if (ms <= 0) return '곧';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return `${days}d ${remH}h`;
}
