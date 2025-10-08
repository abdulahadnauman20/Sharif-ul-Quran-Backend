# Quranic Backend API

A Node.js/Express backend API for the Quranic Platform with PostgreSQL database integration. Built with ES modules for modern JavaScript development.

## Features

- 🔐 JWT-based authentication
- 👤 User registration and login
- 🛡️ Security middleware (Helmet, CORS, Rate limiting)
- 📊 PostgreSQL database integration
- ✅ Input validation
- 🚀 Production-ready setup

## Project Structure

```
quranic-backend/
├── src/
│   ├── config/          # Database configuration
│   │   └── db.js
│   ├── controllers/     # Request handlers
│   │   └── authController.js
│   ├── middlewares/     # Auth, error handlers
│   │   └── authMiddleware.js
│   ├── models/          # Database queries
│   │   └── UserModel.js
│   ├── routes/          # API routes
│   │   └── authRoutes.js
│   ├── utils/           # Helper functions
│   │   └── generateToken.js
│   ├── app.js           # Express setup
│   └── server.js        # Entry point
├── .env                 # Environment variables
├── database_setup.sql   # Database schema
├── package.json         # ES modules enabled
└── README.md
```

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quranic_platform
DB_USER=your_username
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

### 2. Database Setup

1. Install PostgreSQL on your system
2. Create a database named `quranic_platform`
3. Run the SQL script to create tables:

```bash
psql -U your_username -d quranic_platform -f database_setup.sql
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Authentication Routes (`/api/auth`)

- `POST /register` - Register a new user
- `POST /login` - Login user
- `GET /profile` - Get user profile (protected)
- `PUT /profile` - Update user profile (protected)

### Health Check

- `GET /health` - Server health status

## Example API Usage

### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Login User
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Get Profile (Protected)
```bash
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Dependencies

- **express**: Web framework
- **pg**: PostgreSQL client
- **bcryptjs**: Password hashing
- **jsonwebtoken**: JWT token generation
- **cors**: Cross-origin resource sharing
- **dotenv**: Environment variable management
- **helmet**: Security headers
- **express-rate-limit**: Rate limiting
- **express-validator**: Input validation
- **nodemon**: Development auto-restart

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Rate limiting (100 requests per 15 minutes)
- CORS protection
- Security headers with Helmet
- Input validation and sanitization
- SQL injection protection with parameterized queries

## Development

The server runs on `http://localhost:3000` by default. All API endpoints are prefixed with `/api/auth` for authentication routes.

For development, use `npm run dev` which will automatically restart the server when files change.

## OTP / Password Reset: Database migration & SMTP setup

If you want to enable the OTP-based password reset flow (email delivery via Gmail), follow these steps:

1) Apply DB migration to add OTP-related columns

Run the SQL migration included in this repository to add the required columns to the `users` table:

```bash
psql -U your_username -d your_database -f database/migrations/2025-10-02_add_otp_columns.sql
```

This will add the columns: `otp`, `otp_expiry`, `otp_attempts`, `otp_last_attempt`.

2) Configure Gmail SMTP (recommended)

Create a `.env` file in the project root (or set environment variables) with these keys filled:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_db
DB_USER=your_user
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret

# SMTP (use Gmail account and an App Password)
SMTP_USER=teamtestsphere@gmail.com
SMTP_PASS=YOUR_GMAIL_APP_PASSWORD
SMTP_FROM=teamtestsphere@gmail.com

# Optional dev helper: return OTP in API response (development only)
DEV_RETURN_OTP=true

PORT=3000
NODE_ENV=development
```

Important: for Gmail you should create an App Password (recommended) instead of allowing less-secure apps. See Google Account -> Security -> App passwords. Use the generated 16-character password as `SMTP_PASS`.

3) Restart the backend

After applying the migration and setting `.env`, restart the server:

```bash
npm run dev
```

4) Test the flow

- POST `/api/auth/forgot-password` with `{ "email": "existing_user@example.com" }` — you'll get a success response. If `DEV_RETURN_OTP=true` you'll receive the OTP in the response during development.
- Use `/api/auth/verify-otp`, `/api/auth/reset-password` as described in code.

If sending fails, the server will log the OTP to the console as a fallback so you can continue testing.
