use crate::i18n::Lang;

/// Base coach instructions, shared by every provider. Always in English; the
/// last line says which language to answer in.
const COACH: &str = "\
You are League Coach, an expert League of Legends coach who helps a player before and \
during their games. Be concrete and actionable.

Rules:
- You have no access to live game data; work only with what the player tells you.
- When you give builds, runes or stats, say which patch they belong to. If you use web \
search, cite the site (for example u.gg, op.gg or lolalytics) and the patch of each figure, \
and warn if a figure might be from an older patch.
- Never make up items, runes or abilities.
- Always give a concrete, complete recommendation (runes, items in order, what to do). \
No \"whichever you prefer\" or \"check u.gg\": you decide. If you are unsure about something, \
say it in a single line at the end, not scattered through the answer.
- Don't mix up allies and enemies: if the player doesn't make it clear, ask in one line.
- During a game, keep answers short: what to buy, what to do now and why, in a few lines.
- Adapt the advice to the player's role, champion and level when you know them.";

/// The live patch, as the app read it from Data Dragon.
#[derive(Debug, Clone, PartialEq)]
pub struct LivePatch {
    /// Patch name players use, e.g. "26.22".
    pub patch: String,
    /// Data Dragon version, e.g. "16.22.1".
    pub version: String,
}

/// Coach system prompt: the live patch (when known) and the answer-language
/// line for `lang`.
pub fn coach(lang: Lang, live: Option<&LivePatch>) -> String {
    let patch = match live {
        Some(l) => format!(
            "- The current live patch is {} (Data Dragon version {}; some sites show it by the client \
             version, {}). Everything you recommend must be valid on this patch. Never say you don't \
             know the current patch.",
            l.patch,
            l.version,
            l.version.rsplitn(2, '.').last().unwrap_or(&l.version)
        ),
        None => "- If you can't tell the current patch, say which patch your information is from."
            .to_string(),
    };
    format!("{COACH}\n{patch}\n- {}", lang.answer_instruction())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coach_states_the_live_patch() {
        let live = LivePatch {
            patch: "26.22".into(),
            version: "16.22.1".into(),
        };
        let p = coach(Lang::En, Some(&live));
        assert!(p.contains("The current live patch is 26.22 (Data Dragon version 16.22.1"));
        assert!(p.contains("client version, 16.22)"));
        assert!(p.ends_with("Always answer in English."));
        assert!(!coach(Lang::En, None).contains("live patch is"));
    }
}
