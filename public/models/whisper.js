// whisper.js – thin wrapper for Whisper‑cpp WASM model
// The model binary is stored as public/models/whisper.tiny.en.wasm.gz
// This script loads the gzipped WASM, decompresses it, and instantiates the module.

export async function loadWhisper() {
  // 1. Fetch the gzipped WASM
  const resp = await fetch('/models/whisper.tiny.en.wasm.gz');
  if (!resp.ok) throw new Error('Failed to fetch Whisper model');
  const gz = await resp.arrayBuffer();

  // 2. Decompress (modern browsers support DecompressionStream)
  let wasmBinary;
  if ('DecompressionStream' in window) {
    const ds = new DecompressionStream('gzip');
    const decompressed = new Response(new Blob([gz]).stream().pipeThrough(ds));
    wasmBinary = await decompressed.arrayBuffer();
  } else {
    // Fallback – you could include pako, but for simplicity we require modern browsers
    throw new Error('Browser does not support gzip decompression');
  }

  // 3. Instantiate the WASM module. The compiled Whisper‑cpp exports a `transcribe` function.
  const { instance } = await WebAssembly.instantiate(wasmBinary, {
    env: {
      // Minimal env import – abort just logs the error
      abort: () => console.error('WASM abort')
    }
  });

  const memory = instance.exports.memory;
  const decoder = new TextDecoder();

  function transcribe(pcmInt16Array) {
    const size = pcmInt16Array.length * 2; // int16 => 2 bytes each
    const ptr = instance.exports.malloc(size);
    const view = new Uint8Array(memory.buffer, ptr, size);
    // Copy PCM data into WASM memory
    const pcm8 = new Uint8Array(pcmInt16Array.buffer);
    view.set(pcm8);
    // Call the actual transcribe function
    const resultPtr = instance.exports.transcribe(ptr, pcmInt16Array.length);
    // Read a null‑terminated UTF‑8 JSON string from WASM memory
    const mem = new Uint8Array(memory.buffer);
    let i = resultPtr;
    const bytes = [];
    while (mem[i] !== 0) { bytes.push(mem[i]); i++; }
    const json = decoder.decode(new Uint8Array(bytes));
    // Free allocated buffers
    instance.exports.free(ptr);
    instance.exports.free(resultPtr);
    return JSON.parse(json);
  }

  return { transcribe };
}
