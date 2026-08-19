const CODEC_SYMBOL = Symbol.for("@danielsharp/redis/codec");
const ENTRIES_CODEC_SYMBOL = Symbol.for("@danielsharp/redis/entriesCodec");

export interface RedisCodec<T> {
  [CODEC_SYMBOL]: true;
  decode(value: string): T;
  encode(value: T): string;
}

export type CodecValue<T> = T extends { decode(value: any): infer V } ? V : never;

export type RedisCodecsFor<K extends string> = Partial<Record<K, RedisCodec<any>>>;

type ValuesForCodecs<C extends Record<string, RedisCodec<any>>> = {
  -readonly [K in keyof C]: CodecValue<C[K]>;
};

export interface RedisEntriesCodec<TShape extends Record<string, unknown>, T> {
  [ENTRIES_CODEC_SYMBOL]: true;
  decode(entries: readonly (readonly [string, string])[]): T;
  encode(value: EntriesInput<TShape>): readonly (readonly [string, string])[];
}

export type EntriesShape<T extends RedisEntriesCodec<any, any>> =
  T extends RedisEntriesCodec<infer TShape, any> ? TShape : never;

export type EntriesOf<T extends RedisEntriesCodec<any, any>> = ShapeToEntries<EntriesShape<T>>;

export type EntriesInput<TShape extends Record<string, unknown>> = ShapeToEntries<TShape> | TShape | ShapeToMap<TShape>;

export type EntriesCodecInput<T extends RedisEntriesCodec<any, any>> = Parameters<T["encode"]>[0];

type ShapeToEntries<TShape extends Record<string, unknown>> = readonly {
  [K in keyof TShape]: readonly [K, TShape[K]];
}[keyof TShape & string][];

type ShapeToMap<TShape extends Record<string, unknown>> = Map<keyof TShape, TShape[keyof TShape]>;

type ShapeFromEntries<T extends readonly (readonly [string, unknown])[]> = {
  [K in keyof T as T[K] extends [infer K] ? K & string : never]: T[K] extends [any, infer V] ? V : never;
};

type ShapeFromMap<T extends Map<string, unknown>> = {
  -readonly [K in T extends Map<infer K, unknown> ? K : never]: T extends Map<K, infer V> ? V : never;
};

type EntriesCodecFactory<TShape extends Record<string, unknown>> = {
  object(): RedisEntriesCodec<TShape, TShape>;
  entries(): RedisEntriesCodec<TShape, ShapeToEntries<TShape>>;
  map(): RedisEntriesCodec<TShape, ShapeToMap<TShape>>;
};

type FlexibleJsonCodec<T, TShape extends Record<string, unknown>> = RedisCodec<T> & {
  encode(value: T | EntriesInput<TShape>): string;
};

type JsonEntriesCodecFactory = {
  object<T extends Record<string, unknown>>(encodedAs: "entries" | "object"): FlexibleJsonCodec<T, T>;
  entries<T extends readonly (readonly [string, unknown])[]>(
    encodedAs: "entries" | "object",
  ): FlexibleJsonCodec<T, ShapeFromEntries<T>>;
  map<T extends Map<string, unknown>>(encodedAs: "entries" | "object"): FlexibleJsonCodec<T, ShapeFromMap<T>>;
};

function entries<TCodec extends RedisCodec<any>>(
  codec: TCodec,
): EntriesCodecFactory<Record<string, CodecValue<TCodec>>>;

function entries<const C extends Record<string, RedisCodec<any>>>(codecs: C): EntriesCodecFactory<ValuesForCodecs<C>>;

function entries(codecOrCodecs: RedisCodec<any> | Record<string, RedisCodec<any>>): EntriesCodecFactory<any> {
  return {
    object(): RedisEntriesCodec<any, any> {
      return {
        [ENTRIES_CODEC_SYMBOL]: true,
        decode(entries) {
          return convertFromEntries(
            "object",
            entries.map(([key, value]) => {
              const codec = CODEC_SYMBOL in codecOrCodecs ? codecOrCodecs : codecOrCodecs[key];
              if (!codec) {
                throw new TypeError(`No codec found for key "${key}"`);
              }

              return [key, value === null ? null : codec.decode(value)];
            }),
          );
        },
        encode(value) {
          return convertToEntries(value).map(([key, val]) => {
            const codec = CODEC_SYMBOL in codecOrCodecs ? codecOrCodecs : codecOrCodecs[key];
            if (!codec) {
              throw new TypeError(`No codec found for key "${key}"`);
            }

            return [key, codec.encode(val)];
          });
        },
      };
    },
    entries(): RedisEntriesCodec<any, any> {
      return {
        [ENTRIES_CODEC_SYMBOL]: true,
        decode(entries) {
          return entries.map(([key, value]) => {
            const codec = CODEC_SYMBOL in codecOrCodecs ? codecOrCodecs : codecOrCodecs[key];
            if (!codec) {
              throw new TypeError(`No codec found for key "${key}"`);
            }

            return [key, value === null ? null : codec.decode(value)];
          });
        },
        encode(value) {
          return convertToEntries(value).map(([key, val]) => {
            const codec = CODEC_SYMBOL in codecOrCodecs ? codecOrCodecs : codecOrCodecs[key];
            if (!codec) {
              throw new TypeError(`No codec found for key "${key}"`);
            }

            return [key, codec.encode(val)];
          });
        },
      };
    },
    map(): RedisEntriesCodec<any, any> {
      return {
        [ENTRIES_CODEC_SYMBOL]: true,
        decode(entries) {
          return convertFromEntries(
            "map",
            entries.map(([key, value]) => {
              const codec = CODEC_SYMBOL in codecOrCodecs ? codecOrCodecs : codecOrCodecs[key];
              if (!codec) {
                throw new TypeError(`No codec found for key "${key}"`);
              }

              return [key, value === null ? null : codec.decode(value)];
            }),
          );
        },
        encode(value) {
          return convertToEntries(value).map(([key, val]) => {
            const codec = CODEC_SYMBOL in codecOrCodecs ? codecOrCodecs : codecOrCodecs[key];
            if (!codec) {
              throw new TypeError(`No codec found for key "${key}"`);
            }

            return [key, codec.encode(val)];
          });
        },
      };
    },
  };
}

