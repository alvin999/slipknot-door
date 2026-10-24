/**
 * Key Vault Service: Multi-tier API Key Security Engine
 * Supports:
 * 1. Plain (No Encryption): Direct plaintext storage
 * 2. Transparent (Device-bound AES-GCM): Automatically encrypted without user password prompt
 * 3. Password (PBKDF2 + AES-GCM): Master password protection, decrypted on-demand
 */

export type KeyEncryptionMode = 'plain' | 'transparent' | 'password';

export interface StoredKeyRecord {
  modelProvider: 'gemini' | 'groq';
  mode: KeyEncryptionMode;
  ciphertextBase64: string;
  ivBase64?: string;
  saltBase64?: string;
  updatedAt: string;
}

export class KeyVaultService {
  private static STORAGE_PREFIX = 'slipknot_vault_';
  // Hardware-anchored salt seed for transparent encryption
  private static TRANSPARENT_SEED = 'slipknot-curatorial-alexandria-device-anchor-v1';

  /**
   * Save API Key with selected encryption mode
   */
  public static async saveKey(
    modelProvider: 'gemini' | 'groq',
    apiKey: string,
    mode: KeyEncryptionMode,
    masterPassword?: string
  ): Promise<void> {
    if (!apiKey || apiKey.trim() === '') {
      this.deleteKey(modelProvider);
      return;
    }

    let record: StoredKeyRecord;

    if (mode === 'plain') {
      record = {
        modelProvider,
        mode: 'plain',
        ciphertextBase64: btoa(apiKey),
        updatedAt: new Date().toISOString()
      };
    } else if (mode === 'transparent') {
      const { ciphertext, iv, salt } = await this.encryptWithPassphrase(
        apiKey,
        this.getMachineFingerprint()
      );
      record = {
        modelProvider,
        mode: 'transparent',
        ciphertextBase64: ciphertext,
        ivBase64: iv,
        saltBase64: salt,
        updatedAt: new Date().toISOString()
      };
    } else {
      // mode === 'password'
      if (!masterPassword || masterPassword.length < 4) {
        throw new Error('密碼加密模式必須提供至少 4 位元的主密碼');
      }
      const { ciphertext, iv, salt } = await this.encryptWithPassphrase(
        apiKey,
        masterPassword
      );
      record = {
        modelProvider,
        mode: 'password',
        ciphertextBase64: ciphertext,
        ivBase64: iv,
        saltBase64: salt,
        updatedAt: new Date().toISOString()
      };
    }

    localStorage.setItem(
      `${this.STORAGE_PREFIX}${modelProvider}`,
      JSON.stringify(record)
    );
  }

  /**
   * Load and Decrypt API Key
   */
  public static async loadKey(
    modelProvider: 'gemini' | 'groq',
    masterPassword?: string
  ): Promise<{ apiKey: string | null; mode: KeyEncryptionMode | null; requiresPassword: boolean }> {
    const raw = localStorage.getItem(`${this.STORAGE_PREFIX}${modelProvider}`);
    if (!raw) {
      return { apiKey: null, mode: null, requiresPassword: false };
    }

    try {
      const record: StoredKeyRecord = JSON.parse(raw);

      if (record.mode === 'plain') {
        return {
          apiKey: atob(record.ciphertextBase64),
          mode: 'plain',
          requiresPassword: false
        };
      }

      if (record.mode === 'transparent') {
        const decrypted = await this.decryptWithPassphrase(
          record.ciphertextBase64,
          record.ivBase64!,
          record.saltBase64!,
          this.getMachineFingerprint()
        );
        return {
          apiKey: decrypted,
          mode: 'transparent',
          requiresPassword: false
        };
      }

      // Password mode
      if (!masterPassword) {
        return {
          apiKey: null,
          mode: 'password',
          requiresPassword: true
        };
      }

      const decrypted = await this.decryptWithPassphrase(
        record.ciphertextBase64,
        record.ivBase64!,
        record.saltBase64!,
        masterPassword
      );

      return {
        apiKey: decrypted,
        mode: 'password',
        requiresPassword: false
      };
    } catch (err) {
      console.error('Failed to load key from vault:', err);
      throw new Error('解密失敗，請檢查主密碼是否正確');
    }
  }

  /**
   * Check vault record status without decrypting
   */
  public static getKeyStatus(modelProvider: 'gemini' | 'groq'): { exists: boolean; mode: KeyEncryptionMode | null; updatedAt: string | null } {
    const raw = localStorage.getItem(`${this.STORAGE_PREFIX}${modelProvider}`);
    if (!raw) return { exists: false, mode: null, updatedAt: null };
    try {
      const record: StoredKeyRecord = JSON.parse(raw);
      return { exists: true, mode: record.mode, updatedAt: record.updatedAt };
    } catch {
      return { exists: false, mode: null, updatedAt: null };
    }
  }

  /**
   * Delete stored key
   */
  public static deleteKey(modelProvider: 'gemini' | 'groq'): void {
    localStorage.removeItem(`${this.STORAGE_PREFIX}${modelProvider}`);
  }

  /* --- Web Crypto API Core Cryptography --- */

  private static getMachineFingerprint(): string {
    if (typeof navigator !== 'undefined') {
      const parts = [
        navigator.userAgent,
        navigator.language,
        screen.colorDepth,
        this.TRANSPARENT_SEED
      ];
      return parts.join('::');
    }
    return this.TRANSPARENT_SEED;
  }

  private static async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private static async encryptWithPassphrase(
    plaintext: string,
    passphrase: string
  ): Promise<{ ciphertext: string; iv: string; salt: string }> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(passphrase, salt);

    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext)
    );

    return {
      ciphertext: this.bufferToBase64(new Uint8Array(encrypted)),
      iv: this.bufferToBase64(iv),
      salt: this.bufferToBase64(salt)
    };
  }

  private static async decryptWithPassphrase(
    ciphertextBase64: string,
    ivBase64: string,
    saltBase64: string,
    passphrase: string
  ): Promise<string> {
    const ciphertext = this.base64ToBuffer(ciphertextBase64);
    const iv = this.base64ToBuffer(ivBase64);
    const salt = this.base64ToBuffer(saltBase64);

    const key = await this.deriveKey(passphrase, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  }

  private static bufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  private static base64ToBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
