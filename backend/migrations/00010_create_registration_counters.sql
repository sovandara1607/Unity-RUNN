-- +goose Up
CREATE TABLE registration_counters (
    year        INT PRIMARY KEY,
    last_value  INT NOT NULL DEFAULT 0
);

-- +goose Down
DROP TABLE registration_counters;
