import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const filename = searchParams.get('filename') || 'track.mp3';

  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);

    const blob = await res.blob();
    
    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    headers.set('Content-Length', blob.size.toString());

    return new NextResponse(blob, {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error('Download proxy failed:', e);
    // If proxy fails, redirect to the original URL as a last resort
    return NextResponse.redirect(url);
  }
}
