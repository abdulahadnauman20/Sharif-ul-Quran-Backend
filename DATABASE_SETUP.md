# Database Setup Instructions

## Prerequisites
- PostgreSQL installed and running
- pgAdmin or any PostgreSQL client
- Node.js and npm installed

## Step 1: Create Database
1. Open pgAdmin
2. Connect to your PostgreSQL server
3. Right-click on "Databases" → "Create" → "Database"
4. Name: `quranic_platform`
5. Click "Save"

## Step 2: Configure Environment Variables
Create a `.env` file in the `quranic-backend` directory with the following content:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quranic_platform
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=5000
NODE_ENV=development
```

**Important:** Replace `your_postgres_password` with your actual PostgreSQL password and `your_super_secret_jwt_key_here` with a strong secret key.

## Step 3: Install Dependencies
```bash
cd quranic-backend
npm install
```

## Step 4: Setup Database Schema
Run the database setup script:
```bash
npm run setup-db
```

Or manually run the SQL script:
1. Open pgAdmin
2. Connect to `quranic_platform` database
3. Open Query Tool
4. Copy and paste the contents of `database/schema.sql`
5. Execute the script

## Step 5: Start the Server
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user (Student/Qari)
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile (protected)
- `PUT /api/auth/profile` - Update user profile (protected)

### User Management
- `GET /api/auth/users` - Get all users (protected)
- `GET /api/auth/users/:userType` - Get users by type (Student/Qari) (protected)

## Database Schema

### Users Table
- `id` - Primary key (SERIAL)
- `name` - User's full name (VARCHAR)
- `email` - User's email (VARCHAR, UNIQUE)
- `password` - Hashed password (VARCHAR)
- `user_type` - Either 'Student' or 'Qari' (VARCHAR)
- `is_verified` - Email verification status (BOOLEAN)
- `created_at` - Creation timestamp (TIMESTAMP)
- `updated_at` - Last update timestamp (TIMESTAMP)

## Testing Registration

You can test the registration with the following JSON:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "userType": "Student"
}
```

Or for a Qari:
```json
{
  "name": "Ahmed Hassan",
  "email": "ahmed@example.com",
  "password": "password123",
  "userType": "Qari"
}
```

## Troubleshooting

1. **Connection Error**: Check your PostgreSQL service is running and credentials are correct
2. **Permission Error**: Ensure your PostgreSQL user has CREATE privileges
3. **Port Error**: Make sure port 5000 is available or change it in the .env file

