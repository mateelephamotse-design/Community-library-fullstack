import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./config/db.js";
import { authenticate, adminOnly } from "./middleware/auth.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173"
}));

app.use(express.json());

// Create or update the database tables.
async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      membership_id VARCHAR(50) NOT NULL UNIQUE,
      role ENUM('admin','member') NOT NULL DEFAULT 'member',
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      author VARCHAR(120) NOT NULL,
      genre VARCHAR(80) NOT NULL,
      isbn VARCHAR(30) NOT NULL UNIQUE,
      quantity INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      book_id INT NOT NULL,
      user_id INT NOT NULL,
      type ENUM('stock_in','borrow','return') NOT NULL,
      quantity INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES books(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Make sure the existing database accepts returns.
  await pool.query(`
    ALTER TABLE transactions
    MODIFY COLUMN type ENUM('stock_in','borrow','return') NOT NULL
  `);

  // Add member_id to existing databases without deleting records.
  const [memberColumn] = await pool.query(
    "SHOW COLUMNS FROM transactions LIKE 'member_id'"
  );

  if (memberColumn.length === 0) {
    await pool.query(`
      ALTER TABLE transactions
      ADD COLUMN member_id INT NULL AFTER user_id
    `);
  }

  // Add the member foreign key if it does not already exist.
  const [memberForeignKey] = await pool.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transactions'
      AND COLUMN_NAME = 'member_id'
      AND REFERENCED_TABLE_NAME = 'users'
  `);

  if (memberForeignKey.length === 0) {
    await pool.query(`
      ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_member
      FOREIGN KEY (member_id) REFERENCES users(id)
    `);
  }

  // Create the first administrator if the users table is empty.
  const [users] = await pool.query("SELECT id FROM users LIMIT 1");

  if (users.length === 0) {
    const hash = await bcrypt.hash("Admin123!", 10);

    await pool.query(
      `INSERT INTO users
       (name, membership_id, role, password_hash)
       VALUES (?, ?, 'admin', ?)`,
      ["Library Administrator", "ADMIN001", hash]
    );

    console.log("Starter admin created: ADMIN001 / Admin123!");
  }
}

// Check that the API is running.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Login.
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

// Protect all remaining API routes.
app.use("/api", authenticate);

// Dashboard information.
app.get("/api/dashboard", async (req, res) => {
  try {
    const [[bookStats]] = await pool.query(`
      SELECT
        COUNT(*) AS titleCount,
        COALESCE(SUM(quantity), 0) AS copyCount
      FROM books
    `);

    const [[userStats]] = await pool.query(`
      SELECT COUNT(*) AS userCount FROM users
    `);

    const [lowStock] = await pool.query(`
      SELECT id, title, author, quantity
      FROM books
      WHERE quantity < 2
      ORDER BY quantity, title
    `);

    res.json({
      ...bookStats,
      ...userStats,
      lowStock
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all books.
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

// Add a book.
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
      `INSERT INTO books
       (title, author, genre, isbn, quantity)
       VALUES (?, ?, ?, ?, ?)`,
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

// Edit a book.
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
      `UPDATE books
       SET title=?, author=?, genre=?, isbn=?, quantity=?
       WHERE id=?`,
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

// Delete a book.
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

// Get library members for the transaction form.
app.get("/api/members", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        name,
        membership_id AS membershipId
      FROM users
      WHERE role = 'member'
      ORDER BY name
    `);

    res.json(rows);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all users.
app.get("/api/users", adminOnly, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      id,
      name,
      membership_id AS membershipId,
      role,
      created_at AS createdAt
    FROM users
    ORDER BY name
  `);

  res.json(rows);
});

// Add a user.
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
      `INSERT INTO users
       (name, membership_id, role, password_hash)
       VALUES (?, ?, ?, ?)`,
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

// Edit a user.
app.put("/api/users/:id", adminOnly, async (req, res) => {
  try {
    const { name, membershipId, role, password } = req.body;

    if (
      !name ||
      !membershipId ||
      !["admin", "member"].includes(role)
    ) {
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
        `UPDATE users
         SET name=?, membership_id=?, role=?, password_hash=?
         WHERE id=?`,
        [name.trim(), membershipId.trim(), role, hash, req.params.id]
      );

    } else {
      await pool.query(
        `UPDATE users
         SET name=?, membership_id=?, role=?
         WHERE id=?`,
        [name.trim(), membershipId.trim(), role, req.params.id]
      );
    }

    const [rows] = await pool.query(
      `SELECT id, name, membership_id AS membershipId, role
       FROM users WHERE id=?`,
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

// Delete a user.
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

// Get transaction history, including the member and staff member.
app.get("/api/transactions", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        t.id,
        t.book_id AS bookId,
        t.member_id AS memberId,
        t.type,
        t.quantity,
        t.created_at AS createdAt,
        b.title AS bookTitle,
        u.name AS userName,
        u.membership_id AS recorderMembershipId,
        m.name AS memberName,
        m.membership_id AS memberMembershipId
      FROM transactions t
      JOIN books b ON b.id = t.book_id
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users m ON m.id = t.member_id
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 200
    `);

    res.json(rows);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Calculate how a transaction changes available book stock.
