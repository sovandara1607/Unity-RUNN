# Roster export

Race Control → Runner roster supports server-side event, status, and runner search filters. The table loads matching registrations in pages of 200; **Review export** downloads every row matching the same filter from `GET /api/v1/admin/registrations/export.csv`.

The endpoint requires `STAFF` access or higher, caps a single export at 50,000 rows, and records the actor, filter scope, and row count in the audit log. It does not store the search text in audit metadata. CSV values beginning with spreadsheet formula characters are prefixed safely before download, and the response is marked `nosniff`.

Exports contain personal and emergency-contact information. Treat downloaded files as temporary race-operations material and restrict access to staff.
