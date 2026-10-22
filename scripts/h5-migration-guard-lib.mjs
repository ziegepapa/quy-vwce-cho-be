/**
 * Pure validation rules for Supabase's ordered migration chain.
 * Kept separate so negative cases can be tested without editing real migrations.
 */
export function normalizeReviewedBaseline(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .filter((line) => !/^\s*drop policy if exists\b/i.test(line))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateMigrationSet(files, readText, reviewedSchema) {
  const ordered = [...files].sort();
  if (!ordered.length) throw new Error("no migration files");

  const nums = [];
  for (const file of ordered) {
    const match = /^(\d{3})_/.exec(file);
    if (!match) throw new Error("unnumbered migration file: " + file);
    nums.push(Number(match[1]));
  }

  if (new Set(nums).size !== nums.length) {
    throw new Error("duplicate migration numbers");
  }
  if (nums[0] !== 1) {
    throw new Error("baseline must start at 001; got " + String(nums[0]).padStart(3, "0"));
  }
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) {
      throw new Error("gap or disorder at index " + i + ": expected " + (i + 1) + ", got " + nums[i]);
    }
  }
  if (ordered[0] !== "001_baseline_schema.sql") {
    throw new Error("001_baseline_schema.sql must be the first reviewed baseline");
  }

  if (normalizeReviewedBaseline(reviewedSchema) !== normalizeReviewedBaseline(readText(ordered[0]))) {
    throw new Error("001 baseline differs from supabase/schema.sql beyond comments/idempotent policy drops");
  }

  const fileSet = new Set(ordered);
  const numericByFile = new Map(ordered.map((file, index) => [file, nums[index]]));
  for (let i = 0; i < ordered.length; i++) {
    const file = ordered[i];
    const sql = readText(file);
    const declarations = [...sql.matchAll(/^\s*--\s*Depends-On:\s*(.*?)\s*$/gim)];
    if (declarations.length !== 1) {
      throw new Error("dependency declaration must appear exactly once in " + file);
    }

    const raw = declarations[0][1].trim();
    if (i === 0) {
      if (raw.toLowerCase() !== "none") {
        throw new Error("001 baseline must declare 'Depends-On: none'");
      }
      continue;
    }
    if (!raw || raw.toLowerCase() === "none") {
      throw new Error("migration dependency is undeclared in " + file);
    }

    const dependencies = raw.split(",").map((value) => value.trim()).filter(Boolean);
    if (!dependencies.length || new Set(dependencies).size !== dependencies.length) {
      throw new Error("invalid or duplicate dependencies in " + file);
    }
    for (const dependency of dependencies) {
      if (!/^\d{3}_[A-Za-z0-9_.-]+\.sql$/.test(dependency) || !fileSet.has(dependency)) {
        throw new Error("unknown dependency " + dependency + " declared by " + file);
      }
      if (numericByFile.get(dependency) >= nums[i]) {
        throw new Error("migration dependency must precede " + file + ": " + dependency);
      }
    }
    if (!dependencies.includes(ordered[i - 1])) {
      throw new Error("migration must explicitly depend on preceding migration " + ordered[i - 1] + ": " + file);
    }
  }

  return {
    files: ordered,
    message: "reviewed baseline equivalence, contiguous migration order, and explicit dependency chain verified",
  };
}
