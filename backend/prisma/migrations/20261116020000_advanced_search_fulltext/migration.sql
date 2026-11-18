CREATE INDEX "books_search_fts_idx"
ON "books"
USING GIN (
  to_tsvector(
    'simple',
    coalesce("title", '') || ' ' || coalesce("subtitle", '') || ' ' || coalesce("description", '')
  )
);

CREATE INDEX "authors_search_fts_idx"
ON "authors"
USING GIN (to_tsvector('simple', coalesce("name", '')));

CREATE INDEX "publishers_search_fts_idx"
ON "publishers"
USING GIN (to_tsvector('simple', coalesce("name", '')));