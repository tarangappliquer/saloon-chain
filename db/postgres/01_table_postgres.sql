-- PostgreSQL Schema Creation Script for SaloonChains (Explicit public. schema)
-- Already Postgres 18+ compatible (GENERATED ALWAYS AS IDENTITY, BOOLEAN, TIMESTAMPTZ,
-- generated/stored columns) -- copied through unchanged from db/01_tables.sql.
SET search_path TO public;

CREATE TABLE public.SaloonChains (
    Id                       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name                     VARCHAR(200) NOT NULL,
    BreakStartTime           TIME NULL,
    BreakEndTime             TIME NULL,
    StaffEarlyArrivalMinutes INT NOT NULL DEFAULT 30,
    IsDelete                 BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive                 BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy                INT NULL,
    CreatedDate              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy                INT NULL,
    UpdatedDate              TIMESTAMPTZ NULL
);

CREATE TABLE public.Locations (
    Id                       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ChainId                  INT NOT NULL REFERENCES public.SaloonChains(Id),
    Name                     VARCHAR(200) NOT NULL,
    Address                  VARCHAR(400) NULL,
    Latitude                 NUMERIC(9,6) NULL,
    Longitude                NUMERIC(9,6) NULL,
    OpenTime                 TIME NOT NULL,
    CloseTime                TIME NOT NULL,
    BreakStartTime           TIME NULL,
    BreakEndTime             TIME NULL,
    WorkingDaysMask          SMALLINT NOT NULL,
    TimeZoneId               VARCHAR(100) NOT NULL DEFAULT 'UTC',
    StaffEarlyArrivalMinutes INT NULL,
    IsDelete                 BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive                 BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy                INT NULL,
    CreatedDate              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy                INT NULL,
    UpdatedDate              TIMESTAMPTZ NULL
);
CREATE INDEX SIX_Locations_Coordinates ON public.Locations(Latitude, Longitude);

