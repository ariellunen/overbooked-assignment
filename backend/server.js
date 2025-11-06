require("dotenv").config();

const { default: axios } = require("axios");

const { createAdapter } = require("./llm/adapter");
const adapter = createAdapter(process.env.LLM_PROVIDER);

const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3001;
const LLM_URL = process.env.LLM_URL;

const db = require("./db");

app.use(cors());

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`Hello World! Server is running on port ${PORT}`);
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

    const messages = db
      .prepare(
        `SELECT id, conversationId, role, content, createdAt
         FROM messages
         WHERE conversationId = ?
         ORDER BY createdAt ASC`
      )
      .all(id);

    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages:", err.message);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: "Missing content" });

    // Check if conversation exists
    const convo = db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(id);

    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const timestamp = new Date().toISOString();

    // ✅ SAVE USER MESSAGE FIRST (before calling LLM)
    const userMsgResult = db
      .prepare(
        "INSERT INTO messages (conversationId, role, content, createdAt) VALUES (?, ?, ?, ?)"
      )
      .run(id, "user", content, timestamp);

    // Fetch conversation history (including the message we just saved)
    const history = db
      .prepare(
        "SELECT role, content FROM messages WHERE conversationId = ? ORDER BY createdAt ASC"
      )
      .all(id);

    try {
      // Send entire conversation to selected LLM adapter (with retry logic inside adapter)
      const { completion: reply } = await adapter.complete(history);

      // Save assistant message
      const assistantMsgResult = db
        .prepare(
          "INSERT INTO messages (conversationId, role, content, createdAt) VALUES (?, ?, ?, ?)"
        )
        .run(id, "assistant", reply, timestamp);

      // Return to frontend with proper format
      return res.json({
        message: {
          id: userMsgResult.lastInsertRowid,
          role: "user",
          content,
          createdAt: timestamp,
        },
        reply: {
          id: assistantMsgResult.lastInsertRowid,
          role: "assistant",
          content: reply,
          createdAt: timestamp,
        },
      });
    } catch (llmError) {
      // ✅ User message is already saved, just return error about LLM failure
      console.error("LLM failed after retries:", llmError.message);

      return res.status(503).json({
        error: "LLM service unavailable after retries",
        message: {
          id: userMsgResult.lastInsertRowid,
          role: "user",
          content,
          createdAt: timestamp,
        },
      });
    }
  } catch (err) {
    console.error("Error in message endpoint:", err.message);
    return res.status(500).json({ error: "Internal server error" });
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

app.get("/api/healthz", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/readyz", async (req, res) => {
  try {
    // check for the database
    db.prepare("SELECT 1").get();

    // check for the LLM service
    const response = await axios.post(
      process.env.LLM_URL,
      { content: "ping" },
      { timeout: 2000 }
    );

    if (response.status === 200) {
      res.json({ ready: true });
    } else {
      res.status(503).json({ ready: false, error: "LLM returned bad status" });
    }
  } catch (err) {
    console.error("Ready check failed:", err.message);
    res.status(503).json({ ready: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
