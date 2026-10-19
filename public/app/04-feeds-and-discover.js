'use strict';

// ─────────────────────────────────────────────────────────────────────────
// SECTION 14 · Feed Fetching
// refreshAllFeeds — fetches all subscribed feeds in parallel via
//   Promise.allSettled, merges results into state.allEpisodes.
// fetchSingleFeed — fetches /api/feed?url=… and updates metadata map.
// renderSkeletonTimeline — placeholder cards shown during first load.
// ─────────────────────────────────────────────────────────────────────────

function renderSkeletonTimeline() {
  const container = elements.timelineList;
  if (!container) return;
  let html = '';
  for (let i = 0; i < 4; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton-art"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line" style="width: 35%;"></div>
          <div class="skeleton-line" style="width: 80%;"></div>
          <div class="skeleton-line" style="width: 60%;"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

async function refreshAllFeeds() {
  if (state.feeds.length === 0) {
    state.allEpisodes = [];
    state.filteredEpisodes = [];
    state.feedMetadata = {};
    saveCacheToStorage();
    updateFeedCountUI();
    renderContinueShelf();
    renderTimeline(true);
    renderFeedsGrid();
    return;
  }

  if (state.allEpisodes.length === 0) {
    renderSkeletonTimeline();
  }

  const totalFeeds = state.feeds.length;
  let completedFeeds = 0;
  let newEpisodesCount = 0;
  let activeFeedTitle = '';

  // Track existing guids to detect newly discovered episodes
  const existingGuids = new Set(state.allEpisodes.map(e => e.guid).filter(Boolean));
  const allKnownGuids = new Set(existingGuids);

  const updateStatusText = () => {
    let text = `Updating feeds (${completedFeeds}/${totalFeeds})`;
    if (activeFeedTitle) {
      text += ` · ${activeFeedTitle}`;
    }
    if (newEpisodesCount > 0) {
      text += ` · ${newEpisodesCount} new episode${newEpisodesCount === 1 ? '' : 's'}`;
    }
    const pct = totalFeeds > 0 ? (completedFeeds / totalFeeds) * 100 : 0;
    showStatus(text, pct);
  };

  updateStatusText();

  const incomingEpisodes = [];
  const updatedMetadata = { ...state.feedMetadata };

  // Throttled UI updater for smooth, non-blocking rendering as feeds complete
  let renderTimer = null;
  let pendingUiUpdate = false;
  const scheduleProgressiveRender = () => {
    pendingUiUpdate = true;
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      if (pendingUiUpdate) {
        pendingUiUpdate = false;
        processAndSortEpisodes();
        renderTimeline(true);
        renderFeedsGrid();
        updateFeedCountUI();
      }
    }, 400);
  };

  // Process feeds in bounded concurrent chunks (max 5 in-flight)
  // to avoid overloading Cloudflare Workers subrequest limits and causing 503s.
  const CONCURRENCY = 5;
  const queue = [...state.feeds];
  const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(0).map(async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (url) {
        const feedMeta = state.feedMetadata[url];
        activeFeedTitle = feedMeta?.title || '';
        updateStatusText();

        const result = await fetchSingleFeed(url, incomingEpisodes, updatedMetadata);
        completedFeeds++;

        if (result && Array.isArray(result.episodes) && result.episodes.length > 0) {
          let foundNewForThisFeed = 0;
          const newBatch = [];
          result.episodes.forEach(ep => {
            if (ep && ep.guid && !allKnownGuids.has(ep.guid)) {
              allKnownGuids.add(ep.guid);
              foundNewForThisFeed++;
              newBatch.push(ep);
            }
          });

          if (foundNewForThisFeed > 0) {
            newEpisodesCount += foundNewForThisFeed;
            state.allEpisodes = [...newBatch, ...state.allEpisodes];
            state.feedMetadata = { ...state.feedMetadata, ...updatedMetadata };
            scheduleProgressiveRender();
          }
        }

        updateStatusText();
      }
    }
  });

  await Promise.all(workers);

  // Cancel any pending throttled render
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }

  // Final merge and deduplication
  if (incomingEpisodes.length > 0) {
    const epMap = new Map();
    incomingEpisodes.forEach(ep => {
      if (ep && ep.guid) epMap.set(ep.guid, ep);
    });
    state.allEpisodes.forEach(ep => {
      if (ep && ep.guid && !epMap.has(ep.guid) && state.feeds.includes(ep.feedUrl)) {
        epMap.set(ep.guid, ep);
      }
    });
    state.allEpisodes = Array.from(epMap.values());
    state.feedMetadata = updatedMetadata;
    saveCacheToStorage();
  }

  processAndSortEpisodes();
  renderTimeline(true);
  renderFeedsGrid();
  updateFeedCountUI();

  // Clean summary without icons: "Updated 81 feeds · 8 new episodes"
  let finalSummary = `Updated ${totalFeeds} feed${totalFeeds === 1 ? '' : 's'}`;
  if (newEpisodesCount > 0) {
    finalSummary += ` · ${newEpisodesCount} new episode${newEpisodesCount === 1 ? '' : 's'}`;
  }
  showStatus(finalSummary);
  setTimeout(hideStatus, 3200);
}

async function fetchSingleFeed(url, incomingEpisodes, updatedMetadata) {
  try {
    const apiUrl = `/api/feed?url=${encodeURIComponent(url)}`;
    const headers = {};
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;

    let response = await fetch(apiUrl, { headers });

    // Retry up to 3 times with exponential backoff if Cloudflare returns 503/524/429
    let retryCount = 0;
    while ((response.status === 503 || response.status === 524 || response.status === 429) && retryCount < 3) {
      retryCount++;
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 6000);
      console.warn(`[Feed Fetch] Got HTTP ${response.status} for ${url}, retrying in ${backoffMs}ms (attempt ${retryCount}/3)...`);
      await new Promise(r => setTimeout(r, backoffMs));
      response = await fetch(apiUrl, { headers });
    }

    if (response.status === 401) {
      throw new Error('Unauthorized');
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const feedData = await response.json();
    if (feedData.error) {
      if (!updatedMetadata[url]) {
        updatedMetadata[url] = {
          title: feedData.title || 'Unavailable Feed',
          artwork: '',
          episodesCount: 0,
          error: feedData.error
        };
      }
      return null;
    }

    // Check if this playlist is already fully cached locally
    const currentFeedEps = state.allEpisodes ? state.allEpisodes.filter(e => e.feedUrl === url) : [];
    const expectedTotal = feedData.episodesCount || 0;
    const isAlreadyFullySynced = expectedTotal > 0 && currentFeedEps.length >= expectedTotal;

    // Trigger progressive background pagination for YouTube playlists ONLY if older episodes are actually missing
    if (feedData.isYouTubePlaylist && feedData.playlistId && !isAlreadyFullySynced) {
      startYouTubeBackgroundPaging(feedData.playlistId, url, feedData.nextToken || null);
    }

    updatedMetadata[url] = {
      title: feedData.title,
      artwork: feedData.artwork,
      episodesCount: feedData.episodesCount,
      description: feedData.description,
      isYouTubePlaylist: feedData.isYouTubePlaylist || false,
      playlistId: feedData.playlistId || null,
      nextToken: feedData.nextToken || null
    };

    if (Array.isArray(feedData.episodes)) {
      incomingEpisodes.push(...feedData.episodes);
    }

    return feedData;
  } catch (err) {
    if (!updatedMetadata[url]) {
      updatedMetadata[url] = state.feedMetadata[url]
        ? { ...state.feedMetadata[url], error: err.message }
        : {
            title: 'Error Loading Feed',
            artwork: '',
            episodesCount: 0,
            error: err.message
          };
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 15 · Filtering, Sorting & Time Utilities
// processAndSortEpisodes — applies search query + filterMode + sortOrder
//   to produce state.filteredEpisodes.
// filterMode values: 'unplayed' | 'continue' | 'played' | 'downloaded' | 'all'
// Utility formatters: parseDurationSeconds, formatCompactDate,
//   formatDurationCompact, formatHumanRelativeDate, formatEpisodeDuration.
// ─────────────────────────────────────────────────────────────────────────

function updateFilterBadges() {
  const currentGuid = state.currentEpisode ? state.currentEpisode.guid : null;
  if (elements.continueCount) {
    const inProgressCount = state.allEpisodes.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      const isCurrent = currentGuid && ep.guid === currentGuid;
      return (!pos || !pos.completed) && (isCurrent || (pos && pos.position > 2));
    }).length;
    elements.continueCount.textContent = inProgressCount;
  }
  if (elements.playedCount) {
    const playedCount = state.allEpisodes.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      return pos && (pos.completed === 1 || pos.completed === true);
    }).length;
    elements.playedCount.textContent = playedCount;
  }
  if (elements.downloadedCount) {
    const dlCount = Object.keys(state.downloadedEpisodes || {}).length;
    elements.downloadedCount.textContent = dlCount;
  }
}

const parseDurationSeconds = window.AnypodShared.parseDurationSeconds;
const formatCompactDate = window.AnypodShared.formatCompactDate;
const formatDurationCompact = window.AnypodShared.formatDurationCompact;
const formatHumanRelativeDate = window.AnypodShared.formatHumanRelativeDate;
const formatEpisodeDuration = window.AnypodShared.formatEpisodeDuration;

