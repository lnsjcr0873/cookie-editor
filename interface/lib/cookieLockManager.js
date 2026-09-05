/**
 * CookieLockManager manages locked / read-only cookies per domain
 * to prevent accidental deletion and external script tampering.
 */
export class CookieLockManager {
  /**
   * @param {GenericStorageHandler} storageHandler
   */
  constructor(storageHandler) {
    this.storageHandler = storageHandler;
  }

  /**
   * @param {string} domain
   * @return {string}
   */
  getLockKey(domain) {
    const clean = (domain || 'global').trim().toLowerCase().replace(/^\.+/, '');
    return 'locked_cookies_' + (clean || 'global');
  }

  /**
   * Gets list of locked cookie names for a domain.
   * @param {string} domain
   * @return {Promise<string[]>}
   */
  async getLockedNames(domain) {
    const data = await this.storageHandler.getLocal(this.getLockKey(domain));
    return Array.isArray(data) ? data : [];
  }

  /**
   * Checks if a cookie is locked.
   * @param {string} domain
   * @param {string} name
   * @return {Promise<boolean>}
   */
  async isLocked(domain, name) {
    const names = await this.getLockedNames(domain);
    return names.includes(name);
  }

  /**
   * Toggles lock state for a cookie.
   * @param {string} domain
   * @param {string} name
   * @return {Promise<boolean>} New locked state
   */
  async toggleLock(domain, name) {
    let names = await this.getLockedNames(domain);
    let isNowLocked = false;
    if (names.includes(name)) {
      names = names.filter(n => n !== name);
      isNowLocked = false;
    } else {
      names.push(name);
      isNowLocked = true;
    }
    await this.storageHandler.setLocal(this.getLockKey(domain), names);
    return isNowLocked;
  }

  /**
   * Sets the locked cookies for a domain.
   * @param {string} domain
   * @param {string[]} names
   * @return {Promise}
   */
  async setLockedNames(domain, names) {
    return this.storageHandler.setLocal(this.getLockKey(domain), names || []);
  }
}
