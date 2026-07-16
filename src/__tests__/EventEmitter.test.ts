import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../EventEmitter';

type TestEvents = {
  message: string;
  count: number;
  tuple: [string, number];
};

describe('EventEmitter', () => {
  it('calls listener on emit', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('message', listener);
    emitter.emit('message', 'hello');

    expect(listener).toHaveBeenCalledWith('hello');
  });

  it('passes correct data to listener', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('tuple', listener);
    emitter.emit('tuple', ['foo', 42]);

    expect(listener).toHaveBeenCalledWith(['foo', 42]);
  });

  it('supports multiple listeners on the same event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('count', listener1);
    emitter.on('count', listener2);
    emitter.emit('count', 5);

    expect(listener1).toHaveBeenCalledWith(5);
    expect(listener2).toHaveBeenCalledWith(5);
  });

  it('fires listeners in registration order', () => {
    const emitter = new EventEmitter<TestEvents>();
    const order: number[] = [];

    emitter.on('count', () => order.push(1));
    emitter.on('count', () => order.push(2));
    emitter.on('count', () => order.push(3));
    emitter.emit('count', 0);

    expect(order).toEqual([1, 2, 3]);
  });

  it('off() removes a specific listener', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('message', listener1);
    emitter.on('message', listener2);
    emitter.off('message', listener1);
    emitter.emit('message', 'test');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledWith('test');
  });

  it('emit on event with no listeners does not throw', () => {
    const emitter = new EventEmitter<TestEvents>();
    expect(() => emitter.emit('message', 'hello')).not.toThrow();
  });

  it('off on nonexistent event does not throw', () => {
    const emitter = new EventEmitter<TestEvents>();
    expect(() => emitter.off('message', vi.fn())).not.toThrow();
  });

  it('once() fires only once then auto-removes', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.once('count', listener);
    emitter.emit('count', 1);
    emitter.emit('count', 2);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
  });

  it('removeAllListeners() for a specific event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const msgListener = vi.fn();
    const countListener = vi.fn();

    emitter.on('message', msgListener);
    emitter.on('count', countListener);
    emitter.removeAllListeners('message');

    emitter.emit('message', 'gone');
    emitter.emit('count', 42);

    expect(msgListener).not.toHaveBeenCalled();
    expect(countListener).toHaveBeenCalledWith(42);
  });

  it('removeAllListeners() with no args clears everything', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('message', listener1);
    emitter.on('count', listener2);
    emitter.removeAllListeners();

    emitter.emit('message', 'gone');
    emitter.emit('count', 0);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('on() returns this for chaining', () => {
    const emitter = new EventEmitter<TestEvents>();
    const result = emitter.on('message', vi.fn());
    expect(result).toBe(emitter);
  });
});
