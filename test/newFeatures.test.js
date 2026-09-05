import assert from 'node:assert/strict';
import test from 'node:test';

import { Cookie } from '../interface/lib/cookie.js';
import { CookieDiffManager } from '../interface/lib/cookieDiffManager.js';
import { CookieHealthAdvisor } from '../interface/lib/cookieHealthAdvisor.js';
import { CookieJarManager } from '../interface/lib/cookieJarManager.js';
import { CookieLockManager } from '../interface/lib/cookieLockManager.js';
import { CurlFormat } from '../interface/lib/curlFormat.js';
import { EncryptedFormat } from '../interface/lib/encryptedFormat.js';
import { ImmortalityEngine } from '../interface/lib/immortalityEngine.js';
import { JWTInspector } from '../interface/lib/jwtInspector.js';
import { NetscapeFormat } from '../interface/lib/netscapeFormat.js';
import { PlaywrightFormat } from '../interface/lib/playwrightFormat.js';
import { ProfileManager } from '../interface/lib/profileManager.js';
import { PythonFormat } from '../interface/lib/pythonFormat.js';
import { SmartFilter } from '../interface/lib/smartFilter.js';
import { StorageBridge } from '../interface/lib/storageBridge.js';
import { CookieHandlerPopup } from '../interface/popup/cookieHandlerPopup.js';
import { createSinonBrowserMock } from './mocks/sinonBrowserMock.js';

test('CurlFormat - formats cookies into curl header argument and parses back', () => {
  const cookiesMap = {
    c1: { cookie: { name: 'session_id', value: 'secret123' } },
    c2: { cookie: { name: 'theme', value: 'dark' } },
  };

  const curl = CurlFormat.format(cookiesMap, 'https://mysite.com/api');
  assert.ok(curl.includes('curl -i -s -k -X GET "https://mysite.com/api"'));
  assert.ok(curl.includes('-H "Cookie: session_id=secret123;theme=dark"'));

  const parsed = CurlFormat.parse(
    'curl -i -s -k -X GET "https://mysite.com/api" -H "Cookie: session_id=secret123; theme=dark"'
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'session_id');
  assert.equal(parsed[0].value, 'secret123');
  assert.equal(parsed[1].name, 'theme');
  assert.equal(parsed[1].value, 'dark');
});

test('PlaywrightFormat - formats cookies into Playwright JSON and parses back', () => {
  const cookiesMap = {
    c1: {
      cookie: {
        name: 'auth',
        value: 'tok_abc',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        expirationDate: 1800000000,
      },
    },
  };

  const pwJson = PlaywrightFormat.format(cookiesMap);
  const parsedPw = JSON.parse(pwJson);
  assert.equal(Array.isArray(parsedPw), true);
  assert.equal(parsedPw.length, 1);
  assert.equal(parsedPw[0].name, 'auth');
  assert.equal(parsedPw[0].value, 'tok_abc');
  assert.equal(parsedPw[0].sameSite, 'Lax');
  assert.equal(parsedPw[0].secure, true);
  assert.equal(parsedPw[0].httpOnly, true);

  const parsedCookies = PlaywrightFormat.parse(pwJson);
  assert.equal(parsedCookies.length, 1);
  assert.equal(parsedCookies[0].name, 'auth');
  assert.equal(parsedCookies[0].value, 'tok_abc');
  assert.equal(parsedCookies[0].domain, '.example.com');
  assert.equal(parsedCookies[0].secure, true);
});

test('PythonFormat - formats cookies into Python requests snippet and parses back', () => {
  const cookiesMap = {
    c1: { cookie: { name: 'uid', value: '1001' } },
    c2: { cookie: { name: 'token', value: 'xyz' } },
  };

  const pyCode = PythonFormat.format(cookiesMap, 'https://example.com/login');
  assert.ok(pyCode.includes('import requests'));
  assert.ok(pyCode.includes('url = "https://example.com/login"'));
  assert.ok(pyCode.includes('"uid": "1001"'));
  assert.ok(pyCode.includes('"token": "xyz"'));
  assert.ok(
    pyCode.includes('requests.get(url, headers=headers, cookies=cookies)')
  );

  const parsed = PythonFormat.parse(pyCode);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'uid');
  assert.equal(parsed[0].value, '1001');
  assert.equal(parsed[1].name, 'token');
  assert.equal(parsed[1].value, 'xyz');
});

