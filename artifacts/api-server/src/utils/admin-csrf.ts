import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const CSRF_SECRET = process.env.ADMIN_CSRF_SECRET || 'dev_csrf_secret_change_in_production';
const JWT_ISSUER = process.env.JWT_ISSUER || 'ajkmart-admin';

export interface CsrfTokenPayload {
  sessionId: string;
  random: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate a random CSRF token
 * This is used as the X-CSRF-Token header value
 */
export function generateCsrfRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a CSRF cookie token (signed JWT bound to session)
 * Stored in a non-HttpOnly cookie so the frontend can read it
 */
export function createCsrfCookie(sessionId: string): string {
  const payload: CsrfTokenPayload = {
    sessionId,
    random: crypto.randomBytes(8).toString('hex'),
  };
  return jwt.sign(payload, CSRF_SECRET, {
    expiresIn: '7d',
    issuer: JWT_ISSUER,
    algorithm: 'HS256',
  });
}

/**
 * Verify a CSRF cookie token
 */
export function verifyCsrfToken(token: string): CsrfTokenPayload {
  try {
    const payload = jwt.verify(token, CSRF_SECRET, {
      issuer: JWT_ISSUER,
      algorithms: ['HS256'],
    });
    return payload as CsrfTokenPayload;
  } catch (error) {
    throw new Error(`Invalid CSRF token: ${(error as Error).message}`);
  }
}