function transactionStockChange(type, quantity) {
  return type === "borrow" ? -quantity : quantity;
}

// Check that a selected account is a library member.
async function getMember(connection, memberId) {
  if (!Number.isInteger(memberId) || memberId < 1) {
    return null;
  }

  const [rows] = await connection.query(
    "SELECT id FROM users WHERE id = ? AND role = 'member'",
    [memberId]
  );

  return rows[0] || null;
}

// Calculate how many copies a member still has borrowed.
async function getOutstandingCopies(
  connection,
  bookId,
  memberId,
  excludedTransactionId = null
) {
  const [rows] = await connection.query(`
    SELECT COALESCE(SUM(
      CASE
        WHEN type = 'borrow' THEN quantity
        WHEN type = 'return' THEN -quantity
        ELSE 0
      END
    ), 0) AS outstanding
    FROM transactions
    WHERE book_id = ?
      AND member_id <=> ?
      AND (? IS NULL OR id <> ?)
  `, [
    bookId,
    memberId,
    excludedTransactionId,
    excludedTransactionId
  ]);

  return Number(rows[0].outstanding);
}

// Create a stock arrival, borrowing or return transaction.
app.post("/api/transactions", async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const { bookId, type, quantity } = req.body;

    const id = Number(bookId);
    const amount = Number(quantity);
    const memberId = type === "stock_in"
      ? null
      : Number(req.body.memberId);

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

    if (type !== "stock_in" && !Number.isInteger(memberId)) {
      return res.status(400).json({
        message: "Select the library member for this borrowing or return."
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

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

    if (type !== "stock_in" && !(await getMember(connection, memberId))) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "The selected library member was not found."
      });
    }

    const currentStock = Number(books[0].quantity);

    if (type === "borrow" && currentStock < amount) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "Not enough copies are available."
      });
    }

    if (type === "return") {
      const outstanding = await getOutstandingCopies(
        connection,
        id,
        memberId
      );

      if (outstanding < amount) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: `This member has only ${outstanding} outstanding ${outstanding === 1 ? "copy" : "copies"} of this book to return.`
        });
      }
    }

    const newStock = currentStock + transactionStockChange(type, amount);

    await connection.query(
      "UPDATE books SET quantity = ? WHERE id = ?",
      [newStock, id]
    );

    const [result] = await connection.query(
      `INSERT INTO transactions
       (book_id, user_id, member_id, type, quantity)
       VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, memberId, type, amount]
    );

    await connection.commit();
    transactionStarted = false;

    res.status(201).json({
      id: result.insertId,
      bookId: id,
      memberId,
      type,
      quantity: amount,
      newStock
    });

  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError);
      }
    }

    res.status(500).json({ message: error.message });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Edit an existing transaction and update the stock.
app.put("/api/transactions/:id", adminOnly, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const transactionId = Number(req.params.id);
    const newBookId = Number(req.body.bookId);
    const newType = req.body.type;
    const newQuantity = Number(req.body.quantity);

    const newMemberId = newType === "stock_in"
      ? null
      : Number(req.body.memberId);

    if (
      !Number.isInteger(transactionId) ||
      transactionId < 1 ||
      !Number.isInteger(newBookId) ||
      newBookId < 1 ||
      !["stock_in", "borrow", "return"].includes(newType) ||
      !Number.isInteger(newQuantity) ||
      newQuantity < 1
    ) {
      return res.status(400).json({
        message: "Enter a valid book, transaction type and quantity."
      });
    }

    if (newType !== "stock_in" && !Number.isInteger(newMemberId)) {
      return res.status(400).json({
        message: "Select the library member for this borrowing or return."
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [transactions] = await connection.query(
      "SELECT * FROM transactions WHERE id = ? FOR UPDATE",
      [transactionId]
    );

    if (!transactions.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Transaction not found."
      });
    }

    const old = transactions[0];

    if (newType !== "stock_in" && !(await getMember(connection, newMemberId))) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "The selected library member was not found."
      });
    }

    const bookIds = [
      ...new Set([Number(old.book_id), newBookId])
    ].sort((a, b) => a - b);

    const placeholders = bookIds.map(() => "?").join(",");

    const [lockedBooks] = await connection.query(
      `SELECT id, quantity
       FROM books
       WHERE id IN (${placeholders})
       ORDER BY id FOR UPDATE`,
      bookIds
    );

    if (lockedBooks.length !== bookIds.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "One of the selected books was not found."
      });
    }

    const stockByBook = new Map(
      lockedBooks.map(book => [
        Number(book.id),
        Number(book.quantity)
      ])
    );

    const oldBookId = Number(old.book_id);
    const oldChange = transactionStockChange(
      old.type,
      Number(old.quantity)
    );

    // Work out the stock available after removing the old transaction.
    const availableForNewTransaction =
      stockByBook.get(newBookId) -
      (oldBookId === newBookId ? oldChange : 0);

    if (newType === "borrow" && availableForNewTransaction < newQuantity) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "There are not enough copies available for this edited borrowing."
      });
    }

    // Check that the edited transaction does not create invalid returns.
    if (newType === "return") {
      const outstanding = await getOutstandingCopies(
        connection,
        newBookId,
        newMemberId,
        transactionId
      );

      if (outstanding < newQuantity) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: `This member has only ${outstanding} outstanding ${outstanding === 1 ? "copy" : "copies"} of this book to return.`
        });
      }
    }

    // Work out the final stock for all affected books.
    const finalStock = new Map(stockByBook);

    finalStock.set(
      oldBookId,
      finalStock.get(oldBookId) - oldChange
    );

    const newChange = transactionStockChange(
      newType,
      newQuantity
    );

    finalStock.set(
      newBookId,
      finalStock.get(newBookId) + newChange
    );

    for (const [bookId, quantity] of finalStock) {
      if (quantity < 0) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message: "This edit would make book stock negative. Check later borrowings or stock arrivals first."
        });
      }

      await connection.query(
        "UPDATE books SET quantity = ? WHERE id = ?",
        [quantity, bookId]
      );
    }

    await connection.query(
      `UPDATE transactions
       SET book_id = ?, member_id = ?, type = ?, quantity = ?
       WHERE id = ?`,
      [
        newBookId,
        newMemberId,
        newType,
        newQuantity,
        transactionId
      ]
    );

    await connection.commit();
    transactionStarted = false;

    res.json({
      message: "Transaction updated successfully.",
      id: transactionId,
      bookId: newBookId,
      memberId: newMemberId,
      type: newType,
      quantity: newQuantity,
      newStock: finalStock.get(newBookId)
    });

  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError);
      }
    }

    res.status(500).json({ message: error.message });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Delete a transaction and reverse its effect on stock.
app.delete("/api/transactions/:id", adminOnly, async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const transactionId = Number(req.params.id);

    if (!Number.isInteger(transactionId) || transactionId < 1) {
      return res.status(400).json({
        message: "Invalid transaction ID."
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [transactions] = await connection.query(
      "SELECT * FROM transactions WHERE id = ? FOR UPDATE",
      [transactionId]
    );

    if (!transactions.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Transaction not found."
      });
    }

    const transaction = transactions[0];

    const [books] = await connection.query(
      "SELECT id, quantity FROM books WHERE id = ? FOR UPDATE",
      [transaction.book_id]
    );

    if (!books.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "The transaction's book no longer exists."
      });
    }

    // Do not delete a borrowing if its returns depend on it.
    if (transaction.type === "borrow") {
      const outstandingAfterDelete = await getOutstandingCopies(
        connection,
        Number(transaction.book_id),
        transaction.member_id === null
          ? null
          : Number(transaction.member_id),
        transactionId
      );

      if (outstandingAfterDelete < 0) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          message: "This borrowing has linked returns. Edit or remove those return records first."
        });
      }
    }

    const currentStock = Number(books[0].quantity);

    const newStock = currentStock - transactionStockChange(
      transaction.type,
      Number(transaction.quantity)
    );

    if (newStock < 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        message: "This transaction cannot be deleted because later activity has used those copies. Adjust the later transactions first."
      });
    }

    await connection.query(
      "UPDATE books SET quantity = ? WHERE id = ?",
      [newStock, transaction.book_id]
    );

    await connection.query(
      "DELETE FROM transactions WHERE id = ?",
      [transactionId]
    );

    await connection.commit();
    transactionStarted = false;

    res.json({
      message: "Transaction deleted and stock adjusted.",
      newStock
    });

  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError);
      }
    }

    res.status(500).json({ message: error.message });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// General error handler.
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