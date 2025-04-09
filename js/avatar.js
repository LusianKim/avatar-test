// Global objects
var speechRecognizer;
var avatarSynthesizer;
var peerConnection;
var messages = [];
var messageInitiated = false;
var dataSources = [];
var sentenceLevelPunctuations = [
  ".",
  "?",
  "!",
  ":",
  ";",
  "。",
  "？",
  "！",
  "：",
  "；",
];
var enableDisplayTextAlignmentWithSpeech = true;
var enableQuickReply = false;
var quickReplies = [
  "Let me take a look.",
  "Let me check.",
  "One moment, please.",
];
var byodDocRegex = new RegExp(/\[doc(\d+)\]/g);
var isSpeaking = false;
var speakingText = "";
var spokenTextQueue = [];
var sessionActive = false;
var lastSpeakTime;
var imgUrl = "";

// Predefined settings
var DEFAULT_SETTINGS = {
  region: "",
  APIKey: "",
  talkingAvatarCharacter: "lisa",
  talkingAvatarStyle: "casual-sitting",
  ttsVoice: "en-US-JennyNeural",
  sttLocales: ["en-US"],
  azureOpenAIEndpoint: "",
  azureOpenAIApiKey: "",
  azureOpenAIDeploymentName: "",
  cognitiveSearchEndpoint: "",
  cognitiveSearchKey: "",
  cognitiveSearchIndexName: "",
  prompt: "You are a helpful AI assistant.",
};

// Load configuration from server
async function loadConfig() {
  try {
    console.log("Starting to load configuration...");
    const response = await fetch("http://localhost:3000/api/config");
    const config = await response.json();

    console.log("Received configuration:", {
      hasApiKey: !!config.speechApiKey,
      hasOpenAIKey: !!config.azureOpenAIApiKey,
      endpoint: config.azureOpenAIEndpoint,
      deploymentName: config.azureOpenAIDeploymentName,
    });

    DEFAULT_SETTINGS.region = config.speechRegion;
    DEFAULT_SETTINGS.APIKey = config.speechApiKey;
    DEFAULT_SETTINGS.azureOpenAIEndpoint = config.azureOpenAIEndpoint;
    DEFAULT_SETTINGS.azureOpenAIApiKey = config.azureOpenAIApiKey;
    DEFAULT_SETTINGS.azureOpenAIDeploymentName =
      config.azureOpenAIDeploymentName;
    DEFAULT_SETTINGS.cognitiveSearchEndpoint = config.cognitiveSearchEndpoint;
    DEFAULT_SETTINGS.cognitiveSearchKey = config.cognitiveSearchKey;
    DEFAULT_SETTINGS.cognitiveSearchIndexName = config.cognitiveSearchIndex;

    console.log("Configuration loaded into DEFAULT_SETTINGS:", {
      hasApiKey: !!DEFAULT_SETTINGS.APIKey,
      hasOpenAIKey: !!DEFAULT_SETTINGS.azureOpenAIApiKey,
      endpoint: DEFAULT_SETTINGS.azureOpenAIEndpoint,
      deploymentName: DEFAULT_SETTINGS.azureOpenAIDeploymentName,
    });

    // Start the application after loading config
    initializeApp();
  } catch (error) {
    console.error("Error loading configuration:", error);
  }
}

// Initialize the application
function initializeApp() {
  try {
    // Initialize Speech SDK
    if (typeof SpeechSDK === "undefined") {
      console.error("Speech SDK not loaded");
      return;
    }

    // Set initial UI state
    document.getElementById("microphone").disabled = true;
    document.getElementById("stopSession").disabled = true;
    document.getElementById("chatHistory").hidden = false;
    document.getElementById("userMessageBox").hidden = false;
    document.getElementById("uploadImgIcon").hidden = false;

    // Start avatar session
    connectAvatar();

    // Set up periodic checks with a delay to ensure elements are loaded
    setTimeout(() => {
      setInterval(() => {
        if (sessionActive) {
          checkHung();
          checkLastSpeak();
        }
      }, 2000);
    }, 5000); // Wait 5 seconds before starting checks
  } catch (error) {
    console.error("Error in initialization:", error);
  }
}

// Update window.onload to use the new initialization
window.onload = loadConfig;

