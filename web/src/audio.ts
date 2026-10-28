// Browser mic -> 16 kHz mono 16-bit WAV (what the speech API expects), and base64 helpers.
export async function blobToWavBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(buf.slice(0))
  await ctx.close()
  const rate = 16000
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const pcm = (await off.startRendering()).getChannelData(0)
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2))
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true)
  out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true)
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
  let bin = ''
  const bytes = new Uint8Array(out.buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function playBase64(mime: string, b64: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = new Audio(url)
  a.onended = () => URL.revokeObjectURL(url)
  return a.play().catch(() => undefined)
}
