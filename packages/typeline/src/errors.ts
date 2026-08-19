const TYPELINE_ERROR_SYMBOL = Symbol.for("@danielsharp/typeline/error");

export class TypelineError<TCode extends string = string> extends Error {
  readonly [TYPELINE_ERROR_SYMBOL] = true;

  protected constructor(
    message: string,
    readonly code: TCode,
  ) {
    super(message);
    this.name = "TypelineError";
  }

  static is(error: unknown): error is TypelineError {
    return (
      typeof error === "object" &&
      error !== null &&
      TYPELINE_ERROR_SYMBOL in error &&
      error[TYPELINE_ERROR_SYMBOL] === true &&
      "code" in error &&
      typeof error.code === "string"
    );
  }
}

export class DispatcherNoMatchError extends TypelineError<typeof DispatcherNoMatchError.code> {
  static readonly code = "DISPATCHER_NO_MATCH";

  constructor(readonly context: unknown) {
    super(`No match found`, DispatcherNoMatchError.code);
    this.name = "DispatcherNoMatchError";
  }

  static is(error: unknown): error is DispatcherNoMatchError {
    return TypelineError.is(error) && error.code === DispatcherNoMatchError.code;
  }
}

export class ConcurrencyTimeout extends TypelineError<typeof ConcurrencyTimeout.code> {
  static readonly code = "CONCURRENCY_TIMEOUT";

  constructor(readonly timeout: number) {
    super(`Timed out after ${timeout}ms while waiting for a concurrency slot.`, ConcurrencyTimeout.code);
    this.name = "ConcurrencyTimeout";
  }

  static is(error: unknown): error is ConcurrencyTimeout {
    return TypelineError.is(error) && error.code === ConcurrencyTimeout.code;
  }
}
