import { JWTInspector } from './jwtInspector.js';

/**
 * SmartFilter provides advanced search token and property matching
 * for cookies and web storage items.
 */
export class SmartFilter {
  /**
   * Evaluates if a cookie or storage item matches a search query.
   * Supports:
   * - plain substrings (case-insensitive)
   * - regular expressions (e.g. /^token_/i)
   * - filters: name:foo, domain:bar, path:/api, value:xyz
   * - flags: is:secure, is:insecure, is:httponly, is:jwt, is:locked, is:session, is:persistent
   * @param {object} item Target cookie or item
   * @param {string} query Search query
   * @param {boolean} isLocked
   * @return {boolean}
   */
  static matches(item, query, isLocked = false) {
    if (!query || !query.trim()) return true;
    const c = item.cookie || item;
    if (!c) return false;

    const trimmed = query.trim();

    // 1. Check if regex: /pattern/flags
    if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
      try {
        const lastSlash = trimmed.lastIndexOf('/');
        const pattern = trimmed.slice(1, lastSlash);
        const flags = trimmed.slice(lastSlash + 1);
        const regex = new RegExp(pattern, flags);
        return (
          regex.test(c.name || '') ||
          regex.test(c.value || '') ||
          regex.test(c.domain || '')
        );
      } catch (e) {
        // Fall back to token search if regex syntax is invalid
      }
    }

    // 2. Tokenized search
    const tokens = trimmed.split(/\s+/);
    for (const token of tokens) {
      if (!token) continue;
      const lowerToken = token.toLowerCase();

      // Flag checks: is:...
      if (lowerToken.startsWith('is:')) {
        const flag = lowerToken.slice(3);
        if (flag === 'secure' && !c.secure) return false;
        if (flag === 'insecure' && c.secure) return false;
        if (flag === 'httponly' && !c.httpOnly) return false;
        if (flag === 'jsaccessible' && c.httpOnly) return false;
        if (flag === 'hostonly' && !c.hostOnly) return false;
        if (flag === 'jwt' && !JWTInspector.isJWT(c.value)) return false;
        if (flag === 'locked' && !isLocked) return false;
        if (flag === 'unlocked' && isLocked) return false;
        if (flag === 'session' && (c.expirationDate || c.session === false))
          return false;
        if (flag === 'persistent' && (!c.expirationDate || c.session === true))
          return false;
        continue;
      }

      // Property checks: name:, domain:, path:, value:, samesite:
      if (lowerToken.startsWith('name:')) {
        const val = lowerToken.slice(5);
        if (!(c.name || '').toLowerCase().includes(val)) return false;
        continue;
      }
      if (lowerToken.startsWith('domain:')) {
        const val = lowerToken.slice(7);
        if (!(c.domain || '').toLowerCase().includes(val)) return false;
        continue;
      }
      if (lowerToken.startsWith('path:')) {
        const val = lowerToken.slice(5);
        if (!(c.path || '').toLowerCase().includes(val)) return false;
        continue;
      }
      if (lowerToken.startsWith('value:')) {
        const val = lowerToken.slice(6);
        if (!(c.value || '').toLowerCase().includes(val)) return false;
        continue;
      }
      if (lowerToken.startsWith('samesite:')) {
        const val = lowerToken.slice(9);
        if (!(c.sameSite || '').toLowerCase().includes(val)) return false;
        continue;
      }

      // Default: match either name or value or domain or path
      const nameMatch = (c.name || '').toLowerCase().includes(lowerToken);
      const valMatch = (c.value || '').toLowerCase().includes(lowerToken);
      const domainMatch = (c.domain || '').toLowerCase().includes(lowerToken);
      const pathMatch = (c.path || '').toLowerCase().includes(lowerToken);
      if (!nameMatch && !valMatch && !domainMatch && !pathMatch) {
        return false;
      }
    }

    return true;
  }
}
