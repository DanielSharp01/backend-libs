export type Ok<TOk> = { ok: TOk };

export type Err<TErr> = { err: TErr };

export type Result<TOk, TErr> = Ok<TOk> | Err<TErr>;

export function ok<TOk>(value: TOk): Ok<TOk> {
  return { ok: value };
}

export function err<TErr>(error: TErr): Err<TErr> {
  return { err: error };
}

export function isOk<TOk, TErr>(result: Result<TOk, TErr>): result is Ok<TOk> {
  return "ok" in result;
}

export function isErr<TOk, TErr>(result: Result<TOk, TErr>): result is Err<TErr> {
  return "err" in result;
}
