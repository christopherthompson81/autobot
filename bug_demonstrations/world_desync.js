/*
This script will:
	* launch a bot
	* wait for chunks to load
	* find a nearby air block
	* use an op command to modify a that into a stone block
	* refetch the block at the same location and show an error if it does not match.

The login for the bot must be op'd for this to work.
*/
'use strict';

const mineflayer = require('mineflayer');
const minecraftData = require('minecraft-data');

if (process.argv.length < 4 || process.argv.length > 6) {
	console.log('Usage : node world_desync.js <host> <port> [<name>] [<password>]')
	process.exit(1)
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

const bot = mineflayer.createBot({
	host: process.argv[2],
	port: parseInt(process.argv[3]),
	username: process.argv[4] ? process.argv[4] : 'world_desync',
	password: process.argv[5]
});

bot.once('spawn', () => {
	const mcData = minecraftData(bot.version);
	bot.waitForChunksToLoad(() => {
		let airBlocks = bot.findBlocks({
			point: bot.entity.position,
			matching: mcData.blocksByName.air.id
		});
		if (!airBlocks) {
			console.log('Error: No air blocks located');
			process.exit(1);
		}
		//sort to find the one furthest away from the bot currently.
		airBlocks = airBlocks.sort((a, b) => {
			const distA = bot.entity.position.distanceTo(a);
			const distB = bot.entity.position.distanceTo(b);
			return distB - distA;
		});
		const p = airBlocks[0];
		const testBlock = bot.blockAt(p);
		console.log(`Modifying block at ${p.x} ${p.y} ${p.z} from air to dirt`);
		bot.chat(`/setblock ${p.x} ${p.y} ${p.z} minecraft:dirt`);
		let refetchBlock = bot.blockAt(p);
		if (testBlock.name === refetchBlock.name) {
			console.log('Error: Block did not update');
		}
		else {
			console.log('Success: Block updated');
		}
		// Test after a timeout to let updates happen
		sleep(1000).then(() => {
			refetchBlock = bot.blockAt(p);
			if (testBlock.name === refetchBlock.name) {
				console.log('Error: Block did not update even after waiting for a second before checking.');
			}
			else {
				console.log('Success: Block updated');
			}
		});
	});
});
