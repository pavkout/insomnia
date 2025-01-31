import crypto from 'crypto';

/**
 * This function will return a random email.
 * @returns Random email
 */
export function getUserEmail() {
  return `insomnia.test.user+${crypto.randomUUID()}@gmail.com`;
}