function processAndSortEpisodes() {
  //console.log('[Anypod Debug] processAndSortEpisodes running. FilterMode:', state.filterMode);
  let list = [...state.allEpisodes];

  if (!state.searchQuery && state.mutedFeeds && state.mutedFeeds.length > 0) {
    list = list.filter(ep => !state.mutedFeeds.includes(ep.feedUrl));
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter(ep => {
      const fullDesc = (ep.content || ep.description || '').toLowerCase();
      const title = (ep.title || '').toLowerCase();
      const podTitle = (ep.podcastTitle || '').toLowerCase();
      const feedUrl = (ep.feedUrl || '').toLowerCase();
      const author = (ep.author || (state.feedMetadata[ep.feedUrl]?.author) || '').toLowerCase();

      // In-depth search: all terms must match across any of the fields
      return terms.every(term => 
        title.includes(term) ||
        podTitle.includes(term) ||
        fullDesc.includes(term) ||
        author.includes(term) ||
        feedUrl.includes(term)
      );
    });
  }

  const currentGuid = state.currentEpisode ? state.currentEpisode.guid : null;

  if (state.filterMode === 'continue') {
    list = list.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      const isCurrent = currentGuid && ep.guid === currentGuid;
      return (!pos || !pos.completed) && (isCurrent || (pos && pos.position > 2));
    });
    if (currentGuid) {
      const curIdx = list.findIndex(e => e.guid === currentGuid);
      if (curIdx > 0) {
        const cur = list.splice(curIdx, 1)[0];
        list.unshift(cur);
      }
    }
  } else if (state.filterMode === 'unplayed') {
    list = list.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      const isCurrent = currentGuid && ep.guid === currentGuid;
      // Keep episode in unplayed list if it's currently active or unplayed
      if (isCurrent) return true;
      // Keep active episode in list so it doesn't vanish on click
      return !pos || (!pos.completed);
    });
  } else if (state.filterMode === 'played') {
    list = list.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      return pos && (pos.completed === 1 || pos.completed === true);
    });
  } else if (state.filterMode === 'downloaded') {
    list = list.filter(ep => !!state.downloadedEpisodes[ep.guid]);
  }

  if (state.filterMode === 'continue') {
    list.sort((a, b) => {
      const posA = state.playbackPositions[a.guid];
      const posB = state.playbackPositions[b.guid];
      const timeA = (posA && posA.lastListenedAt) || (a.timestamp ? a.timestamp / 1000 : 0);
      const timeB = (posB && posB.lastListenedAt) || (b.timestamp ? b.timestamp / 1000 : 0);
      return timeB - timeA;
    });
    if (currentGuid) {
      const curIdx = list.findIndex(e => e.guid === currentGuid);
      if (curIdx > 0) {
        const cur = list.splice(curIdx, 1)[0];
        list.unshift(cur);
      }
    }
  } else if (state.sortOrder === 'newest') {
    list.sort((a, b) => b.timestamp - a.timestamp);
  } else if (state.sortOrder === 'oldest') {
    list.sort((a, b) => a.timestamp - b.timestamp);
  } else if (state.sortOrder === 'title-asc') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (state.sortOrder === 'title-desc') {
    list.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
  } else if (state.sortOrder === 'podcast-asc') {
    list.sort((a, b) => {
      const comp = (a.podcastTitle || '').localeCompare(b.podcastTitle || '');
      return comp !== 0 ? comp : b.timestamp - a.timestamp;
    });
  } else if (state.sortOrder === 'duration-asc') {
    list.sort((a, b) => parseDurationSeconds(a.duration) - parseDurationSeconds(b.duration));
  } else if (state.sortOrder === 'duration-desc') {
    list.sort((a, b) => parseDurationSeconds(b.duration) - parseDurationSeconds(a.duration));
  }

  state.filteredEpisodes = list;
  state.timelinePage = 1;
  updateFilterBadges();
  renderContinueShelf();
}

const DIR_PAGE_SIZE = 12;

