/**
 * CookieDiffManager handles recording snapshots and computing
 * changes (added, removed, modified) between cookie states.
 */
export class CookieDiffManager {
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
  getSnapshotKey(domain) {
    const clean = (domain || 'global').trim().toLowerCase().replace(/^\.+/, '');
    return 'cookie_snapshots_' + (clean || 'global');
  }

  /**
   * Gets history of snapshots for a domain (max 10).
   * @param {string} domain
   * @return {Promise<Array>}
   */
  async getSnapshots(domain) {
    const data = await this.storageHandler.getLocal(
      this.getSnapshotKey(domain)
    );
    return Array.isArray(data) ? data : [];
  }

  /**
   * Records a new snapshot.
   * @param {string} domain
   * @param {Array} cookies
   * @param {string} label
   * @return {Promise}
   */
  async recordSnapshot(domain, cookies, label = 'Auto-snapshot') {
    const list = await this.getSnapshots(domain);
    const item = {
      timestamp: Date.now(),
      label: label,
      cookies: (cookies || []).map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate,
      })),
    };
    list.unshift(item);
    if (list.length > 10) list.pop();
    await this.storageHandler.setLocal(this.getSnapshotKey(domain), list);
  }

  /**
   * Computes differences between two cookie lists.
   * @param {Array} oldList
   * @param {Array} newList
   * @return {{added: Array, removed: Array, modified: Array, unchanged: Array}}
   */
  static computeDiff(oldList = [], newList = []) {
    const oldMap = new Map();
    (oldList || []).forEach(c =>
      oldMap.set(`${c.name}|${c.domain || ''}|${c.path || '/'}`, c)
    );

    const newMap = new Map();
    (newList || []).forEach(c =>
      newMap.set(`${c.name}|${c.domain || ''}|${c.path || '/'}`, c)
    );

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    newMap.forEach((newCookie, key) => {
      if (!oldMap.has(key)) {
        added.push(newCookie);
      } else {
        const oldCookie = oldMap.get(key);
        if (
          oldCookie.value !== newCookie.value ||
          oldCookie.path !== newCookie.path ||
          oldCookie.secure !== newCookie.secure ||
          oldCookie.httpOnly !== newCookie.httpOnly ||
          oldCookie.sameSite !== newCookie.sameSite
        ) {
          modified.push({ old: oldCookie, new: newCookie });
        } else {
          unchanged.push(newCookie);
        }
      }
    });

    oldMap.forEach((oldCookie, key) => {
      if (!newMap.has(key)) {
        removed.push(oldCookie);
      }
    });

    return { added, removed, modified, unchanged };
  }
}
