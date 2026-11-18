# Community Library Management System

A full-stack library management system built with React, Express, and MySQL.

## Features
- Dashboard with total books, copies, users, and low-stock alerts
- Add, edit, and delete books
- Record stock arrivals and borrowing transactions
- View transaction history
- Add, edit, and delete users
- Login with admin/member roles
- React Router navigation and responsive CSS

## Requirements
- Node.js 18+
- MySQL 8+

## 1. Create the database
Open MySQL Workbench or your MySQL terminal and run:

```sql
CREATE DATABASE community_library;
```

The backend creates the required tables automatically when it starts.

## 2. Start the backend
```bash
cd backend
npm install
```
Copy `.env.example` to `.env` and update the MySQL username/password.

```bash
npm run dev
```
The API runs at `http://localhost:5000`.

## 3. Start the frontend
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the local URL shown by Vite (usually `http://localhost:5173`).

## First login
On the first run, the backend creates this starter administrator if no users exist:

- Membership ID: `ADMIN001`
- Password: `Admin123!`

Change this password after logging in. This starter account is for local coursework/demo use only.

## API routes
- `POST /api/auth/login`
- `GET, POST /api/books`
- `PUT, DELETE /api/books/:id`
- `GET, POST /api/transactions`
- `GET, POST /api/users`
- `PUT, DELETE /api/users/:id`
- `GET /api/dashboard`

All routes except login require a bearer token. User creation and management require an administrator account. Members can view books and create borrowing transactions.

## Notes
- Stock cannot become negative.
- A borrow transaction reduces available stock.
- A stock-arrival transaction increases available stock.
- The transaction history stores the user, book, type, quantity, and date.
- This is an educational starter project. For production use, add stronger account recovery, rate limiting, audit logging, and deployment secrets management.