const json = Object.assign(
  <T>(): RedisCodec<T> => {
    return {
      [CODEC_SYMBOL]: true,
      decode(value: string): T {
        return JSON.parse(value) as T;
      },
      encode(value: T): string {
        return JSON.stringify(value);
      },
    };
  },
  {
    object<T extends Record<string, any>>(encodedAs: "entries" | "object"): FlexibleJsonCodec<T, T> {
      return {
        [CODEC_SYMBOL]: true,
        decode(value: string): T {
          return decodeAny("object", value) as T;
        },
        encode(value: T): string {
          return JSON.stringify(encodedAs === "entries" ? convertToEntries(value) : convertToObject(value));
        },
      };
    },
    entries<T extends readonly (readonly [string, any])[]>(
      encodedAs: "entries" | "object",
    ): FlexibleJsonCodec<T, ShapeFromEntries<T>> {
      return {
        [CODEC_SYMBOL]: true,
        decode(value: string): T {
          return decodeAny("entries", value) as T;
        },
        encode(value: T): string {
          return JSON.stringify(encodedAs === "entries" ? convertToEntries(value) : convertToObject(value));
        },
      };
    },
    map<T extends Map<string, any>>(encodedAs: "entries" | "object"): FlexibleJsonCodec<T, ShapeFromMap<T>> {
      return {
        [CODEC_SYMBOL]: true,
        decode(value: string): T {
          return new Map(decodeAny("entries", value) as readonly (readonly [string, unknown])[]) as T;
        },
        encode(value: T): string {
          return JSON.stringify(encodedAs === "entries" ? convertToEntries(value) : convertToObject(value));
        },
      };
    },
  },
) as JsonEntriesCodecFactory & {
  <T>(): RedisCodec<T>;
};

export const codecs = {
  entries,
  string: (): RedisCodec<string> => {
    return {
      [CODEC_SYMBOL]: true,
      decode(value: string): string {
        return value;
      },
      encode(value: string): string {
        return value;
      },
    };
  },
  number: (): RedisCodec<number> => {
    return {
      [CODEC_SYMBOL]: true,
      decode(value: string): number {
        const num = Number(value);
        if (Number.isNaN(num)) {
          throw new TypeError(`Value "${value}" is not a valid number`);
        }
        return num;
      },
      encode(value: number): string {
        return String(value);
      },
    };
  },
  json,
};

function isEntries(
  value: readonly (readonly [string, unknown])[] | Record<string, unknown> | Map<string, unknown>,
): value is readonly (readonly [string, unknown])[] {
  return Array.isArray(value);
}

function decodeAny(
  decodedAs: "entries" | "object" | "map",
  value: string,
): readonly (readonly [string, unknown])[] | Record<string, unknown> | Map<string, unknown> {
  if (decodedAs === "entries") {
    const parsed = JSON.parse(value) as [string, unknown][];
    if (isEntries(parsed)) {
      return parsed;
    } else if (parsed && typeof parsed === "object") {
      return Object.entries(parsed);
    } else {
      throw new TypeError("Only arrays of entries or objects can be decoded to an array of entries");
    }
  } else if (decodedAs === "object") {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (isEntries(parsed)) {
      return Object.fromEntries(parsed);
    } else if (parsed && typeof parsed === "object") {
      return parsed;
    } else {
      throw new TypeError("Only arrays of entries or objects can be decoded to an object");
    }
  } else {
    const parsed = JSON.parse(value) as [string, unknown][];
    if (isEntries(parsed)) {
      return new Map(parsed);
    } else if (parsed && typeof parsed === "object") {
      return new Map(Object.entries(parsed));
    } else {
      throw new TypeError("Only arrays of entries or objects can be decoded to a Map");
    }
  }
}

function convertFromEntries(
  to: "entries" | "object" | "map",
  value: readonly (readonly [string, unknown])[],
): readonly (readonly [string, unknown])[] | Record<string, unknown> | Map<string, unknown> {
  if (to === "entries") {
    return value;
  } else if (to === "object") {
    return Object.fromEntries(value);
  } else {
    return new Map(value);
  }
}

function convertToEntries(
  value: readonly (readonly [string, any])[] | Record<string, any> | Map<string, any>,
): readonly (readonly [string, any])[] {
  if (isEntries(value)) {
    return value;
  } else if (value instanceof Map) {
    return [...value.entries()];
  } else {
    return Object.entries(value);
  }
}

function convertToObject(
  value: readonly (readonly [string, any])[] | Record<string, any> | Map<string, any>,
): Record<string, any> {
  if (isEntries(value)) {
    return Object.fromEntries(value);
  } else if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  } else {
    return value;
  }
}
