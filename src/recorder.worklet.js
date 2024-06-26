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

    writeString("RIFF"); // ChunkID
    writeUint32(dataSize + 36); // ChunkSize
    writeString("WAVE"); // Format
    writeString("fmt "); // Subchunk1ID
    writeUint32(16); // Subchunk1Size
    writeUint16(format); // AudioFormat https://i.stack.imgur.com/BuSmb.png
    writeUint16(numChannels); // NumChannels
    writeUint32(sampleRate); // SampleRate
    writeUint32(byteRate); // ByteRate
    writeUint16(blockAlign); // BlockAlign
    writeUint16(bytesPerSample * 8); // BitsPerSample
    writeString("data"); // Subchunk2ID
    writeUint32(dataSize); // Subchunk2Size

    return new Uint8Array(buffer);
};

const getWavBytes = (buffer, options) => {
    // console.log(buffer);
    const type = options.isFloat ? Float32Array : Uint16Array;
    const numFrames = buffer.byteLength / type.BYTES_PER_ELEMENT;

    const headerBytes = getWavHeader(Object.assign({}, options, { numFrames }));
    const wavBytes = new Uint8Array(headerBytes.length + buffer.byteLength);

    // prepend header, then add pcmBytes
    wavBytes.set(headerBytes, 0);
    wavBytes.set(new Uint8Array(buffer), headerBytes.length);

    return wavBytes;
};

class RecorderProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        //As of when this code was written microphone data was captured in 128 frames.
        //This might change in future and might need to be refactored.
        this.port.onmessage = (event) => {
            if(event.data=="Stop"){
                this.isFinalChunk = true;
                this.flush();
            }          
        };
        this.bufferSize = this.closestMultipleOf128(options.processorOptions.bufferApproxSize);
        this._bytesWritten = 0;
        this._buffer = new Float32Array(this.bufferSize);
        this.sampleRate = options.processorOptions.sampleRate;
        this.initBuffer();
        this.isFinalChunk = false;
    }

    closestMultipleOf128(number) {
        return 128*parseInt(Math.round(number/128));
    }

    initBuffer() {
        this._bytesWritten = 0
    }

    isBufferEmpty() {
        return this._bytesWritten === 0
    }

    isBufferFull() {
        return this._bytesWritten === this.bufferSize
    }

    /**
   * @param {Float32Array[][]} inputs
   * @returns {boolean}
   */
    process(inputs, outputs, params) {
        // Grabbing the 1st channel similar to ScriptProcessorNode
        // console.log(inputs);
        this.append(inputs[0][0])
        // console.log(inputs,outputs)
        return true
    }

    /**
   *
   * @param {Float32Array} channelData
   */
    append(channelData) {
        // console.log("append called");
        if (this.isBufferFull()) {
            this.flush()
        }

        if (!channelData) return

        for (let i = 0; i < channelData.length; i++) {
            this._buffer[this._bytesWritten++] = channelData[i]
        }
    }

    flush() {
        if (this._bytesWritten < this.bufferSize) {
            console.log("flush called")
            this._buffer = this._buffer.slice(0, this._bytesWritten);
        }

        //for testing purposes
        const wavBytes = getWavBytes(this._buffer.buffer, {
            isFloat: true, // floating point or 16-bit integer
            numChannels: 1,
            sampleRate: this.sampleRate,
        });

        this.port.postMessage(
            [wavBytes, this.isFinalChunk]
        )

        this.initBuffer()

    }
}

registerProcessor("recorder.worklet", RecorderProcessor)