# Research Agent

Birbal turns a research question into a source-linked reading list.

The system prompt tells the model to use tools before answering, prefer primary technical sources, remove weak or duplicate results, and explain why each item is worth reading. Runtime context includes configured interests, avoided topics, preferred difficulty, maximum list size, and enabled curated sources.

The final response should contain, for each item:

- title and URL;
- source and publication date when available;
- why it is worth reading;
- one key takeaway.

If a request is underspecified, the agent makes and states a reasonable assumption instead of ending the run for clarification.
