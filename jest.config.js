import dotenv from "dotenv";
dotenv.config({ path: ".env.development" });

import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: ".",
});

const createConfig = async () => {
  // Resolve the full jest config that next/jest builds internally
  const nextConfig = await createJestConfig({
    moduleDirectories: ["node_modules", "<rootDir>"],
    testTimeout: 60000,
  })();

  // Override transformIgnorePatterns AFTER next/jest sets its defaults,
  // so it doesn't get silently overwritten by the createJestConfig merge.
  // This allows Jest to transform @prisma ESM (.mjs) files instead of crashing.
  return {
    ...nextConfig,
    transformIgnorePatterns: ["/node_modules/(?!(@prisma)/)"],
  };
};

export default createConfig;
