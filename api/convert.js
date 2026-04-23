export default async function handler(req, res) {
  res.status(410).json({ error: 'This endpoint is deprecated. Please use server.js' });
}