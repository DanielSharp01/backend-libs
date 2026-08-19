export function groupToMap<T, K, V = T>(arr: T[], mapKey: (item: T) => K, mapValue?: (item: T) => V): Map<K, V> {
  return new Map(arr.map((item) => [mapKey(item), mapValue ? mapValue(item) : item] as [K, V]));
}

export function groupManyToMap<T, K, V = T[]>(arr: T[], keyFunc: (item: T) => K, mapper?: (item: T[]) => V): Map<K, V> {
  return new Map(
    [...Map.groupBy(arr, keyFunc)].map(([key, items]) => [key, mapper ? mapper(items) : items]) as [K, V][],
  );
}