const SUBGENRE_MAP = {
  'Science': [
    { label: 'General Science', query: 'Science Nature Research' },
    { label: 'Daily Science News', query: 'Daily Science Discovery News' },
    { label: 'Scientific Breakthroughs', query: 'Scientific Breakthroughs Frontiers' },
    { label: 'Deep Dive Science', query: 'Radiolab Science Vs Explained' },
    { label: 'Skepticism & Critical Thinking', query: 'Skeptics Guide Science Critical Thinking' },
    { label: 'Citizen & Open Science', query: 'Open Science Citizen Science' },
    { label: 'Laboratory & Methods', query: 'Laboratory Scientific Method Experiments' },
    { label: 'Science Communication', query: 'Science Communication Scicomm' },
    { label: 'Space & Earth Studies', query: 'Earth Space Science Discovery' },
    { label: 'Evolution & Origins', query: 'Evolution Origin of Life Science' },
    { label: 'Cutting-Edge Tech', query: 'Emerging Technology Science Trends' },
    { label: 'Women in STEM', query: 'Women in Science STEM Research' },
    { label: 'Science Journalism', query: 'Science Journalism Investigation' },
    { label: 'Nobel & Discoveries', query: 'Nobel Prize Science Discoveries' },
    { label: 'Science History & Society', query: 'Science Society Culture Future' }
  ],
  'Climate': [
    { label: 'Climate Science', query: 'Climate Science Global Warming Research' },
    { label: 'Climate Solutions', query: 'Climate Solutions Drawdown Carbon' },
    { label: 'Global Policy & COP', query: 'Climate Policy IPCC UN COP' },
    { label: 'Carbon Removal & Capture', query: 'Carbon Capture Removal Climate' },
    { label: 'Extreme Weather & Planet', query: 'Extreme Weather Climate Impacts' },
    { label: 'Climate Economics', query: 'Climate Economics Green Finance' },
    { label: 'Degrowth & Regeneration', query: 'Regenerative Climate Sustainability' },
    { label: 'Climate Justice', query: 'Climate Justice Frontline Communities' },
    { label: 'Urban Resilience', query: 'Climate Resilient Cities Urban Design' },
    { label: 'Cryosphere & Ice', query: 'Arctic Antarctic Glaciers Ice Melt' },
    { label: 'Decarbonization', query: 'Decarbonization Net Zero Transition' },
    { label: 'Climate Culture & Fiction', query: 'Climate Culture Storytelling Cli-Fi' },
    { label: 'Youth & Activism', query: 'Climate Activism Fridays Future Movement' },
    { label: 'Circular Economy', query: 'Circular Economy Waste Reduction Climate' },
    { label: 'Renewable Transition', query: 'Clean Transition Climate Action' }
  ],
  'Earth Nature': [
    { label: 'Biodiversity & Wildlife', query: 'Biodiversity Wildlife Animals Conservation' },
    { label: 'Geology & Earth Science', query: 'Geology Rocks Volcanoes Earthquakes' },
    { label: 'Soil & Mycelium', query: 'Soil Biology Fungi Mycelium Earth' },
    { label: 'Rainforests & Jungles', query: 'Rainforest Amazon Tropical Ecology' },
    { label: 'Mountains & Canyons', query: 'Mountains Alpine Ecology Geology' },
    { label: 'Deserts & Arid Lands', query: 'Desert Ecology Arid Landscapes Nature' },
    { label: 'Rivers & Freshwaters', query: 'Rivers Freshwater Ecology Wetlands' },
    { label: 'Wilderness & Rewilding', query: 'Rewilding Wilderness Restoration Nature' },
    { label: 'National Parks', query: 'National Parks Nature Preservation' },
    { label: 'Botany & Plant Life', query: 'Botany Plant Ecology Flora Nature' },
    { label: 'Birdwatching & Ornithology', query: 'Ornithology Birdwatching Birds Nature' },
    { label: 'Insect World', query: 'Entomology Insects Pollinators Bees' },
    { label: 'Caves & Subterranean', query: 'Speleology Caves Subterranean Earth' },
    { label: 'Islands & Endemism', query: 'Island Biogeography Endemic Wildlife' },
    { label: 'Earth System & Gaia', query: 'Earth System Science Biosphere Gaia' }
  ],
  'Space Astronomy': [
    { label: 'Astrophysics & Cosmos', query: 'Astrophysics Cosmos Universe Space' },
    { label: 'NASA Missions', query: 'NASA Space Exploration Missions' },
    { label: 'ESA & Global Agencies', query: 'European Space Agency Space Missions' },
    { label: 'James Webb & Telescopes', query: 'James Webb Hubble Space Telescope Astronomy' },
    { label: 'Solar System & Planets', query: 'Solar System Mars Jupiter Moon Planets' },
    { label: 'Exoplanets & Worlds', query: 'Exoplanets Habitable Zones Astronomy' },
    { label: 'Black Holes & Spacetime', query: 'Black Holes Gravitational Waves Spacetime' },
    { label: 'Commercial Spaceflight', query: 'SpaceX Rocket Launch Space Exploration' },
    { label: 'SETI & Astrobiology', query: 'SETI Astrobiology Alien Life Cosmos' },
    { label: 'Lunar Missions & Artemis', query: 'Artemis Moon Landing Lunar Base' },
    { label: 'Mars Colonization', query: 'Mars Rover Exploration Colony' },
    { label: 'The Sun & Space Weather', query: 'Solar Physics Space Weather Sun Flares' },
    { label: 'Stargazing & Night Sky', query: 'Stargazing Night Sky Constellations Astronomy' },
    { label: 'Dark Matter & Energy', query: 'Dark Matter Dark Energy Big Bang' },
    { label: 'Deep Space Telescopes', query: 'Radio Astronomy Deep Space Interferometry' }
  ],
  'Oceans Marine': [
    { label: 'Marine Biology', query: 'Marine Biology Ocean Sea Creatures' },
    { label: 'Deep Sea Exploration', query: 'Deep Sea Ocean Abyss Exploration Trench' },
    { label: 'Coral Reefs & Ecology', query: 'Coral Reefs Marine Conservation Ocean' },
    { label: 'Whales & Cetaceans', query: 'Whales Dolphins Marine Mammals Ocean' },
    { label: 'Sharks & Apex Predators', query: 'Sharks Marine Apex Predators Ocean' },
    { label: 'Ocean Currents & AMOC', query: 'Ocean Currents Atlantic AMOC Climate' },
    { label: 'Coastal & Mangrove Seas', query: 'Mangroves Coastal Wetlands Ocean Ecology' },
    { label: 'Plastic Pollution', query: 'Ocean Plastics Marine Debris Cleanup' },
    { label: 'Sustainable Fisheries', query: 'Sustainable Fisheries Overfishing Ocean' },
    { label: 'Bioluminescence & Abyssal', query: 'Bioluminescence Abyssal Creatures Deep Sea' },
    { label: 'Underwater Archaeology', query: 'Shipwrecks Marine Archaeology Submerged Cities' },
    { label: 'Scientific Diving', query: 'Scientific Diving Ocean Expedition Marine' },
    { label: 'Kelp Forests', query: 'Kelp Forests Sea Otters Marine Ecosystems' },
    { label: 'Polar Oceans & Sea Ice', query: 'Arctic Ocean Antarctic Marine Life Sea Ice' },
    { label: 'Submersibles & Ocean Tech', query: 'Submersibles Ocean Exploration ROV AUV' }
  ],
  'Physics Quantum': [
    { label: 'Quantum Mechanics', query: 'Quantum Mechanics Quantum Physics Science' },
    { label: 'Quantum Computing', query: 'Quantum Computing Qubits Quantum Tech' },
    { label: 'Particle Physics & CERN', query: 'CERN Particle Physics Large Hadron Collider' },
    { label: 'General Relativity', query: 'Einstein General Relativity Gravitation Physics' },
    { label: 'String Theory & Multiverse', query: 'String Theory Theoretical Physics Multiverse' },
    { label: 'Thermodynamics & Entropy', query: 'Thermodynamics Entropy Arrow of Time Physics' },
    { label: 'Lasers & Optics', query: 'Optics Photonics Laser Physics Light' },
    { label: 'Nuclear Physics', query: 'Nuclear Physics Fusion Fission Energy' },
    { label: 'Condensed Matter', query: 'Condensed Matter Superconductivity Materials' },
    { label: 'Acoustics & Waves', query: 'Acoustics Sound Physics Wave Theory' },
    { label: 'Quantum Entanglement', query: 'Quantum Entanglement Information Paradox' },
    { label: 'Standard Model & Higgs', query: 'Standard Model Higgs Boson Particles' },
    { label: 'Plasma & Fusion Physics', query: 'Plasma Physics Tokamak Nuclear Fusion' },
    { label: 'Biophysics', query: 'Biophysics Molecular Mechanics Physics of Life' },
    { label: 'Mathematical Physics', query: 'Mathematical Physics Symmetries Field Theory' }
  ],
  'Neuroscience Mind': [
    { label: 'Neuroplasticity & Memory', query: 'Neuroplasticity Brain Learning Memory' },
    { label: 'Consciousness & Qualia', query: 'Consciousness Philosophy of Mind Neuroscience' },
    { label: 'Cognitive Science', query: 'Cognitive Science Psychology Neuroscience' },
    { label: 'Neurons & Synapses', query: 'Neurobiology Neurons Synaptic Transmission' },
    { label: 'Brain-Computer Interfaces', query: 'Brain Computer Interface Neuralink Neurotech' },
    { label: 'Sleep & Dreams', query: 'Sleep Science Dreams Circadian Rhythm Neuro' },
    { label: 'Neurochemistry & Dopamine', query: 'Neurochemistry Dopamine Serotonin Brain' },
    { label: 'Memory & Recall', query: 'Memory Formation Recall Neuroscience' },
    { label: 'Emotions & Limbic System', query: 'Affective Neuroscience Emotion Brain Limbic' },
    { label: 'Sensory Perception', query: 'Sensory Perception Vision Auditory Neuroscience' },
    { label: 'Neurodegenerative Research', query: 'Alzheimers Parkinsons Brain Disease Research' },
    { label: 'Psychedelics & Brain', query: 'Psychedelic Science Neuroscience Therapy' },
    { label: 'Attention & Focus', query: 'Attention Focus ADHD Neuroscience Executive Function' },
    { label: 'Neuroethics', query: 'Neuroethics Free Will Moral Neuroscience' },
    { label: 'Animal Intelligence', query: 'Animal Intelligence Comparative Cognition Neuro' }
  ],
  'Biology Genetics': [
    { label: 'CRISPR & Gene Editing', query: 'CRISPR Gene Editing Genetic Engineering' },
    { label: 'Evolutionary Biology', query: 'Evolutionary Biology Natural Selection Genetics' },
    { label: 'Epigenetics', query: 'Epigenetics Gene Expression DNA Methylation' },
    { label: 'Synthetic Biology', query: 'Synthetic Biology Bioengineering DNA Design' },
    { label: 'Gut Microbiome & Microbes', query: 'Microbiome Gut Bacteria Microbes Biology' },
    { label: 'Genomics & DNA Sequencing', query: 'Human Genome Project Genomics DNA Sequencing' },
    { label: 'Cell Biology & Organelles', query: 'Cell Biology Organelles Mitosis Ribosomes' },
    { label: 'Immunology & Antibodies', query: 'Immunology Immune System White Blood Cells' },
    { label: 'Virology & Epidemics', query: 'Virology Viruses Epidemics Infectious Disease' },
    { label: 'Developmental Biology', query: 'Developmental Biology Embryology Morphogenesis' },
    { label: 'Plant Genetics & Crops', query: 'Plant Genetics GMO Photosynthesis Crop Biology' },
    { label: 'Rare Diseases & Precision Med', query: 'Rare Genetic Diseases Genomics Precision Medicine' },
    { label: 'Longevity & Cellular Aging', query: 'Telomeres Cellular Senescence Aging Biology' },
    { label: 'Extremophiles & Origins', query: 'Extremophiles Origin of Life Astrobiology' },
    { label: 'Structural Biology', query: 'Structural Biology Protein Folding Molecular Biology' }
  ],
  'Clean Energy': [
    { label: 'Solar & Photovoltaics', query: 'Solar Energy Photovoltaics Solar Power Clean Tech' },
    { label: 'Wind Energy', query: 'Wind Turbines Offshore Wind Renewable Energy' },
    { label: 'Battery Tech & Storage', query: 'Battery Technology Grid Storage Lithium Ion Solid State' },
    { label: 'Green Hydrogen', query: 'Hydrogen Fuel Cells Green Hydrogen Energy' },
    { label: 'Smart Grids & Transmission', query: 'Smart Grid Energy Transmission High Voltage' },
    { label: 'Geothermal Energy', query: 'Geothermal Energy Deep Geothermal Heat' },
    { label: 'Nuclear Fusion Power', query: 'Nuclear Fusion Clean Power Clean Energy' },
    { label: 'Electric Mobility & EVs', query: 'Electric Vehicles EV Charging Transport Transition' },
    { label: 'Heat Pumps & Efficiency', query: 'Heat Pumps Building Decarbonization Efficiency' },
    { label: 'Carbon Capture & Storage', query: 'Carbon Capture Sequestration Direct Air Capture' },
    { label: 'Hydro & Tidal Power', query: 'Hydropower Ocean Tidal Wave Energy' },
    { label: 'Biofuels & SAF', query: 'Sustainable Aviation Fuel Biofuels Clean Energy' },
    { label: 'Green Steel & Industry', query: 'Green Steel Cement Clean Industrial Transition' },
    { label: 'Energy Policy & Markets', query: 'Energy Markets Policy Power Grid Clean Energy' },
    { label: 'Microgrids & Decentralized', query: 'Microgrids Decentralized Power Offgrid Solar' }
  ],
  'Ecology Forests': [
    { label: 'Old-Growth & Ancient Trees', query: 'Old Growth Forests Ancient Trees Canopy Ecology' },
    { label: 'Reforestation & Rewilding', query: 'Reforestation Tree Planting Ecosystem Restoration' },
    { label: 'Wildfire Ecology', query: 'Wildfire Ecology Forest Management Pyrogeography' },
    { label: 'Boreal Forests & Taiga', query: 'Boreal Forest Taiga Ecology Carbon Sink' },
    { label: 'Tree Communication & Fungi', query: 'Tree Communication Suzanne Simard Wood Wide Web' },
    { label: 'Urban Forestry', query: 'Urban Forestry Green Canopy City Trees Ecology' },
    { label: 'Mangroves & Blue Carbon', query: 'Mangrove Restoration Blue Carbon Coastal Ecology' },
    { label: 'Deforestation & Conservation', query: 'Deforestation Tropical Rainforest Conservation' },
    { label: 'Agroforestry & Permaculture', query: 'Agroforestry Food Forests Regenerative Forestry' },
    { label: 'Canopy Research', query: 'Forest Canopy Biodiversity Tree Research' },
    { label: 'Indigenous Land Stewardship', query: 'Indigenous Forest Stewardship Traditional Ecological Knowledge' },
    { label: 'Temperate Rainforests', query: 'Temperate Rainforest Pacific Northwest Ecology' },
    { label: 'Mycorrhizal Ecology', query: 'Mycorrhizal Fungi Forest Ecology Mycology' },
    { label: 'Forest Invasive Species', query: 'Forest Pests Invasive Species Tree Diseases' },
    { label: 'Forest Carbon Offsets', query: 'Forest Carbon Offset Sequestration Biomass' }
  ],
  'Weather Atmosphere': [
    { label: 'Meteorology & Forecasting', query: 'Meteorology Weather Forecasting Atmospheric Science' },
    { label: 'Severe Storms & Tornadoes', query: 'Tornadoes Severe Storms Supercells Chasing' },
    { label: 'Hurricanes & Typhoons', query: 'Hurricanes Tropical Cyclones Typhoons Tracking' },
    { label: 'Jet Stream & Polar Vortex', query: 'Jet Stream Polar Vortex Atmosphere Climate' },
    { label: 'Cloud Physics & Rain', query: 'Cloud Microphysics Atmospheric Moisture Rain' },
    { label: 'Lightning & Thunderstorms', query: 'Lightning Atmospheric Electricity Thunderstorms' },
    { label: 'Monsoons & Global Weather', query: 'Monsoon Circulation Global Atmospheric Weather' },
    { label: 'Droughts & Heatwaves', query: 'Heatwaves Drought Atmospheric Blocking Science' },
    { label: 'Air Quality & Aerosols', query: 'Air Quality Particulate Matter Smog Atmospheric Chemistry' },
    { label: 'Stratosphere & Ozone', query: 'Ozone Layer Stratospheric Chemistry Atmosphere' },
    { label: 'Radar & Weather Satellites', query: 'Doppler Radar Weather Satellites Meteorology' },
    { label: 'Urban Microclimates', query: 'Microclimate Urban Heat Island Weather Science' },
    { label: 'El Niño & ENSO Cycles', query: 'El Nino Southern Oscillation ENSO Pacific Weather' },
    { label: 'Blizzards & Winter Storms', query: 'Winter Storms Blizzards Atmospheric Ice Snow' },
    { label: 'Planetary Weather', query: 'Planetary Atmospheres Mars Venus Weather' }
  ],
  'Paleontology Fossils': [
    { label: 'Dinosaurs & Theropods', query: 'Dinosaurs Paleontology T-Rex Sauropods Fossils' },
    { label: 'Mass Extinctions', query: 'Mass Extinctions Permian Cretaceous Asteroid Impact' },
    { label: 'Ice Age & Megafauna', query: 'Ice Age Megafauna Mammoths Paleontology' },
    { label: 'Marine Reptiles', query: 'Plesiosaurs Mosasaurs Ancient Oceans Fossils' },
    { label: 'Human Evolution & Hominins', query: 'Paleoanthropology Neanderthals Hominin Evolution' },
    { label: 'Fossil Hunting & Prep', query: 'Fossil Hunting Dig Sites Paleontology Prep' },
    { label: 'Cambrian Explosion', query: 'Cambrian Explosion Burgess Shale Early Animal Life' },
    { label: 'Paleoart & Reconstruction', query: 'Paleoart Dinosaur Reconstruction Paleontology' },
    { label: 'Paleobotany & Fossil Forests', query: 'Paleobotany Ancient Plants Fossil Trees Carboniferous' },
    { label: 'Amber & Ancient Insects', query: 'Amber Fossils Ancient Insects Prehistoric Resin' },
    { label: 'Feathered Dinosaurs', query: 'Feathered Dinosaurs Evolution of Birds Paleontology' },
    { label: 'Pterosaurs', query: 'Pterosaurs Flying Reptiles Paleontology Fossils' },
    { label: 'Trilobites & Invertebrates', query: 'Trilobites Paleozoic Fossils Invertebrate Paleontology' },
    { label: 'Ancient DNA & De-extinction', query: 'Ancient DNA Paleogenomics Mammoth De-extinction' },
    { label: 'Tar Pits & Quaternary Life', query: 'La Brea Tar Pits Quaternary Paleontology Fossils' }
  ],
  'Medicine Health': [
    { label: 'Immunology & Vaccines', query: 'Immunology Vaccine Development Infectious Disease' },
    { label: 'Cancer Research & Oncology', query: 'Oncology Cancer Research Immunotherapy Genetics' },
    { label: 'Longevity & Healthspan', query: 'Longevity Healthspan Lifespan Peter Attia Huberman' },
    { label: 'Public Health & Pandemics', query: 'Epidemiology Public Health Pandemics Global Health' },
    { label: 'Cardiology & Heart Health', query: 'Cardiology Heart Health Cardiovascular Science' },
    { label: 'Endocrinology & Metabolism', query: 'Endocrinology Hormones Metabolism Health Science' },
    { label: 'Gut Microbiome & Digestion', query: 'Gut Microbiome Gastroenterology Digestive Health' },
    { label: 'Pharmacology & Drugs', query: 'Pharmacology Drug Discovery Clinical Trials Medicine' },
    { label: 'Surgical Robotics & Tech', query: 'Medical Devices Surgical Robotics Health Tech' },
    { label: 'Rare Diseases & Genetics', query: 'Precision Medicine Rare Genetic Disorders Genomics' },
    { label: 'Psychiatry & Mental Health', query: 'Psychiatry Neurobiology Mental Health Science' },
    { label: 'Nutrition & Evidence', query: 'Nutrition Science Micronutrients Diet Health Evidence' },
    { label: 'Infectious Diseases & Superbugs', query: 'Infectious Diseases Antimicrobial Resistance Bacteria' },
    { label: 'Bioethics & Clinical Ethics', query: 'Bioethics Medical Ethics Patient Care Clinical Trials' },
    { label: 'Emergency & Critical Care', query: 'Critical Care Emergency Medicine Trauma Science' }
  ],
  'AI Tech': [
    { label: 'Large Language Models', query: 'Large Language Models LLM AI Deep Learning' },
    { label: 'Machine Learning Research', query: 'Machine Learning Neural Networks AI Research' },
    { label: 'Generative AI & Diffusion', query: 'Generative AI Diffusion Transformers Neural Nets' },
    { label: 'Autonomous AI Agents', query: 'AI Agents Autonomous Systems AI Tools' },
    { label: 'Computer Vision', query: 'Computer Vision Object Detection Image AI' },
    { label: 'Robotics & Embodied AI', query: 'Embodied AI Robotics Boston Dynamics Manipulation' },
    { label: 'AI Safety & Alignment', query: 'AI Safety Alignment Superintelligence Anthropic' },
    { label: 'Natural Language Processing', query: 'Natural Language Processing NLP Linguistics AI' },
    { label: 'AI Hardware & Silicon', query: 'GPU AI Hardware Accelerators Tensor Chips Nvidia' },
    { label: 'Reinforcement Learning', query: 'Reinforcement Learning RLHF AlphaGo DeepMind' },
    { label: 'AI in Science & AlphaFold', query: 'AlphaFold AI in Science Drug Discovery DeepMind' },
    { label: 'AI Ethics & Governance', query: 'AI Ethics Bias Fairness Technology Regulation' },
    { label: 'Open Source AI Models', query: 'Open Source AI Hugging Face Open Models Llama' },
    { label: 'Neuromorphic Computing', query: 'Neuromorphic Computing Spiking Neural Networks AI' },
    { label: 'History of AI & Pioneers', query: 'History of AI Turing Von Neumann Deep Learning' }
  ],
  'History Science': [
    { label: 'Scientific Revolution', query: 'Scientific Revolution Galileo Newton Copernicus History' },
    { label: 'Alchemy to Chemistry', query: 'History of Chemistry Alchemy Boyle Lavoisier' },
    { label: 'Medical History & Pandemics', query: 'History of Medicine Black Death Cholera Penicillin' },
    { label: 'Darwin & Evolution History', query: 'Charles Darwin Evolution Origin of Species History' },
    { label: 'Women Pioneers in STEM', query: 'Ada Lovelace Marie Curie Women in Science History' },
    { label: 'Space Race & Cold War', query: 'Space Race Cold War Apollo Sputnik History' },
    { label: 'Enlightenment & Natural Phil', query: 'Enlightenment Age of Reason Natural Philosophy' },
    { label: 'Islamic Golden Age Science', query: 'Islamic Golden Age Algebra Astronomy Science History' },
    { label: 'Ancient Greek & Roman Science', query: 'Ancient Greek Science Archimedes Aristotle Ptolemy' },
    { label: 'Manhattan Project & Atom', query: 'Manhattan Project Oppenheimer Atomic Age Nuclear History' },
    { label: 'History of Computing', query: 'History of Computing Alan Turing Babbage ENIAC' },
    { label: 'Victorian Naturalists', query: 'Victorian Science Naturalists Humboldt Expeditions' },
    { label: 'Renaissance Anatomy', query: 'Renaissance Science Da Vinci Vesalius Anatomy' },
    { label: 'History of Astronomy', query: 'History of Astronomy Telescopes Kepler Brahe' },
    { label: 'Paradigm Shifts (Kuhn)', query: 'History and Philosophy of Science Paradigm Shifts Kuhn' }
  ],
  'Archaeology Ancient': [
    { label: 'Ancient Egypt & Pyramids', query: 'Ancient Egypt Pyramids Pharaonic Archaeology Tombs' },
    { label: 'Roman Empire & Pompeii', query: 'Roman Archaeology Pompeii Colosseum Antiquity' },
    { label: 'Maya & Mesoamerica', query: 'Maya Archaeology Mesoamerica Aztec Teotihuacan' },
    { label: 'Bronze Age Civilizations', query: 'Bronze Age Minoans Mycenaeans Ancient Near East' },
    { label: 'Mesopotamia & Sumer', query: 'Mesopotamia Sumerian Babylon Cuneiform Archaeology' },
    { label: 'Maritime & Shipwrecks', query: 'Maritime Archaeology Shipwrecks Submerged Ruins' },
    { label: 'Silk Road Discoveries', query: 'Silk Road Archaeology Ancient Trade Routes Asia' },
    { label: 'Paleolithic Cave Art', query: 'Stone Age Paleolithic Cave Art Neanderthal Sites' },
    { label: 'LiDAR & Remote Sensing', query: 'LiDAR Archaeology Satellite Remote Sensing Discovery' },
    { label: 'Archaeogenetics & DNA', query: 'Archaeogenetics Ancient DNA Migration Civilizations' },
    { label: 'Ancient Greece & Aegean', query: 'Ancient Greece Archaeology Parthenon Knossos' },
    { label: 'Indus Valley Harappa', query: 'Indus Valley Harappa Mohenjo-daro Archaeology' },
    { label: 'Incas & Andes Civilizations', query: 'Inca Andes Machu Picchu Archaeology Tiwanaku' },
    { label: 'Viking Age & Runes', query: 'Viking Age Archaeology Norse Settlements Runes' },
    { label: 'Bioarchaeology & Mummies', query: 'Bioarchaeology Mummies Skeletal Analysis Antiquity' }
  ],
  'Math Logic': [
    { label: 'Pure Mathematics', query: 'Pure Mathematics Number Theory Algebra Geometry' },
    { label: 'Prime Numbers & Riemann', query: 'Number Theory Prime Numbers Riemann Hypothesis Math' },
    { label: 'Cryptography & Ciphers', query: 'Cryptography Ciphers Zero Knowledge Proofs Math' },
    { label: 'Topology & Manifolds', query: 'Topology Manifolds Poincaré Geometry Math' },
    { label: 'Probability & Bayes', query: 'Probability Statistics Bayesian Inference Math' },
    { label: 'Gödel & Mathematical Logic', query: 'Mathematical Logic Gödel Incompleteness Proof Theory' },
    { label: 'Game Theory & Strategy', query: 'Game Theory Nash Equilibrium Strategic Math' },
    { label: 'Chaos Theory & Fractals', query: 'Chaos Theory Mandelbrot Fractals Nonlinear Dynamics' },
    { label: 'Applied Mathematics', query: 'Applied Mathematics Fluid Dynamics Differential Equations' },
    { label: 'History of Mathematics', query: 'History of Mathematics Euler Gauss Newton Ramanujan' },
    { label: 'Puzzles & Recreational Math', query: 'Recreational Math Numberphile Puzzles Mathologer' },
    { label: 'Information Theory (Shannon)', query: 'Claude Shannon Information Theory Entropy Math' },
    { label: 'Graph Theory & Networks', query: 'Graph Theory Network Analysis Combinatorics' },
    { label: 'Linear Algebra & Tensors', query: 'Linear Algebra Matrices Vector Spaces Tensors' },
    { label: 'Quantum Information Math', query: 'Quantum Information Theory Quantum Math Linear Algebra' }
  ],
  'Agriculture Food': [
    { label: 'Regenerative Agriculture', query: 'Regenerative Agriculture Soil Health Carbon Farming' },
    { label: 'Food Science & Ferment', query: 'Food Science Fermentation Culinary Chemistry' },
    { label: 'Agtech & Precision Drones', query: 'Precision Agriculture Agtech Drones Satellite Farming' },
    { label: 'Vertical Farming & Hydro', query: 'Vertical Farming Hydroponics Controlled Environment Ag' },
    { label: 'Heirloom Seeds & Diversity', query: 'Heirloom Seeds Seed Saving Crop Diversity Botany' },
    { label: 'Sustainable Aquaculture', query: 'Sustainable Aquaculture Fish Farming Seaweed Ecology' },
    { label: 'Soil Microbiome & Compost', query: 'Soil Biology Compost Soil Health Agriculture' },
    { label: 'Cultivated Meat & Alt Protein', query: 'Cultivated Meat Alternative Protein Food Tech' },
    { label: 'Agroforestry & Food Forests', query: 'Agroforestry Food Forest Permaculture Systems' },
    { label: 'Water & Drip Irrigation', query: 'Agricultural Irrigation Drip Water Conservation Crops' },
    { label: 'Pollinators & Beekeeping', query: 'Pollinators Honeybees Beekeeping Agriculture Botany' },
    { label: 'Food Waste Reduction', query: 'Food Waste Circular Food Systems Sustainable Food' },
    { label: 'Crop Genetics & CRISPR', query: 'Crop Breeding GMO CRISPR Drought Tolerant Plants' },
    { label: 'Future Food Security', query: 'Future of Food Nutrition Security Sustainable Diets' },
    { label: 'Traditional Ecological Farming', query: 'Indigenous Agriculture Traditional Ecological Farming' }
  ],
  'Tech Robotics': [
    { label: 'Humanoid Robots', query: 'Humanoid Robotics Boston Dynamics Bipedal Robots' },
    { label: 'Autonomous Vehicles', query: 'Autonomous Vehicles Self-Driving Cars Waymo Tech' },
    { label: 'Drones & UAVs', query: 'Drones UAV Robotics Autonomous Flight Aerial' },
    { label: 'Industrial Automation', query: 'Industrial Robotics Factory Automation Tech' },
    { label: 'Surgical & Medical Robotics', query: 'Surgical Robotics Medical Devices Da Vinci Tech' },
    { label: 'Soft Robotics & Biomimicry', query: 'Soft Robotics Biomimicry Flexible Materials Actuators' },
    { label: 'Nanorobotics', query: 'Nanorobotics Microbots Targeted Delivery Tech' },
    { label: 'Swarm Robotics', query: 'Swarm Robotics Distributed Collective Intelligence' },
    { label: 'Computer Vision & Sensors', query: 'Robotic Sensors LiDAR Computer Vision Perception' },
    { label: 'Bionics & Cybernetics', query: 'Cybernetics Bionic Prosthetics Human Augmentation' },
    { label: 'Space Robotics & Mars Rovers', query: 'Space Robotics Mars Rovers Robotic Arms Canadarm' },
    { label: 'Agricultural Robotics', query: 'Agricultural Robotics Harvest Robots Weeding Automation' },
    { label: 'Deep Sea ROVs', query: 'Underwater Robotics Deep Sea ROV Exploration' },
    { label: 'Robotics Ethics & Safety', query: 'Robotics Ethics Laws of Robotics Automation Safety' },
    { label: 'ROS & Open Robotics', query: 'Robot Operating System ROS Open Robotics Tech' }
  ],
  'Wildlife Zoology': [
    { label: 'Animal Behavior & Ethology', query: 'Animal Behavior Ethology Jane Goodall Zoology' },
    { label: 'Big Cats & Apex Predators', query: 'Big Cats Lions Tigers Leopards Predators Wildlife' },
    { label: 'Primatology & Apes', query: 'Primatology Chimpanzees Gorillas Orangutans Jane Goodall' },
    { label: 'Elephants & Megafauna', query: 'Elephants Wildlife Conservation African Wildlife' },
    { label: 'Birds of Prey & Raptors', query: 'Raptors Birds of Prey Eagles Hawks Owls Zoology' },
    { label: 'Reptiles & Amphibians', query: 'Herpetology Reptiles Amphibians Snakes Frogs' },
    { label: 'Entomology & Arachnids', query: 'Entomology Arachnology Spiders Insects Biodiversity' },
    { label: 'Animal Communication', query: 'Animal Communication Bioacoustics Animal Vocalization' },
    { label: 'Bird & Animal Migration', query: 'Animal Migration Bird Migration Magnetic Navigation' },
    { label: 'Anti-Poaching & Rangers', query: 'Wildlife Conservation Anti Poaching Rangers Safari' },
    { label: 'Nocturnal Wildlife', query: 'Nocturnal Animals Bats Owls Night Wildlife Ecology' },
    { label: 'Deep Sea Zoology', query: 'Deep Sea Creatures Marine Zoology Abyssal Biology' },
    { label: 'Evolutionary Morphology', query: 'Evolutionary Zoology Adaptation Speciation Morphology' },
    { label: 'Endangered Species Recovery', query: 'Endangered Species Captive Breeding Rewilding' },
    { label: 'Urban Wildlife', query: 'Urban Wildlife Coyotes Raccoons City Animals Ecology' }
  ],
  'Chemistry Materials': [
    { label: 'Nanotechnology & Graphene', query: 'Materials Science Nanotechnology Graphene Metamaterials' },
    { label: 'Organic Chemistry', query: 'Organic Chemistry Chemical Synthesis Molecular Design' },
    { label: 'Battery Chemistry', query: 'Electrochemistry Battery Chemistry Lithium Solid State' },
    { label: 'Green Chemistry', query: 'Green Chemistry Sustainable Solvents Catalysis' },
    { label: 'Bioplastics & Polymers', query: 'Polymers Biodegradable Plastics Materials Chemistry' },
    { label: 'Superconductors', query: 'Superconductivity Room Temperature Superconductors Physics' },
    { label: 'Periodic Table Elements', query: 'Periodic Table Elements Chemistry Compounds' },
    { label: 'Biochemistry & Enzymes', query: 'Biochemistry Enzymes Proteins Metabolic Pathways' },
    { label: 'Catalysis & Reactions', query: 'Catalysis Chemical Reactions Catalysts Chemical Eng' },
    { label: 'Self-Healing Materials', query: 'Smart Materials Self-Healing Shape Memory Alloys' },
    { label: 'Quantum Chemistry', query: 'Quantum Chemistry Molecular Orbitals Computational Chemistry' },
    { label: 'Atmospheric Chemistry', query: 'Atmospheric Chemistry Ozone Aerosols Trace Gases' },
    { label: 'Crystallography', query: 'Crystallography X-Ray Diffraction Crystal Structure' },
    { label: 'Forensic Chemistry', query: 'Forensic Science Forensic Chemistry Mass Spectrometry' },
    { label: 'History of Chemistry', query: 'History of Chemistry Alchemy Elements Lavoisier Mendeleev' }
  ],
  'Philosophy Science': [
    { label: 'Scientific Realism & Method', query: 'Philosophy of Science Scientific Realism Epistemology' },
    { label: 'Epistemology & Knowledge', query: 'Epistemology Knowledge Truth Justified Belief Philosophy' },
    { label: 'Philosophy of Spacetime', query: 'Philosophy of Physics Time Space Spacetime Quantum' },
    { label: 'Philosophy of Biology', query: 'Philosophy of Biology Evolution Organisms Teleology' },
    { label: 'Consciousness & Physicalism', query: 'Philosophy of Mind Consciousness Qualia Dualism Physicalism' },
    { label: 'Tech Ethics & Bioethics', query: 'Ethics of Technology AI Ethics Bioethics Philosophy' },
    { label: 'Causality & Free Will', query: 'Causality Free Will Determinism Chaos Philosophy' },
    { label: 'Paradigm Shifts (Kuhn)', query: 'Thomas Kuhn Paradigms Incommensurability Science' },
    { label: 'Formal Logic & Fallacies', query: 'Formal Logic Deductive Inductive Reasoning Arguments' },
    { label: 'Philosophy of Mathematics', query: 'Philosophy of Mathematics Platonism Constructivism' },
    { label: 'Deep Ecology & Biosphere', query: 'Environmental Ethics Deep Ecology Biosphere Philosophy' },
    { label: 'Social Epistemology', query: 'Social Epistemology Peer Review Scientific Consensus' },
    { label: 'Reductionism & Emergence', query: 'Reductionism Emergence Complexity Complex Systems' },
    { label: 'Can Machines Think (Turing)', query: 'Can Machines Think Turing Test Chinese Room Philosophy' },
    { label: 'Philosophy of Time', query: 'Philosophy of Time Presentism Eternalism Arrow of Time' }
  ],
  'Wissen DE': [
    { label: 'Forschung aktuell (DLF)', query: 'Forschung aktuell Deutschlandfunk Wissen' },
    { label: 'SWR Wissen', query: 'SWR Wissen Wissenschaft Forschung Bildung' },
    { label: 'Terra X Natur & Erde', query: 'Terra X Natur Erde Tiere ZDF' },
    { label: 'WDR Quarks', query: 'WDR Quarks Science Wissenschaft Forschung' },
    { label: 'Sternengeschichten', query: 'Sternengeschichten Astronomie Universum Florian Freistetter' },
    { label: 'Hörsaal (DLF Nova)', query: 'Deutschlandfunk Nova Hörsaal Wissen Vortrag' },
    { label: 'Planet Wissen', query: 'Planet Wissen WDR SWR Natur Mensch Technik' },
    { label: 'Zeit Wissen', query: 'Zeit Wissen Medizin Gesundheit Wissenschaft' },
    { label: 'Spektrum der Wissenschaft', query: 'Spektrum der Wissenschaft Forschungsquadrant Podcast' },
    { label: 'Biologie & Natur (DE)', query: 'Biologie Evolution Tiere Natur Deutschlandfunk' },
    { label: 'Klimawandel & Zukunft (DE)', query: 'Klimawandel Energiewende Deutschlandfunk Klima' },
    { label: 'Welt der Physik (DE)', query: 'Welt der Physik Teilchenbeschleuniger Quanten' },
    { label: 'Archäologie & Antike (DE)', query: 'Archäologie Antike Geschichte Ausgrabungen DE' },
    { label: 'Technik & Zukunft (DE)', query: 'Zukunft Technologie Digitalisierung Wissenschaft DE' },
    { label: 'Psychologie & Hirnforschung', query: 'Psychologie Neurowissenschaft Gehirn Wissen DE' }
  ],
  'Sciences FR': [
    { label: 'La Terre au Carré (Inter)', query: 'La Terre au Carre France Inter Climat' },
    { label: 'CQFD Sciences (RTS)', query: 'CQFD Sciences Recherche Nature RTS' },
    { label: 'Sixième Science', query: 'Sixieme Science 20 Minutes Sciences Avenir' },
    { label: 'La Science CQFD (Culture)', query: 'La Science CQFD France Culture Recherche' },
    { label: 'Chaleur Humaine (Le Monde)', query: 'Chaleur Humaine Le Monde Climat Transition' },
    { label: 'Astronomie & Univers (FR)', query: 'Astronomie Espace Univers Sciences France' },
    { label: 'Océans & Biodiversité (FR)', query: 'Ecologie Oceans Biodiversite Mer Planete FR' },
    { label: 'Physique & Quantique (FR)', query: 'Physique Quantique CEA Recherche Sciences FR' },
    { label: 'Cerveau & Neurosciences (FR)', query: 'Neurosciences Cerveau Psychologie Sciences FR' },
    { label: 'Santé & Médecine (FR)', query: 'Sante Medecine Recherche Medicale France' },
    { label: 'Histoire des Sciences (FR)', query: 'Histoire des Sciences Decouvertes France Culture' },
    { label: 'Archéologie & Préhistoire', query: 'Archeologie Prehistoire Fouilles Histoire FR' },
    { label: 'IA & Nouvelles Tech (FR)', query: 'Intelligence Artificielle Tech Futur Sciences FR' },
    { label: 'Forêts & Botanique (FR)', query: 'Foret Botanique Arbres Nature France' },
    { label: 'Transition & Énergie (FR)', query: 'Transition Energetique Carbone Climat Solutions FR' }
  ],
  'Ciencia ES': [
    { label: 'Coffee Break Señal y Ruido', query: 'Coffee Break Señal y Ruido Ciencia Astrofísica' },
    { label: 'Materia Oscura & Física', query: 'Materia Oscura Ciencia Fisica Universo' },
    { label: 'Planeta Océano', query: 'Planeta Oceano Biologia Marina Mar Conservacion' },
    { label: 'A Hombros de Gigantes (RNE)', query: 'A hombros de gigantes RNE Ciencia Investigacion' },
    { label: 'Astronomía & Cosmos (ES)', query: 'Astronomia Cosmologia Espacio Universo ES' },
    { label: 'Biodiversidad & Fauna (ES)', query: 'Biodiversidad Naturaleza Vida Silvestre Ecologia ES' },
    { label: 'Genética & Células (ES)', query: 'Genetica Biologia Molecular Celulas Ciencia ES' },
    { label: 'Neurociencia & Mente (ES)', query: 'Neurociencia Cerebro Psicologia Investigacion ES' },
    { label: 'Historia de la Ciencia (ES)', query: 'Historia de la Ciencia Descubrimientos Cientificos ES' },
    { label: 'Atapuerca & Evolución (ES)', query: 'Arqueologia Atapuerca Paleontologia Evolucion Humana' },
    { label: 'Transición Ecológica (ES)', query: 'Transicion Ecologica Energia Renovable Clima ES' },
    { label: 'Paleontología & Fósiles (ES)', query: 'Paleontologia Dinosaurios Fosiles Tierra ES' },
    { label: 'IA & Tecnología (ES)', query: 'Inteligencia Artificial Robotica Futuro Ciencia ES' },
    { label: 'Salud & Biomedicina (ES)', query: 'Medicina Investigacion Biomedica Salud Evidencia ES' },
    { label: 'Química & Materiales (ES)', query: 'Quimica Materiales Nanotecnologia Divulgacion ES' }
  ]
};

