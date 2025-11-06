# Design & Technical Decisions

## Database

Used SQLite with better-sqlite3 for simplicity and file-based persistence.
Schema includes conversations (id, title, createdAt, deletedAt) and messages (conversationId, role, content, createdAt).

## Soft Delete & Undo

Conversations are marked with a deletedAt timestamp before final deletion.
An Undo endpoint allows restoration within 5 seconds.

## Pagination

Implemented cursor-based pagination for messages via query params (?limit, ?before).

## Environment Variables

Backend uses dotenv for configurable port and LLM endpoint.

## Error Handling

All routes wrapped in try/catch to ensure the server remains stable.

## Future Improvements

- Add authentication
- Move to PostgreSQL for multi-user scalability
- Replace mock LLM with real Ollama adapter
