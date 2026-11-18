import type { AuthContext } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      auth?: AuthContext;
    }
  }
}

export {};
