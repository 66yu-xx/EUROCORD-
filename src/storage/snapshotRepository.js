const clone = (value) => JSON.parse(JSON.stringify(value));

export function createSnapshotRepository({ adapter, fallbackData }) {
  if (!adapter || typeof adapter.load !== 'function' || typeof adapter.save !== 'function') {
    throw new TypeError('A storage adapter with load/save methods is required.');
  }

  let snapshot = adapter.load(fallbackData);

  return Object.freeze({
    getSnapshot: () => clone(snapshot),
    list: (collectionName) => clone(Array.isArray(snapshot?.[collectionName]) ? snapshot[collectionName] : []),
    findById: (collectionName, id) => {
      const item = Array.isArray(snapshot?.[collectionName])
        ? snapshot[collectionName].find((entry) => entry.id === id)
        : undefined;
      return item ? clone(item) : null;
    },
    replaceSnapshot: (nextSnapshot) => {
      snapshot = clone(nextSnapshot);
      return adapter.save(snapshot);
    },
    reload: () => {
      snapshot = adapter.load(fallbackData);
      return clone(snapshot);
    },
  });
}
