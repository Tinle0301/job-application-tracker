# Use cases

## UC-1 Track a new application

1. User clicks **+ Add application**.
2. User enters company and role (plus optional fields) and saves.
3. The application appears with status _Applied_ and a first timeline entry.

**Alternate:** missing company/role or a non-http URL → the form stays open and shows the error.

## UC-2 Move an application through the pipeline

1. User picks a new status in the row's dropdown.
2. The status saves immediately; the timeline gains an entry; stats update.

**Alternate:** picking the same status again adds no timeline entry.

## UC-3 Auto-fill from a job posting (AI)

1. In the add form, user pastes posting text or a URL into **Auto-fill with AI** and clicks **Auto-fill**.
2. Company, role, location, salary, notes (type, summary, requirements) and job description are filled where empty.
3. User reviews and saves.

**Alternates:** page needs login/JS → `FETCH_FAILED`, user pastes text instead · daily limit → `AI_DAILY_LIMIT`.

## UC-4 Check resume fit (AI)

1. User saves their resume once in the **Resume** tab.
2. User expands an application that has a job description and clicks **Analyze fit**.
3. A score, matched and missing skills, a summary and suggestions appear; the **Fit** column shows the score.

**Alternates:** no resume → `NO_RESUME` · description too short → button disabled / `NO_JOB_DESCRIPTION`.

## UC-5 Back up and restore

1. User clicks **Export** to download JSON.
2. On another device, user clicks **Import** and picks the file; rows are validated and added.
