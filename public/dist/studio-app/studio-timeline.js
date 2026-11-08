(function (root) {
  'use strict';

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9);
  }

  function computeBufferPeaks(buffer, bucketCount) {
    const buckets = Math.max(16, Math.min(1024, bucketCount || 180));
    const peaks = new Float32Array(buckets);
    if (!buffer || !buffer.length) return peaks;

    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / buckets));
    let max = 0.001;

    for (let b = 0; b < buckets; b++) {
      const start = b * step;
      const end = Math.min(data.length, start + step);
      let p = 0;
      const stride = Math.max(1, Math.floor((end - start) / 32));
      for (let i = start; i < end; i += stride) {
        const a = Math.abs(data[i]);
        if (a > p) p = a;
      }
      peaks[b] = p;
      if (p > max) max = p;
    }

    for (let b = 0; b < buckets; b++) {
      peaks[b] = Math.max(0.04, Math.min(1.0, peaks[b] / max));
    }
    return peaks;
  }

  function createTimeline(options) {
    const opts = options || {};
    const sampleRate = opts.sampleRate || 48000;
    const onUpdate = typeof opts.onUpdate === 'function' ? opts.onUpdate : function () {};
    const onPlayhead = typeof opts.onPlayhead === 'function' ? opts.onPlayhead : function () {};

    let tracks = [
      {
        id: 'track-voice',
        name: 'Host Voice',
        type: 'voice',
        color: '#e5a967',
        volume: 1.0,
        muted: false,
        solo: false,
        clips: []
      },
      {
        id: 'track-sfx',
        name: 'Sound FX & Stingers',
        type: 'sfx',
        color: '#a78bfa',
        volume: 0.85,
        muted: false,
        solo: false,
        clips: []
      },
      {
        id: 'track-music',
        name: 'Music & Ambience',
        type: 'music',
        color: '#6bc4a6',
        volume: 0.65,
        muted: false,
        solo: false,
        clips: []
      }
    ];

    let chapters = [];

    let playhead = 0.0;
    let isPlaying = false;
    let autoDucking = true;
    let zoom = 55;
    let selectedClipId = null;
    let selectedTrackId = 'track-voice';

    let audioCtx = null;
    let activeSources = [];
    let playStartCtxTime = 0;
    let playStartPlayhead = 0;
    let rafId = null;

    function getAudioContext() {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx({ sampleRate: sampleRate });
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }

    function getTotalDuration() {
      let maxEnd = 10.0;
      tracks.forEach(function (t) {
        t.clips.forEach(function (c) {
          const end = c.start + c.duration;
          if (end > maxEnd) maxEnd = end;
        });
      });
      chapters.forEach(function (ch) {
        if (ch.time + 4.0 > maxEnd) maxEnd = ch.time + 4.0;
      });
      return Math.max(10.0, maxEnd + 2.0);
    }

    function findClip(clipId) {
      for (let i = 0; i < tracks.length; i++) {
        const found = tracks[i].clips.find(function (c) { return c.id === clipId; });
        if (found) return { clip: found, track: tracks[i] };
      }
      return null;
    }

    function addClip(trackId, buffer, name, startTime) {
      const track = tracks.find(function (t) { return t.id === trackId; }) || tracks[0];
      const start = Math.max(0, startTime !== undefined ? Number(startTime) : playhead);
      const dur = buffer ? buffer.duration : 1.0;
      const clip = {
        id: uid('clip'),
        trackId: track.id,
        name: name || 'Audio Clip',
        start: start,
        offset: 0.0,
        duration: dur,
        sourceDuration: dur,
        volume: 1.0,
        fadeIn: Math.min(0.08, dur * 0.1),
        fadeOut: Math.min(0.08, dur * 0.1),
        buffer: buffer,
        peaks: computeBufferPeaks(buffer, 160)
      };
      track.clips.push(clip);
      selectedClipId = clip.id;
      selectedTrackId = track.id;
      onUpdate();
      return clip;
    }

    function removeClip(clipId) {
      tracks.forEach(function (t) {
        t.clips = t.clips.filter(function (c) { return c.id !== clipId; });
      });
      if (selectedClipId === clipId) selectedClipId = null;
      onUpdate();
    }

    function moveClip(clipId, targetTrackId, newStart) {
      const match = findClip(clipId);
      if (!match) return;
      const c = match.clip;
      const oldTrack = match.track;
      const newTrack = tracks.find(function (t) { return t.id === targetTrackId; }) || oldTrack;

      if (oldTrack.id !== newTrack.id) {
        oldTrack.clips = oldTrack.clips.filter(function (item) { return item.id !== clipId; });
        c.trackId = newTrack.id;
        newTrack.clips.push(c);
      }
      c.start = Math.max(0, Number(newStart) || 0);
      onUpdate();
    }

    function trimClip(clipId, deltaStart, deltaEnd) {
      const match = findClip(clipId);
      if (!match) return;
      const c = match.clip;

      if (deltaStart !== 0) {
        const maxDelta = c.duration - 0.1;
        const actualDelta = Math.max(-c.offset, Math.min(maxDelta, deltaStart));
        c.start += actualDelta;
        c.offset += actualDelta;
        c.duration -= actualDelta;
      }

      if (deltaEnd !== 0) {
        const remainingSrc = c.sourceDuration - (c.offset + c.duration);
        const actualDelta = Math.max(-(c.duration - 0.1), Math.min(remainingSrc, deltaEnd));
        c.duration += actualDelta;
      }

      onUpdate();
    }

    function splitClipAtTime(clipId, splitTime) {
      const match = findClip(clipId);
      if (!match) return false;
      const c = match.clip;
      const track = match.track;

      if (splitTime <= c.start + 0.05 || splitTime >= c.start + c.duration - 0.05) {
        return false;
      }

      const firstDur = splitTime - c.start;
      const secondDur = c.duration - firstDur;
      const secondOffset = c.offset + firstDur;

      const rightClip = {
        id: uid('clip'),
        trackId: track.id,
        name: c.name + ' (Part 2)',
        start: splitTime,
        offset: secondOffset,
        duration: secondDur,
        sourceDuration: c.sourceDuration,
        volume: c.volume,
        fadeIn: 0.02,
        fadeOut: c.fadeOut,
        buffer: c.buffer,
        peaks: computeBufferPeaks(c.buffer, 120)
      };

      c.duration = firstDur;
      c.fadeOut = 0.02;

      track.clips.push(rightClip);
      selectedClipId = rightClip.id;
      onUpdate();
      return true;
    }

    function duplicateClip(clipId) {
      const match = findClip(clipId);
      if (!match) return null;
      const c = match.clip;
      const dup = {
        id: uid('clip'),
        trackId: c.trackId,
        name: c.name + ' (Copy)',
        start: c.start + c.duration + 0.2,
        offset: c.offset,
        duration: c.duration,
        sourceDuration: c.sourceDuration,
        volume: c.volume,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
        buffer: c.buffer,
        peaks: c.peaks
      };
      match.track.clips.push(dup);
      selectedClipId = dup.id;
      onUpdate();
      return dup;
    }

    function addChapter(time, title) {
      const t = Math.max(0, Number(time) || playhead);
      const ch = {
        id: uid('ch'),
        title: title || ('Chapter ' + (chapters.length + 1)),
        time: t
      };
      chapters.push(ch);
      chapters.sort(function (a, b) { return a.time - b.time; });
      onUpdate();
      return ch;
    }

    function removeChapter(chId) {
      chapters = chapters.filter(function (c) { return c.id !== chId; });
      onUpdate();
    }

    function updateChapter(chId, title, time) {
      const ch = chapters.find(function (c) { return c.id === chId; });
      if (!ch) return;
      if (title !== undefined) ch.title = String(title);
      if (time !== undefined) ch.time = Math.max(0, Number(time));
      chapters.sort(function (a, b) { return a.time - b.time; });
      onUpdate();
    }

    function isVoiceActiveAt(t) {
      const vTrack = tracks.find(function (tr) { return tr.type === 'voice'; });
      if (!vTrack || vTrack.muted) return false;
      return vTrack.clips.some(function (c) {
        return t >= c.start && t < (c.start + c.duration);
      });
    }

    function schedulePlaybackGraph(ctx, destination, startOffset, isOffline) {
      const nodes = [];
      const hasSolo = tracks.some(function (t) { return t.solo; });

      tracks.forEach(function (track) {
        const isAudible = hasSolo ? track.solo : !track.muted;
        if (!isAudible) return;

        const trackGain = ctx.createGain();
        trackGain.gain.setValueAtTime(track.volume, ctx.currentTime);
        trackGain.connect(destination);

        track.clips.forEach(function (clip) {
          if (!clip.buffer) return;
          const clipStartOnTimeline = clip.start;
          const clipEndOnTimeline = clip.start + clip.duration;

          if (clipEndOnTimeline <= startOffset) return;

          const playDelay = Math.max(0, clipStartOnTimeline - startOffset);
          const bufferStartOffset = clipStartOnTimeline < startOffset
            ? clip.offset + (startOffset - clipStartOnTimeline)
            : clip.offset;
          const playDuration = clipEndOnTimeline - Math.max(startOffset, clipStartOnTimeline);

          if (playDuration <= 0.005) return;

          const src = ctx.createBufferSource();
          src.buffer = clip.buffer;

          const clipGain = ctx.createGain();
          const targetVol = clip.volume;
          const whenStart = ctx.currentTime + playDelay;
          const whenEnd = whenStart + playDuration;

          clipGain.gain.setValueAtTime(0.0001, whenStart);
          const fadeInSec = Math.max(0.005, clip.fadeIn);
          clipGain.gain.linearRampToValueAtTime(targetVol, whenStart + fadeInSec);

          const fadeOutSec = Math.max(0.005, clip.fadeOut);
          clipGain.gain.setValueAtTime(targetVol, Math.max(whenStart + fadeInSec, whenEnd - fadeOutSec));
          clipGain.gain.linearRampToValueAtTime(0.0001, whenEnd);

          if (autoDucking && track.type === 'music') {
            const step = 0.1;
            for (let t = 0; t < playDuration; t += step) {
              const absTime = Math.max(startOffset, clipStartOnTimeline) + t;
              const voicePresent = isVoiceActiveAt(absTime);
              const duckFactor = voicePresent ? 0.22 : 1.0;
              const at = whenStart + t;
              clipGain.gain.setTargetAtTime(targetVol * duckFactor, at, 0.08);
            }
          }

          src.connect(clipGain);
          clipGain.connect(trackGain);

          src.start(whenStart, bufferStartOffset, playDuration);
          nodes.push(src);
        });
      });

      return nodes;
    }

    function play() {
      if (isPlaying) return;
      const ctx = getAudioContext();
      stopActiveSources();

      playStartCtxTime = ctx.currentTime;
      playStartPlayhead = playhead;
      activeSources = schedulePlaybackGraph(ctx, ctx.destination, playhead, false);
      isPlaying = true;

      function tick() {
        if (!isPlaying) return;
        const elapsed = ctx.currentTime - playStartCtxTime;
        playhead = playStartPlayhead + elapsed;
        const total = getTotalDuration();
        if (playhead >= total) {
          pause();
          playhead = 0.0;
          onPlayhead(playhead);
          return;
        }
        onPlayhead(playhead);
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
      onUpdate();
    }

    function stopActiveSources() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      activeSources.forEach(function (s) {
        try {
          s.stop();
          s.disconnect();
        } catch (_) {}
      });
      activeSources = [];
    }

    function pause() {
      if (!isPlaying) return;
      isPlaying = false;
      stopActiveSources();
      onUpdate();
    }

    function togglePlay() {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
    }

    function seek(seconds) {
      const wasPlaying = isPlaying;
      if (wasPlaying) pause();
      playhead = Math.max(0, Math.min(getTotalDuration(), Number(seconds) || 0));
      onPlayhead(playhead);
      if (wasPlaying) play();
      onUpdate();
    }

    async function renderMasterBuffer() {
      const totalDur = getTotalDuration();
      const totalSamples = Math.ceil(totalDur * sampleRate);
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offCtx = new Ctx(2, totalSamples, sampleRate);

      schedulePlaybackGraph(offCtx, offCtx.destination, 0.0, true);
      const rendered = await offCtx.startRendering();
      return rendered;
    }

    function exportChaptersJson() {
      return chapters.map(function (ch) {
        return {
          title: ch.title,
          startTime: Math.round(ch.time * 100) / 100
        };
      });
    }

    return {
      getTracks: function () { return tracks; },
      getChapters: function () { return chapters; },
      getPlayhead: function () { return playhead; },
      getDuration: getTotalDuration,
      getZoom: function () { return zoom; },
      setZoom: function (z) { zoom = Math.max(20, Math.min(240, Number(z) || 55)); onUpdate(); },
      getIsPlaying: function () { return isPlaying; },
      getAutoDucking: function () { return autoDucking; },
      setAutoDucking: function (val) { autoDucking = !!val; onUpdate(); },
      getSelectedClipId: function () { return selectedClipId; },
      setSelectedClipId: function (id) { selectedClipId = id; onUpdate(); },
      getSelectedTrackId: function () { return selectedTrackId; },
      setSelectedTrackId: function (id) { selectedTrackId = id; onUpdate(); },
      addClip: addClip,
      removeClip: removeClip,
      moveClip: moveClip,
      trimClip: trimClip,
      splitClipAtTime: splitClipAtTime,
      duplicateClip: duplicateClip,
      findClip: findClip,
      addChapter: addChapter,
      removeChapter: removeChapter,
      updateChapter: updateChapter,
      play: play,
      pause: pause,
      togglePlay: togglePlay,
      seek: seek,
      renderMasterBuffer: renderMasterBuffer,
      exportChaptersJson: exportChaptersJson
    };
  }

  const api = {
    createTimeline: createTimeline,
    computeBufferPeaks: computeBufferPeaks
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StudioTimeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
