import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

const router = Router();

function normalizeMessages(body) {
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .filter((message) => message && typeof message.content === 'string')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content
    }));

  if (typeof body.message === 'string' && body.message.trim()) {
    messages.push({ role: 'user', content: body.message.trim() });
  }

  return messages.slice(-20);
}

function toGeminiPrompt(messages) {
  const systemPrompt =
    'You are AI Music Studio, a practical music production assistant. Answer in Vietnamese unless the user asks otherwise. Be concise and useful about audio editing, mixing, arrangement, keys, BPM, chords, stems, and music production workflows.';

  return messages
    .map((message, index) => {
      const label = message.role === 'assistant' ? 'Assistant' : 'User';
      if (index === 0) {
        return `${systemPrompt}\n\n${label}: ${message.content}`;
      }

      return `${label}: ${message.content}`;
    })
    .join('\n');
}

function fallbackLocalFaq(messages, reason) {
  const latest =
    messages
      .filter((message) => message.role === 'user')
      .at(-1)
      ?.content.toLowerCase() || '';

  const entries = [
    {
      keywords: ['bpm', 'tempo', 'nhịp'],
      reply:
        'Bạn có thể upload file audio rồi bấm "Tìm BPM". Hệ thống sẽ dùng librosa để ước lượng tempo. Với track có intro tự do hoặc breakdown dài, BPM nên được kiểm tra lại bằng tai hoặc DAW.'
    },
    {
      keywords: ['key', 'tone', 'giọng', 'khóa'],
      reply:
        'Bấm "Tìm Key" sau khi upload file. Kết quả key là dự đoán dựa trên chroma, phù hợp làm điểm bắt đầu trước khi bạn kiểm tra lại trên piano roll hoặc nhạc cụ thật.'
    },
    {
      keywords: ['hợp âm', 'chord', 'progression'],
      reply:
        'Bấm "Gợi ý hợp âm" để lấy một vòng hợp âm cơ bản theo key dự đoán. Sau đó bạn có thể thử đảo hợp âm, đổi bass note hoặc thêm passing chord để bản phối tự nhiên hơn.'
    },
    {
      keywords: ['vocal', 'instrumental', 'drum', 'bass', 'stem', 'tách'],
      reply:
        'Upload mp3, wav hoặc flac rồi bấm "TÁCH TẤT CẢ". Demucs sẽ tạo vocal, drums, bass, other và instrumental nếu có thể. Kết quả chỉ được lưu tạm trong 30 phút.'
    },
    {
      keywords: ['mix', 'master', 'eq', 'compress'],
      reply:
        'Với một bản mix cơ bản, hãy bắt đầu bằng gain staging, EQ dọn phần low-end không cần thiết, compression nhẹ cho vocal/bass/drums, rồi kiểm tra balance ở âm lượng nhỏ trước khi master.'
    }
  ];

  const match = entries.find((entry) => entry.keywords.some((keyword) => latest.includes(keyword)));

  return {
    model: 'local-faq',
    source: 'Local FAQ',
    fallback: true,
    reply:
      match?.reply ||
      'Gemini hiện chưa phản hồi được, nhưng bạn vẫn có thể upload audio để tách stem, tìm BPM, tìm key và gợi ý hợp âm bằng các công cụ trong studio.',
    reason
  };
}

router.post('/', async (req, res) => {
  const messages = normalizeMessages(req.body);

  if (!messages.length) {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }

  try {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured in .env.local or .env.');
    }

    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: config.geminiModel });
    const result = await model.generateContent(toGeminiPrompt(messages));
    const reply = result.response.text();

    res.json({
      model: config.geminiModel,
      source: 'Gemini',
      fallback: false,
      reply
    });
  } catch (error) {
    console.error('[chat:gemini]', {
      message: error.message,
      stack: error.stack,
      model: config.geminiModel,
      hasGeminiApiKey: Boolean(config.geminiApiKey)
    });

    res.json(fallbackLocalFaq(messages, error.message));
  }
});

export default router;
