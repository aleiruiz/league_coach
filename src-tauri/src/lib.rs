mod ddragon;
mod history;
mod i18n;
mod providers;
mod recommend;
mod riot;
mod secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(providers::Running::default())
        .manage(ddragon::Cache::default())
        .manage(history::Lock::default())
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
            ddragon::game_data,
            recommend::recommend_build,
            i18n::get_language,
            i18n::set_language,
            history::riot_account,
            history::save_riot_account,
            history::match_history,
            history::sync_matches,
            history::review_matches,
        ])
        .run(tauri::generate_context!())
        .expect("error while starting League Coach");
}
