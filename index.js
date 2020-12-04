
/*
Example of using the kitchen-sink behaviour autobot
*/
'use strict';

const createAutobot = require('./examples/example_kitchen_sink').createAutobot;
const sleep = require('./behaviours/autoBotLib').sleep;
const fs = require('fs');
const process = require('process');
let config = JSON.parse(fs.readFileSync('autobot_config.json'));

let botId = process.argv[2]
botId = !botId ? '' : '_' + botId.toString();

function restartBot() {
	console.log('Restarting bot');
	bot.quit('Restarting bot');
	sleep(2000).then(() => {
		bot = createAutobot(config, botId);
	});
	sleep(3600 * 1000).then(restartBot);
}

let bot = createAutobot(config, botId);
sleep(3600 * 1000).then(restartBot);