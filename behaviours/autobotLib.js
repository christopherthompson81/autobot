const nbt = require('prismarine-nbt');
const Vec3 = require('vec3').Vec3;

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function getToolDamage(tool) {
	return (tool && tool.nbt) ? tool.nbt.value.Damage.value : 0;
}

function bestHarvestTool(bot, block) {
	const availableTools = bot.inventory.items();
	const effects = bot.entity.effects;
	// Baseline is an empty hand, not Number.MAX_VALUE
	let fastest = block.digTime(null, false, false, false, [], effects);
	let bestTool = null;
	for (const tool of availableTools) {
		const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : [];
		const damage = getToolDamage(tool);
		const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects);
		// if tools are the same and picked, switch if the new tool is more damaged (use most damaged tool first).
		// 	This will prevent wear-evening, which would cause the time between tools breaking to be close together.
		//	We want to maximize the time gap between tools breaking.
		if (
			(digTime < fastest) ||
			(bestTool && bestTool.type === tool.type && damage > getToolDamage(bestTool))
		) {
			fastest = digTime;
			bestTool = tool;
		}
		
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

function sortByDistanceFromHome(bot, vec3Array) {
	// resort array by distance from bot ascending
	return vec3Array.sort((a, b) => {
		const distA = bot.autobot.homePosition.distanceTo(new Vec3(a.x, a.y, a.z));
		const distB = bot.autobot.homePosition.distanceTo(new Vec3(b.x, b.y, b.z));
		return distA - distB;
	});
}

function getPosHash(p) {
	return p.x + ',' + p.y + ',' + p.z;
}

exports.sleep = sleep;
exports.sortByDistanceFromBot = sortByDistanceFromBot;
exports.sortByDistanceFromHome = sortByDistanceFromHome;
exports.bestHarvestTool = bestHarvestTool;
exports.getPosHash = getPosHash;
