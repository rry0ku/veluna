export interface GenreInfo {
  id: string;
  label: string;
  tagline: string;
  artists: string[];
  genreTerms: string[];
  exclusions?: string[];
  keywords: string[];
  compiledExclusions?: RegExp | null;
  compiledArtists?: RegExp | null;
  compiledTerms?: RegExp | null;
}

export const GENRES: GenreInfo[] = [
  {
    id: 'hiphop',
    label: 'Hip-Hop / Rap',
    tagline: 'Beats, bars & street rhythms',
    artists: [
      'kendrick lamar', 'drake', 'kanye west', 'eminem', '21 savage', 'travis scott',
      'j. cole', 'j cole', 'future', 'metro boomin', 'playboi carti', 'lil uzi vert',
      'juice wrld', 'polo g', 'gunna', 'offset', 'quavo', 'dababy', 'roddy ricch',
      'pooh shiesty', 'moneybagg yo', 'don toliver', 'asap rocky', 'cardi b',
      'nicki minaj', 'lil baby', 'lil durk', 'young thug', 'jack harlow',
      'central cee', 'dave', 'stormzy', 'ice spice', 'pop smoke', 'tyler the creator',
      'mac miller', 'trippie redd', 'xxxtentacion', 'kodak black', 'denzel curry',
      'nle choppa', 'youngboy never broke again', 'nba youngboy', 'lil wayne',
      'snoop dogg', '50 cent', 'tupac', '2pac', 'notorious b.i.g.', 'biggie smalls',
      'jay-z', 'nas', 'dr. dre', 'ice cube', 'outkast', 'lupe fiasco', 'chance the rapper',
      'logic', 'joyner lucas', 'jid', 'earthgang', 'ski mask the slump god',
      'vince staples', 'pusha t', 'denzel curry', 'asap ferg', 'amine', 'sheck wes'
    ],
    genreTerms: [
      'hip-hop', 'hip hop', 'freestyle cypher', 'drill rap', 'trap beat', 'rap music',
      'boom bap', 'boombap', 'rap freestyle', 'hiphop mix', 'rap cypher'
    ],
    exclusions: ['pop punk', 'k-pop', 'kpop', 'piano sonata', 'smooth jazz', 'phonk drift'],
    keywords: []
  },
  {
    id: 'kpop',
    label: 'K-Pop',
    tagline: 'Seoul rhythms & idol anthems',
    artists: [
      'bts', 'bangtan', 'blackpink', 'twice', 'exo', 'stray kids', 'seventeen',
      'nct', 'nct 127', 'nct dream', 'nct u', 'wayv', 'red velvet', 'aespa', 'ive',
      'newjeans', 'new jeans', 'itzy', 'le sserafim', 'lesserafim', 'illit',
      'babymonster', 'enhypen', 'tomorrow x together', 'txt', 'ateez', 'the boyz',
      'monsta x', 'treasure', 'got7', 'shinee', 'bigbang', 'big bang', '2ne1',
      'super junior', 'superm', 'girls generation', 'snsd', 'iu', 'taeyeon',
      'baekhyun', 'jungkook', 'jimin', 'agust d', 'suga', 'j-hope', 'jhope',
      'g-dragon', 'gdragon', 'jennie', 'jisoo', 'lisa', 'rosé', 'mamamoo',
      'hwasa', 'stayc', 'nmixx', 'kep1er', 'everglow', 'dreamcatcher', 'loona',
      'artms', 'loossemble', 'chuu', 'clc', '(g)i-dle', 'gidle', 'iz*one', 'izone',
      'sf9', 'pentagon', 'victon', 'cravity', 'oneus', 'p1harmony', 'riize',
      'tws', 'boynextdoor', 'zerobaseone', 'zb1', 'xikers', 'kiss of life',
      'triple s', 'triples', 'katseye', 'vcha', 'day6', 'xdinary heroes', 'the rose',
      'akmu', 'bol4', 'chungha', 'sunmi', 'hyuna', 'taemin', 'wonho', 'kang daniel',
      'woodz', 'jeon somi', 'somi', 'psy', 'boa', 'tvxq', 'highlight', 'btob',
      'wanna one', 'astro', 'wjsn', 'cosmic girls', 'fromis_9', 'fromis 9',
      'woo!ah!', 'cignature', 'purple kiss', 'billlie', 'h1-key',
      'kwon eun bi', 'jo yuri', 'yena', 'choi yena', 'heize'
    ],
    genreTerms: [
      'kpop', 'k-pop', 'k pop', 'korean pop', 'hallyu', 'kpop dance', 'kpop comeback'
    ],
    exclusions: ['conan gray', 'don toliver', 'the five stairsteps', 'five stairsteps', 'the midnight', 'kordhell'],
    keywords: []
  },
  {
    id: 'pop',
    label: 'Pop',
    tagline: 'Chart toppers & infectious melodies',
    artists: [
      'taylor swift', 'ariana grande', 'billie eilish', 'the weeknd', 'olivia rodrigo',
      'dua lipa', 'harry styles', 'justin bieber', 'ed sheeran', 'selena gomez',
      'shawn mendes', 'camila cabello', 'the chainsmokers', 'imagine dragons',
      'maroon 5', 'conan gray', 'chappell roan', 'sabrina carpenter', 'katy perry',
      'lady gaga', 'bruno mars', 'tate mcrae', 'miley cyrus', 'charlie puth',
      'halsey', 'lorde', 'sia', 'sam smith', 'adele', 'rihanna', 'beyonce',
      'britney spears', 'madonna', 'kesha', 'bebe rexha', 'alessia cara',
      'meghan trainor', 'ava max', 'rita ora', 'troye sivan', 'shakira',
      'kelly clarkson', 'pink', 'p!nk', 'carly rae jepsen',
      'ellie goulding', 'jason derulo', 'pitbull', 'keshi', 'lauv', 'lizzo'
    ],
    genreTerms: [
      'pop music', 'pop hit', 'pop anthem', 'dance pop', 'electropop',
      'teen pop', 'pop song', 'mainstream pop', 'synth pop anthem'
    ],
    exclusions: ['k-pop', 'kpop', 'heavy metal', 'death metal', 'drift phonk'],
    keywords: []
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    tagline: 'Retro-futuristic neon dreams',
    artists: [
      'kavinsky', 'carpenter brut', 'the midnight', 'gunship', 'timecop1983',
      'fm-84', 'fm 84', 'perturbator', 'dynatron', 'dance with the dead',
      'scandroid', 'mitch murder', 'com truse', 'lazerhawk', 'trevor something',
      'mega drive', 'dan terminus', 'robert parker', 'waveshaper', 'miami nights 1984',
      'droid bishop', 'le matos', 'power glove', 'volkor x', 'futurecop!'
    ],
    genreTerms: [
      'synthwave', 'retrowave', 'outrun', 'darksynth', 'dreamwave', 'retro wave',
      '80s synth', 'cyberpunk synth', 'synthwave mix', 'retrowave mix', 'spacewave'
    ],
    exclusions: ['hip-hop', 'trap beat', 'k-pop'],
    keywords: []
  },
  {
    id: 'lofi',
    label: 'Lo-Fi',
    tagline: 'Warm tape hiss & chill study beats',
    artists: [
      'nujabes', 'chilledcow', 'lofi girl', 'potsu', 'kupla', 'jinsang', 'saib',
      'idealism', 'bsd.u', 'wun two', 'elijah who', 'tomppabeats', 'swum',
      'birocratic', 'in love with a ghost', 'sarcastic sounds', 'eevee', 'sopico',
      'flovry', 'tender spring', 'mell-ø', 'casiio', 'mondoloops', 'kreaem'
    ],
    genreTerms: [
      'lofi', 'lo-fi', 'lo fi', 'chillhop', 'chill beats', 'study beats',
      'lofi beats', 'lofi hip hop', 'relaxing beats', 'sleep beats', 'coffee beats',
      'cozy beats', 'mellow beats', 'lofi study', 'chill study music'
    ],
    exclusions: ['heavy metal', 'deathcore', 'hardstyle', 'drift phonk'],
    keywords: []
  },
  {
    id: 'rock',
    label: 'Rock & Metal',
    tagline: 'Overdriven guitars & heavy anthems',
    artists: [
      'linkin park', 'nirvana', 'green day', 'foo fighters', 'system of a down',
      'metallica', 'ac/dc', 'acdc', 'guns n roses', 'guns n\' roses', 'queen',
      'led zeppelin', 'arctic monkeys', 'radiohead', 'muse', 'twenty one pilots',
      'bring me the horizon', 'bmth', 'slipknot', 'fall out boy', 'my chemical romance',
      'paramore', 'blink-182', 'blink 182', 'deftones', 'red hot chili peppers',
      'rhcp', 'iron maiden', 'black sabbath', 'pink floyd', 'the beatles',
      'the rolling stones', 'aerosmith', 'bon jovi', 'pearl jam', 'soundgarden',
      'alice in chains', 'korn', 'limp bizkit', 'rage against the machine',
      'ratm', 'avenged sevenfold', 'a7x', 'three days grace', 'skillet',
      'shinedown', 'disturbed', 'papa roach', 'sum 41', 'the offspring',
      'weezer', 'the killers', 'the strokes', 'oasis', 'coldplay', 'u2',
      'audioslave', 'evanescence', 'breaking benjamin', 'rise against', 'seether'
    ],
    genreTerms: [
      'alternative rock', 'hard rock', 'heavy metal', 'punk rock', 'indie rock',
      'grunge rock', 'rock band', 'rock anthem', 'death metal', 'metalcore',
      'deathcore', 'nu metal', 'pop punk', 'post-hardcore', 'post-grunge',
      'progressive metal', 'thrash metal'
    ],
    exclusions: ['k-pop', 'kpop', 'amapiano', 'reggaeton'],
    keywords: []
  },
  {
    id: 'rnb',
    label: 'R&B / Soul',
    tagline: 'Smooth grooves & heartfelt soul',
    artists: [
      'frank ocean', 'sza', 'daniel caesar', 'jorja smith', 'h.e.r.', 'bryson tiller',
      'partynextdoor', 'brent faiyaz', 'khalid', 'usher', 'alicia keys', 'john legend',
      'maxwell', 'erykah badu', 'd\'angelo', 'summer walker', 'kehlani', 'snoh aalegra',
      'giveon', 'chris brown', 'miguel', 'tory lanez', 'trey songz', 'ne-yo', 'neyo',
      'musiq soulchild', 'anthony hamilton', 'lauryn hill', 'mariah carey',
      'toni braxton', 'boyz ii men', 'jhene aiko', 'chlöe', 'victoria monet',
      'masego', 'lucky daye', 'sir', 'ravyn lenae', 'cleo sol', 'arizona zervas',
      'the five stairsteps', 'five stairsteps', 'stevie wonder', 'marvin gaye', 'sam cooke', 'aretha franklin'
    ],
    genreTerms: [
      'r&b', 'rnb', 'contemporary r&b', 'neo soul', 'neo-soul', 'soul music',
      'rhythm and blues', 'motown classics', 'slow jams', 'r&b soul'
    ],
    exclusions: ['k-pop', 'kpop', 'heavy metal', 'drift phonk'],
    keywords: []
  },
  {
    id: 'edm',
    label: 'EDM / Dance',
    tagline: 'Club bangers & festival drops',
    artists: [
      'martin garrix', 'david guetta', 'tiesto', 'avicii', 'marshmello', 'skrillex',
      'deadmau5', 'flume', 'diplo', 'zedd', 'alan walker', 'kygo', 'calvin harris',
      'illenium', 'hardwell', 'subtronics', 'fred again', 'swedish house mafia',
      'axwell', 'ingrosso', 'alesso', 'afrojack', 'dj snake', 'steve aoki',
      'kaskade', 'porter robinson', 'madeon', 'galantis', 'major lazer', 'rezz',
      'excision', 'san holo', 'gryffin', 'said the sky', 'rl grime', 'knock2',
      'isoknock', 'sub focus', 'dimension', 'pendulum', 'chase & status', 'disclosure'
    ],
    genreTerms: [
      'electronic dance music', 'edm festival', 'future bass', 'dubstep drop',
      'drum and bass', 'drum & bass', 'dnb track', 'tech house', 'deep house mix',
      'progressive house', 'big room house', 'trance music', 'hardstyle mix',
      'melodic bass', 'festival mix', 'club banger'
    ],
    exclusions: ['lofi hip hop', 'acoustic piano', 'orchestra'],
    keywords: []
  },
  {
    id: 'jazz',
    label: 'Jazz & Blues',
    tagline: 'Improvisations, brass & acoustic swing',
    artists: [
      'miles davis', 'john coltrane', 'bill evans', 'thelonious monk', 'duke ellington',
      'charlie parker', 'herbie hancock', 'wynton marsalis', 'louis armstrong',
      'nina simone', 'chet baker', 'dave brubeck', 'stan getz', 'art blakey',
      'charles mingus', 'sonny rollins', 'ella fitzgerald', 'billie holiday',
      'sarah vaughan', 'oscar peterson', 'wes montgomery', 'chick corea',
      'kamasi washington', 'robert glasper', 'norah jones', 'diana krall',
      'al jarreau', 'george benson', 'ahmad jamal', 'cannonball adderley'
    ],
    genreTerms: [
      'smooth jazz', 'bebop', 'hard bop', 'jazz fusion', 'cool jazz', 'jazz trio',
      'jazz quartet', 'big band jazz', 'acoustic jazz', 'jazz standard', 'jazz ballad',
      'jazz improvisation', 'jazz club'
    ],
    exclusions: ['heavy metal', 'drift phonk', 'drill rap'],
    keywords: []
  },
  {
    id: 'classical',
    label: 'Classical',
    tagline: 'Symphonies, concertos & piano sonatas',
    artists: [
      'ludwig van beethoven', 'beethoven', 'wolfgang amadeus mozart', 'mozart',
      'johann sebastian bach', 'j.s. bach', 'frederic chopin', 'chopin',
      'claude debussy', 'debussy', 'johannes brahms', 'brahms', 'franz schubert',
      'schubert', 'antonio vivaldi', 'vivaldi', 'george frideric handel', 'handel',
      'franz liszt', 'liszt', 'pyotr ilyich tchaikovsky', 'tchaikovsky',
      'sergei rachmaninoff', 'rachmaninoff', 'gustav mahler', 'mahler',
      'richard wagner', 'wagner', 'felix mendelssohn', 'mendelssohn',
      'giuseppe verdi', 'verdi', 'giacomo puccini', 'puccini', 'antonin dvorak',
      'dvorak', 'maurice ravel', 'ravel', 'igor stravinsky', 'stravinsky',
      'johann strauss', 'strauss', 'camille saint-saens', 'edvard grieg', 'grieg',
      'ludovico einaudi', 'einaudi', 'max richter', 'yiruma', 'yo-yo ma', 'lang lang'
    ],
    genreTerms: [
      'symphony orchestra', 'piano sonata', 'violin concerto', 'piano concerto',
      'cello suite', 'string quartet', 'philharmonic orchestra', 'nocturne op',
      'prelude op', 'valse op', 'classical piano', 'classical orchestra',
      'classical composition', 'concerto in', 'sonata in', 'nocturne in'
    ],
    exclusions: ['rap', 'hip-hop', 'phonk', 'edm', 'k-pop'],
    keywords: []
  },
  {
    id: 'afrobeats',
    label: 'Afrobeats',
    tagline: 'West African rhythms & Amapiano basslines',
    artists: [
      'burna boy', 'wizkid', 'davido', 'rema', 'omah lay', 'ckay', 'tems',
      'ayra starr', 'fireboy dml', 'asake', 'asaké', 'kizz daniel', 'oxlade',
      'ruger', 'victony', 'adekunle gold', 'joeboy', 'shallipopi', 'tiwa savage',
      'buju', 'bnxn', 'fela kuti', 'yemi alade', 'diamond platnumz', 'flavour',
      'master kg', 'musa keys', 'focalistic', 'kabza de small', 'dj maphorisa', 'tyla'
    ],
    genreTerms: [
      'afrobeats', 'afrobeat', 'amapiano', 'afro-fusion', 'afropop',
      'naija music', 'afro pop mix', 'amapiano mix', 'afrobeats mix'
    ],
    exclusions: ['heavy metal', 'death metal', 'synthwave'],
    keywords: []
  },
  {
    id: 'latin',
    label: 'Latin',
    tagline: 'Reggaeton heat & tropical percussion',
    artists: [
      'bad bunny', 'j balvin', 'maluma', 'ozuna', 'daddy yankee', 'nicky jam',
      'jhayco', 'jhay cortez', 'anuel aa', 'karol g', 'rosalia', 'rosalía',
      'shakira', 'romeo santos', 'rauw alejandro', 'peso pluma', 'feid',
      'myke towers', 'sech', 'becky g', 'natti natasha', 'enrique iglesias',
      'ricky martin', 'luis fonsi', 'marc anthony', 'prince royce', 'calle 13',
      'residente', 'bizarrap', 'quevedo', 'morat', 'camilo', 'sebastian yatra',
      'fuerza regida', 'grupo frontera', 'junior h', 'natanael cano'
    ],
    genreTerms: [
      'reggaeton', 'bachata', 'salsa music', 'cumbia', 'corridos tumbados',
      'musica latina', 'latin pop', 'latin urban', 'urbano latino', 'dembow'
    ],
    exclusions: ['k-pop', 'kpop', 'heavy metal', 'death metal'],
    keywords: []
  },
  {
    id: 'slowed',
    label: 'Slowed + Reverb',
    tagline: 'Atmospheric pitched-down night drives',
    artists: [],
    genreTerms: [
      'slowed and reverb', 'slowed + reverb', 'slowed reverb', 'slowed & reverb',
      'slowed + reverberated', 'slowed down + reverb', 'slowed down reverb',
      'slowed to perfection', 'nightcore slowed', 'reverb slowed', 'slowed reverbed'
    ],
    exclusions: [],
    keywords: []
  },
  {
    id: 'phonk',
    label: 'Phonk',
    tagline: 'Memphis cowbells & drift basslines',
    artists: [
      'kordhell', 'ghostemane', 'night lovell', 'playaphonk', 'hxvrmxn', 'gpx',
      'lxst cxntury', 'dxrk', 'interworld', 'hensonn', 'pharmacist', 'shadxwbxrn',
      'plxntydxrk', 'scarlxrd', 'yatashigang', 'mitch murder', 'freddie dredd',
      'haartx', 'cowbell cult', 'sxmpra', 'cursed', 'prxjek'
    ],
    genreTerms: [
      'drift phonk', 'aggressive phonk', 'gym phonk', 'dark phonk',
      'brazilian phonk', 'memphis phonk', 'phonk music', 'phonk drift',
      'phonk mix', 'cowbell phonk'
    ],
    exclusions: ['imagine dragons', 'conan gray', 'taylor swift'],
    keywords: []
  },
];