// =================== CONNECT AVATAR SERVICE ===================
function connectAvatar() {
  try {
    const cogSvcRegion = DEFAULT_SETTINGS.region;
    const cogSvcSubKey = DEFAULT_SETTINGS.APIKey;

    if (!cogSvcSubKey) {
      console.error("API key is not set");
      return;
    }

    let speechSynthesisConfig = SpeechSDK.SpeechConfig.fromSubscription(
      cogSvcSubKey,
      cogSvcRegion
    );

    // Avatar config
    const talkingAvatarCharacter = DEFAULT_SETTINGS.talkingAvatarCharacter;
    const talkingAvatarStyle = DEFAULT_SETTINGS.talkingAvatarStyle;
    const avatarConfig = new SpeechSDK.AvatarConfig(
      talkingAvatarCharacter,
      talkingAvatarStyle
    );

    avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(
      speechSynthesisConfig,
      avatarConfig
    );
    avatarSynthesizer.avatarEventReceived = (s, e) => {
      let offsetMsg =
        e.offset === 0
          ? ""
          : `, offset from session start: ${e.offset / 10000}ms.`;
      console.log("Avatar event: " + e.description + offsetMsg);
    };

    // Prepare STT config
    const speechRecognitionConfig = SpeechSDK.SpeechConfig.fromEndpoint(
      new URL(
        `wss://${cogSvcRegion}.stt.speech.microsoft.com/speech/universal/v2`
      ),
      cogSvcSubKey
    );
    speechRecognitionConfig.setProperty(
      SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode,
      "Continuous"
    );
    const sttLocales = DEFAULT_SETTINGS.sttLocales;
    const autoDetectSourceLanguageConfig =
      SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(sttLocales);
    speechRecognizer = SpeechSDK.SpeechRecognizer.FromConfig(
      speechRecognitionConfig,
      autoDetectSourceLanguageConfig,
      SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()
    );

    if (!messageInitiated) {
      initMessages();
      messageInitiated = true;
    }

    // Get token from TTS service
    const xhr = new XMLHttpRequest();
    xhr.open(
      "GET",
      `https://${cogSvcRegion}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1`
    );
    xhr.setRequestHeader("Ocp-Apim-Subscription-Key", cogSvcSubKey);
    xhr.addEventListener("readystatechange", function () {
      if (this.readyState === 4) {
        if (this.status === 200) {
          const responseData = JSON.parse(this.responseText);
          const iceServerUrl = responseData.Urls[0];
          const iceServerUsername = responseData.Username;
          const iceServerCredential = responseData.Password;
          setupWebRTC(iceServerUrl, iceServerUsername, iceServerCredential);
        } else {
          console.error("Failed to get token:", this.status, this.statusText);
        }
      }
    });
    xhr.send();
  } catch (error) {
    console.error("Error in connectAvatar:", error);
  }
}

// =================== SETUP WEBSOCKET & AVATAR ===================
function setupWebRTC(iceServerUrl, iceServerUsername, iceServerCredential) {
  try {
    if (peerConnection) {
      peerConnection.close();
    }

    peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: [iceServerUrl],
          username: iceServerUsername,
          credential: iceServerCredential,
        },
      ],
    });

    peerConnection.ontrack = (event) => {
      if (event.track.kind === "audio") {
        let audioElement = document.createElement("audio");
        audioElement.id = "audioPlayer";
        audioElement.srcObject = event.streams[0];
        audioElement.autoplay = true;
        audioElement.onplaying = () => console.log("WebRTC audio connected.");

        const remoteDiv = document.getElementById("remoteVideo");
        [...remoteDiv.childNodes].forEach((node) => {
          if (node.localName === "audio") remoteDiv.removeChild(node);
        });
        remoteDiv.appendChild(audioElement);
      } else if (event.track.kind === "video") {
        let videoElement = document.createElement("video");
        videoElement.id = "videoPlayer";
        videoElement.srcObject = event.streams[0];
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.onplaying = () => {
          console.log("WebRTC video connected.");
          const remoteDiv = document.getElementById("remoteVideo");
          [...remoteDiv.childNodes].forEach((node) => {
            if (node.localName === "video") remoteDiv.removeChild(node);
          });
          remoteDiv.appendChild(videoElement);

          document.getElementById("microphone").disabled = false;
          document.getElementById("stopSession").disabled = false;
          document.getElementById("chatHistory").hidden = false;
        };
      }
    };

    peerConnection.addEventListener("datachannel", (event) => {
      const dataChannel = event.channel;
      dataChannel.onmessage = (e) => {
        const webRTCEvent = JSON.parse(e.data);
        console.log("[WebRTC event] " + e.data);
      };
    });
    peerConnection.createDataChannel("eventChannel");

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE state: " + peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === "disconnected") {
        console.log("Reconnecting...");
        setupWebRTC(iceServerUrl, iceServerUsername, iceServerCredential);
      }
    };

    peerConnection.addTransceiver("video", { direction: "sendrecv" });
    peerConnection.addTransceiver("audio", { direction: "sendrecv" });

    avatarSynthesizer
      .startAvatarAsync(peerConnection)
      .then((r) => {
        if (r.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          console.log("Avatar started, resultId:" + r.resultId);
        } else {
          console.log("Unable to start avatar, resultId:" + r.resultId);
          if (r.reason === SpeechSDK.ResultReason.Canceled) {
            const cancellationDetails =
              SpeechSDK.CancellationDetails.fromResult(r);
            console.log("Avatar canceled: " + cancellationDetails.errorDetails);
          }
        }
      })
      .catch((error) => {
        console.log("Avatar failed to start: " + error);
      });
  } catch (error) {
    console.error("Error in setupWebRTC:", error);
  }
}

