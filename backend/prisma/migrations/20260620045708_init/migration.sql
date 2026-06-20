-- CreateTable
CREATE TABLE "discussions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "expertCount" INTEGER NOT NULL DEFAULT 4,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discussionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EXPERT',
    "occupation" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stance" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "runStatus" TEXT NOT NULL DEFAULT 'IDLE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "guests_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "discussions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "speeches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discussionId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "speechType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "speeches_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "discussions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "speeches_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "consensus_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discussionId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "relatedSpeechIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "consensus_records_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "discussions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "guests_discussionId_idx" ON "guests"("discussionId");

-- CreateIndex
CREATE INDEX "speeches_discussionId_idx" ON "speeches"("discussionId");

-- CreateIndex
CREATE INDEX "speeches_guestId_idx" ON "speeches"("guestId");

-- CreateIndex
CREATE INDEX "speeches_discussionId_sequence_idx" ON "speeches"("discussionId", "sequence");

-- CreateIndex
CREATE INDEX "consensus_records_discussionId_idx" ON "consensus_records"("discussionId");

-- CreateIndex
CREATE INDEX "consensus_records_discussionId_recordType_idx" ON "consensus_records"("discussionId", "recordType");
