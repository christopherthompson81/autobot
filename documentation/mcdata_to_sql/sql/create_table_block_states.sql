CREATE TABLE block_states (
	block_state_id INTEGER,
	block_id INTEGER,
    name TEXT,
	type TEXT,
	values_array TEXT,
    num_values INTEGER,
	PRIMARY KEY("block_state_id" AUTOINCREMENT),
	FOREIGN KEY("block_id") REFERENCES "blocks"("block_id")
)
