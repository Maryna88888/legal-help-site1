const http = require("http");
const fs = require("fs");
const path = require("path");

const BOT_TOKEN = "7759788349:AAGmiHOIqpX_Z1eW5ONaIi_gTXzQavSDqH4";
const CHAT_ID = "-5230839823";

const PORT = process.env.PORT || 3000;

let lastUpdateId = 0;

/* -------- Telegram API -------- */

async function telegram(method, data) {

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  return response.json();

}

async function sendTelegram(chatId, text) {

  return telegram("sendMessage", {
    chat_id: chatId,
    text: text
  });

}

/* -------- Bot polling -------- */

async function pollUpdates() {

  while (true) {

    try {

      const data = await telegram("getUpdates", {
        offset: lastUpdateId,
        timeout: 30
      });

      if (data.ok) {

        for (const update of data.result) {

          lastUpdateId = update.update_id + 1;

          if (update.message) {

            await handleMessage(update.message);

          }

        }

      }

    } catch (e) {

      console.log("Polling error", e);

    }

  }

}

/* -------- Message handler -------- */

async function handleMessage(message) {

  const chat = message.chat;

  if (!chat) return;

  /* ----- приватні повідомлення ----- */

  if (chat.type === "private") {

    const text = message.text || "";

    const userId = message.from.id;
    const name = message.from.first_name || "";

    if (text === "/start") {

      await sendTelegram(
        userId,
        "Вітаємо 👋\n\nОпишіть вашу юридичну проблему і ми передамо звернення юристу."
      );

      return;

    }

    const groupText = `📩 НОВЕ ПОВІДОМЛЕННЯ

👤 ${name}
🆔 ID для відповіді: ${userId}

💬 ${text}

Відповідь:
/reply ${userId} текст відповіді`;

    await sendTelegram(CHAT_ID, groupText);

    await sendTelegram(
      userId,
      "Дякуємо. Ваше звернення передано юристу."
    );

  }

  /* ----- група ----- */

  if (chat.id.toString() === CHAT_ID) {

    const text = message.text || "";

    if (text.startsWith("/reply")) {

      const parts = text.split(" ");

      const userId = parts[1];

      const replyText = parts.slice(2).join(" ");

      if (!userId || !replyText) {

        await sendTelegram(
          CHAT_ID,
          "❌ Неправильний формат\n\n/reply ID текст"
        );

        return;

      }

      const result = await sendTelegram(
        userId,
        `✉️ Відповідь юриста:\n\n${replyText}`
      );

      if (!result.ok) {

        await sendTelegram(
          CHAT_ID,
          `❌ Не вдалося надіслати відповідь користувачу ${userId}\n${result.description}`
        );

      }

    }

  }

}

/* -------- Server -------- */

const server = http.createServer((req, res) => {

  /* ---- favicon ---- */

  if (req.method === "GET" && req.url === "/favicon.png") {

    const file = path.join(__dirname, "favicon.png");

    fs.readFile(file, (err, data) => {

      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, {
        "Content-Type": "image/png"
      });

      res.end(data);

    });

    return;

  }

  /* ---- index ---- */

  if (req.method === "GET" && req.url === "/") {

    const file = path.join(__dirname, "index.html");

    fs.readFile(file, (err, data) => {

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(data);

    });

    return;

  }

  /* ---- privacy ---- */

  if (req.method === "GET" && req.url === "/privacy.html") {

    const file = path.join(__dirname, "privacy.html");

    fs.readFile(file, (err, data) => {

      res.writeHead(200, {
        "Content-Type": "text/html"
      });

      res.end(data);

    });

    return;

  }

  /* ---- lawyers ---- */

  if (req.method === "GET" && req.url === "/lawyers") {

    const file = path.join(__dirname, "lawyers.json");

    fs.readFile(file, (err, data) => {

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(data);

    });

    return;

  }

  /* ---- form ---- */

  if (req.method === "POST" && req.url === "/send-request") {

    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", async () => {

      const data = JSON.parse(body);

      const text = `📩 НОВЕ ЗВЕРНЕННЯ З САЙТУ

👤 ${data.name}

📞 ${data.contact}

⚖️ ${data.type}

📝 ${data.message}`;

      await sendTelegram(CHAT_ID, text);

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(JSON.stringify({
        success: true
      }));

    });

    return;

  }

  res.writeHead(404);
  res.end();

});

/* -------- start -------- */

server.listen(PORT, () => {

  console.log("Server started");

  pollUpdates();

});

  