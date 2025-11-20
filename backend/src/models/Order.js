const db = require("../config/db");

class Order {
  static async create(d) {
    const query = `
      INSERT INTO orders 
      (firstname, lastname, pointA_lat, pointA_lng, pointB_lat, pointB_lng, weight, distance, price, addressA, addressB)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `;
    const values = [
      d.firstName, d.lastName, d.pointA_lat, d.pointA_lng,
      d.pointB_lat, d.pointB_lng, d.weight, d.distance, d.price,
      d.addressA, d.addressB
    ];
    return db.query(query, values);
  }
}

module.exports = Order;