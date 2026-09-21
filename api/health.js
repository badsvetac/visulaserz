// Hosted edition: tells the page it is running on the web, where there is no YouTube loader
// and no saved library — visitors play audio files from their own device.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.status(200).json({ ok: true, mode: 'web', youtube: { available: false, reason: '' } });
}
