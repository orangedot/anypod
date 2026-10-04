# Exporting YouTube Music & YouTube Playlists to Anypod

This guide explains how to export your **Liked Music** and custom playlists from **YouTube Music** so you can stream them directly inside [Anypod](https://anypod.org) without ads, algorithms, or account walls.

---

## Why is an export needed for Liked Music?

YouTube Music keeps your **"Liked Music"** in a private, account-bound auto-playlist (`list=LM`). Because it is protected by your personal Google login cookies, external podcast players and RSS fetchers cannot read it directly.

By transferring your Liked Songs into an **Unlisted** YouTube Playlist:
- Only people with the link (you and your Anypod app) can access it.
- Anypod can fetch the audio metadata, track progress, support background/lockscreen controls, and cache the playlist as your private feed.

---

## Method 1: Automated Browser Console Script (Recommended for 100+ songs)

YouTube Music uses **virtualized scrolling** (only the songs currently visible on screen are loaded in the DOM). The following script automatically scrolls through your entire playlist and selects all songs using YouTube Music's selection system.

### Steps:

1. Open your **Liked Music** playlist on desktop:  
   👉 [https://music.youtube.com/playlist?list=LM](https://music.youtube.com/playlist?list=LM)
2. Open your browser's Developer Tools Console:
   - **Mac:** Press `Cmd` + `Option` + `J`
   - **Windows / Linux:** Press `Ctrl` + `Shift` + `J` (or `F12` and click the **Console** tab)
3. Copy and paste the script below into the Console and press **Enter**:

```javascript
(async () => {
  console.log("🚀 Starting auto-scroll and selecting tracks...");

  const triggerClick = (el) => {
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
      el.dispatchEvent(new MouseEvent(evt, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      }));
    });
  };

  let totalChecked = 0;
  let stagnantCount = 0;

  while (stagnantCount < 6) {
    const rows = document.querySelectorAll('ytmusic-responsive-list-item-renderer');
    let newlyChecked = 0;

    for (const row of rows) {
      const cb = row.querySelector('yt-checkbox-renderer');
      const isAlreadyChecked = cb?.getAttribute('aria-checked') === 'true' || row.hasAttribute('selected');

      if (!isAlreadyChecked) {
        // Target overlay layer or checkbox
        const target = row.querySelector('.multi-select-overlay') || cb;
        if (target) {
          triggerClick(target);
          newlyChecked++;
          totalChecked++;
        }
      }
    }

    const prevY = window.scrollY;
    // Scroll down to reveal the next batch of virtualized items
    window.scrollBy(0, 800);
    await new Promise(r => setTimeout(r, 600));

    const newY = window.scrollY;

    if (newlyChecked === 0 && prevY === newY) {
      stagnantCount++;
    } else {
      stagnantCount = 0;
      if (newlyChecked > 0) {
        console.log(`Checked ${totalChecked} tracks so far...`);
      }
    }
  }

  console.log(`🎉 Finished! Selected ${totalChecked} tracks total.`);
  console.log("👉 Now click 'Add to playlist' in the floating bar at the bottom!");
})();
```

4. When the script logs `🎉 Finished!`, look at the floating action bar at the bottom of the screen.
5. Click **Add to playlist** ➔ **New playlist**.
6. Give it a title (e.g. `My Liked Songs`) and set privacy to **Unlisted** (or Public).
7. Click **Create**.
8. Click **View playlist** and copy the browser URL (e.g. `https://music.youtube.com/playlist?list=PL...`).

---

## Method 2: Manual Shift-Click Selection (No Script Required)

If you prefer not to run a script, you can use YouTube Music's built-in range selection:

1. Open [https://music.youtube.com/playlist?list=LM](https://music.youtube.com/playlist?list=LM).
2. Hover over the **first song** and click its checkbox.
3. Scroll all the way to the bottom of the playlist (hold `Page Down` or `End` key until the end loads).
4. Hold the **`Shift`** key on your keyboard and click the checkbox on the **last song**.
5. YouTube Music will select all tracks in between.
6. Click **Add to playlist** ➔ **New playlist** ➔ set to **Unlisted** ➔ Save.
7. Copy the new playlist URL.

---

## Adding Your Playlist to Anypod

Once you have your playlist link:

1. Open [Anypod](https://anypod.org).
2. Paste the playlist URL into the top search bar (or click **+ Add Feed**).
3. Anypod will recognize it as a YouTube Playlist and load your episodes with artwork, durations, and playback controls.
4. Click **+ Follow Podcast** to save it to your library.

### Large Playlists (100+ tracks):
- YouTube serves the first **100 tracks** immediately in the initial load.
- If your playlist has more than 100 tracks (e.g., 500 or 900+), Anypod automatically streams the remaining tracks in the background while you listen.
- Your progress and playback positions are synced and saved locally and to your optional private cloud account.
