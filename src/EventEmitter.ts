export type EventMap = Record<string, unknown>;


export class EventEmitter<T extends EventMap = EventMap> {
  private listeners = new Map<keyof T, Array<(data: never) => void>>();

  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener as (data: never) => void);
    this.listeners.set(event, existing);
    return this;
  }

  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    const wrapper = (data: T[K]) => {
      this.off(event, wrapper);
      listener(data);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    const existing = this.listeners.get(event);
    if (existing) {
      this.listeners.set(
        event,
        existing.filter((l) => l !== (listener as (data: never) => void)),
      );
    }
    return this;
  }

  emit<K extends keyof T>(event: K, data: T[K]): void {
    const existing = this.listeners.get(event);
    if (existing) {
      for (const listener of [...existing]) {
        (listener as (data: T[K]) => void)(data);
      }
    }
  }

  removeAllListeners(event?: keyof T): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}
