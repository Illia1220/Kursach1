const express = require('express');
const cors = require('cors');
const db = require('./src/config/db');

const OrderController = require('./src/controllers/OrderController');

const app = express();
app.use(cors());
app.use(express.json());

const orderController = new OrderController();

app.post('/api/save-order', orderController.save);

app.get('/', (req,res)=> res.json({ serverTime: new Date().toISOString() }));

app.listen(3001, ()=> console.log('Backend запущен на http://localhost:3001'));
