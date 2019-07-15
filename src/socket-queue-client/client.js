'use strict';

const net = require('net');
const mqtt = require('mqtt');
const yargs = require('yargs');
const fs = require('fs');

const Configuration = require('./class/configuration');
let configuration = new Configuration();

const argv = yargs
	.alias('?', 'help')
	.alias('h', 'host')
	.alias('!', 'pretend')
	.alias('p', 'port')
	.alias('t', 'topic')
	.alias('b', 'broker')
	.alias('q', 'qos')
	.alias('Q', 'quiet')
	.alias('T', 'text')
	.alias('L', 'log')
	.alias('v', 'verbose')
	.boolean('help')
	.boolean('pretend')
	.boolean('quiet')
	.boolean('text')
	.help(false)
	.argv
	;

if (argv.help) {
	showHelp();
	process.exit(0);
}

if (!parseOptions()) {
	process.exit(1);
}

if (argv.pretend) {
	showConfiguration();
	process.exit(0);
}

function logConsole(lvl, msg) {
	if (configuration.quiet) {
		return;
	}
	switch (lvl) {
		case undefined:
		case "":
		case "WRITE":
			console.log(msg);
			break;
		case "ERROR":
			console.error(msg);
			break;
	}
}

function logFile(messageText, fileName, messageSeverity) {
	if (undefined == fileName || 0 == ("" + fileName).length) {
		return true;
	}
	if (configuration.quiet && !configuration.verbose && 
		(undefined === messageSeverity || 0 === ("" + messageSeverity).length 
		|| "MESSAGE" === messageSeverity || "WRITE" === messageSeverity
		)) {
		return true;
	}
	let text = messageText;
	//let hrTime = process.hrtime();
	let now = new Date();
	let ut = now.getTime();
	//let ms = ("" + ut % 1000).padStart(3, '0');
	let severity = (() => {
		if (undefined == messageSeverity || 0 === ("" + messageSeverity).length) {
			return "     ";
		}
		else {
			return messageSeverity;
		}
	})();
	text = now.toISOString().replace('T', ' ').replace('Z', '')
		+ "\t" + severity + "\t" + text + "\r\n";
	fs.appendFile(fileName, text, function (err) {
		if (err) {
			log.error("File error. " + err);
			return false;
		}
		else {
			return true;
		}
	});
}

let log = {
	write: (msg) => {
		logConsole("WRITE", msg);
		logFile(msg, configuration.log);
		if (configuration.quiet) {
			return;
		}
		else {
			console.log(msg);
		}
	},
	error: (msg) => {
		logConsole("ERROR", msg);
		logFile(msg, configuration.log, "ERROR");
	}
}

const State = require('./class/state');
let state = new State();

let lockMessageBuffer = false;

// 
/**
 * This function creates and returns a net.Socket object to represent TCP client.
 * 
 * @param {*} host Host address
 * @param {*} port Port number
 */
function socketConnect(host, port) {
	const client = new net.Socket();
	client.setTimeout(5000);
	if (!configuration.text) {
		client.setEncoding('binary');
	}
	state.socketIdle = false;
	// When receive server send back data.
	client.on('data', (data) => {
		state.socketIdle = false;
		if (configuration.text) {
			state.textBuffer += data;
			while (true) {
				let p = state.textBuffer.indexOf("\n");
				if (p < 0) {
					break;
				}
				let m = state.textBuffer.substring(0, p).replace(/\r^/gm, "");
				if (m.length > 0) {
					state.messageBuffer.push(m);
				}
				state.textBuffer = state.textBuffer.slice(p + 1);
			}
		}
		else {
			let chunk = Buffer.from(data, 'binary');
			state.dataBuffer.push.apply(state.dataBuffer, chunk);
			while (true) {
				let p = state.dataBuffer.indexOf(3);
				if (p < 0) {
					break;
				}
				let x = state.dataBuffer.indexOf(2);
				if (x >= 0 && x < p) {
					let m = String.fromCharCode.apply(null, state.dataBuffer.slice(x + 1, p));
					state.messageBuffer.push(m);
				}
				state.dataBuffer = state.dataBuffer.slice(p + 1);
			}
		}
		if (state.messageBuffer.length && state.mqttClient) {
			processMessageBuffer();
		}
	});

	// When connection disconnected.
	client.on('end', () => {
		log.write('Socket disconnected');
		state.socketClient = false;
	});

	client.on('timeout', () => {
		if (!state.socketIdle) {
			log.write('Socket idle');
		}
		state.socketIdle = true;
	});

	client.on('error', (error) => {
		log.error('Socket error: ' + JSON.stringify(error));
		client.destroy();
		state.socketClient = false;
	});

	client.connect(port, host, () => {
		log.write('Socket connected to ' + client.remoteAddress + ':' + client.remotePort + ' from ' + client.localAddress + ":" + client.localPort);
	});

	return client;
}

