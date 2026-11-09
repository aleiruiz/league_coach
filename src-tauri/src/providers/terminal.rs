//! Abre una terminal visible del sistema con un comando, para que el usuario
//! complete el login oficial del CLI (que abre su navegador).

use std::path::Path;
use std::process::Command;

pub fn open_with(bin: &Path, args: &[&str]) -> std::io::Result<()> {
    let bin = bin.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        // start "" cmd /K "<bin>" args...  (/K deja la ventana abierta al terminar)
        Command::new("cmd")
            .args(["/C", "start", "", "cmd", "/K"])
            .arg(&bin)
            .args(args)
            .spawn()?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let line = shell_line(&bin, args)
            .replace('\\', "\\\\")
            .replace('"', "\\\"");
        let script =
            format!("tell application \"Terminal\"\nactivate\ndo script \"{line}\"\nend tell");
        Command::new("osascript").args(["-e", &script]).spawn()?;
        Ok(())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let line = format!("{}; exec \"${{SHELL:-sh}}\"", shell_line(&bin, args));
        let candidates: [(&str, &[&str]); 4] = [
            // Terminales concretas primero: el wrapper x-terminal-emulator no
            // siempre acepta `-e sh -c`.
            ("gnome-terminal", &["--", "sh", "-c"]),
            ("konsole", &["-e", "sh", "-c"]),
            ("xterm", &["-e", "sh", "-c"]),
            ("x-terminal-emulator", &["-e", "sh", "-c"]),
        ];
        for (term, pre) in candidates {
            if which::which(term).is_ok() {
                Command::new(term).args(pre).arg(&line).spawn()?;
                return Ok(());
            }
        }
        Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            crate::i18n::tr(
                format!(
                    "Couldn't find a terminal. Run it yourself: {}",
                    shell_line(&bin, args)
                ),
                format!(
                    "No encontré una terminal. Ejecuta manualmente: {}",
                    shell_line(&bin, args)
                ),
            ),
        ))
    }
}

#[cfg(unix)]
fn shell_line(bin: &str, args: &[&str]) -> String {
    std::iter::once(bin)
        .chain(args.iter().copied())
        .map(|s| format!("'{}'", s.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join(" ")
}
