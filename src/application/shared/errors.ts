export type ApplicationErrorCode = 'USER_NOT_FOUND' | 'ORDER_NOT_FOUND';

export abstract class ApplicationError extends Error {
  abstract readonly code: ApplicationErrorCode;
}

export class UserNotFoundError extends ApplicationError {
  readonly code = 'USER_NOT_FOUND';

  constructor(readonly userId: number) {
    super(`El usuario ${userId} no existe`);
    this.name = 'UserNotFoundError';
  }
}

export class OrderNotFoundError extends ApplicationError {
  readonly code = 'ORDER_NOT_FOUND';

  constructor(readonly orderId: number) {
    super(`La orden ${orderId} no existe`);
    this.name = 'OrderNotFoundError';
  }
}
