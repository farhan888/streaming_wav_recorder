const getWavHeader = (options) => {
  const numFrames = options.numFrames;
  const numChannels = options.numChannels || 2;
  const sampleRate = options.sampleRate || 44100;
  const bytesPerSample = options.isFloat ? 4 : 2;
  const format = options.isFloat ? 3 : 1;

  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44);
  const dv = new DataView(buffer);

  let p = 0;

  function writeString(s) {
    for (let i = 0; i < s.length; i++) {
      dv.setUint8(p + i, s.charCodeAt(i));
    }
    p += s.length;
  }

  function writeUint32(d) {
    dv.setUint32(p, d, true);
    p += 4;
  }

  function writeUint16(d) {
    dv.setUint16(p, d, true);
    p += 2;
  }

  writeString('RIFF');
  writeUint32(dataSize + 36);
  writeString('WAVE');
  writeString('fmt ');
  writeUint32(16);
  writeUint16(format);
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(bytesPerSample * 8);
  writeString('data');
  writeUint32(dataSize);

  return new Uint8Array(buffer);
};

const getWavBytes = (buffer, options) => {
  const type = options.isFloat ? Float32Array : Uint16Array;
  const numFrames = buffer.byteLength / type.BYTES_PER_ELEMENT;

  const headerBytes = getWavHeader(Object.assign({}, options, { numFrames }));
  const wavBytes = new Uint8Array(headerBytes.length + buffer.byteLength);

  wavBytes.set(headerBytes, 0);
  wavBytes.set(new Uint8Array(buffer), headerBytes.length);

  return wavBytes;
};

class RecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.port.onmessage = (event) => {
      if (event.data === 'stop') {
        this.isFinalChunk = true;
        this.flush();
      } else if (event.data === 'pause') {
        this.isPaused = true;
      } else if (event.data === 'resume') {
        this.isPaused = false;
      }
    };

    this.bufferSize = this.closestMultipleOf128(options.processorOptions.bufferApproxSize);
    this._bytesWritten = 0;
    this._buffer = new Float32Array(this.bufferSize);
    this.sampleRate = options.processorOptions.sampleRate;
    this.format = options.processorOptions.format || 'wav';
    this.initBuffer();
    this.isFinalChunk = false;
    this.isPaused = false;
  }

  closestMultipleOf128(number) {
    return 128 * parseInt(Math.round(number / 128));
  }

  initBuffer() {
    this._bytesWritten = 0;
  }

  isBufferEmpty() {
    return this._bytesWritten === 0;
  }

  isBufferFull() {
    return this._bytesWritten === this.bufferSize;
  }

  process(inputs) {
    if (this.isPaused) return true;
    this.append(inputs[0][0]);
    return true;
  }

  append(channelData) {
    if (this.isBufferFull()) {
      this.flush();
    }

    if (!channelData) return;

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._bytesWritten++] = channelData[i];
    }
  }

  flush() {
    if (this._bytesWritten < this.bufferSize) {
      this._buffer = this._buffer.slice(0, this._bytesWritten);
    }

    let output;
    if (this.format === 'pcm') {
      output = new Uint8Array(this._buffer.buffer);
    } else {
      output = getWavBytes(this._buffer.buffer, {
        isFloat: true,
        numChannels: 1,
        sampleRate: this.sampleRate,
      });
    }

    this.port.postMessage([output, this.isFinalChunk]);

    this._buffer = new Float32Array(this.bufferSize);
    this.initBuffer();
  }
}

registerProcessor('recorder.worklet', RecorderProcessor);
