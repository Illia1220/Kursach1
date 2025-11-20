module.exports = function createOrderController(orderService, emailService) {
  return {
    async saveOrder(req, res) {
      try {
        const data = req.body;

        // Маппинг: frontend → база данных
        const mapped = {
          firstName: data.senderName,        // отправитель
          lastName: data.receiverName,       // получатель
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
          comment: data.comment
        };

        // 1) Сохраняем заказ в БД
        const order = await orderService.createOrder(mapped);

        // 2) Отправляем письмо перевозчику
        await emailService.sendInvoice(mapped);

        res.json({ success: true, orderId: order.id });

      } catch (err) {
        console.error("Controller error:", err);
        res.status(500).json({ success: false, message: "Server error" });
      }
    }
  };
};
