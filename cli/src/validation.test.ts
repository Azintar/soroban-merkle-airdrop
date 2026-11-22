import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { validateSecretKey } from './validation.js';

describe('validateSecretKey', () => {
  it('returns the secret key when it is valid', () => {
    const secretKey = Keypair.random().secret();

    expect(validateSecretKey(secretKey, 'deploy')).toBe(secretKey);
  });

  it('throws when the secret key is undefined', () => {
    expect(() => validateSecretKey(undefined, 'deploy')).toThrow(
      'deploy: secret key is required',
    );
  });

  it('throws when the secret key is empty', () => {
    expect(() => validateSecretKey('', 'claim')).toThrow(
      'claim: secret key is required',
    );
  });

  it('throws when the secret key has an invalid format', () => {
    expect(() => validateSecretKey('INVALID_KEY', 'reclaim')).toThrow(
      'reclaim: invalid Stellar secret key (must start with S and be 56 characters)',
    );
  });

  it('includes the provided context in the error message', () => {
    expect(() => validateSecretKey('INVALID_KEY', 'pause')).toThrow(/^pause:/);
  });
});
