const express = require('express');

module.exports = function createOrderRoutes(orderController) {
  const router = express.Router();
  router.post('/save-order', orderController.saveOrder);
  return router;
};