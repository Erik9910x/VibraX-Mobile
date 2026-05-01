import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const artist = searchParams.get('artist');

  if (!title || !artist) {
    return NextResponse.json({ error: 'Missing title or artist' }, { status: 400 });
  }

  const normalize = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetTitle = normalize(title as string);
  const targetArtist = normalize((artist as string).split(',')[0]);

  // Multiple JioSaavn mirror endpoints for redundancy
  const endpoints = [
    `https://jio-saavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(title + ' ' + artist)}&limit=10`,
    `https://jio-saavn-api-phi.vercel.app/search?query=${encodeURIComponent(title + ' ' + artist)}&limit=10`,
    `https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(title + ' ' + artist)}&limit=10`,
    `https://saavn.dev/api/search/songs?query=${encodeURIComponent(title + ' ' + artist)}&limit=10`,
  ];

  const fetchEndpoint = async (url: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    try {
      const res = await fetch(url, { 
        signal: controller.signal,
        next: { revalidate: 3600 } 
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const saavnData = await res.json();
      const results = saavnData.data?.results || saavnData.data || saavnData.results || [];
      
      if (results && results.length > 0) {
        // Score each result for best match
        let bestScore = -1;
        let bestSong = results[0];
        
        for (const song of results) {
          const songTitle = normalize(song.name || song.title || '');
          const songArtist = normalize(
            song.primaryArtists || song.singers || song.subtitle || song.more_info?.singers || ''
          );
          
          let score = 0;
          // Exact title match = high score
          if (songTitle === targetTitle) score += 100;
          else if (songTitle.includes(targetTitle) || targetTitle.includes(songTitle)) score += 50;
          
          // Artist match
          if (songArtist.includes(targetArtist) || targetArtist.includes(songArtist)) score += 40;
          
          // Has download URL = bonus
          const dl = song.downloadUrl || song.download_url;
          if (dl && dl.length > 0) score += 20;
          
          if (score > bestScore) {
            bestScore = score;
            bestSong = song;
          }
        }

        const dl = bestSong.downloadUrl || bestSong.download_url;
        if (dl && dl.length > 0) {
          // Get highest quality available (320kbps preferred)
          const best320 = dl.find((d: any) => d.quality === '320kbps');
          const bestUrl = best320 || dl[dl.length - 1];
          const finalUrl = bestUrl.link || bestUrl.url || bestUrl;
          
          if (finalUrl && typeof finalUrl === 'string' && finalUrl.startsWith('http')) {
            return { url: finalUrl, source: url, quality: best320 ? '320kbps' : 'auto' };
          }
        }
      }
      throw new Error('No valid track data');
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    const result = await Promise.any(endpoints.map(fetchEndpoint));
    return NextResponse.json(result);
  } catch (e) {
    console.error(`All endpoints failed for ${title} ${artist}`);
    return NextResponse.json({ error: 'No full track found' }, { status: 404 });
  }
}
