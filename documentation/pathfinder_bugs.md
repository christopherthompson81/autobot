# Dependency Bugs - mineflayer-pathfinder
* Bot path-finds through glass, cobblestone, and crops (i.e. vandalization). A whole lot of block types should be avoided by the pathfinder
* Closed doors are non-navigable?
* Rapid cycling of held item when no good option exists in inventory. Resets breaking on target block on every change.
* Pathfinder can change what is equipped - equip after arriving at goals
* Pathfinder can stall out - Added some code to log a message to the console if a goal reached event is emitted, but the bot is nowhere near it.
* Dumb paths sometimes, not determined by travel time where breaking time is calculated:
	* Tunnelling when there's a perfectly good above-ground route.
	* Pointlessly digging one block along the path.
	* Falling
	* Sometimes drowns when goals are near water
	* Fences are treated as open
	* Gets stuck going upstream in flowing water
* Full on bug while in a village - Could not navigate to inside hut
	/Users/christhompson/Actual_Documents/Programming/autobot/node_modules/mineflayer-pathfinder/index.js:103
		if (!block || block.shapes.length === 0) return null
								^

	TypeError: Cannot read property 'length' of undefined
		at getPositionOnTopOf (/Users/christhompson/Actual_Documents/Programming/autobot/node_modules/mineflayer-pathfinder/index.js:103:32)
		at Bot.monitorMovement (/Users/christhompson/Actual_Documents/Programming/autobot/node_modules/mineflayer-pathfinder/index.js:267:27)
		at Bot.emit (events.js:198:13)
		at Timeout.doPhysics [as _onTimeout] (/Users/christhompson/Actual_Documents/Programming/autobot/node_modules/mineflayer/lib/plugins/physics.js:62:13)
		at ontimeout (timers.js:436:11)
		at tryOnTimeout (timers.js:300:5)
		at listOnTimeout (timers.js:263:5)
		at Timer.processTimers (timers.js:223:10)

I think I'm going to have to fork mineflayer-pathfinder (hopefully resulting in a PR) to get it to work properly.


* difficulty with gravel
* dry out both water and lava lakes
