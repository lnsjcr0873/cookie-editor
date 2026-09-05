import { GenericCookieHandler } from '../lib/genericCookieHandler.js';

/**
 * implements Cookie API handling for the popup and other similar interfaces.
 */
export class CookieHandlerPopup extends GenericCookieHandler {
  /**
   * Constructs and initializes the cookie handler.
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    super(browserDetector);
    console.log('Constructing PopupCookieHandler');
    this.isReady = false;
    this.currentTabId = null;

    this.browserDetector
      .getApi()
      .tabs.query({ active: true, currentWindow: true })
      .then(tabInfo => {
        if (tabInfo && tabInfo.length > 0) {
          this.init(tabInfo);
        }
      })
      .catch(error => {
        console.error('Failed to query current tab on popup init:', error);
      });
  }

  /**
   * Initialise the cookie handler after getting our first contact with the
   * current tab.
   * @param {*} tabInfo Info about the current tab.
   */
  init = tabInfo => {
    if (!tabInfo || !tabInfo[0] || tabInfo[0].id === undefined) {
      return;
    }
    this.currentTabId = tabInfo[0].id;
    this.currentTab = tabInfo[0];
    const api = this.browserDetector.getApi();
    api.tabs.onUpdated.addListener(this.onTabsChanged);
    api.tabs.onActivated.addListener(this.onTabActivated);
    if (!this.browserDetector.isSafari()) {
      api.cookies.onChanged.addListener(this.onCookiesChanged);
    }

    this.emit('ready');
    this.isReady = true;
  };

  /**
   * Handles events that is triggered when a cookie changes.
   * @param {object} changeInfo An object containing details of the change that
   *     occurred.
   */
  onCookiesChanged = changeInfo => {
    if (!changeInfo?.cookie?.domain) {
      return;
    }
    const domain = changeInfo.cookie.domain.startsWith('.')
      ? changeInfo.cookie.domain.substring(1)
      : changeInfo.cookie.domain;
    const tabStoreId = this.currentTab?.cookieStoreId;
    const storeMatches =
      !tabStoreId ||
      tabStoreId === '0' ||
      changeInfo.cookie.storeId === tabStoreId ||
      (tabStoreId === undefined && changeInfo.cookie.storeId === '0');

    if (
      this.currentTab &&
      this.currentTab.url &&
      this.currentTab.url.includes(domain) &&
      storeMatches
    ) {
      this.emit('cookiesChanged', changeInfo);
    }
  };

  /**
   * Handles the event that is fired when a tab is updated.
   * @param {object} tabId Id of the tab that changed.
   * @param {object} changeInfo Properties of the tab that changed.
   * @param {object} _tab
   */
  onTabsChanged = async (tabId, changeInfo, _tab) => {
    if (
      tabId === this.currentTabId &&
      (changeInfo.url || changeInfo.status === 'complete')
    ) {
      console.log('tabChanged!');
      try {
        const tabInfo = await this.browserDetector
          .getApi()
          .tabs.query({ active: true, currentWindow: true });
        if (tabInfo && tabInfo.length > 0 && tabInfo[0]) {
          this.updateCurrentTab(tabInfo);
        }
      } catch (error) {
        console.error('Failed to query tab on tabsChanged:', error);
      }
    }
  };

  /**
   * Event handler for when a tab is being activated.
   * @param {object} activeInfo Info about the event.
   */
  onTabActivated = async activeInfo => {
    try {
      const tabInfo = await this.browserDetector
        .getApi()
        .tabs.query({ active: true, currentWindow: true });
      if (tabInfo && tabInfo.length > 0 && tabInfo[0]) {
        this.updateCurrentTab(tabInfo);
      }
    } catch (error) {
      console.error('Failed to query tab on tabActivated:', error);
    }
  };

  /**
   * Emits a signal that the current tab changed if needed.
   * @param {object} tabInfo Info about the new current tab.
   */
  updateCurrentTab = tabInfo => {
    if (!tabInfo || !tabInfo[0] || tabInfo[0].id === undefined) {
      return;
    }
    const newTab =
      tabInfo[0].id !== this.currentTabId ||
      !this.currentTab ||
      tabInfo[0].url !== this.currentTab.url;
    this.currentTabId = tabInfo[0].id;
    this.currentTab = tabInfo[0];

    if (newTab && this.isReady) {
      this.emit('cookiesChanged');
    }
  };
}
