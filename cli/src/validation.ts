import { StrKey } from '@stellar/stellar-sdk';

export function validateSecretKey(
  key: string | undefined,
  context: string,
): string {
  if (!key) {
    throw new Error(`${context}: secret key is required`);
  }

  if (!StrKey.isValidEd25519SecretSeed(key)) {
    throw new Error(
      `${context}: invalid Stellar secret key (must start with S and be 56 characters)`,
    );
  }

  return key;
}
