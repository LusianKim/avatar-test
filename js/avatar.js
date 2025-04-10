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
var enableDisplayTextAlignmentWithSpeech = false;
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
      cognitiveSearchEndpoint: config.cognitiveSearchEndpoint,
      cognitiveSearchKey: !!config.cognitiveSearchKey,
      cognitiveSearchIndex: config.cognitiveSearchIndex,
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
      cognitiveSearchEndpoint: DEFAULT_SETTINGS.cognitiveSearchEndpoint,
      cognitiveSearchKey: !!DEFAULT_SETTINGS.cognitiveSearchKey,
      cognitiveSearchIndexName: DEFAULT_SETTINGS.cognitiveSearchIndexName,
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

    // Show welcome message
    showWelcomeMessage();

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

// Show welcome message with AzureLearner information
function showWelcomeMessage() {
  const chatHistory = document.getElementById("chatHistory");

  // Create a welcome message container
  const welcomeContainer = document.createElement("div");
  welcomeContainer.style.width = "100%";
  welcomeContainer.style.textAlign = "center";
  welcomeContainer.style.marginBottom = "20px";

  // Create the welcome content
  const welcomeContent = document.createElement("div");
  welcomeContent.style.display = "inline-block";
  welcomeContent.style.padding = "24px";
  welcomeContent.style.overflow = "hidden";
  welcomeContent.style.justifyContent = "center";
  welcomeContent.style.alignItems = "center";
  welcomeContent.style.gap = "2px";
  welcomeContent.style.display = "flex";
  welcomeContent.style.flexWrap = "wrap";
  welcomeContent.style.alignContent = "center";
  welcomeContent.style.maxWidth = "100%";
  welcomeContent.style.backgroundColor = "#f9f9f9";
  welcomeContent.style.borderRadius = "12px";
  welcomeContent.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";

  // Title with beta label
  const titleContainer = document.createElement("div");
  titleContainer.style.width = "100%";
  titleContainer.style.textAlign = "center";
  titleContainer.style.marginBottom = "10px";

  const titleSpan = document.createElement("span");
  titleSpan.style.color = "black";
  titleSpan.style.fontSize = "26px";
  titleSpan.style.fontFamily = "Inter, Arial, sans-serif";
  titleSpan.style.fontWeight = "700";
  titleSpan.textContent = "AzureLearner";

  const betaSpan = document.createElement("span");
  betaSpan.style.color = "rgba(0, 0, 0, 0.60)";
  betaSpan.style.fontSize = "15px";
  betaSpan.style.fontFamily = "Inter, Arial, sans-serif";
  betaSpan.style.fontWeight = "300";
  betaSpan.style.marginLeft = "5px";
  betaSpan.textContent = "beta";

  titleContainer.appendChild(titleSpan);
  titleContainer.appendChild(betaSpan);
  welcomeContent.appendChild(titleContainer);

  // Description
  const descriptionDiv = document.createElement("div");
  descriptionDiv.style.marginBottom = "15px";
  descriptionDiv.style.width = "100%";
  descriptionDiv.style.textAlign = "center";

  const boldSpan = document.createElement("span");
  boldSpan.style.color = "rgba(0, 0, 0, 0.80)";
  boldSpan.style.fontSize = "14px";
  boldSpan.style.fontFamily = "Noto Sans, Arial, sans-serif";
  boldSpan.style.fontWeight = "600";
  boldSpan.textContent = "AzureLearner";

  const normalSpan = document.createElement("span");
  normalSpan.style.color = "rgba(0, 0, 0, 0.80)";
  normalSpan.style.fontSize = "14px";
  normalSpan.style.fontFamily = "Noto Sans, Arial, sans-serif";
  normalSpan.style.fontWeight = "400";
  normalSpan.textContent =
    "는 Microsoft Azure의 제품군의 활용과 이를 통한 서비스 구현을 돕는 비공식 AI 챗봇 서비스입니다.";

  descriptionDiv.appendChild(boldSpan);
  descriptionDiv.appendChild(normalSpan);
  welcomeContent.appendChild(descriptionDiv);

  // Links section
  const linksContainer = document.createElement("div");
  linksContainer.style.display = "flex";
  linksContainer.style.justifyContent = "flex-start";
  linksContainer.style.alignItems = "center";
  linksContainer.style.gap = "27px";

  const linkLabelDiv = document.createElement("div");
  linkLabelDiv.style.paddingRight = "12px";
  linkLabelDiv.style.borderRight = "1px rgba(0, 0, 0, 0.60) solid";
  linkLabelDiv.style.display = "flex";
  linkLabelDiv.style.justifyContent = "center";
  linkLabelDiv.style.alignItems = "center";

  const linkLabelSpan = document.createElement("div");
  linkLabelSpan.style.color = "rgba(0, 0, 0, 0.60)";
  linkLabelSpan.style.fontSize = "12px";
  linkLabelSpan.style.fontFamily = "Noto Sans, Arial, sans-serif";
  linkLabelSpan.style.fontWeight = "700";
  linkLabelSpan.textContent = "활용 사이트";
  linkLabelDiv.appendChild(linkLabelSpan);

  linksContainer.appendChild(linkLabelDiv);

  const linksList = document.createElement("div");
  linksList.style.display = "flex";
  linksList.style.justifyContent = "flex-start";
  linksList.style.alignItems = "flex-start";
  linksList.style.gap = "14px";
  linksList.style.flexWrap = "wrap";

  const links = [
    "learn.microsoft.com/",
    "azure.microsoft.com/",
    "github.com/azure/",
    "techcommunity.microsoft.com/",
    "docs.microsoft.com/",
  ];

  links.forEach((link) => {
    const linkElement = document.createElement("div");
    linkElement.style.color = "#407FFF";
    linkElement.style.fontSize = "12px";
    linkElement.style.fontFamily = "Noto Sans, Arial, sans-serif";
    linkElement.style.fontWeight = "400";
    linkElement.style.textDecoration = "underline";
    linkElement.style.cursor = "pointer";

    // Create actual anchor element
    const anchor = document.createElement("a");
    anchor.href = "https://" + link;
    anchor.target = "_blank"; // Open in new tab
    anchor.style.color = "#407FFF";
    anchor.style.textDecoration = "inherit";
    anchor.textContent = link;

    linkElement.appendChild(anchor);
    linksList.appendChild(linkElement);
  });

  linksContainer.appendChild(linksList);
  welcomeContent.appendChild(linksContainer);

  welcomeContainer.appendChild(welcomeContent);
  chatHistory.appendChild(welcomeContainer);

  // Scroll to the bottom of the chat history
  chatHistory.scrollTop = chatHistory.scrollHeight;
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

  // Add events to capture all speech recognition states
  speechRecognizer.recognizing = function (s, e) {
    console.log("Speech recognizing:", e.result.text);
  };

  speechRecognizer.recognized = async (s, e) => {
    console.log("Speech recognized, reason:", e.result.reason);
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      const userQuery = e.result.text.trim();
      console.log("Recognized speech text:", userQuery);

      if (!userQuery) {
        console.log("Empty query, ignoring");
        return;
      }

      micBtn.disabled = true;

      // First add the message to chat history immediately
      addUserMessageToChat(userQuery);
      console.log("Added speech to chat history:", userQuery);

      // Then stop recognition
      speechRecognizer.stopContinuousRecognitionAsync(
        () => {
          micBtn.innerHTML = "Start Microphone";
          micBtn.disabled = false;
          console.log("Recognition stopped after speech detection");

          // And finally make the API call
          console.log("Sending to handleUserQuery:", userQuery);
          handleUserQuery(userQuery, userQuery, "");
        },
        (err) => {
          console.log("Error stopping recognition:", err);
          micBtn.disabled = false;
        }
      );
    }
  };

  // Add handler for speech recognition errors
  speechRecognizer.canceled = function (s, e) {
    console.log("Speech recognition canceled:", e.errorDetails);
    micBtn.disabled = false;
    micBtn.innerHTML = "Start Microphone";
  };

  speechRecognizer.startContinuousRecognitionAsync(
    () => {
      console.log("Speech recognition started");
      micBtn.innerHTML = "Stop Microphone";
      micBtn.disabled = false;
      sessionActive = true;
    },
    (err) => {
      console.log("Failed to start recognition:", err);
      micBtn.disabled = false;
    }
  );
}