// =================== INITIALIZE MESSAGES ===================
function initMessages() {
  messages = [];
  messages.push({ role: "system", content: DEFAULT_SETTINGS.prompt });
}

// =================== DISCONNECT AVATAR ===================
function disconnectAvatar() {
  try {
    if (avatarSynthesizer) {
      avatarSynthesizer.close();
      avatarSynthesizer = null;
    }
    if (speechRecognizer) {
      speechRecognizer.stopContinuousRecognitionAsync();
      speechRecognizer.close();
      speechRecognizer = null;
    }
    sessionActive = false;
  } catch (error) {
    console.error("Error in disconnectAvatar:", error);
  }
}

// =================== BUTTON HANDLERS ===================
function microphone() {
  const micBtn = document.getElementById("microphone");
  if (micBtn.innerHTML === "Stop Microphone") {
    micBtn.disabled = true;
    speechRecognizer.stopContinuousRecognitionAsync(
      () => {
        micBtn.innerHTML = "Start Microphone";
        micBtn.disabled = false;
      },
      (err) => {
        console.log("Failed to stop recognition:", err);
        micBtn.disabled = false;
      }
    );
    return;
  }
  micBtn.disabled = true;
  speechRecognizer.recognized = async (s, e) => {
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      const userQuery = e.result.text.trim();
      if (!userQuery) return;
      micBtn.disabled = true;
      speechRecognizer.stopContinuousRecognitionAsync(
        () => {
          micBtn.innerHTML = "Start Microphone";
          micBtn.disabled = false;
        },
        (err) => {
          console.log("Error stopping recognition:", err);
          micBtn.disabled = false;
        }
      );
      handleUserQuery(userQuery, "", "");
    }
  };
  speechRecognizer.startContinuousRecognitionAsync(
    () => {
      micBtn.innerHTML = "Stop Microphone";
      micBtn.disabled = false;
    },
    (err) => {
      console.log("Failed to start recognition:", err);
      micBtn.disabled = false;
    }
  );
}

function stopSession() {
  disconnectAvatar();
  document.getElementById("microphone").disabled = true;
  document.getElementById("stopSession").disabled = true;
  document.getElementById("chatHistory").hidden = true;
  document.getElementById("userMessageBox").hidden = true;
  document.getElementById("uploadImgIcon").hidden = true;
}

function clearChatHistory() {
  document.getElementById("chatHistory").innerHTML = "";
  initMessages();
}

// =================== HUNG & IDLE CHECKS ===================
function checkHung() {
  try {
    const videoElement = document.getElementById("videoPlayer");
    if (!videoElement || !sessionActive) return;

    const videoTime = videoElement.currentTime;
    setTimeout(() => {
      if (
        videoElement &&
        videoElement.currentTime === videoTime &&
        sessionActive
      ) {
        sessionActive = false;
        console.log("Video stream disconnected, auto reconnecting...");
        if (avatarSynthesizer) {
          avatarSynthesizer.close();
          avatarSynthesizer = null;
        }
        connectAvatar();
      }
    }, 2000);
  } catch (error) {
    console.error("Error in checkHung:", error);
  }
}

