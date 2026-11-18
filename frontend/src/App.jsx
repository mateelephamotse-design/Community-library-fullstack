import { createContext, useContext, useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate
} from "react-router-dom";
import { api } from "./api";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

// Login page.
function Login() {
  const [membershipId, setMembershipId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(membershipId, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">CL</div>
        <p className="eyebrow">COMMUNITY LIBRARY</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to manage your library.</p>

        {error && <div className="alert error">{error}</div>}

        <label>
          Membership ID
          <input
            value={membershipId}
            onChange={e => setMembershipId(e.target.value)}
            required
            placeholder="e.g. ADMIN001"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="Enter your password"
          />
        </label>

        <button className="primary full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="hint">First demo login: ADMIN001 / Admin123!</p>
      </form>
    </main>
  );
}

// Main application layout.
function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark small">CL</div>
          <div>
            <strong>Community</strong>
            <span>LIBRARY</span>
          </div>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <nav>
          <NavLink to="/" end>
            ▦ <span>Dashboard</span>
          </NavLink>

          <NavLink to="/books">
            ▤ <span>Book management</span>
          </NavLink>

          <NavLink to="/transactions">
            ↔ <span>Transactions</span>
          </NavLink>

          {user.role === "admin" && (
            <NavLink to="/users">
              ♙ <span>User management</span>
            </NavLink>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>

          <div className="profile">
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>

          <button
            className="icon-button"
            title="Log out"
            onClick={logout}
          >
            ↪
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="muted">Library workspace</span>
            <strong>Management portal</strong>
          </div>

          <div className="top-user">
            {user.name}
            <span className="role-pill">{user.role}</span>
          </div>
        </header>

        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

// Protect pages that require login.
function Protected() {
  const { user } = useAuth();

  return user ? <Layout /> : <Navigate to="/login" replace />;
}

// Protect user management for administrators.
function AdminRoute() {
  const { user } = useAuth();

  return user?.role === "admin"
    ? <UsersPage />
    : <Navigate to="/" replace />;
}

// Dashboard.
function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setData(await api("/dashboard"));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeading
        title="Dashboard"
        subtitle="Here's what's happening in your library today."
      />

      {error && <div className="alert error">{error}</div>}

      {data && (
        <>
          <div className="stats-grid">
            <Stat
              label="Book titles"
              value={data.titleCount}
              icon="▤"
            />

            <Stat
              label="Total copies"
              value={data.copyCount}
              icon="▦"
            />

            <Stat
              label="Registered users"
              value={data.userCount}
              icon="♙"
            />

            <Stat
              label="Low-stock titles"
              value={data.lowStock.length}
              icon="!"
              warning
            />
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>Low stock alerts</h2>
                <p>Books with fewer than 2 copies available</p>
              </div>

              <span className="count-pill">
                {data.lowStock.length} books
              </span>
            </div>

            {data.lowStock.length ? (
              <BookTable books={data.lowStock} compact />
            ) : (
              <Empty text="All books have healthy stock levels." />
            )}
          </div>
        </>
      )}
    </>
  );
}

// Dashboard statistic card.
function Stat({ label, value, icon, warning }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${warning ? "warn" : ""}`}>
        {icon}
      </div>

      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

// Page heading.
function PageHeading({ title, subtitle, children }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">LIBRARY MANAGEMENT</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>

      {children}
    </div>
  );
}

// Empty table message.
function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

// Reusable books table.
function BookTable({
  books,
  compact = false,
  onEdit,
  onDelete
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>BOOK</th>
            <th>AUTHOR</th>

            {!compact && (
              <>
                <th>GENRE</th>
                <th>ISBN</th>
              </>
            )}

            <th>IN STOCK</th>

            {!compact && <th>ACTIONS</th>}
          </tr>
        </thead>

        <tbody>
          {books.map(book => (
            <tr key={book.id}>
              <td><strong>{book.title}</strong></td>
              <td>{book.author}</td>

              {!compact && (
                <>
                  <td>{book.genre}</td>
                  <td className="isbn">{book.isbn}</td>
                </>
              )}

              <td>
                <span className={`stock ${book.quantity < 2 ? "low" : ""}`}>
                  {book.quantity} copies
                </span>
              </td>

              {!compact && (
                <td>
                  <div className="actions">
                    <button
                      className="text-button"
                      onClick={() => onEdit(book)}
                    >
                      Edit
                    </button>

                    <button
                      className="text-button danger-text"
                      onClick={() => onDelete(book.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Book management page.
function BooksPage() {
  const [books, setBooks] = useState([]);

  const [form, setForm] = useState({
    title: "",
    author: "",
    genre: "",
    isbn: "",
    quantity: 0
  });

  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { user } = useAuth();

  async function load() {
    try {
      setBooks(await api("/books"));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function change(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  }

  function reset() {
    setForm({
      title: "",
      author: "",
      genre: "",
      isbn: "",
      quantity: 0
    });

    setEditing(null);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const body = {
        ...form,
        quantity: Number(form.quantity)
      };

      if (editing) {
        await api(`/books/${editing}`, {
          method: "PUT",
          body: JSON.stringify(body)
        });
      } else {
        await api("/books", {
          method: "POST",
          body: JSON.stringify(body)
        });
      }

      setSuccess(
        editing
          ? "Book updated successfully."
          : "Book added successfully."
      );

      reset();
      load();

    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm("Are you sure you want to delete this book?")) {
      return;
    }

    try {
      await api(`/books/${id}`, {
        method: "DELETE"
      });

      setSuccess("Book deleted.");
      load();

    } catch (e) {
      setError(e.message);
    }
  }

  function edit(book) {
    setEditing(book.id);

    setForm({
      title: book.title,
      author: book.author,
      genre: book.genre,
      isbn: book.isbn,
      quantity: book.quantity
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  return (
    <>
      <PageHeading
        title="Book management"
        subtitle="Add, update and keep track of your library collection."
      />

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      {user.role === "admin" && (
        <div className="panel form-panel">
          <div className="panel-heading">
            <div>
              <h2>{editing ? "Update book" : "Add a new book"}</h2>
              <p>Enter the book details below.</p>
            </div>
          </div>

          <form onSubmit={submit} className="form-grid">
            <label>
              Book title
              <input
                name="title"
                value={form.title}
                onChange={change}
                required
              />
            </label>

            <label>
              Author
              <input
                name="author"
                value={form.author}
                onChange={change}
                required
              />
            </label>

            <label>
              Genre
              <input
                name="genre"
                value={form.genre}
                onChange={change}
                required
                placeholder="e.g. Fiction"
              />
            </label>

            <label>
              ISBN
              <input
                name="isbn"
                value={form.isbn}
                onChange={change}
                required
              />
            </label>

            <label>
              Initial quantity
              <input
                type="number"
                min="0"
                name="quantity"
                value={form.quantity}
                onChange={change}
                required
              />
            </label>

            <div className="form-actions">
              <button className="primary">
                {editing ? "Save changes" : "Add book"}
              </button>

              {editing && (
                <button
                  type="button"
                  className="secondary"
                  onClick={reset}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Library collection</h2>
            <p>{books.length} book titles</p>
          </div>
        </div>

        {books.length ? (
          <BookTable
            books={books}
            onEdit={edit}
            onDelete={remove}
          />
        ) : (
          <Empty text="No books have been added yet." />
        )}
      </div>
    </>
  );
}

// Transactions page.
function TransactionsPage() {
  const { user } = useAuth();

  const [books, setBooks] = useState([]);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState([]);

  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    bookId: "",
    type: "borrow",
    memberId: "",
    quantity: 1
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load books, members and transaction history.
  async function load() {
    try {
      const [bookRows, memberRows, transactionRows] =
        await Promise.all([
          api("/books"),
          api("/members"),
          api("/transactions")
        ]);

      setBooks(bookRows);
      setMembers(memberRows);
      setHistory(transactionRows);

      setForm(current => ({
        ...current,
        bookId: current.bookId ||
          (bookRows.length ? String(bookRows[0].id) : "")
      }));

    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Reset the transaction form.
  function resetForm() {
    setEditingId(null);

    setForm({
      bookId: books.length ? String(books[0].id) : "",
      type: "borrow",
      memberId: "",
      quantity: 1
    });
  }

  // Put a transaction into the form for editing.
  function editTransaction(transaction) {
    setEditingId(transaction.id);

    setForm({
      bookId: String(transaction.bookId),
      type: transaction.type,
      memberId: transaction.memberId
        ? String(transaction.memberId)
        : "",
      quantity: transaction.quantity
    });

    setError("");
    setSuccess("");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  // Save a new or edited transaction.
  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const body = {
        bookId: Number(form.bookId),
        type: form.type,
        quantity: Number(form.quantity),
        memberId: form.type === "stock_in"
          ? null
          : Number(form.memberId)
      };

      const result = await api(
        editingId
          ? `/transactions/${editingId}`
          : "/transactions",
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify(body)
        }
      );

      setSuccess(
        `${editingId ? "Transaction updated" : "Transaction saved"}. New stock: ${result.newStock} copies.`
      );

      resetForm();
      await load();

    } catch (e) {
      setError(e.message);
    }
  }

  // Delete a transaction.
  async function deleteTransaction(id) {
    if (!confirm(
      "Delete this transaction? The book stock will also be adjusted."
    )) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const result = await api(
        `/transactions/${id}`,
        { method: "DELETE" }
      );

      setSuccess(
        `Transaction deleted. Updated stock: ${result.newStock} copies.`
      );

      if (editingId === id) {
        resetForm();
      }

      await load();

    } catch (e) {
      setError(e.message);
    }
  }

  const requiresMember =
    form.type === "borrow" || form.type === "return";

  return (
    <>
      <PageHeading
        title="Transactions"
        subtitle="Record stock arrivals, borrowings and returns for individual library members."
      />

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "Edit transaction" : "New transaction"}</h2>
            <p>Stock is updated automatically when you save.</p>
          </div>
        </div>

        {books.length ? (
          <form className="form-grid" onSubmit={submit}>
            <label className="wide">
              Select book

              <select
                value={form.bookId}
                onChange={e => setForm({
                  ...form,
                  bookId: e.target.value
                })}
                required
              >
                {books.map(book => (
                  <option key={book.id} value={book.id}>
                    {book.title} ({book.quantity} available)
                  </option>
                ))}
              </select>
            </label>

            <label>
              Transaction type

              <select
                value={form.type}
                onChange={e => setForm({
                  ...form,
                  type: e.target.value,
                  memberId: e.target.value === "stock_in"
                    ? ""
                    : form.memberId
                })}
              >
                <option value="borrow">
                  Borrow book (deduct stock)
                </option>

                <option value="stock_in">
                  New stock arrival (add stock)
                </option>

                <option value="return">
                  Return book (add stock)
                </option>
              </select>
            </label>

            {requiresMember && (
              <label>
                Library member

                <select
                  value={form.memberId}
                  onChange={e => setForm({
                    ...form,
                    memberId: e.target.value
                  })}
                  required
                >
                  <option value="">Select the member</option>

                  {members.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.membershipId})
                    </option>
                  ))}
                </select>

                {!members.length && (
                  <span className="muted">
                    Add a user with the Member role in User Management first.
                  </span>
                )}
              </label>
            )}

            <label>
              Quantity

              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={e => setForm({
                  ...form,
                  quantity: e.target.value
                })}
                required
              />
            </label>

            <div className="form-actions">
              <button
                className="primary"
                disabled={requiresMember && !members.length}
              >
                {editingId
                  ? "Save transaction changes"
                  : "Save transaction"}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="secondary"
                  onClick={resetForm}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          <Empty text="Add a book before recording a transaction." />
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Transaction history</h2>
            <p>Latest 200 recorded transactions</p>
          </div>
        </div>

        {history.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>BOOK</th>
                  <th>TYPE</th>
                  <th>MEMBER</th>
                  <th>QUANTITY</th>
                  <th>RECORDED BY</th>
                  <th>DATE</th>

                  {user.role === "admin" && <th>ACTIONS</th>}
                </tr>
              </thead>

              <tbody>
                {history.map(transaction => (
                  <tr key={transaction.id}>
                    <td>
                      <strong>{transaction.bookTitle}</strong>
                    </td>

                    <td>
                      <span
                        className={`type-pill ${
                          transaction.type === "return"
                            ? "stock_in"
                            : transaction.type
                        }`}
                      >
                        {transaction.type === "borrow"
                          ? "Borrowed"
                          : transaction.type === "return"
                            ? "Returned"
                            : "Stock added"}
                      </span>
                    </td>

                    <td>
                      {transaction.type === "stock_in"
                        ? "—"
                        : transaction.memberName
                          ? `${transaction.memberName} (${transaction.memberMembershipId})`
                          : "Not linked – edit to assign member"}
                    </td>

                    <td>{transaction.quantity}</td>
                    <td>{transaction.userName}</td>
                    <td>
                      {new Date(transaction.createdAt).toLocaleString()}
                    </td>

                    {user.role === "admin" && (
                      <td>
                        <div className="actions">
                          <button
                            className="text-button"
                            onClick={() => editTransaction(transaction)}
                          >
                            Edit
                          </button>

                          <button
                            className="text-button danger-text"
                            onClick={() => deleteTransaction(transaction.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No transactions recorded yet." />
        )}
      </div>
    </>
  );
}

// User management page.
function UsersPage() {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    name: "",
    membershipId: "",
    role: "member",
    password: ""
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setUsers(await api("/users"));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function reset() {
    setEditing(null);

    setForm({
      name: "",
      membershipId: "",
      role: "member",
      password: ""
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const body = { ...form };

      if (editing && !body.password) {
        delete body.password;
      }

      await api(
        editing ? `/users/${editing}` : "/users",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(body)
        }
      );

      setSuccess(editing ? "User updated." : "User added.");

      reset();
      load();

    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this user?")) {
      return;
    }

    try {
      await api(`/users/${id}`, {
        method: "DELETE"
      });

      setSuccess("User deleted.");
      load();

    } catch (e) {
      setError(e.message);
    }
  }

  function edit(u) {
    setEditing(u.id);

    setForm({
      name: u.name,
      membershipId: u.membershipId,
      role: u.role,
      password: ""
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  return (
    <>
      <PageHeading
        title="User management"
        subtitle="Manage library members and administrator accounts."
      />

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>{editing ? "Update user" : "Add a user"}</h2>
            <p>Create an account with a membership ID and role.</p>
          </div>
        </div>

        <form className="form-grid" onSubmit={submit}>
          <label>
            Full name

            <input
              value={form.name}
              onChange={e => setForm({
                ...form,
                name: e.target.value
              })}
              required
            />
          </label>

          <label>
            Membership ID

            <input
              value={form.membershipId}
              onChange={e => setForm({
                ...form,
                membershipId: e.target.value
              })}
              required
            />
          </label>

          <label>
            Role

            <select
              value={form.role}
              onChange={e => setForm({
                ...form,
                role: e.target.value
              })}
            >
              <option value="member">Member</option>
              <option value="admin">Administrator</option>
            </select>
          </label>

          <label>
            Password

            {editing && (
              <span className="muted">
                {" "} (leave blank to keep current)
              </span>
            )}

            <input
              type="password"
              value={form.password}
              onChange={e => setForm({
                ...form,
                password: e.target.value
              })}
              required={!editing}
              minLength="6"
              placeholder={
                editing
                  ? "Optional new password"
                  : "At least 6 characters"
              }
            />
          </label>

          <div className="form-actions">
            <button className="primary">
              {editing ? "Save changes" : "Add user"}
            </button>

            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={reset}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Registered users</h2>
            <p>{users.length} accounts</p>
          </div>
        </div>

        {users.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>MEMBERSHIP ID</th>
                  <th>ROLE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td>{u.membershipId}</td>

                    <td>
                      <span className="role-pill">{u.role}</span>
                    </td>

                    <td>
                      <div className="actions">
                        <button
                          className="text-button"
                          onClick={() => edit(u)}
                        >
                          Edit
                        </button>

                        <button
                          className="text-button danger-text"
                          onClick={() => remove(u.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No users found." />
        )}
      </div>
    </>
  );
}

// Main application.
export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("libraryUser"));
    } catch {
      return null;
    }
  });

  async function login(membershipId, password) {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        membershipId,
        password
      })
    });

    localStorage.setItem("libraryToken", result.token);
    localStorage.setItem("libraryUser", JSON.stringify(result.user));

    setUser(result.user);
  }

  function logout() {
    localStorage.removeItem("libraryToken");
    localStorage.removeItem("libraryUser");

    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<Protected />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/users" element={<AdminRoute />} />
        </Route>

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </AuthContext.Provider>
  );
}