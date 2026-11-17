// In-memory AsyncStorage: tests inspect `asyncStore` to see what would be persisted.
export const asyncStore = (globalThis.__asyncStore ??= new Map());
const AsyncStorage = {
  async getItem(key) {
    return asyncStore.has(key) ? asyncStore.get(key) : null;
  },
  async setItem(key, value) {
    asyncStore.set(key, value);
  },
  async removeItem(key) {
    asyncStore.delete(key);
  },
};
export default AsyncStorage;
