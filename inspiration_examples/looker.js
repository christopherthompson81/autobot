/*
 * This script will automatically look at the closest entity.
 * It checks for a near entity every tick.
 */
'use strict';

const mineflayer = require('mineflayer');
const fs = require('fs');
let config = JSON.parse(fs.readFileSync('lookerConfig.json'));
const minecraftData = require('minecraft-data')(config.serverVersion);

const bot = mineflayer.createBot({
	host: config.host,
	port: config.port,
	username: config.username,
	password: config.password
});

bot.once('spawn', function () {
	setInterval(() => {
		const entity = bot.nearestEntity()
		if (entity !== null) {
			if (entity.type === 'player') {
				bot.lookAt(entity.position.offset(0, 1.6, 0))
			} else if (entity.type === 'mob') {
				bot.lookAt(entity.position)
			}
		}
	}, 50)
});
