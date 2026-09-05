import { CookieHandlerDevtools } from '../devtools/cookieHandlerDevtools.js';
import { Animate } from '../lib/animate.js';
import { BrowserDetector } from '../lib/browserDetector.js';
import { Cookie } from '../lib/cookie.js';
import { CookieDiffManager } from '../lib/cookieDiffManager.js';
import { CookieHealthAdvisor } from '../lib/cookieHealthAdvisor.js';
import { CookieJarManager } from '../lib/cookieJarManager.js';
import { CookieLockManager } from '../lib/cookieLockManager.js';
import { CurlFormat } from '../lib/curlFormat.js';
import { EncryptedFormat } from '../lib/encryptedFormat.js';
import { GenericStorageHandler } from '../lib/genericStorageHandler.js';
import { HeaderstringFormat } from '../lib/headerstringFormat.js';
import { ImmortalityEngine } from '../lib/immortalityEngine.js';
import { JsonFormat } from '../lib/jsonFormat.js';
import { JWTInspector } from '../lib/jwtInspector.js';
import { NetscapeFormat } from '../lib/netscapeFormat.js';
import { ExportFormats } from '../lib/options/exportFormats.js';
import { OptionsHandler } from '../lib/optionsHandler.js';
import { PermissionHandler } from '../lib/permissionHandler.js';
import { PlaywrightFormat } from '../lib/playwrightFormat.js';
import { ProfileManager } from '../lib/profileManager.js';
import { PythonFormat } from '../lib/pythonFormat.js';
import { SmartFilter } from '../lib/smartFilter.js';
import { StorageBridge } from '../lib/storageBridge.js';
import { ThemeHandler } from '../lib/themeHandler.js';
import { CookieHandlerPopup } from './cookieHandlerPopup.js';

