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
  const [pageInfo, setPageInfo] = useState({
    nextCursor: null,
    prevCursor: null,
  });
  const abortControllerRef = useRef(null);
  const PAGE_SIZE = 3; // Change this to test pagination easily

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
      setMessages([]);
      setPageInfo({ nextCursor: null, prevCursor: null });
      console.log("📤 Sending message:", input, "for convo:", selected);
      console.log("📄 Page info now:", pageInfo);

      axios
        .get(
          `http://localhost:3001/api/conversations/${selected}/messages?limit=${PAGE_SIZE}`
        )
        .then((res) => {
          console.log("📥 Initial load:", {
            messageCount: res.data.messages.length,
            messageIds: res.data.messages.map((m) => m.id),
            pageInfo: res.data.pageInfo,
          });
          setMessages(res.data.messages || []);
          setPageInfo({
            nextCursor: res.data.nextCursor || null,
            prevCursor: res.data.prevCursor || null,
          });
        })
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

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const res = await axios.post(
        `http://localhost:3001/api/conversations/${selected}/messages`,
        { content: input },
        {
          timeout: 12000,
          signal: abortControllerRef.current.signal,
        }
      );

      setMessages((prev) => [...prev, res.data.message, res.data.reply]);
      setInput("");
    } catch (e) {
      if (axios.isCancel(e)) {
        console.log("Request cancelled by user");
      } else {
        console.error("Send message error:", e.message);
        alert("Message failed to send. Please try again.");
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel in-flight request
  const cancelSend = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
    }
  };

  // Create a new conversation
  const createConversation = async () => {
    const res = await axios.post("http://localhost:3001/api/conversations");
    console.log("Created conversation:", res.data);

    setConversations((prev) => [...prev, res.data]);
    setMessages([]);
    setSelected(res.data.id);
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

  const loadOlderMessages = async () => {
    if (!pageInfo.nextCursor) return;

    try {
      const res = await axios.get(
        `http://localhost:3001/api/conversations/${selected}/messages?cursor=${pageInfo.nextCursor}&limit=${PAGE_SIZE}`
      );

      // אם אין הודעות נוספות, נעלים את הכפתור
      if (!res.data.messages.length) {
        setPageInfo({ nextCursor: null, prevCursor: null });
        return;
      }

      // נוסיף את ההודעות החדשות לראש הרשימה
      setMessages((prev) => [...res.data.messages, ...prev]);

      setPageInfo({
        ...pageInfo,
        nextCursor: res.data.nextCursor,
      });
    } catch (err) {
      console.error("Error loading older messages:", err.message);
    }
  };

  const loadNewerMessages = async () => {
    if (!pageInfo.prevCursor) return;

    try {
      const res = await axios.get(
        `http://localhost:3001/api/conversations/${selected}/messages?cursor=${pageInfo.prevCursor}&direction=newer&limit=${PAGE_SIZE}`
      );

      // Append newer messages
      setMessages((prev) => [...prev, ...res.data.messages]);
      setPageInfo(res.data.pageInfo);
    } catch (err) {
      console.error("Error loading newer messages:", err.message);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <div className="w-full md:w-64 border-r md:border-b-0 border-b bg-white p-4 flex flex-col max-h-48 md:max-h-full overflow-y-auto md:overflow-visible">
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
              <div
                className="flex-1 truncate"
                onClick={() => setSelected(c.id)}
              >
                {c.title}
              </div>
              <button
                className="text-red-500 text-xs ml-2 flex-shrink-0"
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
            <span className="truncate">Deleted {undoData.title}</span>
            <button
              className="text-blue-600 font-medium ml-2 flex-shrink-0"
              onClick={undoDelete}
            >
              Undo
            </button>
          </div>
        )}
      </div>

      {/* Chat window */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
          {!selected && (
            <div className="text-center text-gray-400 mt-20">
              Select a conversation or create a new one
            </div>
          )}

          {selected && messages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              Start chatting...
            </div>
          )}

          {pageInfo.nextCursor && (
            <div className="text-center mb-2">
              <Button variant="outline" size="sm" onClick={loadOlderMessages}>
                Load older messages
              </Button>
            </div>
          )}

          {messages.map((m) => (
            <Card
              key={m.id}
              className={`max-w-xl ${
                m.role === "user" ? "ml-auto bg-blue-50" : "mr-auto bg-gray-100"
              }`}
            >
              <CardContent className="p-3">
                <p className="text-xs text-gray-500 mb-1">{m.role}</p>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </CardContent>
            </Card>
          ))}

          {pageInfo.prevCursor && (
            <div className="text-center mt-2">
              <Button variant="outline" size="sm" onClick={loadNewerMessages}>
                Load newer messages
              </Button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        {selected && (
          <div className="border-t bg-white p-3 md:p-4 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
              placeholder="Type your message..."
              className="flex-1"
              disabled={loading}
            />
            {loading ? (
              <Button onClick={cancelSend} variant="destructive">
                Cancel
              </Button>
            ) : (
              <Button onClick={sendMessage} disabled={!input.trim()}>
                Send
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
