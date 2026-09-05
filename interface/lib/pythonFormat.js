/**
 * Formats cookies into a Python requests snippet.
 */
export class PythonFormat {
  /**
   * @param {object} loadedCookies
   * @param {string} url
   * @return {string}
   */
  static format(loadedCookies, url = 'https://example.com') {
    const cookieDict = {};
    for (const cookieId in loadedCookies) {
      if (!Object.prototype.hasOwnProperty.call(loadedCookies, cookieId)) {
        continue;
      }
      const c = loadedCookies[cookieId].cookie || loadedCookies[cookieId];
      if (c && c.name) {
        cookieDict[c.name] = c.value || '';
      }
    }

    const jsonStr = JSON.stringify(cookieDict, null, 4);
    return `import requests\n\nurl = "${url}"\n\ncookies = ${jsonStr}\n\nheaders = {\n    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"\n}\n\nresponse = requests.get(url, headers=headers, cookies=cookies)\nprint(response.status_code)\nprint(response.text[:200])\n`;
  }

  /**
   * Parses cookies from Python requests snippet.
   * @param {string} pyCode
   * @return {Array}
   */
  static parse(pyCode) {
    if (!pyCode || typeof pyCode !== 'string') return [];
    const match = pyCode.match(/cookies\s*=\s*({[\s\S]*?})/);
    if (match && match[1]) {
      try {
        const dict = JSON.parse(match[1]);
        const list = [];
        for (const [k, v] of Object.entries(dict)) {
          list.push({ name: k, value: String(v) });
        }
        return list;
      } catch (e) {
        // Fallback key-value extraction
        const regex = /["']([^"']+)["']\s*:\s*["']([^"']*)["']/g;
        const list = [];
        let m;
        while ((m = regex.exec(match[1])) !== null) {
          list.push({ name: m[1], value: m[2] });
        }
        return list;
      }
    }
    return [];
  }
}
