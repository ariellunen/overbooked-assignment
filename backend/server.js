const { default: axios } = require("axios");

const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3001;
const LLM_URL = process.env.LLM_URL;

const db = require("./db");

app.use(cors());

require("dotenv").config();

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`Hello World! Server is running on port ${PORT}`);
});

app.post("/api/message", async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Missing content" });

    // send to mock-LLM
    const response = await axios.post(LLM_URL, { content });
    const reply = response.data.completion;

    // save the message and reply in the database
    let convo = db.prepare("SELECT id FROM conversations WHERE id = 1").get();
    if (!convo) {
      db.prepare(
        "INSERT INTO conversations (title, createdAt) VALUES (?, ?)"
      ).run("Conversation #1", new Date().toISOString());
      convo = { id: 1 };
    }

    db.prepare(
      "INSERT INTO messages (conversationId, role, content, createdAt) VALUES (?, ?, ?, ?)"
    ).run(convo.id, "user", content, new Date().toISOString());

    db.prepare(
      "INSERT INTO messages (conversationId, role, content, createdAt) VALUES (?, ?, ?, ?)"
    ).run(convo.id, "assistant", reply, new Date().toISOString());

    // return to client
    return res.json({
      message: { role: "user", content },
      reply: { role: "assistant", content: reply },
    });
  } catch (err) {
    console.error("Error talking to mock-LLM:", err.message);
    return res.status(500).json({ error: "Upstream error/timeout" });
  }
});

app.get("/api/conversations", (req, res) => {
  const conversations = db
    .prepare("SELECT * FROM conversations WHERE deletedAt IS NULL")
    .all();
  res.json(conversations);
});

app.get("/api/conversations/:id/messages", (req, res) => {
  try {
    const { id } = req.params;
    // pagination, limit and before timestamp
    const limit = parseInt(req.query.limit) || 20;
    const before = req.query.before || new Date().toISOString();

    // Fetch all messages belonging to this conversation
    const messages = db
      .prepare(
        `SELECT * FROM messages 
        WHERE conversationId = ? AND createdAt < ? 
        ORDER BY createdAt DESC 
        LIMIT ?`
      )
      .all(id, before, limit);

    res.json(messages.reverse());
  } catch (err) {
    console.error("Error fetching messages:", err.message);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.post("/api/conversations", (req, res) => {
  try {
    const count = db
      .prepare("SELECT COUNT(*) as count FROM conversations")
      .get().count;
    const title = `Conversation #${count + 1}`;
    const createdAt = new Date().toISOString();
    const result = db
      .prepare("INSERT INTO conversations (title, createdAt) VALUES (?, ?)")
      .run(title, createdAt);

    res.status(201).json({
      id: result.lastInsertRowid,
      title,
      createdAt,
    });
  } catch (err) {
    console.error("Error creating conversation:", err.message);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

app.delete("/api/conversations/:id", (req, res) => {
  try {
    const { id } = req.params;

    const deleteAt = new Date().toISOString();

    // soft delete => set deletedAt timestamp
    const result = db
      .prepare("UPDATE conversations SET deletedAt = ? WHERE id = ?")
      .run(deleteAt, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // delete messages after 5 seconds
    setTimeout(() => {
      db.prepare("DELETE FROM messages WHERE conversationId = ?").run(id);
      db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
    }, 5000);

    res.status(204).send();
  } catch (err) {
    console.error("Error deleting conversation:", err.message);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

app.post("/api/conversations/:id/undo", (req, res) => {
  try {
    const { id } = req.params;
    // check if conversation is deleted
    const convo = db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(id);
    if (!convo || !convo.deletedAt) {
      return res
        .status(400)
        .json({ error: "Conversation is not deleted or does not exist" });
    }

    // restore conversation
    db.prepare("UPDATE conversations SET deletedAt = NULL WHERE id = ?").run(
      id
    );
    res.json({ message: "Conversation restored" });
  } catch (err) {
    console.error("Error restoring conversation:", err.message);
    res.status(500).json({ error: "Failed to restore conversation" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
