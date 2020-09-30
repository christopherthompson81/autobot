var mineflayer = require('mineflayer');
var navigatePlugin = require('mineflayer-navigate')(mineflayer);
var scaffoldPlugin = require('mineflayer-scaffold')(mineflayer);
var blockFinderPlugin = require('mineflayer-blockfinder')(mineflayer);

var vec3 = require('vec3');
var Dutie = require('dutie');
var Task = Dutie.Task,
	CallTask = Dutie.CallTask,
	RunTask = Dutie.RunTask,
	ExecTask = Dutie.ExecTask;

var main = new Dutie();

/*if(process.argv.length<3 || process.argv.length>5)
{
    console.log("Usage : node dudieflayer.js <host> <port> [<name>] [<password>]");
    process.exit(1);
}*/

//bot.on('spawn', function() { console.log(bot.inventory) });

/*var bot = mineflayer.createBot({
	username: process.argv[4] ? process.argv[4] : "Duter",
	verbose: true,
	port:parseInt(process.argv[3]),
	host:process.argv[2],
	password:process.argv[5]
});*/


var activeTree = [];
var path = [];

//bot.on('chat', chatMessage);

function chatMessage(username, message) {
	if (message == 'lumberjack') {
		getWood(32, bot);
	}
}

function getWood(amt, bt) {
	bot = bt;
	navigatePlugin(bot);
	blockFinderPlugin(bot);
	scaffoldPlugin(bot);
	
	var wood = bot.inventory.findInventoryItem(17, null);
	if (wood && wood.count >= amt) {
		console.log('enough wood', wood, amt);
		return new RunTask(function() {});
	}
	
	var lumberjack = new RunTask(treeFinder, [amt], { priority: 5, actPriority: 8, check: lumberCheck});
	return lumberjack;
	//main.add(lumberjack);
}



function treeFinder(lumberDutie, amt) {
	var wood = bot.inventory.findInventoryItem(17, null);
	if (wood && wood.count >= amt) return;
	
	var findTreeTask = new CallTask(bot.findBlock, [ { // Find tree task. Sets activeTree to the tree it finds
		matching: 17,
		maxDistance: 64,
		count: 50,
		point: bot.entity.position
	} ], {complete: function(err, blockPoints) {
		for (var i = 0; i < blockPoints.length; i++) {
			var tree = findTree(blockPoints[i].position);
			if (tree) {
				activeTree = tree;
				cutTree(lumberDutie, amt);
				return;
			}
		}
		lumberDutie.tasks = [];
	}});
	lumberDutie.add(findTreeTask);
}

function cutTree(lumberDutie, amt) {
	var goToTree = new CallTask(bot.scaffold.to, [activeTree[0].position]);
	lumberDutie.add(goToTree);
	
	for (var i = 0; i < activeTree.length; i++) {
		var block = activeTree[i];
		var lookAt = new ExecTask(bot.lookAt, [block.position, true]);
		var mineBlock = new CallTask(bot.dig, [block], { cancel: bot.stopDigging, start: function() {
			return block.name == 'air';
		}, complete: function() {
			if (lumberDutie.tasks.length == 0) {
				lumberDutie.add(new CallTask(setTimeout, [null, 1000], {location: 0, complete: treeFinder, completeParams: [lumberDutie, amt]}));
			}
		}});
		lumberDutie.addAll(mineBlock.dependOn(lookAt));
	}
}



function lumberCheck() {
	console.log('equip');
	var axe = null;
	var axeList = [279, 258, 275, 271];
	for (var i = 0; i < axeList.length; i++) {
		axe = bot.inventory.findInventoryItem(axeList[i], null);
		if (axe) break;
	}
	if (!axe) {
		console.log('none :(');
		return true;
	} else {
		bot.equip(axe, 'hand', function(err) {
			if (err) console.log(err.stack);
			else bot.hand = axe;
		});
		console.log(axe);
		return true;
	}
}

function findTree(p) {
	var point = p.clone();
	var oldY = p.y;
	var bottom;
	var top;
	while (!bottom) {
		point.subtract(vec3(0, 1, 0));
		var block = bot.blockAt(point);
		if (block.name != 'log') {
			if (block.name == 'dirt') bottom = point.clone().add(vec3(0, 1, 0));
			else return false;
		}
	}
	point.y = oldY;
	while (!top) {
		point.add(vec3(0, 1, 0));
		var block = bot.blockAt(point);
		if (block.name != 'log') {
			if (block.name == 'leaves') top = point.clone().subtract(vec3(0, 1, 0));
			else return false;
		}
	}
	var sides = [vec3(1, 0, 0), vec3(-1, 0, 0), vec3(0, 0, 1), vec3(0, 0, -1)];
	for (var s = 0; s < sides.length; s++) {
		point = top.clone().add(sides[s]);
		if (bot.blockAt(point).name != 'leaves') return false;
	}
	
	
	var tree = Array();
	for (var i = bottom.y; i <= top.y; i++) {
		var block = bot.blockAt(vec3(bottom.x, i, bottom.z));
		tree.push(block);
	}
	return tree;
}

module.exports = getWood;