function renderSubgenreChips(category, container = elements.modalSubgenreChips, onSelect = null) {
  if (!container) return;
  const subgenres = SUBGENRE_MAP[category];
  if (!subgenres || subgenres.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <span class="subgenre-label">Subgenres:</span>
    ${subgenres.map(sub => `
      <button type="button" class="subgenre-chip" data-query="${escapeHtml(sub.query)}" data-label="${escapeHtml(sub.label)}">
        ${escapeHtml(sub.label)}
      </button>
    `).join('')}
  `;

  container.querySelectorAll('.subgenre-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.subgenre-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const q = btn.dataset.query;
      if (typeof onSelect === 'function') {
        onSelect(q, btn.dataset.label);
      } else if (elements.podcastSearchQuery) {
        elements.podcastSearchQuery.value = q;
        searchPodcastDirectory(q);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 16 · Podcast Directory Search
// Queries iTunes Search API, renders results with lazy infinite scroll.
// searchPodcastDirectory — initiates search, sets up scroll listener.
function setDirectoryEnlarged(enlarged) {
  if (!elements.searchDirectoryResults) return;
  if (enlarged) {
    elements.searchDirectoryResults.classList.remove('dir-carousel-view');
    elements.searchDirectoryResults.classList.add('is-enlarged');
    if (elements.btnToggleEnlarge) {
      elements.btnToggleEnlarge.classList.add('active');
      const label = elements.btnToggleEnlarge.querySelector('.enlarge-label');
      if (label) label.textContent = '⤡ collapse to row';
    }
    if (elements.dirStickyCollapseBar) {
      elements.dirStickyCollapseBar.classList.remove('hidden');
    }
  } else {
    elements.searchDirectoryResults.classList.remove('is-enlarged');
    elements.searchDirectoryResults.classList.add('dir-carousel-view');
    if (elements.btnToggleEnlarge) {
      elements.btnToggleEnlarge.classList.remove('active');
      const label = elements.btnToggleEnlarge.querySelector('.enlarge-label');
      if (label) label.textContent = '⤢ enlarge (5 per row)';
    }
    if (elements.dirStickyCollapseBar) {
      elements.dirStickyCollapseBar.classList.add('hidden');
    }
  }
}

async function searchPodcastDirectory(query, targetContainer = null) {
  const q = query.trim();
  const container = targetContainer || elements.searchDirectoryResults;
  if (!container) return;
  if (!q) {
    container._dirSearch = null;
    container.innerHTML = '';
    return;
  }

  container._dirSearch = null;
  container.innerHTML = `
    <div style="padding: 0.75rem 0.25rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem;">
        <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"></circle><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"></path></svg>
        searching podcasts for "${escapeHtml(q)}"...
      </div>
      <div class="skeleton-card" style="margin-bottom: 0.5rem;"><div class="skeleton-art"></div><div class="skeleton-lines"><div class="skeleton-line" style="width: 40%;"></div><div class="skeleton-line" style="width: 70%;"></div></div></div>
      <div class="skeleton-card"><div class="skeleton-art"></div><div class="skeleton-lines"><div class="skeleton-line" style="width: 35%;"></div><div class="skeleton-line" style="width: 60%;"></div></div></div>
    </div>
  `;

  // Smoothly scroll results into view so they are never hidden offscreen
  if (container === elements.searchDirectoryResults && elements.addModal && !elements.addModal.classList.contains('hidden')) {
    const modalBody = elements.addModal.querySelector('.modal-body');
    if (modalBody) {
      modalBody.scrollTo({ top: container.offsetTop - 70, behavior: 'smooth' });
    }
  }

  try {
    const countryParam = (state.directoryCountry && state.directoryCountry !== 'all') ? `&country=${encodeURIComponent(state.directoryCountry)}` : '';
    let data = null;

    // 1. Try first-party API proxy (bypasses client ad-blockers)
    try {
      const proxyRes = await fetch(`/api/search-directory?term=${encodeURIComponent(q)}${countryParam}&limit=50`);
      if (proxyRes.ok) {
        data = await proxyRes.json();
      }
    } catch (_) {}

    // 2. Fallback to direct browser fetch if proxy failed, was rate-limited, or returned 0 results
    if (!data || !data.results || data.results.length === 0 || data.rateLimited) {
      try {
        const directUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast${countryParam}&limit=50`;
        const directRes = await fetch(directUrl);
        if (directRes.ok) {
          data = await directRes.json();
        }
      } catch (_) {}
    }

    const results = (data?.results || []).filter(item => Boolean(item.feedUrl));
    container.innerHTML = '';

    if (results.length === 0) {
      container.innerHTML = `
        <div style="padding: 1.5rem 1rem; text-align: center; color: var(--text-muted); background: rgba(0, 0, 0, 0.03); border: 1px solid var(--border-light); border-radius: var(--radius-sm);">
          <p style="font-weight: 500; color: var(--text-primary); margin-bottom: 0.25rem;">no podcasts found</p>
          <p style="font-size: 0.82rem;">no matching shows found for "${escapeHtml(q)}". try searching a broader term, or paste an rss feed url directly below.</p>
        </div>
      `;
      return;
    }

    if (elements.dirResultsTitle) {
      elements.dirResultsTitle.textContent = `podcasts (${results.length} found)`;
    }

    if (container === elements.searchDirectoryResults) {
      if (!container.classList.contains('is-enlarged')) {
        container.classList.add('dir-carousel-view');
      }
    }

    const listEl = document.createElement('div');
    listEl.className = 'dir-search-list';
    if (container !== elements.searchDirectoryResults) {
      listEl.style.display = 'flex';
      listEl.style.flexDirection = 'column';
      listEl.style.gap = '0.5rem';
    }
    container.appendChild(listEl);

    container._dirSearch = {
      results,
      renderedCount: 0,
      listEl
    };

    renderNextDirectoryBatch(container);

    if (!container._hasDirScroll) {
      container._hasDirScroll = true;
      container.addEventListener('scroll', () => {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 70) {
          renderNextDirectoryBatch(container);
        }
      }, { passive: true });
    }

    if (!listEl._hasHorizontalScroll) {
      listEl._hasHorizontalScroll = true;
      listEl.addEventListener('scroll', () => {
        if (listEl.scrollLeft + listEl.clientWidth >= listEl.scrollWidth - 120) {
          renderNextDirectoryBatch(container);
        }
      }, { passive: true });
    }

    if (elements.addModalBody && !elements.addModalBody._hasDirInfiniteScroll) {
      elements.addModalBody._hasDirInfiniteScroll = true;
      elements.addModalBody.addEventListener('scroll', () => {
        if (container.classList.contains('is-enlarged')) {
          if (elements.addModalBody.scrollTop + elements.addModalBody.clientHeight >= elements.addModalBody.scrollHeight - 200) {
            renderNextDirectoryBatch(container);
          }
        }
      }, { passive: true });
    }
  } catch (e) {
    container.innerHTML = `<p style="color: #fca5a5; padding: 0.5rem;">Error searching directory: ${escapeHtml(e.message)}</p>`;
  }
}

