const nbt = require('prismarine-nbt');

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function bestHarvestTool(bot, block) {
	const availableTools = bot.inventory.items();
	const effects = bot.entity.effects;
	// Baseline is an empty hand, not Number.MAX_VALUE
	let fastest = block.digTime(null, false, false, false, [], effects);
	let bestTool = null;
	for (const tool of availableTools) {
		const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : [];
		const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects);
		if (digTime < fastest) {
			fastest = digTime;
			bestTool = tool;
		}
		// TODO: if tools are the same and picked, switch if the new tool is more damaged (use most damaged tool first).
		// 	This will prevent wear-evening, which would cause the time between tools breaking to be close together.
		//	We want to maximize the time gap between tools breaking.
	}
	return bestTool;
}

function sortByDistanceFromBot(bot, vec3Array) {
	// resort array by distance from bot ascending
	return vec3Array.sort((a, b) => {
		const distA = bot.entity.position.distanceTo(new Vec3(a.x, a.y, a.z));
		const distB = bot.entity.position.distanceTo(new Vec3(b.x, b.y, b.z));
		return distA - distB;
	});
}

function getPosHash(p) {
	return p.x + ',' + p.y + ',' + p.z;
}

/*
Considering a generic approach (but it might require too much config):
	* pick best tool (done)
	* tooltype or quit
	* safeToBreak
	* move closer

function digQueue(bot, blockList, callback) {
	const current = blockList[0];
	const remainder = blockList.slice(1, blockList.length);
	const block = bot.blockAt(current, false)
	const tool = bot.pathfinder.bestHarvestTool(block)
	if (current) {
		//console.log(`Current:`, current);
		bot.equip(tool, 'hand', function () {
			bot.dig(current, true, (err) => {
				digQueue(bot, remainder, callback);
			});
		});
	}
	else {
		//console.log('Finished cutting. Waiting for drops.');
		sleep(1500).then(() => {
			//console.log('Picking up uncollected blocks.');
			bot.autobot.pickUpBrokenBlocks(callback);
		});
	}
}

mineVeinNext(vein) {
	const current = vein[0];
	this.remainder = vein.slice(1, vein.length);
	if (!this.havePickaxe()) {
		this.pickUpBrokenBlocks();
		return;
	}
	if (current) {
		if (!this.defaultMove.safeToBreak(current)) {
			console.log(`Target ${current.displayName} block is not safe to break. Skipping.`);
			this.badTargets.push(current.position.clone());
			this.mineVeinNext(this.remainder);
			return;
		}
		//console.log(`Current:`, current);
		this.equipPickaxe(() => {
			if (this.bot.entity.position.distanceTo(current.position) > 3) {
				console.log("The bot is too far from the object block to mine.");
				this.currentTask = 'mineVein';
				const p = current.position;
				const goal = new GoalGetToBlock(p.x, p.y, p.z);
				this.bot.pathfinder.setGoal(goal);
				return;
			}
			this.bot.dig(current, true, (err) => {
				this.mineVeinNext(this.remainder);
			});
		});
	}
	else {
		console.log('Finished mining. Waiting for drops.');
		this.currentTask = null;
		sleep(1000).then(() => {
			console.log('Picking up uncollected blocks.');
			this.pickUpBrokenBlocks();
		});
	}
}
*/

exports.sleep = sleep;
exports.sortByDistanceFromBot = sortByDistanceFromBot;
exports.bestHarvestTool = bestHarvestTool;
exports.getPosHash = getPosHash;
