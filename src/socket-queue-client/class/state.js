class State {

    socketClient;
    socketIdle;

    dataBuffer;
    textBuffer;
    messageBuffer;

    mqttClient;
    mqttOnline;
    mqttTopic;

    constructor() {
        this.dataBuffer = [];
        this.textBuffer = '';
        this.messageBuffer = [];
        this.socketClient = false;
        this.socketIdle = false;
        this.mqttClient = false;
        this.mqttOnline = false;
        this.mqttTopic = '';
    }
}

module.exports = State;
