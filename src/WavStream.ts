import { EventEmitter } from './EventEmitter';

export type RecordingState = 'inactive' | 'recording' | 'paused';
export type ChunkFormat = 'wav' | 'pcm';

export interface WavStreamOptions {
  chunkSize?: number;
  sampleRate?: number;
  workletUrl?: string;
  format?: ChunkFormat;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
  autoGainControl?: boolean;
}

export type WavStreamEventMap = {
  data: [Uint8Array, boolean];
  statechange: RecordingState;
  error: Error;
};

export class WavStream extends EventEmitter<WavStreamEventMap> {
  private context: AudioContext | null = null;
  private microphone: MediaStream | null = null;
  private recorder: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletReady: Promise<void> | null = null;

  readonly chunkSize: number;
  readonly sampleRate: number;
  readonly workletUrl: string;
  readonly format: ChunkFormat;
  private readonly audioConstraints: MediaTrackConstraints;

  private _state: RecordingState = 'inactive';

  get state(): RecordingState {
    return this._state;
  }

  static isSupported(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }
    return (
      typeof AudioContext !== 'undefined' &&
      typeof AudioWorkletNode !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  constructor(options: WavStreamOptions = {}) {
    super();
    this.chunkSize = options.chunkSize ?? 500;
    this.sampleRate = options.sampleRate ?? 16000;
    this.workletUrl = options.workletUrl ?? 'recorder.worklet.js';
    this.format = options.format ?? 'wav';
    this.audioConstraints = {
      noiseSuppression: options.noiseSuppression ?? true,
      echoCancellation: options.echoCancellation ?? true,
      autoGainControl: options.autoGainControl ?? true,
    };

    if (WavStream.isSupported()) {
      this.context = new AudioContext({ sampleRate: this.sampleRate });
      // Pre-load the worklet module so start() is fast
      this.workletReady = this.context.audioWorklet.addModule(this.workletUrl);
    }
  }

  async start(): Promise<void> {
    if (!WavStream.isSupported()) {
      throw new Error('WavStream is not supported in this environment');
    }

    // Idempotency: clean up previous session
    if (this._state !== 'inactive') {
      this.stop();
    }

    try {
      if (!this.context) {
        this.context = new AudioContext({ sampleRate: this.sampleRate });
        this.workletReady = this.context.audioWorklet.addModule(this.workletUrl);
      }

      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      await this.workletReady;

      this.microphone = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints });
      this.source = this.context.createMediaStreamSource(this.microphone);
      this.recorder = new AudioWorkletNode(this.context, 'recorder.worklet', {
        processorOptions: {
          bufferApproxSize: (this.context.sampleRate / 1000) * this.chunkSize,
          sampleRate: this.context.sampleRate,
          format: this.format,
        },
      });

      // Connect to destination to keep the worklet alive.
      // The Web Audio API uses a pull-based rendering model rooted at the
      // destination node. An AudioWorkletNode not connected to the destination
      // (directly or indirectly) may have its process() calls stopped by the
      // browser, as disconnected nodes can be garbage collected.
      // The worklet does not write to its outputs, so silence reaches the speakers.
      this.source.connect(this.recorder).connect(this.context.destination);

      this.recorder.port.onmessage = (e: MessageEvent) => {
        this.emit('data', e.data as [Uint8Array, boolean]);
      };

      this._state = 'recording';
      this.emit('statechange', this._state);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  stop(): void {
    if (this.recorder) {
      this.recorder.port.postMessage('stop');
      this.recorder.port.onmessage = null;
      this.recorder.disconnect();
      this.recorder = null;
    }

    if (this.microphone) {
      this.microphone.getTracks().forEach((track) => track.stop());
      this.microphone = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.context) {
      this.context.suspend();
    }

    if (this._state !== 'inactive') {
      this._state = 'inactive';
      this.emit('statechange', this._state);
    }
  }

  pause(): void {
    if (this._state !== 'recording') return;

    this.recorder?.port.postMessage('pause');
    this._state = 'paused';
    this.emit('statechange', this._state);
  }

  resume(): void {
    if (this._state !== 'paused') return;

    this.recorder?.port.postMessage('resume');
    this._state = 'recording';
    this.emit('statechange', this._state);
  }

  async destroy(): Promise<void> {
    this.stop();
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.workletReady = null;
    }
    this.removeAllListeners();
  }
}
