const express = require('express');
const cors = require('cors');
require('dotenv').config();

const createOrderController = require('./src/controllers/OrderController');
const OrderRepository = require('./src/repositories/OrderRepository');
const OrderService = require('./src/usecases/OrderService');
const MailService = require('./src/services/MailService');
const createOrderRoutes = require('./src/routes/orderRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Dependency Injection (DI)
const orderRepository = new OrderRepository();
const emailService = new MailService();  // Mail service отдельно
const orderService = new OrderService(orderRepository); // сервис только для БД

// Controller принимает 2 зависимости
const orderController = createOrderController(orderService, emailService);

// Routes получают controller
app.use('/api', createOrderRoutes(orderController));

// health-check endpoint
app.get('/', (req, res) => {
  res.json({ serverTime: new Date().toISOString(), status: "OK" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend (refactored) running on http://localhost:${PORT}`));
