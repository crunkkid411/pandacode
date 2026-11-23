//! Gemini CLI (`gemini --acp`), Qwen Code (`qwen --acp`) and Mistral Vibe (`vibe-acp`)
//! over their ACP stdio servers. Sign-in and model setup stay with each installed CLI;
//! PandaCode answers permission requests like any other ACP agent.
use super::*;

pub(crate) const IDS: [&str; 3] = ["gemini", "qwen", "vibe"];

pub(super) fn configure(command: &mut Command, config: &RunConfig) {
    // `vibe-acp` is its own program and needs no flag.
    if matches!(config.provider.as_str(), "gemini" | "qwen") {
        command.arg("--acp");
    }
}

pub(super) async fn models(provider: &str, path: &Path) -> Result<Vec<ModelInfo>, String> {
    if let Some(models) = acp_catalog::get(provider, path) {
        return Ok(models);
    }
    let _refresh = acp_catalog::refresh_lock(provider, path).await;
    if let Some(models) = acp_catalog::get(provider, path) {
        return Ok(models);
    }
    let discovery = acp_catalog::begin(provider, path);
    let mut command = super::provider_command(provider, path)?;
    if provider != "vibe" {
        command.arg("--acp");
    }
    let (metadata, _) = acp::inspect(command, &std::env::temp_dir(), false).await?;
    acp_catalog::store(discovery, &metadata);
    Ok(acp::parse_models_for(provider, &metadata))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registered_with_their_acp_programs() {
        for id in IDS {
            assert!(PROVIDERS.iter().any(|(p, _)| *p == id), "{id} missing from PROVIDERS");
            assert!(validate_reasoning_effort(id, None).is_ok());
        }
        assert_eq!(executable_name("vibe"), "vibe-acp");
        assert_eq!(executable_name("gemini"), "gemini");
        assert_eq!(executable_name("qwen"), "qwen");
    }
}
