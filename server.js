import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. Настройка Groq (Текст)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// 2. Настройка OpenRouter (Картинки) - используем SDK OpenAI с другим URL
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { message } = req.body; // Получаем сообщение от клиента

    // --- ШАГ 1: Генерируем текст через Groq ---
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: message }],
      model: "llama3-8b-8192", // Или "mixtral-8x7b-32768"
    });
    
    const textResponse = chatCompletion.choices[0]?.message?.content || "Нет ответа";

    // --- ШАГ 2: Генерируем картинку через OpenRouter ---
    // ВАЖНО: Модель должна поддерживать картинки (например, stabilityai/stable-diffusion-xl-base-1.0)
    let imageUrl = null;
    try {
      const imageResponse = await openrouter.images.generate({
        model: "stabilityai/stable-diffusion-xl-base-1.0", // Выбери нужную модель на OpenRouter
        prompt: message, // Или сделай отдельный промпт на основе ответа Groq
        n: 1,
        size: "1024x1024"
      });
      imageUrl = imageResponse.data[0]?.url;
    } catch (imgError) {
      console.error("Ошибка генерации картинки:", imgError);
      // Не роняем сервер, если картинка не сгенерировалась
    }

    // --- ШАГ 3: Возвращаем JSON ---
    res.json({
      text: textResponse,
      image: imageUrl
    });

  } catch (error) {
    console.error("Ошибка сервера:", error);
    // Возвращаем JSON с ошибкой, чтобы фронтенд не падал с 'Unexpected token A'
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
