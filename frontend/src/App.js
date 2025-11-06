import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent } from "./components/ui/card";

function App() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [undoData, setUndoData] = useState(null);
  const messagesEndRef = useRef(null);
  // Fetch all conversations on load
  useEffect(() => {
    axios
      .get("http://localhost:3001/api/conversations")
      .then((res) => {
        setConversations(res.data);
        console.log("Fetched conversations:", res.data);
      })
      .catch(() => setConversations([]));
  }, []);

  // Load messages for the selected conversation
  useEffect(() => {
    if (selected) {
      axios
        .get(`http://localhost:3001/api/conversations/${selected}/messages`)
        .then((res) => setMessages(res.data))
        .catch(() => setMessages([]));
    }
  }, [selected]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Send a new message to the backend
  const sendMessage = async () => {
    if (!input.trim() || !selected) return;
    setLoading(true);

    const maxRetries = 2;
    let attempt = 0;
    let success = false;

    while (attempt <= maxRetries && !success) {
      try {
        const res = await axios.post(
          `http://localhost:3001/api/conversations/${selected}/messages`,
          { content: input },
          { timeout: 12000 }
        );

        setMessages((prev) => [...prev, res.data.message, res.data.reply]);
        setInput("");
        success = true;
      } catch (e) {
        attempt++;
        console.error(`❌ Send message error (try ${attempt})`, e.message);

        // Retry if it's a server error or timeout
        if (
          attempt <= maxRetries &&
          (e.code === "ECONNABORTED" || e.response?.status >= 500)
        ) {
          const backoff = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
          console.log(`⏳ Retrying in ${backoff}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoff));
        } else {
          alert(
            "Message failed to send after retries. Please try again later."
          );
          break;
        }
      }
    }

    setLoading(false);
  };

  // Create a new conversation
  const createConversation = async () => {
    const res = await axios.post("http://localhost:3001/api/conversations");
    console.log("Created conversation:", res.data);

    setConversations((prev) => [...prev, res.data]);
    setMessages([]); // ← Clear FIRST
    setSelected(res.data.id); // ← Then set selected (triggers fetch)
  };

  const deleteConversation = async (id) => {
    try {
      await axios.delete(`http://localhost:3001/api/conversations/${id}`);
      const deletedConvo = conversations.find((c) => c.id === id);
      setConversations((prev) =>
        prev.filter((conversation) => conversation.id !== id)
      );
      if (selected === id) {
        setSelected(null);
        setMessages([]);
      }
      // Show undo option
      setUndoData({ id, title: deletedConvo.title });
      // Clear undo option after 5 seconds
      setTimeout(() => setUndoData(null), 5000);
    } catch (err) {
      console.error("Error deleting conversation:", err.message);
    }
  };

  const undoDelete = async () => {
    if (!undoData) return;
    try {
      await axios.post(
        `http://localhost:3001/api/conversations/${undoData.id}/undo`
      );

      // reload conversations after undo
      const res = await axios.get("http://localhost:3001/api/conversations");
      setConversations(res.data);
      setUndoData(null);
    } catch (err) {
      console.error("Error restoring conversation:", err.message);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <div className="w-64 border-r bg-white p-4 flex flex-col">
        <Button onClick={createConversation} className="mb-4 w-full">
          New Chat
        </Button>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`flex justify-between items-center p-2 rounded cursor-pointer text-sm ${
                selected === c.id
                  ? "bg-gray-200 font-medium"
                  : "hover:bg-gray-100"
              }`}
            >
              <div className="flex-1" onClick={() => setSelected(c.id)}>
                {c.title}
              </div>
              <button
                className="text-red-500 text-xs ml-2"
                onClick={() => deleteConversation(c.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        {/* Undo Toast */}
        {undoData && (
          <div className="mt-3 p-2 bg-yellow-100 text-sm rounded flex justify-between items-center">
            <span>Deleted {undoData.title}</span>
            <button
              className="text-blue-600 font-medium ml-2"
              onClick={undoDelete}
            >
              Undo
            </button>
          </div>
        )}
      </div>

      {/* Chat window */}
      <div className="flex flex-col flex-1">
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              Start chatting...
            </div>
          )}
          {messages.map((m, i) => (
            <Card
              key={i}
              className={`max-w-xl ${
                m.role === "user" ? "ml-auto bg-blue-50" : "mr-auto bg-gray-100"
              }`}
            >
              <CardContent className="p-3">
                <p className="text-xs text-gray-500 mb-1">{m.role}</p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </CardContent>
            </Card>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t bg-white p-4 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type your message..."
            className="flex-1"
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={loading}>
            {loading ? "..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default App;
