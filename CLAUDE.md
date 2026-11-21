# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project and entry points

This is a Vietnamese, mobile-first shared-laundry application and a Java coursework project. Java owns the domain rules, persistence, authorization, and API; Next.js is the web interface and server-side API bridge, not a second implementation of the business logic.

The repository root is the directory containing `package.json` and `backend/`. In the supplied workspace it is nested inside another directory of the same name. Run the commands below from the actual repository root.

Read `WORK_STATUS.md` for the in-progress handover and check the working tree before modifying code. Its recorded results are historical, not proof that current tests pass. `README.md` describes the connected application, while `backend/README.md` and current Java source also cover allocation work that is not yet connected to the frontend.

## Commands

Toolchains: Node.js 22 (matching CI), npm with `package-lock.json`, Java 21, and Maven.

```powershell
npm ci

# Development: run Java and Next.js in separate terminals.
mvn -f backend/pom.xml spring-boot:run  # http://127.0.0.1:8080
npm run dev                            # http://localhost:3000

# Frontend/documentation checks.
npm run check          # check:docs + lint + typecheck + test; does NOT build or test Java
npm run check:docs     # headings and local links in the seven listed project documents
npm run lint           # ESLint flat config, Next core-web-vitals and TypeScript rules
npm run typecheck      # tsc --noEmit
npm test               # Vitest, single run (--passWithNoTests)
npm run build          # Next.js production build
npm start              # serve an existing production build

# Select one frontend test file or test name.
npm test -- src/lib/__tests__/java-bridge.test.ts
npm test -- src/lib/__tests__/route-helpers.test.ts -t "accepts an exact matching Origin and Host"

# Java tests, one class, or one method (quote -Dtest for PowerShell).
mvn -f backend/pom.xml test
mvn -f backend/pom.xml "-Dtest=LaundryServiceTest" test
mvn -f backend/pom.xml "-Dtest=AllocationServiceTest#startNeedsPhysicalCheckAndCannotBeRepeated" test
```

`.github/workflows/docs.yml` runs two independent jobs: Node `npm ci`, `npm run check`, and `npm run build`; Java `mvn -B -f backend/pom.xml test`. Passing the frontend checks does not establish backend correctness.

## Architecture

### Browser → Next.js → Java

- `src/app/page.tsx` renders the client component `src/components/LaundryApp.tsx`. That component owns the current account, building selection, forms, and data refreshes using React state and same-origin `/api/...` fetches. User-facing text and the document language are Vietnamese. Styling is in `src/app/globals.css`.
- `src/app/api/**/route.ts` contains thin App Router handlers: validate input/path identifiers, require exact same-origin headers for mutations, and delegate to the Java bridge. Dynamic route `params` are awaited promises. `src/lib/route-helpers.ts` centralizes these checks and response conversion. The TypeScript alias `@/*` resolves to `src/*`.
- `src/lib/java-bridge.ts` is the only server-to-Java transport layer. `JAVA_API_ORIGIN` defaults to `http://127.0.0.1:8080` and is restricted to loopback HTTP(S). Requests disable caching and automatic redirects; errors are sanitized rather than blindly relaying backend headers, redirects, or error bodies.
- `src/lib/session-store.ts` maps a random opaque browser cookie (`laundry_session`, HttpOnly, SameSite=Lax) to Java's `JSESSIONID` and CSRF token in a process-local `globalThis` map, with a 12-hour TTL. Credentials and Java cookies are not stored in the browser cookie. Next.js restart loses these mappings; this is not a shared/multi-instance session store. `COOKIE_SECURE=true` enables the browser cookie's Secure flag.
- Login fetches Java CSRF before authenticating, then fetches a new token after session rotation. Backend mutations use the stored session cookie and CSRF header. Preserve both boundaries: browser-to-Next same-origin validation and Next-to-Java Spring CSRF.

### Java domain and persistence

The backend is Spring Boot 3.5.7 with MVC, Validation, Spring Security, Spring Data JPA, and H2. Source is in the flat package `backend/src/main/java/com/laundry/shared/`.