function buildRegex(items?: string[]): RegExp | null {
  if (!items || items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`(^|[^\\p{L}\\p{N}])(?:${escaped})($|[^\\p{L}\\p{N}])`, 'ui');
}

GENRES.forEach(g => {
  g.keywords = Array.from(new Set([...g.artists, ...g.genreTerms]));
  g.compiledExclusions = buildRegex(g.exclusions);
  g.compiledArtists = buildRegex(g.artists);
  g.compiledTerms = buildRegex(g.genreTerms);
});

function testBoundaryMatch(source: string, target: string): boolean {
  if (!source || !target) return false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'ui');
  return regex.test(source);
}

export function matchGenreTrack(
  track: { title?: string; artist?: string },
  genre: GenreInfo
): boolean {
  if (!track) return false;
  const title = (track.title || '').trim().toLowerCase();
  const artist = (track.artist || '').trim().toLowerCase();
  if (!title && !artist) return false;
  const fullText = `${title} ${artist}`.trim();

  if (genre.compiledExclusions && genre.compiledExclusions.test(fullText)) {
    return false;
  }

  if (artist && genre.compiledArtists && genre.compiledArtists.test(artist)) {
    return true;
  }

  if (
    title &&
    genre.compiledArtists &&
    (title.includes('-') || title.includes('feat') || title.includes('ft.') || title.includes('prod')) &&
    genre.compiledArtists.test(title)
  ) {
    return true;
  }

  if (title && genre.compiledTerms && genre.compiledTerms.test(title)) {
    return true;
  }

  return false;
}

