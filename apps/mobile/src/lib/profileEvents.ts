type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyProfileUpdated() {
  listeners.forEach(l => l());
}

export function onProfileUpdated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