test('EncryptedFormat - encrypts and decrypts cookies bundle with AES-GCM', async () => {
  const cookiesMap = {
    c1: {
      cookie: {
        name: 'sensitive_token',
        value: 'very_secret_jwt_or_key',
        domain: 'example.com',
        path: '/',
      },
    },
  };

  const password = 'SuperStrongPassword!123';
  const encryptedPayload = await EncryptedFormat.encrypt(cookiesMap, password);
  assert.ok(encryptedPayload.startsWith('ENCSESSION:v1:'));

  const decryptedCookies = await EncryptedFormat.decrypt(
    encryptedPayload,
    password
  );
  assert.equal(decryptedCookies.c1.cookie.name, 'sensitive_token');
  assert.equal(decryptedCookies.c1.cookie.value, 'very_secret_jwt_or_key');
});

test('JWTInspector - detects and decodes JWT tokens properly', () => {
  const validJwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMzQ1IiwibmFtZSI6IkFsaWNlIiwiZXhwIjoyMTQ3NDgzNjQ3fQ.signature_dummy';

  assert.equal(JWTInspector.isJWT(validJwt), true);
  assert.equal(JWTInspector.isJWT('regular_cookie_value_123'), false);

  const decoded = JWTInspector.decodeJWT(validJwt);
  assert.ok(decoded);
  assert.equal(decoded.header.alg, 'HS256');
  assert.equal(decoded.payload.sub, 'user_12345');
  assert.equal(decoded.payload.name, 'Alice');
  assert.equal(decoded.isExpired, false);
  assert.ok(decoded.expiresAt instanceof Date);
});

test('CookieDiffManager - computes added, removed, and modified cookies', () => {
  const oldCookies = [
    { name: 'session', value: 'v1', domain: 'example.com', path: '/' },
    { name: 'to_be_deleted', value: 'old', domain: 'example.com', path: '/' },
    { name: 'unchanged', value: 'same', domain: 'example.com', path: '/' },
  ];

  const currentCookies = [
    { name: 'session', value: 'v2', domain: 'example.com', path: '/' },
    { name: 'brand_new', value: 'fresh', domain: 'example.com', path: '/' },
    { name: 'unchanged', value: 'same', domain: 'example.com', path: '/' },
  ];

  const diff = CookieDiffManager.computeDiff(oldCookies, currentCookies);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].name, 'brand_new');

  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].name, 'to_be_deleted');

  assert.equal(diff.modified.length, 1);
  assert.equal(diff.modified[0].new.name, 'session');
  assert.equal(diff.modified[0].old.value, 'v1');
  assert.equal(diff.modified[0].new.value, 'v2');

  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.unchanged[0].name, 'unchanged');
});

test('ImmortalityEngine - computes 1-year extended expiration dates and sessionizes', () => {
  const currentSec = Math.floor(Date.now() / 1000);
  const oneYearLater = currentSec + 365 * 24 * 3600;

  const cookiesList = [
    {
      name: 'test_cookie',
      value: 'abc',
      session: true,
    },
  ];

  const extended = ImmortalityEngine.extendExpiration(cookiesList, 1);
  assert.equal(extended.length, 1);
  assert.equal(extended[0].session, false);
  assert.ok(
    extended[0].expirationDate >= oneYearLater - 5 &&
      extended[0].expirationDate <= oneYearLater + 5
  );

  const sessionized = ImmortalityEngine.makeAllSession(extended);
  assert.equal(sessionized.length, 1);
  assert.equal(sessionized[0].session, true);
  assert.equal(sessionized[0].expirationDate, undefined);
});

