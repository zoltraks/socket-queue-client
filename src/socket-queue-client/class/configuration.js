class Configuration {

    /**
     * Quiet (don't use a console)
     */
    quiet;

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
    
    /**
     * MQTT qos value
     */
    qos;

    /**
     * Text mode
     */
    text;

    /**
     * Log file
     */
    log;

    /**
     * Verbose mode
     */
    verbose;

    constructor(file)
    {
        this.host = 'localhost';
        this.port = 1000;
        this.broker = 'localhost';
        this.topic = 'data';
    }
}

module.exports = Configuration;