export function matchGenreKeywords(text: string, keywords: string[]): boolean {
  if (!text || !keywords || keywords.length === 0) return false;
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (testBoundaryMatch(lower, kw)) {
      return true;
    }
  }
  return false;
}

export interface OnboardingCategory {
  id: string;
  label: string;
  subtitle: string;
  artists: string[];
}

export const ONBOARDING_MUSIC_CATEGORIES: OnboardingCategory[] = [
  {
    id: 'pop',
    label: 'English / Global Pop',
    subtitle: 'Chart-topping hits, viral anthems & pop icons',
    artists: ['The Weeknd', 'Taylor Swift', 'Billie Eilish', 'Bruno Mars', 'Dua Lipa', 'Olivia Rodrigo', 'Ariana Grande', 'Ed Sheeran', 'Sabrina Carpenter', 'Justin Bieber']
  },
  {
    id: 'hiphop',
    label: 'Hip-Hop / Rap',
    subtitle: 'Heavy 808s, lyrical bars & street anthems',
    artists: ['Kendrick Lamar', 'Drake', 'Travis Scott', 'Eminem', 'Kanye West', '21 Savage', 'J. Cole', 'Juice WRLD', 'Future', 'Metro Boomin']
  },
  {
    id: 'kpop',
    label: 'K-Pop',
    subtitle: 'Korean idol hits, choreography & synths',
    artists: ['BTS', 'BLACKPINK', 'NewJeans', 'TWICE', 'Stray Kids', 'LE SSERAFIM', 'ENHYPEN', 'aespa', 'SEVENTEEN', 'IVE']
  },
  {
    id: 'jpop',
    label: 'J-Pop & Anime',
    subtitle: 'Anime themes, city pop & Tokyo electronic',
    artists: ['YOASOBI', 'Kenshi Yonezu', 'Ado', 'LiSA', 'Eve', 'Radwimps', 'Fujii Kaze', 'Aimer', 'Miki Matsubara']
  },
  {
    id: 'edm',
    label: 'EDM / Dance',
    subtitle: 'Club anthems, house drops & festival bass',
    artists: ['Martin Garrix', 'Avicii', 'Calvin Harris', 'Alan Walker', 'Marshmello', 'David Guetta', 'Skrillex', 'Kygo', 'Fred again..', 'Zedd']
  },
  {
    id: 'rock',
    label: 'Rock & Alternative',
    subtitle: 'Electric guitars, hard riffs & stadium anthems',
    artists: ['Linkin Park', 'Queen', 'Nirvana', 'Metallica', 'Green Day', 'Arctic Monkeys', 'Imagine Dragons', 'Coldplay', 'Foo Fighters', 'AC/DC']
  },
  {
    id: 'indie',
    label: 'Indie & Folk',
    subtitle: 'Acoustic vibes, bedroom pop & singer-songwriters',
    artists: ['Phoebe Bridgers', 'Lorde', 'Hozier', 'Clairo', 'Bon Iver', 'Mac DeMarco', 'Boygenius', 'Mitski', 'Cigarettes After Sex']
  },
  {
    id: 'lofi',
    label: 'Lo-Fi & Chillhop',
    subtitle: 'Cozy study beats, tape hiss & mellow keys',
    artists: ['Lofi Girl', 'Potsu', 'Jinsang', 'Nujabes', 'Idealism', 'Kupla', 'Saib', 'Elijah Who', 'Tomppabeats']
  },
  {
    id: 'rnb',
    label: 'R&B & Soul',
    subtitle: 'Smooth harmonies, neo-soul & late night grooves',
    artists: ['SZA', 'Frank Ocean', 'Daniel Caesar', 'Khalid', 'Brent Faiyaz', 'Giveon', 'H.E.R.', 'Bryson Tiller', 'Summer Walker']
  },
  {
    id: 'latin',
    label: 'Latin & Reggaeton',
    subtitle: 'Tropical rhythms, dembow & urban heat',
    artists: ['Bad Bunny', 'J Balvin', 'Peso Pluma', 'Rosalía', 'Karol G', 'Daddy Yankee', 'Rauw Alejandro', 'Feid', 'Maluma']
  },
  {
    id: 'classical',
    label: 'Classical & Piano',
    subtitle: 'Piano concertos, cinematic scores & symphonies',
    artists: ['Ludovico Einaudi', 'Hans Zimmer', 'Yiruma', 'Max Richter', 'Beethoven', 'Mozart', 'Chopin', 'Yo-Yo Ma']
  },
  {
    id: 'phonk',
    label: 'Phonk & Drift',
    subtitle: 'Memphis cowbells, bass distortions & drift sound',
    artists: ['Kordhell', 'DVRST', 'Dxrk', 'Hensonn', 'Ghostemane', 'Interworld', 'Pharmacist', 'SXMPRA']
  },
  {
    id: 'afrobeats',
    label: 'Afrobeats & Amapiano',
    subtitle: 'West African rhythms & log-drum grooves',
    artists: ['Burna Boy', 'Rema', 'Wizkid', 'Tems', 'Asake', 'Ayra Starr', 'Davido', 'CKay', 'Tyla']
  },
  {
    id: 'hindi',
    label: 'Hindi / Bollywood',
    subtitle: 'Melodies, romance & contemporary film hits',
    artists: ['Arijit Singh', 'Shreya Ghoshal', 'A.R. Rahman', 'Pritam', 'Atif Aslam', 'KK', 'Anuv Jain', 'Sonu Nigam', 'Darshan Raval', 'Mohit Chauhan']
  },
  {
    id: 'punjabi',
    label: 'Punjabi',
    subtitle: 'High energy beats, bhangra & modern wave',
    artists: ['Diljit Dosanjh', 'AP Dhillon', 'Sidhu Moose Wala', 'Karan Aujla', 'Shubh', 'Gurinder Gill', 'B Praak', 'PropheC', 'Amrinder Gill']
  },
  {
    id: 'tamil',
    label: 'Tamil / Kollywood',
    subtitle: 'South Indian film magic, mass beats & melodies',
    artists: ['Anirudh Ravichander', 'A.R. Rahman', 'Sid Sriram', 'Yuvan Shankar Raja', 'Harris Jayaraj', 'Santhosh Narayanan', 'Pradeep Kumar']
  },
  {
    id: 'telugu',
    label: 'Telugu / Tollywood',
    subtitle: 'Energetic melodies, mass anthems & lyrical classics',
    artists: ['Thaman S', 'Devi Sri Prasad', 'Sid Sriram', 'Ram Miriyala', 'Anurag Kulkarni', 'Armaan Malik', 'Shreya Ghoshal']
  },
  {
    id: 'bengali',
    label: 'Bengali / Bangla Hits',
    subtitle: 'Soulful melodies, Rabindra Sangeet & modern pop',
    artists: ['Arijit Singh', 'Anupam Roy', 'Shreya Ghoshal', 'Shaan', 'Rupankar Bagchi', 'Somlata Acharyya', 'Lagnajita Chakraborty']
  },
  {
    id: 'sufi',
    label: 'Ghazals & Sufi',
    subtitle: 'Qawwali, spiritual transcendence & poetic ghazals',
    artists: ['Nusrat Fateh Ali Khan', 'Rahat Fateh Ali Khan', 'Jagjit Singh', 'Abida Parveen', 'Satinder Sartaaj', 'Kailash Kher', 'Wadali Brothers']
  },
  {
    id: 'reggae',
    label: 'Reggae & Dancehall',
    subtitle: 'Island grooves, positive vibrations & roots reggae',
    artists: ['Bob Marley', 'Damian Marley', 'Sean Paul', 'Chronixx', 'Popcaan', 'Koffee', 'Shaggy', 'Shenseea', 'Buju Banton']
  },
  {
    id: 'country',
    label: 'Country & Americana',
    subtitle: 'Storytelling, acoustic guitars & Southern roots',
    artists: ['Morgan Wallen', 'Luke Combs', 'Zach Bryan', 'Chris Stapleton', 'Kacey Musgraves', 'Post Malone', 'Dolly Parton', 'Taylor Swift']
  },
  {
    id: 'synthwave',
    label: 'Synthwave & Retrowave',
    subtitle: '80s analog nostalgia, neon driving & outrun',
    artists: ['The Midnight', 'GUNSHIP', 'Kavinsky', 'Carpenter Brut', 'Timecop1983', 'FM-84', 'Perturbator', 'Trevor Something']
  },
  {
    id: 'metal',
    label: 'Heavy Metal & Metalcore',
    subtitle: 'Heavy distortion, double-kick drums & screams',
    artists: ['Metallica', 'Iron Maiden', 'Slipknot', 'Avenged Sevenfold', 'Bring Me The Horizon', 'Architects', 'Rammstein', 'System of a Down']
  },
  {
    id: 'jazz',
    label: 'Jazz & Blues',
    subtitle: 'Improvisations, brass swing & smoky blues',
    artists: ['Miles Davis', 'John Coltrane', 'Bill Evans', 'Norah Jones', 'Chet Baker', 'Louis Armstrong', 'Ella Fitzgerald', 'Robert Glasper']
  }
];

