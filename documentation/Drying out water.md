Pathfinder should emit an event just before entering water.

To handle drying out, the event should trigger a dry out behaviour function

The dry out function should:
* stop the pathfinder from progressing to the goal.
* retrieve the volume of the body of water as an array (limit 1000 blocks);
* Record surfaceY as maxY
* check bucket-use viability
	* No blocks with >=3 sides having water in the water body)
	* have water bucket or empty bucket
		* Use a bucket if viable
* assess materials in inventory that can be used to fill in the water.
* [stretch goal] Use a sponge (the bot is very unlikely to have this)
* Prefer gravity materials and drop them from the edge and fill to surface height
	* Make a variant of "placeBlockQueue" for the purposes of using gravity blocks.
	* Sort the array so as to fill from near edge XZ to far edge XZ
* If no gravity materials then try to fill by placing blocks on the bottom of the body of water
	* Give up if >=10 (going to 9 may already be too much) deep
	* Use "diving" to get down.
	* If you run out of air, go up and wait
	* If you run out of materials, give up.
* If giving up
	* The give-up rationale should be noted.
	* If the body is too deep, mark the goal as a bad target.
	* If we ran out of materials, use post-stashing behaviour. The bot should choose to get more scaffolding blocks (dirt)