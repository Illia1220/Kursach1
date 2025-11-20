Refactored backend (OOP + SOLID)

Structure:
  src/
    controllers/      - thin controllers (HTTP -> use-cases)
    domain/           - domain entities (Order)
    repositories/     - DB access (OrderRepository)
    services/         - infrastructure services (MailService)
    usecases/         - application services / use-cases (OrderService)
    routes/           - express routers
    config/           - db config (copied)

How to run:
  cd backend_refactored
  npm install
  # set .env with GMAIL_USER, GMAIL_PASS (or EMAIL_LOGIN/EMAIL_PASSWORD) and CARRIER_EMAIL
  npm start

Notes:
  - Database: uses existing src/config/db.js (Postgres client). Ensure DB and orders table contain required columns.
  - This refactor applies dependency injection and single responsibility separation.