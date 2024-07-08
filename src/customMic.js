import EventEmitter from "./eventEmitter.js";

/**
 * Represents a custom microphone handler using Web Audio API.
 * @extends EventEmitter
 */
export class CustomMic extends EventEmitter {
    /**
     * Create a CustomMic instance.
     * @param {number} [chunkSize=500] - Size of each audio chunk in milliseconds.
     * @param {number} [sampleRate=16000] - Sample rate of audio capture in Hz.
     */
    constructor(chunkSize = 500, sampleRate = 16000) {
        super();
        this.context = new AudioContext({"sampleRate": sampleRate});
        this.microphone = null;
        this.recorder = null;
        this.source = null;
        this.chunkSize = chunkSize;
    }
    
    /**
     * Starts capturing audio from the microphone.
     * @returns {Promise<void>} - Promise that resolves when microphone starts.
     */
    async startMic() {
        // Initialize microphone and audio worklet node
        this.microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.source = this.context.createMediaStreamSource(this.microphone);
        await this.context.audioWorklet.addModule("recorder.worklet.js");
        this.recorder = new AudioWorkletNode(this.context, "recorder.worklet", {
            processorOptions: {
                bufferApproxSize: (this.context.sampleRate / 1000) * this.chunkSize,
                sampleRate: this.context.sampleRate
            },
        });

        // Connect nodes and handle recorded data
        this.source.connect(this.recorder).connect(this.context.destination);
        this.recorder.port.onmessage = (e) => {
            // console.log(e.data);
            this.emit('recordedData', e.data);
        };
    }

    /**
     * Stops capturing audio from the microphone and releases resources.
     */
    stopMic() {
        // Stop recording and disconnect nodes
        this.recorder.port.postMessage('stop');
        if (this.recorder) {
            this.recorder.disconnect();
        }

        if (this.microphone) {
            const tracks = this.microphone.getTracks();
            tracks.forEach(track => track.stop());
        }
        if (this.source) {
            this.source.disconnect();
        }
    }
}

export default CustomMic;
