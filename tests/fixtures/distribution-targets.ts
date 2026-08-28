import { GameArchitecture, GamePlatform } from "generated/prisma/client";

export const distributionTargets = [
  { platform: GamePlatform.WINDOWS, architecture: GameArchitecture.X86_64 },
  { platform: GamePlatform.WINDOWS, architecture: GameArchitecture.AARCH64 },
  { platform: GamePlatform.MAC, architecture: GameArchitecture.X86_64 },
  { platform: GamePlatform.MAC, architecture: GameArchitecture.AARCH64 },
  { platform: GamePlatform.LINUX, architecture: GameArchitecture.X86_64 },
  { platform: GamePlatform.LINUX, architecture: GameArchitecture.AARCH64 },
] as const;
