# streaming-wav-recorder

[![npm version](https://img.shields.io/npm/v/streaming-wav-recorder.svg)](https://www.npmjs.com/package/streaming-wav-recorder)
[![CI](https://github.com/farhan888/streaming_wav_recorder/actions/workflows/ci.yml/badge.svg)](https://github.com/farhan888/streaming_wav_recorder/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Stream microphone audio as WAV chunks using AudioWorklet. TypeScript, zero runtime dependencies.

## Why this library?

Most browser audio recording libraries use the deprecated `ScriptProcessorNode`, don't stream, or require complex setup. This library:

- Uses **AudioWorklet** (modern, off-main-thread audio processing)
- **Streams WAV chunks** at configurable intervals — each chunk is a complete, valid WAV file
- **TypeScript-first** with full type definitions
- **Zero runtime dependencies** — just the Web Audio API
- **Pause/resume** without releasing the microphone
- **SSR-safe** — can be imported in Node.js/Next.js without crashing

## Install

```bash
npm install streaming-wav-recorder
```

## Quick Start

```ts
import { WavStream } from 'streaming-wav-recorder';

const recorder = new WavStream({
  chunkSize: 500,   // chunk interval in ms
  sampleRate: 16000, // sample rate in Hz
});

recorder.on('data', ([wavBytes, isFinalChunk]) => {
  // wavBytes is a Uint8Array containing a valid WAV file
  console.log(`Received ${wavBytes.length} bytes, final: ${isFinalChunk}`);
});

await recorder.start();

// Later...
recorder.stop();
```

## API Reference

### `new WavStream(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunkSize` | `number` | `500` | Chunk interval in milliseconds |
| `sampleRate` | `number` | `16000` | Audio sample rate in Hz |
| `workletUrl` | `string` | `'recorder.worklet.js'` | URL to the AudioWorklet processor file |
| `format` | `'wav' \| 'pcm'` | `'wav'` | Chunk format: `'wav'` = standalone WAV files, `'pcm'` = raw float32 PCM bytes |
| `noiseSuppression` | `boolean` | `true` | Browser noise suppression |
| `echoCancellation` | `boolean` | `true` | Browser echo cancellation |
| `autoGainControl` | `boolean` | `true` | Browser auto gain control |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<void>` | Request mic permission and begin recording |
| `stop()` | `void` | Stop recording and release microphone |
| `pause()` | `void` | Pause recording (mic stays open, silence is not recorded) |
| `resume()` | `void` | Resume recording after pause |
| `destroy()` | `Promise<void>` | Permanently release all resources including AudioContext |

### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `WavStream.isSupported()` | `boolean` | Check if the browser supports AudioWorklet + getUserMedia. Returns `false` in SSR/Node.js. |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `'data'` | `[Uint8Array, boolean]` | Emitted for each WAV chunk. Second element is `true` for the final chunk. |
| `'statechange'` | `RecordingState` | Emitted when state changes (`'inactive'`, `'recording'`, `'paused'`) |
| `'error'` | `Error` | Emitted on errors (permission denied, worklet load failure, etc.) |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `state` | `RecordingState` | Current state: `'inactive'`, `'recording'`, or `'paused'` |
| `chunkSize` | `number` | Configured chunk interval (read-only) |
| `sampleRate` | `number` | Configured sample rate (read-only) |

## Chunk Formats

### WAV (default)

Each chunk is a complete, valid WAV file with a 44-byte header. Use for saving audio files or APIs that expect WAV input.

```ts
const recorder = new WavStream({ format: 'wav' });
recorder.on('data', ([wavBytes]) => {
  // wavBytes is a self-contained WAV file
  download(new Blob([wavBytes], { type: 'audio/wav' }));
});
```

### PCM

Each chunk is raw float32 PCM bytes (no header). Use for real-time streaming to WebSockets or speech-to-text services where you need continuous raw audio.

```ts
const recorder = new WavStream({ format: 'pcm' });
recorder.on('data', ([pcmBytes]) => {
  // pcmBytes is raw Float32Array data as Uint8Array
  ws.send(pcmBytes);
});
```

## Audio Processing

Noise suppression, echo cancellation, and auto gain control are **enabled by default**. Disable them for raw/unprocessed audio (e.g. music recording):

```ts
const recorder = new WavStream({
  noiseSuppression: false,
  echoCancellation: false,
  autoGainControl: false,
});
```

## Serving the Worklet File

The AudioWorklet processor (`recorder.worklet.js`) must be served as a **separate file** from your web server. It cannot be bundled because `AudioContext.audioWorklet.addModule()` requires a URL.

The file is included in the npm package at both `dist/recorder.worklet.js` and `src/recorder.worklet.js`.

### Vite / Next.js / CRA

Copy the file to your `public/` directory:

```bash
cp node_modules/streaming-wav-recorder/dist/recorder.worklet.js public/
```

### Webpack (CopyPlugin)

```js
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  plugins: [
    new CopyPlugin({
      patterns: [{
        from: 'node_modules/streaming-wav-recorder/dist/recorder.worklet.js',
        to: 'recorder.worklet.js',
      }],
    }),
  ],
};
```

### Express

```js
app.use(express.static('node_modules/streaming-wav-recorder/dist'));
```

### Custom URL

If you serve the file from a different path, pass it to the constructor:

```ts
const recorder = new WavStream({
  workletUrl: '/assets/audio/recorder.worklet.js',
});
```

## Usage with React

```tsx
import { useEffect, useRef, useCallback } from 'react';
import { WavStream } from 'streaming-wav-recorder';

function AudioRecorder() {
  const recorderRef = useRef<WavStream | null>(null);

  useEffect(() => {
    const recorder = new WavStream({ chunkSize: 500, sampleRate: 16000 });

    recorder.on('data', ([wavBytes, isFinal]) => {
      // Send to your backend, WebSocket, etc.
      console.log('WAV chunk:', wavBytes.length, 'bytes');
    });

    recorder.on('error', (err) => console.error('Recording error:', err));

    recorderRef.current = recorder;

    return () => {
      recorder.destroy();
    };
  }, []);

  const handleStart = useCallback(() => recorderRef.current?.start(), []);
  const handleStop = useCallback(() => recorderRef.current?.stop(), []);
  const handlePause = useCallback(() => recorderRef.current?.pause(), []);
  const handleResume = useCallback(() => recorderRef.current?.resume(), []);

  return (
    <div>
      <button onClick={handleStart}>Start</button>
      <button onClick={handleStop}>Stop</button>
      <button onClick={handlePause}>Pause</button>
      <button onClick={handleResume}>Resume</button>
    </div>
  );
}
```

## Usage with Next.js (SSR)

The library is SSR-safe — it won't crash when imported on the server. Use `isSupported()` to guard:

```tsx
'use client';

import { WavStream } from 'streaming-wav-recorder';

export default function Recorder() {
  const handleStart = async () => {
    if (!WavStream.isSupported()) {
      console.warn('Audio recording not supported in this environment');
      return;
    }

    const recorder = new WavStream();
    recorder.on('data', ([wav]) => { /* handle chunk */ });
    await recorder.start();
  };

  return <button onClick={handleStart}>Record</button>;
}
```

## Streaming to Speech-to-Text Services

### Deepgram (WebSocket)

```ts
const ws = new WebSocket('wss://api.deepgram.com/v1/listen', ['token', DEEPGRAM_API_KEY]);

const recorder = new WavStream({ chunkSize: 250, sampleRate: 16000 });

recorder.on('data', ([wavBytes]) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(wavBytes);
  }
});

await recorder.start();
```

### OpenAI Whisper (collect and send)

```ts
const chunks: Uint8Array[] = [];

recorder.on('data', ([wavBytes, isFinal]) => {
  chunks.push(wavBytes);

  if (isFinal) {
    const blob = new Blob(chunks, { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('file', blob, 'recording.wav');
    formData.append('model', 'whisper-1');

    fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
  }
});
```

## Known Limitations

- **Mono output only** — single channel recording
- **Worklet file must be served separately** — cannot be inlined due to AudioWorklet's `addModule()` requirement
- **HTTPS required** in production — `getUserMedia` only works over secure contexts
- **CSP considerations** — your Content-Security-Policy `script-src` must allow the worklet file URL
- **Each chunk is a standalone WAV file** — includes a 44-byte header per chunk

### Browser Compatibility

| Browser | Minimum Version |
|---------|----------------|
| Chrome | 64+ |
| Edge | 79+ |
| Firefox | 76+ |
| Safari | 14.1+ |

## Future Roadmap

- Inline worklet option (Blob URL) for zero-config bundler support
- ReadableStream API for native piping
- React hook package (`useWavStream`)
- Stereo recording support
- Configurable bit depth (16-bit integer output)

## License

[ISC](LICENSE)