function renderNextDirectoryBatch(container) {
  const s = container._dirSearch;
  if (!s || s.renderedCount >= s.results.length) return;

  const nextBatch = s.results.slice(s.renderedCount, s.renderedCount + DIR_PAGE_SIZE);
  s.renderedCount += nextBatch.length;

  nextBatch.forEach(item => {
    const isSubbed = state.feeds.includes(item.feedUrl);
    const artwork = item.artworkUrl600 || item.artworkUrl100 || FALLBACK_ARTWORK;
    const title = item.collectionName || item.trackName || 'Untitled Podcast';
    const author = item.artistName || '';
    const genre = item.primaryGenreName ? ` • ${item.primaryGenreName}` : '';
    const epCount = item.trackCount ? `${item.trackCount} episodes` : 'Podcast';

    // Look up pre-loaded episodes if available in state
    const allForFeed = (state.allEpisodes || []).filter(e => e.feedUrl === item.feedUrl);
    const recentWidgetHtml = typeof buildRecentEpisodesWidget === 'function' ? buildRecentEpisodesWidget(allForFeed, item.feedUrl) : '';

    const card = document.createElement('div');
    card.className = 'feed-card directory-result-card';
    card.dataset.feed = item.feedUrl;
    card.dataset.title = title;

    card.innerHTML = `
      <div class="feed-header">
        <img class="feed-art" src="${escapeHtml(artwork)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
        <div class="feed-info">
          <h4>${escapeHtml(title)}</h4>
          <p>${escapeHtml(epCount)}${escapeHtml(genre)}</p>
        </div>
        <div class="feed-header-actions">
          <button type="button" class="btn-feed-share" title="Share podcast" aria-label="Share podcast">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
          </button>
          <button type="button" class="btn ${isSubbed ? 'btn-secondary' : 'btn-primary'} btn-sm btn-sub-dir ${isSubbed ? 'subscribed' : ''}" data-feed="${escapeHtml(item.feedUrl)}" data-title="${escapeHtml(title)}" ${isSubbed ? 'disabled' : ''}>
            ${isSubbed ? '✓ followed' : '+ follow'}
          </button>
        </div>
      </div>
      ${author ? `<p class="feed-card-desc">${escapeHtml(author)}</p>` : ''}
      ${recentWidgetHtml}
    `;

    // Clicking anywhere opens feed detail (unless clicking actions/episodes)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-sub-dir') || e.target.closest('.btn-feed-share') || e.target.closest('.recent-ep-row')) return;
      if (!state.feedMetadata[item.feedUrl]) {
        state.feedMetadata[item.feedUrl] = {
          title,
          author,
          artwork
        };
      }
      openFeedDetail(item.feedUrl);
    });

    // Share button handler
    const shareBtn = card.querySelector('.btn-feed-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof shareFeed === 'function') {
          shareFeed(item.feedUrl, title);
        }
      });
    }

    // Follow / subscribe button handler
    const subBtn = card.querySelector('.btn-sub-dir');
    if (subBtn && !isSubbed) {
      subBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        subBtn.textContent = 'adding...';
        await addFeed(item.feedUrl, title, artwork);
        subBtn.textContent = '✓ followed';
        subBtn.classList.remove('btn-primary');
        subBtn.classList.add('btn-secondary');
        subBtn.disabled = true;
      });
    }

    // Playable recent episode rows wiring
    card.querySelectorAll('.recent-ep-row').forEach(row => {
      const guid = row.dataset.guid;
      if (!guid) return;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const ep = (state.allEpisodes || []).find(item => item.guid === guid);
        if (ep) {
          if (typeof toggleEpisodePlayback === 'function') {
            toggleEpisodePlayback(ep);
          } else if (typeof playEpisode === 'function') {
            playEpisode(ep);
          }
        }
      });
    });

    s.listEl.appendChild(card);
  });

  // Trigger the background lazy loader to fetch episodes for newly rendered directory cards
  if (typeof loadCuratedFeedEpisodes === 'function') {
    loadCuratedFeedEpisodes(container);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 17 · Continue Shelf
// Horizontal shelf showing in-progress episodes above the timeline.
// getContinueRowCapacity — responsive slot count based on viewport width.
// renderContinueShelf — sorts by lastListenedAt, pins current episode first.
// ─────────────────────────────────────────────────────────────────────────

function getContinueRowCapacity() {
  const w = window.innerWidth;
  if (w >= 1400) return 5;
  if (w >= 1150) return 4;
  if (w >= 880) return 3;
  return 2;
}

function renderContinueShelf() {
  if (!elements.continueShelf || !elements.continueGrid) return;

  const currentGuid = state.currentEpisode ? state.currentEpisode.guid : null;

  let inProgressEps = state.allEpisodes.filter(ep => {
    const pos = state.playbackPositions[ep.guid];
    const isCurrent = currentGuid && ep.guid === currentGuid;
    return (!pos || !pos.completed) && (isCurrent || (pos && pos.position > 2));
  });

  inProgressEps.sort((a, b) => {
    const posA = state.playbackPositions[a.guid];
    const posB = state.playbackPositions[b.guid];
    const timeA = (posA && posA.lastListenedAt) || (a.timestamp ? a.timestamp / 1000 : 0);
    const timeB = (posB && posB.lastListenedAt) || (b.timestamp ? b.timestamp / 1000 : 0);
    return timeB - timeA;
  });

  if (currentGuid) {
    const curIdx = inProgressEps.findIndex(e => e.guid === currentGuid);
    if (curIdx > 0) {
      const cur = inProgressEps.splice(curIdx, 1)[0];
      inProgressEps.unshift(cur);
    }
  }

  if (elements.continueCount) {
    elements.continueCount.textContent = inProgressEps.length;
  }

  if (inProgressEps.length === 0 || state.filterMode === 'played') {
    elements.continueShelf.classList.add('hidden');
    return;
  }

  elements.continueShelf.classList.remove('hidden');
  elements.continueGrid.innerHTML = '';

  const capacity = getContinueRowCapacity();

  if (elements.btnToggleContinue && elements.continueToggleLabel) {
    if (inProgressEps.length <= capacity) {
      elements.btnToggleContinue.style.display = 'none';
      elements.continueShelf.classList.remove('is-expanded');
    } else {
      elements.btnToggleContinue.style.display = 'inline-flex';
      if (state.continueCollapsed) {
        elements.continueToggleLabel.textContent = `show all (${inProgressEps.length})`;
        elements.continueShelf.classList.remove('is-expanded');
      } else {
        elements.continueToggleLabel.textContent = 'show less';
        elements.continueShelf.classList.add('is-expanded');
      }
    }
  }
  const visibleEps = state.continueCollapsed ? inProgressEps.slice(0, capacity) : inProgressEps;
  const continueContext = {
    type: 'continue',
    id: 'continue',
    title: 'Continue Listening',
    items: inProgressEps
  };
  visibleEps.forEach(ep => {
    elements.continueGrid.appendChild(createEpisodeCard(ep, continueContext));
  });
}

function setDirectoryCountry(code) {
  state.directoryCountry = code || 'all';
  document.querySelectorAll('.region-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.region === state.directoryCountry);
  });
}

