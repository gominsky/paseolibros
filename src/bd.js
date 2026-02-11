// src/bd.js
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const isRender = (process.env.RENDER || "").toLowerCase() === "true";
const needsSsl =
  String(process.env.PGSSL || "").toLowerCase() === "true" ||
  (process.env.DATABASE_URL || "").includes("render.com") ||
  isRender;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

export default pool;
