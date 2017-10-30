var config = require('./config');

var path = require('path');
var parent_name = path.basename(module.parent.filename);

var fs = require('fs');
var util = require('util');

if(!fs.existsSync(config.log_location))
	fs.mkdirSync(config.log_location);

var log_name = config.log_location + require('node-datetime').create().format('Ymd_HMS') + '.log';
var log_file = fs.createWriteStream(log_name, {flags : 'w'});

var f_print = function(msg) {
	var datetime = require('node-datetime').create().format('Y-m-d H:M:S');
	var info = "";
	for (i = 1; i < arguments.length; i++) {
		info += `[${arguments[i]}]`;
	}
	var log = `[${datetime}][${parent_name}]${info} ${msg}`;
	console.log(log);
	log_file.write(`${log}\n`);
}

module.exports = {
	print: f_print
};