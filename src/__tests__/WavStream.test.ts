import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WavStream } from '../WavStream';

// Mock browser APIs
const mockAddModule = vi.fn().mockResolvedValue(undefined);
const mockResume = vi.fn().mockResolvedValue(undefined);
const mockSuspend = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockCreateMediaStreamSource = vi.fn();
const mockWorkletPort = {
  postMessage: vi.fn(),
  onmessage: null as ((e: MessageEvent) => void) | null,
};
const mockWorkletNode = {
  port: mockWorkletPort,
  connect: vi.fn().mockReturnValue({ connect: vi.fn() }),
  disconnect: vi.fn(),
};
const mockSourceNode = {
  connect: vi.fn().mockReturnValue(mockWorkletNode),
  disconnect: vi.fn(),
};
const mockMediaStream = {
  getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
};

function setupMocks() {
  mockAddModule.mockClear();
  mockResume.mockClear();
  mockSuspend.mockClear();
  mockClose.mockClear();
  mockCreateMediaStreamSource.mockClear().mockReturnValue(mockSourceNode);
  mockWorkletPort.postMessage.mockClear();
  mockWorkletPort.onmessage = null;
  mockWorkletNode.connect.mockClear().mockReturnValue({ connect: vi.fn() });
  mockWorkletNode.disconnect.mockClear();
  mockSourceNode.connect.mockClear().mockReturnValue(mockWorkletNode);
  mockSourceNode.disconnect.mockClear();
  mockMediaStream.getTracks.mockClear().mockReturnValue([{ stop: vi.fn() }]);

  Object.defineProperty(globalThis, 'AudioContext', {
    value: vi.fn().mockImplementation(() => ({
      audioWorklet: { addModule: mockAddModule },
      createMediaStreamSource: mockCreateMediaStreamSource,
      destination: {},
      sampleRate: 16000,
      state: 'running',
      resume: mockResume,
      suspend: mockSuspend,
      close: mockClose,
    })),
    writable: true,
  });

  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    value: vi.fn().mockReturnValue(mockWorkletNode),
    writable: true,
  });

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
    },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  setupMocks();
});

