const Order = require('../domain/Order');

class OrderService {
  constructor(orderRepository, mailService) {
    this.orderRepository = orderRepository;
    this.mailService = mailService;
  }

  async createOrder(dto) {
    // map dto to domain object
    const order = new Order(dto);
    order.validate();

    // save
    const saved = await this.orderRepository.save(order);

    // send email (best-effort)
    try {
      await this.mailService.sendInvoice(dto);
    } catch (err) {
      console.error('Mail send failed:', err && err.message ? err.message : err);
    }

    return saved;
  }
}

module.exports = OrderService;