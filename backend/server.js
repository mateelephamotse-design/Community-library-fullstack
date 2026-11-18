import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./config/db.js";
import { authenticate, adminOnly } from "./middleware/auth.js";

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

async function initializeDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    membership_id VARCHAR(50) NOT NULL UNIQUE,
    role ENUM('admin','member') NOT NULL DEFAULT 'member',
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS books (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    author VARCHAR(120) NOT NULL,
    genre VARCHAR(80) NOT NULL,
    isbn VARCHAR(30) NOT NULL UNIQUE,
    quantity INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    user_id INT NOT NULL,
    type ENUM('stock_in','borrow','return') NOT NULL,
    quantity INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Allow the existing database to store book returns.
  await pool.query(
    "ALTER TABLE transactions MODIFY COLUMN type ENUM('stock_in','borrow','return') NOT NULL"
  );

  const [users] = await pool.query("SELECT id FROM users LIMIT 1");

  if (users.length === 0) {
    const hash = await bcrypt.hash("Admin123!", 10);

    await pool.query(
      "INSERT INTO users (name, membership_id, role, password_hash) VALUES (?, ?, 'admin', ?)",
      ["Library Administrator", "ADMIN001", hash]
    );

    console.log("Starter admin created: ADMIN001 / Admin123!");
  }
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { membershipId, password } = req.body;

    if (!membershipId || !password) {
      return res.status(400).json({
        message: "Enter your membership ID and password."
      });
    }

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE membership_id = ?",
      [membershipId]
    );

    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        message: "Incorrect membership ID or password."
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        membershipId: user.membership_id,
        role: user.role
      },
      process.env.JWT_SECRET || "development_secret_change_me",
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        membershipId: user.membership_id,
        role: user.role
      }
    });

  } catch (error) {
    res.status(500).json({
      message: "Login failed.",
      error: error.message
    });
  }
});

// Protect the remaining API routes.
app.use("/api", authenticate);

// Dashboard
app.get("/api/dashboard", async (req, res) => {
  try {
    const [[bookStats]] = await pool.query(
      "SELECT COUNT(*) AS titleCount, COALESCE(SUM(quantity),0) AS copyCount FROM books"
    );

    const [[userStats]] = await pool.query(
      "SELECT COUNT(*) AS userCount FROM users"
    );

    const [lowStock] = await pool.query(
      "SELECT id, title, author, quantity FROM books WHERE quantity < 2 ORDER BY quantity, title"
    );

    res.json({
      ...bookStats,
      ...userStats,
      lowStock
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all books
app.get("/api/books", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM books ORDER BY title"
    );

    res.json(rows);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add a book
app.post("/api/books", adminOnly, async (req, res) => {
  try {
    const { title, author, genre, isbn, quantity } = req.body;

    if (
      !title ||
      !author ||
      !genre ||
      !isbn ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 0
    ) {
      return res.status(400).json({
        message: "Complete all fields and enter a valid quantity."
      });
    }

    const [result] = await pool.query(
      "INSERT INTO books (title, author, genre, isbn, quantity) VALUES (?, ?, ?, ?, ?)",
      [
        title.trim(),
        author.trim(),
        genre.trim(),
        isbn.trim(),
        Number(quantity)
      ]
    );

    const [rows] = await pool.query(
      "SELECT * FROM books WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json(rows[0]);

  } catch (error) {
    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      message: error.code === "ER_DUP_ENTRY"
        ? "That ISBN already exists."
        : error.message
    });
  }
});

// Update a book
app.put("/api/books/:id", adminOnly, async (req, res) => {
  try {
    const { title, author, genre, isbn, quantity } = req.body;

    if (
      !title ||
      !author ||
      !genre ||
      !isbn ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 0
    ) {
      return res.status(400).json({
        message: "Complete all fields and enter a valid quantity."
      });
    }

    const [result] = await pool.query(
      "UPDATE books SET title=?, author=?, genre=?, isbn=?, quantity=? WHERE id=?",
      [
        title.trim(),
        author.trim(),
        genre.trim(),
        isbn.trim(),
        Number(quantity),
        req.params.id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    const [rows] = await pool.query(
      "SELECT * FROM books WHERE id=?",
      [req.params.id]
    );

    res.json(rows[0]);

  } catch (error) {
    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      message: error.code === "ER_DUP_ENTRY"
        ? "That ISBN already exists."
        : error.message
    });
  }
});

// Delete a book
app.delete("/api/books/:id", adminOnly, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM books WHERE id=?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    res.json({ message: "Book deleted." });

  } catch (error) {
    res.status(error.code === "ER_ROW_IS_REFERENCED_2" ? 409 : 500).json({
      message: error.code === "ER_ROW_IS_REFERENCED_2"
        ? "This book has transaction history and cannot be deleted."
        : error.message
    });
  }
});

// Get users
app.get("/api/users", adminOnly, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, membership_id AS membershipId, role, created_at AS createdAt FROM users ORDER BY name"
  );

  res.json(rows);
});

