const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

router.post("/save-order", orderController.saveOrder);

module.exports = router;