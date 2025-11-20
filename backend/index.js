const express = require('express');
const cors = require('cors');
const Database = require('./db/Database');
const OrderService = require('./services/OrderService');
const OrderController = require('./controllers/OrderController');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database({ host: 'localhost', port: 5432, user: 'postgres', password: 'password', database: 'postgres' });
(async () => { try { await db.connect(); } catch (e) { console.error(e); } })();

const orderService = new OrderService(db);
const orderController = new OrderController(orderService);

app.post('/api/save-order', orderController.save);

app.get('/', (req,res)=> res.json({ serverTime: new Date().toISOString() }));

app.listen(3001, ()=> console.log('Backend запущен на http://localhost:3001'));
// plant uml