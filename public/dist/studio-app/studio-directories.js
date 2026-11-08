(function () {
  'use strict';

  const directories = [
    {
      id: 'apple',
      name: 'Apple Podcasts',
      letter: 'A',
      color: '#a855f7',
      hint: 'Submit your RSS feed in Apple Podcasts Connect. Reviews take up to 5 days.',
      submitUrl: 'https://podcastsconnect.apple.com/my-podcasts/new-feed',
      subscribeScheme: function (feed) { return 'podcast://' + feed.replace(/^https?:\/\//, ''); }
    },
    {
      id: 'spotify',
      name: 'Spotify',
      letter: 'S',
      color: '#1db954',
      hint: 'Paste your RSS feed in Spotify for Creators. Live within a few hours.',
      submitUrl: 'https://creators.spotify.com/pod/dashboard/submit',
      subscribeScheme: null
    },
    {
      id: 'youtube',
      name: 'YouTube Music',
      letter: 'Y',
      color: '#ef4444',
      hint: 'Add your RSS feed in YouTube Studio under Content, Podcasts.',
      submitUrl: 'https://studio.youtube.com/channel/UC/podcasts',
      subscribeScheme: null
    },
    {
      id: 'amazon',
      name: 'Amazon Music and Audible',
      letter: 'Az',
      color: '#0ea5e9',
      hint: 'Submit through Amazon Music for Podcasters.',
      submitUrl: 'https://podcasters.amazon.com/',
      subscribeScheme: null
    },
    {
      id: 'overcast',
      name: 'Overcast',
      letter: 'O',
      color: '#f97316',
      hint: 'Pulls from the Apple directory automatically. Subscribe by URL in the meantime.',
      submitUrl: 'https://overcast.fm/podcasterinfo',
      subscribeScheme: function (feed) { return 'overcast://x-callback-url/add?url=' + encodeURIComponent(feed); }
    },
    {
      id: 'pocketcasts',
      name: 'Pocket Casts',
      letter: 'P',
      color: '#f43f5e',
      hint: 'Submit your feed to the Pocket Casts directory.',
      submitUrl: 'https://pocketcasts.com/submit/',
      subscribeScheme: function (feed) { return 'pktc://subscribe/' + feed.replace(/^https?:\/\//, ''); }
    },
    {
      id: 'podcastindex',
      name: 'Podcast Index',
      letter: 'PI',
      color: '#e5a967',
      hint: 'Open directory powering Fountain, Podverse, Castamatic and more.',
      submitUrl: 'https://podcastindex.org/add',
      subscribeScheme: null
    },
    {
      id: 'iheart',
      name: 'iHeartRadio',
      letter: 'i',
      color: '#dc2626',
      hint: 'Request listing through the iHeart podcast submission form.',
      submitUrl: 'https://www.iheart.com/content/submit-your-podcast/',
      subscribeScheme: null
    },
    {
      id: 'castbox',
      name: 'Castbox',
      letter: 'C',
      color: '#f59e0b',
      hint: 'Claim and submit your show in Castbox Creator Studio.',
      submitUrl: 'https://podcaster.castbox.fm/',
      subscribeScheme: null
    },
    {
      id: 'deezer',
      name: 'Deezer',
      letter: 'D',
      color: '#8b5cf6',
      hint: 'Submit your RSS feed in Deezer for Creators.',
      submitUrl: 'https://podcasters.deezer.com/',
      subscribeScheme: null
    },
    {
      id: 'tunein',
      name: 'TuneIn',
      letter: 'T',
      color: '#14b8a6',
      hint: 'Request your show in the TuneIn directory.',
      submitUrl: 'https://help.tunein.com/contact/add-podcast-S19TR3Sdf',
      subscribeScheme: null
    },
    {
      id: 'anypod',
      name: 'Anypod Player',
      letter: 'a',
      color: '#6bc4a6',
      hint: 'Listeners can add your feed to Anypod with talk and music skipping built in.',
      submitUrl: null,
      subscribeScheme: function (feed, origin) { return origin + '/?add=' + encodeURIComponent(feed); }
    }
  ];

  const shareTargets = [
    {
      id: 'x',
      name: 'X',
      url: function (link, text) { return 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text); }
    },
    {
      id: 'facebook',
      name: 'Facebook',
      url: function (link) { return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link); }
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      url: function (link) { return 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(link); }
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      url: function (link, text) { return 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + link); }
    },
    {
      id: 'telegram',
      name: 'Telegram',
      url: function (link, text) { return 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text); }
    },
    {
      id: 'reddit',
      name: 'Reddit',
      url: function (link, text) { return 'https://www.reddit.com/submit?url=' + encodeURIComponent(link) + '&title=' + encodeURIComponent(text); }
    },
    {
      id: 'mastodon',
      name: 'Mastodon',
      url: function (link, text) { return 'https://mastodonshare.com/?text=' + encodeURIComponent(text + ' ' + link); }
    },
    {
      id: 'email',
      name: 'Email',
      url: function (link, text) { return 'mailto:?subject=' + encodeURIComponent(text) + '&body=' + encodeURIComponent(link); }
    }
  ];

  window.StudioDirectories = { directories, shareTargets };
})();
