'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Repeat, Repeat1, Shuffle, Heart, Mic2, Download, X,
  RotateCcw, RotateCw, ChevronDown, User, Menu, Music, Loader2
} from 'lucide-react';
import { usePlayerStore, useFavoritesStore } from '@/lib/store';
import { formatTime, cn } from '@/lib/utils';
import { getLyrics, parseSyncedLyrics, ParsedLyricLine } from '@/lib/lyrics';
import { motion, AnimatePresence } from 'framer-motion';

export default function FloatingPlayer({ onMenuClick }: { onMenuClick?: () => void }) {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const volume = usePlayerStore(s => s.volume);
  const isMuted = usePlayerStore(s => s.isMuted);
  const progress = usePlayerStore(s => s.progress);
  const duration = usePlayerStore(s => s.duration);
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const showLyrics = usePlayerStore(s => s.showLyrics);
  
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const previous = usePlayerStore(s => s.previous);
  const setVolume = usePlayerStore(s => s.setVolume);
  const toggleMute = usePlayerStore(s => s.toggleMute);
  const setProgress = usePlayerStore(s => s.setProgress);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const toggleRepeat = usePlayerStore(s => s.toggleRepeat);
  const setShowLyrics = usePlayerStore(s => s.setShowLyrics);

  const { isFavorite, toggleFavorite } = useFavoritesStore();
  const progressRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Full-Screen Lyrics State (using store)
  const [lyrics, setLyrics] = useState<ParsedLyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);
  const [isDownloading, setIsDownloading] = useState(false);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  
  // Initialize and clean up Audio
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = volume / 100;
    audioRef.current.setAttribute('playsinline', 'true');
    audioRef.current.setAttribute('webkit-playsinline', 'true');
    audioRef.current.preload = 'auto';
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Track Changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    // Reset Lyrics state when track changes
    setLyrics([]);
    setPlainLyrics(null);
    setActiveLyricIndex(-1);

    const initializeAudio = async () => {
      let audioUrl = currentTrack.previewUrl;
      
      // Always attempt to upgrade to full-length audio from JioSaavn
      // Skip only if the URL is already a JioSaavn/aac CDN URL (already full)
      const isAlreadyFull = audioUrl && (
        audioUrl.includes('aac.saavncdn.com') || 
        audioUrl.includes('saavn.com') ||
        audioUrl.includes('jiosaavn')
      );
      
      if (!isAlreadyFull && currentTrack.title && currentTrack.artist) {
        try {
          const res = await fetch(`/api/music/upgrade?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              audioUrl = data.url;
              console.log(`[VibraX] Upgraded to full track (${data.quality || 'auto'})`);
            }
          }
        } catch (e) {
          console.warn("[VibraX] Upgrade failed, using preview", e);
        }
      }

      if (audioUrl) {
        audio.src = audioUrl;
        audio.load();
        if (usePlayerStore.getState().isPlaying) audio.play().catch(() => {});
      } else {
        audio.src = '';
      }
    };

    initializeAudio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // Media Session API — Lock screen controls & background audio support
  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;
    
    const artwork = currentTrack.imageUrl ? [
      { src: currentTrack.imageUrl, sizes: '96x96', type: 'image/jpeg' },
      { src: currentTrack.imageUrl, sizes: '128x128', type: 'image/jpeg' },
      { src: currentTrack.imageUrl, sizes: '192x192', type: 'image/jpeg' },
      { src: currentTrack.imageUrl, sizes: '256x256', type: 'image/jpeg' },
      { src: currentTrack.imageUrl, sizes: '384x384', type: 'image/jpeg' },
      { src: currentTrack.imageUrl, sizes: '512x512', type: 'image/jpeg' },
    ] : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || 'VibraX',
      artwork: artwork,
    });

    // Update position state for seek bar on lock screen
    if ('setPositionState' in navigator.mediaSession && !isNaN(duration) && !isNaN(progress)) {
      navigator.mediaSession.setPositionState({
        duration: duration || 0,
        playbackRate: 1,
        position: progress || 0,
      });
    }

    navigator.mediaSession.setActionHandler('play', () => { togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { togglePlay(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { previous(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { next(); });
    navigator.mediaSession.setActionHandler('seekbackward', () => skipTime(-15));
    navigator.mediaSession.setActionHandler('seekforward', () => skipTime(15));
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
        setProgress(details.seekTime);
        // Force update media session position
        if ('setPositionState' in navigator.mediaSession) {
          navigator.mediaSession.setPositionState({
            duration: audioRef.current.duration,
            playbackRate: 1,
            position: details.seekTime
          });
        }
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [currentTrack, togglePlay, next, previous, setProgress]);

  // Sync MediaSession playback state
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      
      // Update position state periodically to keep it synced
      if (isPlaying && duration > 0 && !isNaN(duration) && !isNaN(progress) && 'setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: progress,
        });
      }
    }
  }, [isPlaying, progress, duration]);

  // Update Page Title when playing
  useEffect(() => {
    if (currentTrack && isPlaying) {
      document.title = `${currentTrack.title} | VibraX`;
    } else if (!currentTrack) {
      document.title = "VibraX";
    }
  }, [currentTrack, isPlaying]);

  // Pre-fetch the next track to eliminate wait time (Vercel Cache will serve it instantly)
  useEffect(() => {
    const state = usePlayerStore.getState();
    const queue = state.queue;
    const nextIndex = state.queueIndex + 1;
    if (nextIndex < queue.length) {
      const nextTrack = queue[nextIndex];
      if (nextTrack.id.match(/^\d+$/) && nextTrack.previewUrl?.includes('apple.com')) {
        // Ping the upgrade API silently
        fetch(`/api/music/upgrade?title=${encodeURIComponent(nextTrack.title)}&artist=${encodeURIComponent(nextTrack.artist)}`)
          .catch(() => {}); // ignore errors, it's just a prefetch
      }
    }
  }, [currentTrack?.id]);

  // Handle Play/Pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying && currentTrack?.previewUrl) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrack?.previewUrl]);

  // Handle Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume / 100;
  }, [volume, isMuted]);

  // Audio Events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      if (!isNaN(audio.duration)) setProgress(audio.currentTime);
    };
    const onEnded = () => {
      const state = usePlayerStore.getState();
      if (state.repeatMode === 'one') {
        // For Repeat One, we just reset and play again
        audio.currentTime = 0;
        setProgress(0);
        setTimeout(() => {
          audio.load(); // Reset buffer for iOS stability
          audio.play().catch(() => {});
        }, 100);
      } else {
        // For Repeat All or Off
        next();
        
        // Safety: If next() didn't change the track (e.g. single track queue with Repeat All)
        // we need to manually restart the audio since the track effect won't trigger.
        setTimeout(() => {
          const newState = usePlayerStore.getState();
          if (newState.currentTrack?.id === state.currentTrack?.id) {
            audio.currentTime = 0;
            setProgress(0);
            audio.load(); // Reset buffer for iOS stability
            audio.play().catch(() => {});
          }
        }, 100);
      }
    };
    
    const onLoadedMetadata = () => {
      if (!isNaN(audio.duration)) {
        usePlayerStore.getState().setDuration(audio.duration);
      }
    };
    
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [setProgress, next]);

  // Fallback Progress Simulation for tracks without audio
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isPlaying && currentTrack && !currentTrack.previewUrl) {
      intervalRef.current = setInterval(() => {
        const state = usePlayerStore.getState();
        if (state.progress + 0.25 >= state.duration) state.next();
        else usePlayerStore.setState({ progress: state.progress + 0.25 });
      }, 250);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, currentTrack]);

  // Background Waveform Visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let time = 0;
    let animId: number;
    function draw() {
      if (!ctx || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, `rgba(252,213,53,${isPlaying ? 0.15 : 0.02})`);
      grad.addColorStop(1, `rgba(240,185,11,${isPlaying ? 0.1 : 0.01})`);
      ctx.beginPath(); ctx.moveTo(0, h / 2);
      for (let x = 0; x < w; x += 2) {
        const amp = isPlaying ? 0.25 : 0.02;
        const y = h / 2 + Math.sin(x * 0.025 + time) * h * amp + Math.sin(x * 0.012 + time * 0.7) * h * amp * 0.6;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      if (isPlaying) time += 0.04;
      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Skip +/- 15 seconds
  const skipTime = useCallback((offset: number) => {
    const newTime = Math.max(0, Math.min(progress + offset, duration));
    setProgress(newTime);
    if (audioRef.current && currentTrack?.previewUrl) {
      audioRef.current.currentTime = newTime;
    }
  }, [progress, duration, setProgress, currentTrack?.previewUrl]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break;
        case 'KeyM': e.preventDefault(); toggleMute(); break;
        case 'KeyL': e.preventDefault(); if (currentTrack) setShowLyrics(!showLyrics); break;
        case 'ArrowRight': e.preventDefault(); skipTime(15); break;
        case 'ArrowLeft': e.preventDefault(); skipTime(-15); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, toggleMute, currentTrack, skipTime]);

  const fetchLyrics = useCallback(async () => {
    if (!currentTrack) return;
    setLyricsLoading(true);
    // Reset state before fetching
    setLyrics([]);
    setPlainLyrics(null);
    setActiveLyricIndex(-1);
    
    const data = await getLyrics(currentTrack.title, currentTrack.artist, currentTrack.album, currentTrack.duration);
    if (data) {
      if (data.syncedLyrics) {
        setLyrics(parseSyncedLyrics(data.syncedLyrics));
      }
      if (data.plainLyrics) {
        setPlainLyrics(data.plainLyrics);
      }
    }
    setLyricsLoading(false);
  }, [currentTrack]);

  // Auto-fetch lyrics in the background immediately when a track changes
  useEffect(() => {
    if (currentTrack) {
      fetchLyrics();
    }
  }, [currentTrack, fetchLyrics]);

  // Handle Lyrics Auto-Scrolling
  useEffect(() => {
    if (!showLyrics || lyrics.length === 0) return;
    
    // Anticipate lyrics by 0.2 second for tight audio-visual sync
    const idx = lyrics.findLastIndex(l => l.time <= progress + 0.2);
    
    if (idx !== activeLyricIndex && idx >= 0) {
      setActiveLyricIndex(idx);
      
      const container = lyricsContainerRef.current;
      const el = document.getElementById(`lyric-${idx}`);
      if (container && el) {
        // el.offsetTop is relative to the scroll container if it's the offsetParent
        // But scrollIntoView is safer since it calculates all that automatically
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [progress, lyrics, showLyrics, activeLyricIndex]);

  // Click on Lyrics to Seek
  const seekToLyric = (time: number) => {
    setProgress(time);
    if (audioRef.current && currentTrack?.previewUrl) {
      audioRef.current.currentTime = time;
    }
  };

  // Cursor drag handling of the Seekbar
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    seekToLyric(newTime);
  }, [duration, currentTrack?.previewUrl, setProgress]);

  // Download directly via Proxy API to force attachment
  const handleDownload = async () => {
    if (!currentTrack || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/music/upgrade?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`);
      const data = await res.json();
      if (data.url) {
        const link = document.createElement('a');
        link.href = data.url;
        link.download = `${currentTrack.title} - ${currentTrack.artist}.mp3`;
        // Use blank target to force download if blob isn't possible across origins
        link.target = '_blank'; 
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert('Could not find a downloadable version for this track.');
      }
    } catch (e) {
      console.error('Download failed:', e);
      alert('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!currentTrack) {
    return (
      <div className="fixed bottom-[72px] lg:bottom-0 left-0 right-0 h-[var(--player-height)] bg-[#1e2329]/95 backdrop-blur-xl border-t border-[#2b3139] z-50 flex items-center justify-center">
        <p className="text-[#707a8a] text-sm">Select a track to start playing</p>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const liked = isFavorite(currentTrack.id);

  return (
    <>
      <AnimatePresence>
        {/* Full-Screen Spotify-style Lyrics Surface */}
        {showLyrics && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-40 bg-gradient-to-br from-gray-900 to-black pb-[var(--player-height)] flex flex-col md:flex-row overflow-hidden"
          >
            {/* Background Blur Effect */}
            <div 
              className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none transition-all duration-1000 blur-3xl scale-125 saturate-200"
              style={{ backgroundImage: `url(${currentTrack.imageUrl})`, backgroundPosition: 'center', backgroundSize: 'cover' }} 
            />

            {/* Top Close Button (Desktop Only) */}
            <button 
              onClick={() => setShowLyrics(false)} 
              className="hidden md:flex absolute top-6 left-6 z-50 w-10 h-10 bg-black/40 hover:bg-black/80 backdrop-blur-md rounded-full flex-col items-center justify-center text-white/70 hover:text-white transition-all shadow-xl group"
            >
              <ChevronDown className="w-6 h-6 group-hover:translate-y-0.5 transition-transform" />
            </button>

            {/* Left Column: Album Art — HIDDEN on mobile, visible on tablet (md+) */}
            <div className="hidden md:flex flex-1 w-1/2 items-center justify-center p-12 relative z-10 flex-col border-r border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={currentTrack.imageUrl} 
                alt={currentTrack.title}
                className={cn(
                  "w-full max-w-[480px] aspect-square object-cover rounded-2xl shadow-2xl transition-all duration-700",
                  isPlaying ? "scale-100 drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]" : "scale-95 drop-shadow-md brightness-75"
                )} 
              />
              <div className="mt-8 text-center max-w-[480px]">
                <h1 className="text-3xl lg:text-4xl font-extrabold text-white mb-2 line-clamp-1">{currentTrack.title}</h1>
                <p className="text-lg text-white/50">{currentTrack.artist}</p>
              </div>
            </div>

            {/* Mobile-only: compact track info bar at top with exit button */}
            <div className="flex md:hidden items-center gap-3 px-6 pt-16 pb-4 relative z-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentTrack.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shadow-lg" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-white truncate">{currentTrack.title}</p>
                <p className="text-sm text-white/40 truncate">{currentTrack.artist}</p>
              </div>
              <button 
                onClick={() => setShowLyrics(false)}
                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white/70 active:scale-90 transition-transform"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
            </div>

            {/* Lyrics Column: full width on mobile, half on tablet+ */}
            <div className="flex-1 w-full md:w-1/2 relative bg-black/20 backdrop-blur-md z-10">
              <div 
                ref={lyricsContainerRef}
                className="absolute inset-0 overflow-y-auto px-8 lg:px-20 py-[40vh] no-scrollbar scroll-smooth"
              >
                {lyricsLoading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-white/40">
                    <Mic2 className="w-12 h-12 animate-pulse" />
                    <p className="text-lg font-medium tracking-widest animate-pulse">FINDING LYRICS</p>
                  </div>
                ) : lyrics.length > 0 ? (
                  <div className="flex flex-col gap-8">
                    {lyrics.map((line, i) => {
                      const isActive = i === activeLyricIndex;
                      const isPast = i < activeLyricIndex;
                      return (
                        <p 
                          key={i}
                          id={`lyric-${i}`}
                          onClick={() => seekToLyric(line.time)}
                          className={cn(
                            'text-3xl md:text-5xl lg:text-6xl font-black mb-8 md:mb-12 cursor-pointer leading-tight select-none origin-left',
                            'transition-[color,opacity,transform] duration-500 ease-out',
                            isActive ? 'text-white scale-[1.05] font-bold opacity-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' 
                            : isPast ? 'text-white/25 scale-100 opacity-60' 
                            : 'text-white/15 scale-100 opacity-40 hover:text-white/40'
                          )}
                        >
                          {line.text}
                        </p>
                      );
                    })}
                  </div>
                ) : plainLyrics ? (
                  <div className="text-xl lg:text-2xl font-medium text-white/60 whitespace-pre-line leading-relaxed text-center">
                    {plainLyrics}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                    <Mic2 className="w-16 h-16 text-white/10 mb-2" />
                    <p className="text-white/30 text-xl font-bold">Lyrics not available yet</p>
                    <p className="text-white/20 text-sm">{currentTrack.title}</p>
                    <button 
                      onClick={fetchLyrics}
                      className="mt-4 px-6 py-2 rounded-full bg-[#fcd535] text-black text-sm font-bold hover:bg-[#f0b90b] transition-colors"
                    >
                      Retry Search
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Bottom Player Bar */}
      <div className={cn(
        "fixed left-0 right-0 bg-[#181a20]/98 backdrop-blur-2xl border-t border-white/[0.06] z-50 overflow-visible transition-all duration-300",
        showLyrics 
          ? "bottom-0 h-[calc(var(--player-height)+var(--safe-area-bottom))] pb-[var(--safe-area-bottom)]" 
          : "bottom-[calc(72px+var(--safe-area-bottom))] lg:bottom-0 h-[var(--player-height)]"
      )}>
        {/* Subtle animated gradient background */}
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(252,213,53,${isPlaying ? 0.05 : 0}), transparent)`,
            transition: 'all 1s ease'
          }}
        />

        {/* Seeker Bar - Prominent YouTube style */}
        <div
          ref={progressRef}
          className="absolute top-0 left-0 right-0 h-1.5 -translate-y-[1px] bg-white/[0.08] cursor-pointer group z-50 hover:h-2 transition-[height] duration-200"
          onClick={handleProgressClick}
        >
          {/* Buffering/Background bar */}
          <div className="absolute inset-0 bg-white/[0.05]" />
          
          {/* Progress fill */}
          <div 
            className="h-full bg-gradient-to-r from-[#fcd535] to-[#fcd535] relative shadow-[0_0_8px_rgba(252,213,53,0.4)]" 
            style={{ width: `${progressPercent}%`, transition: 'width 0.1s linear' }}
          >
            {/* Knob */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white scale-0 group-hover:scale-100 transition-transform shadow-xl border-2 border-[#fcd535]" />
          </div>
        </div>

        <div className="relative z-10 flex items-center h-full px-3 sm:px-4 gap-2 sm:gap-4">
          
          {/* Left: Track Info */}
          <div className="flex items-center gap-2.5 w-[30%] sm:w-[25%] min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentTrack.imageUrl}
              onClick={() => setShowLyrics(true)}
              alt={currentTrack.title}
              className={cn(
                'w-11 h-11 sm:w-12 sm:h-12 rounded-lg object-cover flex-shrink-0 cursor-pointer transition-all duration-300',
                isPlaying ? 'shadow-lg shadow-[#fcd535]/10' : 'brightness-90'
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white truncate cursor-pointer hover:underline leading-tight" onClick={() => setShowLyrics(true)}>{currentTrack.title}</p>
              <p className="text-[11px] text-white/40 truncate mt-0.5">{currentTrack.artist}</p>
            </div>
            {/* Heart - visible on all screens */}
            <button onClick={() => toggleFavorite(currentTrack.id)} className="flex-shrink-0 p-1.5">
              <Heart className={cn('w-4 h-4 transition-all duration-200', liked ? 'text-[#fcd535] fill-[#fcd535] scale-110' : 'text-white/30 hover:text-white/60')} />
            </button>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex-[2] flex flex-col items-center justify-center gap-1 w-[40%] sm:w-[50%]">
            <div className="flex items-center gap-2 sm:gap-4">
              <button onClick={toggleShuffle} className={cn('hidden sm:flex w-7 h-7 items-center justify-center rounded-full transition-colors', isShuffled ? 'text-[#fcd535]' : 'text-white/30 hover:text-white/60')}>
                <Shuffle className="w-4 h-4" />
              </button>

              <button onClick={() => skipTime(-15)} className="hidden sm:flex w-6 h-6 items-center justify-center text-white/40 hover:text-white/70 transition-colors" title="-15s">
                <RotateCcw className="w-4 h-4" />
              </button>
              
              <button onClick={previous} className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors">
                <SkipBack className="w-[18px] h-[18px] fill-current" />
              </button>

              <button onClick={togglePlay} className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 active:scale-95 transition-all">
                {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-black" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-black ml-0.5" />}
              </button>

              <button onClick={next} className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors">
                <SkipForward className="w-[18px] h-[18px] fill-current" />
              </button>

              <button onClick={() => skipTime(15)} className="hidden sm:flex w-6 h-6 items-center justify-center text-white/40 hover:text-white/70 transition-colors" title="+15s">
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
            
            {/* Timers */}
            <div className="flex items-center gap-1.5 text-[10px] text-white/25 font-mono">
              <span>{formatTime(progress)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Extras */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 w-[30%] sm:w-[25%]">
            <button 
              onClick={toggleRepeat} 
              className={cn(
                'flex w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-full transition-all',
                repeatMode !== 'off' ? 'text-[#fcd535] bg-[#fcd535]/10' : 'text-white/30 hover:text-white/80 hover:bg-white/5'
              )}
              title={repeatMode === 'one' ? 'Repeat One' : repeatMode === 'all' ? 'Repeat All' : 'Repeat Off'}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className={cn(
                'flex w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-full transition-all',
                isDownloading ? 'text-[#fcd535] animate-pulse' : 'text-white/30 hover:text-white/80 hover:bg-white/5'
              )}
              title="Download Fulltrack"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowLyrics(!showLyrics)}
              className={cn(
                'flex w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-full transition-all',
                showLyrics ? 'text-[#fcd535] bg-[#fcd535]/10 shadow-[0_0_12px_rgba(252,213,53,0.2)]' : 'text-white/30 hover:text-white/80 hover:bg-white/5'
              )}
              title="Lyrics"
            >
              <Mic2 className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="items-center gap-1.5 hidden md:flex">
              <button onClick={toggleMute} className="text-white/30 hover:text-white/60 transition-colors">
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range" min="0" max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20 h-1 rounded-full appearance-none bg-white/10 accent-white outline-none cursor-pointer"
                style={{ background: `linear-gradient(to right, #fff ${isMuted ? 0 : volume}%, rgba(255,255,255,0.08) ${isMuted ? 0 : volume}%)` }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