// Helper function to get formatted timestamp
function getCurrentTime() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();

  // Ensure two digits
  hours = hours < 10 ? "0" + hours : hours;
  minutes = minutes < 10 ? "0" + minutes : minutes;

  return `${hours}:${minutes}`;
}

// New function to add user message to chat immediately
function addUserMessageToChat(userText) {
  console.log("Adding user message to chat:", userText);
  const chatHistory = document.getElementById("chatHistory");

  // Create a wrapper div to contain everything properly
  const messageContainer = document.createElement("div");
  messageContainer.style.width = "100%";
  messageContainer.style.textAlign = "right";

  const userMessageDiv = document.createElement("div");
  userMessageDiv.className = "user-message";

  // Create the text content
  const textSpan = document.createElement("span");
  const content = userText;
  // Format user messages the same way as assistant messages
  if (!content.includes("<img")) {
    // Skip formatting if it contains an image
    textSpan.innerHTML = `<p>${content.replace(/\n/g, "<br>")}</p>`;
    textSpan.style.whiteSpace = "pre-wrap";
  } else {
    textSpan.innerHTML = content;
  }
  userMessageDiv.appendChild(textSpan);

  // Create the timestamp
  const timestamp = document.createElement("span");
  timestamp.className = "message-timestamp";
  timestamp.textContent = getCurrentTime();
  userMessageDiv.appendChild(timestamp);

  messageContainer.appendChild(userMessageDiv);
  chatHistory.appendChild(messageContainer);

  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Set a flag to prevent duplicate messages in handleUserQuery
  window.lastAddedMessage = userText;
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

  // Disable this feature to prevent duplicate messages
  // const chatHistoryTextArea = document.getElementById("chatHistory");
  // if (enableDisplayTextAlignmentWithSpeech) {
  //   chatHistoryTextArea.innerHTML += text.replace(/\n/g, "<br/>");
  //   chatHistoryTextArea.scrollTop = chatHistory.scrollHeight;
  // }

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
  if (!userQuery) {
    console.log("Empty query in handleUserQuery, returning");
    return;
  }

  console.log(
    "handleUserQuery called with:",
    userQuery,
    "Image:",
    imgUrlPath ? "Yes" : "No"
  );

  // Check a flag set by addUserMessageToChat to prevent duplicates
  if (window.lastAddedMessage !== userQuery) {
    const chatHistory = document.getElementById("chatHistory");

    // Create a wrapper div to contain everything properly
    const messageContainer = document.createElement("div");
    messageContainer.style.width = "100%";
    messageContainer.style.textAlign = "right";

    const userMessageDiv = document.createElement("div");
    userMessageDiv.className = "user-message";

    // Create the text content
    const textSpan = document.createElement("span");
    const content = userQueryHTML || userQuery;
    // Format user messages the same way as assistant messages
    if (!content.includes("<img")) {
      // Skip formatting if it contains an image
      textSpan.innerHTML = `<p>${content.replace(/\n/g, "<br>")}</p>`;
      textSpan.style.whiteSpace = "pre-wrap";
    } else {
      textSpan.innerHTML = content;
    }
    userMessageDiv.appendChild(textSpan);

    // Create the timestamp
    const timestamp = document.createElement("span");
    timestamp.className = "message-timestamp";
    timestamp.textContent = getCurrentTime();
    userMessageDiv.appendChild(timestamp);

    messageContainer.appendChild(userMessageDiv);
    chatHistory.appendChild(messageContainer);

    chatHistory.scrollTop = chatHistory.scrollHeight;
  } else {
    console.log("Message already added to chat, skipping duplicate");
  }

  // Create user message with optional image
  let userMessage = { role: "user", content: userQuery };

  // If there's an image, append it to the message content in a format Azure OpenAI understands
  if (imgUrlPath) {
    try {
      // For image content, we need to create a message with multiple parts
      userMessage = {
        role: "user",
        content: [
          {
            type: "text",
            text: userQuery,
          },
          {
            type: "image_url",
            image_url: {
              url: imgUrlPath,
            },
          },
        ],
      };
      console.log("Created multimodal message with image");
    } catch (error) {
      console.error("Error creating image message:", error);
    }
  }

  messages.push(userMessage);

  // --- Cognitive Search Integration Start ---
  const cognitiveSearchEndpoint = DEFAULT_SETTINGS.cognitiveSearchEndpoint;
  const cognitiveSearchKey = DEFAULT_SETTINGS.cognitiveSearchKey;
  const cognitiveSearchIndexName = DEFAULT_SETTINGS.cognitiveSearchIndexName;

  let useCognitiveSearch =
    cognitiveSearchEndpoint && cognitiveSearchKey && cognitiveSearchIndexName;

  console.log("Cognitive Search Settings:", {
    endpoint: cognitiveSearchEndpoint,
    hasKey: !!cognitiveSearchKey,
    indexName: cognitiveSearchIndexName,
    useCognitiveSearch: useCognitiveSearch,
  });

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
    console.log("Added data sources to request body:", requestBody.dataSources);
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

            // Create a wrapper div to contain everything properly
            const messageContainer = document.createElement("div");
            messageContainer.style.width = "100%";
            messageContainer.style.textAlign = "left";

            const assistantMessageDiv = document.createElement("div");
            assistantMessageDiv.className = "assistant-message";

            // Create the text content with improved formatting
            const textSpan = document.createElement("span");
            // Format the message:
            // 1. Replace newlines with <br> tags
            // 2. Format lists properly
            // 3. Add proper paragraph spacing
            // 4. Format code blocks
            const formattedText = assistantMessage
              // Format code blocks
              .replace(
                /```(\w*)\n([\s\S]*?)\n```/g,
                (match, language, code) => {
                  return `<pre><code class="language-${
                    language || "text"
                  }">${htmlEncode(code)}</code></pre>`;
                }
              )
              // Format inline code
              .replace(/`([^`]+)`/g, "<code>$1</code>")
              .replace(/\n\n/g, "</p><p>") // Double line breaks become paragraphs
              .replace(/\n- /g, "<br>• ") // Lists with dashes
              .replace(/\n\d+\. /g, (match) => "<br>" + match.trim()) // Numbered lists
              .replace(/\n/g, "<br>"); // Single line breaks

            textSpan.innerHTML = `<p>${formattedText}</p>`;
            textSpan.style.whiteSpace = "pre-wrap"; // Preserve whitespace
            assistantMessageDiv.appendChild(textSpan);

            // Create the timestamp
            const timestamp = document.createElement("span");
            timestamp.className = "message-timestamp";
            timestamp.textContent = getCurrentTime();
            assistantMessageDiv.appendChild(timestamp);

            messageContainer.appendChild(assistantMessageDiv);
            chatHistory.appendChild(messageContainer);

            chatHistory.scrollTop = chatHistory.scrollHeight;

            speak(assistantMessage);
          } else {
            throw new Error("No assistant message found in response");
          }
        } catch (error) {
          console.error("Error parsing response:", error);

          // Create a wrapper div to contain everything properly
          const messageContainer = document.createElement("div");
          messageContainer.style.width = "100%";
          messageContainer.style.textAlign = "left";

          const errorMessageDiv = document.createElement("div");
          errorMessageDiv.className = "error-message";

          // Create the text content
          const textSpan = document.createElement("span");
          textSpan.textContent = `Error: Failed to parse API response. Check console for details.`;
          errorMessageDiv.appendChild(textSpan);

          // Create the timestamp
          const timestamp = document.createElement("span");
          timestamp.className = "message-timestamp";
          timestamp.textContent = getCurrentTime();
          errorMessageDiv.appendChild(timestamp);

          messageContainer.appendChild(errorMessageDiv);
          chatHistory.appendChild(messageContainer);

          chatHistory.scrollTop = chatHistory.scrollHeight;
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

        // Create a wrapper div to contain everything properly
        const messageContainer = document.createElement("div");
        messageContainer.style.width = "100%";
        messageContainer.style.textAlign = "left";

        const errorMessageDiv = document.createElement("div");
        errorMessageDiv.className = "error-message";

        // Create the text content
        const textSpan = document.createElement("span");
        textSpan.textContent = `Error: Failed to get response from AI. Status: ${this.status} - ${this.statusText}. Check console for details.`;
        errorMessageDiv.appendChild(textSpan);

        // Create the timestamp
        const timestamp = document.createElement("span");
        timestamp.className = "message-timestamp";
        timestamp.textContent = getCurrentTime();
        errorMessageDiv.appendChild(timestamp);

        messageContainer.appendChild(errorMessageDiv);
        chatHistory.appendChild(messageContainer);

        chatHistory.scrollTop = chatHistory.scrollHeight;
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
    sendMessage();
  }
}

// Send message function (used by both Enter key and Send button)
function sendMessage() {
  const userMessageBox = document.getElementById("userMessageBox");
  const text = userMessageBox.innerText.trim();
  if (text) {
    handleUserQuery(text, text, "");
    userMessageBox.innerText = "";
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

// =================== IMAGE UPLOAD HANDLING ===================
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Check file type
  if (!file.type.match("image.*")) {
    alert("Please select an image file");
    return;
  }

  // Check file size (limit to 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert("Image size is too large. Please select an image under 5MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    imgUrl = e.target.result;

    // Show preview in chat
    const chatHistory = document.getElementById("chatHistory");
    const imgPreviewDiv = document.createElement("div");
    imgPreviewDiv.className = "img-preview";

    // Create elements directly instead of using template literals with whitespace
    const container = document.createElement("div");
    container.style.margin = "10px 0";

    const strong = document.createElement("strong");
    strong.textContent = "Image Selected:";
    container.appendChild(strong);

    container.appendChild(document.createElement("br"));

    const img = document.createElement("img");
    img.src = imgUrl;
    img.style.maxWidth = "200px";
    img.style.maxHeight = "200px";
    img.style.marginTop = "5px";
    img.style.borderRadius = "5px";
    container.appendChild(img);

    const buttonDiv = document.createElement("div");
    buttonDiv.style.marginTop = "5px";

    const sendButton = document.createElement("button");
    sendButton.textContent = "Send this image";
    sendButton.onclick = function () {
      sendImageMessage(file.name);
    };
    buttonDiv.appendChild(sendButton);

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.onclick = cancelImageUpload;
    buttonDiv.appendChild(cancelButton);

    container.appendChild(buttonDiv);

    const timestamp = document.createElement("span");
    timestamp.className = "message-timestamp";
    timestamp.textContent = getCurrentTime();
    container.appendChild(timestamp);

    imgPreviewDiv.appendChild(container);
    chatHistory.appendChild(imgPreviewDiv);

    // Scroll to bottom
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Reset the file input
    document.getElementById("fileInput").value = "";
  };
  reader.readAsDataURL(file);
}

function cancelImageUpload() {
  // Remove the preview
  const previews = document.querySelectorAll(".img-preview");
  if (previews.length > 0) {
    previews[previews.length - 1].remove();
  }
  imgUrl = "";
}

function sendImageMessage(fileName) {
  if (!imgUrl) return;

  // Create a message with the image
  const userQuery = `[Sending image: ${fileName}]`;
  const userQueryHTML = `[Sending image: ${fileName}]<br><img src="${imgUrl}" style="max-width: 200px; max-height: 200px; margin-top: 5px; border-radius: 5px;">`;

  // Remove the preview
  const previews = document.querySelectorAll(".img-preview");
  if (previews.length > 0) {
    previews[previews.length - 1].remove();
  }

  // Send the message with the image
  handleUserQuery(userQuery, userQueryHTML, imgUrl);

  // Reset the image URL
  imgUrl = "";
}
