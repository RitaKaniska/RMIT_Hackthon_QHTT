import { defaultDatabasePath, openRepository } from "./repository.mjs";

const path = defaultDatabasePath(process.env);
const repository = openRepository(path);
try {
  repository.check();
  console.log(`[embargo-migrate] database ready at ${path}`);
} finally {
  repository.close();
}
