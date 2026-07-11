Create a downloadable, nicely typeset PDF document for the user. Pass a title and the
full document content as clean markdown (headings, lists, tables all render well).

Use it when the user asks for a document, a PDF, something to download/print/share/send
("make me a PDF with…", "as a document I can print"). Write the COMPLETE content into
content_markdown — the document is what the user reads, not your chat reply. The file
appears as a download in your answer automatically: keep your reply to a one-line intro
and never repeat the document's contents in it.

Not for code (use write_code) and not a replacement for answering in chat — only when a
file is what the user wants.
