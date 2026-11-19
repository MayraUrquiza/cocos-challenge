export type ApplicationErrorCode =
  | 'USER_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'INSTRUMENT_NOT_FOUND'
  | 'INSTRUMENT_NOT_TRADABLE';

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

export class InstrumentNotFoundError extends ApplicationError {
  readonly code = 'INSTRUMENT_NOT_FOUND';

  constructor(readonly instrumentId: number) {
    super(`El instrumento ${instrumentId} no existe`);
    this.name = 'InstrumentNotFoundError';
  }
}

/** Los pesos no se compran ni se venden: es un request inválido, no un rechazo (ADR-0004, punto 4). */
export class InstrumentNotTradableError extends ApplicationError {
  readonly code = 'INSTRUMENT_NOT_TRADABLE';

  constructor(readonly ticker: string) {
    super(`${ticker} no se puede operar con órdenes`);
    this.name = 'InstrumentNotTradableError';
  }
}
