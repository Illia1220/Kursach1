// server.js — MONOLITH with Auth (JWT), Users, Orders bound to user_id
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Client } = require('pg');
const { createCanvas, Image } = require('canvas');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- DB ----------
const db = new Client({
  host: process.env.PG_HOST || "localhost",
  port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASS || "password",
  database: process.env.PG_DB || "postgres"
});
async function connectDbAndEnsureSchema() {
  await db.connect();
  console.log("PostgreSQL connected");

  // Ensure schema: add is_courier and order_status if missing
  try {
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_courier BOOLEAN DEFAULT false;`);
    await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'created';`);
    // optionally you could add courier_id or indexes here
  } catch (err) {
    console.error('Schema ensure error', err);
    // don't exit; but log
  }
}
connectDbAndEnsureSchema().catch(err => {
  console.error('Postgres connect error', err);
  process.exit(1);
});

// ---------- Helpers ----------
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
const SALT_ROUNDS = 10;

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ success: false, message: 'Authorization header missing' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ success: false, message: 'Invalid auth format' });
  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, is_admin?, is_courier? }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}


// ---- ADMIN CHECK ----
async function adminOnly(req, res, next) {
  try {
    const q = await db.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [req.user.id]
    );
    const u = q.rows[0];
    if (!u || !u.is_admin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    next();
  } catch (err) {
    console.error("adminOnly error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ---- COURIER CHECK ----
async function courierOnly(req, res, next) {
  try {
    const q = await db.query(
      "SELECT is_courier FROM users WHERE id = $1",
      [req.user.id]
    );
    const u = q.rows[0];
    if (!u || !u.is_courier) {
      return res.status(403).json({ success: false, message: "Courier only" });
    }
    next();
  } catch (err) {
    console.error("courierOnly error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}


// ---------- Domain: Order ----------
class Order {
  constructor(data = {}) {
    this.id = data.id || null;
    this.firstName = data.firstName || data.firstname || null;
    this.lastName = data.lastName || data.lastname || null;

    this.pointA_lat = data.pointA_lat ?? data.pointALat ?? null;
    this.pointA_lng = data.pointA_lng ?? data.pointALng ?? null;
    this.pointB_lat = data.pointB_lat ?? data.pointBLat ?? null;
    this.pointB_lng = data.pointB_lng ?? data.pointBLng ?? null;

    this.weight = data.weight ?? null;
    this.distance = data.distance ?? null;
    this.price = data.price ?? null;

    this.addressA = data.addressA || data.addressa || null;
    this.addressB = data.addressB || data.addressb || null;

    this.senderName = data.senderName || null;
    this.senderAddress = data.senderAddress || null;
    this.receiverName = data.receiverName || null;
    this.receiverAddress = data.receiverAddress || null;

    this.comment = data.comment || null;
    this.route = data.route || null;

    // new fields
    // frontend may send delivery_date / deliveryTime or deliveryDate / delivery_time
    this.deliveryDate = data.deliveryDate || data.delivery_date || null; // format: YYYY-MM-DD
    this.deliveryTime = data.deliveryTime || data.delivery_time || null; // format: HH:MM or HH:MM:SS

    // order status
    this.orderStatus = data.orderStatus || data.order_status || 'created';
  }

  validate() {
    // firstName / lastName больше не проверяем

    if (this.pointA_lat == null || this.pointA_lng == null)
        throw new Error('pointA coordinates required');

    if (this.pointB_lat == null || this.pointB_lng == null)
        throw new Error('pointB coordinates required');

    if (this.weight == null)
        throw new Error('weight required');

    return true;
  }

  toDbParams() {
    // keep order consistent with SQL in OrderRepository.save
    return [
      this.firstName,
      this.lastName,
      this.pointA_lat,
      this.pointA_lng,
      this.pointB_lat,
      this.pointB_lng,
      this.weight,
      this.distance,
      this.price,
      this.addressA,
      this.addressB,
      this.senderName,
      this.senderAddress,
      this.receiverName,
      this.receiverAddress,
      this.comment,
      this.deliveryDate,
      this.deliveryTime,
      this.orderStatus
    ];
  }
}

// ---------- Repository: OrderRepository ----------
class OrderRepository {
  // save(order, userId) — userId optional (NULL allowed)
  async save(order, userId = null) {
    const values = order.toDbParams();
    // push userId as last param
    values.push(userId);

    const sql = `
      INSERT INTO orders (
        firstname, lastname,
        pointa_lat, pointa_lng,
        pointb_lat, pointb_lng,
        weight, distance, price,
        addressa, addressb,
        sendername, senderaddress,
        receivername, receiveraddress,
        comment,
        delivery_date, delivery_time,
        order_status,
        user_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      )
      RETURNING *
    `;
    const res = await db.query(sql, values);
    const row = res.rows[0];
    return {
      id: row.id,
      firstName: row.firstname,
      lastName: row.lastname,
      pointA_lat: row.pointa_lat,
      pointA_lng: row.pointa_lng,
      pointB_lat: row.pointb_lat,
      pointB_lng: row.pointb_lng,
      weight: row.weight,
      distance: row.distance,
      price: row.price ? Number(row.price).toFixed(2) : null,
      addressA: row.addressa,
      addressB: row.addressb,
      senderName: row.sendername,
      senderAddress: row.senderaddress,
      receiverName: row.receivername,
      receiverAddress: row.receiveraddress,
      comment: row.comment,
      deliveryDate: row.delivery_date ? row.delivery_date.toISOString().slice(0,10) : null,
      deliveryTime: row.delivery_time ? row.delivery_time : null,
      orderStatus: row.order_status || 'created',
      userId: row.user_id
    };
  }

  async getOrdersByUser(userId) {
    const q = await db.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC`,
      [userId]
    );
    return q.rows;
  }

  async getAll() {
    const q = await db.query(`SELECT * FROM orders ORDER BY id DESC`);
    return q.rows;
  }
}

// ---------- External services (Currency/Weather/Vehicle/Mail) ----------
class WeatherService {
  constructor() {
    console.log('WeatherService initialized (Open-Meteo)');
  }

  async getWeather(lat, lng) {
    try {
      if (!lat || !lng) return null;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (!data.current_weather) return null;
      return { temp: data.current_weather.temperature, desc: "Погода з Open-Meteo" };
    } catch (err) {
      console.warn("WeatherService error:", err.message);
      return null;
    }
  }
}

class CurrencyService {
  async getUsdRate() {
    try {
      const res = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
      const data = await res.json();
      if (!Array.isArray(data) || !data[0]?.rate) return null;
      return 1 / data[0].rate;
    } catch (err) {
      console.error("Currency API error:", err);
      return null;
    }
  }
}

class ExternalVehicleAPI {
  async fetchTrucks() {
    try {
      const res = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/getvehicletypesformake/ford?format=json");
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      return json.Results || [];
    } catch (err) {
      console.log("External API error:", err);
      return [];
    }
  }

  async pickVehicle(weightKg) {
    const trucks = await this.fetchTrucks();
    if (weightKg <= 50) return { type: "Легковий автомобіль", maxWeight: 50 };
    if (weightKg <= 200) return { type: "Мікроавтобус", maxWeight: 200 };
    if (weightKg <= 500) return { type: "Малотоннажна вантажівка", maxWeight: 500 };
    if (weightKg <= 2000) return { type: "Середньотоннажна вантажівка", maxWeight: 2000 };
    const truck = trucks.find(t => t.VehicleTypeName && t.VehicleTypeName.includes("Truck"));
    return { type: truck ? `Велика вантажівка (${truck.VehicleTypeName})` : "Велика вантажівка", maxWeight: 20000 };
  }
}

class MailService {
  constructor(currencyService, weatherService, vehicleService, transporter) {
    this.currencyService = currencyService;
    this.weatherService = weatherService;
    this.vehicleService = vehicleService;

    this.transporter = transporter || nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER || process.env.EMAIL_LOGIN,
        pass: process.env.GMAIL_PASS || process.env.EMAIL_PASSWORD,
      },
    });

    this.carrier = process.env.CARRIER_EMAIL || process.env.MAIL_RECEIVER || 'i7104804@gmail.com';
  }

  async sendOrderNotification(order) {
    try {
      const invoice = await this.buildInvoice(order);
      const info = await this.transporter.sendMail({
        from: process.env.GMAIL_USER || process.env.EMAIL_LOGIN,
        to: this.carrier,
        subject: `📦 Нова накладна — #${order.id || 'n/a'}`,
        html: invoice.html,
        attachments: invoice.attachments
      });
      return info;
    } catch (err) {
      console.error('MailService.sendOrderNotification error:', err);
      throw err;
    }
  }

  // ... buildInvoice / generateRouteImage methods as in your original MailService ...
  async buildInvoice(order) {
    let vehicle = { type: 'Невідомий транспорт', maxWeight: '—' };
    try {
      if (this.vehicleService?.pickVehicle) {
        const v = await this.vehicleService.pickVehicle(order.weight);
        if (v) vehicle = v;
      }
    } catch (err) { console.warn('vehicleService failed', err); }

    let priceUsd = null;
    try {
      if (this.currencyService?.getUsdRate) {
        const usdRate = await this.currencyService.getUsdRate();
        if (usdRate) priceUsd = Number(order.price) * Number(usdRate);
      }
    } catch (err) { console.warn('currencyService failed', err); }

    let weatherStr = '—';
    try {
      if (this.weatherService?.getWeather) {
        const w = await this.weatherService.getWeather(order.pointB_lat, order.pointB_lng);
        if (w) weatherStr = `${w.temp}°C${w.desc ? ' — ' + w.desc : ''}`;
      }
    } catch (err) { console.warn('weatherService failed', err); }

    const deliveryDateStr = order.deliveryDate || order.delivery_date || '—';
    const deliveryTimeStr = order.deliveryTime || order.delivery_time || '—';

    const html = `
      <h2>📦 Нова накладна</h2>
      <p><b>Відправник:</b> ${order.senderName || '—'}</p>
      <p><b>Одержувач:</b> ${order.receiverName || '—'}</p>
      <p><b>Адреса відправлення:</b> ${order.senderAddress || '—'}</p>
      <p><b>Адреса доставки:</b> ${order.receiverAddress || '—'}</p>
      <hr />
      <p><b>Дата доставки:</b> ${deliveryDateStr}</p>
      <p><b>Час доставки:</b> ${deliveryTimeStr}</p>
      <hr />
      <p><b>Рекомендований транспорт:</b> ${vehicle.type}</p>
      <p><b>Максимальна вага:</b> ${vehicle.maxWeight}</p>
      <p><b>Вага вантажу:</b> ${order.weight ?? '—'} кг</p>
      <p><b>Ціна:</b> ${order.price ?? '—'} грн (${priceUsd ? priceUsd.toFixed(2) : '—'} $)</p>
      <p><b>Погода у місці доставки:</b> ${weatherStr}</p>
      <hr />
      <p>Короткі дані замовлення (ID: ${order.id || 'n/a'})</p>
    `;

    const attachments = [];
    if (order.route && Array.isArray(order.route) && order.route.length > 1) {
      try {
        const buf = await this.generateRouteImage(order.route);
        attachments.push({ filename: 'route.png', content: buf });
      } catch (err) { console.warn('generateRouteImage failed', err); }
    }
    return { html, attachments };
  }

  latLngToTile(lat, lng, zoom) {
    const x = ((lng + 180) / 360) * Math.pow(2, zoom);
    const y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom);
    return { x, y };
  }

  async loadTile(z, x, y) {
    try {
      const res = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const img = new Image();
      img.src = buf;
      return img;
    } catch (err) {
      return null;
    }
  }

  async generateRouteImage(routeCoords) {
    const zoom = 14, TILE = 256, W = 800, H = 600;
    const lats = routeCoords.map(p => p[0]), lngs = routeCoords.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const { x: minXf, y: minYf } = this.latLngToTile(maxLat, minLng, zoom);
    const { x: maxXf, y: maxYf } = this.latLngToTile(minLat, maxLng, zoom);
    const minX = Math.floor(minXf), maxX = Math.floor(maxXf), minY = Math.floor(minYf), maxY = Math.floor(maxYf);
    const tilesX = maxX - minX + 1, tilesY = maxY - minY + 1;
    const big = createCanvas(tilesX * TILE, tilesY * TILE); const ctx = big.getContext('2d');
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const tile = await this.loadTile(zoom, x, y);
      if (tile) ctx.drawImage(tile, (x - minX) * TILE, (y - minY) * TILE, TILE, TILE);
    }
    const final = createCanvas(W, H); const fc = final.getContext('2d'); fc.drawImage(big, 0, 0, W, H);
    fc.strokeStyle = '#0066ff'; fc.lineWidth = 4; fc.beginPath();
    const toPixel = (lat, lng) => { const t = this.latLngToTile(lat, lng, zoom); return { x: ((t.x - minX) * TILE) * (W / (tilesX * TILE)), y: ((t.y - minY) * TILE) * (H / (tilesY * TILE)) }; };
    const start = toPixel(routeCoords[0][0], routeCoords[0][1]); fc.moveTo(start.x, start.y);
    for (let i = 1; i < routeCoords.length; i++) { const p = toPixel(routeCoords[i][0], routeCoords[i][1]); fc.lineTo(p.x, p.y); }
    fc.stroke();
    return final.toBuffer('image/png');
  }
}

// ---------- Usecase: OrderService ----------
class OrderService {
  constructor(orderRepository, mailService) {
    this.orderRepository = orderRepository;
    this.mailService = mailService;
  }

  async createOrder(dto, userId) {
    const order = new Order(dto);
    order.validate();

    const saved = await this.orderRepository.save(order, userId);

    try {
      if (this.mailService?.sendOrderNotification) {
        await this.mailService.sendOrderNotification(saved);
      }
    } catch (err) {
      console.error('Mail send failed:', err && err.message ? err.message : err);
    }

    return saved;
  }

  async getOrdersByUser(userId) {
    return this.orderRepository.getOrdersByUser(userId);
  }

  async getAll() {
    return this.orderRepository.getAll();
  }
}

// ---------- Controller: OrderController ----------
function createOrderController(orderService) {
  return {
    async saveOrder(req, res) {
      try {
        const dto = req.body;
        const mapped = {
          firstName: dto.firstName ?? dto.firstname,
          lastName: dto.lastName ?? dto.lastname,
          pointA_lat: dto.pointA_lat,
          pointA_lng: dto.pointA_lng,
          pointB_lat: dto.pointB_lat,
          pointB_lng: dto.pointB_lng,
          weight: dto.weight,
          distance: dto.distance,
          price: dto.price ? Number(Number(dto.price).toFixed(2)) : null,
          addressA: dto.addressA ?? dto.addressa,
          addressB: dto.addressB ?? dto.addressb,
          senderName: dto.senderName,
          senderAddress: dto.senderAddress,
          receiverName: dto.receiverName,
          receiverAddress: dto.receiverAddress,
          comment: dto.comment,
          route: dto.route,
          deliveryDate: dto.deliveryDate ?? dto.delivery_date,
          deliveryTime: dto.deliveryTime ?? dto.delivery_time,
          orderStatus: dto.orderStatus ?? dto.order_status
        };

        const userId = req.user?.id;
        const order = await orderService.createOrder(mapped, userId);
        res.status(201).json({ success: true, orderId: order.id, data: order });
      } catch (err) {
        console.error('Controller.saveOrder:', err);
        res.status(500).json({ success: false, message: err.message || 'Server error' });
      }
    },

    async getOrders(req, res) {
      try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        const rows = await orderService.getOrdersByUser(userId);
        res.json({ success: true, data: rows });
      } catch (err) {
        console.error('Controller.getOrders:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    }
  };
}

// ---------- Auth routes (register/login/me) ----------
async function createAuthRoutes() {
  const router = express.Router();

  // register
  router.post('/register', async (req, res) => {
    try {
      const { email, password, firstname, lastname } = req.body;
      if (!email || !password) return res.status(400).json({ success: false, message: 'email and password required' });

      // check existing
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) return res.status(400).json({ success: false, message: 'Email already registered' });

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      const insert = await db.query(
        // include is_admin and is_courier in returning so frontend can know role flags
        `INSERT INTO users (email, password, firstname, lastname) VALUES ($1,$2,$3,$4) RETURNING id, email, firstname, lastname, created_at, is_admin, is_courier`,
        [email, hash, firstname || null, lastname || null]
      );
      const user = insert.rows[0];
      const token = signToken({ id: user.id, email: user.email, is_admin: !!user.is_admin, is_courier: !!user.is_courier });
      // respond with explicit user object (without password) and include is_admin & is_courier
      res.json({ success: true, token, user: { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname, is_admin: !!user.is_admin, is_courier: !!user.is_courier } });
    } catch (err) {
      console.error('register error', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // login
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ success: false, message: 'email and password required' });

      const q = await db.query('SELECT id, email, password, firstname, lastname, is_admin, is_courier FROM users WHERE email = $1', [email]);
      const user = q.rows[0];
      if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });

      const token = signToken({ id: user.id, email: user.email, is_admin: !!user.is_admin, is_courier: !!user.is_courier });
      // explicitly return user object without password and include is_admin & is_courier
      res.json({ success: true, token, user: { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname, is_admin: !!user.is_admin, is_courier: !!user.is_courier } });
    } catch (err) {
      console.error('login error', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // me
  router.get('/me', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const q = await db.query(
        'SELECT id, email, firstname, lastname, created_at, is_admin, is_courier FROM users WHERE id = $1',
        [userId]
      );
      const user = q.rows[0];
      res.json({ success: true, user });
    } catch (err) {
      console.error('me error', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  return router;
}

// ---------- Routes wiring ----------
const currencyService = new CurrencyService();
const weatherService = new WeatherService();
const vehicleService = new ExternalVehicleAPI();
const mailService = new MailService(currencyService, weatherService, vehicleService);

const orderRepository = new OrderRepository();
const orderService = new OrderService(orderRepository, mailService);
const orderController = createOrderController(orderService);

// Auth routes
createAuthRoutes().then(authRouter => {
  app.use('/auth', authRouter);

  // Order routes (protected)
  const orderRouter = express.Router();
  orderRouter.post('/orders', authMiddleware, orderController.saveOrder);
  orderRouter.get('/orders', authMiddleware, orderController.getOrders);
  app.use('/api', orderRouter);

  // ---------------- COURIER API ----------------
  const courierRouter = express.Router();

  // Get recent orders for courier (created / accepted / on_way)
  courierRouter.get('/orders', authMiddleware, courierOnly, async (req, res) => {
    try {
    const q = await db.query(
      "SELECT * FROM orders ORDER BY id DESC"
    );
      res.json({ success: true, orders: q.rows });
    } catch (err) {
      console.error('courier/orders error', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // Update order status (by courier)
  courierRouter.patch('/orders/:id/status', authMiddleware, courierOnly, async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { status } = req.body;
      const allowed = ['accepted', 'on_way', 'delivered', 'cancelled'];

      if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

      await db.query("UPDATE orders SET order_status = $1 WHERE id = $2", [status, orderId]);

      // Optionally: notify user via email/push here

      res.json({ success: true });
    } catch (err) {
      console.error('courier update status error', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  app.use('/api/courier', courierRouter);

    // ---------------- ADMIN API ----------------

  // Получить всех пользователей
  app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
    try {
      const q = await db.query(
        "SELECT id, email, firstname, lastname, created_at, is_admin, is_courier FROM users ORDER BY id"
      );
      res.json({ success: true, users: q.rows });
    } catch (err) {
      console.error("admin/users error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // Получить заказы конкретного пользователя
  app.get('/api/admin/users/:id/orders', authMiddleware, adminOnly, async (req, res) => {
    try {
      const userId = Number(req.params.id);

      const q = await db.query(
        "SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC",
        [userId]
      );

      res.json({ success: true, orders: q.rows });
    } catch (err) {
      console.error("admin/orders error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });


  // Optional: endpoint to view all orders (admin) - not protected here, but you can add role checks
  app.get('/api/all-orders', async (req, res) => {
    try {
      const rows = await orderService.getAll();
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // root
  app.get('/', (req, res) => res.json({ status: 'OK', serverTime: new Date().toISOString() }));

  // start server
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Backend with auth running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize auth routes', err);
});
