-- CreateTable
CREATE TABLE "conversation_user_states" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "clearedAt" TIMESTAMP(3),
  "lastReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "conversation_user_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_visibility" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_visibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_user_states_conversationId_userId_key" ON "conversation_user_states"("conversationId", "userId");
CREATE INDEX "conversation_user_states_userId_hidden_idx" ON "conversation_user_states"("userId", "hidden");

CREATE UNIQUE INDEX "message_visibility_messageId_userId_key" ON "message_visibility"("messageId", "userId");
CREATE INDEX "message_visibility_userId_hiddenAt_idx" ON "message_visibility"("userId", "hiddenAt");

-- AddForeignKey
ALTER TABLE "conversation_user_states" ADD CONSTRAINT "conversation_user_states_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_user_states" ADD CONSTRAINT "conversation_user_states_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_visibility" ADD CONSTRAINT "message_visibility_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_visibility" ADD CONSTRAINT "message_visibility_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
