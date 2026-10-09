
const bluetoothStatus = document.getElementById('bluetooth_message');
const esp32Status = document.getElementById('esp32_message')
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const STATUS_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
let esp32Characteristic = null;
let bleDevice = null;
let bleServer = null;

document.getElementById('bluetooth-btn').addEventListener('click', connectBluetooth);

//Gotten from the Internet(A.I)
// Function triggered by a button click on your website
async function connectBluetooth() {
  try {
    // Request a Bluetooth device matching specific filters
    bleDevice = await navigator.bluetooth.requestDevice({
      //acceptAllDevices: true // Or filter by services/name
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

        bluetoothStatus.textContent =
            "Connection failed: " + error.message;
    }
  }


function handleBluetoothDisconnect() {

    // Stop JavaScript's repeated movement packets.
    currentDriveCommand = "S";
    clearDriveKeepAlive();

    esp32Characteristic = null;
    statusCharacteristic = null;
    bleServer = null;

    bluetoothStatus.textContent =
        "Wheelchair disconnected.";

    esp32Status.textContent =
        "Disconnected. ESP32 failsafe should stop movement.";

    console.log("Bluetooth disconnected.");
}

const writeTask = async () => {

        // Discard obsolete movement commands waiting in the queue.
        if (
            MOVEMENT_COMMANDS.has(value) &&
            currentDriveCommand !== value
        ) {
            return false;
        }

        const characteristic = esp32Characteristic;

        if (!characteristic || !bleServer?.connected) {

            if (
                MOVEMENT_COMMANDS.has(value) &&
                currentDriveCommand === value
            ) {
                currentDriveCommand = "S";
                clearDriveKeepAlive();
            }
            if (value !== "S") {
                esp32Status.textContent =
                    "Not connected. Command not sent.";
            }

            return false;
        }

        try {

            const data = new TextEncoder().encode(value);

            await characteristic.writeValue(data);

            console.log("Sent command:", value);

            esp32Status.textContent =
                "Sent command: " + value;

            return true;
            } catch (error) {

            console.error("Command transmission failed:", error);

            esp32Status.textContent =
                "Transmission failed: " + error.message;

            // Do not call stopDrive() here.
            // That would call sendCommand("S") recursively.
            // Stop repeating movement commands and let the ESP32
            // communication timeout provide the independent failsafe.
            currentDriveCommand = "S";
            clearDriveKeepAlive();

            return false;
        }
      
    }
     // Queue Bluetooth writes to avoid overlapping operations.
    commandWriteQueue =
        commandWriteQueue.then(writeTask, writeTask);

    return commandWriteQueue;

    


function startDrive(command) {

    if (!MOVEMENT_COMMANDS.has(command)) {
        return;
    }

    if (!esp32Characteristic || !bleServer?.connected) {

        statusText.textContent =
            "Please connect the wheelchair first.";

        return;
    }

    // Remember the movement command.
    currentDriveCommand = command;

    // Prevent an old timer from sending an old direction.
    clearDriveKeepAlive();
    // Send the first command immediately.
    sendCommand(command);

    // Repeat every 200 ms to satisfy the firmware's
    // 500 ms communication failsafe.
    driveKeepAliveTimer = setInterval(() => {

        if (currentDriveCommand === command) {
            sendCommand(command);
        }

    }, 200);
}

function stopDrive() {

    currentDriveCommand = "S";

    // Stop repeated F/B/L/R packets.
    clearDriveKeepAlive();

    // Send S when Bluetooth is connected.
    // The ESP32 handles the actual motor stopping.
    if (esp32Characteristic && bleServer?.connected) {
        sendCommand("S");
    }
}

// Expected format from wheelchair.ino:
// B87;V12.4;D120;F

function handleWheelchairStatus(event) {

    const message =
        new TextDecoder().decode(event.target.value).trim();

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

    // If the ESP32 reports a safety lockout, stop the
    // browser's repeated movement packets. Do not
    // automatically send S, because S resets the lockout.
    if (motion === "X") {
        currentDriveCommand = "S";
        clearDriveKeepAlive();

        statusText.textContent =
            "Safety lockout detected. Say STOP to reset it.";
    }

    const distanceText =
        distance === "-1" ? "Unavailable" : distance + " cm";

    esp32Status.textContent =
        "Battery: " + battery + "% | " +
        "Voltage: " + voltage + " V | " +
        "Obstacle: " + distanceText + " | " +
        "Motion: " + (motionLabels[motion] || motion);
}

