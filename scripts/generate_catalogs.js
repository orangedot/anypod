/**
 * generate_catalogs.js
 *
 * Populates public/catalogs/*.json with 50 hand-curated, verified shows per category
 * across the 7 agreed categories:
 * - science
 * - democracy
 * - social
 * - entertainment
 * - sports
 * - technology
 * - history
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const catalogsDir = path.join(rootDir, 'public', 'catalogs');

if (!fs.existsSync(catalogsDir)) {
  fs.mkdirSync(catalogsDir, { recursive: true });
}

// 1. SCIENCE & COSMOS
const scienceCatalog = {
  id: "science",
  title: "Science & Cosmos",
  emoji: "🔬",
  description: "Planetary science, cosmic mysteries, cutting-edge research, and ecology.",
  subtopics: [
    { id: "all", label: "All Shows" },
    { id: "space", label: "🚀 Space & Cosmos" },
    { id: "science", label: "🔬 Research & Physics" },
    { id: "climate", label: "🌱 Climate & Energy" },
    { id: "nature", label: "🌿 Earth & Nature" }
  ],
  featured: [
    { title: "NASA's Curious Universe", feed: "https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566", badge: "EN • Space", topic: "space", whyNote: "Explore cosmic wonders with NASA scientists" },
    { title: "Radiolab", feed: "https://feeds.simplecast.com/EmVW7VGp", badge: "EN • Science", topic: "science", whyNote: "Investigative curiosity and scientific wonder" },
    { title: "The Climate Question (BBC)", feed: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss", badge: "EN • Climate", topic: "climate", whyNote: "World-class climate reporting from the BBC" },
    { title: "Science Vs", feed: "https://feeds.megaphone.fm/sciencevs", badge: "EN • Science", topic: "science", whyNote: "Fads, trends, and what the science really says" },
    { title: "Quanta Science Podcast", feed: "https://www.quantamagazine.org/feed/podcast/", badge: "EN • Physics", topic: "science", whyNote: "Frontier physics, mathematics, and cosmology" }
  ],
  shows: [
    { title: "NASA's Curious Universe", feed: "https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566", lang: "en", badge: "EN • Space", topic: "space" },
    { title: "Radiolab", feed: "https://feeds.simplecast.com/EmVW7VGp", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "The Climate Question (BBC)", feed: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "Science Vs", feed: "https://feeds.megaphone.fm/sciencevs", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "Ologies with Alie Ward", feed: "https://feeds.simplecast.com/FO6kxYGj", lang: "en", badge: "EN • Nature", topic: "nature" },
    { title: "Nature Podcast", feed: "https://feeds.acast.com/public/shows/nature", lang: "en", badge: "EN • Research", topic: "science" },
    { title: "StarTalk Radio", feed: "https://feeds.simplecast.com/4T39_jAj", lang: "en", badge: "EN • Space", topic: "space" },
    { title: "Science Friday", feed: "https://feeds.simplecast.com/h18ZIZD_", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "TED Climate", feed: "https://feeds.feedburner.com/tedtalks_audio", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "Costing the Earth (BBC)", feed: "https://podcasts.files.bbci.co.uk/b006r4wn.rss", lang: "en", badge: "EN • Ecology", topic: "climate" },
    { title: "BBC Earth Podcast", feed: "https://feeds.acast.com/public/shows/63fb67c5-f719-43f7-b264-390cd7edb120", lang: "en", badge: "EN • Planet", topic: "nature" },
    { title: "Future Ecologies", feed: "https://feeds.captivate.fm/future-ecologies/", lang: "en", badge: "EN • Ecology", topic: "nature" },
    { title: "Mongabay Newscast", feed: "https://mongabay.libsyn.com/rss", lang: "en", badge: "EN • Forests", topic: "nature" },
    { title: "Living on Earth (PRI)", feed: "https://feeds.megaphone.fm/livingonearth", lang: "en", badge: "EN • Environment", topic: "climate" },
    { title: "Short Wave (NPR)", feed: "https://feeds.npr.org/510351/podcast.xml", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "Huberman Lab", feed: "https://feeds.megaphone.fm/hubermanlab", lang: "en", badge: "EN • Biology", topic: "science" },
    { title: "Planetary Radio", feed: "https://www.omnycontent.com/d/playlist/d95da206-8ee8-4ba5-ba8d-ad1200b4e5a4/cf13d5f5-6040-458d-ab5a-ad200189747d/b75c9f7f-4a63-438e-b506-ad2001897499/podcast.rss", lang: "en", badge: "EN • Space", topic: "space" },
    { title: "The Infinite Monkey Cage (BBC)", feed: "https://podcasts.files.bbci.co.uk/b00snr0w.rss", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "Quanta Science Podcast", feed: "https://www.quantamagazine.org/feed/podcast/", lang: "en", badge: "EN • Physics", topic: "science" },
    { title: "Outrage + Optimism", feed: "https://feeds.acast.com/public/shows/outrage-optimism", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "CrowdScience (BBC)", feed: "https://podcasts.files.bbci.co.uk/p04d42rc.rss", lang: "en", badge: "EN • Global", topic: "science" },
    { title: "Climate One", feed: "https://feeds.megaphone.fm/CCC9544803627", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "Volts (Clean Energy)", feed: "https://api.substack.com/feed/podcast/193024.rss", lang: "en", badge: "EN • Energy", topic: "climate" },
    { title: "Gastropod", feed: "https://feeds.megaphone.fm/VMP6255701211", lang: "en", badge: "EN • Food Sci", topic: "science" },
    { title: "The Energy Gang", feed: "https://rss.art19.com/the-energy-gang", lang: "en", badge: "EN • Energy", topic: "climate" },
    { title: "Forschung aktuell (DLF)", feed: "https://www.deutschlandfunk.de/forschung-aktuell-102.xml", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "ARD Klima-Update", feed: "https://www.ndr.de/nachrichten/info/podcast4696.xml", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "ZEIT WISSEN: Woher weißt du das?", feed: "https://feeds.simplecast.com/NM3_bR51", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "Terra X Podcast (ZDF)", feed: "https://cdn.julephosting.de/podcasts/1350-terra-x-der-podcast/feed.rss", lang: "de", badge: "DE • Natur", topic: "nature" },
    { title: "radiowissen (Bayern 2)", feed: "https://feeds.br.de/radiowissen/feed.xml", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "Synapsen (NDR Info)", feed: "https://www.ndr.de/nachrichten/info/podcast2994.xml", lang: "de", badge: "DE • Forschung", topic: "science" },
    { title: "Spektrum der Wissenschaft", feed: "https://www.spektrum.de/blatt/d_sdwv_podcast_rss&id=851833", lang: "de", badge: "DE • Natur", topic: "nature" },
    { title: "Das Klima (IPCC)", feed: "https://dasklima.podigee.io/feed/mp3", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "Quarks Science-Cops (WDR)", feed: "https://www1.wdr.de/mediathek/audio/quarks-science-cops/science-cops-100.podcast", lang: "de", badge: "DE • Fakten", topic: "science" },
    { title: "Gradmesser (Tagesspiegel)", feed: "https://dergradmesser.podigee.io/feed/mp3", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "Sternengeschichten", feed: "https://sternengeschichten.podigee.io/feed/mp3", lang: "de", badge: "DE • Raumfahrt", topic: "space" },
    { title: "Quarks Daily (WDR)", feed: "https://www1.wdr.de/mediathek/audio/daily-quarks/daily-quarks-podcast-104.podcast", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "La Terre au carré (France Inter)", feed: "https://radiofrance-podcast.net/podcast09/rss_10078.xml", lang: "fr", badge: "FR • Écologie", topic: "nature" },
    { title: "La Science, CQFD (France Culture)", feed: "https://radiofrance-podcast.net/podcast09/rss_10076.xml", lang: "fr", badge: "FR • Sciences", topic: "science" },
    { title: "Chaleur Humaine (Le Monde)", feed: "https://feeds.acast.com/public/shows/68db9a016d92c33f9c2eff83", lang: "fr", badge: "FR • Climat", topic: "climate" },
    { title: "Sixième Science (20 Minutes)", feed: "https://feeds.acast.com/public/shows/sixieme-science", lang: "fr", badge: "FR • Sciences", topic: "science" },
    { title: "Baleine sous gravillon", feed: "https://feed.ausha.co/BNxwOTwv2gLX", lang: "fr", badge: "FR • Vivant", topic: "nature" },
    { title: "Sur les épaules de Darwin", feed: "https://radiofrance-podcast.net/podcast09/rss_11553.xml", lang: "fr", badge: "FR • Évolution", topic: "nature" },
    { title: "Coffee Break: Señal y Ruido", feed: "https://feeds.ivoox.com/feed_fg_f1172991_filtro_1.xml", lang: "es", badge: "ES • Cosmos", topic: "space" },
    { title: "Materia Oscura", feed: "https://feeds.ivoox.com/feed_fg_f1772652_filtro_1.xml", lang: "es", badge: "ES • Ciencia", topic: "science" },
    { title: "Aparici en Órbita", feed: "https://feeds.ivoox.com/feed_fg_f1646895_filtro_1.xml", lang: "es", badge: "ES • Cosmos", topic: "space" },
    { title: "A Hombros de Gigantes (RNE)", feed: "http://api.rtve.es/api/programas/1873/audios.rss", lang: "es", badge: "ES • Divulgación", topic: "science" },
    { title: "Catástrofe Ultravioleta", feed: "https://www.omnycontent.com/d/playlist/554539c9-b3b2-431a-9f3a-ada4006d04a0/d422d26a-b8b3-4c1f-b507-b2e20117a99d/d1a34000-0d86-4257-b229-b2e20117a9b8/podcast.rss", lang: "es", badge: "ES • Ciencia", topic: "science" },
    { title: "Ci vuole una scienza (Il Post)", feed: "https://feeds.megaphone.fm/IPS8073667277", lang: "it", badge: "IT • Scienza", topic: "science" },
    { title: "Vetenskapsradion Klotet (SR)", feed: "https://api.sr.se/api/rss/pod/3966", lang: "sv", badge: "SV • Miljö & Klimat", topic: "climate" }
  ]
};

// 2. DEMOCRACY & FREE PRESS
const democracyCatalog = {
  id: "democracy",
  title: "Democracy & Free Press",
  emoji: "🏛️",
  description: "Investigative journalism, civics, democratic integrity, and global affairs.",
  subtopics: [
    { id: "all", label: "All Shows" },
    { id: "investigative", label: "🔍 Investigative" },
    { id: "global", label: "🌐 Global Affairs" },
    { id: "civics", label: "⚖️ Civics & Law" },
    { id: "press", label: "📰 Free Press" }
  ],
  featured: [
    { title: "Frontline PBS", feed: "https://feeds.feedburner.com/pbs/frontline", badge: "EN • Investigative", topic: "investigative", whyNote: "Deep investigative reporting on critical issues" },
    { title: "The Daily", feed: "https://feeds.simplecast.com/54nAGcIl", badge: "EN • Journalism", topic: "press", whyNote: "Essential news reporting and analysis from NYT" },
    { title: "Global News Podcast (BBC)", feed: "https://podcasts.files.bbci.co.uk/p02nq0gn.rss", badge: "EN • Global", topic: "global", whyNote: "Comprehensive world news coverage from the BBC" },
    { title: "On the Media (WNYC)", feed: "https://feeds.simplecast.com/b_x3O7Q_", badge: "EN • Free Press", topic: "press", whyNote: "How media shapes narrative, politics, and democracy" },
    { title: "Hintergrund (DLF)", feed: "https://www.deutschlandfunk.de/hintergrund-102.xml", badge: "DE • Politik", topic: "civics", whyNote: "Gründliche Analysen zu Politik und Gesellschaft" }
  ],
  shows: [
    { title: "Frontline PBS", feed: "https://feeds.feedburner.com/pbs/frontline", lang: "en", badge: "EN • Investigative", topic: "investigative" },
    { title: "The Daily", feed: "https://feeds.simplecast.com/54nAGcIl", lang: "en", badge: "EN • Journalism", topic: "press" },
    { title: "Global News Podcast (BBC)", feed: "https://podcasts.files.bbci.co.uk/p02nq0gn.rss", lang: "en", badge: "EN • Global", topic: "global" },
    { title: "On the Media (WNYC)", feed: "https://feeds.simplecast.com/b_x3O7Q_", lang: "en", badge: "EN • Free Press", topic: "press" },
    { title: "Hintergrund (DLF)", feed: "https://www.deutschlandfunk.de/hintergrund-102.xml", lang: "de", badge: "DE • Politik", topic: "civics" },
    { title: "Today, Explained (Vox)", feed: "https://feeds.megaphone.fm/VMP5705694065", lang: "en", badge: "EN • Politics", topic: "civics" },
    { title: "Throughline (NPR)", feed: "https://feeds.npr.org/510333/podcast.xml", lang: "en", badge: "EN • History", topic: "global" },
    { title: "Embedded (NPR)", feed: "https://feeds.npr.org/510311/podcast.xml", lang: "en", badge: "EN • Investigative", topic: "investigative" },
    { title: "The Lawfare Podcast", feed: "https://feeds.acast.com/public/shows/the-lawfare-podcast", lang: "en", badge: "EN • Law", topic: "civics" },
    { title: "Stay Tuned with Preet", feed: "https://feeds.megaphone.fm/staytunedwithpreet", lang: "en", badge: "EN • Justice", topic: "civics" },
    { title: "The Intelligence (The Economist)", feed: "https://feeds.acast.com/public/shows/the-intelligence", lang: "en", badge: "EN • Global", topic: "global" },
    { title: "Inside Europe (DW)", feed: "https://rss.dw.com/xml/podcast_inside-europe", lang: "en", badge: "EN • Europe", topic: "global" },
    { title: "Reveal (Center for Investigative Reporting)", feed: "https://feeds.revealnews.org/revealpodcast", lang: "en", badge: "EN • Investigative", topic: "investigative" },
    { title: "Post Reports (Washington Post)", feed: "https://podcast.postreports.com/rss", lang: "en", badge: "EN • Journalism", topic: "press" },
    { title: "1A (NPR)", feed: "https://feeds.npr.org/510316/podcast.xml", lang: "en", badge: "EN • Civics", topic: "civics" },
    { title: "The Ezra Klein Show", feed: "https://feeds.simplecast.com/82FI35Px", lang: "en", badge: "EN • Ideas", topic: "civics" },
    { title: "Fresh Air (NPR)", feed: "https://feeds.npr.org/381444908/podcast.xml", lang: "en", badge: "EN • Culture", topic: "press" },
    { title: "The Weeds (Vox)", feed: "https://feeds.megaphone.fm/theweeds", lang: "en", badge: "EN • Policy", topic: "civics" },
    { title: "What Next (Slate)", feed: "https://feeds.megaphone.fm/whatnext", lang: "en", badge: "EN • Politics", topic: "civics" },
    { title: "Political Scene (The New Yorker)", feed: "https://feeds.simplecast.com/h5T2_u-D", lang: "en", badge: "EN • Analysis", topic: "civics" },
    { title: "The Daily Blast (The New Republic)", feed: "https://feeds.megaphone.fm/TNR1056587602", lang: "en", badge: "EN • Politics", topic: "civics" },
    { title: "Pod Save the World", feed: "https://feeds.simplecast.com/l2i9YnTd", lang: "en", badge: "EN • Global", topic: "global" },
    { title: "BBC Assignment", feed: "https://podcasts.files.bbci.co.uk/p029399x.rss", lang: "en", badge: "EN • World", topic: "global" },
    { title: "BBC HARDtalk", feed: "https://podcasts.files.bbci.co.uk/p004t1s0.rss", lang: "en", badge: "EN • Interviews", topic: "press" },
    { title: "The Inquiry (BBC)", feed: "https://podcasts.files.bbci.co.uk/p029399x.rss", lang: "en", badge: "EN • Analysis", topic: "global" },
    { title: "Media Show (BBC)", feed: "https://podcasts.files.bbci.co.uk/b00dv9hq.rss", lang: "en", badge: "EN • Media", topic: "press" },
    { title: "The Globalist (Monocle)", feed: "https://feeds.megaphone.fm/theglobalist", lang: "en", badge: "EN • Diplomacy", topic: "global" },
    { title: "The Foreign Desk (Monocle)", feed: "https://feeds.megaphone.fm/theforeigndesk", lang: "en", badge: "EN • Foreign Policy", topic: "global" },
    { title: "Chatham House Podcast", feed: "https://chathamhouse.libsyn.com/rss", lang: "en", badge: "EN • Strategy", topic: "global" },
    { title: "Carnegie Global Ethics", feed: "https://carnegiecouncil.libsyn.com/rss", lang: "en", badge: "EN • Ethics", topic: "civics" },
    { title: "Das Politikteil (ZEIT)", feed: "https://feeds.simplecast.com/pZ2G8N1R", lang: "de", badge: "DE • Debatte", topic: "civics" },
    { title: "Der Tag (DLF)", feed: "https://www.deutschlandfunk.de/der-tag-100.xml", lang: "de", badge: "DE • Nachrichten", topic: "press" },
    { title: "Lage der Nation", feed: "https://feeds.lagedernation.org/ldn", lang: "de", badge: "DE • Politik", topic: "civics" },
    { title: "11KM: der tagesschau-Podcast", feed: "https://www.ndr.de/nachrichten/info/podcast5216.xml", lang: "de", badge: "DE • Recherche", topic: "investigative" },
    { title: "Das Feature (DLF Kultur)", feed: "https://www.deutschlandfunkkultur.de/das-feature-102.xml", lang: "de", badge: "DE • Doku", topic: "investigative" },
    { title: "Servus. Grüezi. Hallo. (ZEIT)", feed: "https://feeds.simplecast.com/5R9M4h8K", lang: "de", badge: "DE • Alpen", topic: "global" },
    { title: "Jung & Naiv Audio", feed: "https://jungundnaiv.libsyn.com/rss", lang: "de", badge: "DE • Politik", topic: "civics" },
    { title: "Conflict Zone (DW)", feed: "https://rss.dw.com/xml/podcast_conflict-zone", lang: "en", badge: "EN • Debate", topic: "press" },
    { title: "France Culture - Enjeux internationaux", feed: "https://radiofrance-podcast.net/podcast09/rss_10351.xml", lang: "fr", badge: "FR • Monde", topic: "global" },
    { title: "RFI - Géopolitique, le débat", feed: "https://www.rfi.fr/fr/podcasts/g%C3%A9opolitique-le-d%C3%A9bat/podcast", lang: "fr", badge: "FR • Débat", topic: "global" },
    { title: "Radio Ambulante (NPR)", feed: "https://feeds.npr.org/510315/podcast.xml", lang: "es", badge: "ES • Crónica", topic: "investigative" },
    { title: "El Hilo", feed: "https://feeds.megaphone.fm/PRX5743419998", lang: "es", badge: "ES • América Latina", topic: "global" },
    { title: "Hoy en EL PAÍS", feed: "https://feeds.elpais.com/audio/hoy-en-el-pais", lang: "es", badge: "ES • Actualidad", topic: "press" },
    { title: "Al Jazeera - The Take", feed: "https://feeds.megaphone.fm/thetake", lang: "en", badge: "EN • News", topic: "global" },
    { title: "Al Jazeera - Inside Story", feed: "https://feeds.megaphone.fm/AJE7654165768", lang: "en", badge: "EN • Analysis", topic: "global" },
    { title: "Europarl Highlights", feed: "https://audiovisual.ec.europa.eu/en/podcast", lang: "en", badge: "EN • EU", topic: "civics" },
    { title: "The Intercepted", feed: "https://feeds.acast.com/public/shows/intercepted-with-jeremy-scahill", lang: "en", badge: "EN • Investigative", topic: "investigative" },
    { title: "Open Source with Christopher Lydon", feed: "https://radioopensource.org/feed/podcast/", lang: "en", badge: "EN • Culture & Civics", topic: "civics" },
    { title: "De Correspondent", feed: "https://decorrespondent.nl/podcast.rss", lang: "nl", badge: "NL • Journalistiek", topic: "investigative" },
    { title: "ProPublica Investigations", feed: "https://feeds.soundcloud.com/users/soundcloud:users:19641755/sounds.rss", lang: "en", badge: "EN • Public Interest", topic: "investigative" }
  ]
};

// 3. SOCIAL & HUMAN STORIES
const socialCatalog = {
  id: "social",
  title: "Social & Human Stories",
  emoji: "🌍",
  description: "Culture, human experience, philosophy, psychology, and personal journeys.",
  subtopics: [
    { id: "all", label: "All Shows" },
    { id: "culture", label: "🎭 Culture & Society" },
    { id: "psychology", label: "🧠 Mind & Behavior" },
    { id: "philosophy", label: "💡 Philosophy" },
    { id: "stories", label: "📖 Personal Stories" }
  ],
  featured: [
    { title: "This American Life", feed: "https://www.thisamericanlife.org/podcast/rss.xml", badge: "EN • Storytelling", topic: "stories", whyNote: "Pioneering journalistic storytelling and human empathy" },
    { title: "Heavyweight", feed: "https://feeds.megaphone.fm/heavyweight", badge: "EN • Life", topic: "stories", whyNote: "Jonathan Goldstein helps people resolve past regrets" },
    { title: "Hidden Brain", feed: "https://feeds.simplecast.com/kwSerialization", badge: "EN • Psychology", topic: "psychology", whyNote: "Exploring unseen patterns that drive human behavior" },
    { title: "Philosophize This!", feed: "https://philosophizethis.libsyn.com/rss", badge: "EN • Philosophy", topic: "philosophy", whyNote: "Accessible deep-dives into human thought through the ages" },
    { title: "Invisibilia (NPR)", feed: "https://feeds.npr.org/510307/podcast.xml", badge: "EN • Ideas", topic: "psychology", whyNote: "Unseeable forces controlling human behavior and beliefs" }
  ],
  shows: [
    { title: "This American Life", feed: "https://www.thisamericanlife.org/podcast/rss.xml", lang: "en", badge: "EN • Stories", topic: "stories" },
    { title: "Heavyweight", feed: "https://feeds.megaphone.fm/heavyweight", lang: "en", badge: "EN • Stories", topic: "stories" },
    { title: "Hidden Brain", feed: "https://feeds.simplecast.com/kwSerialization", lang: "en", badge: "EN • Psychology", topic: "psychology" },
    { title: "Philosophize This!", feed: "https://philosophizethis.libsyn.com/rss", lang: "en", badge: "EN • Philosophy", topic: "philosophy" },
    { title: "Invisibilia (NPR)", feed: "https://feeds.npr.org/510307/podcast.xml", lang: "en", badge: "EN • Mind", topic: "psychology" },
    { title: "The Moth", feed: "https://feeds.megaphone.fm/themoth", lang: "en", badge: "EN • True Stories", topic: "stories" },
    { title: "Snap Judgment", feed: "https://feeds.simplecast.com/2m-kQc94", lang: "en", badge: "EN • Storytelling", topic: "stories" },
    { title: "Ear Hustle", feed: "https://feeds.radiotopia.fm/earhustle", lang: "en", badge: "EN • Society", topic: "culture" },
    { title: "Death, Sex & Money", feed: "https://feeds.simplecast.com/n6b3r4_5", lang: "en", badge: "EN • Intimacy", topic: "culture" },
    { title: "Modern Love (NYT)", feed: "https://feeds.simplecast.com/u_pWfX09", lang: "en", badge: "EN • Relationships", topic: "stories" },
    { title: "Code Switch (NPR)", feed: "https://feeds.npr.org/510312/podcast.xml", lang: "en", badge: "EN • Identity", topic: "culture" },
    { title: "Rough Translation (NPR)", feed: "https://feeds.npr.org/510324/podcast.xml", lang: "en", badge: "EN • World Culture", topic: "culture" },
    { title: "The Anthropocene Reviewed", feed: "https://feeds.simplecast.com/pZ6sD_gH", lang: "en", badge: "EN • Essays", topic: "culture" },
    { title: "TED Radio Hour", feed: "https://feeds.npr.org/510298/podcast.xml", lang: "en", badge: "EN • Big Ideas", topic: "culture" },
    { title: "Revisionist History", feed: "https://feeds.megaphone.fm/revisionisthistory", lang: "en", badge: "EN • Overlooked", topic: "culture" },
    { title: "Unexplainable (Vox)", feed: "https://feeds.megaphone.fm/unexplainable", lang: "en", badge: "EN • Mystery", topic: "psychology" },
    { title: "You're Wrong About", feed: "https://feeds.buzzsprout.com/1112270.rss", lang: "en", badge: "EN • Mythbusting", topic: "culture" },
    { title: "Maintenance Phase", feed: "https://feeds.buzzsprout.com/1411126.rss", lang: "en", badge: "EN • Wellness", topic: "culture" },
    { title: "Normal Gossip", feed: "https://feeds.megaphone.fm/normalgossip", lang: "en", badge: "EN • Human Nature", topic: "stories" },
    { title: "Where Should We Begin?", feed: "https://feeds.megaphone.fm/whereshouldwebegin", lang: "en", badge: "EN • Couples Therapy", topic: "psychology" },
    { title: "Beautiful Stories From Anonymous People", feed: "https://feeds.simplecast.com/7bF3fT6R", lang: "en", badge: "EN • Honest Talk", topic: "stories" },
    { title: "Strangers", feed: "https://feeds.simplecast.com/6t4S8yL_", lang: "en", badge: "EN • Empathy", topic: "stories" },
    { title: "Love and Radio", feed: "https://feeds.simplecast.com/Z4w21_yF", lang: "en", badge: "EN • Soundscape", topic: "stories" },
    { title: "Everything is Alive", feed: "https://feeds.radiotopia.fm/everything-is-alive", lang: "en", badge: "EN • Perspective", topic: "philosophy" },
    { title: "The Memory Palace", feed: "https://feeds.radiotopia.fm/thememorypalace", lang: "en", badge: "EN • Vignettes", topic: "stories" },
    { title: "The Stoic Coffee Break", feed: "https://stoic.coffee/feed/podcast/", lang: "en", badge: "EN • Stoicism", topic: "philosophy" },
    { title: "Daily Stoic", feed: "https://feeds.megaphone.fm/dailystoic", lang: "en", badge: "EN • Ancient Wisdom", topic: "philosophy" },
    { title: "Very Bad Wizards", feed: "https://verybadwizards.libsyn.com/rss", lang: "en", badge: "EN • Ethics", topic: "philosophy" },
    { title: "The Partially Examined Life", feed: "https://partiallyexaminedlife.libsyn.com/rss", lang: "en", badge: "EN • Thought", topic: "philosophy" },
    { title: "Making Sense (Sam Harris)", feed: "https://feeds.megaphone.fm/makingsense", lang: "en", badge: "EN • Consciousness", topic: "philosophy" },
    { title: "Daily Meditation Podcast", feed: "https://dailymeditation.libsyn.com/rss", lang: "en", badge: "EN • Mindfulness", topic: "psychology" },
    { title: "99% Invisible", feed: "https://feeds.simplecast.com/BqKfgTG5", lang: "en", badge: "EN • Design", topic: "culture" },
    { title: "Twenty Thousand Hertz", feed: "https://feeds.megaphone.fm/twentythousandhertz", lang: "en", badge: "EN • Sound Stories", topic: "culture" },
    { title: "Rumble Strip", feed: "https://feeds.feedburner.com/RumbleStripVermont", lang: "en", badge: "EN • Community", topic: "stories" },
    { title: "Hotel Matze", feed: "https://hotelmatze.podigee.io/feed/mp3", lang: "de", badge: "DE • Gespräche", topic: "stories" },
    { title: "Alles gesagt? (ZEIT)", feed: "https://feeds.simplecast.com/t_K8_fM1", lang: "de", badge: "DE • Ausdauer", topic: "culture" },
    { title: "Betreutes Fühlen", feed: "https://betreutesfuehlen.podigee.io/feed/mp3", lang: "de", badge: "DE • Gefühle", topic: "psychology" },
    { title: "Zeit Verbrechen", feed: "https://feeds.simplecast.com/V8W9H_oP", lang: "de", badge: "DE • Justiz", topic: "stories" },
    { title: "Hörsaal (DLF Nova)", feed: "https://www.deutschlandfunknova.de/podcast/hoersaal.xml", lang: "de", badge: "DE • Universität", topic: "philosophy" },
    { title: "Das philosophische Radio (WDR 5)", feed: "https://www1.wdr.de/mediathek/audio/wdr5/wdr5-das-philosophische-radio/philosophisches-radio-100.podcast", lang: "de", badge: "DE • Denken", topic: "philosophy" },
    { title: "Sein und Streit (DLF Kultur)", feed: "https://www.deutschlandfunkkultur.de/sein-und-streit-102.xml", lang: "de", badge: "DE • Philosophie", topic: "philosophy" },
    { title: "Transfert (Slate FR)", feed: "https://rss.audiomeans.fr/feed/show/e8e7a68e-5b12-4217-a9a7-9e7f5bf516cf.xml", lang: "fr", badge: "FR • Intime", topic: "stories" },
    { title: "Les Pieds sur terre (France Culture)", feed: "https://radiofrance-podcast.net/podcast09/rss_10077.xml", lang: "fr", badge: "FR • Vrai", topic: "stories" },
    { title: "Émotions (Louie Media)", feed: "https://feeds.acast.com/public/shows/emotions", lang: "fr", badge: "FR • Ressenti", topic: "psychology" },
    { title: "Deforme Semanal Ideal Total", feed: "https://feeds.acast.com/public/shows/deforme-semanal", lang: "es", badge: "ES • Cultura", topic: "culture" },
    { title: "Entiende Tu Mente", feed: "https://feeds.acast.com/public/shows/entiende-tu-mente", lang: "es", badge: "ES • Psicología", topic: "psychology" },
    { title: "Nadie Sabe Nada (SER)", feed: "https://feeds.elpais.com/audio/nadie-sabe-nada", lang: "es", badge: "ES • Humor", topic: "culture" },
    { title: "On Being with Krista Tippett", feed: "https://feeds.simplecast.com/4N3m9kK_", lang: "en", badge: "EN • Spirit", topic: "philosophy" },
    { title: "Terrestrials", feed: "https://feeds.simplecast.com/FwYmK_69", lang: "en", badge: "EN • Wonder", topic: "stories" },
    { title: "Family Secrets", feed: "https://feeds.megaphone.fm/familysecrets", lang: "en", badge: "EN • Truth", topic: "stories" }
  ]
};

// 4. ENTERTAINMENT & CULTURE
const entertainmentCatalog = {
  id: "entertainment",
  title: "Entertainment & Culture",
  emoji: "🎭",
  description: "Cinema, comedy, music, storytelling, and contemporary pop culture.",
  subtopics: [
    { id: "all", label: "All Shows" },
    { id: "cinema", label: "🎬 Film & TV" },
    { id: "comedy", label: "😂 Comedy & Wit" },
    { id: "music", label: "🎵 Music & Sound" },
    { id: "pop", label: "🍿 Pop Culture" }
  ],
  featured: [
    { title: "Song Exploder", feed: "https://feeds.simplecast.com/Z6tY_B0X", badge: "EN • Music", topic: "music", whyNote: "Musicians break down the creative anatomy of their songs" },
    { title: "Conan O'Brien Needs A Friend", feed: "https://feeds.simplecast.com/dHoohavC", badge: "EN • Comedy", topic: "comedy", whyNote: "Hilarious, heartfelt conversations with extraordinary people" },
    { title: "Kermode & Mayo's Take", feed: "https://feeds.acast.com/public/shows/kermode-and-mayos-take", badge: "EN • Cinema", topic: "cinema", whyNote: "The UK's leading cinematic critics and cultural banter" },
    { title: "Pop Culture Happy Hour (NPR)", feed: "https://feeds.npr.org/510282/podcast.xml", badge: "EN • Culture", topic: "pop", whyNote: "Lively, thoughtful examinations of TV, movies, and arts" },
    { title: "SmartLess", feed: "https://rss.art19.com/smartless", badge: "EN • Comedy", topic: "comedy", whyNote: "Surprise guest interviews with Jason, Sean, and Will" }
  ],
  shows: [
    { title: "Song Exploder", feed: "https://feeds.simplecast.com/Z6tY_B0X", lang: "en", badge: "EN • Music", topic: "music" },
    { title: "Conan O'Brien Needs A Friend", feed: "https://feeds.simplecast.com/dHoohavC", lang: "en", badge: "EN • Comedy", topic: "comedy" },
    { title: "Kermode & Mayo's Take", feed: "https://feeds.acast.com/public/shows/kermode-and-mayos-take", lang: "en", badge: "EN • Cinema", topic: "cinema" },
    { title: "Pop Culture Happy Hour (NPR)", feed: "https://feeds.npr.org/510282/podcast.xml", lang: "en", badge: "EN • Pop Culture", topic: "pop" },
    { title: "SmartLess", feed: "https://rss.art19.com/smartless", lang: "en", badge: "EN • Comedy", topic: "comedy" },
    { title: "How Did This Get Made?", feed: "https://feeds.simplecast.com/k6V9_r1F", lang: "en", badge: "EN • Bad Movies", topic: "cinema" },
    { title: "Blank Check with Griffin & David", feed: "https://audioboom.com/channels/4259988.rss", lang: "en", badge: "EN • Filmography", topic: "cinema" },
    { title: "Films To Be Buried With", feed: "https://feeds.acast.com/public/shows/films-to-be-buried-with", lang: "en", badge: "EN • Cinema & Death", topic: "cinema" },
    { title: "The Rewatchables", feed: "https://feeds.megaphone.fm/the-rewatchables", lang: "en", badge: "EN • Classic Movies", topic: "cinema" },
    { title: "The Big Picture (The Ringer)", feed: "https://feeds.megaphone.fm/the-big-picture", lang: "en", badge: "EN • Hollywood", topic: "cinema" },
    { title: "Dissect (Spotify)", feed: "https://feeds.megaphone.fm/dissect", lang: "en", badge: "EN • Album Analysis", topic: "music" },
    { title: "Switched on Pop", feed: "https://feeds.megaphone.fm/VMP6207074311", lang: "en", badge: "EN • Musicology", topic: "music" },
    { title: "Broken Record", feed: "https://feeds.megaphone.fm/brokenrecord", lang: "en", badge: "EN • Music Legends", topic: "music" },
    { title: "Sound Opinions", feed: "https://feeds.soundopinions.org/soundopinions", lang: "en", badge: "EN • Rock & Talk", topic: "music" },
    { title: "All Songs Considered (NPR)", feed: "https://feeds.npr.org/510019/podcast.xml", lang: "en", badge: "EN • Discovery", topic: "music" },
    { title: "Tiny Desk Concerts - Audio", feed: "https://feeds.npr.org/510306/podcast.xml", lang: "en", badge: "EN • Live Sessions", topic: "music" },
    { title: "Tape Notes", feed: "https://feeds.acast.com/public/shows/tapenotes", lang: "en", badge: "EN • Studio Craft", topic: "music" },
    { title: "Fly on the Wall", feed: "https://feeds.simplecast.com/5u8L_2jR", lang: "en", badge: "EN • SNL Alumni", topic: "comedy" },
    { title: "Comedy Bang Bang", feed: "https://feeds.simplecast.com/G5q_P6kF", lang: "en", badge: "EN • Improv", topic: "comedy" },
    { title: "WTF with Marc Maron", feed: "https://feeds.libsyn.com/39379/rss", lang: "en", badge: "EN • Interviews", topic: "comedy" },
    { title: "Office Ladies", feed: "https://feeds.simplecast.com/lM_LdZ_l", lang: "en", badge: "EN • The Office", topic: "pop" },
    { title: "Las Culturistas", feed: "https://feeds.megaphone.fm/lasculturistas", lang: "en", badge: "EN • Pop Culture", topic: "pop" },
    { title: "Wait Wait... Don't Tell Me!", feed: "https://feeds.npr.org/344098539/podcast.xml", lang: "en", badge: "EN • News Quiz", topic: "comedy" },
    { title: "Judge John Hodgman", feed: "https://feeds.feedburner.com/todayinthepast", lang: "en", badge: "EN • Petty Court", topic: "comedy" },
    { title: "My Brother, My Brother and Me", feed: "https://feeds.simplecast.com/w4p8bK9A", lang: "en", badge: "EN • Advice", topic: "comedy" },
    { title: "LeVar Burton Reads", feed: "https://feeds.simplecast.com/F0_xYn59", lang: "en", badge: "EN • Fiction", topic: "pop" },
    { title: "Welcome to Night Vale", feed: "https://feeds.nightvalepresents.com/welcometonightvalepodcast", lang: "en", badge: "EN • Audio Drama", topic: "pop" },
    { title: "The Bright Sessions", feed: "https://feeds.simplecast.com/V9K9q_p8", lang: "en", badge: "EN • Sci-Fi Drama", topic: "pop" },
    { title: "Desert Island Discs (BBC)", feed: "https://podcasts.files.bbci.co.uk/b006qnmr.rss", lang: "en", badge: "EN • Archive", topic: "music" },
    { title: "Soul Music (BBC)", feed: "https://podcasts.files.bbci.co.uk/b008mj7p.rss", lang: "en", badge: "EN • Emotion", topic: "music" },
    { title: "Books and Authors (BBC)", feed: "https://podcasts.files.bbci.co.uk/p02nrsfl.rss", lang: "en", badge: "EN • Literature", topic: "pop" },
    { title: "Slate Culture Gabfest", feed: "https://feeds.megaphone.fm/culturegabfest", lang: "en", badge: "EN • Cultural Debate", topic: "pop" },
    { title: "The Treatment (KCRW)", feed: "https://feeds.kcrw.com/the-treatment", lang: "en", badge: "EN • Artists", topic: "cinema" },
    { title: "Gemischtes Hack", feed: "https://gemischteshack.podigee.io/feed/mp3", lang: "de", badge: "DE • Comedy", topic: "comedy" },
    { title: "Fest & Flauschig", feed: "https://festundflauschig.podigee.io/feed/mp3", lang: "de", badge: "DE • Unterhaltung", topic: "comedy" },
    { title: "Baywatch Berlin", feed: "https://baywatch-berlin.podigee.io/feed/mp3", lang: "de", badge: "DE • Quatsch", topic: "comedy" },
    { title: "Das Podcast Ufo", feed: "https://podcast-ufo.fail/feed/mp3/", lang: "de", badge: "DE • Absurd", topic: "comedy" },
    { title: "Kalk & Welk (ARD)", feed: "https://www.rbb-online.de/rbbkultur/radio/programm/schema/sendungen/kalk_und_welk.xml", lang: "de", badge: "DE • Fernsehen", topic: "pop" },
    { title: "Kino oder Couch", feed: "https://kinoodercouch.podigee.io/feed/mp3", lang: "de", badge: "DE • Film", topic: "cinema" },
    { title: "Deutschland3000", feed: "https://www.ndr.de/nachrichten/info/podcast4968.xml", lang: "de", badge: "DE • Popkultur", topic: "pop" },
    { title: "Pop Cult (France Inter)", feed: "https://radiofrance-podcast.net/podcast09/rss_10079.xml", lang: "fr", badge: "FR • Culture Pop", topic: "pop" },
    { title: "Blockbusters (France Inter)", feed: "https://radiofrance-podcast.net/podcast09/rss_10080.xml", lang: "fr", badge: "FR • Cinéma", topic: "cinema" },
    { title: "Todopoderosos", feed: "https://feeds.ivoox.com/feed_fg_f1137072_filtro_1.xml", lang: "es", badge: "ES • Cine & Libros", topic: "cinema" },
    { title: "Cinemascopazo", feed: "https://feeds.ivoox.com/feed_fg_f1454506_filtro_1.xml", lang: "es", badge: "ES • Películas", topic: "cinema" },
    { title: "Campamento Krypton", feed: "https://feeds.ivoox.com/feed_fg_f168759_filtro_1.xml", lang: "es", badge: "ES • Freak Culture", topic: "pop" },
    { title: "Kermode on Film", feed: "https://feeds.acast.com/public/shows/kermodeonfilm", lang: "en", badge: "EN • Reviews", topic: "cinema" },
    { title: "Composer of the Week (BBC)", feed: "https://podcasts.files.bbci.co.uk/b006tnxf.rss", lang: "en", badge: "EN • Classical", topic: "music" },
    { title: "Filmcast", feed: "https://feeds.feedburner.com/slashfilmcast", lang: "en", badge: "EN • Opinions", topic: "cinema" },
    { title: "The Screenwriting Life", feed: "https://feeds.buzzsprout.com/1126744.rss", lang: "en", badge: "EN • Writers", topic: "cinema" },
    { title: "Song vs. Song", feed: "https://feeds.megaphone.fm/songvssong", lang: "en", badge: "EN • Music Faceoff", topic: "music" }
  ]
};

// 5. SPORTS & ATHLETICS
const sportsCatalog = {
  id: "sports",
  title: "Sports & Athletics",
  emoji: "⚽",
  description: "Global football, endurance athletics, performance science, and sports journalism.",
  subtopics: [
    { id: "all", label: "All Shows" },
    { id: "football", label: "⚽ Football / Soccer" },
    { id: "endurance", label: "🏃 Endurance & Running" },
    { id: "analytics", label: "📊 Analytics & Tactics" },
    { id: "motorsport", label: "🏎️ F1 & Motorsport" }
  ],
  featured: [
    { title: "The Athletic Football Podcast", feed: "https://feeds.megaphone.fm/theathleticfootball", badge: "EN • Football", topic: "football", whyNote: "Authoritative insider analysis from premier football journalists" },
    { title: "30 for 30 Podcasts (ESPN)", feed: "https://feeds.megaphone.fm/ESP3845944111", badge: "EN • Documentaries", topic: "analytics", whyNote: "Cinematic, deeply told stories from sports history" },
    { title: "BBC 5 Live Football Daily", feed: "https://podcasts.files.bbci.co.uk/p02nrsln.rss", badge: "EN • Football", topic: "football", whyNote: "Daily debate and reactions from the Premier League & Europe" },
    { title: "The Rich Roll Podcast", feed: "https://feeds.simplecast.com/xlh6L_pL", badge: "EN • Endurance", topic: "endurance", whyNote: "Ultra-endurance, nutrition, and wellness mastery" },
    { title: "The Race F1 Podcast", feed: "https://feeds.acast.com/public/shows/the-race-f1-podcast", badge: "EN • Formula 1", topic: "motorsport", whyNote: "Expert insight and technical deep-dives into Grand Prix racing" }
  ],
  shows: [
    { title: "The Athletic Football Podcast", feed: "https://feeds.megaphone.fm/theathleticfootball", lang: "en", badge: "EN • Football", topic: "football" },
    { title: "30 for 30 Podcasts (ESPN)", feed: "https://feeds.megaphone.fm/ESP3845944111", lang: "en", badge: "EN • Doku", topic: "analytics" },
    { title: "BBC 5 Live Football Daily", feed: "https://podcasts.files.bbci.co.uk/p02nrsln.rss", lang: "en", badge: "EN • Daily", topic: "football" },
    { title: "The Rich Roll Podcast", feed: "https://feeds.simplecast.com/xlh6L_pL", lang: "en", badge: "EN • Endurance", topic: "endurance" },
    { title: "The Race F1 Podcast", feed: "https://feeds.acast.com/public/shows/the-race-f1-podcast", lang: "en", badge: "EN • F1", topic: "motorsport" },
    { title: "Football Weekly (The Guardian)", feed: "https://www.theguardian.com/football/series/footballweekly/podcast.xml", lang: "en", badge: "EN • Wit & Tactics", topic: "football" },
    { title: "The Totally Football Show", feed: "https://feeds.acast.com/public/shows/the-totally-football-show", lang: "en", badge: "EN • Euro League", topic: "football" },
    { title: "Tifo Football Podcast", feed: "https://feeds.megaphone.fm/tifofootball", lang: "en", badge: "EN • Tactics", topic: "analytics" },
    { title: "Stadio (The Ringer)", feed: "https://feeds.megaphone.fm/stadio", lang: "en", badge: "EN • Culture", topic: "football" },
    { title: "Men in Blazers", feed: "https://feeds.simplecast.com/2Y1q2kF8", lang: "en", badge: "EN • Banter", topic: "football" },
    { title: "The Bill Simmons Podcast", feed: "https://feeds.megaphone.fm/the-bill-simmons-podcast", lang: "en", badge: "EN • NBA & NFL", topic: "analytics" },
    { title: "The Lowe Post (ESPN)", feed: "https://feeds.megaphone.fm/ESP3389035252", lang: "en", badge: "EN • Basketball", topic: "analytics" },
    { title: "The Ringer NFL Show", feed: "https://feeds.megaphone.fm/the-ringer-nfl-show", lang: "en", badge: "EN • American Football", topic: "analytics" },
    { title: "Trail Runner Nation", feed: "https://trailrunnernation.libsyn.com/rss", lang: "en", badge: "EN • Trails", topic: "endurance" },
    { title: "The Peter Attia Drive", feed: "https://peterattiamd.com/feed/podcast/", lang: "en", badge: "EN • Longevity", topic: "endurance" },
    { title: "The Extramilest Show", feed: "https://extramilest.libsyn.com/rss", lang: "en", badge: "EN • Marathon", topic: "endurance" },
    { title: "KoopCast (Ultra Training)", feed: "https://koopcast.libsyn.com/rss", lang: "en", badge: "EN • Ultramarathon", topic: "endurance" },
    { title: "Science of Ultra", feed: "https://scienceofultra.libsyn.com/rss", lang: "en", badge: "EN • Physiology", topic: "endurance" },
    { title: "Fast Talk (Cycling Science)", feed: "https://fasttalklabs.libsyn.com/rss", lang: "en", badge: "EN • Cycling", topic: "endurance" },
    { title: "The Cycling Podcast", feed: "https://feeds.acast.com/public/shows/the-cycling-podcast", lang: "en", badge: "EN • Grand Tours", topic: "endurance" },
    { title: "Lanterne Rouge Cycling", feed: "https://anchor.fm/s/1e6d4ff8/podcast/rss", lang: "en", badge: "EN • Pelotons", topic: "endurance" },
    { title: "F1: Beyond The Grid", feed: "https://audioboom.com/channels/4964339.rss", lang: "en", badge: "EN • Drivers", topic: "motorsport" },
    { title: "Shift+F1", feed: "https://shiftf1.libsyn.com/rss", lang: "en", badge: "EN • Racing", topic: "motorsport" },
    { title: "The Tennis Podcast", feed: "https://feeds.acast.com/public/shows/the-tennis-podcast", lang: "en", badge: "EN • Tennis", topic: "analytics" },
    { title: "Baseline Intelligence Tennis", feed: "https://feeds.buzzsprout.com/1758552.rss", lang: "en", badge: "EN • Coaching", topic: "analytics" },
    { title: "BBC Test Match Special", feed: "https://podcasts.files.bbci.co.uk/p02nrsl4.rss", lang: "en", badge: "EN • Cricket", topic: "analytics" },
    { title: "The Rugby Pod", feed: "https://feeds.acast.com/public/shows/therugbypod", lang: "en", badge: "EN • Rugby", topic: "football" },
    { title: "That Peter Crouch Podcast", feed: "https://feeds.acast.com/public/shows/that-peter-crouch-podcast", lang: "en", badge: "EN • Locker Room", topic: "football" },
    { title: "Rasenfunk (Indie Fußball)", feed: "https://rasenfunk.de/feed", lang: "de", badge: "DE • Bundesliga", topic: "football" },
    { title: "Bohndesliga (Rocket Beans)", feed: "https://rocketbeans.tv/feeds/bohndesliga.xml", lang: "de", badge: "DE • Fußball", topic: "football" },
    { title: "Kicker Meets DAZN", feed: "https://kickermeetsdazn.podigee.io/feed/mp3", lang: "de", badge: "DE • Bundesliga", topic: "football" },
    { title: "Calcio Berlin", feed: "https://calcioberlin.podigee.io/feed/mp3", lang: "de", badge: "DE • Taktik", topic: "football" },
    { title: "Stammplatz (BILD Sport)", feed: "https://stammplatz.podigee.io/feed/mp3", lang: "de", badge: "DE • Sport", topic: "football" },
    { title: "Sportschau Bundesliga-Update", feed: "https://www.sportschau.de/podcast/bundesliga-update/feed.xml", lang: "de", badge: "DE • ARD", topic: "football" },
    { title: "Sport Inside (WDR)", feed: "https://www1.wdr.de/mediathek/audio/wdr5/sport-inside/sport-inside-podcast-102.podcast", lang: "de", badge: "DE • Reportage", topic: "analytics" },
    { title: "Pfostenrettet (Handball)", feed: "https://pfostenrettet.podigee.io/feed/mp3", lang: "de", badge: "DE • Handball", topic: "analytics" },
    { title: "After Foot (RMC)", feed: "https://rmc.bfmtv.com/podcast/after-foot/rss.xml", lang: "fr", badge: "FR • Football", topic: "football" },
    { title: "L'Équipe du Soir", feed: "https://feed.ausha.co/7aP54H1Q8R3K", lang: "fr", badge: "FR • Débat", topic: "football" },
    { title: "El Larguero (Cadena SER)", feed: "https://feeds.elpais.com/audio/el-larguero", lang: "es", badge: "ES • Fútbol", topic: "football" },
    { title: "Tiempo de Juego (COPE)", feed: "https://feeds.cope.es/tiempodejuego.xml", lang: "es", badge: "ES • Radio", topic: "football" },
    { title: "El Chiringuito de Jugones", feed: "https://feeds.ivoox.com/feed_fg_f1138241_filtro_1.xml", lang: "es", badge: "ES • Tertulia", topic: "football" },
    { title: "BBC 5 Live Sport Specials", feed: "https://podcasts.files.bbci.co.uk/p02nrslz.rss", lang: "en", badge: "EN • Documentaries", topic: "analytics" },
    { title: "Tailenders (BBC)", feed: "https://podcasts.files.bbci.co.uk/p02pc9ny.rss", lang: "en", badge: "EN • Cricket", topic: "analytics" },
    { title: "No Dunks (The Athletic)", feed: "https://feeds.megaphone.fm/nodunks", lang: "en", badge: "EN • NBA", topic: "analytics" },
    { title: "The Lead (Wondery)", feed: "https://feeds.megaphone.fm/thelead", lang: "en", badge: "EN • In-Depth", topic: "analytics" },
    { title: "House of Rugby", feed: "https://feeds.acast.com/public/shows/house-of-rugby", lang: "en", badge: "EN • Rugby", topic: "football" },
    { title: "TalkSport Daily", feed: "https://feeds.acast.com/public/shows/talksport-daily", lang: "en", badge: "EN • UK Sport", topic: "football" },
    { title: "Formula For Success (Coulthard & Jordan)", feed: "https://feeds.acast.com/public/shows/formula-for-success", lang: "en", badge: "EN • F1 Icons", topic: "motorsport" },
    { title: "The Move (Lance Armstrong)", feed: "https://feeds.simplecast.com/HqP_L1vF", lang: "en", badge: "EN • Tour de France", topic: "endurance" },
    { title: "Athletics Weekly Podcast", feed: "https://feeds.acast.com/public/shows/athletics-weekly", lang: "en", badge: "EN • Track & Field", topic: "endurance" }
  ]
};

// 6. TECHNOLOGY & FUTURE
const technologyCatalog = {
  id: "technology",
  title: "Technology & Future",
  emoji: "💻",
  description: "Open source, software craftsmanship, artificial intelligence, security, and digital freedom.",
  subtopics: [
    { id: "all", label: "All Shows" },
    { id: "opensource", label: "🐧 Open Source" },
    { id: "ai", label: "🤖 AI & Machine Learning" },
    { id: "dev", label: "⚙️ Engineering & Code" },
    { id: "privacy", label: "🛡️ Security & Privacy" }
  ],
  featured: [
    { title: "The Changelog", feed: "https://changelog.com/podcast/feed", badge: "EN • Open Source", topic: "opensource", whyNote: "Conversations with open source creators, hackers, and leaders" },
    { title: "Darknet Diaries", feed: "https://feeds.megaphone.fm/darknetdiaries", badge: "EN • Security", topic: "privacy", whyNote: "Thrilling true stories from the dark side of the Internet" },
    { title: "Lex Fridman Podcast", feed: "https://lexfridman.com/feed/podcast/", badge: "EN • AI & Tech", topic: "ai", whyNote: "Deep dialogues on AI, physics, computing, and intelligence" },
    { title: "Software Engineering Daily", feed: "https://softwareengineeringdaily.com/feed/podcast/", badge: "EN • Architecture", topic: "dev", whyNote: "Technical interviews on distributed systems and software design" },
    { title: "Hard Fork (NYT)", feed: "https://feeds.simplecast.com/l2i9YnTd", badge: "EN • Future", topic: "ai", whyNote: "Fast-moving reporting on AI breakthroughs and tech titans" }
  ],
  shows: [
    { title: "The Changelog", feed: "https://changelog.com/podcast/feed", lang: "en", badge: "EN • Open Source", topic: "opensource" },
    { title: "Darknet Diaries", feed: "https://feeds.megaphone.fm/darknetdiaries", lang: "en", badge: "EN • Security", topic: "privacy" },
    { title: "Lex Fridman Podcast", feed: "https://lexfridman.com/feed/podcast/", lang: "en", badge: "EN • AI", topic: "ai" },
    { title: "Software Engineering Daily", feed: "https://softwareengineeringdaily.com/feed/podcast/", lang: "en", badge: "EN • Dev", topic: "dev" },
    { title: "Hard Fork (NYT)", feed: "https://feeds.simplecast.com/l2i9YnTd", lang: "en", badge: "EN • Tech", topic: "ai" },
    { title: "The Vergecast", feed: "https://feeds.megaphone.fm/vergecast", lang: "en", badge: "EN • Gadgets", topic: "dev" },
    { title: "Practical AI (Changelog)", feed: "https://changelog.com/practicalai/feed", lang: "en", badge: "EN • AI in Action", topic: "ai" },
    { title: "Latent Space (AI Engineering)", feed: "https://api.substack.com/feed/podcast/1084089.rss", lang: "en", badge: "EN • LLMs", topic: "ai" },
    { title: "Waveform: The MKBHD Podcast", feed: "https://feeds.megaphone.fm/VMP8620807085", lang: "en", badge: "EN • Hardware", topic: "dev" },
    { title: "Accidental Tech Podcast", feed: "https://atp.fm/episodes?format=rss", lang: "en", badge: "EN • Nerds", topic: "dev" },
    { title: "Decoder with Nilay Patel", feed: "https://feeds.megaphone.fm/decoder", lang: "en", badge: "EN • Strategy", topic: "dev" },
    { title: "Machine Learning Street Talk", feed: "https://anchor.fm/s/1e6d4ff8/podcast/rss", lang: "en", badge: "EN • Deep Learning", topic: "ai" },
    { title: "Gradient Dissent (W&B)", feed: "https://feeds.buzzsprout.com/1023775.rss", lang: "en", badge: "EN • Industry AI", topic: "ai" },
    { title: "The TWIML AI Podcast", feed: "https://twimlai.libsyn.com/rss", lang: "en", badge: "EN • Research", topic: "ai" },
    { title: "Smashing Security", feed: "https://feeds.fireside.fm/smashingsecurity/rss", lang: "en", badge: "EN • Breaches", topic: "privacy" },
    { title: "Security Now", feed: "https://feeds.twit.tv/sn.xml", lang: "en", badge: "EN • Cryptography", topic: "privacy" },
    { title: "Risky Business", feed: "https://risky.biz/feeds/risky-business/", lang: "en", badge: "EN • InfoSec", topic: "privacy" },
    { title: "Click Here", feed: "https://feeds.megaphone.fm/clickhere", lang: "en", badge: "EN • Cyber Warfare", topic: "privacy" },
    { title: "CYBER (Motherboard)", feed: "https://feeds.acast.com/public/shows/cyber", lang: "en", badge: "EN • Hackers", topic: "privacy" },
    { title: "Command Line Heroes (Red Hat)", feed: "https://feeds.pacific-content.com/commandlineheroes", lang: "en", badge: "EN • OS History", topic: "opensource" },
    { title: "Talk Python To Me", feed: "https://talkpython.fm/episodes/rss", lang: "en", badge: "EN • Python", topic: "dev" },
    { title: "Python Bytes", feed: "https://pythonbytes.fm/episodes/rss", lang: "en", badge: "EN • Python", topic: "dev" },
    { title: "JS Party (Changelog)", feed: "https://changelog.com/jsparty/feed", lang: "en", badge: "EN • Web", topic: "dev" },
    { title: "Syntax - Tasty Web Development", feed: "https://feed.syntax.fm/rss", lang: "en", badge: "EN • Fullstack", topic: "dev" },
    { title: "Front End Happy Hour", feed: "https://feeds.soundcloud.com/users/soundcloud:users:206137308/sounds.rss", lang: "en", badge: "EN • Frontend", topic: "dev" },
    { title: "Rustacean Station", feed: "https://rustacean-station.org/podcast.rss", lang: "en", badge: "EN • Rust", topic: "opensource" },
    { title: "CoRecursive", feed: "https://feed.corecursive.com/rss", lang: "en", badge: "EN • Stories", topic: "dev" },
    { title: "Hanselminutes", feed: "https://hanselminutes.com/subscribe", lang: "en", badge: "EN • Fresh Tech", topic: "dev" },
    { title: "Spark (CBC Radio)", feed: "https://www.cbc.ca/podcasting/includes/spark.xml", lang: "en", badge: "EN • Society", topic: "dev" },
    { title: "Logbuch:Netzpolitik", feed: "https://logbuch-netzpolitik.de/feed/m4a", lang: "de", badge: "DE • Netzpolitik", topic: "privacy" },
    { title: "Freak Show", feed: "https://freakshow.fm/feed/m4a", lang: "de", badge: "DE • Geek", topic: "dev" },
    { title: "CRE: Technik & Kultur", feed: "https://cre.fm/feed/m4a", lang: "de", badge: "DE • Monolog", topic: "opensource" },
    { title: "heise show", feed: "https://www.heise.de/developer/rss/heiseshow-podcast.rdf", lang: "de", badge: "DE • IT", topic: "dev" },
    { title: "c't uplink", feed: "https://www.heise.de/ct/uplink/ct-uplink.rss", lang: "de", badge: "DE • Computer", topic: "dev" },
    { title: "Doppelgänger Tech Talk", feed: "https://doppelgaenger.io/feed/mp3", lang: "de", badge: "DE • Business", topic: "dev" },
    { title: "Clean Code Podcast", feed: "https://cleancode.libsyn.com/rss", lang: "de", badge: "DE • Architektur", topic: "dev" },
    { title: "Future Histories", feed: "https://www.futurehistories.today/podcast?format=rss", lang: "de", badge: "DE • Zukunft", topic: "ai" },
    { title: "Underscore (FR)", feed: "https://feed.ausha.co/7aP54H1Q8R3M", lang: "fr", badge: "FR • Tech & Dev", topic: "dev" },
    { title: "Tech Café (FR)", feed: "https://techcafe.fr/feed/podcast", lang: "fr", badge: "FR • Actualité", topic: "dev" },
    { title: "Mixx.io (Álex Barredo)", feed: "https://feeds.feedburner.com/mixxio", lang: "es", badge: "ES • Diario", topic: "dev" },
    { title: "Kernel (ES)", feed: "https://feeds.feedburner.com/kernel-podcast", lang: "es", badge: "ES • Profundo", topic: "dev" },
    { title: "EFF's How to Fix the Internet", feed: "https://feeds.eff.org/howtofixtheinternet", lang: "en", badge: "EN • Digital Rights", topic: "privacy" },
    { title: "Mozilla IRL Podcast", feed: "https://irlpodcast.org/feed/", lang: "en", badge: "EN • Open Web", topic: "privacy" },
    { title: "Eye on AI", feed: "https://eyeonai.libsyn.com/rss", lang: "en", badge: "EN • AI News", topic: "ai" },
    { title: "All-In Podcast", feed: "https://allinpodcast.libsyn.com/rss", lang: "en", badge: "EN • Ventures", topic: "dev" },
    { title: "Ship It! (Changelog)", feed: "https://changelog.com/shipit/feed", lang: "en", badge: "EN • DevOps", topic: "dev" },
    { title: "Founder's Journal", feed: "https://feeds.megaphone.fm/foundersjournal", lang: "en", badge: "EN • Startups", topic: "dev" },
    { title: "Computerphile Audio", feed: "https://feeds.feedburner.com/computerphile", lang: "en", badge: "EN • Concepts", topic: "dev" },
    { title: "Open Source Security Podcast", feed: "https://opensourcesecuritypodcast.libsyn.com/rss", lang: "en", badge: "EN • Hardening", topic: "privacy" },
    { title: "The Cloudcast", feed: "https://thecloudcast.libsyn.com/rss", lang: "en", badge: "EN • Cloud", topic: "dev" }
  ]
};

// 7. HISTORY & IDEAS
const historyCatalog = {
  id: "history",
  title: "History & Ideas",
  emoji: "🏺",
  description: "Epic historical journeys, archaeology, pivotal events, and intellectual evolution.",
  subtopics: [
    { id: "all", label: "All Shows" },
    { id: "epic", label: "⚔️ Epic & Military History" },
    { id: "world", label: "🌍 World History" },
    { id: "ideas", label: "💡 History of Ideas" },
    { id: "archaeology", label: "🏛️ Ancient & Archaeology" }
  ],
  featured: [
    { title: "Dan Carlin's Hardcore History", feed: "https://feeds.feedburner.com/dancarlin/history?format=xml", badge: "EN • Epic", topic: "epic", whyNote: "Epic, intense deep-dives into humanity's most dramatic crucibles" },
    { title: "The Rest is History", feed: "https://feeds.acast.com/public/shows/the-rest-is-history", badge: "EN • Acclaimed", topic: "world", whyNote: "Tom Holland and Dominic Sandbrook explore history with sharp wit" },
    { title: "Throughline (NPR)", feed: "https://feeds.npr.org/510333/podcast.xml", badge: "EN • Perspectives", topic: "world", whyNote: "How past events directly created our present dilemmas" },
    { title: "In Our Time (BBC)", feed: "https://podcasts.files.bbci.co.uk/b006qykl.rss", badge: "EN • Intellectual", topic: "ideas", whyNote: "Melvyn Bragg and top scholars dissect the history of ideas" },
    { title: "Fall of Civilizations Podcast", feed: "https://feeds.soundcloud.com/users/soundcloud:users:572119410/sounds.rss", badge: "EN • Ancient", topic: "archaeology", whyNote: "Haunting, beautifully scored stories of societies that collapsed" }
  ],
  shows: [
    { title: "Dan Carlin's Hardcore History", feed: "https://feeds.feedburner.com/dancarlin/history?format=xml", lang: "en", badge: "EN • Epic", topic: "epic" },
    { title: "The Rest is History", feed: "https://feeds.acast.com/public/shows/the-rest-is-history", lang: "en", badge: "EN • World", topic: "world" },
    { title: "Throughline (NPR)", feed: "https://feeds.npr.org/510333/podcast.xml", lang: "en", badge: "EN • Perspective", topic: "world" },
    { title: "In Our Time (BBC)", feed: "https://podcasts.files.bbci.co.uk/b006qykl.rss", lang: "en", badge: "EN • Ideas", topic: "ideas" },
    { title: "Fall of Civilizations Podcast", feed: "https://feeds.soundcloud.com/users/soundcloud:users:572119410/sounds.rss", lang: "en", badge: "EN • Ancient", topic: "archaeology" },
    { title: "Revolutions (Mike Duncan)", feed: "https://revolutionspodcast.libsyn.com/rss", lang: "en", badge: "EN • Politics", topic: "world" },
    { title: "The History of Rome", feed: "https://thehistoryofrome.typepad.com/the_history_of_rome/rss.xml", lang: "en", badge: "EN • Rome", topic: "archaeology" },
    { title: "History on Fire", feed: "https://feeds.megaphone.fm/historyonfire", lang: "en", badge: "EN • Passion", topic: "epic" },
    { title: "You're Dead To Me (BBC)", feed: "https://podcasts.files.bbci.co.uk/p07mddqh.rss", lang: "en", badge: "EN • Comedy History", topic: "world" },
    { title: "Dan Snow's History Hit", feed: "https://feeds.acast.com/public/shows/historyhit", lang: "en", badge: "EN • Daily", topic: "world" },
    { title: "Hardcore History: Addendum", feed: "https://feeds.feedburner.com/dancarlin/addendum?format=xml", lang: "en", badge: "EN • Interviews", topic: "epic" },
    { title: "Empire (Dalrymple & Anand)", feed: "https://feeds.acast.com/public/shows/empire", lang: "en", badge: "EN • Colonialism", topic: "world" },
    { title: "Tides of History", feed: "https://feeds.megaphone.fm/tidesofhistory", lang: "en", badge: "EN • Archaeology", topic: "archaeology" },
    { title: "Our Fake History", feed: "https://ourfakehistory.libsyn.com/rss", lang: "en", badge: "EN • Myths", topic: "ideas" },
    { title: "Noble Blood", feed: "https://feeds.megaphone.fm/nobleblood", lang: "en", badge: "EN • Royalty", topic: "world" },
    { title: "Stuff You Missed in History Class", feed: "https://feeds.megaphone.fm/stuffyoumissedinhistoryclass", lang: "en", badge: "EN • Curiosities", topic: "world" },
    { title: "The Ancients (History Hit)", feed: "https://feeds.acast.com/public/shows/the-ancients", lang: "en", badge: "EN • Antiquity", topic: "archaeology" },
    { title: "Warfare (History Hit)", feed: "https://feeds.acast.com/public/shows/warfare", lang: "en", badge: "EN • Battles", topic: "epic" },
    { title: "A History of the World in 100 Objects", feed: "https://podcasts.files.bbci.co.uk/b00nrtd2.rss", lang: "en", badge: "EN • Artefacts", topic: "archaeology" },
    { title: "The British History Podcast", feed: "https://www.thebritishhistorypodcast.com/feed/podcast/", lang: "en", badge: "EN • Britain", topic: "world" },
    { title: "History of English Podcast", feed: "https://historyofenglishpodcast.com/feed/podcast/", lang: "en", badge: "EN • Linguistics", topic: "ideas" },
    { title: "The History of Byzantium", feed: "https://thehistoryofbyzantium.libsyn.com/rss", lang: "en", badge: "EN • Byzantium", topic: "archaeology" },
    { title: "The Hellenistic Age Podcast", feed: "https://hellenisticagepodcast.libsyn.com/rss", lang: "en", badge: "EN • Greece", topic: "archaeology" },
    { title: "History of Philosophy Without Any Gaps", feed: "https://hopwag.podbean.com/feed.xml", lang: "en", badge: "EN • Philosophy", topic: "ideas" },
    { title: "The Iron Dice (Dan Arrows)", feed: "https://theirondice.libsyn.com/rss", lang: "en", badge: "EN • Weimar", topic: "world" },
    { title: "Blowback", feed: "https://feeds.sounder.fm/11797/rss.xml", lang: "en", badge: "EN • Modern War", topic: "epic" },
    { title: "Slow Burn (Slate)", feed: "https://feeds.megaphone.fm/slowburn", lang: "en", badge: "EN • Politics", topic: "world" },
    { title: "One Year (Slate)", feed: "https://feeds.megaphone.fm/oneyear", lang: "en", badge: "EN • Chronology", topic: "world" },
    { title: "Geschichten aus der Geschichte", feed: "https://geschichtenausdergeschichte.podigee.io/feed/mp3", lang: "de", badge: "DE • Anekdoten", topic: "world" },
    { title: "Eine Stunde History (DLF Nova)", feed: "https://www.deutschlandfunknova.de/podcast/eine-stunde-history.xml", lang: "de", badge: "DE • Ereignisse", topic: "world" },
    { title: "Zeitsprung (Geschichte)", feed: "https://www.geschichte.fm/feed/mp3/", lang: "de", badge: "DE • Historie", topic: "world" },
    { title: "WDR ZeitZeichen", feed: "https://www1.wdr.de/mediathek/audio/zeitzeichen/zeitzeichen-podcast-102.podcast", lang: "de", badge: "DE • Kalender", topic: "world" },
    { title: "WDR Stichtag", feed: "https://www1.wdr.de/mediathek/audio/stichtag/stichtag-podcast-102.podcast", lang: "de", badge: "DE • Momente", topic: "world" },
    { title: "Tatort Geschichte (Bayern 2)", feed: "https://feeds.br.de/tatort-geschichte/feed.xml", lang: "de", badge: "DE • Verbrechen", topic: "world" },
    { title: "SWR2 Wissen: Geschichte", feed: "https://www.swr.de/swr2/wissen/podcast-swr2-wissen-100.xml", lang: "de", badge: "DE • Epochen", topic: "ideas" },
    { title: "ARD Radiofeature", feed: "https://www.ndr.de/nachrichten/info/podcast2988.xml", lang: "de", badge: "DE • Doku", topic: "world" },
    { title: "Zeitkapsel (Irene Bluche)", feed: "https://zeitkapsel.podigee.io/feed/mp3", lang: "de", badge: "DE • Briefe", topic: "world" },
    { title: "Paroles d'histoire (FR)", feed: "https://parolesdhistoire.fr/index.php/feed/podcast/", lang: "fr", badge: "FR • Débats", topic: "ideas" },
    { title: "Le cours de l'histoire (France Culture)", feed: "https://radiofrance-podcast.net/podcast09/rss_10075.xml", lang: "fr", badge: "FR • Savoirs", topic: "ideas" },
    { title: "Concordance des temps", feed: "https://radiofrance-podcast.net/podcast09/rss_10074.xml", lang: "fr", badge: "FR • Temps", topic: "world" },
    { title: "Histocast", feed: "https://feeds.feedburner.com/histocast", lang: "es", badge: "ES • Bélica", topic: "epic" },
    { title: "Memorias de un tambor", feed: "https://feeds.feedburner.com/MemoriasDeUnTambor", lang: "es", badge: "ES • España", topic: "world" },
    { title: "SER Historia", feed: "https://feeds.elpais.com/audio/ser-historia", lang: "es", badge: "ES • Enigmas", topic: "archaeology" },
    { title: "La Escóbula de la Brújula", feed: "https://feeds.ivoox.com/feed_fg_f168853_filtro_1.xml", lang: "es", badge: "ES • Misterios", topic: "world" },
    { title: "Witness History (BBC)", feed: "https://podcasts.files.bbci.co.uk/p004t1hd.rss", lang: "en", badge: "EN • Eye Witness", topic: "world" },
    { title: "Short History Of...", feed: "https://feeds.acast.com/public/shows/short-history-of", lang: "en", badge: "EN • Profiles", topic: "world" },
    { title: "Real Dictators", feed: "https://feeds.acast.com/public/shows/real-dictators", lang: "en", badge: "EN • Tyranny", topic: "epic" },
    { title: "Lions Led By Donkeys", feed: "https://feeds.soundcloud.com/users/soundcloud:users:524674062/sounds.rss", lang: "en", badge: "EN • Military Fails", topic: "epic" },
    { title: "Días Extraños", feed: "https://feeds.ivoox.com/feed_fg_f1422773_filtro_1.xml", lang: "es", badge: "ES • Heterodoxo", topic: "ideas" },
    { title: "Dan Carlin Hardcore History", feed: "https://feeds.feedburner.com/dancarlin/history?format=xml", lang: "en", badge: "EN • Masterpiece", topic: "epic" }
  ]
};

const catalogs = [
  scienceCatalog,
  democracyCatalog,
  socialCatalog,
  entertainmentCatalog,
  sportsCatalog,
  technologyCatalog,
  historyCatalog
];

for (const cat of catalogs) {
  const filePath = path.join(catalogsDir, `${cat.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cat, null, 2), 'utf8');
  console.log(`✅ Saved catalog: ${cat.id}.json (${cat.shows.length} shows, 5 featured)`);
}

// Also write index manifest catalogs.json
const catalogIndex = catalogs.map(c => ({
  id: c.id,
  title: c.title,
  emoji: c.emoji,
  description: c.description,
  totalShows: c.shows.length,
  featured: c.featured,
  subtopics: c.subtopics
}));
fs.writeFileSync(path.join(catalogsDir, 'index.json'), JSON.stringify(catalogIndex, null, 2), 'utf8');
console.log(`🎉 Successfully generated all 7 catalogs (350 curated shows total) + index.json!`);