test('ProfileManager - manages global profiles across multiple domains', async () => {
  const mockStorage = {};
  const mockStorageHandler = {
    async getLocal(key) {
      if (key === null) return mockStorage;
      return mockStorage[key];
    },
    async setLocal(key, value) {
      if (value === null) {
        delete mockStorage[key];
      } else {
        mockStorage[key] = value;
      }
    },
  };

  const pm = new ProfileManager(mockStorageHandler);
  await pm.saveProfile('site-a.com', 'Admin Account', [
    { name: 'admin_tok', value: '123' },
  ]);
  await pm.saveProfile('site-b.com', 'User Account', [
    { name: 'user_tok', value: '456' },
  ]);

  const globalProfiles = await pm.getAllGlobalProfiles();
  assert.equal(globalProfiles.length, 2);

  const backupJson = await pm.exportAllGlobalProfilesJson();
  assert.ok(backupJson.includes('site-a.com'));
  assert.ok(backupJson.includes('site-b.com'));

  await pm.clearAllGlobalProfiles();
  const cleared = await pm.getAllGlobalProfiles();
  assert.equal(cleared.length, 0);

  const importRes = await pm.importAllGlobalProfilesJson(backupJson);
  assert.equal(importRes.importedDomains, 2);
  assert.equal(importRes.importedProfiles, 2);
});

test('CookieHealthAdvisor - diagnoses vulnerabilities and auto-hardens cookies', () => {
  const insecureCookies = [
    {
      name: 'session_token',
      value: 'secret123',
      secure: false,
      httpOnly: false,
      sameSite: 'none',
    },
    {
      name: 'theme',
      value: 'dark',
      secure: true,
      httpOnly: false,
      sameSite: 'lax',
    },
  ];

  const analysis = CookieHealthAdvisor.analyze(
    insecureCookies,
    'https://example.com'
  );
  assert.ok(analysis.score < 100);
  assert.ok(analysis.issues.length >= 2);
  assert.ok(analysis.totalBytes > 0);

  const hardened = CookieHealthAdvisor.autoHarden(insecureCookies);
  assert.equal(hardened[0].secure, true);
  assert.equal(hardened[0].httpOnly, true);
  assert.equal(hardened[0].sameSite, 'lax');

  const hardenedAnalysis = CookieHealthAdvisor.analyze(
    hardened,
    'https://example.com'
  );
  assert.equal(hardenedAnalysis.score, 100);
  assert.equal(hardenedAnalysis.issues.length, 0);
});

test('SmartFilter - matches tokens, properties, regex, and flags', () => {
  const cookie = {
    name: 'auth_token',
    value:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
    domain: 'api.example.com',
    path: '/v1',
    secure: true,
    httpOnly: true,
    expirationDate: 1900000000,
  };

  // Plain substring
  assert.equal(SmartFilter.matches(cookie, 'token'), true);
  assert.equal(SmartFilter.matches(cookie, 'nonexistent'), false);

  // Property filters
  assert.equal(SmartFilter.matches(cookie, 'name:auth domain:example'), true);
  assert.equal(SmartFilter.matches(cookie, 'path:/v2'), false);

  // Flag filters
  assert.equal(
    SmartFilter.matches(cookie, 'is:secure is:httponly is:jwt is:persistent'),
    true
  );
  assert.equal(SmartFilter.matches(cookie, 'is:insecure'), false);
  assert.equal(SmartFilter.matches(cookie, 'is:locked', false), false);
  assert.equal(SmartFilter.matches(cookie, 'is:locked', true), true);

  // Regex
  assert.equal(SmartFilter.matches(cookie, '/^auth_/i'), true);
  assert.equal(SmartFilter.matches(cookie, '/^user_/i'), false);

  // Path token matching
  assert.equal(SmartFilter.matches(cookie, '/v1'), true);
});

test('Cookie.hashCode - generates distinct IDs for same name on different paths and normalizes leading dots', () => {
  const c1 = { name: 'token', domain: '.example.com', path: '/' };
  const c2 = { name: 'token', domain: 'example.com', path: '/' };
  const c3 = { name: 'token', domain: '.example.com', path: '/api' };

  // c1 and c2 should have identical hash because domain leading dot is normalized
  assert.equal(Cookie.hashCode(c1), Cookie.hashCode(c2));

  // c3 has different path, must have different hash
  assert.notEqual(Cookie.hashCode(c1), Cookie.hashCode(c3));
});

