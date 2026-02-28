import dotenv from "dotenv";
dotenv.config({ path: ".env.development" });

import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: ".",
});

const jestConfig = createJestConfig({
  moduleDirectories: ["node_modules", "<rootDir>"],
  testTimeout: 60000,
});

export default jestConfig;
