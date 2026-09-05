import { JWTInspector } from './jwtInspector.js';

/**
 * CookieHealthAdvisor evaluates cookies against modern security,
 * privacy, and browser-standard compliance best practices.
 */
export class CookieHealthAdvisor {
  /**
   * Analyzes an array or map of cookies.
   * @param {Array|object} cookies
   * @param {string} currentUrl
   * @return {{
   *   score: number,
   *   totalBytes: number,
   *   issues: Array<{type: string, severity: 'high'|'medium'|'low', cookieName: string, message: string}>,
   *   isHeaderOverflowRisk: boolean
   * }}
   */
  static analyze(cookies, currentUrl = '') {
    const list = Array.isArray(cookies)
      ? cookies
      : Object.values(cookies).map(c => c.cookie || c);

    const issues = [];
    let totalBytes = 0;
    const isHttps = currentUrl.startsWith('https:') || !currentUrl;

    const sensitiveNameRegex =
      /(session|sess|auth|token|jwt|id|key|secret|pass|login|account)/i;

    for (const c of list) {
      if (!c || !c.name) continue;

      const nameBytes = new TextEncoder().encode(c.name || '').length;
      const valBytes = new TextEncoder().encode(c.value || '').length;
      totalBytes += nameBytes + valBytes + 2; // "name=val; "

      const isSensitive =
        sensitiveNameRegex.test(c.name) || JWTInspector.isJWT(c.value);

      // 1. Check HttpOnly on sensitive cookies
      if (isSensitive && !c.httpOnly) {
        issues.push({
          type: 'MISSING_HTTPONLY',
          severity: 'high',
          cookieName: c.name,
          message: `敏感认证 Cookie "${c.name}" 缺少 HttpOnly 标志 (存在 XSS 窃取风险)。`,
        });
      }

      // 2. Check Secure on HTTPS
      if (isHttps && !c.secure) {
        issues.push({
          type: 'INSECURE_TRANSPORT',
          severity: 'high',
          cookieName: c.name,
          message: `HTTPS 环境下 Cookie "${c.name}" 未开启 Secure 标志 (存在明文泄露风险)。`,
        });
      }

      // 3. SameSite None without Secure
      if (
        (c.sameSite === 'no_restriction' || c.sameSite === 'none') &&
        !c.secure
      ) {
        issues.push({
          type: 'SAMESITE_NONE_INSECURE',
          severity: 'high',
          cookieName: c.name,
          message: `Cookie "${c.name}" 声明了 SameSite=None 但未开启 Secure (现代浏览器将直接拒绝)。`,
        });
      }

      // 4. Overly long expiration (> 400 days limit in Chrome)
      if (c.expirationDate) {
        const nowSec = Date.now() / 1000;
        const maxAllowedSec = nowSec + 400 * 24 * 3600;
        if (c.expirationDate > maxAllowedSec + 86400) {
          issues.push({
            type: 'EXCESSIVE_EXPIRATION',
            severity: 'low',
            cookieName: c.name,
            message: `Cookie "${c.name}" 有效期超过了 Chrome 400 天最大生命周期限制。`,
          });
        }
      }
    }

    // 5. Total Size / Header Budget (> 4096 bytes)
    const isHeaderOverflowRisk = totalBytes > 4096;
    if (isHeaderOverflowRisk) {
      issues.push({
        type: 'HEADER_SIZE_OVERFLOW',
        severity: 'medium',
        cookieName: '*',
        message: `Cookie 总大小 (${totalBytes} 字节) 超过 4KB 请求头预算上限 (可能导致服务端 HTTP 431 拒绝)。`,
      });
    }

    // Compute score (starts at 100, penalties for issues)
    let score = 100;
    for (const issue of issues) {
      if (issue.severity === 'high') score -= 15;
      else if (issue.severity === 'medium') score -= 10;
      else if (issue.severity === 'low') score -= 5;
    }
    score = Math.max(0, Math.min(100, score));

    return {
      score,
      totalBytes,
      issues,
      isHeaderOverflowRisk,
    };
  }

  /**
   * Automatically hardens cookie settings:
   * Sets Secure=true, SameSite=Lax (or keeps Strict), HttpOnly for sensitive cookies.
   * @param {Array} cookies
   * @return {Array}
   */
  static autoHarden(cookies) {
    const sensitiveNameRegex =
      /(session|sess|auth|token|jwt|id|key|secret|pass|login|account)/i;
    return (cookies || []).map(c => {
      const copy = { ...c };
      copy.secure = true;
      if (
        !copy.sameSite ||
        copy.sameSite === 'no_restriction' ||
        copy.sameSite === 'none'
      ) {
        copy.sameSite = 'lax';
      }
      if (
        sensitiveNameRegex.test(copy.name) ||
        JWTInspector.isJWT(copy.value)
      ) {
        copy.httpOnly = true;
      }
      return copy;
    });
  }
}
