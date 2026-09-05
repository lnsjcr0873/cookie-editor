import { GUID } from './guid.js';

/**
 * Manages multi-account profiles per domain.
 * Saves and restores sets of cookies and web storage snapshots.
 */
export class ProfileManager {
  /**
   * @param {GenericStorageHandler} storageHandler
   */
  constructor(storageHandler) {
    this.storageHandler = storageHandler;
  }

  /**
   * Generates a storage key for a domain's profiles.
   * @param {string} domain
   * @return {string}
   */
  getStorageKey(domain) {
    const clean = (domain || 'global').trim().toLowerCase().replace(/^\.+/, '');
    return 'profiles_' + (clean || 'global');
  }

  /**
   * Generates a storage key for active profile ID on domain.
   * @param {string} domain
   * @return {string}
   */
  getActiveKey(domain) {
    const clean = (domain || 'global').trim().toLowerCase().replace(/^\.+/, '');
    return 'active_profile_' + (clean || 'global');
  }

  /**
   * Gets all saved profiles for a domain.
   * @param {string} domain
   * @return {Promise<Array>}
   */
  async getProfiles(domain) {
    const data = await this.storageHandler.getLocal(this.getStorageKey(domain));
    return Array.isArray(data) ? data : [];
  }

  /**
   * Gets the active profile ID for a domain.
   * @param {string} domain
   * @return {Promise<string|null>}
   */
  async getActiveProfileId(domain) {
    return (
      (await this.storageHandler.getLocal(this.getActiveKey(domain))) || null
    );
  }

  /**
   * Sets the active profile ID for a domain.
   * @param {string} domain
   * @param {string|null} profileId
   * @return {Promise}
   */
  async setActiveProfileId(domain, profileId) {
    return this.storageHandler.setLocal(this.getActiveKey(domain), profileId);
  }

  /**
   * Saves or updates a profile with cookies and optional storage.
   * @param {string} domain
   * @param {string} name
   * @param {Array} cookies
   * @param {object|null} storage
   * @param {string|null} profileId
   * @return {Promise<object>} The saved profile
   */
  async saveProfile(domain, name, cookies, storage = null, profileId = null) {
    const profiles = await this.getProfiles(domain);
    const now = Date.now();
    let profile;

    if (profileId) {
      profile = profiles.find(p => p.id === profileId);
    }

    if (profile) {
      profile.name = name || profile.name;
      profile.cookies = cookies;
      profile.storage = storage || profile.storage || null;
      profile.updatedAt = now;
    } else {
      profile = {
        id: profileId || GUID.get(),
        name: name || `Account ${profiles.length + 1}`,
        domain: domain,
        cookies: cookies || [],
        storage: storage || null,
        createdAt: now,
        updatedAt: now,
      };
      profiles.push(profile);
    }

    await this.storageHandler.setLocal(this.getStorageKey(domain), profiles);
    await this.setActiveProfileId(domain, profile.id);
    return profile;
  }

  /**
   * Renames an existing profile.
   * @param {string} domain
   * @param {string} profileId
   * @param {string} newName
   * @return {Promise<boolean>}
   */
  async renameProfile(domain, profileId, newName) {
    const profiles = await this.getProfiles(domain);
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      profile.name = newName;
      profile.updatedAt = Date.now();
      await this.storageHandler.setLocal(this.getStorageKey(domain), profiles);
      return true;
    }
    return false;
  }

  /**
   * Deletes a profile.
   * @param {string} domain
   * @param {string} profileId
   * @return {Promise<boolean>}
   */
  async deleteProfile(domain, profileId) {
    let profiles = await this.getProfiles(domain);
    profiles = profiles.filter(p => p.id !== profileId);
    await this.storageHandler.setLocal(this.getStorageKey(domain), profiles);

    const activeId = await this.getActiveProfileId(domain);
    if (activeId === profileId) {
      await this.setActiveProfileId(domain, null);
    }
    return true;
  }

  /**
   * Exports all profiles for a domain as a JSON string.
   * @param {string} domain
   * @return {Promise<string>}
   */
  async exportProfilesJson(domain) {
    const profiles = await this.getProfiles(domain);
    return JSON.stringify({ version: 1, domain, profiles }, null, 2);
  }

  /**
   * Imports profiles from a JSON string.
   * @param {string} domain
   * @param {string} jsonStr
   * @return {Promise<number>} Number of imported profiles
   */
  async importProfilesJson(domain, jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      const incoming = Array.isArray(data) ? data : data.profiles;
      if (!Array.isArray(incoming)) return 0;

      const existing = await this.getProfiles(domain);
      let addedCount = 0;
      for (const item of incoming) {
        if (!item.name || !item.cookies) continue;
        existing.push({
          id: GUID.get(),
          name: item.name,
          domain: domain,
          cookies: item.cookies,
          storage: item.storage || null,
          createdAt: item.createdAt || Date.now(),
          updatedAt: Date.now(),
        });
        addedCount++;
      }
      await this.storageHandler.setLocal(this.getStorageKey(domain), existing);
      return addedCount;
    } catch (e) {
      console.error('Failed to import profiles JSON', e);
      throw e;
    }
  }

  /**
   * Gets all profiles across all domains.
   * @return {Promise<Array<{domain: string, profiles: Array}>>}
   */
  async getAllGlobalProfiles() {
    try {
      const allData = (await this.storageHandler.getLocal(null)) || {};
      const result = [];
      for (const [k, v] of Object.entries(allData)) {
        if (k.startsWith('profiles_') && Array.isArray(v) && v.length > 0) {
          const domain = k.replace('profiles_', '');
          result.push({ domain, profiles: v });
        }
      }
      return result;
    } catch (e) {
      console.error('Failed to get global profiles', e);
      return [];
    }
  }

  /**
   * Exports all profiles from all domains into a single backup JSON.
   * @return {Promise<string>}
   */
  async exportAllGlobalProfilesJson() {
    const list = await this.getAllGlobalProfiles();
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        totalDomains: list.length,
        domains: list,
      },
      null,
      2
    );
  }

  /**
   * Imports all profiles from a global backup JSON.
   * @param {string} jsonStr
   * @return {Promise<{importedDomains: number, importedProfiles: number}>}
   */
  async importAllGlobalProfilesJson(jsonStr) {
    const data = JSON.parse(jsonStr);
    const domainList = data.domains || (Array.isArray(data) ? data : []);
    let domainCount = 0;
    let profileCount = 0;

    for (const item of domainList) {
      if (!item.domain || !Array.isArray(item.profiles)) continue;
      const count = await this.importProfilesJson(
        item.domain,
        JSON.stringify(item.profiles)
      );
      if (count > 0) {
        domainCount++;
        profileCount += count;
      }
    }
    return { importedDomains: domainCount, importedProfiles: profileCount };
  }

  /**
   * Clears all profiles across all domains.
   * @return {Promise<boolean>}
   */
  async clearAllGlobalProfiles() {
    try {
      const allData = (await this.storageHandler.getLocal(null)) || {};
      const keysToRemove = [];
      for (const k of Object.keys(allData)) {
        if (k.startsWith('profiles_') || k.startsWith('active_profile_')) {
          keysToRemove.push(k);
        }
      }
      for (const key of keysToRemove) {
        await this.storageHandler.setLocal(key, null);
      }
      return true;
    } catch (e) {
      console.error('Failed to clear global profiles', e);
      return false;
    }
  }
}
