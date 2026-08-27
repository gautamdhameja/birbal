# Security

Public URL fetching accepts only HTTP and HTTPS, rejects credentials and unsafe host encodings, blocks private and special-use addresses, validates redirect targets, and performs DNS validation again when opening the connection.

Response headers and bodies have size and time bounds. Caller abort signals propagate through fetch and body reads. Redirected response bodies are discarded before the next request.

Keep API keys in `.env.local`; never commit them. Treat research prompts, fetched text, and trace logs as potentially sensitive even though Birbal does not persist them itself.
