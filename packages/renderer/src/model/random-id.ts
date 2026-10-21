const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Long enough that two peers practically never draw the same id, short enough to read in text. */
export const RANDOM_ID_LENGTH = 8;

// 252 = 7 × 36: a byte from 252 up would make the first four characters more likely, so it is
// drawn again.
const UNBIASED_BYTE_LIMIT = ID_ALPHABET.length * Math.floor(256 / ID_ALPHABET.length);

/** Lowercase letters and digits: inside the DSL id charset, and no letter case to mistype. */
export function randomIdSuffix(): string {
  let suffix = '';
  while (suffix.length < RANDOM_ID_LENGTH) {
    for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(RANDOM_ID_LENGTH))) {
      if (byte >= UNBIASED_BYTE_LIMIT || suffix.length === RANDOM_ID_LENGTH) continue;
      suffix += ID_ALPHABET[byte % ID_ALPHABET.length];
    }
  }
  return suffix;
}
