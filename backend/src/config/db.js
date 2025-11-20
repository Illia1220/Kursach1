const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "password",
  database: "postgres"
});

client.connect().then(() => console.log("PostgreSQL connected"));

module.exports = client;