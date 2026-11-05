import "@testing-library/jest-dom/vitest";

// Node 22+ installs a global `localStorage`/`sessionStorage` accessor that returns
// undefined unless the process was started with --localstorage-file. It shadows the
// storage jsdom would provide, so tests that exercise browser storage would fail on
// `localStorage.setItem`. Install a real in-memory Storage when the platform's is absent.
function installMemoryStorage(name: "localStorage" | "sessionStorage") {
  if (typeof globalThis[name] !== "undefined") return;
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: storage });
}

installMemoryStorage("localStorage");
installMemoryStorage("sessionStorage");

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
