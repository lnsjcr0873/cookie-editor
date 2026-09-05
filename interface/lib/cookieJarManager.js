import { GUID } from './guid.js';

/**
 * CookieJarManager manages temporary session stashes and clean sandbox states.
 * Allows users to stash their current active session (cookies + storage) to enter a clean
 * guest / incognito-like sandbox state without opening an incognito window, and pop/restore back anytime.
 */
export class CookieJarManager {
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
  getJarKey(domain) {
    const clean = (domain || 'global').trim().toLowerCase().replace(/^\.+/, '');
    return 'cookie_jar_' + (clean || 'global');
  }

  /**
   * @param {string} domain
   * @return {string}
   */
  getSandboxKey(domain) {
    const clean = (domain || 'global').trim().toLowerCase().replace(/^\.+/, '');
    return 'sandbox_state_' + (clean || 'global');
  }

  /**
   * Lists all stashed jars for a domain.
   * @param {string} domain
   * @return {Promise<Array>}
   */
  async listJars(domain) {
    const data = await this.storageHandler.getLocal(this.getJarKey(domain));
    return Array.isArray(data) ? data : [];
  }

  /**
   * Checks if the domain is currently marked in temporary sandbox/guest mode.
   * @param {string} domain
   * @return {Promise<boolean>}
   */
  async isSandboxed(domain) {
    const state = await this.storageHandler.getLocal(
      this.getSandboxKey(domain)
    );
    return Boolean(state);
  }

  /**
   * Sets sandbox state for a domain.
   * @param {string} domain
   * @param {boolean} isSandboxed
   * @return {Promise}
   */
  async setSandboxed(domain, isSandboxed) {
    return this.storageHandler.setLocal(
      this.getSandboxKey(domain),
      isSandboxed
    );
  }

  /**
   * Stashes the current active cookies and storage into a jar.
   * @param {string} domain
   * @param {Array} cookies
   * @param {object|null} storage
   * @param {string} note
   * @return {Promise<object>} The created jar stash object
   */
  async stash(domain, cookies, storage = null, note = '') {
    const jars = await this.listJars(domain);
    const stashObj = {
      id: GUID.get(),
      domain: domain,
      cookies: cookies || [],
      storage: storage || null,
      note: note || `Stash #${jars.length + 1}`,
      cookieCount: (cookies || []).length,
      createdAt: Date.now(),
    };
    jars.unshift(stashObj); // newest first
    await this.storageHandler.setLocal(this.getJarKey(domain), jars);
    await this.setSandboxed(domain, true);
    return stashObj;
  }

  /**
   * Pops the most recent stashed session from the jar.
   * @param {string} domain
   * @return {Promise<object|null>} The popped stash or null if empty
   */
  async pop(domain) {
    const jars = await this.listJars(domain);
    if (!jars || jars.length === 0) {
      await this.setSandboxed(domain, false);
      return null;
    }
    const popped = jars.shift();
    await this.storageHandler.setLocal(this.getJarKey(domain), jars);
    if (jars.length === 0) {
      await this.setSandboxed(domain, false);
    }
    return popped;
  }

  /**
   * Gets the latest stash without removing it.
   * @param {string} domain
   * @return {Promise<object|null>}
   */
  async peek(domain) {
    const jars = await this.listJars(domain);
    return jars && jars.length > 0 ? jars[0] : null;
  }

  /**
   * Deletes a specific jar stash.
   * @param {string} domain
   * @param {string} jarId
   * @return {Promise<boolean>}
   */
  async deleteJar(domain, jarId) {
    let jars = await this.listJars(domain);
    jars = jars.filter(j => j.id !== jarId);
    await this.storageHandler.setLocal(this.getJarKey(domain), jars);
    if (jars.length === 0) {
      await this.setSandboxed(domain, false);
    }
    return true;
  }

  /**
   * Clears all jars for a domain.
   * @param {string} domain
   * @return {Promise}
   */
  async clearAllJars(domain) {
    await this.storageHandler.setLocal(this.getJarKey(domain), []);
    await this.setSandboxed(domain, false);
  }
}
