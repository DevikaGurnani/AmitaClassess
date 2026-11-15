# Teaching Pace Detector

Owner: `/owner/pace`, linked from Attendance. Teacher: Teaching pace tool on the teacher overview. Students see enabled, unexpired polls on Overview and Class schedule, only for their current batches. Parents do not see this feature.

Managers select an assigned batch/subject, completed class date, topic and voting deadline (within 30 days). Creating the poll enables it. Managers can disable/re-enable it until the deadline. Students choose Too Fast, Perfect or Too Slow once per poll. SQL checks enrollment, active account, enable state and server deadline; a row lock and unique key prevent duplicate/concurrent votes. The UI refreshes every 30 seconds.

Individual responses reside in `private.pace_votes`, with no client grants or public vote-list API. Teachers and owners receive only weekly batch/subject aggregates after deadlines, and only when at least five distinct students responded. No names, student IDs or per-student choices are returned to managers. Student identity is retained privately for eligibility and duplicate prevention; privileged database operators can access it, so this is confidential voting rather than cryptographic anonymity. Small groups cannot receive trends. Trends include closed polls, including ones disabled early.

Migration: `20261115_22_teaching_pace.sql`. Apply helper: `scripts/apply-teaching-pace.mjs`. Integration test: `scripts/live-teaching-pace-test.mjs`. Creating a poll uses the existing student inbox notification with a Class schedule destination. No external messages are sent.
