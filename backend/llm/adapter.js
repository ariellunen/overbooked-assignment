const { default: axios } = require("axios");

class MockAdapter {
  async complete(messages) {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Mock LLM attempt ${attempt + 1}/${maxRetries + 1}`);

        // ✅ Build content from ENTIRE conversation history
        const content = messages
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");

        const response = await axios.post(
          process.env.LLM_URL,
          { content },
          {
            timeout: 12000, // 12 second timeout
            validateStatus: (status) => status < 600,
          }
        );

        // Check if we got a 500 error
        if (response.status === 500) {
          throw new Error("LLM returned 500 error");
        }

        console.log("✅ Mock LLM success");
        return { completion: response.data.completion };
      } catch (err) {
        lastError = err;
        console.error(
          `❌ Mock LLM attempt ${attempt + 1} failed:`,
          err.message
        );

        // If we have retries left, wait with exponential backoff
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s
          console.log(`⏳ Retrying in ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        console.error("❌ All Mock LLM retry attempts failed");
        throw lastError;
      }
    }

    throw lastError;
  }
}

class OllamaAdapter {
  async complete(messages) {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Ollama attempt ${attempt + 1}/${maxRetries + 1}`);

        const response = await axios.post(
          process.env.OLLAMA_URL + "/api/chat",
          {
            model: process.env.OLLAMA_MODEL || "llama3",
            messages: messages,
            stream: false,
          },
          { timeout: 12000 }
        );

        console.log("✅ Ollama success");
        return { completion: response.data.message.content };
      } catch (err) {
        lastError = err;
        console.error(`❌ Ollama attempt ${attempt + 1} failed:`, err.message);

        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        console.error("❌ All Ollama retry attempts failed");
        throw lastError;
      }
    }

    throw lastError;
  }
}

function createAdapter(provider) {
  console.log(`🧠 Using LLM provider: ${provider}`);
  if (provider === "ollama") return new OllamaAdapter();
  return new MockAdapter(); // default
}

module.exports = { createAdapter };
