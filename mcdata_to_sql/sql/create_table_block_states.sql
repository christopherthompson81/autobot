CREATE TABLE block_states (
	block_state_id INTEGER PRIMARY KEY AUTOINCREMENT,
	block_id INTEGER REFERENCES blocks,
    name TEXT,
	type TEXT,
	values_array TEXT,
    num_values INTEGER
)
