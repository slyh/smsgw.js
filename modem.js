var log = require('./log');

var config = require('./config');
var SerialPort = require('serialport');
var pdu = require('pdu');

var f_read = function(port, pos, finished) {
	return new Promise(async function(resolve, reject) {
		try {
			response = await f_write(port, `AT+CMGR=${pos}`, true, null);
			sms = f_parsesms(response);
			resolve(sms);
			if(typeof(finished) == 'function') finished(null, sms);
		} catch(e) {
			reject(e);
			if(typeof(finished) == 'function') finished(e);
		}
	});
};

var f_readall = function(port, stat, finished) {
	return new Promise(async function(resolve, reject) {
		try {
			response = await f_write(port, 'AT+CMGF=0\r', true);
			response = await f_write(port, `AT+CMGL=${stat}\r`, true, null);
			// Delete all read or sent
			f_delete(port, 0, 2);
			resolve(null);
			if(typeof(finished) == 'function') finished(null, null);
		} catch(e) {
			reject(e);
			if(typeof(finished) == 'function') finished(e);
		}
	});
};

var f_delete = function(port, index, flag) {
	return new Promise(async function(resolve, reject) {
		try {
			response = await f_write(port, `AT+CMGD=${index},${flag}\r`, true, null);
			resolve(response);
			if(typeof(finished) == 'function') finished(null, response);
		} catch(e) {
			reject(e);
			if(typeof(finished) == 'function') finished(e);
		}
	});
};

var f_parsemulti = function(data) {
	var message = data.trim().split('\n+');
	var sms = [];
	for(var i = 0; i < message.length; i++) {
		sms[i] = f_parsesms(message[i]);
	}
	return sms;
};

var f_parsesms = function(data) {
	sender = /"([0-9+]*)"/.exec(data.trim());
	if(sender) sender = sender[1];
			
	message = data.trim().split('\r');
	if(!message)
		message = data.trim().split('\n');
	message = message[1].trim();

	if(/^[0-9a-fA-F]*$/.test(message)) {
		if(config.verbose > 0)
			log.print(`Received message in pdu format, parsing...`);
		if(sender) {
			message = pdu.decode16Bit(message);
		} else {
			message = pdu.parse(message);
			sender = message.sender;
			message = message.text;
		}
	}

	sms = { sender: sender, message: message };
	
	return sms;
};

var f_send = function(port, to, message, repeat, finished) {
	return new Promise(async function(resolve, reject) {
		if(repeat < 2 || !repeat) repeat = 1;
		try {
			var failure = false, retry = 0;
			
			do {
				failure = false;
				response = await f_write(port, 'AT+CMGF=1\r', true);
				if(response.indexOf('OK') === -1) {
					clean_response = response.replace(/\W/g, '');
					log.print(`AT+CMGF=1 Response: ${clean_response}`, `Device: ${port.path}`);
					failure = true;
				}
				
				while(repeat > 0) {
					response = await f_write(port, `AT+CMGS="${to}"\r`, true);
					clean_response = response.replace(/\W/g, '');
					log.print(`AT+CMGS Response: ${clean_response}`, `Device: ${port.path}`);
					response = await f_write(port, message + String.fromCharCode(26), true);
					clean_response = response.replace(/\W/g, '');
					log.print(`Send SMS Result: ${clean_response}`, `Device: ${port.path}`);
					repeat--;
				}
			} while(failure && ++retry < config.initialize_retry);
				if(!failure) {
				if(typeof(finished) == 'function') finished(null);
				resolve();
			} else {
				if(typeof(finished) == 'function') finished(true);
				reject();
			}
		} catch(e) {
			log.print(`Error on f_write: ${e.message}`, `Device: ${port.path}`);
		}
	});
};

var f_ussd = async function(port, command) {
	var ussd = pdu.encode7Bit(command).toUpperCase();
	log.print(`Sending USSD ${command}. (PDU: ${ussd})`, `Device: ${port['name']}`);
	response = await f_write(port['port'], 'AT+CMGF=0\r', true);
	clean_response = response.replace(/\W/g, '');
	log.print(`AT+CMGF=0 Response: ${clean_response}`, `Device: ${port.path}`);
	response = await f_write(port['port'], `AT+CUSD=0,"${ussd}"\r`, true);
	clean_response = response.replace(/\W/g, '');
	log.print(`AT+CUSD Response: ${clean_response}`, `Device: ${port.path}`);
};

var f_write = function(port, command, response, finished) {
	return new Promise(function(resolve, reject) {
		port.write(command, function(err) {
			if(err) {
				reject(err);
				if(typeof(finished) == 'function') finished(err);
			}
			if(!response) {
				resolve();
				if(typeof(finished) == 'function') finished(null);
				return;
			}
			port.once('data', function(data) {
				resolve(data.toString('ascii'));
				if(typeof(finished) == 'function') finished(null, data.toString('ascii'));
			});
		});
	});
};

var f_initialization = async function(port) {
	var failure = false, retry = 0;
	do {
		failure = false;
		if(Array.isArray(config.initialize_command[port['model']])) {
			var command = config.initialize_command[port['model']];
			var expectation = config.initialize_expect[port['model']];
			for(var i = 0; i < command.length; i++) {
				result = await f_write(port['port'], command[i], true);
				clean_command = command[i].replace(/\W/g, '');
				clean_response = result.replace(/\W/g, '');
				log.print(`Initializing with ${clean_command}, Response: ${clean_response}`, `Device: ${port['name']}`);
				if(result.indexOf(expectation[i]) === -1) {
					failure = true;
					log.print(`Initialization failed, will try again...`, `Device: ${port['name']}`);
				}
			}
		}
	} while(failure && ++retry < config.initialize_retry);
	
	var iccid = '';
	iccid = await f_write(port['port'], 'AT^ICCID?\r', true);
	iccid = /([0-9]{10,})/.exec(iccid.trim())
	if(iccid)
		iccid = iccid[1];
	port['iccid'] = iccid;

	if(!failure) {
		port['initialized'] = true;
	}
}

var f_reset = function(port) {
	if(Array.isArray(config.reset_command[port['model']])) {
		var command = config.reset_command[port['model']];
		for(var i = 0; i < command.length; i++) {
			f_write(port['port'], command[i]);
			log.print(`Resetting device ${port['path']}: ${command[i]}`, `Device: ${port['name']}`);
		}
		log.print(`Reinitialize device in 60 seconds.`, `Device: ${port['name']}`);
		setTimeout(f_initialization, 60 * 1000, port);
	} else {
		log.print(`Reset command not found.`, `Device: ${port['name']}`);
	}
}

module.exports = {
	read: f_read,
	readall: f_readall,
	delete: f_delete,
	parsesms: f_parsesms,
	parsemulti: f_parsemulti,
	send: f_send,
	write: f_write,
	ussd: f_ussd,
	initialization: f_initialization,
	reset: f_reset
};