function mqttConnect(broker, topic) {
	state.mqttOnline = false;
	state.mqttTopic = topic;
	lockMessageBuffer = true;

	let client = mqtt.connect(getRealBrokerAddress(broker));

	client.on('connect', () => {
		log.write('Connected to MQTT broker ' + broker);
		state.mqttOnline = true;
		lockMessageBuffer = false;
		if (state.messageBuffer.length) {
			processMessageBuffer();
		}
	});

	client.on('reconnect', () => {
		log.write('Reconnection to MQTT broker');
		state.mqttOnline = false;
	});

	client.on('offline', () => {
		log.write('Connection to MQTT broker is now offline');
		state.mqttOnline = false;
	});

	client.on('error', (error) => {
		log.error('MQTT error: ' + JSON.stringify(error));
	});

	client.on('message', (topic, message) => {
		log.write('MQTT message (' + topic + '): "' + message + '"');
	});

	client.on('end', () => {
		log.write('Connection to MQTT broker closed');
		state.mqttOnline = false;
		state.mqttClient = false;
	});

	return client;
}

function heartbeat(state) {
	if (!state.socketClient) {
		state.socketClient = socketConnect(configuration.host, configuration.port);
	}
	if (!state.mqttClient) {
		state.mqttClient = mqttConnect(configuration.broker, configuration.topic);
	}
}

setInterval(heartbeat, 1000, state);

function getRealBrokerAddress(broker) {
	if (!broker.match(/^mqtt:\/\//i)) {
		broker = 'mqtt://' + broker;
	}
	if (!broker.match(/:\d+$/)) {
		broker = broker + ':1883';
	}
	return broker;
}

function processMessageBuffer() {
	if (lockMessageBuffer) {
		log.write('Processing message buffer already in progress');
		return;
	}
	if (!state.mqttClient || !state.mqttOnline) {
		return;
	}
	let message = state.messageBuffer.shift();
	if (message === undefined) {
		return;
	}
	lockMessageBuffer = true;
	state.mqttClient.publish(state.mqttTopic, message, {
		cbStorePut: () => {
			return 0;
		},
		qos: undefined === configuration.qos || !Number.isInteger(configuration.qos)
			? 0 : configuration.qos
	}, (error) => {
		if (error) {
			state.messageBuffer.unshift(message);
			lockMessageBuffer = false;
		}
		else {
			lockMessageBuffer = false;
			processMessageBuffer();
		}
	});
}

function parseOptions() {
	if (argv.port) {
		if (!Number.isInteger(argv.port)) {
			log.error("Port number must be an integer");
			return false;
		}
		configuration.port = argv.port;
	}

	if (argv.host) {
		configuration.host = argv.host;
	}

	if (argv.topic) {
		configuration.topic = argv.topic;
	}

	if (argv.broker) {
		configuration.broker = argv.broker;
	}

	if (argv.quiet) {
		configuration.quiet = argv.quiet;
	}

	if (argv.verbose) {
		configuration.verbose = argv.verbose;
	}

	if (argv.text) {
		configuration.text = argv.text;
	}

	if (argv.log) {
		configuration.log = argv.log;
	}

	if (argv.qos) {
		if (!Number.isInteger(argv.qos)) {
			log.error("Value for qos must be an integer");
			return false;
		}
		configuration.qos = argv.qos;
	}

	return true;
}

function showHelp() {
	console.log("Use folowing arguments to specify PLC host and MQTT broker address to use:");
	console.log();
	console.log("  -h <host>");
	console.log("  --host <host>");
	console.log("      PLC hostname or address");
	console.log();
	console.log("  -p <port>");
	console.log("  --port <port>");
	console.log("      PLC port number");
	console.log();
	console.log("  -b <broker>");
	console.log("  --broker <broker>");
	console.log("      MQTT broker hostname or address");
	console.log();
	console.log("  -t <topic>");
	console.log("  --topic <topic>");
	console.log("      MQTT topic name");
	console.log();
	console.log("  -q <qos>");
	console.log("  --qos <qos>");
	console.log("      MQTT qos value");
	console.log();
	console.log("  -T");
	console.log("  --text");
	console.log("      Text mode");
	console.log();
	console.log("  -!");
	console.log("  --pretend");
	console.log("      Don't run yet, just print configuration and exit");
	console.log();
	console.log("  -?");
	console.log("  --help");
	console.log("      Display this message");
}

function showConfiguration() {
	console.log(JSON.stringify(configuration));
}
