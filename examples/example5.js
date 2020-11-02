
/*
This script will harvest trees and ore, then process and store them.

- It will quit if no trees are found.
- It uses the default behaviour to get the pathfinder routine unstuck
- It will mine ore if it has a pickaxe
- it will craft all tools of the best type (up to iron) it can make, with spares
AND
- It will build chests on the storage grid
- It will build furnaces on the storage grid
- It will clear and flatten the target storage grid spaces
- It will smelt iron ore
- It will compress compressables
- It will stash non-essential items, valuables, and superfluous tools
- It will remember chests and their contents so as to optimize stashing

Unmonitored Events:
	* autobot.autocraft.done
	* autobot.collectDrops.done
	* autobot.compression.done
	* autobot.landscaping.digQueue.done
	* autobot.landscaping.flattenCube.done
	* autobot.landscaping.newStorageObject
	* autobot.landscaping.placeQueue.done
	* autobot.smelting.done
	* autobot.smelting.resupply
	* autobot.smelting.restoke
	* autobot.smelting.newFurnace
	* autobot.stashing.done
	* autobot.stashing.newChest
*/
'use strict';

const autoBot = require("./autoBot_plugin.js").autobot;
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

bot.loadPlugin(autobot);

const botLoop = bot.autobot.stash.defaultPostStashingBehaviour;

function logResult(result) {
	console.log(result.description);
}

bot.on('autobot.ready', botLoop);
bot.on('bot_stuck', bot.autobot.onBotStuck);
bot.on('autobot.navigator.arrivedHome', botLoop);
bot.on('autobot.lumberjack.done', (result) => {
	console.log(result.description);
	if (result.error) return;
	botLoop();
});
bot.on('autobot.craftTools.done', logResult);
bot.on('autobot.mining.digging', logResult);
bot.on('autobot.mining.done', (result) => {
	console.log(result.description);
	if (result.resultCode === 'noVeinFound') return;
	botLoop();
});
bot.on('autobot.stashing.done', botLoop);
