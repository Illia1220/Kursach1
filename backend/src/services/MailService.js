const nodemailer = require('nodemailer');
require('dotenv').config();

class MailService {
  constructor(transporter) {
    this.transporter = transporter || nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER || process.env.EMAIL_LOGIN,
        pass: process.env.GMAIL_PASS || process.env.EMAIL_PASSWORD
      }
    });

    this.carrier = process.env.CARRIER_EMAIL || 'i7104804@gmail.com';
  }

  // Универсальная функция отправки письма
  async sendInvoice(orderData) {
    const html = `
      <h2>Новая накладная на доставку</h2>
      <p><b>Отправитель:</b> ${orderData.senderName || '—'}</p>
      <p><b>Адрес отправителя:</b> ${orderData.senderAddress || '—'}</p>
      <br/>
      <p><b>Получатель:</b> ${orderData.receiverName || '—'}</p>
      <p><b>Адрес получателя:</b> ${orderData.receiverAddress || '—'}</p>
      <br/>
      <p><b>Вес:</b> ${orderData.weight} кг</p>
      <p><b>Расстояние:</b> ${orderData.distance} км</p>
      <p><b>Цена:</b> ${orderData.price} грн</p>
      <br/>
      <p><b>Комментарий:</b> ${orderData.comment || '—'}</p>
    `;

    await this.transporter.sendMail({
      from: process.env.GMAIL_USER || process.env.EMAIL_LOGIN,
      to: this.carrier,
      subject: '📦 Накладная — новый заказ',
      html
    });
  }

  // ВОТ ЭТОТ МЕТОД НУЖЕН КОНТРОЛЛЕРУ
  async sendInvoiceToCarrier(orderData) {
    return this.sendInvoice(orderData);
  }
}

module.exports = MailService;
