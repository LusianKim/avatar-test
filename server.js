require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
