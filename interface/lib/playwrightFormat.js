/**
 * Formats cookies into Playwright / Puppeteer compatible JSON structure.
 */
export class PlaywrightFormat {
  /**
   * @param {object} loadedCookies
   * @return {string} JSON formatted Playwright cookies
   */
  static format(loadedCookies) {
    const list = [];
    for (const cookieId in loadedCookies) {
      if (!Object.prototype.hasOwnProperty.call(loadedCookies, cookieId)) {
        continue;
      }
      const c = loadedCookies[cookieId].cookie || loadedCookies[cookieId];
      if (!c || !c.name) continue;

      let sameSite = 'Lax';
      if (c.sameSite === 'no_restriction' || c.sameSite === 'none') {
        sameSite = 'None';
      } else if (c.sameSite === 'strict') {
        sameSite = 'Strict';
      } else if (c.sameSite === 'lax') {
        sameSite = 'Lax';
      }

      list.push({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expirationDate ? Math.round(c.expirationDate) : -1,
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
        sameSite: sameSite,
      });
    }
    return JSON.stringify(list, null, 2);
  }

  /**
   * Parses cookies from Playwright / Puppeteer JSON format.
   * @param {string|object} pwJson
   * @return {Array}
   */
  static parse(pwJson) {
    const data = typeof pwJson === 'string' ? JSON.parse(pwJson) : pwJson;
    const list = Array.isArray(data) ? data : data?.cookies || [];
    return list.map(c => {
      let sameSite = undefined;
      if (c.sameSite) {
        const s = String(c.sameSite).toLowerCase();
        sameSite = s === 'none' ? 'no_restriction' : s;
      }
      return {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expirationDate: c.expires && c.expires > 0 ? c.expires : undefined,
        session: !c.expires || c.expires <= 0,
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
        sameSite: sameSite,
      };
    });
  }
}
