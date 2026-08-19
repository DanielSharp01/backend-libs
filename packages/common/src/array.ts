export function addUnique<T>(target: T[], ...values: readonly T[]): void {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
