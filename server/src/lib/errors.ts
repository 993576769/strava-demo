export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const unauthorized = (message = 'Unauthorized') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message)
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details)
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message)
export const internalError = (message = 'Internal server error', details?: unknown) => new AppError(500, 'INTERNAL_SERVER_ERROR', message, details)
