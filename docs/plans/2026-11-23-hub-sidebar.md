# Hub: the rest of the sidebar, chat box, colors, agent faces (2026-11-23)

Jordan's request, verbatim (2026-11-23, 02:59):

> ok well keep going - we still need the rest of the left side panel features - inbox, chatrooms (this could also be a potential way to integrate other agents like Meta's Muse app on my phone, just as an example), sessions, projects, feed, missions, memory, runs, quality, knowledge, connectors, webhooks, mcp servers, extensions, etc. all that stuff. Keep they layout we have from SwarmClaw - it makes sense to me. But the color schema will need changed - should we do that now or can it universally be tweaked later? Here's an example of excellent, meaningful color choices, which provide clear and distinct separation between buttons, sections of the GUI and agents themselves; [murmur screenshot: C:\Users\only1\Documents\AI\AI Random Resources\work-dark.png] I also like the personalized "bot" loook of each agent - each should resemble or be a play on it's harness or companie's logo, so all the claude code agents would be a customizable variation of the orange claude code logo, here's some inspo [invisible-dots.JPG] where applicable, the agent dude can be holding a tool which is visually representative of it's role (only where it makes sense tho); C:\Users\only1\Documents\AI\AI Random Resources\chat-Rakazo_files and when choosing agents for any reason, vizualize them with cards like this (but with their respective images / names / brief description); [everywhere-dark.png] use actual logos to replace text whenever possible, like this [genfeedai-publishing-desk.png] make sure things we actually use like JOBS.md and inbox.txt are actually integrated as well - jobs.md would go to the Task Board I'm assusming? The chat thing should have a "+" button for me to upload attachments, a speaker button for TTS (use becky-tts), and a dropdown arrow that allows me to change the model. Slash commands should also work either to allow me to change agents, or to use custom slash commands or something, currently they seem to do nothing. using @ should allow me to tag other agents in my prompt. Go ahead and use whatever skills or system you think is most appropriate for these tasks, but /do please do use a skill wherever applicable. i'm going to bed, keep working and don't make any mistakes /goal implement everything I just mentioned with no mistakes, make sure you continue when rate limits reset

Standard: J10 (X:\AI-2\JOBS.md) - backend owns every fact and action, every button = one tested action,
a page shows only when real data is behind it (src/sc-hub/views.ts HUB_VIEWS).

## Work list (tick as shipped: built, tested, installed, pushed)

A. Chat box
- [x] + attachments (images to the agent as images, other files as their full paths)
- [x] speaker: read replies aloud with becky-tts
- [x] model dropdown in the box
- [x] slash commands: /agent <name> switches agent; the harness's own and custom commands run
- [x] @name tags another agent: it gets the message too

B. Look
- [x] colors as tokens in one place (murmur-like: distinct per section and per agent)
- [x] agent faces: one mascot per harness in its logo color, role tool where it fits
- [x] agent picker as cards (face, name, short description)
- [x] real logos instead of harness names

C. Pages (each with real data)
- [x] Task Board <- JOBS.md (read only; Start turns a job into a PandaCode task)
- [x] Inbox <- inbox.txt (add link, open link, Install them now). Agent notifications: not yet
- [ ] Projects, Sessions/Runs, Memory, Activity
- [ ] MCP servers, Extensions (plugins), Connectors, Webhooks
- [ ] Chatrooms, Knowledge (qmd), Missions, Quality, Feed
