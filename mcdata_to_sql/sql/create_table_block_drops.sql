CREATE TABLE block_drops (
	block_drop_id INTEGER PRIMARY KEY AUTOINCREMENT,
	block_id INTEGER REFERENCES block,
    item_id INTEGER
)
