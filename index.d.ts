// index.d.ts

declare module "streaming-wav-recorder" {
    import EventEmitter from "./src/eventEmitter";

    /**
     * Represents a custom microphone handler using Web Audio API.
     * @extends EventEmitter
     */
    export class CustomMic extends EventEmitter {
        /**
         * Create a CustomMic instance.
         * @param {number} [chunkSize=500] - Size of each audio chunk in milliseconds. Defaults at 500.
         * @param {number} [sampleRate=16000] - Sample rate of audio capture in Hz. Defaults at 16000.
         */
        constructor(chunkSize?: number, sampleRate?: number);

        /**
         * Starts capturing audio from the microphone.
         * @returns {Promise<void>} - Promise that resolves when microphone starts.
         */
        startMic(): Promise<void>;

        /**
         * Stops capturing audio from the microphone and releases resources.
         */
        stopMic(): void;
    }

    export default CustomMic;
}
