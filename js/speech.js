
const micOn = document.getElementById('mic_on');
const micOff = document.getElementById('mic_off');
const speechErrorMessageText = document.getElementById('error_message');
const voiceErrorMessageText = document.getElementById('voice_message');
const statusText = document.getElementById('status_message');
const outputText = document.getElementById('hidden_commands');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; 

if (!SpeechRecognition) { 
    speechErrorMessageText.textContent = "Speech recognition not supported in this browser."; 
     if (micOn) {
        micOn.disabled = true;
    }
} else { 
    const recognition = new SpeechRecognition(); 
    recognition.lang = 'en-US'; 
    recognition.continuous = false; 
    recognition.interimResults = false; 
    recognition.maxAlternatives = 1; 

    // Target phrases to recognize 
    const targetPhrases = ["theme", "forward", "backward", "left", "right", "stop", "anticlockwise", "clockwise"]; 

    function getSimilarity(str1, str2) {
  const track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i++) track[0][i] = i;
  for (let j = 0; j <= str2.length; j++) track[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // <--- FIXED: Now correctly applies 0 for a match
      );
    }
  }
  const distance = track[str2.length][str1.length];
  const longestLength = Math.max(str1.length, str2.length);
  return longestLength === 0 ? 1 : (longestLength - distance) / longestLength;
}

    let isListening = false;

    micOn.addEventListener('click', () => {

     if (isListening || !recognition) {
                return;
            }

    try {
        isListening = true;

        document.body.classList.add('active-speech');
        recognition.start();

        statusText.textContent = "Status: Listening...";
        voiceErrorMessageText.textContent = "🙂"

    } catch (e) {
        isListening = false;
        recognition.abort();
        stopDrive();

        statusText.textContent ="Could not start speech recognition.";
    
    }
});

    micOff.addEventListener('click', () => {

    if (!isListening) {
        return;
    }

    try {
        recognition.stop();

    } catch (e) {
        recognition.abort();
    }

    isListening = false;

    document.body.classList.remove('active-speech');
    statusText.textContent = "Status: Not Listening...";

    stopDrive();
});

    let isProcessingCommand = false;
    let lastCommand = "";
    let lastCommandTime = 0;

    // Capture the speech result
recognition.onresult = (event) => {

    // Prevent duplicate processing
    if (isProcessingCommand) {
        return;
    }

    const currentResultIndex = event.resultIndex;

    const transcript =
        event.results[currentResultIndex][0].transcript
        .toLowerCase()
        .trim();

    // Prevent the exact same command from being processed twice
    const now = Date.now();

    if (
        transcript === lastCommand &&
        now - lastCommandTime < 2000
    ) {
        return;
    }

    lastCommand = transcript;
    lastCommandTime = now;

    outputText.textContent = `You said: "${transcript}"`;

    const spokenWords = transcript.split(/\s+/);

    let bestMatchPhrase = null;
    let highestScore = 0;

    const CONFIDENCE_THRESHOLD = 0.80;

    targetPhrases.forEach(targetPhrase => {

        const targetWordsCount =
            targetPhrase.split(/\s+/).length;

        if (spokenWords.length < targetWordsCount) {

            const score =
                getSimilarity(transcript, targetPhrase);

            if (score > highestScore) {
                highestScore = score;
                bestMatchPhrase = targetPhrase;
            }

        } else {

            for (
                let i = 0;
                i <= spokenWords.length - targetWordsCount;
                i++
            ) {

                const segmentToCheck =
                    spokenWords
                        .slice(i, i + targetWordsCount)
                        .join(' ');

                const score =
                    getSimilarity(segmentToCheck, targetPhrase);

                if (score > highestScore) {
                    highestScore = score;
                    bestMatchPhrase = targetPhrase;
                }
            }
        }
    });

    if (highestScore >= CONFIDENCE_THRESHOLD) {

        // Lock command processing
        isProcessingCommand = true;

        statusText.textContent =
            `Success! Action triggered for: "${bestMatchPhrase}"`;

        triggerPhraseAction(bestMatchPhrase);


    } else {

        statusText.textContent =
            `Status: Command not recognized (Best match: ${Math.round(highestScore * 100)}%)`;
    }
};


    recognition.onend = () => {

    isListening = false;
    isProcessingCommand = false;

    document.body.classList.remove('active-speech');

    if (statusText.textContent === "Status: Listening...") {
        statusText.textContent = "Status: Stopped listening.";
    }

};

    recognition.onerror = (event) => { 
        statusText.textContent = `Error occurred: ${event.error}`; 
        voiceErrorMessageText.textContent = `😢`;
        stopDrive(); 
    };
    
const MOVEMENT_COMMANDS = new Set(["F", "B", "L", "R"]);

let currentDriveCommand = "S";
let driveKeepAliveTimer = null;

// Prevent overlapping BLE writes.
// Commands are processed in order.
let commandWriteQueue = Promise.resolve();


function clearDriveKeepAlive() {
    if (driveKeepAliveTimer !== null) {
        clearInterval(driveKeepAliveTimer);
        driveKeepAliveTimer = null;
    }
}

    function triggerPhraseAction(phrase) {
    statusText.textContent =
        `Success! Action triggered for: "${phrase}"`;

    switch (phrase) {
        case "theme":
    bgSwitch();
    outputText.textContent = "Theme toggled";
    break;


        case "forward":
            outputText.textContent = "Forward";
            startDrive("F");
            break;

        case "backward":
            outputText.textContent = "Backward";
            startDrive("B");
            break;

        case "left":
            outputText.textContent = "Left";
            startDrive("L");
            break;

        case "right":
            outputText.textContent = "Right";
            startDrive("R");
            break;

        case "stop":
            outputText.textContent = "Stop";
            stopDrive();
            break;

        case "anticlockwise":
            outputText.textContent = "Anti-clockwise";
            startDrive("L");
            break;

        case "clockwise":
            outputText.textContent = "Clockwise";
            startDrive("R");
            break;

        default:
            console.log("No action assigned to this phrase.");
            break;
    }
}

    // FIX #2: Moved inside the else wrapper so it has access to `recognition` and `targetPhrases`
    const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList; 
    if (SpeechGrammarList) { 
        const speechRecognitionList = new SpeechGrammarList(); 
        const grammar = '#JSGF V1.0; grammar phrases; public <phrase> = ' + targetPhrases.join(' | ') + ' ;'; 
        speechRecognitionList.addFromString(grammar, 1); 
        recognition.grammars = speechRecognitionList; 
    } 
}