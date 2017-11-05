var log = require('./log');

var config = module.exports = {
	listen: 8080,
	callback: 'http://localhost/sms/Ja3HO/smsgwjs.php',
	name: [ 'E3372_0', 'E3372_1', 'E3372_2', 'E3372_3', 'E3372_4', 'E3372_5', 'E3372_6', 'E3372_7', 'E3372_8', 'E3372_9' ],
	path: [ '/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyUSB2', '/dev/ttyUSB3', '/dev/ttyUSB4', '/dev/ttyUSB5', '/dev/ttyUSB6', '/dev/ttyUSB7', '/dev/ttyUSB8', '/dev/ttyUSB9' ],
	baud: [ 115200, 115200, 115200, 115200, 115200, 115200, 115200, 115200, 115200, 115200 ],
	model: [ 'E3372', 'E3372', 'E3372', 'E3372', 'E3372', 'E3372', 'E3372', 'E3372', 'E3372', 'E3372' ],
	initialize_command: {
		E3372: [ 'AT^CURC=0\r', 'AT+CREG=0\r', 'AT+CNMI=1,3,0,0,0\r', 'AT+CMGF=1\r' ]
	},
	initialize_expect: {
		E3372: [ 'OK', 'OK', 'OK', 'OK' ]
	},
	reset_command: {
		E3372: [ 'AT^RESET\r' ]
	},
	initialize_retry: 2,
	port_open_retry: 60,
	verbose: 2,
	log_location: __dirname + '/log/',

	config_check: function() {
		var max_length = 0, failure = false;
		if(config.name.length > max_length) max_length = config.name.length;
		if(config.path.length > max_length) max_length = config.path.length;
		if(config.baud.length > max_length) max_length = config.baud.length;
		if(config.model.length > max_length) max_length = config.model.length;
		if(config.name.length < max_length) {
			log.print('Incorrect length. (config.name)', 'config_check');
			failure = true;
		}
		if(config.path.length < max_length) {
			log.print('Incorrect length. (config.path)', 'config_check');
			failure = true;
		}
		if(config.baud.length < max_length) {
			log.print('Incorrect length. (config.baud)', 'config_check');
			failure = true;
		}
		if(config.model.length < max_length) {
			log.print('Incorrect length. (config.model)', 'config_check');
			failure = true;
		}
		for(var i = 0; i < config.model.length; i++) {
			if(!config.initialize_command[config.model[i]]) {
				log.print(`Cannot find ${config.model[i]} in initialize_command.`, 'config_check');
				failure = true;
			}
			if(!config.initialize_expect[config.model[i]]) {
				log.print(`Cannot find ${config.model[i]} in initialize_expect.`, 'config_check');
				failure = true;
			}
			if(!config.reset_command[config.model[i]]) {
				log.print(`Cannot find ${config.model[i]} in reset_command.`, 'config_check');
				failure = true;
			}
		}
		return !failure;
	}
};