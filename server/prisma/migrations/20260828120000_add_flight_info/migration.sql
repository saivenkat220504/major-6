-- CreateTable
CREATE TABLE IF NOT EXISTS "flight_info" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flight_number" TEXT,
    "departure_terminal" TEXT NOT NULL,
    "assigned_gate" TEXT NOT NULL,
    "seat_assignment" TEXT NOT NULL,
    "flight_date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "flight_info_flight_number_key" ON "flight_info"("flight_number");
