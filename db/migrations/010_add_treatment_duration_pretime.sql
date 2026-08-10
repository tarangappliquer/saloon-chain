-- Migration 010: Treatment pre-time (arrival buffer), effective-dated alongside duration.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TreatmentDurations') AND name = 'PreTimeMinutes'
)
BEGIN
    ALTER TABLE dbo.TreatmentDurations ADD PreTimeMinutes SMALLINT NOT NULL DEFAULT 0 CHECK (PreTimeMinutes >= 0);
END
GO
