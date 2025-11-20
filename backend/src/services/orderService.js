const Order = require("../models/Order");

exports.saveOrder = async (data) => {
  return await Order.create(data);
};