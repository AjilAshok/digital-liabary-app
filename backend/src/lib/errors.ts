/** Application error with a stable machine-readable code and a safe client message. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest: (message = 'Bad request', details?: unknown) =>
    new AppError(400, 'BAD_REQUEST', message, details),
  validation: (details: unknown) =>
    new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', details),
  unauthenticated: (message = 'Authentication required') =>
    new AppError(401, 'UNAUTHENTICATED', message),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
  accountLocked: () =>
    new AppError(
      423,
      'ACCOUNT_LOCKED',
      'Account temporarily locked after repeated failed sign-in attempts. Try again later.',
    ),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message: string, details?: unknown) => new AppError(409, 'CONFLICT', message, details),
};
