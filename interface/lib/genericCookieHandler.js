import { EventEmitter } from './eventEmitter.js';

/**
 * Class used to implement basic common Cookie API handling.
 */
export class GenericCookieHandler extends EventEmitter {
  /**
   * Constructs a GenericCookieHandler.
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    super();
    this.cookies = [];
    this.currentTab = null;
    this.browserDetector = browserDetector;
  }

  /**
   * Gets all cookie for the current tab.
   * @return {Promise}
   */
  async getAllCookies() {
    return this.browserDetector.getApi().cookies.getAll({
      url: this.currentTab.url,
      storeId: this.currentTab.cookieStoreId,
    });
  }

  /**
   * Prepares a cookie to be saved. Cleans it up for certain browsers.
   * @param {object} cookie
   * @param {string} url
   * @return {object}
   */
  prepareCookie(cookie, url) {
    const newCookie = {
      name: cookie.name || '',
      value: cookie.value || '',
    };

    if (cookie.domain) {
      newCookie.domain = cookie.domain;
    }

    if (cookie.path) {
      newCookie.path = cookie.path;
    }

    if (typeof cookie.secure === 'boolean') {
      newCookie.secure = cookie.secure;
    }

    if (typeof cookie.httpOnly === 'boolean') {
      newCookie.httpOnly = cookie.httpOnly;
    }

    // CRITICAL: Session cookies MUST NOT have expirationDate set (never pass null or 0).
    // In Chrome API, if expirationDate is set to 0 or null, it represents 1970-01-01 (already expired),
    // causing Chrome to immediately delete the session cookie!
    if (
      typeof cookie.expirationDate === 'number' &&
      cookie.expirationDate > 0 &&
      !cookie.session
    ) {
      newCookie.expirationDate = cookie.expirationDate;
    }

    const storeId = cookie.storeId || this.currentTab?.cookieStoreId;
    if (storeId) {
      newCookie.storeId = storeId;
    }

    // Determine canonical URL for Chrome / Firefox cookies API
    let targetUrl = url;
    if (cookie.domain) {
      const cleanDomain = cookie.domain.replace(/^\./, '');
      const protocol = cookie.secure ? 'https://' : 'http://';
      const path =
        cookie.path && cookie.path.startsWith('/') ? cookie.path : '/';

      if (!targetUrl) {
        targetUrl = `${protocol}${cleanDomain}${path}`;
      } else {
        try {
          const parsed = new URL(targetUrl);
          if (
            !parsed.hostname.endsWith(cleanDomain) &&
            !cleanDomain.endsWith(parsed.hostname)
          ) {
            targetUrl = `${protocol}${cleanDomain}${path}`;
          }
        } catch {
          targetUrl = `${protocol}${cleanDomain}${path}`;
        }
      }
    } else if (!targetUrl && this.currentTab?.url) {
      targetUrl = this.currentTab.url;
    }
    newCookie.url = targetUrl;

    // Bad hack on safari because cookies needs to have the very exact same domain
    // to be able to edit it.
    if (this.browserDetector.isSafari() && newCookie.domain) {
      newCookie.url = 'http://' + newCookie.domain;
    }
    if (this.browserDetector.isSafari() && !newCookie.path) {
      newCookie.path = '/';
    }

    if (
      cookie.hostOnly ||
      (this.browserDetector.isSafari() && !newCookie.domain)
    ) {
      delete newCookie.domain;
    }

    if (!this.browserDetector.isSafari()) {
      if (cookie.sameSite) {
        const s = String(cookie.sameSite).toLowerCase();
        if (s === 'no_restriction' || s === 'none') {
          newCookie.sameSite = 'no_restriction';
          newCookie.secure = true;
        } else if (s === 'strict') {
          newCookie.sameSite = 'strict';
        } else if (s === 'lax') {
          newCookie.sameSite = 'lax';
        } else if (s === 'unspecified') {
          newCookie.sameSite = 'unspecified';
        }
      }
    }

    return newCookie;
  }

  /**
   * Saves a cookie. This can either create a new cookie or modify an existing
   * one.
   * @param {Cookie} cookie Cookie's data.
   * @param {string} url The url to attach the cookie to.
   * @return {Promise}
   */
  async saveCookie(cookie, url) {
    cookie = this.prepareCookie(cookie, url);
    return this.browserDetector.getApi().cookies.set(cookie);
  }

  /**
   * Removes a cookie from the browser.
   * @param {string} name The name of the cookie to remove.
   * @param {string} url The url that the cookie is attached to.
   * @param {boolean} isRecursive
   * @return {Promise}
   */
  async removeCookie(name, url, isRecursive = false) {
    // Bad hack on safari because cookies needs to have the very exact same domain
    // to be able to delete it.
    // TODO: Check if this hack is needed on devtools.
    if (this.browserDetector.isSafari() && !isRecursive) {
      const cookies = await this.getAllCookies();
      for (const cookie of cookies) {
        if (cookie.name === name) {
          await this.removeCookie(name, 'http://' + cookie.domain, true);
        }
      }
    } else {
      const removeDetails = {
        name: name,
        url: url || this.currentTab?.url,
      };
      const storeId = this.currentTab?.cookieStoreId;
      if (storeId) {
        removeDetails.storeId = storeId;
      }
      return this.browserDetector.getApi().cookies.remove(removeDetails);
    }
  }

  /**
   * Gets all the cookies from the browser.
   * @return {Promise}
   */
  async getAllCookiesInBrowser() {
    return this.browserDetector.getApi().cookies.getAll({});
  }
}
