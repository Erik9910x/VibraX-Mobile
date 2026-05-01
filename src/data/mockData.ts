export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  imageUrl: string;
  previewUrl: string | null;
  source: 'spotify' | 'soundcloud' | 'mock';
  externalUrl: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  tracks: Track[];
  createdAt: string;
  shareCode: string;
  userId: string;
  isPinned?: boolean;
}

export interface Artist {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  listeners: number;
}

export interface Genre {
  id: string;
  name: string;
  color: string;
  imageUrl: string;
}

// Default empty playlists — user will populate with real tracks from search/discover
export const mockPlaylists: Playlist[] = [];

// No more fake mock tracks — all music comes from Deezer API now
export const mockTracks: Track[] = [];
export const mockArtists: Artist[] = [];
export const mockGenres: Genre[] = [];

export const moodCategories = [
  { id: 'mood1', name: 'Chill Nights', emoji: '🌙', color: 'from-indigo-600 to-blue-800', trackIds: [] as string[] },
  { id: 'mood2', name: 'Workout Energy', emoji: '🔥', color: 'from-red-600 to-orange-600', trackIds: [] as string[] },
  { id: 'mood3', name: 'Sad Hours', emoji: '💔', color: 'from-purple-700 to-indigo-900', trackIds: [] as string[] },
  { id: 'mood4', name: 'Party Mode', emoji: '🎉', color: 'from-yellow-500 to-pink-500', trackIds: [] as string[] },
  { id: 'mood5', name: 'Focus Flow', emoji: '🧠', color: 'from-teal-600 to-cyan-700', trackIds: [] as string[] },
  { id: 'mood6', name: 'Road Trip', emoji: '🚗', color: 'from-green-600 to-emerald-700', trackIds: [] as string[] },
];
