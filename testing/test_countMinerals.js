
/*
This script will test the fixStorageGridFloorPlate function
*/
'use strict';

const mineflayer = require('mineflayer');
const autoBot = require("./autoBot_plugin.js").autoBot;
const fs = require('fs');
let config = JSON.parse(fs.readFileSync('autobot_config.json'));

let botId = process.argv[2]
botId = !botId ? '' : '_' + botId.toString();

const bot = mineflayer.createBot({
	host: config.host,
	port: config.port,
	username: `${config.username}${botId}`,
	password: config.password
});

function logResult(result) {
	console.log(result.description);
}

bot.loadPlugin(autoBot);

bot.once('spawn', () => {
	//const stash = bot.autobot.stash.stashNonEssentialInventory;
	bot.on('autobot.ready', (result) => {
		logResult(result);
		const ironOreBlocks = bot.findBlocks({
			point: bot.autobot.homePosition,
			matching: bot.mcData.blocksByName.iron_ore.id,
			maxDistance: 128,
			count: 5000
		});
		console.log(`Iron ore remaining: ${ironOreBlocks.length}`);
	});
});
