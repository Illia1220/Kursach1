class Order {
  constructor(props = {}) {
    this.id = props.id || null;
    this.firstName = props.firstName || null;
    this.lastName = props.lastName || null;
    this.pointA_lat = props.pointA_lat || null;
    this.pointA_lng = props.pointA_lng || null;
    this.pointB_lat = props.pointB_lat || null;
    this.pointB_lng = props.pointB_lng || null;
    this.weight = props.weight || null;
    this.distance = props.distance || null;
    this.price = props.price || null;
    this.addressA = props.addressA || null;
    this.addressB = props.addressB || null;
    this.senderName = props.senderName || null;
    this.senderAddress = props.senderAddress || null;
    this.receiverName = props.receiverName || null;
    this.receiverAddress = props.receiverAddress || null;
    this.comment = props.comment || null;
  }

  validate() {
    // Basic validation; can be extended
    if (!this.pointA_lat || !this.pointA_lng) throw new Error('pointA coordinates required');
    if (!this.pointB_lat || !this.pointB_lng) throw new Error('pointB coordinates required');
    if (!this.weight) throw new Error('weight required');
    return true;
  }

  toDbParams() {
    return [
      this.firstName,
      this.lastName,
      this.pointA_lat,
      this.pointA_lng,
      this.pointB_lat,
      this.pointB_lng,
      this.weight,
      this.distance,
      this.price,
      this.addressA,
      this.addressB,
      this.senderName,
      this.senderAddress,
      this.receiverName,
      this.receiverAddress,
      this.comment
    ];
  }
}

module.exports = Order;