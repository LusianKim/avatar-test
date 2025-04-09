require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from root directory
app.use(express.static(__dirname));

// Serve static files from js directory
app.use("/js", express.static(path.join(__dirname, "js")));

// Default route to serve avatar.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "avatar.html"));
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
