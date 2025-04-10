require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from root directory
app.use(express.static(path.join(__dirname, "..")));

// Serve static files from js directory
app.use("/js", express.static(__dirname));

// Route to serve avatar.html at /avatar path
app.get("/avatar", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "avatar.html"));
});

// Route to serve index.html
app.get("/index", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

// Add a root route that redirects to index
app.get("/", (req, res) => {
  res.redirect("/index");
});

// API endpoint to get configuration
app.get("/api/config", (req, res) => {
  res.json({
    speechApiKey: process.env.SPEECH_API_KEY,
    speechRegion: process.env.SPEECH_REGION,
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAIDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    cognitiveSearchEndpoint: process.env.COGNITIVE_SEARCH_ENDPOINT,
    cognitiveSearchKey: process.env.COGNITIVE_SEARCH_KEY,
    cognitiveSearchIndex: process.env.COGNITIVE_SEARCH_INDEX,
  });
});

// API endpoint for query processing
app.post("/api/query", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res
        .status(400)
        .json({ status: "error", message: "Query is required" });
    }

    // Mock response for testing
    const mockResponse = {
      status: "success",
      text_response: "This is a sample response to your query: " + query,
      verification_logs: [
        { agent: "System", response: "Query received: " + query },
        { agent: "AI", response: "Processing query..." },
      ],
      talk_initial: {
        initial_response: "Initial conversation response.",
        thread_id: "thread_" + Date.now(),
        agent_id: "agent_123",
        completed: false,
      },
    };

    res.json(mockResponse);
  } catch (error) {
    console.error("Error processing query:", error);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// API endpoint for continuing talk
app.post("/api/continue_talk", async (req, res) => {
  try {
    const { thread_id, agent_id, part_number } = req.body;

    if (!thread_id || !agent_id || !part_number) {
      return res.status(400).json({
        status: "error",
        message: "thread_id, agent_id, and part_number are required",
      });
    }

    // Mock response for testing
    const mockResponse = {
      status: "success",
      response: {
        response: `This is part ${part_number} of the conversation. Thread: ${thread_id}, Agent: ${agent_id}`,
        completed: part_number >= 5, // Complete after 5 parts
      },
    };

    res.json(mockResponse);
  } catch (error) {
    console.error("Error continuing talk:", error);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

const PORT = process.env.PORT || 3000;

function startServer(port) {
  const server = app
    .listen(port)
    .on("listening", () => {
      console.log(`Main Server is running on http://localhost:${port}`);
      console.log(`- Avatar interface: http://localhost:${port}/avatar`);
      console.log(`- MSLearn AI interface: http://localhost:${port}/index`);
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`Port ${port} is busy, trying port ${port + 1}`);
        startServer(port + 1);
      } else {
        console.error("Server error:", err);
      }
    });
}

startServer(PORT);
