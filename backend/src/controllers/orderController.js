module.exports = function createOrderController(orderService, emailService) {
  return {
    async saveOrder(req, res) {
      try {
        const data = req.body;

        // Маппинг данных, полученных от клиента
        const mapped = {
          firstName: data.senderName,
          lastName: data.receiverName,

          addressA: data.senderAddress,
          addressB: data.receiverAddress,

          pointA_lat: data.pointA_lat,
          pointA_lng: data.pointA_lng,
          pointB_lat: data.pointB_lat,
          pointB_lng: data.pointB_lng,

          weight: data.weight,
          distance: data.distance,
          price: data.price,

          senderName: data.senderName,
          senderAddress: data.senderAddress,
          receiverName: data.receiverName,
          receiverAddress: data.receiverAddress,
          comment: data.comment,

          // НОВОЕ — маршрут для генерации PNG
          route: data.route || null
        };

        // 1) Сохранение заказа в базе
        const order = await orderService.createOrder(mapped);

        // 2) Отправка письма перевозчику (вместе с картой, если есть маршрут)
        await emailService.sendInvoiceToCarrier(mapped);

        res.json({ success: true, orderId: order.id });

      } catch (err) {
        console.error("Controller error:", err);
        res.status(500).json({ success: false, message: "Server error" });
      }
    }
  };
};