test('CookieLockManager, CookieJarManager, ProfileManager - normalize domain keys', async () => {
  const mockStorage = {};
  const mockHandler = {
    async getLocal(key) {
      if (key === null) return mockStorage;
      return mockStorage[key];
    },
    async setLocal(key, value) {
      if (value === null) delete mockStorage[key];
      else mockStorage[key] = value;
    },
  };

  const lockMgr = new CookieLockManager(mockHandler);
  await lockMgr.toggleLock('.example.com', 'session');
  assert.equal(await lockMgr.isLocked('example.com', 'session'), true);
  assert.equal(await lockMgr.isLocked('.example.com', 'session'), true);

  const jarMgr = new CookieJarManager(mockHandler);
  await jarMgr.stash('.test.com', [{ name: 'a', value: '1' }]);
  assert.equal(await jarMgr.isSandboxed('test.com'), true);
  const popped = await jarMgr.pop('test.com');
  assert.equal(popped.cookies.length, 1);
  assert.equal(await jarMgr.isSandboxed('.test.com'), false);

  const profMgr = new ProfileManager(mockHandler);
  await profMgr.saveProfile('.domain.com', 'Pro User', [
    { name: 'u', value: '1' },
  ]);
  const profs = await profMgr.getProfiles('domain.com');
  assert.equal(profs.length, 1);
  assert.equal(profs[0].name, 'Pro User');
});

test('CurlFormat.parse - handles -b and --cookie arguments', () => {
  const curl1 = 'curl -b "sid=123; user=alice" https://example.com';
  const parsed1 = CurlFormat.parse(curl1);
  assert.equal(parsed1.length, 2);
  assert.equal(parsed1[0].name, 'sid');
  assert.equal(parsed1[0].value, '123');

  const curl2 = 'curl --cookie "token=xyz" https://example.com';
  const parsed2 = CurlFormat.parse(curl2);
  assert.equal(parsed2.length, 1);
  assert.equal(parsed2[0].name, 'token');
  assert.equal(parsed2[0].value, 'xyz');
});

test('PlaywrightFormat.parse - normalizes sameSite none to no_restriction', () => {
  const pwData = JSON.stringify([
    {
      name: 'cross_site',
      value: 'val',
      domain: 'example.com',
      sameSite: 'None',
      secure: true,
      expires: -1,
    },
  ]);
  const parsed = PlaywrightFormat.parse(pwData);
  assert.equal(parsed[0].sameSite, 'no_restriction');
  assert.equal(parsed[0].session, true);
  assert.equal(parsed[0].expirationDate, undefined);
});

test('NetscapeFormat.parse - extracts expirationDate number and session flag correctly', () => {
  const netscapeText = [
    '# Netscape HTTP Cookie File',
    'example.com\tTRUE\t/\tTRUE\t1900000000\tpersist_tok\tval1',
    'example.com\tTRUE\t/\tFALSE\t0\tsess_tok\tval2',
  ].join('\n');

  const parsed = NetscapeFormat.parse(netscapeText);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'persist_tok');
  assert.equal(parsed[0].expirationDate, 1900000000);
  assert.equal(parsed[0].session, false);

  assert.equal(parsed[1].name, 'sess_tok');
  assert.equal(parsed[1].expirationDate, undefined);
  assert.equal(parsed[1].session, true);
});

test('CurlFormat.parse - handles unquoted -b and --cookie arguments', () => {
  const curl1 = 'curl -b sid=unquoted123 https://example.com';
  const parsed1 = CurlFormat.parse(curl1);
  assert.equal(parsed1.length, 1);
  assert.equal(parsed1[0].name, 'sid');
  assert.equal(parsed1[0].value, 'unquoted123');

  const curl2 = 'curl --cookie theme=light https://example.com';
  const parsed2 = CurlFormat.parse(curl2);
  assert.equal(parsed2.length, 1);
  assert.equal(parsed2[0].name, 'theme');
  assert.equal(parsed2[0].value, 'light');
});

test('CookieDiffManager.computeDiff - normalizes domain leading dot comparison', () => {
  const oldList = [
    { name: 'sid', value: '123', domain: '.example.com', path: '/' },
  ];
  const newList = [
    { name: 'sid', value: '123', domain: 'example.com', path: '/' },
  ];
  const diff = CookieDiffManager.computeDiff(oldList, newList);
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.modified.length, 0);
});

