//! A bot's place on the Hub's Org Chart (SwarmClaw's org chart, src/sc): who it reports to,
//! its team, whether it coordinates or works, and where its card sits. A coordinator's brief
//! names the bots under it, so it hands them work with `pandacode_bot_message_bot`.

use super::{get, list, log, Bot};
use crate::{storage::Store, Result};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Org {
    /// The bot this one reports to; `None` puts it at the top of the chart.
    pub parent_id: Option<String>,
    pub team_label: Option<String>,
    pub team_color: Option<String>,
    /// `coordinator` or `worker` (SwarmClaw's two roles); empty means worker.
    pub swarm_role: String,
    /// Shown on the chart at all. New bots start off it until placed.
    pub on_chart: bool,
    pub x: Option<f64>,
    pub y: Option<f64>,
}

fn short(value: Option<String>, limit: usize) -> Option<String> {
    value.map(|v| super::clean(&v, limit)).filter(|v| !v.is_empty())
}

/// Saves a bot's chart place. Refuses a boss that does not exist, itself, or one of its own
/// reports (a loop). Bots whose team changed see the new brief on their next message.
pub(crate) fn set_org(store: &Store, id: &str, org: Org) -> Result<Bot> {
    let before = get(store, id)?;
    let org = Org {
        parent_id: org.parent_id.filter(|p| !p.is_empty()),
        team_label: short(org.team_label, 60),
        team_color: short(org.team_color, 20),
        swarm_role: if org.swarm_role == "coordinator" { "coordinator".into() } else { "worker".into() },
        on_chart: org.on_chart,
        x: org.x.filter(|v| v.is_finite()),
        y: org.y.filter(|v| v.is_finite()),
    };
    if let Some(parent) = &org.parent_id {
        let bots = list(store)?;
        let mut cursor = Some(parent.clone());
        for _ in 0..=bots.len() {
            let Some(current) = cursor else { break };
            if current == id {
                return Err("A bot cannot report to itself or to a bot that reports to it.".into());
            }
            let Some(boss) = bots.iter().find(|b| b.id == current) else {
                return Err("The bot it should report to no longer exists.".into());
            };
            cursor = boss.org.parent_id.clone();
        }
    }
    let team_changed = before.org.parent_id != org.parent_id || before.org.swarm_role != org.swarm_role;
    let text = serde_json::to_string(&org).map_err(|e| e.to_string())?;
    store.db.execute("UPDATE bots SET org=?2,updated_at=?3 WHERE id=?1", params![id, text, crate::storage::now()]).map_err(|e| e.to_string())?;
    if team_changed {
        // The bot, its old boss and its new boss all brief differently now.
        for bot in [Some(id.to_owned()), before.org.parent_id.clone(), org.parent_id.clone()].into_iter().flatten() {
            store.db.execute("UPDATE bots SET memory_version=memory_version+1 WHERE id=?1", [bot]).map_err(|e| e.to_string())?;
        }
        log(store, id, "updated", "Org chart place changed", json!({"parentId": org.parent_id, "swarmRole": org.swarm_role}))?;
    }
    get(store, id)
}

/// An agent was added, removed or paused: coordinators' "who you can reach" lists change.
pub(crate) fn rebrief_coordinators(store: &Store) -> Result<()> {
    store.db.execute("UPDATE bots SET memory_version=memory_version+1 WHERE json_extract(org,'$.swarmRole')='coordinator'", []).map_err(|e| e.to_string())?;
    Ok(())
}

/// The brief's team section: who this bot hands work to and who it reports to.
pub(crate) fn team_text(store: &Store, bot: &Bot) -> Result<String> {
    let bots = list(store)?;
    let describe = |b: &Bot| if b.role.is_empty() { b.name.clone() } else { format!("{} ({})", b.name, b.role) };
    let reports: Vec<String> = bots.iter().filter(|b| b.org.parent_id.as_deref() == Some(&bot.id)).map(describe).collect();
    let boss = bot.org.parent_id.as_ref().and_then(|p| bots.iter().find(|b| &b.id == p));
    let mut text = String::new();
    if !reports.is_empty() {
        text.push_str(&format!(
            "\nYour team (set by the user on the Org Chart): {}. You coordinate them: split bigger jobs into clear pieces, \
hand each piece to the best-suited member with pandacode_bot_message_bot, then combine their updates into one result for the user.\n",
            reports.join("; ")
        ));
    }
    // A Chief of Staff (a coordinator at the top with no one placed under it) can reach everyone,
    // as in MausBot's Chief of Staff; `rebrief_coordinators` keeps this list current.
    if reports.is_empty() && boss.is_none() && bot.org.swarm_role == "coordinator" {
        let others: Vec<String> = bots.iter().filter(|b| b.id != bot.id && !b.paused).map(describe).collect();
        if !others.is_empty() {
            text.push_str(&format!(
                "\nAgents you can hand work to: {}. Hand a job to the best-suited one with pandacode_bot_message_bot, then combine their updates into one result for the user.\n",
                others.join("; ")
            ));
        }
    }
    if let Some(boss) = boss {
        text.push_str(&format!("\nYou report to {}. When {} hands you work, do it and send the result back to {} with pandacode_bot_message_bot.\n", describe(boss), boss.name, boss.name));
    }
    Ok(text)
}
