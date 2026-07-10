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

Three pills under the input choose the flavor: **Search** (default — grounded, looks
things up before answering), **Chat** (conversational — brainstorming, writing, no
searching unless asked), and **Code** (build-first — returns the artifact, researching
official docs when the tech is niche or version-specific).

## Attachments — images

Paste an image, drag it onto the input, or use the paperclip. The assistant can see
attached images: ask about screenshots, photos, places, text in pictures. Sending an
image with no text just describes it.

## Attachments — documents

In Chat mode you can attach documents — PDF, Word (.docx), Excel (.xlsx), PowerPoint
(.pptx), and text formats (txt, md, csv, json, xml, html) — then ask questions about
their contents. Large files are capped (25 MB) and originals are cleaned up after a
day; what the assistant learned stays available in that chat for a week.

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

Generated code appears in a canvas with syntax highlighting and line numbers. HTML runs
in a live Preview tab and can open in its own sandboxed browser tab; multi-file
projects appear as separate files, each downloadable.

## Chat history & storage

Each chat can live in one of three places, switchable per chat from its ⋯ menu: **Off**
(nothing kept), **Local** (this browser only), or **Server** (synced to your account,
available on any device). The control at the sidebar bottom sets the default for new
chats. Edit your last message with the pencil, retry failed answers with Retry. The
sidebar lists the 15 most recent chats — "Load more" reveals older ones, and the
search box always scans your whole history. Every message carries a subtle
timestamp, and after each answer the header shows which model(s) worked and how
much of the context window this chat is using.

## Appearance

Settings → Theme offers **Auto** (the default — follows your device's light/dark
setting, switching live) and 17 Norse-named themes (7 light goddesses, 7 dark gods,
3 mixed), plus separate background effects (glow, gradient, aurora, mesh, starfield,
grid), your choice of font, and border roundness. Everything syncs to your account.

## Privacy & timezone

Settings → Privacy controls whether the assistant knows your timezone: Off (server
clock, nothing shared), Automatic (from your browser), or Manual (pick a zone). Chats
in Off/Local storage never touch the server's database.

## Accounts & admin

New registrations wait for an admin's approval. Admins manage users (approve, promote,
demote, delete) and choose which Ollama models power each role — main, research
agents, vision, coding, and embeddings — from the Admin panel, applied instantly.

## Install as an app

silly-chat works as an app on your phone or desktop. On Android/Chrome pick
"Install app" from the browser menu (or the install prompt); on iPhone/iPad open it
in Safari and use Share → Add to Home Screen. It gets its own icon and opens in a
clean window without browser chrome.

## Version & what's new

The version chip at the bottom of the sidebar opens About — your current version, its
changes, and the full version history. You can also just ask the assistant "what
version are you?" or "what's new?".
