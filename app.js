const bluetoothStatus = document.getElementById('bluetooth_message');
const esp32Status = document.getElementById('esp32_message');
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

document.getElementById('bluetooth_btn').addEventListener('click', connectBluetooth);

// The user-gesture handler remains preserved and direct
async function connectBluetooth() {
try {
// Step 1: Check whether Web Bluetooth exists.
if (!navigator.bluetooth) {
throw new Error(
"Web Bluetooth is not supported in this browser. " +
"Open this website in Google Chrome or Microsoft Edge " +
"using HTTPS or localhost."
);
}


    if (!window.isSecureContext) {
        throw new Error(
            "Bluetooth requires a secure page. Open the website " +
            "using HTTPS or localhost."
        );
    }

    bluetoothStatus.textContent = "Searching for wheelchair...";

    // Step 2: Select the ESP32.
    bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }]
    });

    if (!bleDevice.gatt) {
        throw new Error(
            "This browser or device does not provide GATT support."
        );
    }

    // Step 3: Connect to the ESP32 GATT server.
    bluetoothStatus.textContent = "Connecting to ESP32...";

    bleServer = await bleDevice.gatt.connect();

    // Step 4: Find the BLE service.
    const service = await bleServer.getPrimaryService(
        SERVICE_UUID
    );

    // Step 5: Find the command and status characteristics.
    esp32Characteristic = await service.getCharacteristic(
        CHARACTERISTIC_UUID
    );

    statusCharacteristic = await service.getCharacteristic(
        STATUS_UUID
    );

    // Step 6: Listen for disconnection.
    bleDevice.removeEventListener(
        "gattserverdisconnected",
        handleBluetoothDisconnect
    );

    bleDevice.addEventListener(
        "gattserverdisconnected",
        handleBluetoothDisconnect
    );

    // Step 7: Enable incoming status notifications.
    statusCharacteristic.addEventListener(
        "characteristicvaluechanged",
        handleWheelchairStatus
    );

    await statusCharacteristic.startNotifications();

    // Step 8: Update the interface.
    bluetoothStatus.textContent =
        "Connected to: " + (bleDevice.name || "ESP32");

    esp32Status.textContent =
        "Connected. Waiting for wheelchair status...";

    console.log("Bluetooth connected successfully.");
    console.log("Device:", bleDevice.name);
    console.log("GATT connected:", bleServer.connected);

} catch (error) {
    console.error("Bluetooth connection error:", error);

    clearDriveKeepAlive();
    currentDriveCommand = "S";

    esp32Characteristic = null;
    statusCharacteristic = null;
    bleServer = null;

    bluetoothStatus.textContent =
        "Bluetooth error: " + error.message;

    esp32Status.textContent =
        "Connection unsuccessful. Check browser support and ESP32.";
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
