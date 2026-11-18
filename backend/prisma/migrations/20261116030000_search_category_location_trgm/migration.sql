CREATE INDEX "categories_normalizedName_trgm_idx"
ON "categories" USING GIN ("normalizedName" gin_trgm_ops);

CREATE INDEX "shelves_code_trgm_idx"
ON "shelves" USING GIN ("code" gin_trgm_ops);

CREATE INDEX "racks_code_trgm_idx"
ON "racks" USING GIN ("code" gin_trgm_ops);