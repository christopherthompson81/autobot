CREATE TABLE block_harvest_tools (
	block_harvest_tool_id INTEGER,
	block_id INTEGER,
    item_id INTEGER,
	PRIMARY KEY("block_harvest_tool_id" AUTOINCREMENT),
	FOREIGN KEY("block_id") REFERENCES "blocks"("block_id"),
	FOREIGN KEY("item_id") REFERENCES "items"("item_id")
)
