(function () {
  'use strict';

  function buildPeaks(seed, count) {
    const peaks = [];
    for (let i = 0; i < count; i++) {
      const v = 0.25 + 0.6 * Math.abs(Math.sin((i + seed) * 0.31) * Math.cos((i + seed) * 0.11));
      peaks.push(Number(Math.min(1, v).toFixed(3)));
    }
    return peaks;
  }

  const show = {
    slug: 'deep-tech-dispatch',
    title: 'Deep Tech Dispatch',
    author: 'Anypod Demo Studio',
    category: 'Technology',
    language: 'en',
    description: 'Weekly deep dives into edge computing, open standards and the economics of zero-egress storage.',
    cover_image_url: '',
    guid: '9f1c6a3e-5b2d-5c4a-8e17-3d0b7a52c9f4',
    explicit: false
  };

  const episodes = [
    {
      id: 'demo-3',
      number: 3,
      title: 'Why Egress Fees Are Dead',
      published: '2026-11-02',
      bytes: 41200000,
      durationSeconds: 2310,
      downloads: 1842,
      peaks: buildPeaks(3, 120),
      chapters: [
        { title: 'talk · Intro', startTime: 0 },
        { title: 'music · Stinger', startTime: 94 },
        { title: 'talk · R2 vs S3 math', startTime: 118 },
        { title: 'talk · Listener questions', startTime: 1640 }
      ]
    },
    {
      id: 'demo-2',
      number: 2,
      title: 'Podcasting 2.0 in Practice',
      published: '2026-10-26',
      bytes: 36850000,
      durationSeconds: 2065,
      downloads: 1377,
      peaks: buildPeaks(11, 120),
      chapters: [
        { title: 'talk · Welcome', startTime: 0 },
        { title: 'talk · Chapters and transcripts', startTime: 210 },
        { title: 'music · Outro', startTime: 1990 }
      ]
    },
    {
      id: 'demo-1',
      number: 1,
      title: 'Hello, Edge',
      published: '2026-10-19',
      bytes: 28400000,
      durationSeconds: 1590,
      downloads: 964,
      peaks: buildPeaks(23, 120),
      chapters: [
        { title: 'music · Theme', startTime: 0 },
        { title: 'talk · Why we started', startTime: 45 }
      ]
    }
  ];

  const downloadsByDay = [38, 52, 61, 47, 88, 112, 96, 74, 120, 143, 131, 158, 176, 192];

  window.StudioDemo = { show, episodes, downloadsByDay };
})();
