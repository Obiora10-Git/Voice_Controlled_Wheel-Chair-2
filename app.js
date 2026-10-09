const bluetoothStatus = document.getElementById('bluetooth_message');
const esp32Status = document.getElementById('esp32_message');
const statusText = document.getElementById('status_message') || bluetoothStatus; // Failsafe for statusText reference
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const STATUS_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

let esp32Characteristic = null;
let statusCharacteristic = null; // Declared missing variable
let bleDevice = null;
let bleServer = null;

// Drive state placeholders required by your logic
let currentDriveCommand = "S";
let driveKeepAliveTimer = null;
const MOVEMENT_COMMANDS = new Set(["F", "B", "L", "R", "S"]);
let commandWriteQueue = Promise.resolve(); // Initialized the queue cleanly

// Helper functions for the keepalive timer context
function clearDriveKeepAlive() {
    if (driveKeepAliveTimer) {
        clearInterval(driveKeepAliveTimer);
        driveKeepAliveTimer = null;
    }
}

document.getElementById('bluetooth-btn').addEventListener('click', connectBluetooth);

// The user-gesture handler remains preserved and direct
async function connectBluetooth() {
  try {
    // Request a Bluetooth device matching specific filters
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }]
    });

    // Connect to the device's server
    bleServer = await bleDevice.gatt.connect();
    const service = await bleServer.getPrimaryService(SERVICE_UUID);
    esp32Characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
    statusCharacteristic = await service.getCharacteristic(STATUS_UUID);

    statusCharacteristic.addEventListener(
        "characteristicvaluechanged",
        handleWheelchairStatus
    );
    await statusCharacteristic.startNotifications();

    console.log("Connected to: " + bleDevice.name);
    bluetoothStatus.textContent = "Connected to: " + bleDevice.name;
    esp32Status.textContent = "Connected. Waiting for wheelchair status...";
    console.log("Wheelchair connected:", bleDevice.name);

  } catch (error) {
    console.error("Bluetooth connection error:", error);
    clearDriveKeepAlive();
    currentDriveCommand = "S";

    esp32Characteristic = null;
    statusCharacteristic = null;
    bleServer = null;

    bluetoothStatus.textContent = "Connection failed: " + error.message;
  }
}

function handleBluetoothDisconnect() {
    currentDriveCommand = "S";
    clearDriveKeepAlive();

    esp32Characteristic = null;
    statusCharacteristic = null;
    bleServer = null;

    bluetoothStatus.textContent = "Wheelchair disconnected.";
    esp32Status.textContent = "Disconnected. ESP32 failsafe should stop movement.";
    console.log("Bluetooth disconnected.");
}

// Fixed the floating queue problem by consolidating it into a safe, non-breaking function wrapper
function sendCommand(value) {
    const writeTask = async () => {
        // Discard obsolete movement commands waiting in the queue.
        if (MOVEMENT_COMMANDS.has(value) && currentDriveCommand !== value) {
            return false;
        }

        const characteristic = esp32Characteristic;

        if (!characteristic || !bleServer?.connected) {
            if (MOVEMENT_COMMANDS.has(value) && currentDriveCommand === value) {
                currentDriveCommand = "S";
                clearDriveKeepAlive();
            }
            if (value !== "S") {
                esp32Status.textContent = "Not connected. Command not sent.";
            }
            return false;
        }

        try {
            const data = new TextEncoder().encode(value);
            await characteristic.writeValue(data);

            console.log("Sent command:", value);
            esp32Status.textContent = "Sent command: " + value;
            return true;
        } catch (error) {
            console.error("Command transmission failed:", error);
            esp32Status.textContent = "Transmission failed: " + error.message;

            currentDriveCommand = "S";
            clearDriveKeepAlive();
            return false;
        }
    };

    // Queue Bluetooth writes dynamically to avoid overlapping operations without throwing scope syntax errors
    commandWriteQueue = commandWriteQueue.then(writeTask, writeTask);
    return commandWriteQueue;
}

function startDrive(command) {
    if (!MOVEMENT_COMMANDS.has(command)) {
        return;
    }

    if (!esp32Characteristic || !bleServer?.connected) {
        statusText.textContent = "Please connect the wheelchair first.";
        return;
    }

    currentDriveCommand = command;
    clearDriveKeepAlive();
    sendCommand(command);

    driveKeepAliveTimer = setInterval(() => {
        if (currentDriveCommand === command) {
            sendCommand(command);
        }
    }, 200);
}

function stopDrive() {
    currentDriveCommand = "S";
    clearDriveKeepAlive();

    if (esp32Characteristic && bleServer?.connected) {
        sendCommand("S");
    }
}

function handleWheelchairStatus(event) {
    const message = new TextDecoder().decode(event.target.value).trim();
    console.log("Wheelchair status:", message);

    const parts = message.split(";");
    if (parts.length !== 4) {
        return;
    }

    const battery = parts[0].replace("B", "");
    const voltage = parts[1].replace("V", "");
    const distance = parts[2].replace("D", "");
    const motion = parts[3];

    const motionLabels = {
        F: "Forward",
        B: "Backward",
        L: "Left",
        R: "Right",
        S: "Stopped",
        X: "Safety lockout or critical battery"
    };

    if (motion === "X") {
        currentDriveCommand = "S";
        clearDriveKeepAlive();
        statusText.textContent = "Safety lockout detected. Say STOP to reset it.";
    }

    const distanceText = distance === "-1" ? "Unavailable" : distance + " cm";

    esp32Status.textContent =
        "Battery: " + battery + "% | " +
        "Voltage: " + voltage + " V | " +
        "Obstacle: " + distanceText + " | " +
        "Motion: " + (motionLabels[motion] || motion);
}
