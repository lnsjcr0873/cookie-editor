/**
 * ImmortalityEngine provides bulk lifecycle enhancements for cookies,
 * such as extending expirations for testing or converting cookies to session cookies.
 */
export class ImmortalityEngine {
  /**
   * Extends the expiration date of all persistent cookies by a given number of years.
   * Also converts session cookies to persistent cookies with the given duration.
   * @param {Array} cookies
   * @param {number} years
   * @return {Array} Array of updated cookies
   */
  static extendExpiration(cookies, years = 1) {
    const futureTimestamp =
      Math.floor(Date.now() / 1000) + years * 365 * 24 * 60 * 60;
    return (cookies || []).map(c => {
      const copy = { ...c };
      copy.session = false;
      copy.expirationDate = futureTimestamp;
      return copy;
    });
  }

  /**
   * Converts all cookies to session-only cookies (expire when browser closes).
   * @param {Array} cookies
   * @return {Array} Array of updated cookies
   */
  static makeAllSession(cookies) {
    return (cookies || []).map(c => {
      const copy = { ...c };
      copy.session = true;
      delete copy.expirationDate;
      return copy;
    });
  }
}