(function () {
  ('use strict');

  let containerCookie;
  let cookiesListHtml;
  let pageTitleContainer;
  let notificationElement;
  let loadedCookies = {};
  let disableButtons = false;
  let currentActiveTab = 'cookies'; // 'cookies' | 'localstorage' | 'sessionstorage' | 'diff'

  const notificationQueue = [];
  let notificationTimeout;

  const browserDetector = new BrowserDetector();
  const permissionHandler = new PermissionHandler(browserDetector);
  const storageHandler = new GenericStorageHandler(browserDetector);
  const optionHandler = new OptionsHandler(browserDetector, storageHandler);
  const themeHandler = new ThemeHandler(optionHandler);
  const profileManager = new ProfileManager(storageHandler);
  const cookieJarManager = new CookieJarManager(storageHandler);
  const cookieLockManager = new CookieLockManager(storageHandler);
  const cookieDiffManager = new CookieDiffManager(storageHandler);
  const storageBridge = new StorageBridge(browserDetector);

  const cookieHandler = window.isDevtools
    ? new CookieHandlerDevtools(browserDetector)
    : new CookieHandlerPopup(browserDetector);

  document.addEventListener('DOMContentLoaded', async function () {
    containerCookie = document.getElementById('cookie-container');
    notificationElement = document.getElementById('notification');
    pageTitleContainer = document.getElementById('pageTitle');

    await initWindow();

    // ==========================================
    // UI Event Listeners (Tabs, Modals, Profiles)
    // ==========================================

    // Tab Navigation
    document.querySelectorAll('#nav-tabs .nav-tab').forEach(tabEl => {
      tabEl.addEventListener('click', () => {
        const tabType = tabEl.dataset.tab;
        switchTab(tabType);
      });
    });

    // Profile selector change
    const profileSelect = document.getElementById('profile-select');
    if (profileSelect) {
      profileSelect.addEventListener('change', async e => {
        const profileId = e.target.value;
        const domain = getCurrentDomain();
        if (!domain) return;
        if (!profileId) {
          await profileManager.setActiveProfileId(domain, null);
          await refreshProfilesUI(domain);
          return;
        }
        await switchProfile(domain, profileId);
      });
    }

    // Save profile button
    const btnSaveProfile = document.getElementById('btn-save-profile');
    if (btnSaveProfile) {
      btnSaveProfile.addEventListener('click', async () => {
        const domain = getCurrentDomain();
        if (!domain) return;
        const profileName = await showPromptModal(
          '保存账号配置',
          '配置名称:',
          `账号_${domain}`
        );
        if (!profileName) return;

        const currentCookiesList = await getRawCookiesList();
        const tabId = getCurrentTabId();
        const webStorage = tabId
          ? await storageBridge.getAllWebStorage(tabId)
          : null;
        await profileManager.saveProfile(
          domain,
          profileName,
          currentCookiesList,
          webStorage
        );
        await refreshProfilesUI(domain);
        sendNotification(`账号配置 "${profileName}" 保存成功！`);
      });
    }

    // Delete profile button
    const btnDeleteProfile = document.getElementById('btn-delete-profile');
    if (btnDeleteProfile) {
      btnDeleteProfile.addEventListener('click', async () => {
        const domain = getCurrentDomain();
        const activeProfileId = profileSelect?.value;
        if (!domain || !activeProfileId) return;
        if (!confirm('确定要删除此账号配置吗？')) return;
        await profileManager.deleteProfile(domain, activeProfileId);
        await refreshProfilesUI(domain);
        sendNotification('已删除账号配置');
      });
    }

    // Cookie Jar Stash (Sandbox) button
    const btnStashJar = document.getElementById('btn-stash-jar');
    if (btnStashJar) {
      btnStashJar.addEventListener('click', async () => {
        const domain = getCurrentDomain();
        if (!domain) return;

        const isSandboxed = await cookieJarManager.isSandboxed(domain);
        if (isSandboxed) {
          if (
            confirm(
              '当前正处于沙盒隔离模式，是否退出沙盒并还原原有的登录会话？'
            )
          ) {
            await exitSandboxAndRestore(domain);
          }
          return;
        }

        const currentCookiesList = await getRawCookiesList();
        const tabId = getCurrentTabId();
        const webStorage = tabId
          ? await storageBridge.getAllWebStorage(tabId)
          : null;

        await cookieJarManager.stash(domain, currentCookiesList, webStorage);
        // Clear cookies on domain
        await deleteAllCookiesInternal(false);
        // Clear web storage and IndexedDB on tab
        if (tabId) {
          await storageBridge.clearLocalStorage(tabId);
          await storageBridge.clearSessionStorage(tabId);
          await storageBridge.clearIndexedDB(tabId);
        }
        await checkSandboxUI(domain);
        sendNotification(
          '已暂存当前会话至 Cookie Jar！已进入纯净访客沙盒 (免无痕)。'
        );
        setTimeout(() => {
          reloadActiveTab();
        }, 60);
      });
    }

    // Sandbox Restore button
    const btnUnstashNow = document.getElementById('btn-unstash-now');
    if (btnUnstashNow) {
      btnUnstashNow.addEventListener('click', async () => {
        const domain = getCurrentDomain();
        if (!domain) return;
        await exitSandboxAndRestore(domain);
      });
    }

    // Sandbox Save as Profile button
    const btnSandboxSave = document.getElementById('btn-sandbox-save');
    if (btnSandboxSave) {
      btnSandboxSave.addEventListener('click', async () => {
        const domain = getCurrentDomain();
        if (!domain) return;
        const profileName = await showPromptModal(
          '保存沙盒会话为账号',
          '配置名称:',
          `沙盒账号_${Date.now()}`
        );
        if (!profileName) return;

        const currentCookiesList = await getRawCookiesList();
        const tabId = getCurrentTabId();
        const webStorage = tabId
          ? await storageBridge.getAllWebStorage(tabId)
          : null;
        await profileManager.saveProfile(
          domain,
          profileName,
          currentCookiesList,
          webStorage
        );
        await refreshProfilesUI(domain);
        sendNotification(`沙盒会话已成功保存为账号配置 "${profileName}"！`);
      });
    }

    // Main menu items
    const menuExtend = document.getElementById('menu-extend-cookies');
    if (menuExtend) {
      menuExtend.addEventListener('click', async () => {
        const cookies = await getRawCookiesList();
        const extended = ImmortalityEngine.extendExpiration(cookies, 1);
        for (const c of extended) {
          const cookieUrl = getCookieCanonicalUrl(c, getCurrentTabUrl());
          await cookieHandler.saveCookie(c, cookieUrl);
        }
        sendNotification('所有 Cookie 有效期已延长 1 年（永生模式）！');
        showCookiesForTab();
      });
    }

    const menuSessionize = document.getElementById('menu-sessionize-cookies');
    if (menuSessionize) {
      menuSessionize.addEventListener('click', async () => {
        const cookies = await getRawCookiesList();
        const sessionCookies = ImmortalityEngine.makeAllSession(cookies);
        for (const c of sessionCookies) {
          const cookieUrl = getCookieCanonicalUrl(c, getCurrentTabUrl());
          await cookieHandler.saveCookie(c, cookieUrl);
        }
        sendNotification('所有 Cookie 已成功转换为会话 (Session) Cookie！');
        showCookiesForTab();
      });
    }

    const menuSnapshot = document.getElementById('menu-snapshot-now');
    if (menuSnapshot) {
      menuSnapshot.addEventListener('click', async () => {
        const domain = getCurrentDomain();
        if (!domain) return;
        const cookies = await getRawCookiesList();
        await cookieDiffManager.recordSnapshot(
          domain,
          cookies,
          `手动快照 (${new Date().toLocaleTimeString()})`
        );
        sendNotification('已记录当前 Cookie 状态快照！');
        if (currentActiveTab === 'diff') renderDiffView(domain);
      });
    }

    // Custom events from Cookie items (Lock & JWT)
    if (containerCookie) {
      containerCookie.addEventListener('cookieLockToggled', async e => {
        const { name, isLocked } = e.detail;
        const domain = getCurrentDomain();
        if (domain && name) {
          if (isLocked) {
            const locked = await cookieLockManager.getLockedNames(domain);
            if (!locked.includes(name)) locked.push(name);
            await cookieLockManager.setLockedNames(domain, locked);
            sendNotification(`Cookie "${name}" 已锁定保护`);
          } else {
            let locked = await cookieLockManager.getLockedNames(domain);
            locked = locked.filter(n => n !== name);
            await cookieLockManager.setLockedNames(domain, locked);
            sendNotification(`Cookie "${name}" 已解除锁定`);
          }
        }
      });

      containerCookie.addEventListener('inspectJWT', e => {
        const { name, value } = e.detail;
        showJwtModal(name, value);
      });
    }

    // JWT modal close buttons
    document
      .getElementById('modal-jwt-close')
      ?.addEventListener('click', hideJwtModal);
    document
      .getElementById('modal-jwt-done')
      ?.addEventListener('click', hideJwtModal);
    document.getElementById('modal-jwt-copy')?.addEventListener('click', () => {
      const payloadText =
        document.getElementById('jwt-payload-view')?.textContent;
      if (payloadText) {
        copyText(payloadText);
        sendNotification('JWT 载荷 (Payload) 已复制到剪贴板！');
      }
    });
    document.getElementById('modal-jwt')?.addEventListener('click', e => {
      if (e.target.id === 'modal-jwt') hideJwtModal();
    });

    /**
     * Expands the HTML cookie element.
     * @param {element} e Element to expand.
     */
    function expandCookie(e) {
      const parent = e.target.closest('li');
      if (!parent) return;
      const header = parent.querySelector('.header');
      const expando = parent.querySelector('.expando');
      if (!header || !expando) return;

      Animate.toggleSlide(expando);
      header.classList.toggle('active');
      header.ariaExpanded = header.classList.contains('active');
      expando.ariaHidden = !header.classList.contains('active');
    }

    /**
     * Handles clicks on the delete button of a cookie.
     * @param {Element} e Delete button element.
     * @return {false} returns false to prevent click event propagation.
     */
    async function deleteButton(e) {
      e.preventDefault();
      console.log('removing cookie...');
      const listElement = e.target.closest('li');
      if (!listElement) return false;
      const name = listElement.dataset.name;
      const domain = getCurrentDomain();
      if (domain && (await cookieLockManager.isLocked(domain, name))) {
        sendNotification(`无法删除已锁定的 Cookie "${name}"，请先点击解锁。`);
        return false;
      }
      try {
        const cookieUrl = getCookieCanonicalUrl(
          loadedCookies[listElement.id]?.cookie,
          getCurrentTabUrl()
        );
        await removeCookie(name, cookieUrl);
      } catch (error) {
        console.error(error);
        sendNotification(error.message || String(error));
      }
      return false;
    }

    /**
     * Handles saving a cookie from a form.
     * @param {element} form Form element that contains the cookie fields.
     * @return {false} returns false to prevent click event propagation.
     */
    async function saveCookieForm(form) {
      if (!form) return false;
      const isCreateForm = form.classList.contains('create');

      const id = form.dataset?.id;
      const name = form.querySelector('input[name="name"]')?.value || '';
      const value = form.querySelector('textarea[name="value"]')?.value || '';

      const domain = form.querySelector('input[name="domain"]')?.value;
      const path = form.querySelector('input[name="path"]')?.value;
      const expiration = form.querySelector('input[name="expiration"]')?.value;
      const sameSite = form.querySelector('select[name="sameSite"]')?.value;
      const hostOnlyInput = form.querySelector('input[name="hostOnly"]');
      const hostOnly = hostOnlyInput ? hostOnlyInput.checked : undefined;
      const sessionInput = form.querySelector('input[name="session"]');
      const session = sessionInput ? sessionInput.checked : undefined;
      const secureInput = form.querySelector('input[name="secure"]');
      const secure = secureInput ? secureInput.checked : undefined;
      const httpOnlyInput = form.querySelector('input[name="httpOnly"]');
      const httpOnly = httpOnlyInput ? httpOnlyInput.checked : undefined;

      await saveCookie(
        id,
        name,
        value,
        domain,
        path,
        expiration,
        sameSite,
        hostOnly,
        session,
        secure,
        httpOnly
      );

      if (isCreateForm) {
        showCookiesForTab();
      }

      return false;
    }

    /**
     * Creates or saves changes to a cookie.
     */
    async function saveCookie(
      id,
      name,
      value,
      domain,
      path,
      expiration,
      sameSite,
      hostOnly,
      session,
      secure,
      httpOnly
    ) {
      console.log('saving cookie...');

      const cookieContainer = loadedCookies[id];
      const oldCookie = cookieContainer ? { ...cookieContainer.cookie } : null;
      const cookie = cookieContainer ? cookieContainer.cookie : {};

      cookie.name = name;
      cookie.value = value;

      if (domain !== undefined) cookie.domain = domain;
      if (path !== undefined) cookie.path = path;
      if (sameSite !== undefined) cookie.sameSite = sameSite;
      if (hostOnly !== undefined) cookie.hostOnly = hostOnly;
      if (session !== undefined) cookie.session = session;
      if (secure !== undefined) cookie.secure = secure;
      if (httpOnly !== undefined) cookie.httpOnly = httpOnly;

      if (cookie.session) {
        delete cookie.expirationDate;
      } else if (expiration) {
        const trimmed = String(expiration).trim();
        let timestampSec = null;
        if (/^\d{9,11}$/.test(trimmed)) {
          timestampSec = Number(trimmed);
        } else {
          const ms = new Date(trimmed).getTime();
          timestampSec = !isNaN(ms) ? ms / 1000 : null;
        }
        if (timestampSec && !isNaN(timestampSec) && timestampSec > 0) {
          cookie.expirationDate = timestampSec;
        } else {
          delete cookie.expirationDate;
          cookie.session = true;
        }
      } else {
        delete cookie.expirationDate;
        cookie.session = true;
      }

      try {
        const isIdentityChanged =
          oldCookie &&
          (oldCookie.name !== name ||
            oldCookie.domain !== domain ||
            oldCookie.path !== path ||
            oldCookie.hostOnly !== hostOnly ||
            oldCookie.secure !== secure);

        if (isIdentityChanged) {
          const oldUrl = getCookieCanonicalUrl(oldCookie, getCurrentTabUrl());
          await removeCookie(oldCookie.name, oldUrl);
        }

        const newUrl = getCookieCanonicalUrl(cookie, getCurrentTabUrl());
        await cookieHandler.saveCookie(cookie, newUrl);
        if (browserDetector.isSafari()) {
          onCookiesChanged();
        }

        if (cookieContainer) {
          cookieContainer.showSuccessAnimation();
        }
        sendNotification(`Cookie "${name}" 保存成功！`);
      } catch (error) {
        sendNotification(error.message || String(error));
      }
    }

    if (containerCookie) {
      containerCookie.addEventListener('click', e => {
        let target = e.target;
        if (target.nodeName === 'path') target = target.parentNode;
        if (target.nodeName === 'svg') target = target.parentNode;

        if (
          target.classList.contains('header') ||
          target.classList.contains('header-name') ||
          target.classList.contains('header-extra-info')
        ) {
          return expandCookie(e);
        }
        if (target.classList.contains('delete')) {
          return deleteButton(e);
        }
        if (target.classList.contains('save')) {
          return saveCookieForm(e.target.closest('li').querySelector('form'));
        }
      });
      document.addEventListener('keydown', e => {
        if (e.code === 'Space' || e.code === 'Enter') {
          const target = e.target;
          if (target.classList.contains('header')) {
            e.preventDefault();
            return expandCookie(e);
          }
        }
      });
    }

    document.getElementById('create-cookie')?.addEventListener('click', () => {
      if (disableButtons) return;
      if (
        currentActiveTab === 'localstorage' ||
        currentActiveTab === 'sessionstorage'
      ) {
        showAddStorageForm(currentActiveTab);
        return;
      }
      setPageTitle('Cookie-Editor - 添加 Cookie');
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        createHtmlFormCookie(),
        'left',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );

      document.getElementById('button-bar-default').classList.remove('active');
      document.getElementById('button-bar-add').classList.add('active');
      document.getElementById('name-create')?.focus();
      return false;
    });

    document
      .getElementById('delete-all-cookies')
      ?.addEventListener('click', async () => {
        const buttonIcon = document
          .getElementById('delete-all-cookies')
          .querySelector('use');
        if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
          return;
        }
        if (
          currentActiveTab === 'localstorage' ||
          currentActiveTab === 'sessionstorage'
        ) {
          const tabId = getCurrentTabId();
          if (tabId) {
            if (currentActiveTab === 'localstorage')
              await storageBridge.clearLocalStorage(tabId);
            if (currentActiveTab === 'sessionstorage')
              await storageBridge.clearSessionStorage(tabId);
            sendNotification(
              `已清空所有 ${currentActiveTab === 'localstorage' ? '本地存储 (LocalStorage)' : '会话存储 (SessionStorage)'} 项`
            );
            renderStorageList(currentActiveTab);
          }
          return;
        }

        await deleteAllCookiesInternal(true);
        buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
        sendNotification('所有未锁定的 Cookie 已被清空');
        setTimeout(() => {
          buttonIcon.setAttribute('href', '../sprites/solid.svg#trash');
        }, 1500);
      });

    document.getElementById('export-cookies')?.addEventListener('click', () => {
      if (disableButtons) {
        hideExportMenu();
        return;
      }
      handleExportButtonClick();
    });

    document.getElementById('import-cookies')?.addEventListener('click', () => {
      if (disableButtons) return;
      setPageTitle('Cookie-Editor - 导入');
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        createHtmlFormImport(),
        'left',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );

      document.getElementById('button-bar-default').classList.remove('active');
      document.getElementById('button-bar-import').classList.add('active');
      document.getElementById('content-import')?.focus();
      return false;
    });

    document
      .getElementById('return-list-add')
      ?.addEventListener('click', () => {
        showCookiesForTab();
      });
    document
      .getElementById('return-list-import')
      ?.addEventListener('click', () => {
        showCookiesForTab();
      });

    containerCookie?.addEventListener('submit', e => {
      e.preventDefault();
      saveCookieForm(e.target);
      return false;
    });

    document
      .getElementById('save-create-cookie')
      ?.addEventListener('click', () => {
        saveCookieForm(document.querySelector('form'));
      });

    document
      .getElementById('save-import-cookie')
      ?.addEventListener('click', async e => {
        const buttonIcon = document
          .getElementById('save-import-cookie')
          .querySelector('use');
        if (
          buttonIcon.getAttribute('href') !== '../sprites/solid.svg#file-import'
        ) {
          return;
        }

        let rawInput = document.querySelector('textarea')?.value?.trim();
        if (!rawInput) return;

        // Check if input is Encrypted Session
        if (rawInput.startsWith('ENCSESSION:v1:')) {
          const password = await showPasswordModal(
            '解密会话数据',
            '请输入会话解密密码:'
          );
          if (!password) return;
          try {
            const decrypted = await EncryptedFormat.decrypt(rawInput, password);
            rawInput =
              typeof decrypted === 'string'
                ? decrypted
                : JSON.stringify(decrypted);
          } catch (err) {
            sendNotification(err.message || '解密失败');
            return;
          }
        }

        let cookies = null;
        const parseAttempts = [
          () => JsonFormat.parse(rawInput),
          () => PlaywrightFormat.parse(rawInput),
          () => CurlFormat.parse(rawInput),
          () => PythonFormat.parse(rawInput),
          () => HeaderstringFormat.parse(rawInput),
          () => NetscapeFormat.parse(rawInput),
        ];

        for (const parser of parseAttempts) {
          try {
            const res = parser();
            if (Array.isArray(res) && res.length > 0) {
              cookies = res;
              break;
            }
          } catch (e) {
            // Try next format
          }
        }

        if (!cookies || !isArray(cookies) || cookies.length === 0) {
          console.warn("Couldn't parse Data from any supported format");
          sendNotification(
            '输入内容不是受支持的有效格式，或未包含任何有效 Cookie。'
          );
          buttonIcon.setAttribute('href', '../sprites/solid.svg#times');
          setTimeout(() => {
            buttonIcon.setAttribute('href', '../sprites/solid.svg#file-import');
          }, 1500);
          return;
        }

        for (const cookie of cookies) {
          cookie.storeId = cookieHandler.currentTab?.cookieStoreId;
          if (cookie.sameSite && cookie.sameSite === 'unspecified') {
            cookie.sameSite = null;
          }
          try {
            const cookieUrl = getCookieCanonicalUrl(cookie, getCurrentTabUrl());
            await cookieHandler.saveCookie(cookie, cookieUrl);
          } catch (error) {
            console.error(error);
            sendNotification(error.message || String(error));
          }
        }

        sendNotification('Cookie 已成功导入！');
        showCookiesForTab();
      });

    const mainMenuContent = document.querySelector('#main-menu-content');
    document
      .querySelector('#main-menu-button')
      ?.addEventListener('click', function () {
        mainMenuContent.classList.toggle('visible');
      });

    document.addEventListener('click', function (e) {
      if (
        document.querySelector('#main-menu')?.contains(e.target) ||
        !mainMenuContent?.classList.contains('visible')
      ) {
        return;
      }
      mainMenuContent.classList.remove('visible');
    });

    document.addEventListener('click', function (e) {
      const exportMenu = document.querySelector('#export-menu');
      if (!exportMenu || exportMenu.contains(e.target)) return;
      const exportButton = document.querySelector('#export-cookies');
      if (!exportButton || exportButton.contains(e.target)) return;
      hideExportMenu();
    });

    document
      .querySelector('#advanced-toggle-all')
      ?.addEventListener('change', function (e) {
        optionHandler.setCookieAdvanced(e.target.checked);
        showCookiesForTab();
      });

    document
      .querySelector('#menu-all-options')
      ?.addEventListener('click', function () {
        if (browserDetector.getApi().runtime.openOptionsPage) {
          browserDetector.getApi().runtime.openOptionsPage();
        } else {
          window.open(
            browserDetector
              .getApi()
              .runtime.getURL('interface/options/options.html')
          );
        }
      });

    notificationElement?.addEventListener('animationend', () => {
      if (notificationElement.classList.contains('fadeInUp')) return;
      triggerNotification();
    });

    document
      .getElementById('notification-dismiss')
      ?.addEventListener('click', () => {
        hideNotification();
      });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal-overlay.active');
        activeModals.forEach(m => m.classList.remove('active'));
        hideExportMenu();
        mainMenuContent?.classList.remove('visible');
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const searchInput = document.getElementById('searchField');
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    });

    // Handle cookie duplicate / clone requested
    document.addEventListener('cookieCloneRequested', async e => {
      const cookieData = e.detail?.cookie;
      if (!cookieData) return;
      try {
        const cookieUrl = getCookieCanonicalUrl(cookieData, getCurrentTabUrl());
        await cookieHandler.saveCookie(cookieData, cookieUrl);
        sendNotification(`已成功克隆复制 Cookie "${cookieData.name}"`);
        showCookiesForTab();
      } catch (err) {
        sendNotification(err.message || '克隆复制 Cookie 失败');
      }
    });

    adjustWidthIfSmaller();
  });

  // ==========================================
  // Tab Switching & Web Storage / Diff Logic
  // ==========================================

  async function switchTab(tabType) {
    currentActiveTab = tabType;
    document.querySelectorAll('#nav-tabs .nav-tab').forEach(el => {
      if (el.dataset.tab === tabType) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    const domain = getCurrentDomain();
    if (tabType === 'cookies') {
      showCookiesForTab();
    } else if (tabType === 'localstorage' || tabType === 'sessionstorage') {
      renderStorageList(tabType);
    } else if (tabType === 'diff') {
      renderDiffView(domain);
    }
  }

  async function renderStorageList(type) {
    const tabId = getCurrentTabId();
    const typeLabel =
      type === 'localstorage' ? 'LocalStorage' : 'SessionStorage';
    if (!tabId) {
      containerCookie.innerHTML =
        '<p class="container">Web Storage 需要在活动的网页标签页中使用。</p>';
      return;
    }

    const data =
      type === 'localstorage'
        ? await storageBridge.getLocalStorage(tabId)
        : await storageBridge.getSessionStorage(tabId);

    const keys = Object.keys(data || {});
    document.getElementById(`tab-badge-${type}`).textContent = keys.length;

    const listHtml = document.createElement('div');
    listHtml.className = 'storage-view-container';

    // Search & Add Bar
    const searchBar = document.createElement('div');
    searchBar.style.padding = '8px 12px';
    searchBar.style.display = 'flex';
    searchBar.style.gap = '6px';
    searchBar.innerHTML = `
      <input type="text" class="storage-search-input" placeholder="搜索 ${typeLabel} 键名..." style="flex:1; padding:4px 8px; border:1px solid var(--primary-border-color); border-radius:3px;" />
      <button type="button" class="btn-icon-action highlight btn-add-storage">+ 添加项</button>
    `;
    listHtml.appendChild(searchBar);

    if (keys.length === 0) {
      const emptyP = document.createElement('p');
      emptyP.className = 'container';
      emptyP.textContent = `当前页面未找到任何 ${typeLabel} 数据项。`;
      listHtml.appendChild(emptyP);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'storage-list';

      keys.forEach(key => {
        const val = data[key] || '';
        const li = document.createElement('li');
        li.className = 'storage-item';

        const isJwt = JWTInspector.isJWT(val);
        const jwtBtnHtml = isJwt
          ? `<button class="badge-btn badge-jwt btn-storage-jwt" data-val="${encodeURIComponent(val)}" data-key="${encodeURIComponent(key)}">🔑 JWT</button>`
          : '';

        li.innerHTML = `
          <div class="storage-item-header">
            <span class="storage-key-name">${escapeHtml(key)}</span>
            <div style="display:flex; gap:4px; align-items:center;">
              ${jwtBtnHtml}
              <button class="btn-icon-action btn-copy-storage" data-val="${encodeURIComponent(val)}" title="复制值">📋</button>
              <button class="btn-icon-action btn-edit-storage" data-key="${encodeURIComponent(key)}" data-val="${encodeURIComponent(val)}" title="编辑">✏️</button>
              <button class="btn-icon-action btn-del-storage" data-key="${encodeURIComponent(key)}" title="删除">🗑️</button>
            </div>
          </div>
          <div class="storage-value-preview">${escapeHtml(val)}</div>
        `;
        ul.appendChild(li);
      });
      listHtml.appendChild(ul);
    }

    clearChildren(containerCookie);
    containerCookie.appendChild(listHtml);

    // Event delegation for storage list
    listHtml
      .querySelector('.storage-search-input')
      ?.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        listHtml.querySelectorAll('.storage-item').forEach(item => {
          const keyName =
            item
              .querySelector('.storage-key-name')
              ?.textContent?.toLowerCase() || '';
          const valText =
            item
              .querySelector('.storage-value-preview')
              ?.textContent?.toLowerCase() || '';
          item.style.display =
            keyName.includes(q) || valText.includes(q) ? 'flex' : 'none';
        });
      });

    listHtml
      .querySelector('.btn-add-storage')
      ?.addEventListener('click', () => {
        showAddStorageForm(type);
      });

    listHtml.querySelectorAll('.btn-storage-jwt').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = decodeURIComponent(btn.dataset.key);
        const val = decodeURIComponent(btn.dataset.val);
        showJwtModal(key, val);
      });
    });

    listHtml.querySelectorAll('.btn-copy-storage').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = decodeURIComponent(btn.dataset.val);
        copyText(val);
        sendNotification('存储项数值已复制到剪贴板！');
      });
    });

    listHtml.querySelectorAll('.btn-del-storage').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = decodeURIComponent(btn.dataset.key);
        if (type === 'localstorage')
          await storageBridge.removeLocalStorage(tabId, key);
        if (type === 'sessionstorage')
          await storageBridge.removeSessionStorage(tabId, key);
        sendNotification(`已删除 "${key}"`);
        renderStorageList(type);
      });
    });

    listHtml.querySelectorAll('.btn-edit-storage').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = decodeURIComponent(btn.dataset.key);
        const val = decodeURIComponent(btn.dataset.val);
        const newVal = await showPromptModal(
          `编辑 ${typeLabel} - ${key}`,
          '值 (Value):',
          val
        );
        if (newVal !== null) {
          if (type === 'localstorage')
            await storageBridge.setLocalStorage(tabId, key, newVal);
          if (type === 'sessionstorage')
            await storageBridge.setSessionStorage(tabId, key, newVal);
          sendNotification(`已更新 "${key}"`);
          renderStorageList(type);
        }
      });
    });
  }

  async function showAddStorageForm(type) {
    const tabId = getCurrentTabId();
    const typeLabel =
      type === 'localstorage' ? 'LocalStorage' : 'SessionStorage';
    if (!tabId) return;
    const key = await showPromptModal(`添加 ${typeLabel} 项`, '键名 (Key):');
    if (!key) return;
    const val = await showPromptModal(
      `添加 ${typeLabel} - ${key}`,
      '值 (Value):'
    );
    if (val === null) return;
    if (type === 'localstorage')
      await storageBridge.setLocalStorage(tabId, key, val);
    if (type === 'sessionstorage')
      await storageBridge.setSessionStorage(tabId, key, val);
    sendNotification(`已成功添加 "${key}" 到 ${typeLabel}`);
    renderStorageList(type);
  }

  async function renderDiffView(domain) {
    if (!domain) {
      containerCookie.innerHTML =
        '<p class="container">当前无有效域名可用于时光机差异对比。</p>';
      return;
    }

    const snapshots = await cookieDiffManager.getSnapshots(domain);
    const currentCookiesList = await getRawCookiesList();

    const diffContainer = document.createElement('div');
    diffContainer.className = 'diff-view-container';

    if (snapshots.length === 0) {
      diffContainer.innerHTML = `
        <div class="container">
          <p>暂无历史状态快照记录。</p>
          <button type="button" class="btn-icon-action highlight" id="btn-take-snapshot-diff">📸 立即记录快照</button>
        </div>
      `;
      clearChildren(containerCookie);
      containerCookie.appendChild(diffContainer);
      document
        .getElementById('btn-take-snapshot-diff')
        ?.addEventListener('click', async () => {
          await cookieDiffManager.recordSnapshot(
            domain,
            currentCookiesList,
            `快照 (${new Date().toLocaleTimeString()})`
          );
          renderDiffView(domain);
        });
      return;
    }

    const latestSnapshot = snapshots[0];
    const diff = CookieDiffManager.computeDiff(
      latestSnapshot.cookies,
      currentCookiesList
    );

    diffContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--primary-border-color); padding-bottom:8px;">
        <div>
          <strong>⏱️ 时光机差异对比 (Diff)</strong>
          <div style="font-size:10px; color:var(--secondary-text-color);">基准快照: ${latestSnapshot.label} (${new Date(latestSnapshot.timestamp).toLocaleTimeString()})</div>
        </div>
        <button type="button" class="btn-icon-action" id="btn-take-snapshot-diff">📸 记录新快照</button>
      </div>
      <div>
        <div style="margin-bottom:8px; display:flex; gap:8px;">
          <span class="diff-badge added">+${diff.added.length} 新增</span>
          <span class="diff-badge removed">-${diff.removed.length} 删除</span>
          <span class="diff-badge modified">~${diff.modified.length} 修改</span>
          <span class="diff-badge" style="background:var(--secondary-surface-color); color:var(--primary-text-color);">${diff.unchanged.length} 无变化</span>
        </div>
        <ul style="list-style:none; padding:0; margin:0;">
          ${diff.added
            .map(
              c => `
            <li class="storage-item" style="border-left:3px solid #22c55e;">
              <span class="diff-badge added">新增</span> <strong>${escapeHtml(c.name)}</strong>
              <div class="storage-value-preview">${escapeHtml(c.value)}</div>
            </li>
          `
            )
            .join('')}
          ${diff.modified
            .map(
              m => `
            <li class="storage-item" style="border-left:3px solid #eab308;">
              <span class="diff-badge modified">修改</span> <strong>${escapeHtml(m.new.name)}</strong>
              <div class="storage-value-preview" style="text-decoration:line-through; color:#ef4444;">${escapeHtml(m.old.value)}</div>
              <div class="storage-value-preview" style="color:#22c55e;">${escapeHtml(m.new.value)}</div>
            </li>
          `
            )
            .join('')}
          ${diff.removed
            .map(
              c => `
            <li class="storage-item" style="border-left:3px solid #ef4444;">
              <span class="diff-badge removed">删除</span> <strong>${escapeHtml(c.name)}</strong>
              <div class="storage-value-preview" style="text-decoration:line-through;">${escapeHtml(c.value)}</div>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>
    `;

    clearChildren(containerCookie);
    containerCookie.appendChild(diffContainer);

    document
      .getElementById('btn-take-snapshot-diff')
      ?.addEventListener('click', async () => {
        await cookieDiffManager.recordSnapshot(
          domain,
          currentCookiesList,
          `快照 (${new Date().toLocaleTimeString()})`
        );
        renderDiffView(domain);
      });
  }

  // ==========================================
  // Helper & Management Functions
  // ==========================================

  function getCurrentDomain() {
    if (cookieHandler.currentTab?.url) {
      return getDomainFromUrl(cookieHandler.currentTab.url);
    }
    return '';
  }

  function getCurrentTabId() {
    return cookieHandler.currentTab?.id || null;
  }

  function reloadActiveTab() {
    const api = browserDetector.getApi();
    const tabId = getCurrentTabId();
    if (tabId && api.tabs?.reload) {
      api.tabs.reload(tabId, { bypassCache: true });
    }
  }

  function getCookieCanonicalUrl(cookie, fallbackUrl = '') {
    const tabUrl = fallbackUrl || getCurrentTabUrl();
    const isTabHttps = tabUrl.startsWith('https:');
    if (cookie && cookie.domain) {
      const cleanDomain = cookie.domain.replace(/^\./, '');
      const protocol = cookie.secure || isTabHttps ? 'https://' : 'http://';
      const path =
        cookie.path && cookie.path.startsWith('/') ? cookie.path : '/';
      return `${protocol}${cleanDomain}${path}`;
    }
    return tabUrl;
  }

  async function getRawCookiesList() {
    try {
      const api = browserDetector.getApi();
      const tabUrl = getCurrentTabUrl();
      const domain = getCurrentDomain();
      const storeId = cookieHandler.currentTab?.cookieStoreId;

      if (!api.cookies || !api.cookies.getAll) {
        return (await cookieHandler.getAllCookies()) || [];
      }

      // Query both tab URL and domain to capture root/cross-subdomain cookies
      const promises = [];
      if (tabUrl) {
        promises.push(
          api.cookies
            .getAll({ url: tabUrl, storeId: storeId || undefined })
            .catch(() => [])
        );
      }
      if (domain) {
        promises.push(
          api.cookies
            .getAll({ domain: domain, storeId: storeId || undefined })
            .catch(() => [])
        );
      }

      const results = await Promise.all(promises);
      const map = new Map();
      for (const list of results) {
        if (Array.isArray(list)) {
          for (const c of list) {
            const key = `${c.name}|${c.domain}|${c.path}|${c.storeId || '0'}`;
            if (!map.has(key)) {
              map.set(key, c);
            }
          }
        }
      }
      return Array.from(map.values());
    } catch (e) {
      console.warn('getRawCookiesList error fallback:', e);
      try {
        return (await cookieHandler.getAllCookies()) || [];
      } catch {
        return [];
      }
    }
  }

  async function refreshProfilesUI(domain) {
    const profileSelect = document.getElementById('profile-select');
    const btnDelete = document.getElementById('btn-delete-profile');
    if (!profileSelect || !domain) return;

    const profiles = await profileManager.getProfiles(domain);
    const activeId = await profileManager.getActiveProfileId(domain);

    profileSelect.innerHTML = '<option value="">默认会话</option>';
    profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === activeId) opt.selected = true;
      profileSelect.appendChild(opt);
    });

    if (btnDelete) {
      btnDelete.style.display = activeId ? 'inline-flex' : 'none';
    }
  }

  async function switchProfile(domain, profileId) {
    const profiles = await profileManager.getProfiles(domain);
    const target = profiles.find(p => p.id === profileId);
    if (!target) return;

    await profileManager.setActiveProfileId(domain, profileId);

    // 1. Clear existing cookies on domain
    await deleteAllCookiesInternal(false);

    // 2. Restore profile cookies with canonical URLs
    for (const cookie of target.cookies || []) {
      try {
        const cookieUrl = getCookieCanonicalUrl(cookie, getCurrentTabUrl());
        await cookieHandler.saveCookie(cookie, cookieUrl);
      } catch (e) {
        console.error('Error restoring profile cookie', e);
      }
    }

    // 3. Restore web storage if saved (or clear if none)
    const tabId = getCurrentTabId();
    if (tabId) {
      if (target.storage) {
        await storageBridge.restoreAllWebStorage(tabId, target.storage);
      } else {
        await storageBridge.clearLocalStorage(tabId);
        await storageBridge.clearSessionStorage(tabId);
        await storageBridge.clearIndexedDB(tabId);
      }
    }

    await refreshProfilesUI(domain);
    sendNotification(`已切换到账号配置 "${target.name}"`);

    // Safety buffer for storage & cookie DB flush
    setTimeout(() => {
      reloadActiveTab();
    }, 60);
  }

  async function checkSandboxUI(domain) {
    const banner = document.getElementById('sandbox-banner');
    const btnStash = document.getElementById('btn-stash-jar');
    if (!banner) return;
    const isSandboxed = domain
      ? await cookieJarManager.isSandboxed(domain)
      : false;
    if (isSandboxed) {
      banner.classList.add('active');
      if (btnStash) {
        btnStash.textContent = '🧪 退出沙盒并恢复';
        btnStash.title =
          '当前正处于沙盒模式中，点击退出沙盒并还原原有的登录会话';
        btnStash.classList.add('in-sandbox');
      }
    } else {
      banner.classList.remove('active');
      if (btnStash) {
        btnStash.textContent = '🍯 暂存沙盒 (免无痕)';
        btnStash.title =
          '暂存当前会话至 Cookie Jar 并进入纯净访客沙盒 (免无痕模式)';
        btnStash.classList.remove('in-sandbox');
      }
    }
  }

  async function exitSandboxAndRestore(domain) {
    const stashed = await cookieJarManager.pop(domain);
    if (!stashed) {
      sendNotification('未找到暂存的会话数据');
      await checkSandboxUI(domain);
      return;
    }
    // Restore cookies
    await deleteAllCookiesInternal(false);
    for (const cookie of stashed.cookies || []) {
      try {
        const cookieUrl = getCookieCanonicalUrl(cookie, getCurrentTabUrl());
        await cookieHandler.saveCookie(cookie, cookieUrl);
      } catch (e) {
        console.error('Failed restoring cookie', e);
      }
    }
    // Restore web storage
    const tabId = getCurrentTabId();
    if (tabId) {
      if (stashed.storage) {
        await storageBridge.restoreAllWebStorage(tabId, stashed.storage);
      } else {
        await storageBridge.clearLocalStorage(tabId);
        await storageBridge.clearSessionStorage(tabId);
        await storageBridge.clearIndexedDB(tabId);
      }
    }
    await checkSandboxUI(domain);
    sendNotification('已退出沙盒，已从 Cookie Jar 成功还原原始会话！');
    setTimeout(() => {
      reloadActiveTab();
    }, 60);
  }

  async function deleteAllCookiesInternal(respectLocks = true) {
    const domain = getCurrentDomain();
    const lockedNames =
      respectLocks && domain
        ? await cookieLockManager.getLockedNames(domain)
        : [];

    const allCookies = await getRawCookiesList();
    if (allCookies && allCookies.length) {
      for (const cookie of allCookies) {
        if (respectLocks && lockedNames.includes(cookie.name)) {
          continue; // Skip locked
        }
        try {
          const cookieUrl = getCookieCanonicalUrl(cookie, getCurrentTabUrl());
          await removeCookie(cookie.name, cookieUrl);
        } catch (error) {
          console.error(error);
        }
      }
    }
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showPromptModal(title, label, defaultValue = '') {
    return new Promise(resolve => {
      const modal = document.getElementById('modal-prompt');
      const titleEl = document.getElementById('modal-prompt-title');
      const labelEl = document.getElementById('modal-prompt-label');
      const inputEl = document.getElementById('modal-prompt-input');
      const btnOk = document.getElementById('modal-prompt-ok');
      const btnCancel = document.getElementById('modal-prompt-cancel');

      if (!modal || !inputEl) return resolve(null);

      titleEl.textContent = title;
      labelEl.textContent = label;
      inputEl.value = defaultValue;
      modal.classList.add('visible');
      inputEl.focus();

      const onOk = () => {
        cleanup();
        resolve(inputEl.value.trim());
      };
      const onCancel = () => {
        cleanup();
        resolve(null);
      };
      const onKeyDown = e => {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      };
      const onBackdrop = e => {
        if (e.target === modal) onCancel();
      };

      function cleanup() {
        modal.classList.remove('visible');
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
        inputEl.removeEventListener('keydown', onKeyDown);
        modal.removeEventListener('click', onBackdrop);
      }

      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
      inputEl.addEventListener('keydown', onKeyDown);
      modal.addEventListener('click', onBackdrop);
    });
  }

  function showPasswordModal(title, label) {
    return new Promise(resolve => {
      const modal = document.getElementById('modal-password');
      const titleEl = document.getElementById('modal-password-title');
      const labelEl = document.getElementById('modal-password-label');
      const inputEl = document.getElementById('modal-password-input');
      const btnOk = document.getElementById('modal-password-ok');
      const btnCancel = document.getElementById('modal-password-cancel');

      if (!modal || !inputEl) return resolve(null);

      titleEl.textContent = title;
      labelEl.textContent = label;
      inputEl.value = '';
      modal.classList.add('visible');
      inputEl.focus();

      const onOk = () => {
        cleanup();
        resolve(inputEl.value);
      };
      const onCancel = () => {
        cleanup();
        resolve(null);
      };
      const onKeyDown = e => {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      };
      const onBackdrop = e => {
        if (e.target === modal) onCancel();
      };

      function cleanup() {
        modal.classList.remove('visible');
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
        inputEl.removeEventListener('keydown', onKeyDown);
        modal.removeEventListener('click', onBackdrop);
      }

      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
      inputEl.addEventListener('keydown', onKeyDown);
      modal.addEventListener('click', onBackdrop);
    });
  }

  function showJwtModal(name, token) {
    const modal = document.getElementById('modal-jwt');
    const headerView = document.getElementById('jwt-header-view');
    const payloadView = document.getElementById('jwt-payload-view');
    const statusBanner = document.getElementById('jwt-status-banner');
    if (!modal) return;

    const decoded = JWTInspector.decodeJWT(token);
    if (!decoded) {
      sendNotification('无效的 JWT Token');
      return;
    }

    if (decoded.isExpired) {
      statusBanner.style.background = '#fee2e2';
      statusBanner.style.color = '#991b1b';
      statusBanner.textContent = `⚠️ 已于 ${decoded.formattedExp} 过期`;
    } else if (decoded.expiresAt) {
      statusBanner.style.background = '#dcfce7';
      statusBanner.style.color = '#166534';
      statusBanner.textContent = `✓ 有效期至 ${decoded.formattedExp} (约剩 ${Math.round(decoded.remainingSeconds / 60)} 分钟)`;
    } else {
      statusBanner.style.background = '#e0e7ff';
      statusBanner.style.color = '#3730a3';
      statusBanner.textContent = '✓ 有效 JWT (无 exp 过期声明)';
    }

    headerView.textContent = JSON.stringify(decoded.header, null, 2);
    payloadView.textContent = JSON.stringify(decoded.payload, null, 2);
    modal.classList.add('visible');
  }

  function hideJwtModal() {
    document.getElementById('modal-jwt')?.classList.remove('visible');
  }

  // ==========================================
  // Cookie Display & Lifecycle Methods
  // ==========================================

  /**
   * Builds the HTML for the cookies of the current tab.
   */
  async function showCookiesForTab() {
    if (!cookieHandler.currentTab) return;
    if (disableButtons) return;

    console.log('showing cookies');
    setPageTitle('Cookie-Editor');
    document.getElementById('button-bar-add')?.classList.remove('active');
    document.getElementById('button-bar-import')?.classList.remove('active');
    document.getElementById('button-bar-default')?.classList.add('active');

    const domain = getDomainFromUrl(cookieHandler.currentTab.url);
    const subtitleLine = document.querySelector('.titles h2');
    if (subtitleLine) {
      subtitleLine.textContent = domain || cookieHandler.currentTab.url;
    }

    if (!permissionHandler.canHavePermissions(cookieHandler.currentTab.url)) {
      showPermissionImpossible();
      return;
    }
    const hasPermissions = await permissionHandler.checkPermissions(
      cookieHandler.currentTab.url
    );
    if (!hasPermissions) {
      showNoPermission();
      return;
    }

    await refreshProfilesUI(domain);
    await checkSandboxUI(domain);

    const cookies = (await cookieHandler.getAllCookies()).sort(
      sortCookiesByName
    );
    loadedCookies = {};

    document.getElementById('tab-badge-cookies').textContent = cookies.length;

    // Record snapshot in diff manager if cookies present
    if (domain && cookies.length > 0) {
      cookieDiffManager.recordSnapshot(
        domain,
        cookies,
        `快照 (${new Date().toLocaleTimeString()})`
      );
    }

    const lockedNames = domain
      ? await cookieLockManager.getLockedNames(domain)
      : [];

    if (cookies.length === 0) {
      showNoCookies();
      return;
    }

    cookiesListHtml = document.createElement('ul');
    cookiesListHtml.appendChild(generateSearchBar());
    cookies.forEach(function (cookie) {
      const id = Cookie.hashCode(cookie);
      const isLocked = lockedNames.includes(cookie.name);
      loadedCookies[id] = new Cookie(id, cookie, optionHandler, isLocked);
      cookiesListHtml.appendChild(loadedCookies[id].html);
    });

    if (containerCookie.firstChild) {
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        cookiesListHtml,
        'right',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );
    } else {
      containerCookie.appendChild(cookiesListHtml);
    }
  }

  function showNoCookies() {
    if (disableButtons) return;
    const pageTitle =
      pageTitleContainer?.querySelector('h1')?.textContent ?? '';
    if (pageTitle !== 'Cookie-Editor') return;
    cookiesListHtml = null;
    const html = document
      .importNode(document.getElementById('tmp-empty').content, true)
      .querySelector('p');
    if (containerCookie.firstChild) {
      if (
        containerCookie.firstElementChild?.id === 'no-cookies' ||
        containerCookie.firstElementChild?.id === 'no-cookie'
      ) {
        return;
      }
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        html,
        'right',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );
    } else {
      containerCookie.appendChild(html);
    }
  }

  function showNoPermission() {
    if (disableButtons) return;
    cookiesListHtml = null;
    const html = document
      .importNode(document.getElementById('tmp-no-permission').content, true)
      .querySelector('div');

    document.getElementById('button-bar-add')?.classList.remove('active');
    document.getElementById('button-bar-import')?.classList.remove('active');
    document.getElementById('button-bar-default')?.classList.remove('active');

    if (containerCookie.firstChild) {
      if (containerCookie.firstElementChild?.id === 'no-permission') return;
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        html,
        'right',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );
    } else {
      containerCookie.appendChild(html);
    }
    document.getElementById('request-permission')?.focus();
    document
      .getElementById('request-permission')
      ?.addEventListener('click', async () => {
        const isGranted = await permissionHandler.requestPermission(
          cookieHandler.currentTab.url
        );
        if (isGranted) showCookiesForTab();
      });
    document
      .getElementById('request-permission-all')
      ?.addEventListener('click', async () => {
        const isGranted =
          await permissionHandler.requestPermission('<all_urls>');
        if (isGranted) showCookiesForTab();
      });
  }

  function showPermissionImpossible() {
    if (disableButtons) return;
    cookiesListHtml = null;
    const html = document
      .importNode(
        document.getElementById('tmp-permission-impossible').content,
        true
      )
      .querySelector('div');

    document.getElementById('button-bar-add')?.classList.remove('active');
    document.getElementById('button-bar-import')?.classList.remove('active');
    document.getElementById('button-bar-default')?.classList.remove('active');
    if (containerCookie.firstChild) {
      if (containerCookie.firstElementChild?.id === 'permission-impossible')
        return;
      disableButtons = true;
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        html,
        'right',
        () => {
          disableButtons = false;
        },
        optionHandler.getAnimationsEnabled()
      );
    } else {
      containerCookie.appendChild(html);
    }
  }

  function showVersion() {
    const version = browserDetector.getApi().runtime.getManifest().version;
    const versionEl = document.getElementById('version');
    if (versionEl) versionEl.textContent = 'v' + version;
  }

  function handleAnimationsEnabled() {
    if (optionHandler.getAnimationsEnabled()) {
      document.body.classList.remove('notransition');
    } else {
      document.body.classList.add('notransition');
    }
  }

  function createHtmlFormCookie() {
    const template = document.importNode(
      document.getElementById('tmp-create').content,
      true
    );
    const form = template.querySelector('form');
    const advToggle = form.querySelector('.advanced-toggle');
    const advForm = form.querySelector('.advanced-form');
    if (advToggle && advForm) {
      advToggle.addEventListener('click', () => {
        advForm.classList.toggle('show');
        if (advForm.classList.contains('show')) {
          advToggle.textContent = '隐藏高级属性';
        } else {
          advToggle.textContent = '显示高级属性';
        }
      });
      if (optionHandler.getCookieAdvanced()) {
        advForm.classList.add('show');
        advToggle.textContent = '隐藏高级属性';
      }
    }
    const inputDomain = form.querySelector('input[name="domain"]');
    if (inputDomain) {
      inputDomain.value = getCurrentDomain();
    }

    const inputHostOnly = form.querySelector('input[name="hostOnly"]');
    const inputSession = form.querySelector('input[name="session"]');
    const inputExpiration = form.querySelector('input[name="expiration"]');

    if (inputSession && inputExpiration) {
      inputExpiration.disabled = inputSession.checked;
      if (inputSession.checked) {
        inputExpiration.value = '无过期时间 (Session)';
      }
      inputSession.addEventListener('change', e => {
        inputExpiration.disabled = e.target.checked;
        if (e.target.checked) {
          inputExpiration.value = '无过期时间 (Session)';
        } else {
          const defaultExp = new Date(Date.now() + 3600 * 1000);
          inputExpiration.value = defaultExp.toLocaleString();
        }
      });
    }

    if (inputHostOnly && inputDomain) {
      inputDomain.disabled = inputHostOnly.checked;
      inputHostOnly.addEventListener('change', e => {
        inputDomain.disabled = e.target.checked;
      });
    }
    return form;
  }

  function createHtmlFormImport() {
    const template = document.importNode(
      document.getElementById('tmp-import').content,
      true
    );
    return template.querySelector('form');
  }

  // ==========================================
  // Exporters & Export Menu
  // ==========================================

  function handleExportButtonClick() {
    const exportOption = optionHandler.getExportFormat();
    switch (exportOption) {
      case ExportFormats.Ask:
        toggleExportMenu();
        break;
      case ExportFormats.JSON:
        exportToJson();
        break;
      case ExportFormats.HeaderString:
        exportToHeaderstring();
        break;
      case ExportFormats.Netscape:
        exportToNetscape();
        break;
      case ExportFormats.Curl:
        exportToCurl();
        break;
      case ExportFormats.Playwright:
        exportToPlaywright();
        break;
      case ExportFormats.Python:
        exportToPython();
        break;
      case ExportFormats.Encrypted:
        exportToEncrypted();
        break;
      default:
        toggleExportMenu();
        break;
    }
  }

  function toggleExportMenu() {
    if (document.getElementById('export-menu')) {
      hideExportMenu();
    } else {
      showExportMenu();
    }
  }

  function showExportMenu() {
    const template = document.importNode(
      document.getElementById('tmp-export-options').content,
      true
    );
    containerCookie.appendChild(template.getElementById('export-menu'));

    document
      .getElementById('export-json')
      ?.addEventListener('click', exportToJson);
    document
      .getElementById('export-headerstring')
      ?.addEventListener('click', exportToHeaderstring);
    document
      .getElementById('export-netscape')
      ?.addEventListener('click', exportToNetscape);
    document
      .getElementById('export-curl')
      ?.addEventListener('click', exportToCurl);
    document
      .getElementById('export-playwright')
      ?.addEventListener('click', exportToPlaywright);
    document
      .getElementById('export-python')
      ?.addEventListener('click', exportToPython);
    document
      .getElementById('export-encrypted')
      ?.addEventListener('click', exportToEncrypted);
  }

  function hideExportMenu() {
    const exportMenu = document.getElementById('export-menu');
    if (exportMenu) {
      containerCookie.removeChild(exportMenu);
      document.activeElement?.blur();
    }
  }

  function flashExportSuccess(msg) {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      ?.querySelector('use');
    if (buttonIcon)
      buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    sendNotification(msg);
    setTimeout(() => {
      if (buttonIcon)
        buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
  }

  async function exportToJson() {
    copyText(JsonFormat.format(loadedCookies));
    flashExportSuccess('已将 Cookie 以 JSON 格式复制到剪贴板');
  }

  function exportToHeaderstring() {
    copyText(HeaderstringFormat.format(loadedCookies));
    flashExportSuccess('已将 Cookie 以 Header 请求头格式复制到剪贴板');
  }

  function exportToNetscape() {
    copyText(NetscapeFormat.format(loadedCookies));
    flashExportSuccess('已将 Cookie 以 Netscape 格式复制到剪贴板');
  }

  function exportToCurl() {
    const cmd = CurlFormat.format(loadedCookies, getCurrentTabUrl());
    copyText(cmd);
    flashExportSuccess('cURL 命令行已复制到剪贴板！');
  }

  function exportToPlaywright() {
    const pw = PlaywrightFormat.format(loadedCookies);
    copyText(pw);
    flashExportSuccess('Playwright JSON 已复制到剪贴板！');
  }

  function exportToPython() {
    const py = PythonFormat.format(loadedCookies, getCurrentTabUrl());
    copyText(py);
    flashExportSuccess('Python requests 脚本已复制到剪贴板！');
  }

  async function exportToEncrypted() {
    hideExportMenu();
    const password = await showPasswordModal(
      '加密导出当前会话',
      '请设置加密密码：'
    );
    if (!password) return;
    try {
      const encrypted = await EncryptedFormat.encrypt(loadedCookies, password);
      copyText(encrypted);
      flashExportSuccess('加密会话数据已复制到剪贴板！');
    } catch (err) {
      sendNotification(err.message || '加密导出失败');
    }
  }

  async function removeCookie(name, url) {
    await cookieHandler.removeCookie(name, url || getCurrentTabUrl());
    if (browserDetector.isSafari()) {
      onCookiesChanged();
    }
  }

  function onCookiesChanged(changeInfo) {
    if (currentActiveTab !== 'cookies') {
      getRawCookiesList().then(cookies => {
        const badge = document.getElementById('tab-badge-cookies');
        if (badge) badge.textContent = cookies.length;
      });
      return;
    }

    if (!changeInfo || !changeInfo.cookie) {
      showCookiesForTab();
      return;
    }

    console.log('Cookies have changed!', changeInfo.removed, changeInfo.cause);
    const id = Cookie.hashCode(changeInfo.cookie);

    if (changeInfo.cause === 'overwrite') return;

    if (changeInfo.removed) {
      if (loadedCookies[id]) {
        loadedCookies[id].removeHtml(() => {
          if (!Object.keys(loadedCookies).length) {
            showNoCookies();
          }
          updateHealthStrip();
        });
        delete loadedCookies[id];
        updateHealthStrip();
      }
      return;
    }

    if (loadedCookies[id]) {
      loadedCookies[id].updateHtml(changeInfo.cookie);
      updateHealthStrip();
      return;
    }

    const domain = getCurrentDomain();
    cookieLockManager
      .isLocked(domain, changeInfo.cookie.name)
      .then(isLocked => {
        const newCookie = new Cookie(
          id,
          changeInfo.cookie,
          optionHandler,
          isLocked
        );
        loadedCookies[id] = newCookie;

        if (!cookiesListHtml && document.getElementById('no-cookies')) {
          clearChildren(containerCookie);
          cookiesListHtml = document.createElement('ul');
          cookiesListHtml.appendChild(generateSearchBar());
          containerCookie.appendChild(cookiesListHtml);
        }

        if (cookiesListHtml) {
          cookiesListHtml.appendChild(newCookie.html);
          updateHealthStrip();
        }
      });
  }

  function sortCookiesByName(a, b) {
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    return aName < bName ? -1 : aName > bName ? 1 : 0;
  }

  async function initWindow(_tab) {
    await optionHandler.loadOptions();
    themeHandler.updateTheme();
    moveButtonBar();
    handleAnimationsEnabled();
    optionHandler.on('optionsChanged', onOptionsChanged);
    cookieHandler.on('cookiesChanged', onCookiesChanged);
    cookieHandler.on('ready', showCookiesForTab);
    const advToggle = document.querySelector('#advanced-toggle-all');
    if (advToggle) advToggle.checked = optionHandler.getCookieAdvanced();
    if (cookieHandler.isReady) {
      showCookiesForTab();
    }
    showVersion();
  }

  function getCurrentTabUrl() {
    return cookieHandler.currentTab?.url || '';
  }

  function getDomainFromUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname || '';
    } catch {
      const matches = url.match(/^https?:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i);
      return matches && matches[1] ? matches[1] : '';
    }
  }

  function sendNotification(message) {
    notificationQueue.push(message);
    triggerNotification();
  }

  function generateSearchBar() {
    const searchBarContainer = document.importNode(
      document.getElementById('tmp-search-bar').content,
      true
    );
    searchBarContainer
      .getElementById('searchField')
      ?.addEventListener('input', e => filterCookies(e.target, e.target.value));

    searchBarContainer
      .getElementById('btn-auto-harden')
      ?.addEventListener('click', async () => {
        if (!cookieHandler.currentTab) return;
        const allCookies = await cookieHandler.getAllCookies();
        const hardened = CookieHealthAdvisor.autoHarden(allCookies);
        for (const c of hardened) {
          const cookieUrl = getCookieCanonicalUrl(c, getCurrentTabUrl());
          await cookieHandler.saveCookie(c, cookieUrl);
        }
        sendNotification(
          '⚡ 已一键加固所有 Cookie（开启 Secure、SameSite=Lax）！'
        );
        showCookiesForTab();
      });

    setTimeout(() => {
      updateHealthStrip();
    }, 20);

    return searchBarContainer;
  }

  /**
   * Updates the health and header budget strip.
   */
  function updateHealthStrip() {
    const sizeBadge = document.getElementById('health-size-badge');
    const scoreBadge = document.getElementById('health-score-badge');
    if (!sizeBadge || !scoreBadge) return;

    const analysis = CookieHealthAdvisor.analyze(
      loadedCookies,
      getCurrentTabUrl()
    );

    const kb = (analysis.totalBytes / 1024).toFixed(1);
    sizeBadge.textContent = `📏 ${analysis.totalBytes} B (${kb} KB)`;

    scoreBadge.textContent = `🛡️ ${analysis.score}/100`;
    scoreBadge.classList.remove('warning', 'danger');
    if (analysis.score < 60) {
      scoreBadge.classList.add('danger');
    } else if (analysis.score < 85) {
      scoreBadge.classList.add('warning');
    }

    if (analysis.issues.length > 0) {
      scoreBadge.title =
        `安全健康评估 (${analysis.issues.length} 项风险):\n` +
        analysis.issues
          .map(i => `• [${i.severity.toUpperCase()}] ${i.message}`)
          .join('\n');
    } else {
      scoreBadge.title = '所有 Cookie 均符合最佳安全规范。';
    }
  }

  function triggerNotification() {
    if (!notificationQueue || !notificationQueue.length) return;
    if (notificationTimeout) return;
    if (notificationElement?.classList.contains('fadeInUp')) return;
    showNotification();
  }

  function showNotification() {
    if (notificationTimeout || !notificationElement) return;

    notificationElement.parentElement.style.display = 'block';
    const dismissBtn = notificationElement.querySelector(
      '#notification-dismiss'
    );
    if (dismissBtn) dismissBtn.style.display = 'block';
    const spanEl = notificationElement.querySelector('span');
    if (spanEl) {
      spanEl.textContent = notificationQueue.shift();
      spanEl.setAttribute('role', 'alert');
    }
    notificationElement.classList.add('fadeInUp');
    notificationElement.classList.remove('fadeOutDown');

    notificationTimeout = setTimeout(() => {
      hideNotification();
    }, 2500);
  }

  function hideNotification() {
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }
    if (!notificationElement) return;

    const spanEl = notificationElement.querySelector('span');
    if (spanEl) spanEl.setAttribute('role', '');
    notificationElement.classList.remove('fadeInUp');
    notificationElement.classList.add('fadeOutDown');
    const dismissBtn = notificationElement.querySelector(
      '#notification-dismiss'
    );
    if (dismissBtn) dismissBtn.style.display = 'none';
  }

  function setPageTitle(title) {
    if (!pageTitleContainer) return;
    const h1 = pageTitleContainer.querySelector('h1');
    if (h1) h1.textContent = title;
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const fakeText = document.createElement('textarea');
      fakeText.classList.add('clipboardCopier');
      fakeText.textContent = text;
      document.body.appendChild(fakeText);
      fakeText.focus();
      fakeText.select();
      document.execCommand('Copy');
      document.body.removeChild(fakeText);
    });
  }

  function isArray(value) {
    return value && typeof value === 'object' && value.constructor === Array;
  }

  function clearChildren(element) {
    if (!element) return;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function adjustWidthIfSmaller() {
    const realWidth = document.documentElement.clientWidth;
    if (realWidth < 500) {
      document.body.style.minWidth = '100%';
      document.body.style.width = realWidth + 'px';
    }
  }

  /**
   * Filters cookies by SmartFilter (tokens, flags, regex, property).
   */
  function filterCookies(target, filterText) {
    if (!cookiesListHtml) return;
    const cookies = cookiesListHtml.querySelectorAll('.cookie');
    filterText = filterText.trim();

    if (filterText) {
      target.classList.add('content');
    } else {
      target.classList.remove('content');
    }

    for (let i = 0; i < cookies.length; i++) {
      const cookieElement = cookies[i];
      const cookieId = cookieElement.id;
      const cookieObj = loadedCookies[cookieId];
      const isLocked = cookieObj?.isLocked || false;

      const match = SmartFilter.matches(
        cookieObj || {
          cookie: { name: cookieElement.getAttribute('data-name') },
        },
        filterText,
        isLocked
      );

      if (match) {
        cookieElement.classList.remove('hide');
      } else {
        cookieElement.classList.add('hide');
      }
    }
  }

  function onOptionsChanged(oldOptions) {
    handleAnimationsEnabled();
    moveButtonBar();
    if (oldOptions.advancedCookies != optionHandler.getCookieAdvanced()) {
      const advToggle = document.querySelector('#advanced-toggle-all');
      if (advToggle) advToggle.checked = optionHandler.getCookieAdvanced();
      showCookiesForTab();
    }
    if (oldOptions.extraInfo != optionHandler.getExtraInfo()) {
      showCookiesForTab();
    }
  }

  function moveButtonBar() {
    const siblingElement = optionHandler.getButtonBarTop()
      ? document.getElementById('pageTitle')?.nextSibling
      : document.body.lastChild;
    if (!siblingElement) return;
    document.querySelectorAll('.button-bar').forEach(bar => {
      siblingElement.parentNode.insertBefore(bar, siblingElement);
      if (optionHandler.getButtonBarTop()) {
        document.body.classList.add('button-bar-top');
      } else {
        document.body.classList.remove('button-bar-top');
      }
    });
  }
})();