function checkLastSpeak() {
  try {
    if (!lastSpeakTime || !sessionActive) return;

    const now = new Date();
    if (now - lastSpeakTime > 15000) {
      const remoteVideo = document.getElementById("remoteVideo");
      if (remoteVideo) {
        remoteVideo.style.width = "0.1px";
      }
      if (sessionActive) {
        disconnectAvatar();
      }
    }
  } catch (error) {
    console.error("Error in checkLastSpeak:", error);
  }
}

// =================== TTS FUNCTION ===================
function speak(text, endingSilenceMs = 0) {
  if (isSpeaking) {
    spokenTextQueue.push(text);
    return;
  }
  speakNext(text, endingSilenceMs);
}

function speakNext(text, endingSilenceMs = 0) {
  const ttsVoice = DEFAULT_SETTINGS.ttsVoice;
  let ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'
                     xmlns:mstts='http://www.w3.org/2001/mstts'
                     xml:lang='en-US'>
                  <voice name='${ttsVoice}'>
                    <mstts:ttsembedding>
                      <mstts:leadingsilence-exact value='0'/>
                      ${htmlEncode(text)}
                    </mstts:ttsembedding>
                  </voice>
                </speak>`;

  if (endingSilenceMs > 0) {
    ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'
                     xmlns:mstts='http://www.w3.org/2001/mstts'
                     xml:lang='en-US'>
                  <voice name='${ttsVoice}'>
                    <mstts:ttsembedding>
                      <mstts:leadingsilence-exact value='0'/>
                      ${htmlEncode(text)}
                      <break time='${endingSilenceMs}ms' />
                    </mstts:ttsembedding>
                  </voice>
                </speak>`;
  }

  const chatHistoryTextArea = document.getElementById("chatHistory");
  if (enableDisplayTextAlignmentWithSpeech) {
    chatHistoryTextArea.innerHTML += text.replace(/\n/g, "<br/>");
    chatHistoryTextArea.scrollTop = chatHistoryTextArea.scrollHeight;
  }

  lastSpeakTime = new Date();
  isSpeaking = true;
  speakingText = text;
  document.getElementById("stopSpeaking").disabled = false;

  avatarSynthesizer
    .speakSsmlAsync(ssml)
    .then((result) => {
      if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
        console.log(
          `Speech synthesized: ${text}, resultId: ${result.resultId}`
        );
        lastSpeakTime = new Date();
      } else {
        console.log(`Error speaking SSML. resultId: ${result.resultId}`);
      }
      if (spokenTextQueue.length > 0) {
        speakNext(spokenTextQueue.shift());
      } else {
        isSpeaking = false;
        document.getElementById("stopSpeaking").disabled = true;
      }
    })
    .catch((error) => {
      console.log(`speakSsmlAsync error: ${error}`);
      if (spokenTextQueue.length > 0) {
        speakNext(spokenTextQueue.shift());
      } else {
        isSpeaking = false;
        document.getElementById("stopSpeaking").disabled = true;
      }
    });
}

