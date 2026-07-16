# silly-chat help

Every section below describes one feature. This file powers the in-app Help window
(searchable) and the assistant's own knowledge of what it can do.

## Asking questions

Type anything into the box. For factual or current questions the assistant searches the
web itself, breaks big questions into parallel research agents, and cites its sources
under the answer. You can watch the agents work in the "Working…" panel — click any row
to read its full task. The answer streams in live as it's written; the send button turns
into a **Stop** button while it works — stopping keeps whatever has already arrived.

## Chat modes

Pills under the input choose the flavor: **Search** (default — grounded, looks
things up before answering), **Chat** (conversational — brainstorming, writing, no
searching unless asked), and **Code** (build-first — returns the artifact, researching
official docs when the tech is niche or version-specific). If image generation is
enabled for you, a fourth **Images** pill appears — picture-first: describe anything
and it gets drawn right away.

## Attachments — images

Paste an image, drag it onto the input, or use the paperclip. The assistant can see
attached images: ask about screenshots, photos, places, text in pictures. Sending an
image with no text just describes it.

## Attachments — documents

In Chat mode you can attach documents — PDF, Word (.docx), Excel (.xlsx), PowerPoint
(.pptx), and text formats (txt, md, csv, json, xml, html) — then ask questions about
their contents. Large files are capped (25 MB) and originals are cleaned up after a
day; what the assistant learned stays available in that chat for a week.

## Image generation

Ask the assistant to draw or design a picture — "draw a cozy cabin in the woods",
"make a logo for my bakery" — and it generates one with an AI image model (via
OpenRouter). Two models work behind the scenes: a fast one for casual asks (seconds)
and a top-quality one the assistant switches to when your request demands it —
photorealism, fine detail, "make it stunning". The image appears right in the answer:
click it to view fullscreen and use the download button there to save it. The
**Images** pill under the input switches to picture-first mode where every idea you
type gets drawn. It's a per-user feature: admins have it by default and can switch it
on or off for anyone in Admin → Users (the API key and both models live in
Admin → Images). Each person can have a weekly image allowance (admins set it in
Users → ⋯ → Image quota; admins themselves are unlimited) — you won't notice yours
until it's nearly used up, then a small notice appears after each image, and once
it's spent the assistant tells you when it resets (Mondays). You can also ask about
an image it made ("does she actually hold a sword?") — the assistant looks at the
real picture, not its memory of the prompt.

Images can be **edited**, not just made: say "remove the hat" right after a
generation and the same picture is changed (keep going — edits stack), or attach
your own photo and ask "remove the people from the background", "make it a
watercolor". Edits land in your gallery and count against the same weekly allowance.

## Image gallery

Every generated image is saved to your Gallery (user menu → Gallery): the picture,
the exact prompt that made it, the model used, and the date. Click an image for
fullscreen with a download button; the trash button deletes it for good (it also
disappears from chats that showed it). Generated images stay until you delete them
and are sealed under your key like everything else — only you can see them.

## Presentations

Ask for "a presentation about X" (optionally "in 7 slides") and you get a real slide
deck: flip through with the arrows or dots, click the expand icon to present
fullscreen (arrow keys / space navigate, Esc closes). The assistant researches first
when the topic needs current facts, and may offer slides on its own when a
walkthrough teaches better than prose.

## Linking chats as context

Type `@` in the message box and a picker of your other chats appears — keep typing
to filter, choose with ↑/↓ + Enter or click. The linked chat's content becomes
background context for this chat: ask about things you discussed there and the
assistant knows. Linked chats show as chips above the input; the × unlinks. Links
persist with the chat until removed (a deleted chat is skipped silently).

## Charts

Numeric answers can render as bar, line, area, pie, or donut charts with real axes and
legends. Ask for a kind ("pie chart of…") or let the assistant pick; comparisons can
carry several series.

## Interactive simulations

Ask a "what if" question — "how does an investment grow depending on interest rate and
monthly contribution?", "how far does a ball fly depending on launch angle?" — and the
graph comes with controls: sliders for ranges, − / + steppers for exact amounts, choice
buttons (e.g. monthly vs yearly), and on/off switches. Move a control and the curves
update instantly; hover (or tap) the graph to read exact values, and Reset restores the
starting settings. PDF exports include the graph as pictured at its current defaults.

## Diagrams

