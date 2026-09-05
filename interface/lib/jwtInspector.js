/**
 * JWTInspector detects and safely decodes JSON Web Tokens (JWT)
 * with expiration inspection and claim parsing.
 */
export class JWTInspector {
  /**
   * Checks if a string has the structure of a JWT (3 dot-separated base64url segments).
   * @param {string} str
   * @return {boolean}
   */
  static isJWT(str) {
    if (typeof str !== 'string' || str.length < 20) return false;
    const parts = str.trim().split('.');
    if (parts.length !== 3) return false;
    // Each part should look like base64url characters
    const b64UrlRegex = /^[A-Za-z0-9_-]+$/;
    return b64UrlRegex.test(parts[0]) && b64UrlRegex.test(parts[1]);
  }

  /**
   * Safely decodes base64url string with UTF-8 support.
   * @param {string} base64Url
   * @return {string}
   */
  static base64UrlDecode(base64Url) {
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  /**
   * Decodes a JWT and calculates expiration details.
   * @param {string} token
   * @return {object|null}
   */
  static decodeJWT(token) {
    if (!this.isJWT(token)) return null;
    const parts = token.trim().split('.');
    try {
      const header = JSON.parse(this.base64UrlDecode(parts[0]));
      const payload = JSON.parse(this.base64UrlDecode(parts[1]));

      let isExpired = false;
      let expiresAt = null;
      let remainingSeconds = null;
      let formattedExp = null;

      if (payload.exp && typeof payload.exp === 'number') {
        expiresAt = new Date(payload.exp * 1000);
        const now = Date.now();
        remainingSeconds = Math.round((expiresAt.getTime() - now) / 1000);
        isExpired = remainingSeconds <= 0;
        formattedExp = expiresAt.toLocaleString();
      }

      return {
        header,
        payload,
        signature: parts[2],
        isExpired,
        expiresAt,
        remainingSeconds,
        formattedExp,
      };
    } catch (e) {
      console.warn('Failed to parse JWT token', e);
      return null;
    }
  }
}
