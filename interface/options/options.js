import { BrowserDetector } from '../lib/browserDetector.js';
import { Cookie } from '../lib/cookie.js';
import { GenericStorageHandler } from '../lib/genericStorageHandler.js';
import { JsonFormat } from '../lib/jsonFormat.js';
import { NetscapeFormat } from '../lib/netscapeFormat.js';
import { OptionsHandler } from '../lib/optionsHandler.js';
import { PermissionHandler } from '../lib/permissionHandler.js';
import { ProfileManager } from '../lib/profileManager.js';
import { ThemeHandler } from '../lib/themeHandler.js';
import { CookieHandlerPopup } from '../popup/cookieHandlerPopup.js';

document.addEventListener('DOMContentLoaded', async event => {
  const browserDetector = new BrowserDetector();
  const storageHandler = new GenericStorageHandler(browserDetector);
  const optionHandler = new OptionsHandler(browserDetector, storageHandler);
  const themeHandler = new ThemeHandler(optionHandler);
  const cookieHandler = new CookieHandlerPopup(browserDetector);
  const permissionHandler = new PermissionHandler(browserDetector);
  const profileManager = new ProfileManager(storageHandler);
  const advancedCookieInput = document.getElementById('advanced-cookie');
  const showDevtoolsInput = document.getElementById('devtool-show');
  const animationsEnabledInput = document.getElementById('animations-enabled');
  const exportFormatInput = document.getElementById('export-format');
  const extraInfoInput = document.getElementById('extra-info');
  const themeInput = document.getElementById('theme');
  const buttonBarTopInput = document.getElementById('button-bar-top');

  await optionHandler.loadOptions();
  themeHandler.updateTheme();
  setFormValues();
  optionHandler.on('optionsChanged', setFormValues);
  setInputEvents();
  await loadProfilesHub();

  /**
   * Sets the value of the form based on the saved options.
   */
  function setFormValues() {
    handleAnimationsEnabled();
    advancedCookieInput.checked = optionHandler.getCookieAdvanced();
    showDevtoolsInput.checked = optionHandler.getDevtoolsEnabled();
    animationsEnabledInput.checked = optionHandler.getAnimationsEnabled();
    exportFormatInput.value = optionHandler.getExportFormat();
    extraInfoInput.value = optionHandler.getExtraInfo();
    themeInput.value = optionHandler.getTheme();
    buttonBarTopInput.checked = optionHandler.getButtonBarTop();

    if (!browserDetector.isSafari()) {
      document
        .querySelectorAll('.github-sponsor')
        .forEach(el => el.classList.remove('hidden'));
    }
  }

  /**
   * Sets the different input listeners to save the form changes.
   */
  function setInputEvents() {
    advancedCookieInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setCookieAdvanced(advancedCookieInput.checked);
    });
    showDevtoolsInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setDevtoolsEnabled(showDevtoolsInput.checked);
    });
    animationsEnabledInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setAnimationsEnabled(animationsEnabledInput.checked);
      handleAnimationsEnabled();
    });
    exportFormatInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setExportFormat(exportFormatInput.value);
    });
    extraInfoInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setExtraInfo(extraInfoInput.value);
    });
    themeInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setTheme(themeInput.value);
      themeHandler.updateTheme();
    });
    buttonBarTopInput.addEventListener('change', event => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setButtonBarTop(buttonBarTopInput.checked);
    });

    // Profile Hub Events
    const btnExportProfiles = document.getElementById(
      'btn-export-all-profiles'
    );
    if (btnExportProfiles) {
      btnExportProfiles.addEventListener('click', async () => {
        const jsonStr = await profileManager.exportAllGlobalProfilesJson();
        downloadJsonFile('cookie-editor-profiles-backup.json', jsonStr);
      });
    }

    const btnImportProfiles = document.getElementById(
      'btn-import-all-profiles'
    );
    const inputFileImport = document.getElementById(
      'input-file-import-profiles'
    );
    if (btnImportProfiles && inputFileImport) {
      btnImportProfiles.addEventListener('click', () => {
        inputFileImport.click();
      });

      inputFileImport.addEventListener('change', async () => {
        const file = inputFileImport.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async e => {
          try {
            const content = e.target.result;
            const res =
              await profileManager.importAllGlobalProfilesJson(content);
            alert(
              `成功导入 ${res.importedProfiles} 个账号配置（涉及 ${res.importedDomains} 个域名）！`
            );
            await loadProfilesHub();
          } catch (err) {
            alert('导入账号配置失败: ' + err.message);
          }
          inputFileImport.value = '';
        };
        reader.readAsText(file);
      });
    }

    const btnClearProfiles = document.getElementById('btn-clear-all-profiles');
    if (btnClearProfiles) {
      btnClearProfiles.addEventListener('click', async () => {
        if (confirm('确定要清空所有已保存的账号配置吗？此操作不可逆！')) {
          await profileManager.clearAllGlobalProfiles();
          await loadProfilesHub();
          alert('所有已保存的账号配置已清空。');
        }
      });
    }

    document
      .getElementById('delete-all')
      .addEventListener('click', async event => {
        await deleteAllCookies();
      });

    document
      .getElementById('export-all-json')
      .addEventListener('click', async event => {
        await exportCookiesAsJson();
      });

    document
      .getElementById('export-all-netscape')
      .addEventListener('click', async event => {
        await exportCookiesAsNetscape();
      });
  }

  /**
   * Loads and renders the saved profiles list.
   */
  async function loadProfilesHub() {
    const summaryEl = document.getElementById('profiles-summary');
    const containerEl = document.getElementById('profiles-list-container');
    if (!summaryEl || !containerEl) return;

    const list = await profileManager.getAllGlobalProfiles();
    let totalProfiles = 0;
    list.forEach(item => {
      totalProfiles += (item.profiles || []).length;
    });

    if (totalProfiles === 0) {
      summaryEl.textContent = '暂无已保存的账号配置。';
      containerEl.innerHTML =
        '<p style="color:var(--secondary-text-color); margin:4px;">在任何网页的插件弹窗中点击“保存配置”，即可在此统一管理。</p>';
      return;
    }

    summaryEl.textContent = `共保存了 ${totalProfiles} 个账号配置（分布在 ${list.length} 个域名）。`;
    containerEl.innerHTML = '';

    list.forEach(domainItem => {
      const domainWrapper = document.createElement('div');
      domainWrapper.style.marginBottom = '10px';
      domainWrapper.style.paddingBottom = '6px';
      domainWrapper.style.borderBottom = '1px dashed var(--border-color)';

      const domainTitle = document.createElement('div');
      domainTitle.style.fontWeight = 'bold';
      domainTitle.style.fontSize = '12px';
      domainTitle.style.marginBottom = '4px';
      domainTitle.textContent = `🌐 ${domainItem.domain} (${domainItem.profiles.length} 个配置)`;
      domainWrapper.appendChild(domainTitle);

      domainItem.profiles.forEach(p => {
        const itemRow = document.createElement('div');
        itemRow.style.display = 'flex';
        itemRow.style.justifyContent = 'space-between';
        itemRow.style.alignItems = 'center';
        itemRow.style.fontSize = '12px';
        itemRow.style.padding = '3px 6px';
        itemRow.style.margin = '2px 0';
        itemRow.style.background = 'var(--secondary-surface-color)';
        itemRow.style.borderRadius = '3px';

        const nameSpan = document.createElement('span');
        const cookieCount = (p.cookies || []).length;
        const storageInfo = p.storage ? ' + 本地存储' : '';
        nameSpan.textContent = `👤 ${p.name} (${cookieCount} 个Cookie${storageInfo})`;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✕';
        deleteBtn.style.padding = '1px 6px';
        deleteBtn.style.fontSize = '11px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.title = '删除此账号配置';
        deleteBtn.addEventListener('click', async () => {
          if (
            confirm(`确定要删除 ${domainItem.domain} 下的配置 "${p.name}" 吗？`)
          ) {
            await profileManager.deleteProfile(domainItem.domain, p.id);
            await loadProfilesHub();
          }
        });

        itemRow.appendChild(nameSpan);
        itemRow.appendChild(deleteBtn);
        domainWrapper.appendChild(itemRow);
      });

      containerEl.appendChild(domainWrapper);
    });
  }

  /**
   * Helper to trigger a file download.
   */
  function downloadJsonFile(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get permissions for All urls.
   */
  async function getAllPermissions() {
    const hasPermissions =
      await permissionHandler.checkPermissions('<all_urls>');
    if (!hasPermissions) {
      await permissionHandler.requestPermission('<all_urls>');
    }
  }

  /**
   * Get all cookies for the browser
   */
  async function getAllCookies() {
    await getAllPermissions();
    const cookies = await cookieHandler.getAllCookiesInBrowser();
    const loadedCookies = {};
    for (const [index, cookie] of cookies.entries()) {
      const id = `${Cookie.hashCode(cookie)}_${index}`;
      loadedCookies[id] = new Cookie(id, cookie, optionHandler);
    }
    return loadedCookies;
  }

  /**
   * Delete all cookies.
   */
  async function deleteAllCookies() {
    const deleteAll = confirm(
      '高危提示：确定要清空浏览器中所有网站的全部 Cookie 吗？所有网站均需要重新登录！'
    );
    if (!deleteAll) {
      return;
    }
    const cookies = await getAllCookies();
    for (const cookieId in cookies) {
      if (!Object.prototype.hasOwnProperty.call(cookies, cookieId)) {
        continue;
      }
      const exportedCookie = cookies[cookieId].cookie;
      const cleanDomain = (exportedCookie.domain || '').replace(/^\./, '');
      if (!cleanDomain) continue;
      const url =
        (exportedCookie.secure ? 'https://' : 'http://') +
        cleanDomain +
        (exportedCookie.path || '/');
      await cookieHandler.removeCookie(exportedCookie.name, url);
    }
    alert('已成功清空浏览器中所有网站的 Cookie！');
  }

  /**
   * Export all cookies in the JSON format.
   */
  async function exportCookiesAsJson() {
    const cookies = await getAllCookies();
    copyText(JsonFormat.format(cookies));
    alert('全网 Cookie 已以 JSON 格式复制到剪贴板！');
  }

  /**
   * Export all cookies in the Netscape format.
   */
  async function exportCookiesAsNetscape() {
    const cookies = await getAllCookies();
    copyText(NetscapeFormat.format(cookies));
    alert('全网 Cookie 已以 Netscape 格式复制到剪贴板！');
  }

  /**
   * Copy some text to the user's clipboard.
   * @param {string} text Text to copy.
   */
  function copyText(text) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const fakeText = document.createElement('textarea');
    fakeText.classList.add('clipboardCopier');
    fakeText.textContent = text;
    document.body.appendChild(fakeText);
    fakeText.focus();
    fakeText.select();
    document.execCommand('Copy');
    document.body.removeChild(fakeText);
  }

  /**
   * Enables or disables the animations based on the options.
   */
  function handleAnimationsEnabled() {
    if (optionHandler.getAnimationsEnabled()) {
      document.body.classList.remove('notransition');
    } else {
      document.body.classList.add('notransition');
    }
  }
});
