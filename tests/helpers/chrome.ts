type Listener<TArgs extends unknown[]> = (...args: TArgs) => unknown;

export interface ChromeEventMock<TArgs extends unknown[]> {
  addListener: (listener: Listener<TArgs>) => void;
  listeners: Listener<TArgs>[];
}

export function createChromeEventMock<TArgs extends unknown[]>(): ChromeEventMock<TArgs> {
  const listeners: Listener<TArgs>[] = [];

  return {
    addListener(listener) {
      listeners.push(listener);
    },
    listeners
  };
}
