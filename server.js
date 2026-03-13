const http = require("http");
const fs = require("fs");
const path = require("path");

const BOT_TOKEN = "7759788349:AAGmiHOIqpX_Z1eW5ONaIi_gTXzQavSDqH4";
const CHAT_ID = "-5230839823";
const PORT = process.env.PORT || 3000;

let lastUpdateId = 0;
let pollingStarted = false;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendHtmlFile(res, filename) {
  const filePath = path.join(__dirname, filename);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendText(res, 500, `Помилка: ${filename} не знайдено`);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
}

async function telegramApi(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return response.json();
}

async function sendTelegramMessage(chatId, text) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text
  });
}

async function forwardUserMessageToGroup(message) {
  const from = message.from || {};
  const firstName = from.first_name || "Без імені";
  const lastName = from.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const username = from.username ? `@${from.username}` : "немає";
  const userId = from.id || "невідомо";
  const text = message.text || "[без тексту]";

  const groupText = `📩 НОВЕ ПОВІДОМЛЕННЯ В БОТ

👤 Ім’я: ${fullName}
🔹 Username: ${username}
🆔 ID для відповіді: ${userId}

💬 Текст:
${text}

Щоб відповісти, напишіть у групі:
 /reply ${userId} Ваш текст відповіді`;

  await sendTelegramMessage(CHAT_ID, groupText);
}

async function handlePrivateMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  if (!text) {
    await sendTelegramMessage(
      chatId,
      "Будь ласка, надішліть текстове повідомлення. Коротко опишіть вашу проблему."
    );
    return;
  }

  if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      "Вітаємо. Ви звернулися по юридичну допомогу дистанційно.\n\nОпишіть коротко вашу ситуацію у сфері трудового права, цивільних справ або кредитів та боргів. Ваше повідомлення буде передано для опрацювання."
    );

    await forwardUserMessageToGroup({
      ...message,
      text: "Користувач натиснув /start"
    });
    return;
  }

  if (text === "/help") {
    await sendTelegramMessage(
      chatId,
      "Напишіть короткий опис проблеми та залиште зручний контакт для відповіді."
    );
    return;
  }

  await forwardUserMessageToGroup(message);

  await sendTelegramMessage(
    chatId,
    "Дякуємо. Ваше повідомлення отримано. Найближчим часом вам нададуть відповідь."
  );
}

async function handleGroupReplyCommand(message) {
  const rawText = (message.text || "").trim();
  const normalizedText = rawText.replace(/^\/reply@\S+/i, "/reply").trim();

  if (!normalizedText.startsWith("/reply")) {
    return false;
  }

  const withoutCommand = normalizedText.replace(/^\/reply/i, "").trim();
  const firstSpaceIndex = withoutCommand.indexOf(" ");

  if (firstSpaceIndex === -1) {
    await sendTelegramMessage(
      CHAT_ID,
      "Неправильний формат.\nВикористовуйте:\n/reply ID_КОРИСТУВАЧА текст відповіді"
    );
    return true;
  }

  const userId = withoutCommand.slice(0, firstSpaceIndex).trim();
  const replyText = withoutCommand.slice(firstSpaceIndex + 1).trim();

  if (!/^\d+$/.test(userId) || !replyText) {
    await sendTelegramMessage(
      CHAT_ID,
      "Неправильний формат.\nПриклад:\n/reply 1646910753 Доброго дня, опишіть вашу ситуацію."
    );
    return true;
  }

  const result = await sendTelegramMessage(
    userId,
    `✉️ Відповідь юриста

${replyText}`
  );

  if (result.ok) {
    await sendTelegramMessage(
      CHAT_ID,
      `✅ Відповідь успішно надіслана користувачу ${userId}.`
    );
  } else {
    await sendTelegramMessage(
      CHAT_ID,
      `❌ Не вдалося надіслати відповідь користувачу ${userId}.`
    );
    console.log("Reply error:", result);
  }

  return true;
}

async function handleTelegramMessage(message) {
  if (!message || !message.chat) return;

  const chatType = message.chat.type;

  if (chatType === "private") {
    await handlePrivateMessage(message);
    return;
  }

  const isTargetGroup = String(message.chat.id) === String(CHAT_ID);

  if (isTargetGroup && message.text) {
    await handleGroupReplyCommand(message);
  }
}

async function pollTelegramUpdates() {
  if (pollingStarted) return;
  pollingStarted = true;

  while (true) {
    try {
      const data = await telegramApi("getUpdates", {
        offset: lastUpdateId,
        timeout: 30
      });

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = update.update_id + 1;

          if (update.message) {
            await handleTelegramMessage(update.message);
          }
        }
      }
    } catch (error) {
      console.log("Polling error:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    sendHtmlFile(res, "index.html");
    return;
  }

  if (req.method === "GET" && req.url === "/privacy.html") {
    sendHtmlFile(res, "privacy.html");
    return;
  }

  if (req.method === "GET" && req.url === "/lawyers") {
    const filePath = path.join(__dirname, "lawyers.json");

    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        sendJson(res, 500, { error: "Не вдалося завантажити юристів" });
        return;
      }

      try {
        sendJson(res, 200, JSON.parse(data));
      } catch (parseError) {
        sendJson(res, 500, { error: "Помилка у lawyers.json" });
      }
    });

    return;
  }

  if (req.method === "POST" && req.url === "/send-request") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);

        const text = `📩 НОВЕ ЗВЕРНЕННЯ З САЙТУ

👤 Ім’я: ${data.name}
📞 Контакт: ${data.contact}
📂 Напрям: ${data.type}

📝 Опис:
${data.message}`;

        const telegramResult = await sendTelegramMessage(CHAT_ID, text);

        if (telegramResult.ok) {
          sendJson(res, 200, { success: true });
        } else {
          console.log("Telegram error:", telegramResult);
          sendJson(res, 500, { success: false });
        }
      } catch (error) {
        console.log("Server error:", error.message);
        sendJson(res, 500, { success: false });
      }
    });

    return;
  }

  sendText(res, 404, "Сторінку не знайдено");
});

server.listen(PORT, () => {
  console.log(`Сервер працює на порту ${PORT}`);
  pollTelegramUpdates();
});