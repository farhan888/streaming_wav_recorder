import { describe, it, expect, vi } from 'vitest';

// Mock AudioWorklet globals before importing the worklet
const registerProcessorMock = vi.fn();

Object.defineProperty(globalThis, 'AudioWorkletProcessor', {
  value: class {
    port = { postMessage: vi.fn(), onmessage: null as ((e: MessageEvent) => void) | null };
  },
  writable: true,
});

Object.defineProperty(globalThis, 'registerProcessor', {
  value: registerProcessorMock,
  writable: true,
});

Object.defineProperty(globalThis, 'sampleRate', {
  value: 16000,
  writable: true,
});

// Import the worklet -- it calls registerProcessor at module scope
await import('../recorder.worklet.js');

// Extract the registered processor class
const ProcessorClass = registerProcessorMock.mock.calls[0][1];

function createProcessor(bufferApproxSize = 512, sampleRate = 16000, format = 'wav') {
  return new ProcessorClass({
    processorOptions: { bufferApproxSize, sampleRate, format },
  });
}

describe('RecorderProcessor', () => {
  it('registers as "recorder.worklet"', () => {
    expect(registerProcessorMock).toHaveBeenCalledWith('recorder.worklet', expect.any(Function));
  });

  describe('buffer sizing', () => {
    it('rounds buffer size to nearest multiple of 128', () => {
      const proc = createProcessor(500);
      // 500 / 128 = 3.9, rounds to 4 => 512
      expect(proc.bufferSize).toBe(512);
    });

    it('handles exact multiple of 128', () => {
      const proc = createProcessor(256);
      expect(proc.bufferSize).toBe(256);
    });

    it('handles value close to a boundary', () => {
      const proc = createProcessor(129);
      // 129 / 128 = 1.008, rounds to 1 => 128
      expect(proc.bufferSize).toBe(128);
    });
  });

  describe('buffer state', () => {
    it('starts empty', () => {
      const proc = createProcessor(128);
      expect(proc.isBufferEmpty()).toBe(true);
      expect(proc.isBufferFull()).toBe(false);
    });

    it('is not empty after appending data', () => {
      const proc = createProcessor(256);
      const data = new Float32Array(128).fill(0.5);
      proc.append(data);
      expect(proc.isBufferEmpty()).toBe(false);
    });
  });

  describe('append()', () => {
    it('is a no-op for null/undefined input', () => {
      const proc = createProcessor(256);
      proc.append(null);
      proc.append(undefined);
      expect(proc.isBufferEmpty()).toBe(true);
    });

    it('flushes when buffer is full on next append', () => {
      const proc = createProcessor(128);
      const postMessage = proc.port.postMessage;

      // Fill the buffer exactly
      proc.append(new Float32Array(128).fill(0.5));
      expect(postMessage).not.toHaveBeenCalled();

      // Next append triggers flush of the full buffer
      proc.append(new Float32Array(128).fill(0.3));
      expect(postMessage).toHaveBeenCalledTimes(1);

      const [wavBytes, isFinal] = postMessage.mock.calls[0][0];
      expect(wavBytes).toBeInstanceOf(Uint8Array);
      expect(isFinal).toBe(false);
    });
  });

  describe('flush()', () => {
    it('sends WAV bytes with correct header in wav format', () => {
      const proc = createProcessor(128, 16000, 'wav');
      const postMessage = proc.port.postMessage;

      // Fill buffer and trigger flush
      proc.append(new Float32Array(128).fill(0.5));
      proc.append(new Float32Array(1)); // triggers flush

      const wavBytes = postMessage.mock.calls[0][0][0];

      // Check RIFF header magic bytes
      const riff = String.fromCharCode(wavBytes[0], wavBytes[1], wavBytes[2], wavBytes[3]);
      expect(riff).toBe('RIFF');

      // Check WAVE format
      const wave = String.fromCharCode(wavBytes[8], wavBytes[9], wavBytes[10], wavBytes[11]);
      expect(wave).toBe('WAVE');

      // WAV header is 44 bytes + PCM data
      expect(wavBytes.length).toBe(44 + 128 * 4);
    });

    it('sends raw PCM bytes in pcm format', () => {
      const proc = createProcessor(128, 16000, 'pcm');
      const postMessage = proc.port.postMessage;

      proc.append(new Float32Array(128).fill(0.5));
      proc.append(new Float32Array(1)); // triggers flush

      const pcmBytes = postMessage.mock.calls[0][0][0];

      // No WAV header -- just raw float32 bytes
      expect(pcmBytes.length).toBe(128 * 4);
      // Should NOT start with RIFF
      const first4 = String.fromCharCode(pcmBytes[0], pcmBytes[1], pcmBytes[2], pcmBytes[3]);
      expect(first4).not.toBe('RIFF');
    });

    it('recreates buffer after flush', () => {
      const proc = createProcessor(128);

      proc.append(new Float32Array(128).fill(0.5));
      proc.append(new Float32Array(128).fill(0.3)); // triggers flush, then fills again

      // Buffer should have been recreated and filled with new data
      expect(proc._buffer.length).toBe(128);
    });
  });

  describe('stop message', () => {
    it('triggers final flush with isFinalChunk = true', () => {
      const proc = createProcessor(256);
      const postMessage = proc.port.postMessage;

      // Partially fill
      const data = new Float32Array(64).fill(0.2);
      proc.append(data);

      // Send stop
      proc.port.onmessage({ data: 'stop' });

      expect(postMessage).toHaveBeenCalledTimes(1);
      const [, isFinal] = postMessage.mock.calls[0][0];
      expect(isFinal).toBe(true);
    });

    it('flushes empty buffer on stop (sends WAV with zero data)', () => {
      const proc = createProcessor(256);
      const postMessage = proc.port.postMessage;

      // The original logic always flushes on stop, even if empty
      proc.port.onmessage({ data: 'stop' });

      expect(postMessage).toHaveBeenCalledTimes(1);
      const [, isFinal] = postMessage.mock.calls[0][0];
      expect(isFinal).toBe(true);
    });
  });

  describe('pause/resume', () => {
    it('pauses audio processing', () => {
      const proc = createProcessor(256);

      proc.port.onmessage({ data: 'pause' });
      expect(proc.isPaused).toBe(true);

      // process() should not append when paused
      const result = proc.process([[new Float32Array(128)]]);
      expect(result).toBe(true);
      expect(proc.isBufferEmpty()).toBe(true);
    });

    it('resumes audio processing', () => {
      const proc = createProcessor(256);

      proc.port.onmessage({ data: 'pause' });
      proc.port.onmessage({ data: 'resume' });
      expect(proc.isPaused).toBe(false);

      proc.process([[new Float32Array(128).fill(0.5)]]);
      expect(proc.isBufferEmpty()).toBe(false);
    });
  });

  describe('process()', () => {
    it('always returns true to keep processor alive', () => {
      const proc = createProcessor(256);
      expect(proc.process([[new Float32Array(128)]])).toBe(true);
    });
  });
});
