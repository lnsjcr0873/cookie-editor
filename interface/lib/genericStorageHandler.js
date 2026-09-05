import { EventEmitter } from './eventEmitter.js';

/**
 * Abstract class used to implement basic common Storage API handling.
 */
export class GenericStorageHandler extends EventEmitter {
  /**
   * Constructs a GenericStorageHandler.
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    super();
    this.browserDetector = browserDetector;
  }

  /**
   * Gets a value from LocalStorage, or all values if key is null.
   * @param {string|null} key Key to identify the value in LocalStorage, or null for all.
   * @return {Promise}
   */
  async getLocal(key) {
    const query = key === null ? null : [key];
    const data = await this.browserDetector.getApi().storage.local.get(query);
    if (key === null) {
      return data || {};
    }
    return data?.[key] ?? null;
  }

  /**
   * Sets a value in the LocalStorage (or removes key if data is null).
   * @param {string} key Key to identify the value in the LocalStorage.
   * @param {any} data Data to store in the LocalStorage
   * @return {Promise}
   */
  async setLocal(key, data) {
    if (data === null) {
      return this.browserDetector.getApi().storage.local.remove([key]);
    }
    return this.browserDetector.getApi().storage.local.set({ [key]: data });
  }
}