- Controllers expose `/api` and return DTO records. `LaundryService` handles buildings, machines, membership access, and queue operations; `InvitationService` handles invitations and approval; `AllocationService` handles assignment and holds. JPA entities encapsulate state transitions and repositories handle persistence.
- Core relationships are accounts belonging to buildings through memberships, buildings owning machines and queue entries, and machine holds linking machines to a queued request. `MANAGER`/`RESIDENT` and `PENDING`/`APPROVED` are per-building membership attributes, not global Spring Security roles. Invitation tokens expire after seven days; only their hashes are persisted.
- Queue/machine decisions serialize on the building row through `BuildingRepository.findLockedById` (`PESSIMISTIC_WRITE`) inside service transactions. Preserve this locking protocol across queue changes, dispatch, hold actions, and expiry. `AllocationService.dispatchLocked` assumes the caller already owns the building lock and transaction; public entry points acquire them. Closed holds are flushed before replacement holds are queried/created.
- `LaundryApplication` enables scheduling and supplies a UTC `Clock`; allocation and expiry use this injectable clock. `HoldExpiryJob` checks every 15 seconds, but validity is based on stored deadlines, not the time the job happens to run.
- Authentication uses Spring `HttpSession` and BCrypt, not JWT or Basic auth. Registration/login still require CSRF despite being public endpoints. Login rotates the session ID and CSRF token; logout invalidates the session. Building permissions remain server-side service checks.
- `application.properties` binds Java to `127.0.0.1:8080`, uses `jdbc:h2:file:./.data/laundry;DB_CLOSE_ON_EXIT=FALSE`, Hibernate `ddl-auto=update`, and disables open-in-view and the H2 console. The `.data/` location depends on the backend process working directory; launch consistently to avoid creating a different database. Assemble DTOs/access lazy associations within service transactions.
- `LegacyQueueStateMigration` backfills old queue rows from `active` to `WAITING`/`LEFT`; it is not a full schema migration framework. Nullable legacy `Machine.verifiedFree` means unverified, not free.

## Implemented scope versus ongoing work

The connected UI supports registration/login/logout, building creation/list/detail, 1–30 machines, adding machines and maintenance changes, invitations and member approval, and joining/leaving the queue or toggling readiness.

Java additionally contains allocation APIs and service logic that the Next.js routes/UI do not yet expose:

- Assignment requires `AVAILABLE` **and** manager-confirmed `verifiedFree`; a newly created or reopened machine is not automatically verified empty. Ready queue operations can trigger dispatch once machines satisfy this gate.
- Queue states include `WAITING`, `HELD`, `WASHING`, and `LEFT`. Holding hides a request from the waiting list but retains its order key. Unready requests retain their place and are skipped.
- Holds expire after eight minutes; `now >= expiresAt` is expired. Yield/expiry ends the request; a valid unusable-machine report restores its original queue key and marks the machine `NEEDS_CHECK`/unverified. Starting requires prior physical-check confirmation.

This is not a complete operational washing lifecycle: duration entry, completed-wash handover, predicted-finish allocation, ETA, turn swapping, and chat are not implemented. Do not infer physical availability from `AVAILABLE` or a countdown reaching zero. The application is for local trials, not Internet deployment or real-laundry operation of the unfinished allocation flow.

## Tests

Frontend Vitest tests in `src/lib/__tests__/` exercise bridge/session behavior with mocked fetch and the route helpers' origin checks; they are not browser/end-to-end tests.

Java tests under `backend/src/test/java/com/laundry/shared/` use isolated in-memory H2 databases. Coverage is split between service/domain tests (`LaundryServiceTest`, `AllocationServiceTest`), MockMvc (`LaundryApiTest`), real HTTP session/CSRF behavior (`RealHttpAuthAndSecurityTest`), and concurrent service calls (`ConcurrentOperationsTest`). Allocation tests supply an adjustable `Clock`; use that pattern for deadline boundaries instead of wall-clock sleeps. Existing service tests do not imply allocation API/UI integration coverage.

## Business specifications and repository rules

- `docs/phan-tich-nghiep-vu.md` defines scope and agreed rules; `docs/luong-trang-thai.md` describes the proposed state model. Before changing allocation/handover, read `docs/ra-soat-truoc-khi-lap-trinh.md`: it distinguishes approved decisions from still-open proposals and overrides ambiguous older wording. Do not silently implement proposals as approved policy.
- There is one queue per building, with limits per account, **not per room**. Readiness changes eligibility, not position. A held request keeps its order key; a valid error restores that same request/key under the current ordering, without reclaiming anyone else's machine or issuing a priority ticket. Future swaps exchange only the two waiting requests' keys.
- QR is navigation, not authorization or proof of physical presence; chat is communication, not a state-transition command. Fees/payments, advance booking, IoT control, and basin-loaning/missing-basin workflows are outside scope. The web cannot measure whether a physical machine has stopped.
- `CONTRIBUTING.md` uses short-lived `feature/*`, `fix/*`, `docs/*`, and `chore/*` branches from `develop`, PRs into `develop`, and release/hotfix flows into `main`; do not push directly to shared branches. Business-rule changes require corresponding specification/acceptance-test updates.
- Follow `AGENTS.md`: this installed Next.js version has breaking changes. Before writing Next.js code, read the relevant bundled guide in `node_modules/next/dist/docs/` rather than assuming older conventions. Its marked rules block is regenerated by `next dev`; `next-env.d.ts` is generated too, not hand-maintained.
