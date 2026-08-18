-- CreateTable
CREATE TABLE IF NOT EXISTS "PersonalGuardian" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL DEFAULT '',
    "guardianVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GuardianOtp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GuardianEmailConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "smtpUser" TEXT NOT NULL,
    "smtpAppPassword" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PersonalGuardian_userId_guardianEmail_key" ON "PersonalGuardian"("userId", "guardianEmail");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GuardianEmailConfig_userId_guardianEmail_key" ON "GuardianEmailConfig"("userId", "guardianEmail");
