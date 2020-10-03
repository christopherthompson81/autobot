# Warehousing

The organization of items so they are easy to locate when passing control back to a player is important. The idea behind warehousing is to create a centralized location for chests to be organized that store only a single item type (or a logical grouping) and are labelled as such.

* Excessive amounts of items should result in vertical stacking of chests. 
	* Vertical stacks should not be more than 3 high with a new column in front created at that threshold.
	* A new group of chests will need to be used for an item/group if they exceed 18 full chests
* Spacing should account for:
	* Large chests being used.
	* Walking between rows
		* CCXCCXCC
		* OOXOOXOO
		* OOXOOXOO
		* XXXXXXXX
		* CCXCCXCC
		* OOXOOXOO
		* OOXOOXOO
		* XXXXXXXX
		* etc...
	* I think that floor plates should be 15 x 16 (interior usable)
	* More floors could be added and there should be a 4-block usable height on each floor
	* The roof is a valid floor
* A persistent data object should be made, written to disk, and reloaded when restarting.
	* Dictionary object by item name or item id which holds:
		* An array of blocks representing the chests
			* The item / group type
			* last known inventory
		* An explicit record for the current "to be filled" chest.