import { beforeAll, afterAll } from "vitest";

const originalEnv = { ...process.env };

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

afterAll(() => {
  Object.assign(process.env, originalEnv);
});
