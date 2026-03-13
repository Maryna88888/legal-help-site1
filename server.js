const http = require("http");
const fs = require("fs");
const path = require("path");

const BOT_TOKEN = "7759788349:AAGmiHOIqpX_Z1eW5ONaIi_gTXzQavSDqH4";
const CHAT_ID = "-5230839823";

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    const filePath = path.join(__dirname, "index.html");

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Помилка: index.html не знайдено");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && req.url === "/privacy.html") {
    const filePath = path.join(__dirname, "privacy.html");

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Помилка: privacy.html не знайдено");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && req.url === "/lawyers") {
    const filePath = path.join(__dirname, "lawyers.json");

    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Не вдалося завантажити юристів" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  if (req.method === "POST" && req.url === "/send-request") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);

        const text = `📩 НОВЕ ЗВЕРНЕННЯ

👤 Ім’я: ${data.name}
📞 Контакт: ${data.contact}
📂 Напрям: ${data.type}

📝 Опис:
${data.message}`;

        const telegramResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text: text
          })
        });

        const telegramResult = await telegramResponse.json();

        if (telegramResult.ok) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success: true }));
        } else {
          console.log("Telegram error:", telegramResult);
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success: false }));
        }
      } catch (error) {
        console.log("Server error:", error);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Сторінку не знайдено");
});

server.listen(3000, () => {
  console.log("Сервер працює: http://localhost:3000");
});