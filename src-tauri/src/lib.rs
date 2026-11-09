mod providers;
mod secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            secrets::set_api_key,
            secrets::delete_api_key,
            secrets::list_api_keys,
            providers::provider_statuses,
            providers::open_login,
            providers::send_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar League Coach");
}
