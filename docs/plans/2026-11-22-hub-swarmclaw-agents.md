# Hub: SwarmClaw's pages run PandaCode's bots (goal, 2026-11-22)

Jordan, 2026-11-22: "the style guide should not be a popup, it should be a page in the hub just like all the others. and the user should not be a person on the org chart - the org chart is how I see and / or create agent workflows. The "Agents" section you made is also different than how swarmclaw does it - keep working, set a goal if you need to. these things should allow me to quickly set up agents, harnesses, teams, etc without having to open terminals and verbally ask for jobs to be handed over and all that kind of stuff"

Jordan, 2026-11-22 (with screenshots of PandaCode's Agents roster, murmur, and SwarmClaw's CEO -> Researcher/Developer org chart): "agents and bots are the same concept in my mind - profiles i can set up via gui, and sometimes have them work together on things, we have hermes bots but we don't use them ... org chart is essentially the concept of Paperclip or Multica, or whatever pandacode's version of it is ... remember - i'm not a dev, i run a content business and that's the ultimate goal for all of this"

Earlier: "i'm not going to use this gui if you literally are not using the pages from swarmclaw"; "i dont give a fuck about the colors ... the pages themselves are the whole point".

## Goal
SwarmClaw's own pages, unchanged in behaviour, with PandaCode's bots as the engine. A SwarmClaw agent IS a PandaCode bot (name, role, instructions, goals, soul, avatar, provider, model, heartbeat, paused, skills, MCP, backup models; its chat is the bot's desktop thread; bots already message each other with `bot_message_bot`).

## Steps (each tested, pushed, installed)
1. Style Guide = a Hub page (iframe), not a popup window.
2. Agents page as SwarmClaw has it: list + chat + Config tab + "+ Agent" sheet -> bots_list / bot_create / bot_update / bot_delete / bot_set_paused / bot_desktop_thread / bot_message.
3. Org Chart = agents only (no Jordan, no terminal sessions). Parent and team saved on the bot (new `org` column) and written into the coordinator's brief so it hands work to its team with bot_message_bot.
4. Tasks board: a task given to an agent runs as that bot's job (bot_assign_task / bot_message).
5. Schedules: the bots' own schedules beside the Windows tasks.
6. Memory, Activity, Connectors pages from bot memories, activity and channels.
7. Runs: live Claude Code sessions, their helpers and Hub tool jobs (moved off the Org Chart).