test('Cookie.formatExpirationForDisplay and formatExpirationForDisplayShort', () => {
  const sessionCookie = new Cookie('1', { name: 'sess', value: '1' }, null);
  assert.equal(
    sessionCookie.formatExpirationForDisplay(),
    '无过期时间 (Session)'
  );
  assert.equal(
    sessionCookie.formatExpirationForDisplayShort(),
    '无过期时间 (Session)'
  );

  const persistentCookie = new Cookie(
    '2',
    { name: 'persist', value: '1', expirationDate: 1800000000 },
    null
  );
  assert.ok(persistentCookie.formatExpirationForDisplay() instanceof Date);
  assert.equal(
    persistentCookie.formatExpirationForDisplayShort(),
    '2027-01-15T08:00:00Z'
  );
});

test('SmartFilter - filters by is:hostonly and samesite: property', () => {
  const c1 = {
    name: 'session_c1',
    hostOnly: true,
    sameSite: 'lax',
  };
  const c2 = {
    name: 'session_c2',
    hostOnly: false,
    sameSite: 'strict',
  };

  assert.equal(SmartFilter.matches(c1, 'is:hostonly'), true);
  assert.equal(SmartFilter.matches(c2, 'is:hostonly'), false);

  assert.equal(SmartFilter.matches(c1, 'samesite:lax'), true);
  assert.equal(SmartFilter.matches(c1, 'samesite:strict'), false);
  assert.equal(SmartFilter.matches(c2, 'samesite:strict'), true);
});

test('CookieHealthAdvisor.autoHarden - handles wrapped cookie map correctly', () => {
  const wrappedMap = {
    c1: {
      cookie: {
        name: 'auth_token',
        value: 'tok_123',
        secure: false,
        httpOnly: false,
      },
    },
  };
  const hardened = CookieHealthAdvisor.autoHarden(wrappedMap);
  assert.equal(hardened.length, 1);
  assert.equal(hardened[0].name, 'auth_token');
  assert.equal(hardened[0].secure, true);
  assert.equal(hardened[0].httpOnly, true);
  assert.equal(hardened[0].sameSite, 'lax');
});

test('CookieHandlerPopup - onCookiesChanged matches exact domain, subdomains, and filters storeId', () => {
  const { detector } = createSinonBrowserMock();
  const handler = new CookieHandlerPopup(detector);
  handler.currentTab = {
    id: 1,
    url: 'https://sub.domain.com/app',
    cookieStoreId: '0',
  };

  let emitted = 0;
  handler.on('cookiesChanged', () => {
    emitted++;
  });

  // 1. Cookie matching parent domain
  handler.onCookiesChanged({
    cookie: { domain: '.domain.com', storeId: '0' },
  });
  assert.equal(emitted, 1);

  // 2. Cookie matching exact subdomain
  handler.onCookiesChanged({
    cookie: { domain: 'sub.domain.com', storeId: '0' },
  });
  assert.equal(emitted, 2);

  // 3. Substring false positive (e.g. notdomain.com)
  handler.onCookiesChanged({
    cookie: { domain: 'notdomain.com', storeId: '0' },
  });
  assert.equal(emitted, 2);

  // 4. Mismatched storeId
  handler.onCookiesChanged({
    cookie: { domain: 'sub.domain.com', storeId: 'firefox-container-5' },
  });
  assert.equal(emitted, 2);
});

test('Cookie.formatExpirationForDisplay - handles NaN gracefully', () => {
  const nanCookie = new Cookie(
    'nan-test',
    { name: 'bad_exp', expirationDate: NaN },
    null
  );
  assert.equal(nanCookie.formatExpirationForDisplay(), '无过期时间 (Session)');
  assert.equal(
    nanCookie.formatExpirationForDisplayShort(),
    '无过期时间 (Session)'
  );
});

test('StorageBridge.executeOnTab - falls back to tabs.executeScript if scripting API unavailable', async () => {
  const detector = {
    getApi() {
      return {
        tabs: {
          async executeScript(tabId, details) {
            return [{ key: 'value' }];
          },
        },
      };
    },
  };

  const bridge = new StorageBridge(detector);
  const result = await bridge.executeOnTab(10, () => ({ key: 'value' }));
  assert.deepEqual(result, { key: 'value' });
});
