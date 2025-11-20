const OrderService = require("../services/OrderService");

class OrderController {
  constructor() {
    this.save = this.save.bind(this);
  }

  async save(req, res) {
    try {
      const result = await OrderService.saveOrder(req.body);
      res.json({ success: true, result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
}

module.exports = OrderController;