export const CURATED_STARTER_TRACKS: Record<string, Array<{ title: string; artist: string; duration: string; url: string; cover: string }>> = {
  hindi: [
    { title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: '4:22', url: 'https://www.youtube.com/watch?v=Umqb9KENgmk', cover: 'https://i.ytimg.com/vi/Umqb9KENgmk/mqdefault.jpg' },
    { title: 'Kesariya', artist: 'Arijit Singh & Pritam', duration: '4:28', url: 'https://www.youtube.com/watch?v=BddP6PYo2gs', cover: 'https://i.ytimg.com/vi/BddP6PYo2gs/mqdefault.jpg' },
    { title: 'Apna Bana Le', artist: 'Arijit Singh & Sachin-Jigar', duration: '4:21', url: 'https://www.youtube.com/watch?v=ElZfdU54Cp8', cover: 'https://i.ytimg.com/vi/ElZfdU54Cp8/mqdefault.jpg' },
    { title: 'Channa Mereya', artist: 'Arijit Singh & Pritam', duration: '4:49', url: 'https://www.youtube.com/watch?v=284Ov7ysmfA', cover: 'https://i.ytimg.com/vi/284Ov7ysmfA/mqdefault.jpg' },
    { title: 'Raataan Lambiyan', artist: 'Tanishk Bagchi & Jubin Nautiyal', duration: '3:50', url: 'https://www.youtube.com/watch?v=gvyUuxdRdR4', cover: 'https://i.ytimg.com/vi/gvyUuxdRdR4/mqdefault.jpg' },
    { title: 'Agar Tum Saath Ho', artist: 'Alka Yagnik & Arijit Singh', duration: '5:41', url: 'https://www.youtube.com/watch?v=sK7riqg2mr4', cover: 'https://i.ytimg.com/vi/sK7riqg2mr4/mqdefault.jpg' },
    { title: 'Husn', artist: 'Anuv Jain', duration: '3:38', url: 'https://www.youtube.com/watch?v=gJLVTKhTnog', cover: 'https://i.ytimg.com/vi/gJLVTKhTnog/mqdefault.jpg' },
    { title: 'Kun Faya Kun', artist: 'A.R. Rahman, Javed Ali & Mohit Chauhan', duration: '7:53', url: 'https://www.youtube.com/watch?v=T94PHkuydcw', cover: 'https://i.ytimg.com/vi/T94PHkuydcw/mqdefault.jpg' },
  ],
  punjabi: [
    { title: 'Brown Munde', artist: 'AP Dhillon, Gurinder Gill & Shinda Kahlon', duration: '4:07', url: 'https://www.youtube.com/watch?v=VNs_cCtdbPc', cover: 'https://i.ytimg.com/vi/VNs_cCtdbPc/mqdefault.jpg' },
    { title: 'Excuses', artist: 'AP Dhillon & Gurinder Gill', duration: '2:56', url: 'https://www.youtube.com/watch?v=vX2cDW8LUWk', cover: 'https://i.ytimg.com/vi/vX2cDW8LUWk/mqdefault.jpg' },
    { title: 'Softly', artist: 'Karan Aujla & Ikky', duration: '2:35', url: 'https://www.youtube.com/watch?v=cWMxCE2HTag', cover: 'https://i.ytimg.com/vi/cWMxCE2HTag/mqdefault.jpg' },
    { title: 'Lover', artist: 'Diljit Dosanjh', duration: '3:05', url: 'https://www.youtube.com/watch?v=mH_LFkWxpI0', cover: 'https://i.ytimg.com/vi/mH_LFkWxpI0/mqdefault.jpg' },
    { title: 'No Love', artist: 'Shubh', duration: '2:50', url: 'https://www.youtube.com/watch?v=xR3V5Ow2dTI', cover: 'https://i.ytimg.com/vi/xR3V5Ow2dTI/mqdefault.jpg' },
    { title: 'Winning Speech', artist: 'Karan Aujla & Mxrci', duration: '3:22', url: 'https://www.youtube.com/watch?v=hB9T5p9wU9A', cover: 'https://i.ytimg.com/vi/hB9T5p9wU9A/mqdefault.jpg' },
  ],
  pop: [
    { title: 'Blinding Lights', artist: 'The Weeknd', duration: '3:20', url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ', cover: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg' },
    { title: 'Cruel Summer', artist: 'Taylor Swift', duration: '2:58', url: 'https://www.youtube.com/watch?v=ic8j13piAhQ', cover: 'https://i.ytimg.com/vi/ic8j13piAhQ/mqdefault.jpg' },
    { title: 'Birds of a Feather', artist: 'Billie Eilish', duration: '3:30', url: 'https://www.youtube.com/watch?v=V9PVRfjEBTI', cover: 'https://i.ytimg.com/vi/V9PVRfjEBTI/mqdefault.jpg' },
    { title: 'Die With A Smile', artist: 'Lady Gaga & Bruno Mars', duration: '4:11', url: 'https://www.youtube.com/watch?v=kPa7bsKwL-c', cover: 'https://i.ytimg.com/vi/kPa7bsKwL-c/mqdefault.jpg' },
    { title: 'Starboy', artist: 'The Weeknd ft. Daft Punk', duration: '3:50', url: 'https://www.youtube.com/watch?v=34Na4j8AVgA', cover: 'https://i.ytimg.com/vi/34Na4j8AVgA/mqdefault.jpg' },
    { title: 'Espresso', artist: 'Sabrina Carpenter', duration: '2:55', url: 'https://www.youtube.com/watch?v=eVli-tstM5E', cover: 'https://i.ytimg.com/vi/eVli-tstM5E/mqdefault.jpg' },
  ],
  hiphop: [
    { title: 'Not Like Us', artist: 'Kendrick Lamar', duration: '4:34', url: 'https://www.youtube.com/watch?v=H58vbez_m4E', cover: 'https://i.ytimg.com/vi/H58vbez_m4E/mqdefault.jpg' },
    { title: 'FE!N', artist: 'Travis Scott ft. Playboi Carti', duration: '3:11', url: 'https://www.youtube.com/watch?v=B9synWjqBn8', cover: 'https://i.ytimg.com/vi/B9synWjqBn8/mqdefault.jpg' },
    { title: "God's Plan", artist: 'Drake', duration: '3:18', url: 'https://www.youtube.com/watch?v=xpVfcZ0ZcFM', cover: 'https://i.ytimg.com/vi/xpVfcZ0ZcFM/mqdefault.jpg' },
    { title: 'HUMBLE.', artist: 'Kendrick Lamar', duration: '2:57', url: 'https://www.youtube.com/watch?v=tvTRZJ-4EyI', cover: 'https://i.ytimg.com/vi/tvTRZJ-4EyI/mqdefault.jpg' },
    { title: 'Lucid Dreams', artist: 'Juice WRLD', duration: '3:59', url: 'https://www.youtube.com/watch?v=mzB1VGEGcSU', cover: 'https://i.ytimg.com/vi/mzB1VGEGcSU/mqdefault.jpg' },
  ],
  kpop: [
    { title: 'Dynamite', artist: 'BTS', duration: '3:19', url: 'https://www.youtube.com/watch?v=gdZLi9oWNZg', cover: 'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg' },
    { title: 'How You Like That', artist: 'BLACKPINK', duration: '3:01', url: 'https://www.youtube.com/watch?v=ioNng23DkIM', cover: 'https://i.ytimg.com/vi/ioNng23DkIM/mqdefault.jpg' },
    { title: 'Super Shy', artist: 'NewJeans', duration: '2:34', url: 'https://www.youtube.com/watch?v=ArmDp-zijuc', cover: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg' },
    { title: 'Seven', artist: 'Jung Kook ft. Latto', duration: '3:04', url: 'https://www.youtube.com/watch?v=QU9c0053UAU', cover: 'https://i.ytimg.com/vi/QU9c0053UAU/mqdefault.jpg' },
  ],
  jpop: [
    { title: 'Idol (アイドル)', artist: 'YOASOBI', duration: '3:33', url: 'https://www.youtube.com/watch?v=ZRtdQ81jPUQ', cover: 'https://i.ytimg.com/vi/ZRtdQ81jPUQ/mqdefault.jpg' },
    { title: 'Racing into the Night (夜に駆ける)', artist: 'YOASOBI', duration: '4:21', url: 'https://www.youtube.com/watch?v=x8VYWazR5mE', cover: 'https://i.ytimg.com/vi/x8VYWazR5mE/mqdefault.jpg' },
    { title: 'Stay With Me', artist: 'Miki Matsubara', duration: '4:59', url: 'https://www.youtube.com/watch?v=VEe_yIbW64w', cover: 'https://i.ytimg.com/vi/VEe_yIbW64w/mqdefault.jpg' },
    { title: 'Shinunoga E-Wa', artist: 'Fujii Kaze', duration: '3:05', url: 'https://www.youtube.com/watch?v=dFf4AgBNR1E', cover: 'https://i.ytimg.com/vi/dFf4AgBNR1E/mqdefault.jpg' },
  ],
  edm: [
    { title: 'Animals', artist: 'Martin Garrix', duration: '2:56', url: 'https://www.youtube.com/watch?v=gCYcTmT9wx4', cover: 'https://i.ytimg.com/vi/gCYcTmT9wx4/mqdefault.jpg' },
    { title: 'Levels', artist: 'Avicii', duration: '3:19', url: 'https://www.youtube.com/watch?v=_ovdm2yX4MA', cover: 'https://i.ytimg.com/vi/_ovdm2yX4MA/mqdefault.jpg' },
    { title: 'Faded', artist: 'Alan Walker', duration: '3:32', url: 'https://www.youtube.com/watch?v=60ItHLz5WEA', cover: 'https://i.ytimg.com/vi/60ItHLz5WEA/mqdefault.jpg' },
    { title: 'Wake Me Up', artist: 'Avicii', duration: '4:07', url: 'https://www.youtube.com/watch?v=IcrbM1l_BoI', cover: 'https://i.ytimg.com/vi/IcrbM1l_BoI/mqdefault.jpg' },
  ],
  rock: [
    { title: 'In the End', artist: 'Linkin Park', duration: '3:36', url: 'https://www.youtube.com/watch?v=eVTXPUF4Oz4', cover: 'https://i.ytimg.com/vi/eVTXPUF4Oz4/mqdefault.jpg' },
    { title: 'Numb', artist: 'Linkin Park', duration: '3:07', url: 'https://www.youtube.com/watch?v=kXYiU_JCYtU', cover: 'https://i.ytimg.com/vi/kXYiU_JCYtU/mqdefault.jpg' },
    { title: 'Bohemian Rhapsody', artist: 'Queen', duration: '5:55', url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', cover: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg' },
    { title: 'Smells Like Teen Spirit', artist: 'Nirvana', duration: '5:01', url: 'https://www.youtube.com/watch?v=hTWKbfoikeg', cover: 'https://i.ytimg.com/vi/hTWKbfoikeg/mqdefault.jpg' },
  ],
  indie: [
    { title: 'Take Me to Church', artist: 'Hozier', duration: '4:02', url: 'https://www.youtube.com/watch?v=PVjiKRfKpPI', cover: 'https://i.ytimg.com/vi/PVjiKRfKpPI/mqdefault.jpg' },
    { title: 'Motion Sickness', artist: 'Phoebe Bridgers', duration: '3:50', url: 'https://www.youtube.com/watch?v=9sfYpolGCu8', cover: 'https://i.ytimg.com/vi/9sfYpolGCu8/mqdefault.jpg' },
    { title: 'Apocalypse', artist: 'Cigarettes After Sex', duration: '4:50', url: 'https://www.youtube.com/watch?v=sElE_BfQ67s', cover: 'https://i.ytimg.com/vi/sElE_BfQ67s/mqdefault.jpg' },
  ],
  lofi: [
    { title: 'Aruarian Dance', artist: 'Nujabes', duration: '4:10', url: 'https://www.youtube.com/watch?v=g9hwjQBQFIo', cover: 'https://i.ytimg.com/vi/g9hwjQBQFIo/mqdefault.jpg' },
    { title: 'Feather', artist: 'Nujabes', duration: '2:55', url: 'https://www.youtube.com/watch?v=P5-2--445AM', cover: 'https://i.ytimg.com/vi/P5-2--445AM/mqdefault.jpg' },
    { title: 'Affection', artist: 'Jinsang', duration: '2:15', url: 'https://www.youtube.com/watch?v=p4vW7B4jXbQ', cover: 'https://i.ytimg.com/vi/p4vW7B4jXbQ/mqdefault.jpg' },
  ],
  rnb: [
    { title: 'Kill Bill', artist: 'SZA', duration: '2:33', url: 'https://www.youtube.com/watch?v=MSRcC626prw', cover: 'https://i.ytimg.com/vi/MSRcC626prw/mqdefault.jpg' },
    { title: 'Snooze', artist: 'SZA', duration: '3:21', url: 'https://www.youtube.com/watch?v=LDY_Xa77HwE', cover: 'https://i.ytimg.com/vi/LDY_Xa77HwE/mqdefault.jpg' },
    { title: 'Best Part', artist: 'Daniel Caesar ft. H.E.R.', duration: '3:29', url: 'https://www.youtube.com/watch?v=vBy7FaapGRo', cover: 'https://i.ytimg.com/vi/vBy7FaapGRo/mqdefault.jpg' },
  ],
  latin: [
    { title: 'Monaco', artist: 'Bad Bunny', duration: '4:27', url: 'https://www.youtube.com/watch?v=gT_u_fO_QhU', cover: 'https://i.ytimg.com/vi/gT_u_fO_QhU/mqdefault.jpg' },
    { title: 'Ella Baila Sola', artist: 'Eslabon Armado & Peso Pluma', duration: '2:45', url: 'https://www.youtube.com/watch?v=lZiaYpNdC60', cover: 'https://i.ytimg.com/vi/lZiaYpNdC60/mqdefault.jpg' },
  ],
  classical: [
    { title: 'Nuvole Bianche', artist: 'Ludovico Einaudi', duration: '5:57', url: 'https://www.youtube.com/watch?v=4VR-6AS0-l4', cover: 'https://i.ytimg.com/vi/4VR-6AS0-l4/mqdefault.jpg' },
    { title: 'River Flows in You', artist: 'Yiruma', duration: '3:08', url: 'https://www.youtube.com/watch?v=7maJOI3QMu0', cover: 'https://i.ytimg.com/vi/7maJOI3QMu0/mqdefault.jpg' },
    { title: 'Experience', artist: 'Ludovico Einaudi', duration: '5:15', url: 'https://www.youtube.com/watch?v=hN_q-_nGv4U', cover: 'https://i.ytimg.com/vi/hN_q-_nGv4U/mqdefault.jpg' },
  ],
  phonk: [
    { title: 'Murder in My Mind', artist: 'KORDHELL', duration: '2:25', url: 'https://www.youtube.com/watch?v=w-sQRS-MT9k', cover: 'https://i.ytimg.com/vi/w-sQRS-MT9k/mqdefault.jpg' },
    { title: 'Close Eyes', artist: 'DVRST', duration: '2:12', url: 'https://www.youtube.com/watch?v=ytQ5CYE1VZw', cover: 'https://i.ytimg.com/vi/ytQ5CYE1VZw/mqdefault.jpg' },
  ],
  afrobeats: [
    { title: 'Calm Down', artist: 'Rema', duration: '3:39', url: 'https://www.youtube.com/watch?v=CQLsdm1ZYAw', cover: 'https://i.ytimg.com/vi/CQLsdm1ZYAw/mqdefault.jpg' },
    { title: 'Last Last', artist: 'Burna Boy', duration: '2:52', url: 'https://www.youtube.com/watch?v=421w1j87fEM', cover: 'https://i.ytimg.com/vi/421w1j87fEM/mqdefault.jpg' },
    { title: 'Water', artist: 'Tyla', duration: '3:20', url: 'https://www.youtube.com/watch?v=XoiOOiuH8iI', cover: 'https://i.ytimg.com/vi/XoiOOiuH8iI/mqdefault.jpg' },
  ],
  tamil: [
    { title: 'Hukum - Thalaivar Alappara', artist: 'Anirudh Ravichander', duration: '3:27', url: 'https://www.youtube.com/watch?v=1F3hm6MrsuY', cover: 'https://i.ytimg.com/vi/1F3hm6MrsuY/mqdefault.jpg' },
    { title: 'Arabic Kuthu', artist: 'Anirudh Ravichander & Jonita Gandhi', duration: '4:40', url: 'https://www.youtube.com/watch?v=KUN5Uf9mObQ', cover: 'https://i.ytimg.com/vi/KUN5Uf9mObQ/mqdefault.jpg' },
    { title: 'Enjoy Enjaami', artist: 'Dhee ft. Arivu & Santhosh Narayanan', duration: '4:53', url: 'https://www.youtube.com/watch?v=eYq7WapuDLU', cover: 'https://i.ytimg.com/vi/eYq7WapuDLU/mqdefault.jpg' },
  ],
  telugu: [
    { title: 'Oo Antava Mava Oo Oo Antava', artist: 'Indravathi Chauhan & Devi Sri Prasad', duration: '3:48', url: 'https://www.youtube.com/watch?v=uK8f26q6b30', cover: 'https://i.ytimg.com/vi/uK8f26q6b30/mqdefault.jpg' },
    { title: 'Ramuloo Ramulaa', artist: 'Anurag Kulkarni & Thaman S', duration: '4:18', url: 'https://www.youtube.com/watch?v=gT_SjS2q_C8', cover: 'https://i.ytimg.com/vi/gT_SjS2q_C8/mqdefault.jpg' },
    { title: 'Inkem Inkem Inkem Kaavaale', artist: 'Sid Sriram & Gopi Sundar', duration: '4:28', url: 'https://www.youtube.com/watch?v=mQcsoXhX_Qo', cover: 'https://i.ytimg.com/vi/mQcsoXhX_Qo/mqdefault.jpg' },
  ],
  bengali: [
    { title: 'Tumi Robe Nirobe', artist: 'Arijit Singh', duration: '4:15', url: 'https://www.youtube.com/watch?v=hOEv7q6x9n8', cover: 'https://i.ytimg.com/vi/hOEv7q6x9n8/mqdefault.jpg' },
    { title: 'Amake Amar Moto Thakte Dao', artist: 'Anupam Roy', duration: '4:49', url: 'https://www.youtube.com/watch?v=6P3h1Ckgv08', cover: 'https://i.ytimg.com/vi/6P3h1Ckgv08/mqdefault.jpg' },
  ],
  sufi: [
    { title: 'Afreen Afreen', artist: 'Rahat Fateh Ali Khan & Momina Mustehsan', duration: '6:45', url: 'https://www.youtube.com/watch?v=kw4tT7SCmaY', cover: 'https://i.ytimg.com/vi/kw4tT7SCmaY/mqdefault.jpg' },
    { title: 'Tajdar-e-Haram', artist: 'Atif Aslam', duration: '10:28', url: 'https://www.youtube.com/watch?v=a18py61ZWg4', cover: 'https://i.ytimg.com/vi/a18py61ZWg4/mqdefault.jpg' },
    { title: 'Chaap Tilak', artist: 'Abida Parveen & Rahat Fateh Ali Khan', duration: '7:56', url: 'https://www.youtube.com/watch?v=H3Hl3Yf5_8M', cover: 'https://i.ytimg.com/vi/H3Hl3Yf5_8M/mqdefault.jpg' },
  ],
  reggae: [
    { title: 'Three Little Birds', artist: 'Bob Marley & The Wailers', duration: '3:00', url: 'https://www.youtube.com/watch?v=LanCLS_hIo4', cover: 'https://i.ytimg.com/vi/LanCLS_hIo4/mqdefault.jpg' },
    { title: 'Toast', artist: 'Koffee', duration: '3:11', url: 'https://www.youtube.com/watch?v=p8HoEvDh70Y', cover: 'https://i.ytimg.com/vi/p8HoEvDh70Y/mqdefault.jpg' },
  ],
  country: [
    { title: 'Last Night', artist: 'Morgan Wallen', duration: '2:44', url: 'https://www.youtube.com/watch?v=yPkWbV84mEE', cover: 'https://i.ytimg.com/vi/yPkWbV84mEE/mqdefault.jpg' },
    { title: 'Fast Car', artist: 'Luke Combs', duration: '4:25', url: 'https://www.youtube.com/watch?v=4Gz53wH6c_k', cover: 'https://i.ytimg.com/vi/4Gz53wH6c_k/mqdefault.jpg' },
  ],
  synthwave: [
    { title: 'Sunset', artist: 'The Midnight', duration: '5:26', url: 'https://www.youtube.com/watch?v=rdbS0j0wN68', cover: 'https://i.ytimg.com/vi/rdbS0j0wN68/mqdefault.jpg' },
    { title: 'Nightcall', artist: 'Kavinsky', duration: '4:19', url: 'https://www.youtube.com/watch?v=MV_3Dpw-BRY', cover: 'https://i.ytimg.com/vi/MV_3Dpw-BRY/mqdefault.jpg' },
  ],
  metal: [
    { title: 'Master of Puppets', artist: 'Metallica', duration: '8:35', url: 'https://www.youtube.com/watch?v=E0ozmU9cJDg', cover: 'https://i.ytimg.com/vi/E0ozmU9cJDg/mqdefault.jpg' },
    { title: 'Duality', artist: 'Slipknot', duration: '4:12', url: 'https://www.youtube.com/watch?v=6fVE8kSM43I', cover: 'https://i.ytimg.com/vi/6fVE8kSM43I/mqdefault.jpg' },
  ],
  jazz: [
    { title: 'So What', artist: 'Miles Davis', duration: '9:22', url: 'https://www.youtube.com/watch?v=zqNTltOGh5c', cover: 'https://i.ytimg.com/vi/zqNTltOGh5c/mqdefault.jpg' },
    { title: "Don't Know Why", artist: 'Norah Jones', duration: '3:05', url: 'https://www.youtube.com/watch?v=tO4dxvguQDk', cover: 'https://i.ytimg.com/vi/tO4dxvguQDk/mqdefault.jpg' },
  ]
};

export function getStarterRecommendations(preferences?: { languages?: string[]; genres?: string[]; artists?: string[] }): Array<{ id: number; title: string; artist: string; duration: string; url: string; cover: string }> {
  const chosenCategories = new Set<string>();
  
  if (preferences?.languages?.length) {
    preferences.languages.forEach(l => chosenCategories.add(l.toLowerCase()));
  }
  if (preferences?.genres?.length) {
    preferences.genres.forEach(g => chosenCategories.add(g.toLowerCase()));
  }

  let pool: Array<{ title: string; artist: string; duration: string; url: string; cover: string }> = [];

  if (chosenCategories.size > 0) {
    chosenCategories.forEach(cat => {
      const tracks = CURATED_STARTER_TRACKS[cat];
      if (tracks) {
        pool.push(...tracks);
      }
    });
  }

  if (pool.length === 0) {
    // ONLY if user didn't pick ANY category or genre at all, use default global pop/hiphop
    pool = [
      ...(CURATED_STARTER_TRACKS['pop'] || []),
      ...(CURATED_STARTER_TRACKS['hiphop'] || []),
      ...(CURATED_STARTER_TRACKS['rock'] || []),
      ...(CURATED_STARTER_TRACKS['edm'] || [])
    ];
  }

  // Fisher-Yates shuffle pool
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  // Prioritize tracks matching chosen favorite artists
  const favoriteArtists = (preferences?.artists || []).map(a => a.toLowerCase().trim()).filter(Boolean);
  if (favoriteArtists.length > 0) {
    shuffled.sort((a, b) => {
      const aMatches = favoriteArtists.some(fa => a.artist.toLowerCase().includes(fa) || a.title.toLowerCase().includes(fa));
      const bMatches = favoriteArtists.some(fa => b.artist.toLowerCase().includes(fa) || b.title.toLowerCase().includes(fa));
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0;
    });
  }

  const uniqueUrls = new Set<string>();
  const finalTracks: Array<{ id: number; title: string; artist: string; duration: string; url: string; cover: string }> = [];

  for (let i = 0; i < shuffled.length && finalTracks.length < 15; i++) {
    const t = shuffled[i];
    if (!uniqueUrls.has(t.url)) {
      uniqueUrls.add(t.url);
      finalTracks.push({
        id: Date.now() + Math.floor(Math.random() * 1000000) + finalTracks.length,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        url: t.url,
        cover: t.cover
      });
    }
  }

  // If we still need more tracks, ONLY take from chosenCategories (or pool), never unselected categories!
  if (finalTracks.length < 15) {
    for (const t of pool) {
      if (finalTracks.length >= 15) break;
      if (!uniqueUrls.has(t.url)) {
        uniqueUrls.add(t.url);
        finalTracks.push({
          id: Date.now() + Math.floor(Math.random() * 1000000) + finalTracks.length,
          title: t.title,
          artist: t.artist,
          duration: t.duration,
          url: t.url,
          cover: t.cover
        });
      }
    }
  }

  return finalTracks;
}