// =================== HANDLE USER QUERY ===================
function handleUserQuery(userQuery, userQueryHTML, imgUrlPath) {
  if (!userQuery) return;

  const chatHistory = document.getElementById("chatHistory");
  const userMessageDiv = document.createElement("div");
  userMessageDiv.className = "user-message";
  userMessageDiv.innerHTML = `<strong>You:</strong> ${userQueryHTML}`;
  chatHistory.appendChild(userMessageDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  messages.push({ role: "user", content: userQuery });

  // --- Cognitive Search Integration Start ---
  const cognitiveSearchEndpoint = DEFAULT_SETTINGS.cognitiveSearchEndpoint;
  const cognitiveSearchKey = DEFAULT_SETTINGS.cognitiveSearchKey;
  const cognitiveSearchIndexName = DEFAULT_SETTINGS.cognitiveSearchIndexName;

  let useCognitiveSearch =
    cognitiveSearchEndpoint && cognitiveSearchKey && cognitiveSearchIndexName;

  let url =
    DEFAULT_SETTINGS.azureOpenAIEndpoint +
    "openai/deployments/" +
    DEFAULT_SETTINGS.azureOpenAIDeploymentName;

  if (useCognitiveSearch) {
    url += "/extensions/chat/completions?api-version=2023-06-01-preview";
  } else {
    url += "/chat/completions?api-version=2023-06-01-preview";
  }

  let requestBody = {
    messages: messages,
    temperature: 0.7,
    max_tokens: 800,
    top_p: 0.95,
    frequency_penalty: 0,
    presence_penalty: 0,
    stop: null,
  };

  if (useCognitiveSearch) {
    requestBody.dataSources = [
      {
        type: "AzureCognitiveSearch",
        parameters: {
          endpoint: cognitiveSearchEndpoint,
          key: cognitiveSearchKey,
          indexName: cognitiveSearchIndexName,
        },
      },
    ];
  }
  // --- Cognitive Search Integration End ---

  const xhr = new XMLHttpRequest();
  xhr.open("POST", url); // Use the dynamically constructed URL
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("api-key", DEFAULT_SETTINGS.azureOpenAIApiKey);

  xhr.onreadystatechange = function () {
    if (this.readyState === 4) {
      if (this.status === 200) {
        try {
          const response = JSON.parse(this.responseText);
          let assistantMessage = "";

          // Handle both standard and Cognitive Search response formats
          if (response.choices && response.choices[0]) {
            if (response.choices[0].message) {
              // Standard format
              assistantMessage = response.choices[0].message.content;
            } else if (response.choices[0].messages) {
              // Cognitive Search format
              const messages = response.choices[0].messages;
              // Find the assistant message
              const assistantResponse = messages.find(
                (m) => m.role === "assistant"
              );
              if (assistantResponse) {
                assistantMessage = assistantResponse.content;
              }
            }
          }

          if (assistantMessage) {
            messages.push({ role: "assistant", content: assistantMessage });

            const assistantMessageDiv = document.createElement("div");
            assistantMessageDiv.className = "assistant-message";
            assistantMessageDiv.innerHTML = `<strong>Assistant:</strong> ${assistantMessage}`;
            chatHistory.appendChild(assistantMessageDiv);
            chatHistory.scrollTop = chatHistory.scrollHeight;

            speak(assistantMessage);
          } else {
            throw new Error("No assistant message found in response");
          }
        } catch (error) {
          console.error("Error parsing response:", error, this.responseText);
          const errorMessageDiv = document.createElement("div");
          errorMessageDiv.className = "error-message";
          errorMessageDiv.innerHTML = `<strong>Error:</strong> Failed to parse API response. Check console for details.`;
          chatHistory.appendChild(errorMessageDiv);
        }
      } else {
        console.error("Error Details:", {
          status: this.status,
          statusText: this.statusText,
          responseText: this.responseText,
          endpoint: DEFAULT_SETTINGS.azureOpenAIEndpoint,
          deploymentName: DEFAULT_SETTINGS.azureOpenAIDeploymentName,
          apiKeyLength: DEFAULT_SETTINGS.azureOpenAIApiKey
            ? DEFAULT_SETTINGS.azureOpenAIApiKey.length
            : 0,
        });

        const errorMessageDiv = document.createElement("div");
        errorMessageDiv.className = "error-message";
        errorMessageDiv.innerHTML = `<strong>Error:</strong> Failed to get response from AI. Status: ${this.status} - ${this.statusText}. Check console for details.`;
        chatHistory.appendChild(errorMessageDiv);
      }
    }
  };

  xhr.send(JSON.stringify(requestBody)); // Send the constructed request body
}

// HTML encode helper
function htmlEncode(text) {
  const entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
  };
  return String(text).replace(/[&<>"'\/]/g, (m) => entityMap[m]);
}

// Add this function to handle Enter key press
function handleKeyDown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    const userMessageBox = document.getElementById("userMessageBox");
    const text = userMessageBox.innerText.trim();
    if (text) {
      handleUserQuery(text, text, "");
      userMessageBox.innerText = "";
    }
  }
}

// =================== STOP SPEAKING ===================
function stopSpeaking() {
  try {
    spokenTextQueue = [];
    if (avatarSynthesizer) {
      avatarSynthesizer
        .stopSpeakingAsync()
        .then(() => {
          isSpeaking = false;
          document.getElementById("stopSpeaking").disabled = true;
          console.log("Stop speaking request sent.");
        })
        .catch((err) => {
          console.error("Error stopping speaking:", err);
        });
    }
  } catch (error) {
    console.error("Error in stopSpeaking:", error);
  }
}

// Make stopSpeaking available globally
window.stopSpeaking = stopSpeaking;
