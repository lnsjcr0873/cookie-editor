import assert from 'node:assert/strict';
import test from 'node:test';

import { GenericCookieHandler } from '../interface/lib/genericCookieHandler.js';
import { createSinonBrowserMock } from './mocks/sinonBrowserMock.js';

test('GenericCookieHandler - prepareCookie standard chrome', () => {
  const { detector } = createSinonBrowserMock({ browserName: 'chrome' });
  const handler = new GenericCookieHandler(detector);
  handler.currentTab = { url: 'https://example.com/page', cookieStoreId: '0' };

  const inputCookie = {
    name: 'session_id',
    value: 'abc123xyz',
    domain: 'example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: 1800000000,
  };

  const prepared = handler.prepareCookie(
    inputCookie,
    'https://example.com/page'
  );
  assert.equal(prepared.name, 'session_id');
  assert.equal(prepared.value, 'abc123xyz');
  assert.equal(prepared.domain, 'example.com');
  assert.equal(prepared.path, '/');
  assert.equal(prepared.secure, true);
  assert.equal(prepared.httpOnly, true);
  assert.equal(prepared.sameSite, 'lax');
  assert.equal(prepared.expirationDate, 1800000000);
  assert.equal(prepared.storeId, '0');
  assert.equal(prepared.url, 'https://example.com/page');
});

test('GenericCookieHandler - prepareCookie with sameSite no_restriction forces secure=true', () => {
  const { detector } = createSinonBrowserMock({ browserName: 'chrome' });
  const handler = new GenericCookieHandler(detector);
  handler.currentTab = { url: 'https://example.com/page' };

  const inputCookie = {
    name: 'cross_site_cookie',
    value: 'val',
    domain: 'example.com',
    path: '/',
    secure: false,
    sameSite: 'no_restriction',
  };

  const prepared = handler.prepareCookie(
    inputCookie,
    'https://example.com/page'
  );
  assert.equal(prepared.sameSite, 'no_restriction');
  assert.equal(prepared.secure, true);
});

test('GenericCookieHandler - prepareCookie Safari domain fallback quirks', () => {
  const { detector } = createSinonBrowserMock({ browserName: 'safari' });
  const handler = new GenericCookieHandler(detector);
  handler.currentTab = {};

  const inputCookie = {
    name: 'safari_cookie',
    value: 'val',
    domain: '.example.com',
  };

  const prepared = handler.prepareCookie(inputCookie, '');
  assert.equal(prepared.url, 'http://.example.com');
});

test('GenericCookieHandler - saveCookie calls chrome.cookies.set with prepared data', async () => {
  const { detector, stubs } = createSinonBrowserMock({ browserName: 'chrome' });
  const savedResult = { name: 'my_cookie', value: '123' };
  stubs.cookies.set.resolves(savedResult);

  const handler = new GenericCookieHandler(detector);
  handler.currentTab = { url: 'https://example.com/page' };

  const res = await handler.saveCookie(
    { name: 'my_cookie', value: '123', domain: 'example.com' },
    'https://example.com/page'
  );

  assert.equal(res, savedResult);
  assert.equal(stubs.cookies.set.calledOnce, true);
  const passedArg = stubs.cookies.set.firstCall.args[0];
  assert.equal(passedArg.name, 'my_cookie');
  assert.equal(passedArg.value, '123');
});

test('GenericCookieHandler - removeCookie calls chrome.cookies.remove', async () => {
  const { detector, stubs } = createSinonBrowserMock({ browserName: 'chrome' });
  const removedResult = { name: 'my_cookie', url: 'https://example.com/page' };
  stubs.cookies.remove.resolves(removedResult);

  const handler = new GenericCookieHandler(detector);
  handler.currentTab = {
    url: 'https://example.com/page',
    cookieStoreId: 'firefox-container-1',
  };

  const res = await handler.removeCookie(
    'my_cookie',
    'https://example.com/page'
  );
  assert.equal(res, removedResult);
  assert.equal(stubs.cookies.remove.calledOnce, true);
  assert.deepEqual(stubs.cookies.remove.firstCall.args[0], {
    name: 'my_cookie',
    url: 'https://example.com/page',
    storeId: 'firefox-container-1',
  });
});

test('GenericCookieHandler - removeCookie on Safari queries all cookies and removes each matching domain', async () => {
  const { detector, stubs } = createSinonBrowserMock({
    browserName: 'safari',
  });
  stubs.cookies.getAll.resolves([
    { name: 'session_token', domain: 'example.com' },
    { name: 'session_token', domain: '.example.com' },
    { name: 'unrelated_cookie', domain: 'other.com' },
  ]);
  stubs.cookies.remove.resolves({ name: 'session_token' });

  const handler = new GenericCookieHandler(detector);
  handler.currentTab = {
    url: 'https://example.com/page',
    cookieStoreId: '0',
  };

  await handler.removeCookie('session_token', 'https://example.com/page');

  assert.equal(stubs.cookies.getAll.calledOnce, true);
  assert.equal(stubs.cookies.remove.callCount, 2);
  assert.deepEqual(stubs.cookies.remove.firstCall.args[0], {
    name: 'session_token',
    url: 'http://example.com',
    storeId: '0',
  });
  assert.deepEqual(stubs.cookies.remove.secondCall.args[0], {
    name: 'session_token',
    url: 'http://example.com',
    storeId: '0',
  });
});

test('GenericCookieHandler - prepareCookie preserves session cookie without expirationDate (never null or 0)', () => {
  const { detector } = createSinonBrowserMock({ browserName: 'chrome' });
  const handler = new GenericCookieHandler(detector);
  handler.currentTab = { url: 'https://example.com/login' };

  // Case 1: No expirationDate provided
  const sessionCookie1 = {
    name: 'AUTH_SESSION_ID',
    value: 'secret_jwt_token',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: true,
  };
  const prepared1 = handler.prepareCookie(
    sessionCookie1,
    'https://example.com/login'
  );
  assert.equal(prepared1.name, 'AUTH_SESSION_ID');
  assert.equal(prepared1.value, 'secret_jwt_token');
  assert.equal(prepared1.expirationDate, undefined); // Crucial! Must be undefined, NOT null
  assert.equal(prepared1.url, 'https://example.com/login');

  // Case 2: Explicit session: true flag with undefined/null expirationDate
  const sessionCookie2 = {
    name: 'connect.sid',
    value: 's%3A123',
    session: true,
    expirationDate: null,
    domain: 'sub.example.com',
  };
  const prepared2 = handler.prepareCookie(sessionCookie2, '');
  assert.equal(prepared2.expirationDate, undefined);
  assert.equal(prepared2.url, 'http://sub.example.com/');
});

test('GenericCookieHandler - prepareCookie handles hostOnly cookies properly', () => {
  const { detector } = createSinonBrowserMock({ browserName: 'chrome' });
  const handler = new GenericCookieHandler(detector);
  handler.currentTab = { url: 'https://host.example.com/test' };

  const hostCookie = {
    name: '__Host-auth',
    value: 'secure_val',
    domain: 'host.example.com',
    hostOnly: true,
    path: '/',
    secure: true,
  };

  const prepared = handler.prepareCookie(
    hostCookie,
    'https://host.example.com/test'
  );
  assert.equal(prepared.domain, undefined); // HostOnly cookies must NOT have domain property in chrome.cookies.set
  assert.equal(prepared.name, '__Host-auth');
});
