const db = require('../config/db');

class OrderRepository {
  constructor(dbClient = db) {
    this.db = dbClient;
  }

  async save(order) {
    const query = `
      INSERT INTO orders (
        firstname,
        lastname,
        pointa_lat,
        pointa_lng,
        pointb_lat,
        pointb_lng,
        weight,
        distance,
        price,
        addressa,
        addressb,
        sendername,
        senderaddress,
        receivername,
        receiveraddress,
        comment
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16
      )
      RETURNING id;
    `;

    const values = order.toDbParams();
    const res = await this.db.query(query, values);
    return res.rows[0];
  }
}

module.exports = OrderRepository;