function renderDiscover() {
  const container = document.getElementById('discover-content-container');
  if (!container) return;

  const hasFeeds = state.feeds && state.feeds.length > 0;

  container.innerHTML = `
    <div class="discover-view-wrap">
      ${!hasFeeds ? `
        <div class="welcome-onboard-banner" style="background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 12px; padding: 1.75rem; margin-bottom: 1.75rem; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
          <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">welcome to anypod</h3>
          <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; max-width: 600px; margin: 0 auto;">
            no podcasts added yet. no extra ads, no tracking, no noise — zero clutter means total audio freedom. explore our curated science &amp; climate shows below or search to add your first subscription!
          </p>
        </div>
      ` : ''}

      <!-- Clean Search & Direct RSS Add -->
      <div class="discover-search-box">
        <form id="empty-quick-form" class="quick-add-form" action="javascript:void(0);">
          <div class="quick-add-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="quick-add-icon">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="empty-quick-input" placeholder="search podcast name or paste rss feed url..." autocomplete="off">
            <button type="submit" class="btn btn-primary btn-quick-submit" id="btn-empty-quick-submit">search / add</button>
          </div>
        </form>
        <div class="empty-category-chips" id="empty-category-chips">
          <button type="button" class="category-chip" data-category="Science">science</button>
          <button type="button" class="category-chip" data-category="Climate">climate &amp; planet</button>
          <button type="button" class="category-chip" data-category="Earth Nature">earth &amp; nature</button>
          <button type="button" class="category-chip" data-category="Space Astronomy">space &amp; astronomy</button>
          <button type="button" class="category-chip" data-category="Oceans Marine">oceans &amp; marine</button>
          <button type="button" class="category-chip" data-category="Physics Quantum">physics &amp; quantum</button>
          <button type="button" class="category-chip" data-category="Neuroscience Mind">neuroscience &amp; mind</button>
          <button type="button" class="category-chip" data-category="Biology Genetics">biology &amp; genetics</button>
          <button type="button" class="category-chip" data-category="Clean Energy">clean tech &amp; energy</button>
          <button type="button" class="category-chip" data-category="AI Tech">artificial intelligence</button>
          <button type="button" class="category-chip" data-category="History Science">history of science</button>
          <button type="button" class="category-chip" data-category="Wissen DE">wissen (de)</button>
        </div>
        <div id="empty-quick-results" class="quick-results-container"></div>
      </div>

      <!-- Curated 50 Worldwide Shows -->
      ${buildStarterSuggestionsHTML('all')}

      <!-- OPML import helper footer -->
      <div class="discover-opml-footer">
        <button class="btn btn-secondary btn-sm" id="btn-empty-opml-trigger">import opml file</button>
      </div>
    </div>
  `;

  wireEmptyStateEvents(container);
}

