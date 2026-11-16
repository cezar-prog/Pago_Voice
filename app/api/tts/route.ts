const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah

export async function POST(request: Request) {
  const { text } = (await request.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return Response.json({ error: 'No text.' }, { status: 400 });

  const apiKey = (process.env.ELEVENLABS_API_KEY ?? '').trim();
  console.log(`[tts] key length=${apiKey.length} voice=${VOICE_ID} chars=${text.length}`);

  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '<no body>');
    console.error(`[tts] ElevenLabs ${upstream.status}: ${detail}`);
    return Response.json({ error: 'TTS failed.', status: upstream.status, detail }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  });
}
