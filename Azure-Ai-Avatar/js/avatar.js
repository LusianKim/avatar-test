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
const DEFAULT_SETTINGS = {
  region: "westeurope",
  APIKey:
    "2AFeCiGQHFE1gfxGqe5ROLxTaEi8fOERAa70vtwq1sZOngKeLcmVJQQJ99BDAC5RqLJXJ3w3AAAYACOGiZ1h",
  talkingAvatarCharacter: "lisa",
  talkingAvatarStyle: "casual-sitting",
  ttsVoice: "en-US-JennyNeural",
  sttLocales: ["en-US"],
  azureOpenAIEndpoint: "https://8teamfoundrysw5516102114.openai.azure.com/",
  azureOpenAIApiKey:
    "E7EAWlPdMlioGpTflIhpobAZclEvi8DRGSvzfDCZ173xxd4TpIVMJQQJ99BDACfhMk5XJ3w3AAAAACOGDKsS",
  azureOpenAIDeploymentName: "Agent2_conv",
  prompt: "You are a helpful AI assistant.",
};

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
  if (avatarSynthesizer) avatarSynthesizer.close();
  if (speechRecognizer) {
    speechRecognizer.stopContinuousRecognitionAsync();
    speechRecognizer.close();
  }
  sessionActive = false;
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
  const videoElement = document.getElementById("videoPlayer");
  if (videoElement && sessionActive) {
    const videoTime = videoElement.currentTime;
    setTimeout(() => {
      if (videoElement.currentTime === videoTime && sessionActive) {
        sessionActive = false;
        console.log("Video stream disconnected, auto reconnecting...");
        if (avatarSynthesizer) avatarSynthesizer.close();
        connectAvatar();
      }
    }, 2000);
  }
}

function checkLastSpeak() {
  if (!lastSpeakTime) return;
  const now = new Date();
  if (now - lastSpeakTime > 15000) {
    disconnectAvatar();
    document.getElementById("localVideo").hidden = false;
    document.getElementById("remoteVideo").style.width = "0.1px";
    sessionActive = false;
  }
}

// =================== INITIALIZATION ===================
window.onload = () => {
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

    // Set up periodic checks
    setInterval(() => {
      checkHung();
      checkLastSpeak();
    }, 2000);
  } catch (error) {
    console.error("Error in window.onload:", error);
  }
};

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
  let contentMessage = userQuery;
  if (imgUrlPath.trim()) {
    contentMessage = [
      { type: "text", text: userQuery },
      { type: "image_url", image_url: { url: imgUrlPath } },
    ];
  }
  messages.push({ role: "user", content: contentMessage });

  const chatHistoryTextArea = document.getElementById("chatHistory");
  if (
    chatHistoryTextArea.innerHTML !== "" &&
    !chatHistoryTextArea.innerHTML.endsWith("\n\n")
  ) {
    chatHistoryTextArea.innerHTML += "\n\n";
  }
  if (imgUrlPath.trim()) {
    chatHistoryTextArea.innerHTML += `<br/><br/>User: ${userQueryHTML}`;
  } else {
    chatHistoryTextArea.innerHTML += `<br/><br/>User: ${userQuery}<br/>`;
  }
  chatHistoryTextArea.scrollTop = chatHistoryTextArea.scrollHeight;

  if (isSpeaking) stopSpeaking();
  if (dataSources.length > 0 && enableQuickReply) {
    speak(getQuickReply(), 2000);
  }

  const azureOpenAIEndpoint = DEFAULT_SETTINGS.azureOpenAIEndpoint;
  const azureOpenAIApiKey = DEFAULT_SETTINGS.azureOpenAIApiKey;
  const azureOpenAIDeploymentName = DEFAULT_SETTINGS.azureOpenAIDeploymentName;

  let url = `${azureOpenAIEndpoint}/openai/deployments/${azureOpenAIDeploymentName}/chat/completions?api-version=2023-06-01-preview`;
  let body = JSON.stringify({ messages, stream: true });

  if (dataSources.length > 0) {
    url = `${azureOpenAIEndpoint}/openai/deployments/${azureOpenAIDeploymentName}/extensions/chat/completions?api-version=2023-06-01-preview`;
    body = JSON.stringify({ dataSources, messages, stream: true });
  }

  let assistantReply = "";
  let toolContent = "";
  let spokenSentence = "";
  let displaySentence = "";

  fetch(url, {
    method: "POST",
    headers: {
      "api-key": azureOpenAIApiKey,
      "Content-Type": "application/json",
    },
    body,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Chat API response: ${response.status} ${response.statusText}`
        );
      }
      chatHistoryTextArea.innerHTML += `<br/>Assistant: `;
      const reader = response.body.getReader();

      function read(previousChunkString = "") {
        return reader.read().then(({ value, done }) => {
          if (done) return;
          let chunkString = new TextDecoder().decode(value, { stream: true });
          if (previousChunkString)
            chunkString = previousChunkString + chunkString;

          if (
            !chunkString.endsWith("}\n\n") &&
            !chunkString.endsWith("[DONE]\n\n")
          ) {
            return read(chunkString);
          }
          chunkString.split("\n\n").forEach((line) => {
            if (line.startsWith("data:") && !line.endsWith("[DONE]")) {
              try {
                const responseJson = JSON.parse(line.substring(5).trim());
                let responseToken;
                if (dataSources.length === 0) {
                  responseToken = responseJson.choices[0].delta.content;
                } else {
                  const role = responseJson.choices[0].messages[0].delta.role;
                  if (role === "tool") {
                    toolContent =
                      responseJson.choices[0].messages[0].delta.content;
                  } else {
                    responseToken =
                      responseJson.choices[0].messages[0].delta.content || "";
                    if (byodDocRegex.test(responseToken)) {
                      responseToken = responseToken
                        .replace(byodDocRegex, "")
                        .trim();
                    }
                    if (responseToken === "[DONE]") responseToken = undefined;
                  }
                }
                if (responseToken) {
                  assistantReply += responseToken;
                  displaySentence += responseToken;
                  if (responseToken === "\n" || responseToken === "\n\n") {
                    spokenSentence += responseToken;
                    speak(spokenSentence);
                    spokenSentence = "";
                  } else {
                    spokenSentence += responseToken;
                    const trimmed = responseToken.replace(/\n/g, "");
                    if (trimmed.length <= 2) {
                      for (let punct of sentenceLevelPunctuations) {
                        if (trimmed.startsWith(punct)) {
                          speak(spokenSentence);
                          spokenSentence = "";
                          break;
                        }
                      }
                    }
                  }
                }
              } catch (err) {
                console.log("Error parsing chunk: " + err);
              }
            }
          });
          if (!enableDisplayTextAlignmentWithSpeech) {
            chatHistoryTextArea.innerHTML += displaySentence.replace(
              /\n/g,
              "<br/>"
            );
            chatHistoryTextArea.scrollTop = chatHistoryTextArea.scrollHeight;
            displaySentence = "";
          }
          return read();
        });
      }
      return read();
    })
    .then(() => {
      if (spokenSentence) {
        speak(spokenSentence);
        spokenSentence = "";
      }
      if (dataSources.length > 0 && toolContent) {
        messages.push({ role: "tool", content: toolContent });
      }
      messages.push({ role: "assistant", content: assistantReply });
    })
    .catch((err) => console.log("fetch error: " + err));
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