describe('WavStream', () => {
  describe('constructor', () => {
    it('uses default options', () => {
      const ws = new WavStream();
      expect(ws.chunkSize).toBe(500);
      expect(ws.sampleRate).toBe(16000);
      expect(ws.workletUrl).toBe('recorder.worklet.js');
      expect(ws.state).toBe('inactive');
    });

    it('accepts custom options', () => {
      const ws = new WavStream({
        chunkSize: 1000,
        sampleRate: 44100,
        workletUrl: '/audio/worklet.js',
      });
      expect(ws.chunkSize).toBe(1000);
      expect(ws.sampleRate).toBe(44100);
      expect(ws.workletUrl).toBe('/audio/worklet.js');
    });

    it('creates AudioContext eagerly for low latency', () => {
      new WavStream();
      expect(globalThis.AudioContext).toHaveBeenCalledWith({ sampleRate: 16000 });
    });

    it('pre-loads worklet module', () => {
      new WavStream();
      expect(mockAddModule).toHaveBeenCalledWith('recorder.worklet.js');
    });
  });

  describe('isSupported()', () => {
    it('returns true when browser APIs are available', () => {
      expect(WavStream.isSupported()).toBe(true);
    });
  });

  describe('start()', () => {
    it('requests microphone access', async () => {
      const ws = new WavStream();
      await ws.start();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
    });

    it('creates AudioWorkletNode with correct options', async () => {
      const ws = new WavStream({ chunkSize: 500, sampleRate: 16000 });
      await ws.start();

      expect(globalThis.AudioWorkletNode).toHaveBeenCalledWith(
        expect.anything(),
        'recorder.worklet',
        {
          processorOptions: {
            bufferApproxSize: (16000 / 1000) * 500,
            sampleRate: 16000,
            format: 'wav',
          },
        },
      );
    });

    it('connects source -> recorder -> destination', async () => {
      const ws = new WavStream();
      await ws.start();

      expect(mockSourceNode.connect).toHaveBeenCalledWith(mockWorkletNode);
    });

    it('sets state to recording', async () => {
      const ws = new WavStream();
      await ws.start();
      expect(ws.state).toBe('recording');
    });

    it('emits statechange event', async () => {
      const ws = new WavStream();
      const listener = vi.fn();
      ws.on('statechange', listener);

      await ws.start();
      expect(listener).toHaveBeenCalledWith('recording');
    });

    it('cleans up previous session on double start (idempotency)', async () => {
      const ws = new WavStream();
      await ws.start();
      await ws.start();

      // Should not throw, should clean up first session
      expect(ws.state).toBe('recording');
    });

    it('emits error event on getUserMedia failure', async () => {
      const permError = new Error('Permission denied');
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        permError,
      );

      const ws = new WavStream();
      const errorListener = vi.fn();
      ws.on('error', errorListener);

      await expect(ws.start()).rejects.toThrow('Permission denied');
      expect(errorListener).toHaveBeenCalledWith(permError);
    });
  });

  describe('stop()', () => {
    it('does not throw when called before start()', () => {
      const ws = new WavStream();
      expect(() => ws.stop()).not.toThrow();
    });

    it('sends stop message to worklet', async () => {
      const ws = new WavStream();
      await ws.start();
      ws.stop();

      expect(mockWorkletPort.postMessage).toHaveBeenCalledWith('stop');
    });

    it('stops media tracks', async () => {
      const mockTrack = { stop: vi.fn() };
      mockMediaStream.getTracks.mockReturnValue([mockTrack]);

      const ws = new WavStream();
      await ws.start();
      ws.stop();

      expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('disconnects audio nodes', async () => {
      const ws = new WavStream();
      await ws.start();
      ws.stop();

      expect(mockWorkletNode.disconnect).toHaveBeenCalled();
      expect(mockSourceNode.disconnect).toHaveBeenCalled();
    });

    it('suspends AudioContext', async () => {
      const ws = new WavStream();
      await ws.start();
      ws.stop();

      expect(mockSuspend).toHaveBeenCalled();
    });

    it('clears port.onmessage', async () => {
      const ws = new WavStream();
      await ws.start();
      ws.stop();

      expect(mockWorkletPort.onmessage).toBeNull();
    });

    it('sets state to inactive and emits statechange', async () => {
      const ws = new WavStream();
      const listener = vi.fn();
      ws.on('statechange', listener);

      await ws.start();
      ws.stop();

      expect(ws.state).toBe('inactive');
      expect(listener).toHaveBeenCalledWith('inactive');
    });

    it('is safe to call multiple times', async () => {
      const ws = new WavStream();
      await ws.start();
      ws.stop();
      expect(() => ws.stop()).not.toThrow();
    });
  });

  describe('pause()', () => {
    it('sends pause message to worklet', async () => {
      const ws = new WavStream();
      await ws.start();
      ws.pause();

      expect(mockWorkletPort.postMessage).toHaveBeenCalledWith('pause');
      expect(ws.state).toBe('paused');
    });

    it('is a no-op when not recording', () => {
      const ws = new WavStream();
      ws.pause();
      expect(ws.state).toBe('inactive');
    });

    it('emits statechange event', async () => {
      const ws = new WavStream();
      const listener = vi.fn();
      ws.on('statechange', listener);

      await ws.start();
      ws.pause();

      expect(listener).toHaveBeenCalledWith('paused');
    });
  });

  describe('resume()', () => {
    it('sends resume message to worklet', async () => {
      const ws = new WavStream();
      await ws.start();
      ws.pause();
      ws.resume();

      expect(mockWorkletPort.postMessage).toHaveBeenCalledWith('resume');
      expect(ws.state).toBe('recording');
    });

    it('is a no-op when not paused', async () => {
      const ws = new WavStream();
      await ws.start();
      ws.resume();
      expect(ws.state).toBe('recording');
    });

    it('emits statechange event', async () => {
      const ws = new WavStream();
      const listener = vi.fn();

      await ws.start();
      ws.pause();
      ws.on('statechange', listener);
      ws.resume();

      expect(listener).toHaveBeenCalledWith('recording');
    });
  });

  describe('destroy()', () => {
    it('closes AudioContext permanently', async () => {
      const ws = new WavStream();
      await ws.start();
      await ws.destroy();

      expect(mockClose).toHaveBeenCalled();
    });

    it('removes all listeners', async () => {
      const ws = new WavStream();
      const listener = vi.fn();
      ws.on('data', listener);

      await ws.destroy();

      ws.emit('data', [new Uint8Array(), false]);
      expect(listener).not.toHaveBeenCalled();
    });

    it('is safe to call without start', async () => {
      const ws = new WavStream();
      await expect(ws.destroy()).resolves.not.toThrow();
    });
  });

  describe('data event', () => {
    it('emits data when worklet sends a message', async () => {
      const ws = new WavStream();
      const listener = vi.fn();
      ws.on('data', listener);

      await ws.start();

      const mockWavData: [Uint8Array, boolean] = [new Uint8Array([1, 2, 3]), false];
      mockWorkletPort.onmessage!({ data: mockWavData } as MessageEvent);

      expect(listener).toHaveBeenCalledWith(mockWavData);
    });
  });
});
