/**
 * Node.js & Express Example
 *
 * Install in your backend project:
 *   npm install antigravity-client express
 */

import { Antigravity } from 'antigravity-client';
// import express from 'express';

// const app = express();
// app.use(express.json());

// 1. Initialize client with token or credentials
const ag = new Antigravity({
  token: process.env.ANTIGRAVITY_TOKEN,
  defaultModel: 'gemini-3.8-flash-high'
});

// 2. Standard Chat Endpoint
// app.post('/api/chat', async (req, res) => {
//   try {
//     const response = await ag.chat({
//       prompt: req.body.prompt,
//       model: req.body.model || 'gemini-3.8-flash-high'
//     });
//     res.json({ reply: response.text, usage: response.usage });
//   } catch (err: any) {
//     res.status(500).json({ error: err.message });
//   }
// });

// 3. Real-time SSE Streaming Endpoint
// app.get('/api/stream', async (req, res) => {
//   const prompt = req.query.prompt as string;
//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');
//
//   try {
//     for await (const chunk of ag.streamChat({ prompt })) {
//       res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
//     }
//     res.write('data: [DONE]\n\n');
//     res.end();
//   } catch (err: any) {
//     res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
//     res.end();
//   }
// });
