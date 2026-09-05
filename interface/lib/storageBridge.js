/**
 * StorageBridge enables reading and writing window.localStorage and window.sessionStorage
 * on the inspected/active tab via chrome.scripting.
 */
export class StorageBridge {
  /**
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    this.browserDetector = browserDetector;
  }

  /**
   * Helper to execute a function in the context of the active tab.
   * @param {number} tabId
   * @param {Function} func
   * @param {Array} args
   * @return {Promise<any>}
   */
  async executeOnTab(tabId, func, args = []) {
    const api = this.browserDetector.getApi();
    if (!tabId) {
      return null;
    }
    if (api.scripting && api.scripting.executeScript) {
      try {
        const results = await api.scripting.executeScript({
          target: { tabId: tabId },
          func: func,
          args: args,
        });
        return results && results[0] ? results[0].result : null;
      } catch (error) {
        console.warn(
          'StorageBridge executeOnTab warning:',
          error.message || error
        );
        return null;
      }
    } else if (api.tabs && api.tabs.executeScript) {
      try {
        const code = `(${func.toString()})(...${JSON.stringify(args)})`;
        const results = await api.tabs.executeScript(tabId, { code });
        return results && results[0] !== undefined ? results[0] : null;
      } catch (error) {
        console.warn('StorageBridge tabs.executeScript warning:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Gets all entries from localStorage.
   * @param {number} tabId
   * @return {Promise<object>}
   */
  async getLocalStorage(tabId) {
    return (
      (await this.executeOnTab(tabId, () => {
        try {
          const data = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            data[key] = window.localStorage.getItem(key);
          }
          return data;
        } catch (e) {
          return {};
        }
      })) || {}
    );
  }

  /**
   * Sets an item in localStorage.
   * @param {number} tabId
   * @param {string} key
   * @param {string} value
   * @return {Promise<boolean>}
   */
  async setLocalStorage(tabId, key, value) {
    return (
      (await this.executeOnTab(
        tabId,
        (k, v) => {
          try {
            window.localStorage.setItem(k, v);
            return true;
          } catch (e) {
            return false;
          }
        },
        [key, value]
      )) || false
    );
  }

  /**
   * Removes an item from localStorage.
   * @param {number} tabId
   * @param {string} key
   * @return {Promise<boolean>}
   */
  async removeLocalStorage(tabId, key) {
    return (
      (await this.executeOnTab(
        tabId,
        k => {
          try {
            window.localStorage.removeItem(k);
            return true;
          } catch (e) {
            return false;
          }
        },
        [key]
      )) || false
    );
  }

  /**
   * Clears all localStorage on the tab.
   * @param {number} tabId
   * @return {Promise<boolean>}
   */
  async clearLocalStorage(tabId) {
    return (
      (await this.executeOnTab(tabId, () => {
        try {
          window.localStorage.clear();
          return true;
        } catch (e) {
          return false;
        }
      })) || false
    );
  }

  /**
   * Gets all entries from sessionStorage.
   * @param {number} tabId
   * @return {Promise<object>}
   */
  async getSessionStorage(tabId) {
    return (
      (await this.executeOnTab(tabId, () => {
        try {
          const data = {};
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const key = window.sessionStorage.key(i);
            data[key] = window.sessionStorage.getItem(key);
          }
          return data;
        } catch (e) {
          return {};
        }
      })) || {}
    );
  }

  /**
   * Sets an item in sessionStorage.
   * @param {number} tabId
   * @param {string} key
   * @param {string} value
   * @return {Promise<boolean>}
   */
  async setSessionStorage(tabId, key, value) {
    return (
      (await this.executeOnTab(
        tabId,
        (k, v) => {
          try {
            window.sessionStorage.setItem(k, v);
            return true;
          } catch (e) {
            return false;
          }
        },
        [key, value]
      )) || false
    );
  }

  /**
   * Removes an item from sessionStorage.
   * @param {number} tabId
   * @param {string} key
   * @return {Promise<boolean>}
   */
  async removeSessionStorage(tabId, key) {
    return (
      (await this.executeOnTab(
        tabId,
        k => {
          try {
            window.sessionStorage.removeItem(k);
            return true;
          } catch (e) {
            return false;
          }
        },
        [key]
      )) || false
    );
  }

  /**
   * Clears all sessionStorage on the tab.
   * @param {number} tabId
   * @return {Promise<boolean>}
   */
  async clearSessionStorage(tabId) {
    return (
      (await this.executeOnTab(tabId, () => {
        try {
          window.sessionStorage.clear();
          return true;
        } catch (e) {
          return false;
        }
      })) || false
    );
  }

  /**
   * Gets combined snapshot of both localStorage and sessionStorage.
   * @param {number} tabId
   * @return {Promise<{localStorage: object, sessionStorage: object}>}
   */
  async getAllWebStorage(tabId) {
    const [local, session] = await Promise.all([
      this.getLocalStorage(tabId),
      this.getSessionStorage(tabId),
    ]);
    return {
      localStorage: local,
      sessionStorage: session,
    };
  }

  /**
   * Replaces all web storage with the given snapshot.
   * @param {number} tabId
   * @param {object} storageData
   * @return {Promise<boolean>}
   */
  async restoreAllWebStorage(tabId, storageData) {
    if (!storageData) return false;
    return (
      (await this.executeOnTab(
        tabId,
        data => {
          try {
            if (data.localStorage) {
              window.localStorage.clear();
              for (const [k, v] of Object.entries(data.localStorage)) {
                window.localStorage.setItem(k, v ?? '');
              }
            }
            if (data.sessionStorage) {
              window.sessionStorage.clear();
              for (const [k, v] of Object.entries(data.sessionStorage)) {
                window.sessionStorage.setItem(k, v ?? '');
              }
            }
            return true;
          } catch (e) {
            return false;
          }
        },
        [storageData]
      )) || false
    );
  }

  /**
   * Clears all IndexedDB databases on the tab origin.
   * @param {number} tabId
   * @return {Promise<boolean>}
   */
  async clearIndexedDB(tabId) {
    return (
      (await this.executeOnTab(tabId, async () => {
        try {
          if (window.indexedDB && window.indexedDB.databases) {
            const dbs = await window.indexedDB.databases();
            for (const db of dbs) {
              if (db.name) {
                window.indexedDB.deleteDatabase(db.name);
              }
            }
          }
          return true;
        } catch (e) {
          return false;
        }
      })) || false
    );
  }
}
