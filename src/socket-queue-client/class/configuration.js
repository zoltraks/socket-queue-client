class Configuration {

    /**
     * Host address to connect
     */
    host;

    /**
     * Port number to connect
     */
    port;

    /**
     * MQTT broker address, i.e. "mqtt://192.168.56.2:1883"
     */
    broker;

    /**
     * MQTT topic name
     */
    topic;

    constructor(file)
    {
        this.host = 'localhost';
        this.port = 1000;
        this.broker = 'localhost';
        this.topic = 'sensor/flock';
    }
}

module.exports = Configuration;
