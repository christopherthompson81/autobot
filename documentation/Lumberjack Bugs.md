# Lumberjack Bugs
* Tree portions that are too high result in the bot swinging uselessly at an out-of-reach block (but bot moves on gracefully)

# Dependency Bugs - mineflayer-pathfinder
* Bot path-finds through glass, cobblestone, and crops (i.e. vandalization). A whole lot of block types should be avoided by the pathfinder
* Closed doors are non-navigable?
* Pathfinder can change what is equipped - equip after arriving at goals
* Pathfinder can stall out - Added some code to log a message to the console if a goal reached event is emitted, but the bot is nowhere near it.
* Dumb paths sometimes, not determined by travel time where breaking time is calculated:
	* Tunnelling when there's a perfectly good above-ground route.
	* Pointlessly digging one block along the path.
	* Falling
	* Sometimes drowns when goals are near water
	* Fences are treated as open
	* Gets stuck going upstream in flowing water