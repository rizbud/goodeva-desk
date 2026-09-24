-- CreateIndex
CREATE INDEX "idx_ticket_organization_id" ON "Ticket"("organization_id");

-- CreateIndex
CREATE INDEX "idx_ticket_organization_id_status" ON "Ticket"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_ticket_organization_id_category" ON "Ticket"("organization_id", "category");
