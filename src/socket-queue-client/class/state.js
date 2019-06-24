class State {

    socketClient;
    mqttClient;

    dataBuffer;
    messageBuffer;

    mqttClient;
    mqttOnline;
    mqttTopic;

    constructor() {
        this.dataBuffer = [];
        this.messageBuffer = [];
        this.socketClient = false;
        this.mqttClient = false;
        this.mqttOnline = false;
        this.mqttTopic = '';
    }
}

module.exports = State;
