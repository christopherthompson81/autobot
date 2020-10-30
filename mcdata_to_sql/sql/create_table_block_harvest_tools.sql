CREATE TABLE block_harvest_tools (
	block_harvest_tool_id INTEGER PRIMARY KEY AUTOINCREMENT,
	block_id INTEGER REFERENCES block,
    item_id INTEGER
)
