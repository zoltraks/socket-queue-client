'use strict';

const net = require('net');
const mqtt = require('mqtt');
const yargs = require('yargs');

const Configuration = require('./class/configuration');
let configuration = new Configuration();

const argv = yargs
	.alias('?', 'help')
	.alias('h', 'host')
	.alias('!', 'pretend')
	.alias('p', 'port')
	.alias('t', 'topic')
	.alias('b', 'broker')
	.boolean('help')
	.boolean('pretend')
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

const State = require('./class/state');
let state = new State();

let lockMessageBuffer = false;

// This function create and return a net.Socket object to represent TCP client.
function socketConnect(host, port) {
	const client = new net.Socket();
	client.setTimeout(5000);
	client.setEncoding('binary');

	// When receive server send back data.
	client.on('data', (data) => {
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
		if (state.messageBuffer.length && state.mqttClient) {
			processMessageBuffer();
		}
	});

	// When connection disconnected.
	client.on('end', () => {
		console.log('Socket disconnected');
		state.socketClient = false;
	});

	client.on('timeout', () => {
		console.log('Socket timeout');
	});

	client.on('error', (error) => {
		console.error('Socket error: ' + JSON.stringify(error));
		client.destroy();
		state.socketClient = false;
	});

	client.connect(port, host, () => {
		console.log('Socket connected to ' + client.remoteAddress + ':' + client.remotePort + ' from ' + client.localAddress + ":" + client.localPort);
	});

	return client;
}

function mqttConnect(broker, topic) {
	state.mqttOnline = false;
	state.mqttTopic = topic;
	lockMessageBuffer = true;

	let client = mqtt.connect(getRealBrokerAddress(broker));

	client.on('connect', () => {
		console.log('Connected to MQTT broker ' + broker);
		state.mqttOnline = true;
		lockMessageBuffer = false;
		if (state.messageBuffer.length) {
			processMessageBuffer();
		}
	});

	client.on('reconnect', () => {
		console.log('Reconnection to MQTT broker');
		state.mqttOnline = false;
	});

	client.on('offline', () => {
		console.log('Connection to MQTT broker is now offline');
		state.mqttOnline = false;
	});

	client.on('error', (error) => {
		console.error('MQTT error: ' + JSON.stringify(error));
	});

	client.on('message', (topic, message) => {
		console.log('MQTT message (' + topic + '): "' + message + '"');
	});

	client.on('end', () => {
		console.log('Connection to MQTT broker closed');
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
		console.log('Processing message buffer already in progress');
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
	state.mqttClient.publish(state.mqttTopic, message, {}, (error) => {
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
			console.error("Port number must be an integer");
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