export type Prettify<T> = { [TKey in keyof T]: T[TKey] } & {};

export type Awaitable<T> = T | PromiseLike<T>;
