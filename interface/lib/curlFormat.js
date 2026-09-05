import { HeaderstringFormat } from './headerstringFormat.js';

/**
 * Formats cookies into a cURL command.
 */
export class CurlFormat {
  /**
   * @param {object} loadedCookies
   * @param {string} url
   * @return {string}
   */
  static format(loadedCookies, url = 'https://example.com') {
    const cookieHeader = HeaderstringFormat.format(loadedCookies);
    return `curl -i -s -k -X GET "${url}" \\\n  -H "Cookie: ${cookieHeader}"`;
  }

  /**
   * Parses cookies from a cURL command string.
   * @param {string} curlCommand
   * @return {Array}
   */
  static parse(curlCommand) {
    if (!curlCommand || typeof curlCommand !== 'string') return [];
    const match =
      curlCommand.match(/-H\s+["']Cookie:\s*([^"']+)["']/i) ||
      curlCommand.match(/--header\s+["']Cookie:\s*([^"']+)["']/i) ||
      curlCommand.match(/(?:-b|--cookie)\s+["'](?:Cookie:\s*)?([^"']+)["']/i) ||
      curlCommand.match(/(?:-b|--cookie)\s+([^\s"']+)/i);
    const cookieStr = match ? match[1] || match[2] : null;
    if (cookieStr) {
      return HeaderstringFormat.parse(cookieStr);
    }
    return [];
  }
}
