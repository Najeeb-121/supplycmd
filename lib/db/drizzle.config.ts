import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // drizzle-kit resolves this path as a glob internally, and glob libraries
  // treat `\` as an escape character — path.join() on Windows produces
  // backslash-separated paths, which breaks resolution there ("No schema
  // files found") even though the file exists. Forward slashes work on
  // every platform, so normalize to those.
  schema: path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
