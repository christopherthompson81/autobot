
/*
This script will test the fixStorageGridFloorPlate function
*/
'use strict';

const mineflayer = require('mineflayer');
const autoBot = require("../autoBot_plugin.js").autoBot;
const fs = require('fs');
let config = JSON.parse(fs.readFileSync('./autobot_config.json'));
const oreBlockTypes = require('../behaviours/constants').oreBlocks;

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
		const footBlock = bot.blockAt(bot.entity.position);
		const torchBlockTypes = [
			bot.mcData.blocksByName.torch.id,
			bot.mcData.blocksByName.wall_torch.id
		];
		let torches = bot.findBlocks({
			point: bot.entity.position,
			matching: torchBlockTypes,
			maxDistance: 7,
			count: 50
		});
		torches = torches.filter(p => bot.canSeeBlock(bot.blockAt(p)));
		if (footBlock.skyLight > 0 || torches.length > 0) {
			console.log("Bot is in sufficient light");
		}
		else {
			console.log("Bot is in darkness");
		}
	});
});
