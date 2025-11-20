const nodemailer = require('nodemailer');
const fetch = global.fetch;
const { createCanvas, Image } = require('canvas');
require('dotenv').config();

class MailService {
  constructor(transporter) {
    this.transporter =
      transporter ||
      nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER || process.env.EMAIL_LOGIN,
          pass: process.env.GMAIL_PASS || process.env.EMAIL_PASSWORD,
        },
      });

    this.carrier = process.env.CARRIER_EMAIL || 'i7104804@gmail.com';
  }

  // ----------------------- TILE LOADER -----------------------
  async loadTile(z, x, y) {
    const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;

      const buf = await res.arrayBuffer();
      const img = new Image();
      img.src = Buffer.from(buf);

      return img;
    } catch (err) {
      console.log("Tile load error:", err);
      return null;
    }
  }

  latLngToTile(lat, lng, zoom) {
    const x = ((lng + 180) / 360) * Math.pow(2, zoom);
    const y =
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) +
            1 / Math.cos((lat * Math.PI) / 180)
        ) /
          Math.PI) /
        2) *
      Math.pow(2, zoom);

    return { x, y };
  }

  // ---------------------- DRAW ROUTE MAP ---------------------
  async generateRouteImage(routeCoords) {
    const zoom = 14;
    const TILE_SIZE = 256;

    const width = 800;   // увеличил качество
    const height = 600;

    // --------- 1. Находим границы маршрута ---------
    const lats = routeCoords.map(p => p[0]);
    const lngs = routeCoords.map(p => p[1]);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // --------- 2. Преобразуем границы в тайлы ---------
    const { x: minTileXf, y: minTileYf } = this.latLngToTile(maxLat, minLng, zoom);
    const { x: maxTileXf, y: maxTileYf } = this.latLngToTile(minLat, maxLng, zoom);

    const minTileX = Math.floor(minTileXf);
    const maxTileX = Math.floor(maxTileXf);
    const minTileY = Math.floor(minTileYf);
    const maxTileY = Math.floor(maxTileYf);

    const tilesX = maxTileX - minTileX + 1;
    const tilesY = maxTileY - minTileY + 1;

    // --------- 3. Создаём большой CANVAS под все тайлы ---------
    const bigCanvas = createCanvas(tilesX * TILE_SIZE, tilesY * TILE_SIZE);
    const bigCtx = bigCanvas.getContext("2d");

    // --------- 4. Загружаем нужные тайлы ---------
    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        const img = await this.loadTile(zoom, x, y);
        if (!img) continue;

        const dx = (x - minTileX) * TILE_SIZE;
        const dy = (y - minTileY) * TILE_SIZE;

        bigCtx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
      }
    }

    // --------- 5. Создаём финальный canvas ---------
    const finalCanvas = createCanvas(width, height);
    const finalCtx = finalCanvas.getContext("2d");

    // Растягиваем карту под нужный размер
    finalCtx.drawImage(bigCanvas, 0, 0, width, height);

    // --------- 6. Преобразование lat/lng → пиксели ---------
    const toPixel = (lat, lng) => {
      const { x: xf, y: yf } = this.latLngToTile(lat, lng, zoom);
      return {
        x: ((xf - minTileX) * TILE_SIZE) * (width / (tilesX * TILE_SIZE)),
        y: ((yf - minTileY) * TILE_SIZE) * (height / (tilesY * TILE_SIZE))
      };
    };

    // --------- 7. Рисуем маршрут ---------
    finalCtx.strokeStyle = "#0066ff";
    finalCtx.lineWidth = 4;

    finalCtx.beginPath();
    const p0 = toPixel(routeCoords[0][0], routeCoords[0][1]);
    finalCtx.moveTo(p0.x, p0.y);

    for (let i = 1; i < routeCoords.length; i++) {
      const p = toPixel(routeCoords[i][0], routeCoords[i][1]);
      finalCtx.lineTo(p.x, p.y);
    }

    finalCtx.stroke();

    // --------- точки A и B ---------
    const pA = toPixel(routeCoords[0][0], routeCoords[0][1]);
    const pB = toPixel(routeCoords.at(-1)[0], routeCoords.at(-1)[1]);

    finalCtx.fillStyle = "green";
    finalCtx.beginPath();
    finalCtx.arc(pA.x, pA.y, 8, 0, Math.PI * 2);
    finalCtx.fill();
    finalCtx.fillText("A", pA.x + 10, pA.y);

    finalCtx.fillStyle = "red";
    finalCtx.beginPath();
    finalCtx.arc(pB.x, pB.y, 8, 0, Math.PI * 2);
    finalCtx.fill();
    finalCtx.fillText("B", pB.x + 10, pB.y);

    return finalCanvas.toBuffer("image/png");
  }

  // ----------------------- SEND EMAIL -------------------------
  async sendInvoice(orderData) {
    const html = `
      <h2>Новая накладная на доставку</h2>

      <p><b>Отправитель:</b> ${orderData.senderName || '—'}</p>
      <p><b>Адрес отправителя:</b> ${orderData.senderAddress || '—'}</p>
      <br/>

      <p><b>Получатель:</b> ${orderData.receiverName || '—'}</p>
      <p><b>Адрес получателя:</b> ${orderData.receiverAddress || '—'}</p>
      <br/>

      <p><b>Вес:</b> ${orderData.weight} кг</p>
      <p><b>Расстояние:</b> ${orderData.distance} км</p>
      <p><b>Цена:</b> ${orderData.price} грн</p>

      <p><b>Комментарий:</b> ${orderData.comment || '—'}</p>
      <br/>

      <p>Маршрут прикреплён PNG-картой.</p>
    `;

    let attachments = [];

    if (orderData.route && Array.isArray(orderData.route)) {
      const png = await this.generateRouteImage(orderData.route);
      attachments.push({
        filename: "route.png",
        content: png,
      });
    }

    await this.transporter.sendMail({
      from: process.env.GMAIL_USER || process.env.EMAIL_LOGIN,
      to: this.carrier,
      subject: "📦 Накладная — новый заказ",
      html,
      attachments,
    });
  }

  async sendInvoiceToCarrier(orderData) {
    return this.sendInvoice(orderData);
  }
}

module.exports = MailService;