// Add user
app.post("/api/users", adminOnly, async (req, res) => {
  try {
    const { name, membershipId, role, password } = req.body;

    if (
      !name ||
      !membershipId ||
      !password ||
      password.length < 6 ||
      !["admin", "member"].includes(role)
    ) {
      return res.status(400).json({
        message: "Enter a name, membership ID, valid role and password (at least 6 characters)."
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (name,membership_id,role,password_hash) VALUES (?,?,?,?)",
      [name.trim(), membershipId.trim(), role, hash]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      membershipId,
      role
    });

  } catch (error) {
    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      message: error.code === "ER_DUP_ENTRY"
        ? "Membership ID already exists."
        : error.message
    });
  }
});

// Update user
app.put("/api/users/:id", adminOnly, async (req, res) => {
  try {
    const { name, membershipId, role, password } = req.body;

    if (!name || !membershipId || !["admin", "member"].includes(role)) {
      return res.status(400).json({
        message: "Complete all required fields."
      });
    }

    if (Number(req.params.id) === req.user.id && role !== "admin") {
      return res.status(400).json({
        message: "You cannot remove your own administrator role."
      });
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          message: "Password must be at least 6 characters."
        });
      }

      const hash = await bcrypt.hash(password, 10);

      await pool.query(
        "UPDATE users SET name=?, membership_id=?, role=?, password_hash=? WHERE id=?",
        [name.trim(), membershipId.trim(), role, hash, req.params.id]
      );

    } else {
      await pool.query(
        "UPDATE users SET name=?, membership_id=?, role=? WHERE id=?",
        [name.trim(), membershipId.trim(), role, req.params.id]
      );
    }

    const [rows] = await pool.query(
      "SELECT id,name,membership_id AS membershipId,role FROM users WHERE id=?",
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    res.json(rows[0]);

  } catch (error) {
    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      message: error.code === "ER_DUP_ENTRY"
        ? "Membership ID already exists."
        : error.message
    });
  }
});

// Delete user
app.delete("/api/users/:id", adminOnly, async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({
      message: "You cannot delete your own account while logged in."
    });
  }

  try {
    const [result] = await pool.query(
      "DELETE FROM users WHERE id=?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    res.json({ message: "User deleted." });

  } catch (error) {
    res.status(409).json({
      message: "This user has transaction history and cannot be deleted."
    });
  }
});

// Get transaction history
app.get("/api/transactions", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        t.id,
        t.type,
        t.quantity,
        t.created_at AS createdAt,
        b.title AS bookTitle,
        u.name AS userName,
        u.membership_id AS membershipId
      FROM transactions t
      JOIN books b ON b.id = t.book_id
      JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
      LIMIT 200
    `);

    res.json(rows);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Record borrowing, returns and new stock arrivals
app.post("/api/transactions", async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const { bookId, type, quantity } = req.body;

    const id = Number(bookId);
    const amount = Number(quantity);

    if (
      !Number.isInteger(id) ||
      id < 1 ||
      !["stock_in", "borrow", "return"].includes(type) ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return res.status(400).json({
        message: "Choose a book, transaction type and quantity of at least 1."
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Lock the book while checking and updating stock.
    const [books] = await connection.query(
      "SELECT id, quantity FROM books WHERE id = ? FOR UPDATE",
      [id]
    );

    if (!books.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Book not found."
      });
    }

    const current = Number(books[0].quantity);

    // Check available stock before borrowing.
    if (type === "borrow" && current < amount) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "Not enough copies are available."
      });
    }

    // Check how many copies are still borrowed.
    if (type === "return") {
      const [[borrowTotals]] = await connection.query(
        `SELECT COALESCE(SUM(
          CASE
            WHEN type = 'borrow' THEN quantity
            WHEN type = 'return' THEN -quantity
            ELSE 0
          END
        ), 0) AS outstanding
        FROM transactions
        WHERE book_id = ?`,
        [id]
      );

      const outstanding = Number(borrowTotals.outstanding);

      if (outstanding < amount) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: `Cannot return ${amount} copies. Only ${outstanding} ${outstanding === 1 ? "copy has" : "copies have"} been borrowed and not yet returned.`
        });
      }
    }

    // Update the available stock.
    const updated = type === "borrow"
      ? current - amount
      : current + amount;

    await connection.query(
      "UPDATE books SET quantity = ? WHERE id = ?",
      [updated, id]
    );

    // Save the transaction.
    const [result] = await connection.query(
      "INSERT INTO transactions (book_id, user_id, type, quantity) VALUES (?, ?, ?, ?)",
      [id, req.user.id, type, amount]
    );

    await connection.commit();
    transactionStarted = false;

    res.status(201).json({
      id: result.insertId,
      bookId: id,
      type,
      quantity: amount,
      newStock: updated
    });

  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError);
      }
    }

    res.status(500).json({
      message: error.message
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// General error handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    message: "An unexpected server error occurred."
  });
});

const PORT = process.env.PORT || 5000;

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API running at http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error("Could not start server:", error.message);
    process.exit(1);
  });