Ask for structure and the assistant draws it: "how do I set up my home network?",
"diagram a microservice architecture for an e-shop", flows, sequences, ER models.
Toggle between Preview and Code (the Mermaid source) with the tabs, copy the source
for your own docs, and use the expand button for fullscreen.

## Maps & navigation

Ask "where is X" or "how do I get from A to B" — you get an interactive map with
markers and the real route by car, bike, on foot, or by public transport (with the bus
or train legs labeled). Regions with real boundaries (districts, municipalities,
countries) can be outlined; historical or rough regions can be sketched approximately
(drawn dashed). Maps expand to fullscreen with the arrows button.

## Code canvas

Generated code appears in a canvas with syntax highlighting and line numbers. While the
coding agent works you see the code being written live; the finished block replaces it.
HTML runs in a live Preview tab and can open in its own sandboxed browser tab; multi-file
projects appear as separate files, each downloadable. Code is an *artifact*: ask for
changes ("make the ball red", "fix the crash") and the same program is edited in place —
small changes apply as targeted patches you can watch stream in as red/green diffs
(an "Edited — N changes" card stays in the chat), while big rewrites regenerate the
whole file. The newest version always wins.

## Exporting & documents

Hover any answer to reveal **PDF** and **MD** buttons — PDF opens your browser's
save-as-PDF dialog with a clean paper layout (tables and charts included), MD downloads
the answer as Markdown. The same buttons in the header export the whole chat, and every
slide deck has its own PDF button that prints one slide per page (a handout). You can
also just ask for a document: "make me a PDF with…" produces a typeset PDF as a
download chip right in the answer.

## Chat history & storage

Each chat can live in one of three places, switchable per chat from its ⋯ menu: **Off**
(nothing kept), **Local** (this browser only), or **Server** (synced to your account,
available on any device). The control at the sidebar bottom sets the default for new
chats. Edit your last message with the pencil, retry failed answers with Retry. The
sidebar lists the 15 most recent chats — "Load more" reveals older ones, and the
search box always scans your whole history. Every message carries a subtle
timestamp, and after each answer the header shows which model(s) worked and how
much of the context window this chat is using. The assistant remembers the whole
chat: if a very long conversation nears the model's context limit, older messages
are summarized automatically (admins tune the threshold) while recent ones stay
word-for-word.

## Appearance

Settings → Theme offers **Auto** (the default — follows your device's light/dark
setting, switching live) and 17 Norse-named themes (7 light goddesses, 7 dark gods,
3 mixed), plus separate background effects (glow, gradient, aurora, mesh, starfield,
grid), your choice of font, and border roundness. Everything syncs to your account.

## Privacy & timezone

Settings → Privacy controls whether the assistant knows your timezone: Off (server
clock, nothing shared), Automatic (from your browser), or Manual (pick a zone). Chats
in Off/Local storage never touch the server's database.

Server-saved chats **and attachments** (images, documents, generated PDFs) are
**encrypted at rest** with a key derived from your password — whoever holds the
database or disk (the admin included) sees only ciphertext. At login you receive a
one-time **recovery key** — copy it or download it as a file and store it safely; if
you forget your password it's the only way to unlock your data ("Forgot your
password?" on the login screen). Changing your password normally (Settings → Account)
keeps everything readable, and you can generate a fresh recovery key there too. If
you lose both, an admin can reset your password so you can log in again — but your
encrypted chats are gone for good; that impossibility is the whole guarantee. Honest
fine print: messages are necessarily readable by the server *while it answers you*
(they go to the model) — encryption protects what's stored.

## Accounts & admin

New registrations wait for an admin's approval. Admins manage users (approve, promote,
demote, delete, toggle image generation) and choose which Ollama models power each
role — main, research agents, vision, coding, and embeddings — from the Admin panel,
applied instantly. Admin → Statistics shows how much each person has used: tokens per
model and images generated, filterable by period (today, last days, week, month) —
counts only, never what anyone wrote.

## Install as an app

silly-chat works as an app on your phone or desktop. On Android/Chrome pick
"Install app" from the browser menu (or the install prompt); on iPhone/iPad open it
in Safari and use Share → Add to Home Screen. It gets its own icon and opens in a
clean window without browser chrome.

## Version & what's new

The version chip at the bottom of the sidebar opens About — your current version, its
changes, and the full version history. You can also just ask the assistant "what
version are you?" or "what's new?".