let emptySearchDebounceTimer = null;

function wireEmptyStateEvents(targetRoot = document) {
  const quickForm = targetRoot.querySelector('#empty-quick-form');
  const quickInput = targetRoot.querySelector('#empty-quick-input');
  const quickSubmit = targetRoot.querySelector('#btn-empty-quick-submit');
  const quickResults = targetRoot.querySelector('#empty-quick-results');

  if (quickInput && quickForm) {
    const normalizeUrl = (str) => {
      let u = str.trim();
      if ((u.startsWith('www.') || u.includes('youtube.com/') || u.includes('youtu.be/')) && !u.startsWith('http://') && !u.startsWith('https://')) {
        u = 'https://' + u;
      }
      return u;
    };

    const isDirectUrl = (str) => {
      const u = str.trim().toLowerCase();
      return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('www.') || u.includes('youtube.com/') || u.includes('youtu.be/');
    };

    quickInput.addEventListener('input', () => {
      const raw = quickInput.value.trim();
      if (quickSubmit) {
        quickSubmit.textContent = isDirectUrl(raw) ? 'Add Feed' : 'Search';
      }
      if (emptySearchDebounceTimer) clearTimeout(emptySearchDebounceTimer);
      if (!raw || raw.length < 3 || isDirectUrl(raw)) {
        if (quickResults) quickResults.innerHTML = '';
        return;
      }
      emptySearchDebounceTimer = setTimeout(() => {
        if (quickResults) searchPodcastDirectory(raw, quickResults);
      }, 650);
    });

    quickForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = quickInput.value.trim();
      if (!raw) return;

      if (isDirectUrl(raw)) {
        const val = normalizeUrl(raw);
        if (quickSubmit) {
          quickSubmit.textContent = 'adding...';
          quickSubmit.disabled = true;
        }
        try {
          const added = await addFeed(val);
          if (added) {
            const meta = state.feedMetadata[val] || {};
            if (meta.error) {
              showToast(`⚠️ Could not load feed: ${meta.error}`, 4000);
              if (quickSubmit) {
                quickSubmit.textContent = 'Add Feed';
                quickSubmit.disabled = false;
              }
            } else {
              quickInput.value = '';
              if (quickResults) quickResults.innerHTML = '';
              const feedTitle = meta.title || 'podcast';
              const count = meta.episodesCount || (state.allEpisodes ? state.allEpisodes.filter(ep => ep.feedUrl === val).length : 0);
              showToast(`✓ Subscribed to "${feedTitle}" (${count} episodes)!`, 3500);
              if (quickSubmit) {
                quickSubmit.textContent = '✓ added';
                setTimeout(() => {
                  if (quickSubmit) {
                    quickSubmit.textContent = 'search / add';
                    quickSubmit.disabled = false;
                  }
                }, 2500);
              }
              if (typeof _currentView === 'function' && (_currentView().tab === 'discover' || state.feeds.length === 1)) {
                if (typeof navigateTo === 'function') {
                  navigateTo('timeline', null);
                }
              }
            }
          } else {
            if (quickSubmit) {
              quickSubmit.textContent = 'Add Feed';
              quickSubmit.disabled = false;
            }
          }
        } catch (err) {
          showToast(`⚠️ Error adding feed: ${err?.message || 'Network error'}`, 4000);
          if (quickSubmit) {
            quickSubmit.textContent = 'Add Feed';
            quickSubmit.disabled = false;
          }
        }
      } else {
        if (emptySearchDebounceTimer) clearTimeout(emptySearchDebounceTimer);
        if (quickResults) searchPodcastDirectory(raw, quickResults);
      }
    });
  }

  targetRoot.querySelector('#btn-empty-open-add')?.addEventListener('click', openAddModal);
  targetRoot.querySelector('#btn-empty-opml-trigger')?.addEventListener('click', () => elements.opmlFileInput?.click());

  const emptyCatChips = targetRoot.querySelectorAll('#empty-category-chips .category-chip');
  if (emptyCatChips && quickInput && quickResults) {
    emptyCatChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.category;
        quickInput.value = cat;
        if (quickSubmit) quickSubmit.textContent = 'search';
        searchPodcastDirectory(cat, quickResults);
      });
    });
  }

  wireStarterSuggestionsEvents(targetRoot);
}

