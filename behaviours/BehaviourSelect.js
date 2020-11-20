const autoBind = require('auto-bind');

class BehaviourSelect {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
	}

	/**************************************************************************
	 * 
	 * Default Behaviour Selectors
	 * 
	 **************************************************************************/

	defaultPostTaskBehaviour() {
		this.resetAllBehaviours();
		// If we have logs, mine, if we don't lumberjack
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
		// Don't start mining without a full set of tools
		const missingTools = this.bot.autobot.inventory.missingTools();
		if (missingTools.length > 0) {
			this.sendMissingTools(missingTools);
			this.bot.autobot.inventory.craftTools((result) => {
				this.bot.autobot.lumberjack.harvestNearestTree(32);
			});
			return;
		}
		const dirtCount = inventoryDict['dirt'] || 0;
		if (dirtCount < 32) {
			this.sendGettingDirt(dirtCount);
			this.bot.autobot.landscaping.getDirt(64 - dirtCount, (result) => {
				// There is the case of a flattening error for chest placement causing this.
				// If we have chest in inventory, stash. otherwise harvest tree
				if (inventoryDict['chest']) this.bot.autobot.stash.stashNonEssentialInventory();
				else this.bot.autobot.lumberjack.harvestNearestTree(32);
			});
			return;
		}
		const cobblestoneCount = inventoryDict['cobblestone'] || 0;
		if (cobblestoneCount >= 32 && this.bot.autobot.landscaping.getFloorPlateQueues()[1].length > 0) {
			this.sendFixingFloorPlate();
			this.bot.autobot.landscaping.fixStorageGridFloorPlate((result) => {
				this.bot.autobot.lumberjack.harvestNearestTree(32);
			});
			return;
		}
		if (Object.keys(inventoryDict).some(id => id.match(/_log$/))) {
			this.sendMining();
			this.bot.autobot.mining.mineBestOreVein();
		}
		else {
			this.sendLumberjack();
			this.bot.autobot.inventory.craftTools((result) => {
				this.bot.autobot.lumberjack.harvestNearestTree(32);
			});
		}
	}

	defaultPreTaskBehaviour() {
		if (this.bot.autobot.stash.checkInventoryToStash()) {
			const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
			if (!this.smeltingCheck && inventoryDict['iron_ore']) {
				this.smeltingCheck = true;
				this.sendSmelting();
				this.bot.autobot.smelting.smeltOre();
				return;
			}
			const compressList = this.bot.autobot.stash.getCompressList();
			if (compressList.length > 0) {
				this.sendCompressing(compressList);
				this.bot.autobot.stash.compressNext(compressList);
				return;
			}
			if (this.bot.autobot.stash.listUnknownStorageGridChests().length > 0) {
				this.sendCacheChests();
				this.bot.autobot.stash.fillChestMap();
				return;
			}
			this.sendStashing();
			this.bot.autobot.stash.stashNonEssentialInventory();
		}
		else {
			this.smeltingCheck = false;
			this.sendNoPreTasks();
		}
	}
	
	resetAllBehaviours(callback) {
		this.bot.autobot.autocraft.resetBehaviour();
		this.bot.autobot.collectDrops.resetBehaviour();
		//bot.autobot.getUnstuck.resetBehaviour();
		this.bot.autobot.inventory.resetBehaviour();
		this.bot.autobot.landscaping.resetBehaviour();
		this.bot.autobot.lumberjack.resetBehaviour();
		this.bot.autobot.mining.resetBehaviour();
		this.bot.autobot.navigator.resetBehaviour();
		this.bot.autobot.smelting.resetBehaviour();
		this.bot.autobot.stash.resetBehaviour();
		if (callback) callback();
	}

	sendMissingTools(missingTools) {
		const eventName = "autobot.behaviourSelect.postTask";
		let result = {
			error: false,
			resultCode: "missingTools",
			description: `Returning to cutting trees because of missing tools. ${missingTools}`,
		};
		this.bot.emit(eventName, result);
	}

	sendGettingDirt(dirtCount) {
		const eventName = "autobot.behaviourSelect.postTask";
		let result = {
			error: false,
			resultCode: "gettingDirt",
			description: `Getting dirt (${64 - dirtCount})`,
		};
		this.bot.emit(eventName, result);
	}
	
	sendMining() {
		const eventName = "autobot.behaviourSelect.postTask";
		let result = {
			error: false,
			resultCode: "mining",
			description: `Returning to mining.`,
		};
		this.bot.emit(eventName, result);
	}

	sendLumberjack() {
		const eventName = "autobot.behaviourSelect.postTask";
		let result = {
			error: false,
			resultCode: "lumberjack",
			description: `Returning to cutting trees.`,
		};
		this.bot.emit(eventName, result);
	}

	sendFixingFloorPlate() {
		const eventName = "autobot.behaviourSelect.postTask";
		let result = {
			error: false,
			resultCode: "fixingFloorPlate",
			description: `Fixing the storage grid floor plate.`,
		};
		this.bot.emit(eventName, result);
	}

	sendSmelting() {
		const eventName = "autobot.behaviourSelect.preTask";
		let result = {
			error: false,
			resultCode: "smelting",
			description: `Bot is going to smelt ore`
		};
		this.bot.emit(eventName, result);
	}

	sendCompressing(compressList) {
		const eventName = "autobot.behaviourSelect.preTask";
		let result = {
			error: false,
			resultCode: "compressing",
			description: `Bot is going to compress compressable items`,
			compressList: compressList
		};
		this.bot.emit(eventName, result);
	}

	sendCacheChests() {
		const eventName = "autobot.behaviourSelect.preTask";
		let result = {
			error: false,
			resultCode: "cacheChests",
			description: `The bot is going to cache the contents of any unknown storage grid chests.`
		};
		this.bot.emit(eventName, result);
	}

	sendStashing() {
		const eventName = "autobot.behaviourSelect.preTask";
		let result = {
			error: false,
			resultCode: "stashing",
			description: `Bot is going to stash items`
		};
		this.bot.emit(eventName, result);
	}

	sendNoPreTasks() {
		const eventName = "autobot.behaviourSelect.preTask";
		let result = {
			error: false,
			resultCode: "noPreTasks",
			description: `There are no pre-task behaviours to select.`
		};
		this.smeltingCheck = false;
		this.bot.emit(eventName, result);
	}
}

module.exports = BehaviourSelect;
