const ZOD_ERROR_SYMBOL = Symbol.for("@danielsharp/zod/error");

export class ZodError<TCode extends string = string> extends Error {
  readonly [ZOD_ERROR_SYMBOL] = true;

  protected constructor(
    message: string,
    readonly code: TCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ZodError";
  }

  static is(error: unknown): error is ZodError {
    return (
      typeof error === "object" &&
      error !== null &&
      ZOD_ERROR_SYMBOL in error &&
      error[ZOD_ERROR_SYMBOL] === true &&
      "code" in error &&
      typeof error.code === "string"
    );
  }
}

export type ZodSchemaConversionErrorReason = "unrepresentable";

export class ZodSchemaConversionError extends ZodError<typeof ZodSchemaConversionError.code> {
  static readonly code = "ZOD_SCHEMA_CONVERSION_FAILED";

  constructor(
    readonly reason: ZodSchemaConversionErrorReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, ZodSchemaConversionError.code, options);
    this.name = "ZodSchemaConversionError";
  }

  static is(error: unknown): error is ZodSchemaConversionError {
    return ZodError.is(error) && error.code === ZodSchemaConversionError.code;
  }
}
