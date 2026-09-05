/**
 * EncryptedFormat provides password-based AES-GCM encryption/decryption
 * for safely sharing sessions across team members without sending plaintext cookies.
 */
export class EncryptedFormat {
  /**
   * Derives an AES-GCM key from a password and salt using PBKDF2.
   * @param {string} password
   * @param {Uint8Array} salt
   * @return {Promise<CryptoKey>}
   */
  static async deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts plain data (e.g. cookies or session object) with a password.
   * @param {any} data
   * @param {string} password
   * @return {Promise<string>} An armored string format: ENCSESSION:v1:<base64>
   */
  static async encrypt(data, password) {
    if (!password) throw new Error('Password is required for encryption');
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);

    const plaintext = enc.encode(
      typeof data === 'string' ? data : JSON.stringify(data)
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      plaintext
    );

    // Combine: salt (16 bytes) + iv (12 bytes) + ciphertext
    const combined = new Uint8Array(
      salt.length + iv.length + ciphertext.byteLength
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    const b64 = btoa(binary);
    return `ENCSESSION:v1:${b64}`;
  }

  /**
   * Decrypts an armored encrypted session string.
   * @param {string} encryptedStr
   * @param {string} password
   * @return {Promise<any>}
   */
  static async decrypt(encryptedStr, password) {
    if (!encryptedStr || !encryptedStr.startsWith('ENCSESSION:v1:')) {
      throw new Error('Invalid encrypted session format');
    }
    const b64 = encryptedStr.replace('ENCSESSION:v1:', '').trim();
    const binary = atob(b64);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    if (combined.length < 28) {
      throw new Error('Encrypted payload is too short');
    }

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await this.deriveKey(password, salt);
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );
      const dec = new TextDecoder();
      const text = dec.decode(decrypted);
      try {
        return JSON.parse(text);
      } catch (e) {
        return text;
      }
    } catch (err) {
      throw new Error('Decryption failed. Please check your password.');
    }
  }
}
