mod ddragon;
mod history;
mod i18n;
mod live;
mod providers;
mod recommend;
mod riot;
mod secrets;
mod usage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(providers::Running::default())
        .manage(ddragon::Cache::default())
        .manage(history::Lock::default())
        .manage(usage::Store::default())
        .setup(|app| {
            i18n::load(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secrets::set_api_key,
            secrets::delete_api_key,
            secrets::list_api_keys,
            providers::provider_statuses,
            providers::open_login,
            providers::send_prompt,
            providers::cancel_prompt,
            providers::test_provider,
            providers::models::provider_models,
            providers::models::set_provider_model,
            usage::usage_overview,
            ddragon::game_data,
            recommend::recommend_build,
            i18n::get_language,
            i18n::set_language,
            riot::lookup_summoner,
            history::riot_account,
            history::save_riot_account,
            live::current_game,
            history::match_history,
            history::sync_matches,
            history::review_matches,
            history::match_details,
            history::fill_match_details,
        ])
        .run(tauri::generate_context!())
        .expect("error while starting League Coach");
}
