// Tiny event bus used to decouple systems from the UI.
const target = new EventTarget();

export const emit = (name, detail) =>
  target.dispatchEvent(new CustomEvent(name, { detail }));

/** Subscribe to an event. Returns an unsubscribe function. */
export const on = (name, fn) => {
  const handler = (e) => fn(e.detail);
  target.addEventListener(name, handler);
  return () => target.removeEventListener(name, handler);
};
