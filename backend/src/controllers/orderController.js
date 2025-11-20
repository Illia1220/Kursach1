const orderService = require("../services/orderService");

exports.saveOrder = async (req, res) => {
  try {
    const result = await orderService.saveOrder(req.body);
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};