-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "gateId" TEXT,
ADD COLUMN     "promotedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Gate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emblemKey" TEXT NOT NULL DEFAULT 'crest',
    "primaryColor" TEXT NOT NULL DEFAULT '#7C5CFF',
    "secondaryColor" TEXT,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'open',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateMember" (
    "userId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "approvedPoster" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateMember_pkey" PRIMARY KEY ("userId","gateId")
);

-- CreateTable
CREATE TABLE "GateJoinRequest" (
    "gateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateJoinRequest_pkey" PRIMARY KEY ("gateId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gate_name_key" ON "Gate"("name");

-- CreateIndex
CREATE INDEX "Gate_createdAt_idx" ON "Gate"("createdAt");

-- CreateIndex
CREATE INDEX "GateMember_gateId_role_idx" ON "GateMember"("gateId", "role");

-- CreateIndex
CREATE INDEX "Post_gateId_createdAt_idx" ON "Post"("gateId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_promotedAt_createdAt_idx" ON "Post"("promotedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateMember" ADD CONSTRAINT "GateMember_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateMember" ADD CONSTRAINT "GateMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateJoinRequest" ADD CONSTRAINT "GateJoinRequest_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateJoinRequest" ADD CONSTRAINT "GateJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
