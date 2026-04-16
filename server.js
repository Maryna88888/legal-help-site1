const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BOT_TOKEN = "7759788349:AAGmiHOIqpX_Z1eW5ONaIi_gTXzQavSDqH4";
const CHAT_ID = "-5230839823";
const ADMIN_PASSWORD = "MarynaHor33@";
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const REQUESTS_FILE = path.join(ROOT, "requests.json");
const LAWYERS_FILE = path.join(ROOT, "lawyers.json");

const sessions = new Map();
let lastUpdateId = 0;
let pollingStarted = false;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getRequests() {
  return readJson(REQUESTS_FILE, []);
}

function saveRequests(items) {
  writeJson(REQUESTS_FILE, items);
}

function mimeType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  return "text/plain; charset=utf-8";
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    send(res, 200, data, mimeType(filePath));
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
  });
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  });
  return out;
}

function isAdmin(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_session;
  return token && sessions.has(token);
}

function setAdminSession(res) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, true);
  res.setHeader("Set-Cookie", `admin_session=${token}; HttpOnly; Path=/; SameSite=Lax`);
}

function clearAdminSession(req, res) {
  const cookies = parseCookies(req);
  if (cookies.admin_session) sessions.delete(cookies.admin_session);
  res.setHeader("Set-Cookie", "admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

function newId(prefix = "REQ") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function telegramApi(method, data) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return response.json();
}

async function sendTelegram(chatId, text) {
  return telegramApi("sendMessage", { chat_id: chatId, text });
}

async function addRequest(item) {
  const items = getRequests();
  items.unshift(item);
  saveRequests(items);
}

async function handlePrivateMessage(message) {
  const userId = message.from.id;
  const text = (message.text || "").trim();
  const firstName = message.from.first_name || "Користувач";
  const username = message.from.username ? `@${message.from.username}` : "";

  if (text === "/start") {
    await sendTelegram(
      userId,
      "Вітаємо. Ви звернулися по юридичну допомогу дистанційно.\n\nОпишіть коротко вашу ситуацію у сфері трудового права, цивільних справ або кредитів та боргів."
    );
    return;
  }

  if (!text) return;

  const item = {
    id: newId("TG"),
    source: "telegram",
    name: firstName,
    contact: username || `telegram:${userId}`,
    type: "Telegram",
    message: text,
    userId: String(userId),
    status: "new",
    createdAt: new Date().toISOString()
  };

  await addRequest(item);

  await sendTelegram(
    CHAT_ID,
    `📩 НОВЕ ПОВІДОМЛЕННЯ В БОТ

ID заявки: ${item.id}
Ім’я: ${firstName}
Username: ${username || "немає"}
ID для відповіді: ${userId}

Текст:
${text}

Щоб відповісти:
 /reply ${userId} Ваш текст`
  );

  await sendTelegram(userId, "Дякуємо. Ваше звернення отримано.");
}

async function handleGroupCommand(message) {
  const text = (message.text || "").trim();
  const normalized = text.replace(/^\/reply@\S+/i, "/reply");

  if (!normalized.startsWith("/reply")) return false;

  const match = normalized.match(/^\/reply\s+(\d+)\s+([\s\S]+)$/);
  if (!match) {
    await sendTelegram(CHAT_ID, "Неправильний формат: /reply ID текст");
    return true;
  }

  const userId = match[1];
  const replyText = match[2].trim();

  const result = await sendTelegram(userId, `✉️ Відповідь юриста\n\n${replyText}`);

  if (result.ok) {
    await sendTelegram(CHAT_ID, `✅ Відповідь успішно надіслана користувачу ${userId}.`);
  } else {
    await sendTelegram(CHAT_ID, `❌ Не вдалося надіслати відповідь користувачу ${userId}.\nПричина: ${result.description || "невідома помилка"}`);
  }

  return true;
}

async function pollUpdates() {
  if (pollingStarted) return;
  pollingStarted = true;

  while (true) {
    try {
      const data = await telegramApi("getUpdates", { offset: lastUpdateId, timeout: 25 });

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = update.update_id + 1;
          if (!update.message) continue;

          const msg = update.message;
          if (msg.chat?.type === "private") {
            await handlePrivateMessage(msg);
          } else if (String(msg.chat?.id) === String(CHAT_ID)) {
            await handleGroupCommand(msg);
          }
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/") return serveFile(res, path.join(ROOT, "index.html"));
  if (req.method === "GET" && pathname === "/privacy.html") return serveFile(res, path.join(ROOT, "privacy.html"));
  if (req.method === "GET" && pathname === "/admin.html") return serveFile(res, path.join(ROOT, "admin.html"));
  if (req.method === "GET" && pathname === "/favicon.png") return serveFile(res, path.join(ROOT, "favicon.png"));
  if (req.method === "GET" && pathname === "/robots.txt") return serveFile(res, path.join(ROOT, "robots.txt"));
  if (req.method === "GET" && pathname === "/sitemap.xml") return serveFile(res, path.join(ROOT, "sitemap.xml"));

  if (req.method === "GET" && pathname === "/lawyers") {
    return serveFile(res, LAWYERS_FILE);
  }

  if (req.method === "POST" && pathname === "/send-request") {
    try {
      const data = await parseBody(req);

      if (!data.name || !data.contact || !data.type || !data.message) {
        return sendJson(res, 400, { success: false, error: "Заповніть усі поля." });
      }

      const item = {
        id: newId("REQ"),
        source: "site",
        name: String(data.name).trim(),
        contact: String(data.contact).trim(),
        type: String(data.type).trim(),
        message: String(data.message).trim(),
        status: "new",
        createdAt: new Date().toISOString()
      };

      await addRequest(item);

      await sendTelegram(
        CHAT_ID,
        `📩 НОВЕ ЗВЕРНЕННЯ З САЙТУ

ID заявки: ${item.id}
Ім’я: ${item.name}
Контакт: ${item.contact}
Напрям: ${item.type}

Опис:
${item.message}`
      );

      return sendJson(res, 200, { success: true, id: item.id });
    } catch {
      return sendJson(res, 500, { success: false, error: "Помилка сервера." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    try {
      const data = await parseBody(req);
      if (data.password !== ADMIN_PASSWORD) {
        return sendJson(res, 401, { success: false, error: "Невірний пароль." });
      }
      setAdminSession(res);
      return sendJson(res, 200, { success: true });
    } catch {
      return sendJson(res, 400, { success: false, error: "Помилка входу." });
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    clearAdminSession(req, res);
    return sendJson(res, 200, { success: true });
  }

  if (req.method === "GET" && pathname === "/api/requests") {
    if (!isAdmin(req)) return sendJson(res, 401, { success: false });
    const items = getRequests().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, items);
  }

  if (req.method === "POST" && pathname === "/api/requests/status") {
    if (!isAdmin(req)) return sendJson(res, 401, { success: false });

    try {
      const { id, status } = await parseBody(req);
      const items = getRequests();
      const idx = items.findIndex(x => x.id === id);
      if (idx === -1) return sendJson(res, 404, { success: false });

      items[idx].status = status || items[idx].status;
      saveRequests(items);
      return sendJson(res, 200, { success: true });
    } catch {
      return sendJson(res, 400, { success: false });
    }
  }

  send(res, 404, "Not found", "text/plain; charset=utf-8");
});

server.listen(PORT, () => {
  console.log(`Server started on ${PORT}`);
  pollUpdates();
});

  