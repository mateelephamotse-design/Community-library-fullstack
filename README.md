# Community Library Management System

A full-stack library management system built with React, Express, and MySQL.

## Features

- Dashboard showing book titles, total copies, registered users, and low-stock alerts
- Book management: add, view, edit, and delete books
- User management: add, view, edit, and delete member and administrator accounts
- Login with administrator and member roles
- Stock-arrival transactions
- Borrowing transactions linked to the library member who borrowed the book
- Return transactions linked to the same member
- Returns cannot exceed the member's outstanding borrowed quantity
- Transaction history showing book, transaction type, member, quantity, staff account, and date
- Administrator-only transaction editing and deletion
- Automatic stock adjustment when transactions are created, edited, or deleted
- React Router navigation
- Controlled forms and API requests using Fetch

## Technologies Used

### Frontend
- React
- JavaScript
- React Router
- CSS
- Vite

### Backend
- Node.js
- Express
- MySQL
- MySQL2
- JWT authentication
- bcryptjs

## Requirements

- Node.js 18 or later
- MySQL 8 or later
- npm

## 1. Create the database

Open MySQL Workbench or your MySQL terminal and run:

```sql
CREATE DATABASE community_library;