/*
Experimental Minecraft Bot - plugin

The goal of this framework is to allow people to write bots at a high level
that can function independantly from an operator by responding to behaviour
events.

*/
'use strict';

const pathfinder = require('./pathfinder/pathfinder').pathfinder;
const Movements = require('./pathfinder/pathfinder').Movements;
//const { GoalBlock, GoalNear, GoalGetToBlock } = require('./pathfinder/pathfinder').goals;
const minecraftData = require('minecraft-data');

const sleep = require('./behaviours/autobotLib').sleep;

const Autocraft = require('./behaviours/Autocraft');
const BehaviourSelect = require('./behaviours/behaviourSelect');
const CollectDrops = require('./behaviours/CollectDrops');
const GetUnstuck = require('./behaviours/GetUnstuck');
const Inventory = require('./behaviours/Inventory');
const Landscaping = require('./behaviours/Landscaping');
const Lumberjack = require('./behaviours/Lumberjack');
const Mining = require('./behaviours/Mining');
const Navigator = require('./behaviours/Navigator');
const Smelting = require('./behaviours/Smelting');
const Stash = require('./behaviours/Stash');

/*****************************************************************************/

function inject (bot) {
	bot.mcData = null;
	bot.autobot = {};
	bot.autobot.autocraft = new Autocraft(bot);
	bot.autobot.behaviourSelect = new BehaviourSelect(bot);
	bot.autobot.collectDrops = new CollectDrops(bot);
	bot.autobot.getUnstuck = new GetUnstuck(bot);
	bot.autobot.inventory = new Inventory(bot);
	bot.autobot.landscaping = new Landscaping(bot);
	bot.autobot.lumberjack = new Lumberjack(bot);
	bot.autobot.mining = new Mining(bot);
	bot.autobot.navigator = new Navigator(bot);
	bot.autobot.smelting = new Smelting(bot);
	bot.autobot.stash = new Stash(bot);
	bot.loadPlugin(pathfinder);
	
	bot.once('spawn', autoBotLoader);

	function autoBotLoader() {
		bot.mcData = minecraftData(bot.version);
		bot.defaultMove = new Movements(bot, bot.mcData);
		bot.pathfinder.setMovements(bot.defaultMove);
		bot.on('goal_reached', bot.autobot.navigator.onGoalReached);
		bot.waitForChunksToLoad(() => {
			sleep(5000).then(() => {
				bot.autobot.homePosition = bot.autobot.navigator.setHomePosition();
				const eventName = "autobot.ready";
				let result = {
					error: false,
					resultCode: "ready",
					description: "autoBot is ready to run"
				};
				bot.emit(eventName, result);
			});
		});
	}
}

module.exports = {
	autoBot: inject
}
