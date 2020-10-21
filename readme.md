# Autobot

Autobot is intended to be a Minecraft player simulator. It is functionally an ore mining bot that can solve crafting for axes and pickaxes (cuts down trees as needed) and will self-equip with appropriate tools.

Autobot currently only implements the following behaviours:

* Autonomous crafting including locating or crafting a crafting table
* Locating and cutting down trees
* Locating and mining ore veins
	* Prioritizing by desirability or closeness
* Collecting nearby drops on the ground
* Stashing excess items by crafting and placing a chest
	* Item Compression (coal to coal_block)
* Ore Smelting with a furnace (restoke fuel, deposit inputs, collect outputs)
* Picking the right tool for the current task

The Intended development roadmap (in chronological order) is:

* Warehouse building and organization
	* label chests (with signs probably)
* Bootstrapping type activities
* Check the documentation folder for ideas I have

## Running

### Server:
* Vanilla - Tested using Client/Server 1.16.3
* Set online mode to false

To launch the server, use:

	java -Xms2G -Xmx2G -jar server.jar

### Client

Edit the config file as needed

	npm install
	node index.js