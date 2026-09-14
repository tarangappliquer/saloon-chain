using FluentValidation;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminStaffEndpoints
{
    // IsEmulator applies to any POS_ACCESS role (RootSuperAdmin/SuperAdmin/Admin/Manager/
    // Receptionist) -- Therapist/Other/Customer are always false, regardless of what a request
    // sends (the adminportal form hides the option entirely for those roles too). Widened to
    // include Manager/Receptionist because POS checkout now runs entirely through emulation.
    private static readonly UserRole[] EmulatorEligibleRoles =
        [UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.Receptionist];

    public static void MapAdminStaffEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/staff").RequireAuthorization("AdminAccess").WithTags("Admin Staff")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        // SuperAdmin/Admin/Manager/Receptionist are forced to their own scope regardless of what
        // they pass -- previously this endpoint returned every staff member in the system to any
        // AdminAccess caller (the same class of over-exposure fixed for chains/locations/bookings
        // earlier), letting e.g. an Admin browse another chain's Managers by name/email.
        // RootSuperAdmin gets no clamp -- it's the only role with no chain/location of its own.
        group.MapGet("", async (string? role, int? chainId, int? locationId, ICurrentUser currentUser, UserRepository repo) =>
        {
            UserRole? parsedRole = null;
            if (role is not null)
            {
                if (!Enum.TryParse<UserRole>(role, out var r))
                    return Results.Problem($"Unknown role '{role}'.", statusCode: StatusCodes.Status400BadRequest);
                parsedRole = r;
            }

            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin)) chainId = currentUser.ChainId;
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist)) locationId = currentUser.LocationId;

            var staff = await repo.GetStaffAsync(parsedRole, chainId, locationId);

            // Peers and anyone above the caller's own rank are invisible -- a SuperAdmin doesn't see
            // other SuperAdmins/RootSuperAdmin, an Admin doesn't see other Admins/SuperAdmin/
            // RootSuperAdmin, a Manager doesn't see other Managers/Admin/SuperAdmin/RootSuperAdmin.
            UserRole[] hiddenRoles = currentUser.Role switch
            {
                UserRole.SuperAdmin => [UserRole.RootSuperAdmin, UserRole.SuperAdmin],
                UserRole.Admin => [UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin],
                UserRole.Manager => [UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager],
                _ => []
            };
            if (hiddenRoles.Length > 0)
                staff = staff.Where(s => !hiddenRoles.Contains(s.Role)).ToList();

            return Results.Ok(staff);
        }).Produces<IReadOnlyList<StaffUserDto>>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("List staff users, scoped to the caller's own chain/location where applicable.");

        // Who may create whom: RootSuperAdmin -> anyone, anywhere, including a chain's first
        // SuperAdmin/Admin (ChainId comes straight from the request body since Root has none of its
        // own to clamp to); SuperAdmin -> Admin/Manager/Receptionist/Therapist/Other/Customer (own
        // chain); Admin -> Manager/Receptionist/Therapist/Other/Customer (own chain); Manager ->
        // Receptionist/Therapist/Other (own location) -- Customer is deliberately absent from
        // Manager's set here (RootSuperAdmin/SuperAdmin/Admin only, see AdminCustomersEndpoints'
        // CustomerManagement policy); Receptionist has no staff-creation rights of its own (falls
        // through to the explicit reject below). Nothing enforced this before RBAC landed -- any
        // AdminAccess caller (including a plain Receptionist) could create a brand-new SuperAdmin via
        // this endpoint.
        // SuperAdmin/Admin/Manager's own scope is clamped server-side rather than checked-and-rejected,
        // so the adminportal form never needs to know (or guess) the caller's own chain/location id --
        // it just omits those fields for non-RootSuperAdmin creators and the server fills them in.
        group.MapPost("", async (CreateStaffRequest req, ICurrentUser currentUser, AuthService auth, CatalogRepository catalogRepo) =>
        {
            var role = Enum.Parse<UserRole>(req.Role);

            // 0 isn't a valid Locations/SaloonChains/TherapistProfile id (IDENTITY starts at 1) --
            // an older/mismatched client sending it as a "not applicable" sentinel (see
            // CreateStaffRequest's own comment) would otherwise crash the insert with a raw FK
            // violation instead of storing NULL like it should.
            req = req with
            {
                ChainId = req.ChainId is > 0 ? req.ChainId : null,
                LocationId = req.LocationId is > 0 ? req.LocationId : null,
                TherapistId = req.TherapistId is > 0 ? req.TherapistId : null,
            };

            if (currentUser.IsInRole(UserRole.RootSuperAdmin))
            {
                // No restriction, no clamp -- Root is the only role allowed to hand out SuperAdmin
                // and picks which chain it's for via req.ChainId.
            }
            else if (currentUser.IsInRole(UserRole.SuperAdmin))
            {
                if (role is not (UserRole.Admin or UserRole.Manager or UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer))
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }
            else if (currentUser.IsInRole(UserRole.Admin))
            {
                if (role is not (UserRole.Manager or UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer))
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }
            else if (currentUser.IsInRole(UserRole.Manager))
            {
                if (role is not (UserRole.Receptionist or UserRole.Therapist or UserRole.Other))
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { LocationId = currentUser.LocationId };
            }
            else
            {
                // Receptionist (or anything else that reaches this AdminAccess-gated group without a
                // branch above) has no staff-creation rights at all.
                return Results.Problem("Not authorized to create staff.", statusCode: StatusCodes.Status403Forbidden);
            }

            // Granting the flag itself stays RootSuperAdmin/SuperAdmin/Admin's call even though
            // Manager/Receptionist are now eligible targets -- otherwise a Manager creating their
            // own Receptionist could hand out emulation rights with zero oversight.
            var isEmulator = req.IsEmulator && EmulatorEligibleRoles.Contains(role)
                && currentUser.IsInRole(UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin);

            // A Therapist login needs a TherapistProfile row to be assignable to shifts (ShiftAssignments.TherapistId
            // is a hard FK to Therapists, not Users) -- auto-create one from the staff member's name rather than
            // forcing the admin to create it separately on the Therapists page first.
            var therapistId = req.TherapistId;
            if (role == UserRole.Therapist && therapistId is null)
                therapistId = await catalogRepo.CreateTherapistAsync(req.Name);

            var id = await auth.CreateStaffAsync(
                req.Name, req.Email, role, req.ChainId, req.LocationId, therapistId, isEmulator,
                req.JoiningDate ?? DateOnly.FromDateTime(DateTime.UtcNow));

            if (role == UserRole.Therapist && therapistId is not null)
                await catalogRepo.LinkTherapistScopeAsync(therapistId.Value, req.ChainId, req.LocationId, id);

            return Results.Ok(new IdResponse(id));
        }).WithValidation<CreateStaffRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new staff login, restricted to roles the caller is allowed to create.");

        // "Can mark staff as Emulator" is RootSuperAdmin/SuperAdmin/Admin's -- compare against the
        // stored value (not a blanket reject on isEmulator:true) because the adminportal always
        // round-trips the current value on every save (see this session's stale-closure fix), so a
        // Manager saving an unrelated field like phone on an emulator-enabled Admin must still go
        // through.
        group.MapPut("/{id:int}", async (int id, UpdateStaffRequest req, ICurrentUser currentUser, UserRepository repo, CatalogRepository catalogRepo) =>
        {
            var existing = await repo.GetStaffByIdAsync(id);
            if (existing is null) return Results.NotFound();

            // Same 0-as-sentinel defense as POST above.
            req = req with
            {
                ChainId = req.ChainId is > 0 ? req.ChainId : null,
                LocationId = req.LocationId is > 0 ? req.LocationId : null,
                TherapistId = req.TherapistId is > 0 ? req.TherapistId : null,
            };

            // Who may edit whom mirrors POST's creation matrix above (RootSuperAdmin edits anyone,
            // SuperAdmin edits Admin/Manager/Receptionist/Therapist/Other/Customer in their own chain,
            // Admin edits Manager/Receptionist/Therapist/Other/Customer in their own chain, Manager
            // edits Receptionist/Therapist/Other/Customer in their own location). Nothing enforced
            // this before -- any AdminAccess caller could PUT any staff id in the system and reassign
            // role/chain/location/active state freely, including promoting a Receptionist straight to
            // SuperAdmin, or editing a staff member in a chain/location they have no relation to.
            var newRole = req.Role is null ? existing.Role : Enum.Parse<UserRole>(req.Role);

            // Clamped against newRole (the role this save leaves the target with), same rule as
            // POST's creation-time clamp above -- silently forced false for a role the option
            // doesn't apply to, rather than rejecting the whole save over an unrelated field change.
            var isEmulator = req.IsEmulator && EmulatorEligibleRoles.Contains(newRole);

            if (isEmulator != existing.IsEmulator && !currentUser.IsInRole(UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin))
                return Results.Problem("Only Super Admin or Admin can change emulator status.", statusCode: StatusCodes.Status403Forbidden);

            if (currentUser.IsInRole(UserRole.RootSuperAdmin))
            {
                // No restriction -- Root can edit anyone, any role reassignment.
            }
            else if (currentUser.IsInRole(UserRole.SuperAdmin))
            {
                // Manager/Receptionist/Therapist/Other targets carry LocationId, not ChainId (see
                // Users) -- their chain isn't cheaply checkable here, so (same trust level already
                // accepted for Admin's location/room/treatment endpoints elsewhere in this file) only
                // ChainId-bearing targets get an explicit chain-ownership check.
                if (existing.ChainId is not null && existing.ChainId != currentUser.ChainId)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                if (existing.Role is UserRole.RootSuperAdmin or UserRole.SuperAdmin || newRole is UserRole.RootSuperAdmin or UserRole.SuperAdmin)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }
            else if (currentUser.IsInRole(UserRole.Admin))
            {
                if (existing.ChainId is not null && existing.ChainId != currentUser.ChainId)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                if (existing.Role is UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin
                    || newRole is UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }
            else if (currentUser.IsInRole(UserRole.Manager))
            {
                if (existing.LocationId != currentUser.LocationId)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                if (existing.Role is UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager
                    || newRole is UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { LocationId = currentUser.LocationId };
            }
            else
            {
                return Results.Problem("Not authorized to edit staff.", statusCode: StatusCodes.Status403Forbidden);
            }

            await repo.UpdateStaffAsync(id, req.Name, req.Phone, req.Role, req.ChainId, req.LocationId, req.TherapistId, isEmulator, req.JoiningDate, req.IsActive);

            // Keep the linked TherapistProfile row's Name/IsActive/scope in step with the staff
            // login that owns it -- otherwise editing/deactivating/moving a Therapist here silently
            // leaves a stale profile behind (wrong name, still-active, or still scoped to their old
            // chain/location) that keeps showing up in scheduling.
            var therapistId = req.TherapistId ?? existing.TherapistId;
            if (therapistId is not null)
            {
                await catalogRepo.UpdateTherapistAsync(therapistId.Value, req.Name, req.IsActive);
                await catalogRepo.LinkTherapistScopeAsync(therapistId.Value, req.ChainId, req.LocationId, id);
            }

            return Results.NoContent();
        }).WithValidation<UpdateStaffRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .Produces(StatusCodes.Status404NotFound)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Update a staff user's details, role, scope, or active/emulator state.");

        // GET /api/admin/staff/attendance
        group.MapGet("attendance", async (int? locationId, string? date, ICurrentUser currentUser, UserRepository repo) =>
        {
            var locId = locationId ?? currentUser.LocationId ?? 0;
            if (locId == 0) return Results.Ok(Array.Empty<StaffAttendanceDto>());

            DateOnly workDate;
            if (string.IsNullOrWhiteSpace(date))
                workDate = DateOnly.FromDateTime(DateTime.UtcNow);
            else if (!DateOnly.TryParse(date, System.Globalization.CultureInfo.InvariantCulture, out workDate))
                return Results.Problem("Invalid date format. Expected yyyy-MM-dd.", statusCode: StatusCodes.Status400BadRequest);

            var attendance = await repo.GetStaffAttendanceAsync(locId, workDate);
            return Results.Ok(attendance);
        }).Produces<IReadOnlyList<StaffAttendanceDto>>()
          .WithDescription("Get daily staff attendance roster for a location.");

        // POST /api/admin/staff/attendance
        group.MapPost("attendance", async (LogStaffAttendanceRequest req, ICurrentUser currentUser, UserRepository repo) =>
        {
            if (!currentUser.IsInRole(UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.Receptionist))
                return Results.Problem("Not authorized to log staff attendance.", statusCode: StatusCodes.Status403Forbidden);

            if (!DateOnly.TryParse(req.WorkDate, System.Globalization.CultureInfo.InvariantCulture, out var workDate))
                return Results.Problem("Invalid date format. Expected yyyy-MM-dd.", statusCode: StatusCodes.Status400BadRequest);

            TimeSpan? arrivalTime = !string.IsNullOrWhiteSpace(req.ArrivalTime)
                ? TimeSpan.Parse(req.ArrivalTime, System.Globalization.CultureInfo.InvariantCulture)
                : null;
            TimeSpan? leftTime = !string.IsNullOrWhiteSpace(req.LeftTime)
                ? TimeSpan.Parse(req.LeftTime, System.Globalization.CultureInfo.InvariantCulture)
                : null;

            try
            {
                await repo.LogStaffAttendanceAsync(req.LocationId, req.UserId, workDate, arrivalTime, leftTime, currentUser.RequireUserId());
                return Results.Ok(new { Message = "Attendance logged successfully." });
            }
            catch (Exception ex) when (ex.Message.Contains("immutable", StringComparison.OrdinalIgnoreCase) || ex.Message.Contains("50040", StringComparison.OrdinalIgnoreCase) || ex.Message.Contains("50041", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
            }
        }).WithDescription("Log arrival or departure/left time for a staff member (immutable once set).");

        // POST /api/admin/staff/assign-proxy
        group.MapPost("assign-proxy", async (AssignProxyRequest req, ICurrentUser currentUser, UserRepository repo, SaloonApi.Shared.Email.IBackgroundEmailQueue emailQueue, SaloonApi.Shared.Email.IEmailBodyBuilder bodyBuilder) =>
        {
            if (!currentUser.IsInRole(UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager))
                return Results.Problem("Not authorized to assign proxy staff.", statusCode: StatusCodes.Status403Forbidden);

            var result = await repo.AssignProxyTherapistAsync(req.BookingTreatmentId, req.ProxyTherapistId, currentUser.RequireUserId());
            if (result is null)
                return Results.NotFound(new { Message = "Booking treatment not found." });

            // Notify location managers via email
            var managers = await repo.GetLocationManagersAsync(result.LocationId);
            foreach (var mgr in managers.Where(m => !string.IsNullOrWhiteSpace(m.Email)))
            {
                var model = new SaloonApi.Shared.Email.TemplateModels.ProxyStaffAssignedModel
                {
                    ManagerName = mgr.Name,
                    ProxyTherapistName = result.ProxyTherapistName,
                    BookingId = result.BookingId,
                    TreatmentName = result.TreatmentName,
                    LocationName = result.LocationName,
                    OriginalTherapistName = result.OriginalTherapistName,
                    CustomerName = result.CustomerName,
                    TimeRangeFormatted = string.Create(System.Globalization.CultureInfo.InvariantCulture, $"{result.StartTime:g} - {result.EndTime:t}"),
                    AssignedBy = currentUser.Email ?? currentUser.Role.ToString()
                };

                var htmlBody = await bodyBuilder.BuildProxyStaffAssignedAsync(model).ConfigureAwait(false);

                var email = new SaloonApi.Shared.Email.EmailMessage(
                    To: [new SaloonApi.Shared.Email.EmailAddress(mgr.Email, mgr.Name)],
                    Subject: $"[SaloonChains Alert] Proxy Staff Assigned for Booking #{result.BookingId}",
                    HtmlBody: htmlBody
                );
                await emailQueue.EnqueueAsync(email).ConfigureAwait(false);
            }

            return Results.Ok(result);
        }).Produces<ProxyAssignmentResultDto>()
          .WithDescription("Assign a proxy staff member to a booking line and notify location managers via email.");
    }
}

internal sealed record LogStaffAttendanceRequest(int UserId, int LocationId, string WorkDate, string? ArrivalTime, string? LeftTime);
internal sealed record AssignProxyRequest(int BookingTreatmentId, int ProxyTherapistId);

// No Password field -- an admin creating a staff login never chooses/sees a password (see
// AuthService.CreateStaffAsync); the new user gets a "set your password" email instead.
// IsEmulator: see EmulatorEligibleRoles above -- clamped false for any role outside that set, and
// for any caller who isn't RootSuperAdmin/SuperAdmin/Admin, regardless of what's sent here.
// JoiningDate: null defaults to today (see the endpoint below) -- the adminportal form always
// sends today's date by default but lets the caller pick a different one.
// ChainId/LocationId/TherapistId default to null (not just nullable) so the OpenAPI schema marks
// them optional/nullable instead of required -- without a default, .NET's OpenAPI generator lists
// a nullable value-type parameter as required anyway, which forced the generated TS client to type
// them as plain `number` and the adminportal form to send a 0 sentinel for "not applicable" (e.g. a
// chain-level SuperAdmin has no LocationId). 0 isn't a valid Locations/SaloonChains/TherapistProfile
// id (IDENTITY starts at 1), so that sentinel crashed the insert with a raw FK violation instead of
// storing NULL like it should have.
internal sealed record CreateStaffRequest(
    string Name, string Email, string Role, int? ChainId = null, int? LocationId = null, int? TherapistId = null,
    bool IsEmulator = false, DateOnly? JoiningDate = null);

// IsEmulator: see EmulatorEligibleRoles above -- clamped false for any role outside that set, and
// for any caller who isn't RootSuperAdmin/SuperAdmin/Admin, regardless of what's sent here.
// JoiningDate: null leaves the stored value untouched (see sp_Admin_UpdateUser's COALESCE).
// ChainId/LocationId/TherapistId default to null for the same OpenAPI-optionality reason as
// CreateStaffRequest above. Reordered after IsEmulator/IsActive (still required, no default) since
// C# requires every optional positional-record parameter to trail every required one -- this only
// affects JSON model binding order, which is by property name, not position, so it's not a breaking
// change for callers.
internal sealed record UpdateStaffRequest(
    string Name, string? Phone, string? Role, bool IsEmulator, bool IsActive,
    int? ChainId = null, int? LocationId = null, int? TherapistId = null, DateOnly? JoiningDate = null);

internal sealed class CreateStaffRequestValidator : AbstractValidator<CreateStaffRequest>
{
    public CreateStaffRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        // RootSuperAdmin is excluded -- there's no "assign RootSuperAdmin" workflow (bootstrapped
        // only via AdminSeeder); AdminStaffEndpoints.MapPost further restricts who may create which
        // of the remaining roles (SuperAdmin/Admin/Manager/Receptionist/Therapist/Other/Customer)
        // based on the caller's own role/scope -- e.g. only RootSuperAdmin may pick SuperAdmin.
        RuleFor(x => x.Role)
            .Must(r => Enum.TryParse<UserRole>(r, out var role) && role is UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager or UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer)
            .WithMessage("Role must be one of SuperAdmin, Admin, Manager, Receptionist, Therapist, Other, Customer.");
    }
}

internal sealed class UpdateStaffRequestValidator : AbstractValidator<UpdateStaffRequest>
{
    public UpdateStaffRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(30);
        // RootSuperAdmin excluded same as CreateStaffRequestValidator -- no "reassign to RootSuperAdmin"
        // workflow. A malformed/unknown role would otherwise reach UpdateStaffAsync and fail as a raw,
        // unhandled SQL error against Users' Role CHECK constraint instead of a clean 400.
        RuleFor(x => x.Role)
            .Must(r => r is null || (Enum.TryParse<UserRole>(r, out var role) && role is UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager or UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer))
            .WithMessage("Role must be one of SuperAdmin, Admin, Manager, Receptionist, Therapist, Other, Customer.");
    }
}