CREATE TABLE public.LocationHolidays (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES public.Locations(Id),
    HolidayDate  DATE NOT NULL,
    Reason       VARCHAR(200) NULL,
    Type         VARCHAR(20) NOT NULL DEFAULT 'Holiday',
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL,
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL,
    UpdatedDate  TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX UQ_LocationHolidays_Location_Date ON public.LocationHolidays(LocationId, HolidayDate) WHERE IsDelete = FALSE;

CREATE TABLE public.LocationDaySchedule (
    Id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId     INT NOT NULL REFERENCES public.Locations(Id),
    DayBit         SMALLINT NOT NULL CHECK (DayBit IN (1, 2, 4, 8, 16, 32, 64)),
    OpenTime       TIME NULL,
    CloseTime      TIME NULL,
    IsClosed       BOOLEAN NOT NULL DEFAULT FALSE,
    EffectiveFrom  DATE NOT NULL,
    EffectiveTo    DATE NULL,
    IsDelete       BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy      INT NULL,
    CreatedDate    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy      INT NULL,
    UpdatedDate    TIMESTAMPTZ NULL,
    CONSTRAINT CK_LocationDaySchedule_Times CHECK (IsClosed = TRUE OR (OpenTime IS NOT NULL AND CloseTime IS NOT NULL AND CloseTime > OpenTime)),
    CONSTRAINT CK_LocationDaySchedule_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
CREATE INDEX IX_LocationDaySchedule_Location_Day_EffectiveFrom ON public.LocationDaySchedule(LocationId, DayBit, EffectiveFrom DESC);
CREATE UNIQUE INDEX UQ_LocationDaySchedule_Location_Day_EffectiveFrom ON public.LocationDaySchedule(LocationId, DayBit, EffectiveFrom) WHERE IsDelete = FALSE;

CREATE TABLE public.Rooms (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES public.Locations(Id),
    Name         VARCHAR(100) NOT NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL,
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL,
    UpdatedDate  TIMESTAMPTZ NULL
);

CREATE TABLE public.TreatmentCategories (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES public.Locations(Id),
    Name         VARCHAR(200) NOT NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL,
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL,
    UpdatedDate  TIMESTAMPTZ NULL
);
CREATE INDEX IX_TreatmentCategories_LocationId ON public.TreatmentCategories(LocationId) WHERE IsDelete = FALSE;

CREATE TABLE public.Treatments (
    Id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId     INT NOT NULL REFERENCES public.Locations(Id),
    CategoryId     INT NOT NULL REFERENCES public.TreatmentCategories(Id),
    Name           VARCHAR(200) NOT NULL,
    Description    VARCHAR(2000) NULL,
    EffectiveFrom  DATE NOT NULL DEFAULT CURRENT_DATE,
    IsDelete       BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive       BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy      INT NULL,
    CreatedDate    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy      INT NULL,
    UpdatedDate    TIMESTAMPTZ NULL
);
CREATE INDEX IX_Treatments_LocationId ON public.Treatments(LocationId) WHERE IsDelete = FALSE;

CREATE TABLE public.TreatmentPrices (
    Id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    TreatmentId    INT NOT NULL REFERENCES public.Treatments(Id),
    Price          NUMERIC(10,2) NOT NULL,
    EffectiveFrom  DATE NOT NULL,
    EffectiveTo    DATE NULL,
    IsDelete       BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy      INT NULL,
    CreatedDate    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy      INT NULL,
    UpdatedDate    TIMESTAMPTZ NULL,
    CONSTRAINT CK_TreatmentPrices_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
CREATE INDEX IX_TreatmentPrices_TreatmentId_EffectiveFrom ON public.TreatmentPrices(TreatmentId, EffectiveFrom DESC);
CREATE UNIQUE INDEX UQ_TreatmentPrices_Treatment_EffectiveFrom ON public.TreatmentPrices(TreatmentId, EffectiveFrom) WHERE IsDelete = FALSE;

CREATE TABLE public.TreatmentDurations (
    Id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    TreatmentId    INT NOT NULL REFERENCES public.Treatments(Id),
    DurationSlots  SMALLINT NOT NULL CHECK (DurationSlots > 0),
    PreTimeMinutes SMALLINT NOT NULL DEFAULT 0 CHECK (PreTimeMinutes >= 0),
    EffectiveFrom  DATE NOT NULL,
    EffectiveTo    DATE NULL,
    IsDelete       BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy      INT NULL,
    CreatedDate    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy      INT NULL,
    UpdatedDate    TIMESTAMPTZ NULL,
    CONSTRAINT CK_TreatmentDurations_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
CREATE INDEX IX_TreatmentDurations_TreatmentId_EffectiveFrom ON public.TreatmentDurations(TreatmentId, EffectiveFrom DESC);
CREATE UNIQUE INDEX UQ_TreatmentDurations_Treatment_EffectiveFrom ON public.TreatmentDurations(TreatmentId, EffectiveFrom) WHERE IsDelete = FALSE;

CREATE TABLE public.TherapistProfile (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name         VARCHAR(200) NOT NULL,
    ChainId      INT NULL REFERENCES public.SaloonChains(Id),
    LocationId   INT NULL REFERENCES public.Locations(Id),
    UserId       INT NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL,
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL,
    UpdatedDate  TIMESTAMPTZ NULL
);

CREATE TABLE public.Users (
    Id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name             VARCHAR(200)   NOT NULL,
    Email            VARCHAR(256)   NOT NULL UNIQUE,
    PasswordHash     BYTEA          NOT NULL,
    PasswordSalt     BYTEA          NOT NULL,
    Phone            VARCHAR(30)    NULL,
    ProfilePhoto     VARCHAR(500)   NULL,
    Role             VARCHAR(20)    NOT NULL DEFAULT 'Customer'
                     CHECK (Role IN ('RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other', 'Customer')),
    ChainId          INT NULL REFERENCES public.SaloonChains(Id),
    LocationId       INT NULL REFERENCES public.Locations(Id),
    TherapistId      INT NULL REFERENCES public.TherapistProfile(Id),
    JoiningDate      DATE NULL,
    IsCustomer       BOOLEAN GENERATED ALWAYS AS (Role = 'Customer') STORED,
    IsEmulator       BOOLEAN NOT NULL DEFAULT FALSE,
    IsWalkIn         BOOLEAN NOT NULL DEFAULT FALSE,
    StripeCustomerId VARCHAR(200) NULL,
    IsEmailVerified  BOOLEAN NOT NULL DEFAULT FALSE,
    IsDelete         BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive         BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy        INT NULL REFERENCES public.Users(Id),
    CreatedDate      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy        INT NULL REFERENCES public.Users(Id),
    UpdatedDate      TIMESTAMPTZ NULL
);

CREATE TABLE public.RefreshTokens (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    UserId       INT NOT NULL REFERENCES public.Users(Id),
    TokenHash    BYTEA NOT NULL UNIQUE,
    ExpiresAt    TIMESTAMPTZ NOT NULL,
    RevokedDate  TIMESTAMPTZ NULL,
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IX_RefreshTokens_UserId ON public.RefreshTokens(UserId);

CREATE TABLE public.PasswordResetTokens (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    UserId       INT NOT NULL REFERENCES public.Users(Id),
    TokenHash    BYTEA NOT NULL UNIQUE,
    ExpiresAt    TIMESTAMPTZ NOT NULL,
    ResetDate    TIMESTAMPTZ NULL,
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IX_PasswordResetTokens_UserId ON public.PasswordResetTokens(UserId);

CREATE TABLE public.EmailChangeTokens (
    Id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    UserId        INT NOT NULL REFERENCES public.Users(Id),
    NewEmail      VARCHAR(256) NOT NULL,
    TokenHash     BYTEA NOT NULL UNIQUE,
    ExpiresAt     TIMESTAMPTZ NOT NULL,
    ConfirmedDate TIMESTAMPTZ NULL,
    CreatedDate   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IX_EmailChangeTokens_UserId ON public.EmailChangeTokens(UserId);

ALTER TABLE public.SaloonChains ADD CONSTRAINT FK_SaloonChains_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.SaloonChains ADD CONSTRAINT FK_SaloonChains_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.Locations ADD CONSTRAINT FK_Locations_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.Locations ADD CONSTRAINT FK_Locations_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.LocationHolidays ADD CONSTRAINT FK_LocationHolidays_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.LocationHolidays ADD CONSTRAINT FK_LocationHolidays_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.Rooms ADD CONSTRAINT FK_Rooms_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.Rooms ADD CONSTRAINT FK_Rooms_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.TreatmentCategories ADD CONSTRAINT FK_TreatmentCategories_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.TreatmentCategories ADD CONSTRAINT FK_TreatmentCategories_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.Treatments ADD CONSTRAINT FK_Treatments_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.Treatments ADD CONSTRAINT FK_Treatments_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.TherapistProfile ADD CONSTRAINT FK_TherapistProfile_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.TherapistProfile ADD CONSTRAINT FK_TherapistProfile_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES public.Users(Id);
ALTER TABLE public.TherapistProfile ADD CONSTRAINT FK_TherapistProfile_User FOREIGN KEY (UserId) REFERENCES public.Users(Id);

CREATE TABLE public.ShiftAssignments (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES public.Locations(Id),
    TherapistId  INT NOT NULL REFERENCES public.TherapistProfile(Id),
    RoomId       INT NULL REFERENCES public.Rooms(Id),
    ShiftType    VARCHAR(10) NOT NULL CHECK (ShiftType IN ('Morning','Evening')),
    WorkDate     DATE NOT NULL,
    StartTime    TIME NOT NULL,
    EndTime      TIME NOT NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL
);
CREATE INDEX IX_ShiftAssignments_Location_Date ON public.ShiftAssignments(LocationId, WorkDate);
CREATE UNIQUE INDEX UQ_ShiftAssignments_Therapist_Shift_Date_Start
    ON public.ShiftAssignments(LocationId, TherapistId, ShiftType, WorkDate, StartTime) WHERE IsDelete = FALSE;

CREATE TABLE public.RoomCategoryAssignments (
    Id                   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    RoomId               INT NOT NULL REFERENCES public.Rooms(Id),
    TreatmentCategoryId  INT NOT NULL REFERENCES public.TreatmentCategories(Id),
    ShiftType            VARCHAR(10) NOT NULL CHECK (ShiftType IN ('Morning','Evening')),
    WorkDate             DATE NOT NULL,
    IsDelete             BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive             BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy            INT NULL REFERENCES public.Users(Id),
    CreatedDate          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy            INT NULL REFERENCES public.Users(Id),
    UpdatedDate          TIMESTAMPTZ NULL
);
CREATE INDEX IX_RoomCategoryAssignments_Room_Date ON public.RoomCategoryAssignments(RoomId, WorkDate);
CREATE UNIQUE INDEX UQ_RoomCategoryAssignments_Room_Shift_Date
    ON public.RoomCategoryAssignments(RoomId, ShiftType, WorkDate) WHERE IsDelete = FALSE;

CREATE TABLE public.BlockTypes (
    Id                     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name                   VARCHAR(100) NOT NULL,
    ChainId                INT NULL REFERENCES public.SaloonChains(Id),
    LocationId             INT NULL REFERENCES public.Locations(Id),
    IsPaid                 BOOLEAN NOT NULL DEFAULT FALSE,
    DefaultDurationMinutes INT NOT NULL DEFAULT 30,
    ColorHex               VARCHAR(10) NOT NULL DEFAULT '#F59E0B',
    IsActive               BOOLEAN NOT NULL DEFAULT TRUE,
    IsDelete               BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy              INT NULL REFERENCES public.Users(Id),
    CreatedDate            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy              INT NULL REFERENCES public.Users(Id),
    UpdatedDate            TIMESTAMPTZ NULL,
    CONSTRAINT CK_BlockTypes_Scope CHECK (
        (ChainId IS NULL AND LocationId IS NULL) OR
        (ChainId IS NOT NULL AND LocationId IS NULL) OR
        (LocationId IS NOT NULL)
    )
);
CREATE INDEX IX_BlockTypes_Chain ON public.BlockTypes(ChainId) WHERE IsDelete = FALSE;
CREATE INDEX IX_BlockTypes_Location ON public.BlockTypes(LocationId) WHERE IsDelete = FALSE;

CREATE TABLE public.BlockedSlots (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    RoomId       INT NOT NULL REFERENCES public.Rooms(Id),
    BlockTypeId  INT NULL REFERENCES public.BlockTypes(Id),
    WorkDate     DATE NOT NULL,
    StartTime    TIME NOT NULL,
    EndTime      TIME NOT NULL,
    Reason       VARCHAR(200) NOT NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL
);
CREATE INDEX IX_BlockedSlots_Room_Date ON public.BlockedSlots(RoomId, WorkDate) WHERE IsDelete = FALSE;

CREATE TABLE public.AppointmentStatuses (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name         VARCHAR(50) NOT NULL,
    ChainId      INT NULL REFERENCES public.SaloonChains(Id),
    LocationId   INT NULL REFERENCES public.Locations(Id),
    ColorHex     VARCHAR(10) NOT NULL DEFAULT '#3B82F6',
    SortOrder    SMALLINT NOT NULL DEFAULT 0,
    IsSystem     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL,
    CONSTRAINT CK_AppointmentStatuses_Scope CHECK (
        (ChainId IS NULL AND LocationId IS NULL) OR
        (ChainId IS NOT NULL AND LocationId IS NULL) OR
        (LocationId IS NOT NULL)
    )
);
CREATE INDEX IX_AppointmentStatuses_Chain ON public.AppointmentStatuses(ChainId) WHERE IsDelete = FALSE;
CREATE INDEX IX_AppointmentStatuses_Location ON public.AppointmentStatuses(LocationId) WHERE IsDelete = FALSE;

INSERT INTO public.AppointmentStatuses (Name, ChainId, LocationId, ColorHex, SortOrder, IsSystem)
VALUES
    ('Arrived', NULL, NULL, '#8B5CF6', -32768, TRUE),
    ('Complete', NULL, NULL, '#10B981', 32767, TRUE);

CREATE TABLE public.CancelReasons (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Name         VARCHAR(200) NOT NULL,
    SortOrder    SMALLINT NOT NULL DEFAULT 0,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL
);
INSERT INTO public.CancelReasons (Name, SortOrder) VALUES
    ('No Reason Provided', 0),
    ('Duplicate appointment', 1),
    ('Appointment made by mistake', 2),
    ('Client not available', 3);

CREATE TABLE public.Bookings (
    Id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId          INT NOT NULL REFERENCES public.Locations(Id),
    CustomerId          INT NOT NULL REFERENCES public.Users(Id),
    Status              VARCHAR(10) NOT NULL CHECK (Status IN ('Draft','Confirmed','Cancelled','NoShow')),
    IsCancelled         BOOLEAN GENERATED ALWAYS AS (Status = 'Cancelled') STORED,
    IsNoShow            BOOLEAN GENERATED ALWAYS AS (Status = 'NoShow') STORED,
    AppointmentStatusId INT NULL REFERENCES public.AppointmentStatuses(Id),
    CancelReasonId      INT NULL REFERENCES public.CancelReasons(Id),
    RowVersion          BYTEA NULL,
    IsDelete            BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive            BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy           INT NULL REFERENCES public.Users(Id),
    CreatedDate         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy           INT NULL REFERENCES public.Users(Id),
    UpdatedDate         TIMESTAMPTZ NULL
);
CREATE INDEX IX_Bookings_CustomerId ON public.Bookings(CustomerId);
CREATE INDEX IX_Bookings_LocationId ON public.Bookings(LocationId, Status, CreatedDate) WHERE IsDelete = FALSE;
CREATE INDEX IX_Bookings_CreatedDate ON public.Bookings(CreatedDate, LocationId, CustomerId, Status) WHERE IsDelete = FALSE;

CREATE TABLE public.BookingTreatments (
    Id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    BookingId           INT NOT NULL REFERENCES public.Bookings(Id) ON DELETE CASCADE,
    TreatmentId         INT NOT NULL REFERENCES public.Treatments(Id),
    RoomId              INT NULL REFERENCES public.Rooms(Id),
    TherapistId         INT NULL REFERENCES public.TherapistProfile(Id),
    StartTime           TIMESTAMPTZ NULL,
    EndTime             TIMESTAMPTZ NULL,
    ExpiresAt           TIMESTAMPTZ NULL,
    SequenceOrder       SMALLINT NOT NULL,
    SlotCount           SMALLINT NOT NULL,
    Price               NUMERIC(10,2) NOT NULL,
    TreatmentPriceId    INT NULL REFERENCES public.TreatmentPrices(Id),
    TreatmentDurationId INT NULL REFERENCES public.TreatmentDurations(Id),
    ProxyTherapistId    INT NULL REFERENCES public.Users(Id),
    IsDelete            BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive            BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy           INT NULL REFERENCES public.Users(Id),
    CreatedDate         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy           INT NULL REFERENCES public.Users(Id),
    UpdatedDate         TIMESTAMPTZ NULL
);
CREATE INDEX IX_BookingTreatments_BookingId ON public.BookingTreatments(BookingId);
CREATE INDEX IX_BookingTreatments_RoomId_StartTime ON public.BookingTreatments(RoomId, StartTime, EndTime, ExpiresAt);
CREATE INDEX IX_BookingTreatments_TherapistId_StartTime ON public.BookingTreatments(TherapistId, StartTime, EndTime, ExpiresAt);
CREATE INDEX IX_BookingTreatments_StartTime ON public.BookingTreatments(StartTime, BookingId, EndTime, Price) WHERE IsDelete = FALSE;

CREATE TABLE public.StaffAttendance (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES public.Locations(Id),
    UserId       INT NOT NULL REFERENCES public.Users(Id),
    WorkDate     DATE NOT NULL,
    ArrivalTime  TIME NULL,
    LeftTime     TIME NULL,
    CreatedBy    INT NOT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX UX_StaffAttendance_Location_User_Date ON public.StaffAttendance(LocationId, UserId, WorkDate);

CREATE TABLE public.StaffProfiles (
    UserId       INT PRIMARY KEY REFERENCES public.Users(Id),
    PhotoPath    VARCHAR(500) NULL,
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL
);

CREATE TABLE public.CustomerProfiles (
    UserId       INT PRIMARY KEY REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedDate  TIMESTAMPTZ NULL
);

CREATE TABLE public.CustomerLocations (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CustomerId   INT NOT NULL REFERENCES public.Users(Id),
    LocationId   INT NOT NULL REFERENCES public.Locations(Id),
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX UX_CustomerLocations_CustomerId_LocationId ON public.CustomerLocations(CustomerId, LocationId) WHERE IsDelete = FALSE;

CREATE TABLE public.CustomerNotes (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CustomerId   INT NOT NULL REFERENCES public.Users(Id),
    ChainId      INT NULL REFERENCES public.SaloonChains(Id),
    LocationId   INT NULL REFERENCES public.Locations(Id),
    Note         TEXT NOT NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL,
    CONSTRAINT CK_CustomerNotes_ScopeExactlyOne CHECK (
        (ChainId IS NOT NULL AND LocationId IS NULL) OR (ChainId IS NULL AND LocationId IS NOT NULL)
    )
);
CREATE INDEX IX_CustomerNotes_CustomerId ON public.CustomerNotes(CustomerId, ChainId, LocationId, CreatedDate) WHERE IsDelete = FALSE;

CREATE TABLE public.CustomerTags (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CustomerId   INT NOT NULL REFERENCES public.Users(Id),
    ChainId      INT NULL REFERENCES public.SaloonChains(Id),
    LocationId   INT NULL REFERENCES public.Locations(Id),
    Tag          VARCHAR(100) NOT NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL,
    CONSTRAINT CK_CustomerTags_ScopeExactlyOne CHECK (
        (ChainId IS NOT NULL AND LocationId IS NULL) OR (ChainId IS NULL AND LocationId IS NOT NULL)
    )
);
CREATE INDEX IX_CustomerTags_CustomerId ON public.CustomerTags(CustomerId, ChainId, LocationId) WHERE IsDelete = FALSE;

CREATE TABLE public.Reviews (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    BookingId    INT NOT NULL REFERENCES public.Bookings(Id),
    CustomerId   INT NOT NULL REFERENCES public.Users(Id),
    LocationId   INT NOT NULL REFERENCES public.Locations(Id),
    Rating       SMALLINT NOT NULL CHECK (Rating BETWEEN 1 AND 5),
    Comment      VARCHAR(1000) NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX UX_Reviews_BookingId ON public.Reviews(BookingId) WHERE IsDelete = FALSE;
CREATE INDEX IX_Reviews_LocationId ON public.Reviews(LocationId, Rating) WHERE IsDelete = FALSE;

CREATE TABLE public.Payments (
    Id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    BookingId      INT NOT NULL REFERENCES public.Bookings(Id) ON DELETE CASCADE,
    Amount         NUMERIC(10,2) NOT NULL,
    TipAmount      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (TipAmount >= 0),
    Currency       VARCHAR(10) NOT NULL DEFAULT 'USD',
    Provider       VARCHAR(30) NOT NULL CHECK (Provider IN ('Stripe', 'Cash', 'InHouse')),
    PaymentMethod  VARCHAR(30) NOT NULL DEFAULT 'card',
    Status         VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'RequiresAction', 'Succeeded', 'Failed', 'Cancelled', 'Refunded')),
    TransactionId  VARCHAR(200) NULL,
    ClientSecret   VARCHAR(500) NULL,
    FailureReason  VARCHAR(500) NULL,
    AmountTendered NUMERIC(10,2) NULL,
    IsDelete       BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive       BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy      INT NULL REFERENCES public.Users(Id),
    CreatedDate    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy      INT NULL REFERENCES public.Users(Id),
    UpdatedDate    TIMESTAMPTZ NULL
);
CREATE INDEX IX_Payments_BookingId ON public.Payments(BookingId);

CREATE TABLE public.Suppliers (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ChainId      INT NOT NULL REFERENCES public.SaloonChains(Id),
    Name         VARCHAR(200) NOT NULL,
    ContactEmail VARCHAR(256) NULL,
    ContactPhone VARCHAR(30) NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive     BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL
);
CREATE INDEX IX_Suppliers_ChainId ON public.Suppliers(ChainId) WHERE IsDelete = FALSE;

CREATE TABLE public.Products (
    Id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId        INT NOT NULL REFERENCES public.Locations(Id),
    SupplierId        INT NULL REFERENCES public.Suppliers(Id),
    Name              VARCHAR(200) NOT NULL,
    SKU               VARCHAR(50) NULL,
    Price             NUMERIC(10,2) NOT NULL CHECK (Price >= 0),
    QuantityOnHand    INT NOT NULL DEFAULT 0 CHECK (QuantityOnHand >= 0),
    ReorderThreshold  INT NOT NULL DEFAULT 0 CHECK (ReorderThreshold >= 0),
    IsDelete          BOOLEAN NOT NULL DEFAULT FALSE,
    IsActive          BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy         INT NULL REFERENCES public.Users(Id),
    CreatedDate       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy         INT NULL REFERENCES public.Users(Id),
    UpdatedDate       TIMESTAMPTZ NULL
);
CREATE INDEX IX_Products_LocationId ON public.Products(LocationId) WHERE IsDelete = FALSE;
CREATE INDEX IX_Products_LowStock ON public.Products(LocationId, QuantityOnHand, ReorderThreshold) WHERE IsDelete = FALSE AND IsActive = TRUE;

CREATE TABLE public.PurchaseOrders (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES public.Locations(Id),
    SupplierId   INT NOT NULL REFERENCES public.Suppliers(Id),
    Status       VARCHAR(10) NOT NULL DEFAULT 'Ordered' CHECK (Status IN ('Ordered','Received','Cancelled')),
    ReceivedDate TIMESTAMPTZ NULL,
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy    INT NULL REFERENCES public.Users(Id),
    UpdatedDate  TIMESTAMPTZ NULL
);
CREATE INDEX IX_PurchaseOrders_LocationId ON public.PurchaseOrders(LocationId) WHERE IsDelete = FALSE;

CREATE TABLE public.PurchaseOrderLines (
    Id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    PurchaseOrderId  INT NOT NULL REFERENCES public.PurchaseOrders(Id) ON DELETE CASCADE,
    ProductId        INT NOT NULL REFERENCES public.Products(Id),
    QuantityOrdered  INT NOT NULL CHECK (QuantityOrdered > 0),
    UnitCost         NUMERIC(10,2) NOT NULL CHECK (UnitCost >= 0)
);
CREATE INDEX IX_PurchaseOrderLines_PurchaseOrderId ON public.PurchaseOrderLines(PurchaseOrderId);

CREATE TABLE public.BookingProducts (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    BookingId    INT NOT NULL REFERENCES public.Bookings(Id) ON DELETE CASCADE,
    ProductId    INT NOT NULL REFERENCES public.Products(Id),
    Quantity     INT NOT NULL CHECK (Quantity > 0),
    UnitPrice    NUMERIC(10,2) NOT NULL CHECK (UnitPrice >= 0),
    IsDelete     BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy    INT NULL REFERENCES public.Users(Id),
    CreatedDate  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IX_BookingProducts_BookingId ON public.BookingProducts(BookingId) WHERE IsDelete = FALSE;

CREATE TABLE public.CommissionRules (
    Id                      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId              INT NOT NULL REFERENCES public.Locations(Id),
    TherapistId             INT NULL REFERENCES public.TherapistProfile(Id),
    TherapistKey            INT GENERATED ALWAYS AS (COALESCE(TherapistId, 0)) STORED,
    Type                    VARCHAR(10) NOT NULL CHECK (Type IN ('Percent','Flat','Hourly')),
    Rate                    NUMERIC(10,2) NOT NULL CHECK (Rate >= 0),
    HourlyRate              NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (HourlyRate >= 0),
    OvertimeThresholdHours  NUMERIC(5,2) NOT NULL DEFAULT 40.0 CHECK (OvertimeThresholdHours >= 0),
    OvertimeRateMultiplier  NUMERIC(5,2) NOT NULL DEFAULT 1.5 CHECK (OvertimeRateMultiplier >= 1.0),
    IsDelete                BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy               INT NULL REFERENCES public.Users(Id),
    CreatedDate             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy               INT NULL REFERENCES public.Users(Id),
    UpdatedDate             TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX UX_CommissionRules_Location_Therapist ON public.CommissionRules(LocationId, TherapistKey) WHERE IsDelete = FALSE;

CREATE TABLE public.PayRuns (
    Id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    LocationId    INT NOT NULL REFERENCES public.Locations(Id),
    PeriodStart   DATE NOT NULL,
    PeriodEnd     DATE NOT NULL,
    Status        VARCHAR(10) NOT NULL DEFAULT 'Draft' CHECK (Status IN ('Draft','Finalized')),
    FinalizedDate TIMESTAMPTZ NULL,
    CreatedBy     INT NULL REFERENCES public.Users(Id),
    CreatedDate   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy     INT NULL REFERENCES public.Users(Id),
    UpdatedDate   TIMESTAMPTZ NULL,
    CONSTRAINT CK_PayRuns_Period CHECK (PeriodEnd >= PeriodStart)
);
CREATE INDEX IX_PayRuns_LocationId ON public.PayRuns(LocationId);

CREATE TABLE public.PayRunLines (
    Id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    PayRunId         INT NOT NULL REFERENCES public.PayRuns(Id) ON DELETE CASCADE,
    TherapistId      INT NOT NULL REFERENCES public.TherapistProfile(Id),
    GrossSales       NUMERIC(10,2) NOT NULL,
    HoursWorked      NUMERIC(10,2) NOT NULL DEFAULT 0,
    RegularHours     NUMERIC(10,2) NOT NULL DEFAULT 0,
    OvertimeHours    NUMERIC(10,2) NOT NULL DEFAULT 0,
    HourlyRate       NUMERIC(10,2) NOT NULL DEFAULT 0,
    CommissionRate   NUMERIC(10,2) NOT NULL,
    CommissionType   VARCHAR(10) NOT NULL CHECK (CommissionType IN ('Percent','Flat','Hourly')),
    CommissionAmount NUMERIC(10,2) NOT NULL,
    OvertimePay      NUMERIC(10,2) NOT NULL DEFAULT 0,
    TotalPay         NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IX_PayRunLines_PayRunId ON public.PayRunLines(PayRunId);
