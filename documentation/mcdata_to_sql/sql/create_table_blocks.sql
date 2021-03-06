CREATE TABLE blocks (
	block_id INTEGER,
    display_name TEXT,
    name TEXT,
    hardness NUMERIC,
    min_state_id INTEGER,
    max_state_id INTEGER,
    diggable BOOLEAN,
    transparent BOOLEAN,
    filter_light INTEGER,
    emit_light INTEGER,
    bounding_box TEXT,
    stack_size INTEGER,
	material TEXT,
    PRIMARY KEY("block_id")
)
