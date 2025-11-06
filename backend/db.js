const Database = require("better-sqlite3");

// אם אין קובץ כזה, הוא ייווצר אוטומטית בתיקייה הנוכחית
const db = new Database("db.sqlite");

// יצירת טבלת שיחות
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    createdAt TEXT,
    deletedAt TEXT
  )
`
).run();

// יצירת טבלת הודעות
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversationId INTEGER,
    role TEXT,
    content TEXT,
    createdAt TEXT,
    FOREIGN KEY (conversationId) REFERENCES conversations(id)
  )
`
).run();

console.log("Database initialized");

module.exports = db;
