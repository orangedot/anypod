(function (root) {
  'use strict';

  function writeAscii(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  function floatToInt16Sample(v) {
    const clamped = Math.max(-1, Math.min(1, v));
    return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }

  function encodeWavPcm16(channels, sampleRate) {
    const chList = channels && channels.length ? channels : [new Float32Array(0)];
    const numChannels = chList.length;
    const numFrames = chList[0].length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataByteLength = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataByteLength);
    const view = new DataView(buffer);

    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataByteLength, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataByteLength, true);

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numChannels; c++) {
        view.setInt16(offset, floatToInt16Sample(chList[c][i] || 0), true);
        offset += 2;
      }
    }

    return new Uint8Array(buffer);
  }

  function loadLameLibrary() {
    if (root.lamejs && root.lamejs.Mp3Encoder) {
      return Promise.resolve(root.lamejs);
    }
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('lamejs not loaded in environment'));
    }
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-lame-encoder]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(root.lamejs); });
        existing.addEventListener('error', function () { reject(new Error('Failed to load MP3 encoder')); });
        return;
      }
      const s = document.createElement('script');
      s.src = '/vendor/lame.min.js';
      s.async = true;
      s.setAttribute('data-lame-encoder', '1');
      s.onload = function () {
        if (root.lamejs && root.lamejs.Mp3Encoder) {
          resolve(root.lamejs);
        } else {
          reject(new Error('MP3 encoder symbol missing after script load'));
        }
      };
      s.onerror = function () {
        reject(new Error('Could not load /vendor/lame.min.js'));
      };
      document.head.appendChild(s);
    });
  }

  async function encodeMp3(channels, sampleRate, kbps) {
    const lame = await loadLameLibrary();
    const chList = channels && channels.length ? channels : [new Float32Array(0)];
    const numChannels = Math.min(2, chList.length);
    const bitrate = kbps || (numChannels === 1 ? 128 : 192);
    const encoder = new lame.Mp3Encoder(numChannels, sampleRate, bitrate);

    const leftF32 = chList[0];
    const rightF32 = numChannels > 1 ? chList[1] : null;
    const leftInt16 = new Int16Array(leftF32.length);
    const rightInt16 = rightF32 ? new Int16Array(rightF32.length) : null;

    for (let i = 0; i < leftF32.length; i++) {
      leftInt16[i] = floatToInt16Sample(leftF32[i]);
      if (rightInt16) {
        rightInt16[i] = floatToInt16Sample(rightF32[i]);
      }
    }

    const blockSize = 1152;
    const mp3Chunks = [];
    let totalBytes = 0;

    for (let i = 0; i < leftInt16.length; i += blockSize) {
      const leftSub = leftInt16.subarray(i, i + blockSize);
      let buf;
      if (rightInt16) {
        const rightSub = rightInt16.subarray(i, i + blockSize);
        buf = encoder.encodeBuffer(leftSub, rightSub);
      } else {
        buf = encoder.encodeBuffer(leftSub);
      }
      if (buf && buf.length > 0) {
        const chunk = new Uint8Array(buf);
        mp3Chunks.push(chunk);
        totalBytes += chunk.byteLength;
      }
    }

    const tail = encoder.flush();
    if (tail && tail.length > 0) {
      const chunk = new Uint8Array(tail);
      mp3Chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }

    const out = new Uint8Array(totalBytes);
    let cursor = 0;
    for (let i = 0; i < mp3Chunks.length; i++) {
      out.set(mp3Chunks[i], cursor);
      cursor += mp3Chunks[i].byteLength;
    }
    return out;
  }

  const api = {
    encodeWavPcm16: encodeWavPcm16,
    encodeMp3: encodeMp3,
    loadLameLibrary: loadLameLibrary
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StudioEncoder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
