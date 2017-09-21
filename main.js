var log = require('./log');

var config = require('./config');
var modem = require('./modem');

var http = require('http');
var url = require('url');
var request = require('request');

var SerialPort = require('serialport');
var pdu = require('pdu');
var locks = require('locks');

var ports = []; // Ports with numerical index (from 0)
var ports_map = []; // Ports with named index (named in config)

var prepare_ports_interval;

if(config.config_check()) {
	log.print(`Passed config check`, 'config_check');
} else {
	log.print(`Config check failed, exiting...`, 'config_check');
	process.exit(1);
}

prepare_ports();
if(config.port_open_retry > 0)
	prepare_ports_interval = setInterval(prepare_ports, config.port_open_retry * 1000);

function prepare_ports() {
	var port_remaining = false;
	for(var i = 0; i < config.path.length; i++) {
		if(ports[i] === undefined) {
			ports[i] = [];
			port_remaining = true;
		}
		if(ports[i]['opened'] == false)
			port_remaining = true;
	}
	if(!port_remaining) {
		clearInterval(prepare_ports_interval);
		return;
	}

	for(var i = 0; i < config.path.length; i++) {
		if(ports[i]['opened'] === true)
			continue;

		ports[i]['name'] = config.name[i];
		ports[i]['path'] = config.path[i];
		ports[i]['baud'] = config.baud[i];
		ports[i]['model'] = config.model[i];
		ports[i]['lock'] = locks.createReadWriteLock();
		ports[i]['initialized'] = false;
		ports[i]['iccid'] = 0;
		ports[i]['port'] = new SerialPort(ports[i]['path'], {
			baudRate: ports[i]['baud'],
			autoOpen: false
		});
		
		ports[i]['port'].open(function(err) {
			if(err) {
				this.port['opened'] = false;
				return log.print(`Error opening port: ${err.message}`, `Device: ${this.port['name']}`);
			}
			this.port['opened'] = true;
			log.print(`Port ${this.port['path']} opened!`, `Device: ${this.port['name']}`);
			
			modem.initialization(this.port);
		}.bind({ port: ports[i] }));
		
		ports[i]['port'].on('error', function(err) {
			log.print(`Error: ${err.message}`, `Device: ${this.port['name']}`);
		}.bind({ port: ports[i] }));

		ports[i]['port'].on('data', function(data) {
			incoming_data(this.port, data);
		}.bind({ port: ports[i] }));
		
		ports_map[ports[i]['name']] = ports[i];
		
		ports[i]['read_timer'] = setInterval(periodic_check, 1000, ports[i]);
	}
}

function incoming_data(port, data) {
	response = data.toString('ascii');
	if(config.verbose > 1)
		log.print(`Received: START_${response}_END`);
	if(response.indexOf("+CMTI:") !== -1) {
		pos = response.split(',')[1];
		port['lock'].writeLock(function () {
			modem.read(port['port'], pos, function(err, result) {
				log.print(`SMS Received: from ${result.sender}, message: ${result.message}`, `Device: ${port['name']}`, '+CMTI');
				port['lock'].unlock();
			});
		});
	}
	if(response.indexOf("+CMT:") !== -1) {
		var sms = modem.parsesms(response);
		log.print(`SMS Received: from ${sms.sender}, message: ${sms.message}`, `Device: ${port['name']}`, '+CMT');
		http_callback(port, sms.sender, sms.message);
	}
	if(response.indexOf("+CMGL:") !== -1) {
		var sms = modem.parsemulti(response);
		for(var i = 0; i < sms.length; i++) {
			log.print(`SMS Received: from ${sms[i].sender}, message: ${sms[i].message}`, `Device: ${port['name']}`, '+CMGL');
		}
		http_callback(port, sms.sender, sms.message);
	}
}

async function periodic_check(port) {
	if(!port['initialized'])
		return;

	if(port['lock'].tryWriteLock()) {
		log.print(`Reading messages from memory.`, `Device: ${port['name']}`);
		response = await modem.write(port['port'], 'AT+CMGF=0\r', true);
		response = await modem.write(port['port'], `AT+CMGL=0\r`, true, null);
		// Delete all read or sent
		await modem.delete(port['port'], 0, 2);
		port['lock'].unlock();
	} else {
		log.print(`Cannot get the lock, not reading messages.`, `Device: ${port['name']}`);
	}
}

function http_callback(port, sender, message) {
	var post = {
		device: port['name'],
		sender: sender,
		message: message
	};
	request({url: config.callback, form: post}, function (error, response, body) {
		if(error)
			log.print(`HTTP callback failed. Error: ${error} Post content: ${post}`, `Device: ${port['name']}`)
		else
			log.print(`Callback URL called. Response: ${body} Post content: ${post}`, `Device: ${port['name']}`)
	});
}

http.createServer(function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	var request = url.parse(req.url, true);
	var q = request.query;
	var response = 'No valid action.';
	if(q.action == 'send') {
		if(ports_map[q.device]) {
			ports_map[q.device]['lock'].writeLock(function () {
				modem.send(ports_map[q.device]['port'], q.to, q.message, 0, function(err) {
					this.lock.unlock();
				}.bind({ lock: ports_map[q.device]['lock'] })); // For test: action=send&device=E3372&to=85264230207&message=test
			});
			response = 'OK';
			log.print(`Sending ${q.message} to ${q.to}`, `Device: ${q.device}`);
		} else {
			response = 'Device not found.';
		}
	}
	if(q.action == 'status') {
		response = {};
		for(var i = 0; i < ports.length; i++) {
			if(ports[i]['name'] == q.device || !q.device) {
				response[ports[i]['name']] = {
					name: ports[i]['name'],
					path: ports[i]['path'],
					baud: ports[i]['baud'],
					model: ports[i]['model'],
					opened: ports[i]['opened'],
					initialized: ports[i]['initialized'],
					iccid: ports[i]['iccid']
				};
			}
		}
		if(Object.keys(response).length < 1) {
			response['error'] = 'Device not found.';
		}
		response = JSON.stringify(response);
	}
	if(q.action == 'reset') {
		if(ports_map[q.device]) {
			modem.reset(ports_map[q.device]);
			response = 'OK';
			log.print(`Resetting device.`, `Device: ${q.device}`);
		} else {
			response = 'Device not found.';
		}
	}
	if(q.action == 'ussd') {
		if(!q.command) {
			response = 'USSD command not found.';
		} else if(ports_map[q.device]) {
			modem.ussd(ports_map[q.device], q.command);
			response = 'OK';
		} else {
			response = 'Device not found.';
		}
	}
	if(q.action == 'readall') {
		if(ports_map[q.device]) {
			// Reading all unread messages
			modem.readall(ports_map[q.device]['port'], 0, function(err, sms) {
				log.print(sms, `Readall`);
			});
			response = 'OK';
		} else {
			response = 'Device not found.';
		}
	}
	res.end(response);
}).listen(config.listen);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	// application specific logging, throwing an error, or other logic here
});